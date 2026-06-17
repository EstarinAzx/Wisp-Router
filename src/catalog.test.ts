// ---------------- catalog.test.ts — pure Provider-catalog helpers ---------------- //

import { describe, it, expect } from 'vitest';
import {
  resolveModel, resolveBaseUrl, planLegacyMigration,
  buildEditPrompt, parseEditBlocks, applyEditBlocks, diffLines,
  buildChatModelInfos, buildOpenAiChatMessages, assembleToolCalls, toOpenAiTools,
  modelSupportsVision,
  CUSTOM_ID, type Provider,
} from './catalog';

// Minimal Provider builder so each test states only the fields it cares about.
const provider = (over: Partial<Provider> = {}): Provider => ({
  id: 'opencode-zen', label: 'Zen', baseUrl: 'https://opencode.ai/zen/go/v1',
  defaultModel: 'minimax-m3', apiKeyEnv: 'OPENCODE_API_KEY', ...over,
});

describe('resolveModel', () => {
  it('returns the provider\'s remembered model when the map has one', () => {
    expect(resolveModel({ 'opencode-zen': 'gpt-4o-mini' }, provider())).toBe('gpt-4o-mini');
  });

  it('falls back to the native default when the provider has no remembered model', () => {
    expect(resolveModel({ groq: 'llama-3.3' }, provider({ defaultModel: 'minimax-m3' }))).toBe('minimax-m3');
  });

  // Empty-string memory must not win — the original uses `||`, so '' degrades to the default.
  it('falls back to the default when the remembered value is an empty string', () => {
    expect(resolveModel({ 'opencode-zen': '' }, provider({ defaultModel: 'minimax-m3' }))).toBe('minimax-m3');
  });
});

describe('resolveBaseUrl', () => {
  // A built-in uses its hardcoded catalog URL and ignores the user's wisp.baseUrl entirely —
  // this is the key-redirect defense: a workspace cannot point a built-in at another endpoint.
  it('returns the built-in\'s hardcoded baseUrl, ignoring the custom one', () => {
    const p = provider({ id: 'groq', baseUrl: 'https://api.groq.com/openai/v1' });
    expect(resolveBaseUrl(p, 'https://evil.example/v1')).toBe('https://api.groq.com/openai/v1');
  });

  it('returns the user-supplied baseUrl only for the Custom provider', () => {
    const p = provider({ id: CUSTOM_ID, baseUrl: '' });
    expect(resolveBaseUrl(p, 'https://my-proxy.local/v1')).toBe('https://my-proxy.local/v1');
  });

  it('returns empty string for Custom when no baseUrl is set', () => {
    expect(resolveBaseUrl(provider({ id: CUSTOM_ID, baseUrl: '' }), '')).toBe('');
  });
});

describe('planLegacyMigration', () => {
  // Idempotency: once the zen slot exists the migration already ran, so a re-run plans nothing —
  // even if a stray legacy key is still readable. This is what makes it safe to run on every activate.
  it('is a no-op when the zen key slot already exists', () => {
    expect(planLegacyMigration({ zenKeyPresent: true, legacyKey: 'sk-old', legacyModel: 'minimax-m3' })).toBeNull();
  });

  it('is a no-op when there is no legacy key to migrate', () => {
    expect(planLegacyMigration({ zenKeyPresent: false, legacyKey: undefined, legacyModel: 'minimax-m3' })).toBeNull();
  });

  it('plans a key + model copy when a legacy key exists and zen has none', () => {
    expect(planLegacyMigration({ zenKeyPresent: false, legacyKey: 'sk-old', legacyModel: 'minimax-m3' }))
      .toEqual({ storeZenKey: 'sk-old', setModel: 'minimax-m3' });
  });

  it('omits the model when no legacy model is remembered', () => {
    expect(planLegacyMigration({ zenKeyPresent: false, legacyKey: 'sk-old', legacyModel: undefined }))
      .toEqual({ storeZenKey: 'sk-old' });
  });
});

describe('parseEditBlocks', () => {
  // The happy path: one Aider-style block → one { search, replace } pair.
  it('parses a single SEARCH/REPLACE block', () => {
    const raw = '<<<<<<< SEARCH\nconst x = 1\n=======\nconst x = 2\n>>>>>>> REPLACE';
    expect(parseEditBlocks(raw)).toEqual([{ search: 'const x = 1', replace: 'const x = 2' }]);
  });

  // Multiple blocks come back in document order.
  it('parses multiple blocks in order', () => {
    const raw =
      '<<<<<<< SEARCH\na\n=======\nA\n>>>>>>> REPLACE\n' +
      '<<<<<<< SEARCH\nb\n=======\nB\n>>>>>>> REPLACE';
    expect(parseEditBlocks(raw)).toEqual([
      { search: 'a', replace: 'A' },
      { search: 'b', replace: 'B' },
    ]);
  });

  // An empty REPLACE body is a pure deletion — the pair still parses, replace is ''.
  it('treats an empty REPLACE body as a deletion', () => {
    const raw = '<<<<<<< SEARCH\ngone\n=======\n>>>>>>> REPLACE';
    expect(parseEditBlocks(raw)).toEqual([{ search: 'gone', replace: '' }]);
  });

  // Scanning is marker-driven, so a wrapping ``` fence and surrounding prose are ignored for free.
  it('ignores a surrounding markdown fence and prose', () => {
    const raw = 'Here:\n```\n<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE\n```';
    expect(parseEditBlocks(raw)).toEqual([{ search: 'a', replace: 'b' }]);
  });

  // Reasoning models emit a <think>…</think> block before the blocks → drop it first.
  it('strips a <think> block before parsing', () => {
    const raw = '<think>plan</think>\n<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE';
    expect(parseEditBlocks(raw)).toEqual([{ search: 'a', replace: 'b' }]);
  });

  // Unterminated <think> = the token budget ran out mid-thought, no answer yet → no blocks.
  it('returns [] for an unterminated <think>', () => {
    expect(parseEditBlocks('<think>still thinking')).toEqual([]);
  });

  // No markers at all → nothing to apply.
  it('returns [] when there are no blocks', () => {
    expect(parseEditBlocks('no edits here')).toEqual([]);
  });

  // Multi-line bodies are captured whole.
  it('parses multi-line search and replace', () => {
    const raw = '<<<<<<< SEARCH\nline1\nline2\n=======\nnew1\nnew2\nnew3\n>>>>>>> REPLACE';
    expect(parseEditBlocks(raw)).toEqual([{ search: 'line1\nline2', replace: 'new1\nnew2\nnew3' }]);
  });

  // CRLF markers (a Windows model reply) normalize to LF, like the rest of the diff pipeline.
  it('normalizes CRLF markers to LF', () => {
    const raw = '<<<<<<< SEARCH\r\na\r\n=======\r\nb\r\n>>>>>>> REPLACE';
    expect(parseEditBlocks(raw)).toEqual([{ search: 'a', replace: 'b' }]);
  });
});

describe('applyEditBlocks', () => {
  // Locate the search text and splice in the replacement; the rest of the doc is untouched.
  it('applies a single block to the document', () => {
    const plan = applyEditBlocks('const x = 1\nconst y = 2', [{ search: 'const x = 1', replace: 'const x = 99' }]);
    expect(plan.text).toBe('const x = 99\nconst y = 2');
    expect(plan.notFound).toEqual([]);
  });

  // Each block applies in turn against the running result.
  it('applies multiple blocks', () => {
    const plan = applyEditBlocks('a\nb\nc', [
      { search: 'a', replace: 'A' },
      { search: 'c', replace: 'C' },
    ]);
    expect(plan.text).toBe('A\nb\nC');
    expect(plan.notFound).toEqual([]);
  });

  // An empty replace deletes — a search that includes the trailing newline drops the whole line.
  it('deletes when the replace body is empty', () => {
    const plan = applyEditBlocks('keep\nremove me\nkeep2', [{ search: 'remove me\n', replace: '' }]);
    expect(plan.text).toBe('keep\nkeep2');
    expect(plan.notFound).toEqual([]);
  });

  // A search that isn't in the document is reported, not silently dropped — and never corrupts the file.
  it('records a block whose search text is not found', () => {
    const block = { search: 'zzz', replace: 'q' };
    const plan = applyEditBlocks('a\nb', [block]);
    expect(plan.text).toBe('a\nb');
    expect(plan.notFound).toEqual([block]);
  });

  // EOL-agnostic: a CRLF document matches an LF search (the diffLines trap). Output is LF; the caller
  // rejoins with the document's own EOL.
  it('matches EOL-agnostically (CRLF document vs LF search)', () => {
    const plan = applyEditBlocks('a\r\nb\r\nc', [{ search: 'b', replace: 'B' }]);
    expect(plan.text).toBe('a\nB\nc');
    expect(plan.notFound).toEqual([]);
  });

  // Found blocks apply; missing ones are reported so the caller can warn.
  it('applies found blocks and reports the missing ones', () => {
    const plan = applyEditBlocks('a\nb', [
      { search: 'a', replace: 'A' },
      { search: 'nope', replace: 'X' },
    ]);
    expect(plan.text).toBe('A\nb');
    expect(plan.notFound).toEqual([{ search: 'nope', replace: 'X' }]);
  });

  // An empty search would match at position 0 and inject text at the top — guard it as not-found.
  it('treats an empty search as not-found', () => {
    const block = { search: '', replace: 'X' };
    const plan = applyEditBlocks('a\nb', [block]);
    expect(plan.text).toBe('a\nb');
    expect(plan.notFound).toEqual([block]);
  });
});

describe('buildEditPrompt', () => {
  // The request is a system message (the edit rules) then a user message (the work).
  it('returns a system message then a user message', () => {
    const msgs = buildEditPrompt({ instruction: 'b', languageId: 'ts', context: 'c' });
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user']);
  });

  // The user message carries the three inputs the model needs to produce edit blocks.
  it('puts language, context and instruction in the user message', () => {
    const [, user] = buildEditPrompt({ instruction: 'make it 2', languageId: 'typescript', context: 'const x = 1\n' });
    expect(user.content).toContain('typescript');
    expect(user.content).toContain('const x = 1');
    expect(user.content).toContain('make it 2');
  });

  // The system message must elicit the SEARCH/REPLACE block format.
  it('instructs the model to emit SEARCH/REPLACE edit blocks', () => {
    const [system] = buildEditPrompt({ instruction: 'x', languageId: 'js', context: '' });
    expect(system.content).toContain('SEARCH');
    expect(system.content).toContain('REPLACE');
  });
});

describe('buildChatModelInfos', () => {
  const zen = provider({ id: 'opencode-zen', label: 'OpenCode Zen', defaultModel: 'minimax-m3' });
  const groq = provider({ id: 'groq', label: 'Groq', defaultModel: 'llama-3.3-70b-versatile' });
  const custom = provider({ id: CUSTOM_ID, label: 'Custom', baseUrl: '', defaultModel: '' });

  // Only providers with a usable key get advertised — a keyless backend would just 401, so it stays
  // hidden from the native picker rather than appearing as a dead option.
  it('advertises only providers that have a key', () => {
    const infos = buildChatModelInfos([zen, groq], { keyed: { 'opencode-zen': true }, modelMap: {}, customBaseUrl: '' });
    expect(infos.map((i) => i.id)).toEqual(['opencode-zen']);
  });

  // The picker label is "<label> — <model>"; a remembered model wins over the native default.
  it('names an entry "<label> — <model>" using the remembered model', () => {
    const infos = buildChatModelInfos([zen], { keyed: { 'opencode-zen': true }, modelMap: { 'opencode-zen': 'gpt-4o-mini' }, customBaseUrl: '' });
    expect(infos[0].name).toBe('OpenCode Zen — gpt-4o-mini');
  });

  it('falls back to the native default model in the name', () => {
    const infos = buildChatModelInfos([groq], { keyed: { groq: true }, modelMap: {}, customBaseUrl: '' });
    expect(infos[0].name).toBe('Groq — llama-3.3-70b-versatile');
  });

  // Custom has no hardcoded base URL — without wisp.baseUrl there is nowhere to send the request,
  // so it must not be advertised even with a key and a model.
  it('excludes Custom when it has a key and model but no base URL', () => {
    const infos = buildChatModelInfos([custom], { keyed: { custom: true }, modelMap: { custom: 'my-model' }, customBaseUrl: '' });
    expect(infos).toEqual([]);
  });

  it('includes Custom when key, model and base URL are all present', () => {
    const infos = buildChatModelInfos([custom], { keyed: { custom: true }, modelMap: { custom: 'my-model' }, customBaseUrl: 'https://proxy.local/v1' });
    expect(infos.map((i) => i.id)).toEqual([CUSTOM_ID]);
    expect(infos[0].name).toBe('Custom — my-model');
  });

  // Custom's defaultModel is '' — with a key and base URL but no remembered model there is no id to
  // advertise, so it is skipped (built-ins always have a non-empty default, so this only bites Custom).
  it('excludes a keyed provider whose resolved model is empty', () => {
    const infos = buildChatModelInfos([custom], { keyed: { custom: true }, modelMap: {}, customBaseUrl: 'https://proxy.local/v1' });
    expect(infos).toEqual([]);
  });

  // The vscode LanguageModelChatInformation shape requires these fields; toolCalling is advertised so
  // the model is selectable in agent/edit/Ctrl+I (those pickers filter to tool-capable models).
  it('fills the vscode-required descriptor fields and advertises tool calling', () => {
    const [info] = buildChatModelInfos([zen], { keyed: { 'opencode-zen': true }, modelMap: {}, customBaseUrl: '' });
    expect(info).toMatchObject({ id: 'opencode-zen', family: 'opencode-zen' });
    expect(info.capabilities).toEqual({ toolCalling: true });
    expect(typeof info.version).toBe('string');
    expect(info.maxInputTokens).toBeGreaterThan(0);
    expect(info.maxOutputTokens).toBeGreaterThan(0);
  });

  // A Provider can override the conservative default context/output caps for its default model.
  it('uses per-Provider token overrides when present', () => {
    const big = provider({ id: 'mistral', label: 'Mistral', defaultModel: 'codestral', maxInputTokens: 256_000, maxOutputTokens: 8_192 });
    const [info] = buildChatModelInfos([big], { keyed: { mistral: true }, modelMap: {}, customBaseUrl: '' });
    expect(info.maxInputTokens).toBe(256_000);
    expect(info.maxOutputTokens).toBe(8_192);
  });

  // A Provider whose default model is a vision family advertises imageInput; text-only defaults (Zen's
  // minimax-m3, covered above) stay tool-calling-only.
  it('advertises imageInput when the default model is a vision model', () => {
    const seeing = provider({ id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini' });
    const [info] = buildChatModelInfos([seeing], { keyed: { openai: true }, modelMap: {}, customBaseUrl: '' });
    expect(info.capabilities).toEqual({ toolCalling: true, imageInput: true });
  });

  // Vision also follows the ACTIVE model id, so a non-vision Provider serving a vision model (e.g. Zen
  // serving Claude) advertises imageInput even though its row has no vision flag.
  it('advertises imageInput when the active model is a known vision model', () => {
    const zenServingClaude = provider({ id: 'opencode-zen', label: 'OpenCode Zen', defaultModel: 'minimax-m3' });
    const [info] = buildChatModelInfos([zenServingClaude], { keyed: { 'opencode-zen': true }, modelMap: { 'opencode-zen': 'claude-sonnet-4' }, customBaseUrl: '' });
    expect(info.capabilities).toEqual({ toolCalling: true, imageInput: true });
  });
});

describe('modelSupportsVision', () => {
  // Known multimodal families are detected by a substring of the model id, regardless of Provider.
  it('detects common vision model families', () => {
    for (const id of ['claude-3.5-sonnet', 'claude-sonnet-4', 'gpt-4o-mini', 'gemini-2.0-flash', 'pixtral-large', 'llama-3.2-90b-vision'])
      expect(modelSupportsVision(id)).toBe(true);
  });

  // Text-only coding models must NOT be flagged — over-declaring vision would send images a backend rejects.
  it('returns false for text-only models', () => {
    for (const id of ['minimax-m3', 'llama-3.3-70b-versatile', 'codestral-latest', 'qwen2.5-coder', 'gpt-oss:120b'])
      expect(modelSupportsVision(id)).toBe(false);
  });
});

describe('buildOpenAiChatMessages', () => {
  // A plain user prompt becomes a single user message.
  it('maps a user text turn to a user message', () => {
    expect(buildOpenAiChatMessages([{ role: 'user', text: 'hi', toolCalls: [], toolResults: [] }]))
      .toEqual([{ role: 'user', content: 'hi' }]);
  });

  // A plain assistant turn becomes an assistant message with no tool_calls key.
  it('maps an assistant text turn to an assistant message', () => {
    expect(buildOpenAiChatMessages([{ role: 'assistant', text: 'sure', toolCalls: [], toolResults: [] }]))
      .toEqual([{ role: 'assistant', content: 'sure' }]);
  });

  // An assistant turn that called tools carries them as OpenAI tool_calls (arguments already a JSON string).
  it('carries assistant tool calls as OpenAI tool_calls', () => {
    const turn = {
      role: 'assistant' as const, text: '', toolResults: [],
      toolCalls: [{ id: 'c1', name: 'readFile', argsJson: '{"path":"a.ts"}' }],
    };
    expect(buildOpenAiChatMessages([turn])).toEqual([
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'readFile', arguments: '{"path":"a.ts"}' } }] },
    ]);
  });

  // Tool results live on a User turn but must become standalone OpenAI 'tool' messages keyed by callId.
  it('maps a user turn of tool results to tool messages', () => {
    const turn = { role: 'user' as const, text: '', toolCalls: [], toolResults: [{ callId: 'c1', content: 'file body' }] };
    expect(buildOpenAiChatMessages([turn])).toEqual([{ role: 'tool', tool_call_id: 'c1', content: 'file body' }]);
  });

  // Full agent round-trip keeps OpenAI's required order: assistant(tool_calls) then the tool messages.
  it('preserves order across a call/result round-trip', () => {
    const msgs = buildOpenAiChatMessages([
      { role: 'user', text: 'read a.ts', toolCalls: [], toolResults: [] },
      { role: 'assistant', text: '', toolResults: [], toolCalls: [{ id: 'c1', name: 'readFile', argsJson: '{}' }] },
      { role: 'user', text: '', toolCalls: [], toolResults: [{ callId: 'c1', content: 'body' }] },
    ]);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
  });

  // An attached image turns the user content into OpenAI's multimodal array (text part + image_url
  // data URI). Without images the content stays a plain string (covered above).
  it('builds a multimodal user message when the turn carries an image', () => {
    const turn = { role: 'user' as const, text: 'what is this', toolCalls: [], toolResults: [], images: [{ mimeType: 'image/png', dataBase64: 'AAAA' }] };
    expect(buildOpenAiChatMessages([turn])).toEqual([{
      role: 'user',
      content: [
        { type: 'text', text: 'what is this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
      ],
    }]);
  });
});

describe('assembleToolCalls', () => {
  // OpenAI streams a tool call across chunks: id+name arrive first, arguments come in fragments.
  it('reassembles one tool call from streamed fragments', () => {
    expect(assembleToolCalls([
      { index: 0, id: 'c1', name: 'readFile', args: '{"pa' },
      { index: 0, args: 'th":"a.ts"}' },
    ])).toEqual([{ id: 'c1', name: 'readFile', argsJson: '{"path":"a.ts"}' }]);
  });

  // Parallel tool calls are distinguished by their stream index.
  it('keeps parallel tool calls separate by index', () => {
    expect(assembleToolCalls([
      { index: 0, id: 'c1', name: 'a', args: '{}' },
      { index: 1, id: 'c2', name: 'b', args: '{}' },
    ])).toEqual([
      { id: 'c1', name: 'a', argsJson: '{}' },
      { id: 'c2', name: 'b', argsJson: '{}' },
    ]);
  });

  it('returns [] when there were no tool-call deltas', () => {
    expect(assembleToolCalls([])).toEqual([]);
  });
});

describe('toOpenAiTools', () => {
  // VS Code tool defs map to OpenAI function tools; inputSchema becomes the function parameters.
  it('maps a tool to an OpenAI function tool', () => {
    expect(toOpenAiTools([{ name: 'readFile', description: 'read a file', inputSchema: { type: 'object' } }]))
      .toEqual([{ type: 'function', function: { name: 'readFile', description: 'read a file', parameters: { type: 'object' } } }]);
  });

  // A tool with no schema still maps — parameters default to an empty object.
  it('defaults missing inputSchema to an empty object', () => {
    expect(toOpenAiTools([{ name: 'noArgs', description: 'd' }]))
      .toEqual([{ type: 'function', function: { name: 'noArgs', description: 'd', parameters: {} } }]);
  });
});

describe('diffLines', () => {
  // B2's in-editor diff walks this op list to paint kept/added/removed lines and to rebuild the
  // buffer on accept. An identical before/after is all 'keep' — the no-op edit shows no diff.
  it('returns all keeps when before and after are identical', () => {
    expect(diffLines('a\nb', 'a\nb')).toEqual([
      { type: 'keep', text: 'a' },
      { type: 'keep', text: 'b' },
    ]);
  });

  // Pure append: the shared prefix stays kept, the new tail is added.
  it('marks appended lines as adds', () => {
    expect(diffLines('a\nb', 'a\nb\nc')).toEqual([
      { type: 'keep', text: 'a' },
      { type: 'keep', text: 'b' },
      { type: 'add', text: 'c' },
    ]);
  });

  // Pure delete: the dropped line is a remove between two kept lines.
  it('marks dropped lines as removes', () => {
    expect(diffLines('a\nb\nc', 'a\nc')).toEqual([
      { type: 'keep', text: 'a' },
      { type: 'remove', text: 'b' },
      { type: 'keep', text: 'c' },
    ]);
  });

  // A changed line is a remove of the old followed by an add of the new (removes precede adds in a hunk).
  it('renders a replaced line as remove-then-add', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
      { type: 'keep', text: 'a' },
      { type: 'remove', text: 'b' },
      { type: 'add', text: 'x' },
      { type: 'keep', text: 'c' },
    ]);
  });

  // An empty target span is one empty line; replacing it removes that blank line and adds the new code.
  it('treats an empty before as a removed blank line plus the added code', () => {
    expect(diffLines('', 'const x = 1')).toEqual([
      { type: 'remove', text: '' },
      { type: 'add', text: 'const x = 1' },
    ]);
  });

  // EOL-agnostic: a CRLF buffer vs an LF model reply must match line-for-line (else every line
  // mismatches on a stray \r and the whole file renders as remove-all + add-all). Op text is \r-free.
  it('matches lines across CRLF/LF differences', () => {
    expect(diffLines('a\r\nb\r\nc', 'a\nb\nc')).toEqual([
      { type: 'keep', text: 'a' },
      { type: 'keep', text: 'b' },
      { type: 'keep', text: 'c' },
    ]);
  });
});

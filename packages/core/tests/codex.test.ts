// ---------------- codex.test.ts — pure Codex Provider helpers ---------------- //

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isCodexProvider, isCodexSignedIn,
  buildCodexResponsesBody, reduceResponsesTextEvents, extractResponsesText, parseSseBlock,
  responsesIncompleteReason,
  decodeJwtPayload, parseChatgptAccountId, shouldRefreshCodexToken,
  parseCodexAuthJson, codexReasoning, standardEffortToCodex, codexModelCaps, CODEX_MODELS, codexModelsFrom,
  toCodexResponsesTools, reduceResponsesToolCalls,
  type Provider, type EditMessage, type CodexResponsesEvent,
} from '../src/catalog';
import { codexStream } from '../src/codexClient';

// A JWT is header.payload.signature; only the payload (base64url JSON) is read. Build one so the
// parse/expiry/account-id helpers have a realistic token without a crypto signature.
const jwt = (payload: Record<string, unknown>): string =>
  `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;

const provider = (over: Partial<Provider> = {}): Provider => ({
  id: 'codex', label: 'Codex', baseUrl: 'https://chatgpt.com/backend-api/codex',
  defaultModel: 'gpt-5-codex', apiKeyEnv: '', ...over,
});

describe('isCodexProvider', () => {
  it('is true for a row whose kind is codex', () => {
    expect(isCodexProvider(provider({ kind: 'codex' }))).toBe(true);
  });

  // Absent kind defaults to openai-chat — the 10 existing rows carry no kind and must stay non-codex.
  it('is false when kind is absent (defaults to openai-chat)', () => {
    expect(isCodexProvider(provider({ kind: undefined }))).toBe(false);
    expect(isCodexProvider(provider({ kind: 'openai-chat' }))).toBe(false);
  });
});

describe('isCodexSignedIn', () => {
  // Codex needs no API key — it is "usable when signed in", i.e. when a bearer credential exists.
  it('is true when an access token is present', () => {
    expect(isCodexSignedIn({ accessToken: 'at', accountId: 'acc' })).toBe(true);
  });

  it('is true when only an exchanged apiKey is present', () => {
    expect(isCodexSignedIn({ apiKey: 'sk-x', accountId: 'acc' })).toBe(true);
  });

  it('is false for absent or bearer-less credentials', () => {
    expect(isCodexSignedIn(undefined)).toBe(false);
    expect(isCodexSignedIn({})).toBe(false);
    expect(isCodexSignedIn({ refreshToken: 'rt' })).toBe(false);
  });
});

describe('buildCodexResponsesBody', () => {
  // Inquire's buildEditPrompt yields a system + a user message; the Responses API takes the system text
  // as top-level `instructions` and the rest as `input` message items with input_text parts.
  it('maps a system+user prompt to instructions + input', () => {
    const messages: EditMessage[] = [
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'edit this' },
    ];
    expect(buildCodexResponsesBody({ model: 'gpt-5-codex', messages })).toEqual({
      model: 'gpt-5-codex',
      instructions: 'rules',
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'edit this' }] }],
      store: false,
      stream: true,
    });
  });

  // The Codex backend REQUIRES instructions (400 "Instructions are required" otherwise). The native-chat
  // path carries no system turn (VS Code's chat API has no System role), so default it rather than omit.
  it('defaults instructions when there is no system message', () => {
    const body = buildCodexResponsesBody({ model: 'gpt-5-codex', messages: [{ role: 'user', content: 'hi' }] });
    expect(body.instructions).toBe('You are a helpful coding assistant.');
    expect(body.input).toEqual([{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }]);
  });

  // A user image becomes an input_image part with a base64 data-URI, after the text part (gpt-5/o models
  // are multimodal — the Codex Responses backend accepts input_image, as XETH-7's codexShim sends it).
  it('maps a user image to an input_image data-URI part after the text', () => {
    const body = buildCodexResponsesBody({ model: 'gpt-5.5', messages: [
      { role: 'user', content: 'what is this', images: [{ mimeType: 'image/png', dataBase64: 'AAAB' }] },
    ] });
    expect(body.input).toEqual([
      { type: 'message', role: 'user', content: [
        { type: 'input_text', text: 'what is this' },
        { type: 'input_image', image_url: 'data:image/png;base64,AAAB' },
      ] },
    ]);
  });

  // Multi-turn native chat replays assistant turns: the Responses API expects assistant input content to be
  // output_text (user/system stay input_text), matching what the Codex CLI sends — wrong type 400s.
  it('uses output_text for assistant turns, input_text for user turns', () => {
    const body = buildCodexResponsesBody({ model: 'gpt-5.3-codex', messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'more' },
    ] });
    expect(body.input).toEqual([
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hello' }] },
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'more' }] },
    ]);
  });

  // Reasoning models need a `reasoning` object on the Responses request, or the backend 400s.
  it('includes reasoning when provided', () => {
    const body = buildCodexResponsesBody({ model: 'gpt-5.3-codex', messages: [{ role: 'user', content: 'hi' }], reasoning: { effort: 'medium', summary: 'auto' } });
    expect(body.reasoning).toEqual({ effort: 'medium', summary: 'auto' });
  });

  // Non-reasoning models reject a reasoning object, so it must be omittable entirely.
  it('omits reasoning when not provided', () => {
    const body = buildCodexResponsesBody({ model: 'gpt-4.1', messages: [{ role: 'user', content: 'hi' }] });
    expect('reasoning' in body).toBe(false);
  });

  // Agent mode: the converted tools ride on the body, default tool_choice 'auto', and the Responses API's
  // parallel_tool_calls is enabled (Codex may emit several function_call items in one turn).
  it('forwards tools with tool_choice auto and parallel_tool_calls', () => {
    const tools = toCodexResponsesTools([{ name: 'readFile', description: 'd', inputSchema: { type: 'object', properties: {} } }]);
    const body = buildCodexResponsesBody({ model: 'gpt-5.3-codex', messages: [{ role: 'user', content: 'hi' }], tools });
    expect(body.tools).toEqual(tools);
    expect(body.tool_choice).toBe('auto');
    expect(body.parallel_tool_calls).toBe(true);
  });

  // VS Code's Required tool mode maps to the Responses 'required' tool_choice.
  it('uses required tool_choice when asked', () => {
    const tools = toCodexResponsesTools([{ name: 'x', description: 'd' }]);
    const body = buildCodexResponsesBody({ model: 'gpt-5.3-codex', messages: [{ role: 'user', content: 'hi' }], tools, toolChoice: 'required' });
    expect(body.tool_choice).toBe('required');
  });

  // No tools → no tools/tool_choice/parallel keys at all (a bare tool_choice with no tools 400s).
  it('omits tool fields when there are no tools', () => {
    const body = buildCodexResponsesBody({ model: 'gpt-5.3-codex', messages: [{ role: 'user', content: 'hi' }], tools: [] });
    expect('tools' in body).toBe(false);
    expect('tool_choice' in body).toBe(false);
    expect('parallel_tool_calls' in body).toBe(false);
  });

  // An assistant turn that called a tool becomes a standalone function_call input item (call_id round-trips
  // to the tool result). A tool-only turn carries no message item — only the function_call.
  it('serializes an assistant tool-call turn to a function_call item', () => {
    const body = buildCodexResponsesBody({ model: 'gpt-5.3-codex', messages: [
      { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'readFile', argsJson: '{"path":"a.ts"}' }] },
    ] });
    expect(body.input).toEqual([
      { type: 'function_call', call_id: 'call_1', name: 'readFile', arguments: '{"path":"a.ts"}' },
    ]);
  });

  // A tool result lives on a user turn but serializes to a standalone function_call_output item keyed by
  // call_id. A result-only turn carries no message item.
  it('serializes a tool-result turn to a function_call_output item', () => {
    const body = buildCodexResponsesBody({ model: 'gpt-5.3-codex', messages: [
      { role: 'user', content: '', toolResults: [{ callId: 'call_1', content: 'file body' }] },
    ] });
    expect(body.input).toEqual([
      { type: 'function_call_output', call_id: 'call_1', output: 'file body' },
    ]);
  });

  // A full agent round-trip keeps Responses ordering: the assistant message + its function_call, then the
  // function_call_output BEFORE the next user message.
  it('preserves order across a tool round-trip', () => {
    const body = buildCodexResponsesBody({ model: 'gpt-5.3-codex', messages: [
      { role: 'user', content: 'read a.ts' },
      { role: 'assistant', content: 'sure', toolCalls: [{ id: 'call_1', name: 'readFile', argsJson: '{}' }] },
      { role: 'user', content: 'thanks', toolResults: [{ callId: 'call_1', content: 'body' }] },
    ] });
    expect(body.input).toEqual([
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'read a.ts' }] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'sure' }] },
      { type: 'function_call', call_id: 'call_1', name: 'readFile', arguments: '{}' },
      { type: 'function_call_output', call_id: 'call_1', output: 'body' },
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'thanks' }] },
    ]);
  });
});

describe('toCodexResponsesTools', () => {
  // VS Code tool defs → flat Responses function tools (name/description/parameters at top level, unlike
  // chat completions' nested function object). Codex requires STRICT schemas: every object gets
  // additionalProperties:false and ALL its property keys listed in required.
  it('maps a tool to a strict Responses function tool', () => {
    expect(toCodexResponsesTools([{ name: 'readFile', description: 'read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }]))
      .toEqual([{
        type: 'function', name: 'readFile', description: 'read a file', strict: true,
        parameters: { type: 'object', properties: { path: { type: 'string' } }, additionalProperties: false, required: ['path'] },
      }]);
  });

  // A tool with no schema still maps — parameters become an empty strict object (required: []).
  it('defaults missing inputSchema to an empty strict object', () => {
    expect(toCodexResponsesTools([{ name: 'noArgs', description: 'd' }]))
      .toEqual([{
        type: 'function', name: 'noArgs', description: 'd', strict: true,
        parameters: { type: 'object', properties: {}, additionalProperties: false, required: [] },
      }]);
  });

  // Strict enforcement recurses: a nested object property gets its own additionalProperties:false + required.
  it('enforces strict mode on nested object properties', () => {
    const [tool] = toCodexResponsesTools([{ name: 't', description: 'd', inputSchema: {
      type: 'object', properties: { opts: { type: 'object', properties: { deep: { type: 'string' } } } },
    } }]);
    expect(tool.parameters).toEqual({
      type: 'object', additionalProperties: false, required: ['opts'],
      properties: { opts: { type: 'object', additionalProperties: false, required: ['deep'], properties: { deep: { type: 'string' } } } },
    });
  });

  // Strict enforcement recurses into array item schemas too.
  it('enforces strict mode on array item schemas', () => {
    const [tool] = toCodexResponsesTools([{ name: 't', description: 'd', inputSchema: {
      type: 'object', properties: { list: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' } } } } },
    } }]);
    expect(tool.parameters).toEqual({
      type: 'object', additionalProperties: false, required: ['list'],
      properties: { list: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['x'], properties: { x: { type: 'number' } } } } },
    });
  });

  // Codex strict mode rejects the dynamic-object keywords (400 "'propertyNames' is not permitted" — observed
  // from Claude Code's AskUserQuestion tool). They are stripped at every level so the tool isn't rejected.
  it('strips dynamic-object keywords Codex strict mode rejects', () => {
    const [tool] = toCodexResponsesTools([{ name: 'ask', description: 'd', inputSchema: {
      type: 'object',
      properties: { answers: { type: 'object', propertyNames: { pattern: '^q' }, patternProperties: { '^q': { type: 'string' } } } },
      minProperties: 1,
    } }]);
    expect(tool.parameters).toEqual({
      type: 'object', additionalProperties: false, required: ['answers'],
      properties: { answers: { type: 'object', additionalProperties: false, required: [] } },
    });
  });

  // Non-strict (the Bridge door): the schema rides through verbatim, no strict closure — Codex strict rejects
  // the rich dynamic-map schemas an external toolset (Claude Code) carries, so the door passes strict:false.
  it('passes the schema through verbatim when strict is false', () => {
    const schema = { type: 'object', properties: { answers: { type: 'object', additionalProperties: { type: 'string' } } }, required: ['answers'] };
    expect(toCodexResponsesTools([{ name: 'ask', description: 'd', inputSchema: schema }], false)).toEqual([
      { type: 'function', name: 'ask', description: 'd', strict: false, parameters: schema },
    ]);
  });
});

describe('reduceResponsesToolCalls', () => {
  // The Responses streaming shape: a function_call is announced by response.output_item.added (id/call_id/
  // name) and its arguments arrive as response.function_call_arguments.delta fragments keyed by item_id.
  it('reassembles a function call from output_item.added + argument deltas', () => {
    const events: CodexResponsesEvent[] = [
      { event: 'response.output_item.added', data: { item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'readFile' } } },
      { event: 'response.function_call_arguments.delta', data: { item_id: 'fc_1', delta: '{"pa' } },
      { event: 'response.function_call_arguments.delta', data: { item_id: 'fc_1', delta: 'th":"a.ts"}' } },
    ];
    expect(reduceResponsesToolCalls(events)).toEqual([{ id: 'call_1', name: 'readFile', argsJson: '{"path":"a.ts"}' }]);
  });

  // The output_item.added can carry an initial arguments fragment that precedes the deltas.
  it('includes the initial item.arguments before the deltas', () => {
    const events: CodexResponsesEvent[] = [
      { event: 'response.output_item.added', data: { item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'x', arguments: '{"a":' } } },
      { event: 'response.function_call_arguments.delta', data: { item_id: 'fc_1', delta: '1}' } },
    ];
    expect(reduceResponsesToolCalls(events)).toEqual([{ id: 'call_1', name: 'x', argsJson: '{"a":1}' }]);
  });

  // Parallel function calls are distinguished by their item id; returned in first-seen order.
  it('keeps parallel calls separate by item id', () => {
    const events: CodexResponsesEvent[] = [
      { event: 'response.output_item.added', data: { item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'a' } } },
      { event: 'response.output_item.added', data: { item: { type: 'function_call', id: 'fc_2', call_id: 'call_2', name: 'b' } } },
      { event: 'response.function_call_arguments.delta', data: { item_id: 'fc_2', delta: '{"y":2}' } },
      { event: 'response.function_call_arguments.delta', data: { item_id: 'fc_1', delta: '{"x":1}' } },
    ];
    expect(reduceResponsesToolCalls(events)).toEqual([
      { id: 'call_1', name: 'a', argsJson: '{"x":1}' },
      { id: 'call_2', name: 'b', argsJson: '{"y":2}' },
    ]);
  });

  // The round-trip id is the call_id; fall back to the item id when a call_id is absent.
  it('falls back to the item id when call_id is absent', () => {
    const events: CodexResponsesEvent[] = [
      { event: 'response.output_item.added', data: { item: { type: 'function_call', id: 'fc_9', name: 'y', arguments: '{}' } } },
    ];
    expect(reduceResponsesToolCalls(events)).toEqual([{ id: 'fc_9', name: 'y', argsJson: '{}' }]);
  });

  // Non-function output items (a message item) and text deltas are not tool calls — ignored.
  it('ignores non-function output items and text events', () => {
    const events: CodexResponsesEvent[] = [
      { event: 'response.output_item.added', data: { item: { type: 'message' } } },
      { event: 'response.output_text.delta', data: { delta: 'hi' } },
    ];
    expect(reduceResponsesToolCalls(events)).toEqual([]);
  });

  it('returns [] for no events', () => {
    expect(reduceResponsesToolCalls([])).toEqual([]);
  });
});

describe('codexReasoning', () => {
  // gpt-5 / o-series are reasoning models — send a reasoning object so the Responses call is accepted.
  it('requests reasoning for gpt-5 and o-series models', () => {
    expect(codexReasoning('gpt-5.3-codex')).toEqual({ effort: 'medium', summary: 'auto' });
    expect(codexReasoning('gpt-5.4')).toEqual({ effort: 'medium', summary: 'auto' });
    expect(codexReasoning('o3')).toEqual({ effort: 'medium', summary: 'auto' });
    expect(codexReasoning('o4-mini')).toEqual({ effort: 'medium', summary: 'auto' });
  });

  // The non-reasoning / fast-loop variants must NOT carry reasoning (they reject it).
  it('sends no reasoning for gpt-4.x and spark variants', () => {
    expect(codexReasoning('gpt-4.1')).toBeUndefined();
    expect(codexReasoning('gpt-5.3-codex-spark')).toBeUndefined();
  });

  // The panel-chosen Effort rides through to the reasoning object for reasoning models.
  it('threads the supplied Effort through for reasoning models', () => {
    expect(codexReasoning('gpt-5.4', 'high')).toEqual({ effort: 'high', summary: 'auto' });
    expect(codexReasoning('gpt-5.5', 'xhigh')).toEqual({ effort: 'xhigh', summary: 'auto' });
    expect(codexReasoning('o3', 'low')).toEqual({ effort: 'low', summary: 'auto' });
    expect(codexReasoning('gpt-5.3-codex')).toEqual({ effort: 'medium', summary: 'auto' }); // default
  });

  // Effort is inert for the non-reasoning variants — they reject reasoning whatever the value.
  it('still omits reasoning for spark / gpt-4.x regardless of Effort', () => {
    expect(codexReasoning('gpt-4.1', 'high')).toBeUndefined();
    expect(codexReasoning('gpt-5.3-codex-spark', 'low')).toBeUndefined();
  });
});

describe('standardEffortToCodex', () => {
  // The shared wisp.effort knob is EffortLevel (includes 'max'); Codex's wire type tops out at xhigh.
  // A stored 'max' (set while on Anthropic, then switched Provider) must map to xhigh or it 400s on the
  // Responses call. Mirrors openclaude standardEffortToOpenAI (max→xhigh).
  it('maps max to xhigh', () => {
    expect(standardEffortToCodex('max')).toBe('xhigh');
  });

  // Every other level is already a valid CodexEffort — pass through untouched.
  it('passes through the non-max levels unchanged', () => {
    expect(standardEffortToCodex('low')).toBe('low');
    expect(standardEffortToCodex('medium')).toBe('medium');
    expect(standardEffortToCodex('high')).toBe('high');
    expect(standardEffortToCodex('xhigh')).toBe('xhigh');
  });
});

describe('codexModelCaps', () => {
  // The Codex backend has no /models route and isn't keyed to models.dev, so the chat picker would show
  // the neutral default window. These are the real windows from models.dev/api.json. gpt-5.x Codex = 400K,
  // and the gpt-5/o families are multimodal — the Responses backend accepts input_image (as Codex CLI does).
  it('returns the 400K/32K window for the gpt-5.x Codex family, vision capable', () => {
    expect(codexModelCaps('gpt-5.3-codex')).toEqual({ contextInput: 400_000, maxOutput: 32_768, vision: true });
    expect(codexModelCaps('gpt-5.5')).toEqual({ contextInput: 400_000, maxOutput: 32_768, vision: true });
    expect(codexModelCaps('gpt-5.1-codex-max')).toEqual({ contextInput: 400_000, maxOutput: 32_768, vision: true });
  });

  // The o-series reasoning models are a 200K context / 100K output, also multimodal.
  it('returns the 200K/100K window for the o-series, vision capable', () => {
    expect(codexModelCaps('o3')).toEqual({ contextInput: 200_000, maxOutput: 100_000, vision: true });
    expect(codexModelCaps('o4-mini')).toEqual({ contextInput: 200_000, maxOutput: 100_000, vision: true });
  });
});

describe('CODEX_MODELS', () => {
  // A curated list (no /models route on the Codex backend); it must include the row's default model so
  // the panel dropdown always offers a working pick.
  it('is a non-empty curated list including a current Codex coding model', () => {
    expect(CODEX_MODELS.length).toBeGreaterThan(0);
    expect(CODEX_MODELS).toContain('gpt-5.3-codex');
  });
});

describe('codexModelsFrom', () => {
  // A miniature models.dev openai entry exercising every filter rule at once.
  const catalog = {
    openai: {
      models: {
        'gpt-5.6-sol': { release_date: '2026-07-09' },
        'gpt-5.6-terra': { release_date: '2026-07-09' },
        'gpt-5.5': { release_date: '2026-03-12' },
        'gpt-5.5-pro': { release_date: '2026-03-12' },
        'gpt-5.4-nano': { release_date: '2025-12-05' },
        'gpt-5.3-chat-latest': { release_date: '2025-10-01' },
        'o4-mini-deep-research': { release_date: '2025-06-26' },
        'o4-mini': { release_date: '2025-04-16' },
        'gpt-5.2': {}, // undated → must trail the dated ids, not vanish
        'o1': { release_date: '2024-12-17' },
        'gpt-4.1': { release_date: '2025-04-14' },
      },
    },
  };

  it('keeps the Codex-served families newest-first, drops the API-only variants', () => {
    // Dropped: -pro, -nano, -chat-latest, -deep-research suffixes; o1/gpt-4.1 (outside the keep families).
    // Sol before terra: same release_date → alphabetical tiebreak. Undated gpt-5.2 trails.
    expect(codexModelsFrom(catalog)).toEqual(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.5', 'o4-mini', 'gpt-5.2']);
  });

  it('falls back to the curated list when the catalog is absent, has no openai entry, or filters to nothing', () => {
    expect(codexModelsFrom(undefined)).toEqual(CODEX_MODELS);
    expect(codexModelsFrom({})).toEqual(CODEX_MODELS);
    expect(codexModelsFrom({ openai: { models: { 'gpt-4.1': {} } } })).toEqual(CODEX_MODELS);
  });
});

describe('reduceResponsesTextEvents', () => {
  // The streaming path: text arrives as a run of response.output_text.delta events, concatenated in order.
  it('concatenates output_text deltas in order', () => {
    expect(reduceResponsesTextEvents([
      { event: 'response.output_text.delta', data: { delta: 'Hel' } },
      { event: 'response.output_text.delta', data: { delta: 'lo' } },
    ])).toBe('Hello');
  });

  // The terminal response.completed event carries the authoritative full text — prefer it over the
  // accumulated deltas (guards against a dropped/duplicated delta fragment).
  it('prefers the completed payload text over the deltas', () => {
    expect(reduceResponsesTextEvents([
      { event: 'response.output_text.delta', data: { delta: 'partial' } },
      { event: 'response.completed', data: { response: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'FULL' }] }] } } },
    ])).toBe('FULL');
  });

  // A completed event with no text (e.g. a tool-only turn) must not blank the answer — fall back to deltas.
  it('falls back to the deltas when the completed payload has no text', () => {
    expect(reduceResponsesTextEvents([
      { event: 'response.output_text.delta', data: { delta: 'kept' } },
      { event: 'response.completed', data: { response: { output: [] } } },
    ])).toBe('kept');
  });

  // Non-text events (reasoning summaries, item lifecycle) are ignored by the text reducer.
  it('ignores unrelated events', () => {
    expect(reduceResponsesTextEvents([
      { event: 'response.reasoning_summary_text.delta', data: { delta: 'thinking' } },
      { event: 'response.output_item.added', data: { item: { type: 'message' } } },
      { event: 'response.output_text.delta', data: { delta: 'real' } },
    ])).toBe('real');
  });

  // A response.failed event is a backend error — surface its message rather than returning empty text.
  it('throws with the backend message on response.failed', () => {
    expect(() => reduceResponsesTextEvents([
      { event: 'response.failed', data: { response: { error: { message: 'boom' } } } },
    ])).toThrow('boom');
  });

  it('returns empty string for no events', () => {
    expect(reduceResponsesTextEvents([])).toBe('');
  });

  // A later empty terminal event (a stream can emit incomplete-then-completed, or a duplicate) must not
  // blank an answer already captured — only a non-empty payload overwrites.
  it('does not let a later empty terminal event blank the completed text', () => {
    expect(reduceResponsesTextEvents([
      { event: 'response.completed', data: { response: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'FULL' }] }] } } },
      { event: 'response.incomplete', data: { response: { output: [] } } },
    ])).toBe('FULL');
  });

  // A malformed non-string delta must be skipped, not coerced into the text (5 -> '5', {} -> '[object Object]').
  it('ignores a non-string delta', () => {
    expect(reduceResponsesTextEvents([
      { event: 'response.output_text.delta', data: { delta: 5 } },
      { event: 'response.output_text.delta', data: { delta: 'real' } },
    ])).toBe('real');
  });

  // response.incomplete carries a valid (partial) answer the same way response.completed does.
  it('reads text from a response.incomplete terminal event', () => {
    expect(reduceResponsesTextEvents([
      { event: 'response.incomplete', data: { response: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'partial answer' }] }] } } },
    ])).toBe('partial answer');
  });
});

describe('parseSseBlock', () => {
  // One SSE block = an `event:` line + one or more `data:` lines; the data JSON is paired with the name.
  // Shared by the non-streaming reader (whole body) and the streaming path (chunk by chunk).
  it('pairs the event name with its parsed JSON data', () => {
    expect(parseSseBlock('event: response.output_text.delta\ndata: {"delta":"hi"}'))
      .toEqual({ event: 'response.output_text.delta', data: { delta: 'hi' } });
  });

  // Multi-line data: the data: lines are joined before parsing (SSE splits long payloads across lines).
  it('joins multiple data lines before parsing', () => {
    expect(parseSseBlock('event: response.completed\ndata: {"a":1,\ndata: "b":2}'))
      .toEqual({ event: 'response.completed', data: { a: 1, b: 2 } });
  });

  // A keep-alive / comment block has no event: line → nothing to emit.
  it('returns undefined for a block with no event line', () => {
    expect(parseSseBlock(': keep-alive')).toBeUndefined();
    expect(parseSseBlock('data: {"x":1}')).toBeUndefined();
  });

  // The terminal [DONE] sentinel is not a JSON event — skip it.
  it('returns undefined for the [DONE] sentinel', () => {
    expect(parseSseBlock('event: done\ndata: [DONE]')).toBeUndefined();
  });

  // An event with no data line, or unparseable JSON, yields nothing rather than throwing.
  it('returns undefined for a missing or non-JSON data payload', () => {
    expect(parseSseBlock('event: response.completed')).toBeUndefined();
    expect(parseSseBlock('event: response.completed\ndata: not-json')).toBeUndefined();
  });
});

describe('extractResponsesText', () => {
  // A final Responses object: walk output[] messages, join every output_text part's text.
  it('joins output_text parts across message items', () => {
    expect(extractResponsesText({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'A' }, { type: 'output_text', text: 'B' }] }] })).toBe('AB');
  });

  // Reasoning parts and function_call items are not answer text — skip them.
  it('ignores reasoning parts and function_call items', () => {
    expect(extractResponsesText({ output: [
      { type: 'function_call', name: 'edit', arguments: '{}' },
      { type: 'message', content: [{ type: 'reasoning', text: 'no' }, { type: 'output_text', text: 'yes' }] },
    ] })).toBe('yes');
  });

  it('tolerates missing or empty payloads', () => {
    expect(extractResponsesText(undefined)).toBe('');
    expect(extractResponsesText({})).toBe('');
    expect(extractResponsesText({ output: [] })).toBe('');
  });
});

describe('decodeJwtPayload', () => {
  it('decodes the base64url JSON payload', () => {
    expect(decodeJwtPayload(jwt({ sub: 'x', exp: 123 }))).toEqual({ sub: 'x', exp: 123 });
  });

  it('returns undefined for a string that is not a JWT', () => {
    expect(decodeJwtPayload('notajwt')).toBeUndefined();
  });

  it('returns undefined when the payload is not valid JSON', () => {
    expect(decodeJwtPayload('h.@@@.s')).toBeUndefined();
  });
});

describe('parseChatgptAccountId', () => {
  // Codex stows the ChatGPT account id inside the namespaced auth claim of the id/access token.
  it('reads the account id from the nested auth claim', () => {
    expect(parseChatgptAccountId(jwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acc_123' } }))).toBe('acc_123');
  });

  // Some token versions carry the id under a flat dotted key rather than the nested object.
  it('reads the account id from the flat dotted claim key', () => {
    expect(parseChatgptAccountId(jwt({ 'https://api.openai.com/auth.chatgpt_account_id': 'acc_flat' }))).toBe('acc_flat');
  });

  it('returns undefined when the token is missing or has no account id', () => {
    expect(parseChatgptAccountId(undefined)).toBeUndefined();
    expect(parseChatgptAccountId(jwt({ sub: 'x' }))).toBeUndefined();
  });
});

describe('shouldRefreshCodexToken', () => {
  const now = 1_000_000_000_000; // fixed clock so the skew window is deterministic
  const expAt = (ms: number): string => jwt({ exp: Math.floor(ms / 1000) });

  // Refresh when the access token expires inside the 60s skew window (about to be invalid mid-request).
  it('is true when the access token expires within the skew window', () => {
    expect(shouldRefreshCodexToken({ accessToken: expAt(now + 30_000) }, now)).toBe(true);
  });

  it('is false when the access token is valid well past the skew window', () => {
    expect(shouldRefreshCodexToken({ accessToken: expAt(now + 3_600_000) }, now)).toBe(false);
  });

  // No parseable expiry → cannot decide it is stale, so don't force a refresh (matches Codex CLI).
  it('is false when no expiry can be parsed', () => {
    expect(shouldRefreshCodexToken({ accessToken: 'garbage' }, now)).toBe(false);
    expect(shouldRefreshCodexToken({}, now)).toBe(false);
  });

  // Falls back to the id token's expiry when the access token carries none.
  it('uses the id token expiry when the access token has none', () => {
    expect(shouldRefreshCodexToken({ accessToken: 'no-exp', idToken: expAt(now + 30_000) }, now)).toBe(true);
  });
});

describe('parseCodexAuthJson', () => {
  // The real ~/.codex/auth.json: a `tokens` block (snake_case) plus a possibly-null OPENAI_API_KEY.
  it('reads the tokens block of a real Codex auth.json', () => {
    expect(parseCodexAuthJson({
      OPENAI_API_KEY: null,
      tokens: { id_token: 'idt', access_token: 'at', refresh_token: 'rt', account_id: 'acc_1' },
      last_refresh: '2026-06-19T00:00:00Z',
    })).toEqual({ accessToken: 'at', refreshToken: 'rt', idToken: 'idt', accountId: 'acc_1' });
  });

  // A bare OPENAI_API_KEY (no OAuth tokens) is still a usable credential.
  it('captures a string OPENAI_API_KEY', () => {
    expect(parseCodexAuthJson({ OPENAI_API_KEY: 'sk-abc', tokens: {} })).toEqual({ apiKey: 'sk-abc' });
  });

  // When tokens.account_id is absent, derive it from the id token's account claim.
  it('derives the account id from the id token when absent', () => {
    const idt = jwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acc_jwt' } });
    expect(parseCodexAuthJson({ tokens: { access_token: 'at', id_token: idt } })).toEqual({ accessToken: 'at', idToken: idt, accountId: 'acc_jwt' });
  });

  it('returns undefined when there is no usable credential', () => {
    expect(parseCodexAuthJson({})).toBeUndefined();
    expect(parseCodexAuthJson(null)).toBeUndefined();
    expect(parseCodexAuthJson('nope')).toBeUndefined();
    expect(parseCodexAuthJson({ OPENAI_API_KEY: null, tokens: {} })).toBeUndefined();
  });
});

describe('responsesIncompleteReason', () => {
  // A truncated terminal payload carries incomplete_details.reason — the only signal that a reply was cut short.
  it('returns the reason from a truncated terminal payload', () => {
    expect(responsesIncompleteReason({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } })).toBe('max_output_tokens');
  });

  // A clean completion, a missing block, or a non-string reason all mean "not truncated" → undefined (no marker).
  it('returns undefined for a clean completion or a missing / non-string reason', () => {
    expect(responsesIncompleteReason({ status: 'completed', output: [] })).toBeUndefined();
    expect(responsesIncompleteReason({})).toBeUndefined();
    expect(responsesIncompleteReason(undefined)).toBeUndefined();
    expect(responsesIncompleteReason({ incomplete_details: { reason: 5 } })).toBeUndefined();
  });
});

// The repo's first codexStream IO test: stub global.fetch to hand back a Response streaming SSE bytes, so the
// stream's END-state handling (clean, truncated, or dropped) is exercised without a live Codex backend.
describe('codexStream (streaming IO)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const sseResponse = (blocks: string[]): Response => {
    const text = blocks.map((b) => `${b}\n\n`).join('');
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } });
    return new Response(body, { status: 200 });
  };
  const stub = (blocks: string[]) => vi.stubGlobal('fetch', async () => sseResponse(blocks));
  const args = { creds: { accessToken: 'at', accountId: 'acc' }, baseUrl: 'https://x/codex', model: 'gpt-5.5', messages: [{ role: 'user' as const, content: 'hi' }] };
  const collect = async (gen: AsyncGenerator<any>): Promise<any[]> => { const out: any[] = []; for await (const ev of gen) out.push(ev); return out; };

  // Happy path: deltas render live; a trailing response.completed neither re-emits them nor adds a marker.
  it('yields text deltas live and adds no marker on a clean completion', async () => {
    stub([
      'event: response.output_text.delta\ndata: {"delta":"Hel"}',
      'event: response.output_text.delta\ndata: {"delta":"lo"}',
      'event: response.completed\ndata: {"response":{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"Hello"}]}]}}',
    ]);
    expect(await collect(codexStream(args))).toEqual([
      { type: 'text', value: 'Hel' },
      { type: 'text', value: 'lo' },
    ]);
  });

  // D3 (the #1 cause): a HIGH-effort reasoning turn drops before any text and with no terminal frame — throw a
  // diagnosable error (was a silent blank turn) so the turn is retryable.
  it('throws when the stream ends before completion with nothing delivered', async () => {
    stub(['event: response.created\ndata: {"response":{}}']);
    await expect(collect(codexStream(args))).rejects.toThrow(/before completion/);
  });

  // D3: text DID stream but the terminal frame was lost — keep the text and only flag the abrupt end, never throw.
  it('keeps streamed text and appends a soft marker when the terminal frame is missing', async () => {
    stub(['event: response.output_text.delta\ndata: {"delta":"partial answer"}']);
    const out = await collect(codexStream(args));
    expect(out[0]).toEqual({ type: 'text', value: 'partial answer' });
    expect(out.at(-1).value).toMatch(/ended before completion/);
  });

  // D3: assembled tool calls count as "delivered" — a no-terminal drop must not throw them away (skeptic scenario A).
  it('preserves tool calls on a no-terminal drop instead of throwing', async () => {
    stub([
      'event: response.output_item.added\ndata: {"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"readFile"}}',
      'event: response.function_call_arguments.delta\ndata: {"item_id":"fc_1","delta":"{}"}',
    ]);
    const out = await collect(codexStream(args));
    expect(out.some((e) => e.type === 'toolCall' && e.call.name === 'readFile')).toBe(true);
    expect(out.some((e) => e.type === 'text' && /ended before completion/.test(e.value))).toBe(true);
  });

  // D1: a response.incomplete carrying incomplete_details.reason appends a visible truncation marker after the text.
  it('appends a truncation marker with the incomplete reason', async () => {
    stub([
      'event: response.output_text.delta\ndata: {"delta":"cut here"}',
      'event: response.incomplete\ndata: {"response":{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"output":[]}}',
    ]);
    const out = await collect(codexStream(args));
    expect(out[0]).toEqual({ type: 'text', value: 'cut here' });
    expect(out.at(-1)).toEqual({ type: 'text', value: '\n\n_[Response truncated: max_output_tokens]_' });
  });
});

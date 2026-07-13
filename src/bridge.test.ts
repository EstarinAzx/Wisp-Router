// ---------------- bridge.test.ts — pure OpenAI <-> Wisp protocol translator ---------------- //

import { describe, it, expect } from 'vitest';
import {
  parseOpenAiChatRequest,
  textChunk, toolCallChunk, finalChunk, sseLine, SSE_DONE,
  buildModelsList,
} from './bridge';
import type { ChatModelInfo } from './catalog';

// Minimal ChatModelInfo builder — buildModelsList only reads `id`, so the rest is filler.
const modelInfo = (id: string): ChatModelInfo => ({
  id, name: `${id} model`, family: id, version: '1',
  maxInputTokens: 1, maxOutputTokens: 1, capabilities: { toolCalling: true },
});

// A fixed chunk identity so the emitters stay deterministic (no Date.now() / no random id in this module).
const meta = { id: 'chatcmpl-x', model: 'gpt-4o', created: 0 };

describe('parseOpenAiChatRequest', () => {
  // The inverse of buildOpenAiChatMessages: a plain user message becomes one user NormalizedTurn.
  it('maps a user text message to a user turn', () => {
    const parsed = parseOpenAiChatRequest({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    expect(parsed.turns).toEqual([{ role: 'user', text: 'hi', toolCalls: [], toolResults: [] }]);
  });

  // A plain assistant message becomes an assistant turn with empty tool arrays.
  it('maps an assistant text message to an assistant turn', () => {
    const parsed = parseOpenAiChatRequest({ model: 'm', messages: [{ role: 'assistant', content: 'sure' }] });
    expect(parsed.turns).toEqual([{ role: 'assistant', text: 'sure', toolCalls: [], toolResults: [] }]);
  });

  // System content is lifted OUT of the turn list into a separate `system` string — every downstream
  // send-builder (Codex instructions, Anthropic top-level system, OpenAI re-prepend) consumes it apart
  // from the user/assistant turns, so it must not pollute `turns`.
  it('lifts system content into a separate system string, not a turn', () => {
    const parsed = parseOpenAiChatRequest({ model: 'm', messages: [
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hi' },
    ] });
    expect(parsed.system).toBe('be terse');
    expect(parsed.turns).toEqual([{ role: 'user', text: 'hi', toolCalls: [], toolResults: [] }]);
  });

  // Multiple system messages join with a blank line (mirrors how buildAnthropicMessagesBody joins them).
  it('joins multiple system messages with a blank line', () => {
    const parsed = parseOpenAiChatRequest({ model: 'm', messages: [
      { role: 'system', content: 'a' },
      { role: 'system', content: 'b' },
      { role: 'user', content: 'hi' },
    ] });
    expect(parsed.system).toBe('a\n\nb');
  });

  // No system message → empty system string (downstream treats '' as "none").
  it('returns an empty system string when there is no system message', () => {
    const parsed = parseOpenAiChatRequest({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    expect(parsed.system).toBe('');
  });

  // An assistant tool_calls array inverts to the turn's toolCalls (arguments stay the raw JSON string).
  it('maps assistant tool_calls to the turn toolCalls', () => {
    const parsed = parseOpenAiChatRequest({ model: 'm', messages: [
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'readFile', arguments: '{"path":"a.ts"}' } }] },
    ] });
    expect(parsed.turns).toEqual([
      { role: 'assistant', text: '', toolCalls: [{ id: 'c1', name: 'readFile', argsJson: '{"path":"a.ts"}' }], toolResults: [] },
    ]);
  });

  // Parallel tool calls: an assistant turn with MULTIPLE tool_calls keeps all of them, in order — the
  // inverse of buildOpenAiChatMessages' turn.toolCalls.map (guards a future Map-keyed/dedup regression).
  it('preserves multiple parallel assistant tool_calls in order', () => {
    const parsed = parseOpenAiChatRequest({ model: 'm', messages: [
      { role: 'assistant', content: '', tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'readFile', arguments: '{"path":"a.ts"}' } },
        { id: 'c2', type: 'function', function: { name: 'listDir', arguments: '{}' } },
      ] },
    ] });
    expect(parsed.turns[0].toolCalls).toEqual([
      { id: 'c1', name: 'readFile', argsJson: '{"path":"a.ts"}' },
      { id: 'c2', name: 'listDir', argsJson: '{}' },
    ]);
  });

  // A `tool` message attaches to the OWNING user turn's toolResults — the inverse of buildOpenAiChatMessages,
  // which emits tool messages BEFORE the user text. A lone tool message folds into a bare tool-result turn.
  it('maps a tool message to a bare user tool-result turn', () => {
    const parsed = parseOpenAiChatRequest({ model: 'm', messages: [
      { role: 'tool', tool_call_id: 'c1', content: 'file body' },
    ] });
    expect(parsed.turns).toEqual([
      { role: 'user', text: '', toolCalls: [], toolResults: [{ callId: 'c1', content: 'file body' }] },
    ]);
  });

  // The agent round-trip round-trips buildOpenAiChatMessages: a tool message followed by user text folds
  // into ONE user turn carrying both the result and the prose (matching the catalog's bare-tool-result fold).
  it('folds tool message + following user text into one user turn', () => {
    const parsed = parseOpenAiChatRequest({ model: 'm', messages: [
      { role: 'user', content: 'read a.ts' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'readFile', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'body' },
      { role: 'user', content: 'thanks' },
    ] });
    expect(parsed.turns).toEqual([
      { role: 'user', text: 'read a.ts', toolCalls: [], toolResults: [] },
      { role: 'assistant', text: '', toolCalls: [{ id: 'c1', name: 'readFile', argsJson: '{}' }], toolResults: [] },
      { role: 'user', text: 'thanks', toolCalls: [], toolResults: [{ callId: 'c1', content: 'body' }] },
    ]);
  });

  // Consecutive tool messages with no trailing user text gather onto one bare tool-result turn (parallel
  // calls answered together) — the inverse of multiple 'tool' messages preceding one user turn.
  it('gathers consecutive tool messages into one tool-result turn', () => {
    const parsed = parseOpenAiChatRequest({ model: 'm', messages: [
      { role: 'tool', tool_call_id: 'c1', content: 'r1' },
      { role: 'tool', tool_call_id: 'c2', content: 'r2' },
    ] });
    expect(parsed.turns).toEqual([
      { role: 'user', text: '', toolCalls: [], toolResults: [{ callId: 'c1', content: 'r1' }, { callId: 'c2', content: 'r2' }] },
    ]);
  });

  // A multimodal user content array (text part + image_url data URI) inverts to text + images[].
  it('parses a multimodal user message into text and images', () => {
    const parsed = parseOpenAiChatRequest({ model: 'm', messages: [
      { role: 'user', content: [
        { type: 'text', text: 'what is this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
      ] },
    ] });
    expect(parsed.turns).toEqual([
      { role: 'user', text: 'what is this', toolCalls: [], toolResults: [], images: [{ mimeType: 'image/png', dataBase64: 'AAAA' }] },
    ]);
  });

  // A multimodal turn with only an image (no text part) yields empty text and the image.
  it('parses an image-only multimodal user message', () => {
    const parsed = parseOpenAiChatRequest({ model: 'm', messages: [
      { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,ZZZZ' } }] },
    ] });
    expect(parsed.turns).toEqual([
      { role: 'user', text: '', toolCalls: [], toolResults: [], images: [{ mimeType: 'image/jpeg', dataBase64: 'ZZZZ' }] },
    ]);
  });

  // tools[] (OpenAI function-tool defs) invert to ToolSpec[] — the inverse of toOpenAiTools.
  it('parses tools[] into ToolSpec[]', () => {
    const parsed = parseOpenAiChatRequest({ model: 'm', messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'readFile', description: 'read a file', parameters: { type: 'object' } } }] });
    expect(parsed.tools).toEqual([{ name: 'readFile', description: 'read a file', inputSchema: { type: 'object' } }]);
  });

  // No tools[] → empty tool list.
  it('returns an empty tool list when the body carries no tools', () => {
    const parsed = parseOpenAiChatRequest({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    expect(parsed.tools).toEqual([]);
  });

  // model + stream are surfaced from the body; stream defaults to false when absent.
  it('surfaces model and stream from the body', () => {
    const parsed = parseOpenAiChatRequest({ model: 'gpt-4o', stream: true, messages: [{ role: 'user', content: 'hi' }] });
    expect(parsed.model).toBe('gpt-4o');
    expect(parsed.stream).toBe(true);
  });

  it('defaults stream to false when absent', () => {
    const parsed = parseOpenAiChatRequest({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    expect(parsed.stream).toBe(false);
  });
});

// Trust-boundary robustness — parseOpenAiChatRequest parses an UNTRUSTED external HTTP body (the Copilot
// CLI's POST), so it must DEGRADE on malformed input, not throw — matching the module's stated contract and
// the way it already guards parseDataUri / absent stream / absent tools. Each case below threw before the guards.
describe('parseOpenAiChatRequest — malformed/untrusted input', () => {
  // An absent messages field (body `{}` or `{ model }`) degrades to empty system + empty turns.
  it('degrades when messages is absent', () => {
    expect(parseOpenAiChatRequest({ model: 'm' } as any)).toEqual({ model: 'm', stream: false, system: '', turns: [], tools: [] });
  });

  // Non-iterable user content (null / number / object) yields an empty-text user turn, not a crash.
  it('degrades when a user message content is null', () => {
    expect(parseOpenAiChatRequest({ model: 'm', messages: [{ role: 'user', content: null }] } as any).turns).toEqual([
      { role: 'user', text: '', toolCalls: [], toolResults: [] },
    ]);
  });

  // A tool_call missing its function object degrades to empty name/arguments (downstream rejects), not a crash.
  it('degrades a tool_call missing its function object', () => {
    expect(parseOpenAiChatRequest({ model: 'm', messages: [
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function' }] },
    ] } as any).turns[0].toolCalls).toEqual([{ id: 'c1', name: '', argsJson: '' }]);
  });

  // A tools[] entry missing its function object degrades to an empty-named ToolSpec, not a crash.
  it('degrades a tools entry missing its function object', () => {
    expect(parseOpenAiChatRequest({ model: 'm', messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function' }] } as any).tools).toEqual([{ name: '', description: '' }]);
  });

  // Unknown / partial content parts (a real OpenAI input_audio part, or an image_url with no url) are
  // SKIPPED, not crashed on — only well-formed text / image_url parts contribute.
  it('skips unknown or partial multimodal content parts', () => {
    expect(parseOpenAiChatRequest({ model: 'm', messages: [
      { role: 'user', content: [
        { type: 'text', text: 'hi' },
        { type: 'input_audio', input_audio: { data: 'x', format: 'wav' } },
        { type: 'image_url' },
      ] },
    ] } as any).turns).toEqual([
      { role: 'user', text: 'hi', toolCalls: [], toolResults: [] },
    ]);
  });
});

describe('textChunk', () => {
  // A text delta becomes a chat.completion.chunk with the text on choices[0].delta.content.
  it('renders a text delta as a content chunk', () => {
    expect(textChunk('hello', meta)).toEqual({
      id: 'chatcmpl-x', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o',
      choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }],
    });
  });
});

describe('toolCallChunk', () => {
  // Wisp folds tool calls WHOLE (catalog assembleToolCalls), so one delta carries the full arguments and a
  // distinct index per parallel call — a valid OpenAI tool_calls delta shape, just not fragment-streamed.
  it('renders a completed tool call as a tool_calls chunk', () => {
    const call = { id: 'c1', name: 'readFile', argsJson: '{"path":"a.ts"}' };
    expect(toolCallChunk(call, 0, meta)).toEqual({
      id: 'chatcmpl-x', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o',
      choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'readFile', arguments: '{"path":"a.ts"}' } }] }, finish_reason: null }],
    });
  });

  // The tool_call delta index distinguishes parallel calls — it is the array slot, not the chunk's choice.
  it('uses the supplied index for a parallel call', () => {
    const call = { id: 'c2', name: 'b', argsJson: '{}' };
    expect(toolCallChunk(call, 1, meta).choices[0].delta.tool_calls![0].index).toBe(1);
  });
});

describe('finalChunk', () => {
  // The terminal chunk has an empty delta and the finish_reason — 'stop' for a plain answer.
  it('renders a stop terminal chunk', () => {
    expect(finalChunk('stop', meta)).toEqual({
      id: 'chatcmpl-x', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    });
  });

  // finish_reason is 'tool_calls' when the turn emitted any tool call (signals the client to run them).
  it('renders a tool_calls terminal chunk', () => {
    expect(finalChunk('tool_calls', meta).choices[0].finish_reason).toBe('tool_calls');
  });
});

describe('sseLine', () => {
  // The wire form is `data: <json>\n\n` — JSON of the chunk on a single data line, blank-line terminated.
  it('serializes a chunk as an SSE data line', () => {
    expect(sseLine(textChunk('hi', meta))).toBe(
      `data: ${JSON.stringify(textChunk('hi', meta))}\n\n`,
    );
  });

  // The stream closes with the literal [DONE] sentinel (OpenAI's end-of-stream marker), also `data:`-framed.
  it('frames the [DONE] sentinel', () => {
    expect(SSE_DONE).toBe('data: [DONE]\n\n');
  });
});

describe('buildModelsList', () => {
  // GET /v1/models is the OpenAI list shape with one entry per usable Provider (the ChatModelInfo.id).
  it('maps ChatModelInfos to the OpenAI models list shape', () => {
    expect(buildModelsList([modelInfo('opencode-zen'), modelInfo('groq')])).toEqual({
      object: 'list',
      data: [
        { id: 'opencode-zen', object: 'model', created: 0, owned_by: 'wisp' },
        { id: 'groq', object: 'model', created: 0, owned_by: 'wisp' },
      ],
    });
  });

  // No usable Providers → an empty (but valid) list.
  it('returns an empty list when there are no providers', () => {
    expect(buildModelsList([])).toEqual({ object: 'list', data: [] });
  });

  // Alias advertising (#52): alias names ride the list after the Provider ids so pickers (Copilot CLI)
  // offer them. The list is exactly ids + aliases — Family routes never appear.
  it('appends alias names after the Provider ids and lists nothing else', () => {
    const list = buildModelsList([modelInfo('codex')], ['sol', 'lite']);
    expect(list.data.map((m) => m.id)).toEqual(['codex', 'sol', 'lite']);
    expect(list.data[1]).toEqual({ id: 'sol', object: 'model', created: 0, owned_by: 'wisp' });
  });
});

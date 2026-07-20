// ---------------- bridgeAnthropic.test.ts — pure Anthropic <-> Wisp protocol translator ---------------- //

import { describe, it, expect } from 'vitest';
import {
  parseAnthropicMessagesRequest,
  buildAnthropicSse,
  buildAnthropicMessageResponse,
  createAnthropicSseEncoder,
  buildAnthropicModelsList,
  anthropicErrorFrame,
  buildClaudeCodeSnippets,
  buildClaudeLaunch,
  advisorToolSpec,
  runAdvisorLoop,
  reviewerSystem,
  serializeForReview,
  buildReviewerRequest,
} from '../src/bridgeAnthropic';
import type { ChatModelInfo, NormalizedTurn } from '../src/catalog';
import type { BridgeStreamEvent } from '../src/bridge';

// Collect an async generator to an array — the loop tests assert on the full event sequence.
const drain = async (gen: AsyncIterable<BridgeStreamEvent>): Promise<BridgeStreamEvent[]> => {
  const out: BridgeStreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
};

// A base-pass fake: given a script of events per pass, returns them as async iterables in order and
// records the turns each pass was invoked with (so continuation-turn assembly can be asserted).
const scriptedBase = (passes: BridgeStreamEvent[][]) => {
  const calls: NormalizedTurn[][] = [];
  let i = 0;
  const basePass = (turns: NormalizedTurn[]): AsyncIterable<BridgeStreamEvent> => {
    calls.push(turns);
    const events = passes[i++] ?? [];
    return (async function* () { for (const ev of events) yield ev; })();
  };
  return { basePass, calls };
};

// Minimal ChatModelInfo builder — buildAnthropicModelsList only reads id + name, the rest is filler.
const modelInfo = (id: string, name = `${id} model`): ChatModelInfo => ({
  id, name, family: id, version: '1',
  maxInputTokens: 1, maxOutputTokens: 1, capabilities: { toolCalling: true },
});

// A fixed message identity so the SSE encoder stays deterministic (no Date.now() / random id here).
const meta = { id: 'msg_x', model: 'claude-wisp-codex' };

// Split an SSE wire string into its parsed frames — one `{event, data}` per `event: X\ndata: {…}` block.
// The encoder frames every event two-line + blank-line terminated, so this is the inverse for assertions.
const frames = (sse: string) =>
  sse.split('\n\n').filter(Boolean).map((block) => {
    const [evLine, dataLine] = block.split('\n');
    return { event: evLine.replace('event: ', ''), data: JSON.parse(dataLine.replace('data: ', '')) };
  });

// The non-streaming Messages reply: the reducer that fixes Claude Code's `/model` validation crash
// (`undefined is not an object (evaluating 'B.usage.input_tokens')`) — a request with stream:false must
// get a single JSON Messages object carrying a usage block, not the SSE stream.
describe('buildAnthropicMessageResponse', () => {
  // Consecutive text events collapse into one text block, and the reply carries a usage block (the field
  // Claude Code's validation probe reads).
  it('reduces text events to one text block with a numeric usage block', () => {
    const events: BridgeStreamEvent[] = [{ type: 'text', text: 'Hello' }, { type: 'text', text: ' world' }];
    const res = buildAnthropicMessageResponse(events, meta);
    expect(res.type).toBe('message');
    expect(res.role).toBe('assistant');
    expect(res.model).toBe(meta.model);
    expect(res.content).toEqual([{ type: 'text', text: 'Hello world' }]);
    expect(res.stop_reason).toBe('end_turn');
    expect(typeof res.usage.input_tokens).toBe('number');
    expect(typeof res.usage.output_tokens).toBe('number');
  });

  // A usage event carries the real token counts through — the reply's usage block reflects them (input,
  // both cache tiers, output) instead of the synthesized zeros, and the event is NOT rendered as content.
  it('folds a usage event into the reply usage block, not into content', () => {
    const events: BridgeStreamEvent[] = [
      { type: 'usage', usage: { input_tokens: 3, cache_creation_input_tokens: 0, cache_read_input_tokens: 2617, output_tokens: 1 } },
      { type: 'text', text: 'OK' },
      { type: 'usage', usage: { input_tokens: 3, cache_creation_input_tokens: 0, cache_read_input_tokens: 2617, output_tokens: 12 } },
    ];
    const res = buildAnthropicMessageResponse(events, meta);
    expect(res.content).toEqual([{ type: 'text', text: 'OK' }]);
    expect(res.usage).toEqual({ input_tokens: 3, cache_creation_input_tokens: 0, cache_read_input_tokens: 2617, output_tokens: 12 });
  });

  // A tool call becomes a tool_use block with its args parsed back to an object, and flips stop_reason.
  it('emits a tool_use block with parsed input and a tool_use stop_reason', () => {
    const events: BridgeStreamEvent[] = [{ type: 'tool_call', call: { id: 'toolu_1', name: 'read', argsJson: '{"path":"a.ts"}' } }];
    const res = buildAnthropicMessageResponse(events, meta);
    expect(res.content).toEqual([{ type: 'tool_use', id: 'toolu_1', name: 'read', input: { path: 'a.ts' } }]);
    expect(res.stop_reason).toBe('tool_use');
  });

  // The live-wire empty thinking block (start straight to signature, no deltas) survives buffering too.
  it('keeps an empty signed thinking block in the buffered reply', () => {
    const events: BridgeStreamEvent[] = [
      { type: 'thinking_start' },
      { type: 'thinking_signature', signature: 'sig-live' },
      { type: 'text', text: 'Hi' },
    ];
    const res = buildAnthropicMessageResponse(events, meta);
    expect(res.content).toEqual([
      { type: 'thinking', thinking: '', signature: 'sig-live' },
      { type: 'text', text: 'Hi' },
    ]);
  });

  // Thinking passthrough: thinking deltas assemble into one signed thinking block, a redacted block rides
  // whole, and neither disturbs the text merge or stop_reason.
  it('assembles thinking deltas + signature into a thinking block ahead of the text', () => {
    const events: BridgeStreamEvent[] = [
      { type: 'thinking_start' },
      { type: 'thinking', text: 'let me' }, { type: 'thinking', text: ' see' },
      { type: 'thinking_signature', signature: 'sig-1' },
      { type: 'redacted_thinking', data: 'opaque' },
      { type: 'text', text: 'Hi' },
    ];
    const res = buildAnthropicMessageResponse(events, meta);
    expect(res.content).toEqual([
      { type: 'thinking', thinking: 'let me see', signature: 'sig-1' },
      { type: 'redacted_thinking', data: 'opaque' },
      { type: 'text', text: 'Hi' },
    ]);
    expect(res.stop_reason).toBe('end_turn');
  });
});

describe('parseAnthropicMessagesRequest', () => {
  // The inverse of buildAnthropicMessagesBody: a plain user string becomes one user NormalizedTurn.
  it('maps a user text message to a user turn', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'codex', messages: [{ role: 'user', content: 'hi' }] });
    expect(parsed.turns).toEqual([{ role: 'user', text: 'hi', toolCalls: [], toolResults: [] }]);
  });

  // A plain assistant string becomes an assistant turn with empty tool arrays.
  it('maps an assistant text message to an assistant turn', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [{ role: 'assistant', content: 'sure' }] });
    expect(parsed.turns).toEqual([{ role: 'assistant', text: 'sure', toolCalls: [], toolResults: [] }]);
  });

  // Thinking passthrough: an assistant turn carrying a thinking block keeps its ORIGINAL content array as
  // rawContent — the byte-for-byte replay source for the Anthropic backend (signatures + interleaved order
  // survive verbatim). The normalized fields still extract for every other consumer.
  it('keeps the original content array as rawContent on a thinking-bearing assistant turn', () => {
    const blocks = [
      { type: 'thinking', thinking: 'let me see', signature: 'sig-abc' },
      { type: 'text', text: 'answer' },
      { type: 'tool_use', id: 'toolu_1', name: 'read', input: { path: 'a.ts' } },
    ];
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [{ role: 'assistant', content: blocks as never }] });
    expect(parsed.turns[0].rawContent).toEqual(blocks);
    expect(parsed.turns[0].text).toBe('answer');
    expect(parsed.turns[0].toolCalls).toEqual([{ id: 'toolu_1', name: 'read', argsJson: '{"path":"a.ts"}' }]);
  });

  // redacted_thinking is the same sidecar case — an opaque block that must replay verbatim.
  it('keeps rawContent when the assistant turn carries a redacted_thinking block', () => {
    const blocks = [{ type: 'redacted_thinking', data: 'opaque-bytes' }, { type: 'text', text: 'hi' }];
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [{ role: 'assistant', content: blocks as never }] });
    expect(parsed.turns[0].rawContent).toEqual(blocks);
    expect(parsed.turns[0].text).toBe('hi');
  });

  // The sidecar must NOT carry the client's cache_control markers: the body builder places Wisp's own
  // breakpoints (up to 4/request — Anthropic's cap), so client markers riding in verbatim would bust the
  // budget and 400. cache_control is unsigned metadata — stripping it never touches signed bytes.
  it('strips client cache_control from rawContent blocks', () => {
    const blocks = [
      { type: 'thinking', thinking: 'hm', signature: 'sig' },
      { type: 'text', text: 'answer', cache_control: { type: 'ephemeral' } },
      { type: 'tool_use', id: 't1', name: 'read', input: {}, cache_control: { type: 'ephemeral' } },
    ];
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [{ role: 'assistant', content: blocks as never }] });
    expect(parsed.turns[0].rawContent).toEqual([
      { type: 'thinking', thinking: 'hm', signature: 'sig' },
      { type: 'text', text: 'answer' },
      { type: 'tool_use', id: 't1', name: 'read', input: {} },
    ]);
  });

  // No thinking → no sidecar: every non-thinking turn keeps today's exact shape (zero behavior change).
  it('leaves rawContent absent on an assistant turn without thinking blocks', () => {
    const parsed = parseAnthropicMessagesRequest({
      model: 'm',
      messages: [{ role: 'assistant', content: [{ type: 'text', text: 'x' }, { type: 'tool_use', id: 't1', name: 'read', input: {} }] }],
    });
    expect(parsed.turns[0].rawContent).toBeUndefined();
  });

  // stream defaults to false when absent (downstream reads it like the OpenAI door does).
  it('defaults stream to false', () => {
    expect(parseAnthropicMessagesRequest({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }).stream).toBe(false);
    expect(parseAnthropicMessagesRequest({ model: 'm', stream: true, messages: [] }).stream).toBe(true);
  });

  // System as a plain STRING lifts into the separate system field (not a turn).
  it('lifts a string system into the system field', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', system: 'be terse', messages: [{ role: 'user', content: 'hi' }] });
    expect(parsed.system).toBe('be terse');
    expect(parsed.turns).toEqual([{ role: 'user', text: 'hi', toolCalls: [], toolResults: [] }]);
  });

  // Claude Code sends `system` as an ARRAY of text blocks (billing marker + prompt) — flatten to one string.
  it('flattens a system text-block array into one string', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', system: [
      { type: 'text', text: 'block a' },
      { type: 'text', text: 'block b', cache_control: { type: 'ephemeral' } },
    ], messages: [{ role: 'user', content: 'hi' }] } as any);
    expect(parsed.system).toBe('block a\n\nblock b');
  });

  // The mid-conversation-system beta puts `role:"system"` turns INSIDE messages (hook outputs land there).
  // They fold into the system string, not the turn list — the normalized seam carries one top-level system.
  it('folds a mid-conversation system message into the system string', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', system: 'top', messages: [
      { role: 'user', content: 'hi' },
      { role: 'system', content: 'hook note' },
    ] } as any);
    expect(parsed.system).toBe('top\n\nhook note');
    expect(parsed.turns).toEqual([{ role: 'user', text: 'hi', toolCalls: [], toolResults: [] }]);
  });

  // #139: Claude Code's own cache_control marks the stable/volatile boundary in its system block array —
  // everything up to and including the LAST marked block is the stable prefix, later blocks (mid-session
  // appended <system-reminder>s) are volatile. The split rides ALONGSIDE the joined `system` (which keeps
  // its full-text meaning for every other backend arm).
  it('records a systemSplit at the last client-marked system block', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', system: [
      { type: 'text', text: 'core prompt', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'tail prompt', cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: '<system-reminder>new skills</system-reminder>' },
    ], messages: [{ role: 'user', content: 'hi' }] } as any);
    expect(parsed.system).toBe('core prompt\n\ntail prompt\n\n<system-reminder>new skills</system-reminder>');
    expect(parsed.systemSplit).toEqual({ stable: 'core prompt\n\ntail prompt', volatile: '<system-reminder>new skills</system-reminder>' });
  });

  it('records an empty volatile side when the marker sits on the last system block', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', system: [
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b', cache_control: { type: 'ephemeral' } },
    ], messages: [{ role: 'user', content: 'hi' }] } as any);
    expect(parsed.systemSplit).toEqual({ stable: 'a\n\nb', volatile: '' });
  });

  // Mid-conversation system arrives mid-session by definition — always volatile, never part of the
  // stable prefix, whatever the top-level marker layout says.
  it('folds mid-conversation system into the volatile side of the split', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', system: [
      { type: 'text', text: 'top', cache_control: { type: 'ephemeral' } },
    ], messages: [
      { role: 'user', content: 'hi' },
      { role: 'system', content: 'hook note' },
    ] } as any);
    expect(parsed.system).toBe('top\n\nhook note');
    expect(parsed.systemSplit).toEqual({ stable: 'top', volatile: 'hook note' });
  });

  // No client marker (string system, or a non-Claude-Code client) → no split — the build side then keeps
  // today's exact single-block behavior.
  it('leaves systemSplit absent when the client sent no marker', () => {
    expect(parseAnthropicMessagesRequest({ model: 'm', system: 'be terse', messages: [{ role: 'user', content: 'hi' }] }).systemSplit).toBeUndefined();
    expect(parseAnthropicMessagesRequest({ model: 'm', system: [
      { type: 'text', text: 'a' },
    ], messages: [{ role: 'user', content: 'hi' }] } as any).systemSplit).toBeUndefined();
  });

  // A user turn's content can be a block ARRAY — text blocks concatenate into the turn text.
  it('concatenates text blocks in a content array', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [
      { role: 'user', content: [{ type: 'text', text: 'foo ' }, { type: 'text', text: 'bar' }] },
    ] } as any);
    expect(parsed.turns[0].text).toBe('foo bar');
  });

  // Multi-turn with tool_use (assistant) + tool_result (user) round-trips: tool_use → toolCalls (input
  // stringified to argsJson), tool_result → toolResults keyed by tool_use_id.
  it('round-trips a tool_use / tool_result multi-turn', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [
      { role: 'user', content: 'read a.ts' },
      { role: 'assistant', content: [
        { type: 'text', text: 'ok' },
        { type: 'tool_use', id: 'toolu_1', name: 'readFile', input: { path: 'a.ts' } },
      ] },
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'toolu_1', content: 'file body' },
      ] },
    ] } as any);
    expect(parsed.turns).toEqual([
      { role: 'user', text: 'read a.ts', toolCalls: [], toolResults: [] },
      { role: 'assistant', text: 'ok', toolCalls: [{ id: 'toolu_1', name: 'readFile', argsJson: '{"path":"a.ts"}' }], toolResults: [] },
      { role: 'user', text: '', toolCalls: [], toolResults: [{ callId: 'toolu_1', content: 'file body' }] },
    ]);
  });

  // A tool_result whose content is itself a block array flattens to the joined text (the normalized
  // toolResults content is a plain string, mirroring the OpenAI door).
  it('flattens a block-array tool_result content to text', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'toolu_9', content: [{ type: 'text', text: 'part1' }, { type: 'text', text: 'part2' }] },
      ] },
    ] } as any);
    expect(parsed.turns[0].toolResults).toEqual([{ callId: 'toolu_9', content: 'part1part2' }]);
  });

  // A failed tool call carries is_error:true — the flag rides through to the normalized turn so the
  // backend keeps Claude Code's explicit failure signal (not just the error text). A success omits it.
  it('carries tool_result is_error through to the normalized turn', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'toolu_ok', content: 'done' },
        { type: 'tool_result', tool_use_id: 'toolu_bad', content: 'boom', is_error: true },
      ] },
    ] } as any);
    expect(parsed.turns[0].toolResults).toEqual([
      { callId: 'toolu_ok', content: 'done' },
      { callId: 'toolu_bad', content: 'boom', isError: true },
    ]);
  });

  // An image content block becomes a normalized image (media_type → mimeType, data → dataBase64).
  it('maps an image block to images', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [
      { role: 'user', content: [
        { type: 'text', text: 'what is this' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      ] },
    ] } as any);
    expect(parsed.turns[0]).toEqual({
      role: 'user', text: 'what is this', toolCalls: [], toolResults: [],
      images: [{ mimeType: 'image/png', dataBase64: 'AAAA' }],
    });
  });

  // Claude Code's Read on an image file returns the pixels as an image block INSIDE tool_result content.
  // Those hoist into the turn's images[] (the normalized toolResults content stays plain text) so the
  // send-builders forward them — dropping them blinds the model to every Read-a-screenshot call.
  it('hoists an image block inside tool_result content into images', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'toolu_7', content: [
          { type: 'text', text: 'image 2525x1427' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'PIXELS' } },
        ] },
      ] },
    ] } as any);
    expect(parsed.turns[0]).toEqual({
      role: 'user', text: '', toolCalls: [], toolResults: [{ callId: 'toolu_7', content: 'image 2525x1427' }],
      images: [{ mimeType: 'image/png', dataBase64: 'PIXELS' }],
    });
  });

  // A document content block (a dragged-in PDF) becomes a normalized document — was silently dropped before,
  // so PDF content just vanished from the conversation.
  it('maps a document block to documents', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [
      { role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERI' } },
        { type: 'text', text: 'summarize this' },
      ] },
    ] } as any);
    expect(parsed.turns[0]).toEqual({
      role: 'user', text: 'summarize this', toolCalls: [], toolResults: [],
      documents: [{ mimeType: 'application/pdf', dataBase64: 'JVBERI' }],
    });
  });

  // Claude Code's Read on a PDF returns the pages as a document block INSIDE tool_result content — hoist
  // it into the turn's documents[] the same way Read-on-image hoists pixels into images[].
  it('hoists a document block inside tool_result content into documents', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'toolu_9', content: [
          { type: 'text', text: 'PDF 12 pages' },
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERI' } },
        ] },
      ] },
    ] } as any);
    expect(parsed.turns[0]).toEqual({
      role: 'user', text: '', toolCalls: [], toolResults: [{ callId: 'toolu_9', content: 'PDF 12 pages' }],
      documents: [{ mimeType: 'application/pdf', dataBase64: 'JVBERI' }],
    });
  });

  // Tools ride through: name/description kept, input_schema → inputSchema (Anthropic's JSON schema verbatim).
  it('maps tools to ToolSpec', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'readFile', description: 'read a file', input_schema: { type: 'object', properties: { path: { type: 'string' } } } }] } as any);
    expect(parsed.tools).toEqual([{ name: 'readFile', description: 'read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }]);
  });

  // Forced tool_choice must round-trip — background-tier calls send {type:"tool",name:…}; the door can't
  // hardcode 'auto' the way the OpenAI path does. It normalizes to { name } (a forced pick).
  it('carries a forced tool_choice as { name }', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [],
      tool_choice: { type: 'tool', name: 'emit_context_tip' } } as any);
    expect(parsed.toolChoice).toEqual({ name: 'emit_context_tip' });
  });

  // auto / any tool_choice normalize to their bare string form; absent → undefined.
  it('normalizes auto and any tool_choice, undefined when absent', () => {
    expect(parseAnthropicMessagesRequest({ model: 'm', messages: [], tool_choice: { type: 'auto' } } as any).toolChoice).toBe('auto');
    expect(parseAnthropicMessagesRequest({ model: 'm', messages: [], tool_choice: { type: 'any' } } as any).toolChoice).toBe('any');
    expect(parseAnthropicMessagesRequest({ model: 'm', messages: [] } as any).toolChoice).toBeUndefined();
  });

  // temperature carries through (the background tier sends temperature:0 — 0 must survive, not be dropped).
  it('carries temperature, including 0', () => {
    expect(parseAnthropicMessagesRequest({ model: 'm', messages: [], temperature: 0 } as any).temperature).toBe(0);
    expect(parseAnthropicMessagesRequest({ model: 'm', messages: [] } as any).temperature).toBeUndefined();
  });

  // Claude Code's /effort rides output_config.effort — a ladder value carries through so #46 can thread it
  // to the backend; absent or junk yields undefined (the door falls back to the panel effort).
  it('carries a valid output_config.effort, undefined when absent or junk', () => {
    expect(parseAnthropicMessagesRequest({ model: 'm', messages: [], output_config: { effort: 'xhigh' } } as any).effort).toBe('xhigh');
    expect(parseAnthropicMessagesRequest({ model: 'm', messages: [] } as any).effort).toBeUndefined();
    expect(parseAnthropicMessagesRequest({ model: 'm', messages: [], output_config: { effort: 'turbo' } } as any).effort).toBeUndefined();
  });

  // Discovery lists claude-wisp-<provider> aliases (slice-1 decision); the door strips the prefix inbound so
  // the model is the bare Provider id the send-builders name.
  it('strips the claude-wisp- alias prefix from the model', () => {
    expect(parseAnthropicMessagesRequest({ model: 'claude-wisp-codex', messages: [] }).model).toBe('codex');
  });

  // A stock claude-* id (the background tier's real haiku) carries no claude-wisp- prefix → passes verbatim,
  // never mangled (slice-1: #46's Active-Provider fallback absorbs unknown ids).
  it('passes a non-aliased claude id through verbatim', () => {
    expect(parseAnthropicMessagesRequest({ model: 'claude-haiku-4-5-20251001', messages: [] }).model).toBe('claude-haiku-4-5-20251001');
  });

  // Unknown beta fields (thinking, context_management, metadata, cache_control) are IGNORED, never
  // rejected — the door must not 400 on Claude Code's evolving beta surface. (output_config.effort is the
  // one beta field the door reads — covered above.)
  it('ignores unknown beta fields without crashing', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [{ role: 'user', content: 'hi' }],
      thinking: { type: 'adaptive' }, context_management: { edits: [] },
      metadata: { user_id: 'x' }, cache_control: { type: 'ephemeral' } } as any);
    expect(parsed.turns).toEqual([{ role: 'user', text: 'hi', toolCalls: [], toolResults: [] }]);
    expect(parsed).not.toHaveProperty('thinking');
  });

  // Untrusted body — a missing/non-array messages field degrades to no turns rather than throwing.
  it('degrades a bodyless request to empty turns', () => {
    expect(parseAnthropicMessagesRequest({ model: 'm' } as any)).toEqual({ model: 'm', stream: false, system: '', turns: [], tools: [] });
  });
});

describe('buildAnthropicSse', () => {
  // The full event sequence for a streamed text + tool-call reply — the shape Claude Code renders. A text
  // block opens/streams/closes, then each tool call is its own indexed tool_use block, then message_delta
  // (stop_reason tool_use, since a tool ran) + message_stop.
  it('emits the message/content-block/tool-call/stop sequence', () => {
    const events: BridgeStreamEvent[] = [
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'tool_call', call: { id: 'toolu_1', name: 'readFile', argsJson: '{"path":"a.ts"}' } },
    ];
    const f = frames(buildAnthropicSse(events, meta));
    expect(f.map((x) => x.event)).toEqual([
      'message_start', 'ping',
      'content_block_start', 'content_block_delta', 'content_block_delta', 'content_block_stop',
      'content_block_start', 'content_block_delta', 'content_block_stop',
      'message_delta', 'message_stop',
    ]);
    // message_start carries the message identity (id + model + assistant role, empty content).
    expect(f[0].data.message).toMatchObject({ id: 'msg_x', model: 'claude-wisp-codex', role: 'assistant', content: [] });
    // Text block is index 0; its deltas are text_delta fragments in order.
    expect(f[2].data).toMatchObject({ index: 0, content_block: { type: 'text', text: '' } });
    expect(f[3].data).toMatchObject({ index: 0, delta: { type: 'text_delta', text: 'Hel' } });
    expect(f[4].data.delta).toEqual({ type: 'text_delta', text: 'lo' });
    // Tool block is the next index (1); its args arrive whole as one input_json_delta.
    expect(f[6].data).toMatchObject({ index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'readFile', input: {} } });
    expect(f[7].data).toMatchObject({ index: 1, delta: { type: 'input_json_delta', partial_json: '{"path":"a.ts"}' } });
    // A tool ran → stop_reason is tool_use, not end_turn.
    expect(f[9].data.delta.stop_reason).toBe('tool_use');
  });

  // A text-only reply: one text block, stop_reason end_turn (no tool ran), no tool_use block.
  it('emits end_turn for a text-only reply', () => {
    const f = frames(buildAnthropicSse([{ type: 'text', text: 'done' }], meta));
    expect(f.map((x) => x.event)).toEqual([
      'message_start', 'ping', 'content_block_start', 'content_block_delta', 'content_block_stop',
      'message_delta', 'message_stop',
    ]);
    expect(f.at(-2)!.data.delta.stop_reason).toBe('end_turn');
  });

  // A tool-only reply (no text): the first block is the tool_use at index 0, stop_reason tool_use.
  it('emits a tool-only reply with the tool block at index 0', () => {
    const f = frames(buildAnthropicSse([{ type: 'tool_call', call: { id: 't', name: 'x', argsJson: '{}' } }], meta));
    expect(f.map((x) => x.event)).toEqual([
      'message_start', 'ping', 'content_block_start', 'content_block_delta', 'content_block_stop',
      'message_delta', 'message_stop',
    ]);
    expect(f[2].data).toMatchObject({ index: 0, content_block: { type: 'tool_use', name: 'x' } });
    expect(f.at(-2)!.data.delta.stop_reason).toBe('tool_use');
  });

  // A tool call with empty args emits no input_json_delta — input stays {} (nothing to stream).
  it('omits input_json_delta for an argless tool call', () => {
    const f = frames(buildAnthropicSse([{ type: 'tool_call', call: { id: 't', name: 'x', argsJson: '' } }], meta));
    expect(f.map((x) => x.event)).toEqual([
      'message_start', 'ping', 'content_block_start', 'content_block_stop', 'message_delta', 'message_stop',
    ]);
  });

  // Thinking passthrough: a thinking block opens, streams thinking_delta fragments, closes on its
  // signature_delta — then the text block claims the next index. stop_reason stays end_turn.
  it('emits a signed thinking block ahead of the text block', () => {
    const events: BridgeStreamEvent[] = [
      { type: 'thinking', text: 'let me' },
      { type: 'thinking', text: ' see' },
      { type: 'thinking_signature', signature: 'sig-1' },
      { type: 'text', text: 'Hi' },
    ];
    const f = frames(buildAnthropicSse(events, meta));
    expect(f.map((x) => x.event)).toEqual([
      'message_start', 'ping',
      'content_block_start', 'content_block_delta', 'content_block_delta', 'content_block_delta', 'content_block_stop',
      'content_block_start', 'content_block_delta', 'content_block_stop',
      'message_delta', 'message_stop',
    ]);
    expect(f[2].data).toMatchObject({ index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } });
    expect(f[3].data.delta).toEqual({ type: 'thinking_delta', thinking: 'let me' });
    expect(f[5].data.delta).toEqual({ type: 'signature_delta', signature: 'sig-1' });
    expect(f[7].data).toMatchObject({ index: 1, content_block: { type: 'text', text: '' } });
    expect(f.at(-2)!.data.delta.stop_reason).toBe('end_turn');
  });

  // THE live wire shape: the OAuth backend sends thinking blocks with EMPTY thinking text — a
  // thinking_start straight to its signature. The start alone must open the block so the signed (but
  // textless) block still reaches the client for replay.
  it('frames an empty thinking block from start straight to signature', () => {
    const events: BridgeStreamEvent[] = [
      { type: 'thinking_start' },
      { type: 'thinking_signature', signature: 'sig-live' },
      { type: 'text', text: 'Hi' },
    ];
    const f = frames(buildAnthropicSse(events, meta));
    expect(f.map((x) => x.event)).toEqual([
      'message_start', 'ping',
      'content_block_start', 'content_block_delta', 'content_block_stop',
      'content_block_start', 'content_block_delta', 'content_block_stop',
      'message_delta', 'message_stop',
    ]);
    expect(f[2].data).toMatchObject({ index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } });
    expect(f[3].data.delta).toEqual({ type: 'signature_delta', signature: 'sig-live' });
    expect(f[5].data).toMatchObject({ index: 1, content_block: { type: 'text', text: '' } });
  });

  // Interleaved thinking keeps PER-BLOCK signatures: a signature closes its block, the next thinking delta
  // claims a new index. redacted_thinking rides whole — start + stop, no deltas.
  it('starts a new block per signed thinking segment and frames redacted_thinking whole', () => {
    const events: BridgeStreamEvent[] = [
      { type: 'thinking', text: 'a' },
      { type: 'thinking_signature', signature: 's1' },
      { type: 'thinking', text: 'b' },
      { type: 'thinking_signature', signature: 's2' },
      { type: 'redacted_thinking', data: 'opaque' },
    ];
    const f = frames(buildAnthropicSse(events, meta));
    expect(f.map((x) => x.event)).toEqual([
      'message_start', 'ping',
      'content_block_start', 'content_block_delta', 'content_block_delta', 'content_block_stop',
      'content_block_start', 'content_block_delta', 'content_block_delta', 'content_block_stop',
      'content_block_start', 'content_block_stop',
      'message_delta', 'message_stop',
    ]);
    expect(f[6].data).toMatchObject({ index: 1, content_block: { type: 'thinking' } });
    expect(f[10].data).toMatchObject({ index: 2, content_block: { type: 'redacted_thinking', data: 'opaque' } });
  });

  // An empty stream still frames a well-formed message: start + ping + end_turn delta + stop, no blocks.
  it('frames an empty reply as end_turn', () => {
    const f = frames(buildAnthropicSse([], meta));
    expect(f.map((x) => x.event)).toEqual(['message_start', 'ping', 'message_delta', 'message_stop']);
    expect(f.at(-2)!.data.delta.stop_reason).toBe('end_turn');
  });

  // Every frame is `event: <type>\ndata: <json>\n\n` — spot-check the exact wire form of message_stop.
  it('frames each event two-line + blank-line terminated', () => {
    const sse = buildAnthropicSse([], meta);
    expect(sse.endsWith('event: message_stop\ndata: {"type":"message_stop"}\n\n')).toBe(true);
  });
});

// The real token meter: the encoder folds usage (via setUsage, the way the streaming door feeds it) into the
// message_start + message_delta usage blocks so the wisped client reads real counts, not synthesized zeros.
describe('createAnthropicSseEncoder usage', () => {
  const parse = (s: string) => frames(s).map((f) => f.data);

  // The door ordering: setUsage(start snapshot) → start(); content; setUsage(final) → finish(). message_start
  // carries the initial input/cache snapshot, message_delta the final cumulative counts.
  it('emits real usage in message_start and message_delta', () => {
    const enc = createAnthropicSseEncoder(meta);
    enc.setUsage({ input_tokens: 4, cache_creation_input_tokens: 0, cache_read_input_tokens: 2617, output_tokens: 3 });
    let out = enc.start();
    out += enc.push({ type: 'text', text: 'OK' });
    enc.setUsage({ input_tokens: 4, cache_creation_input_tokens: 0, cache_read_input_tokens: 2617, output_tokens: 15 });
    out += enc.finish();
    const f = parse(out);
    const start = f.find((d) => d.type === 'message_start')!;
    const delta = f.find((d) => d.type === 'message_delta')!;
    expect(start.message.usage).toMatchObject({ input_tokens: 4, cache_read_input_tokens: 2617, output_tokens: 3 });
    expect(delta.usage).toEqual({ input_tokens: 4, cache_creation_input_tokens: 0, cache_read_input_tokens: 2617, output_tokens: 15 });
  });

  // No usage seen (a non-Anthropic provider routed through the door) → the old zero shape survives, so the
  // usage block still exists and is numeric (Claude Code's /model probe reads it).
  it('falls back to numeric zeros when no usage was fed', () => {
    const enc = createAnthropicSseEncoder(meta);
    const f = parse(enc.start() + enc.push({ type: 'text', text: 'hi' }) + enc.finish());
    expect(f.find((d) => d.type === 'message_start')!.message.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
    expect(f.find((d) => d.type === 'message_delta')!.usage).toEqual({ output_tokens: 0 });
  });

  // A usage event pushed through buildAnthropicSse emits no content frame — it only updates the usage state
  // the closing message_delta reports.
  it('push(usage) adds no wire frame but reaches message_delta', () => {
    const f = frames(buildAnthropicSse([
      { type: 'usage', usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 9, output_tokens: 6 } },
      { type: 'text', text: 'hi' },
    ], meta));
    expect(f.map((x) => x.event)).toEqual(['message_start', 'ping', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop']);
    expect(f.find((x) => x.event === 'message_delta')!.data.usage).toEqual({ input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 9, output_tokens: 6 });
  });
});

describe('anthropicErrorFrame', () => {
  // A mid-stream backend failure is surfaced as a proper Anthropic `error` event carrying the real message,
  // so Claude Code shows it instead of reporting an empty/malformed response.
  it('frames a backend error as an Anthropic error event', () => {
    expect(anthropicErrorFrame('Codex API error 400: bad schema')).toBe(
      'event: error\ndata: {"type":"error","error":{"type":"api_error","message":"Codex API error 400: bad schema"}}\n\n',
    );
  });
});

describe('buildAnthropicModelsList', () => {
  // GET /v1/models in Anthropic shape: one entry per usable Provider, id aliased claude-wisp-<providerId>
  // (slice-1 decision) with the Provider label as display_name; created_at is a fixed constant (pure).
  it('maps ChatModelInfos to claude-wisp- aliased Anthropic models', () => {
    const list = buildAnthropicModelsList([modelInfo('codex', 'Codex — gpt-5'), modelInfo('opencode', 'OpenCode — grok')]);
    expect(list.data).toEqual([
      { type: 'model', id: 'claude-wisp-codex', display_name: 'Codex — gpt-5', created_at: '2025-01-01T00:00:00Z' },
      { type: 'model', id: 'claude-wisp-opencode', display_name: 'OpenCode — grok', created_at: '2025-01-01T00:00:00Z' },
    ]);
    expect(list).toMatchObject({ has_more: false, first_id: 'claude-wisp-codex', last_id: 'claude-wisp-opencode' });
  });

  // No usable Providers → an empty but well-formed list with null first/last ids.
  it('returns an empty list when there are no providers', () => {
    expect(buildAnthropicModelsList([])).toEqual({ data: [], has_more: false, first_id: null, last_id: null });
  });

  // Alias advertising (#52): aliases ride after the Providers, claude-wisp- prefixed like every listed id
  // (the inbound parse strips the prefix back to the raw alias name, so a picked entry round-trips to the
  // alias route). display_name carries the pinned model like the Provider rows do ('Codex — gpt-5').
  // The list is exactly Providers + aliases — Family routes never appear.
  it('appends claude-wisp- aliased Alias names and lists nothing else', () => {
    const list = buildAnthropicModelsList([modelInfo('codex', 'Codex — gpt-5')], [{ name: 'sol', model: 'gpt-5.6-terra' }]);
    expect(list.data.map((m) => m.id)).toEqual(['claude-wisp-codex', 'claude-wisp-sol']);
    expect(list.data[1]).toEqual({ type: 'model', id: 'claude-wisp-sol', display_name: 'sol — gpt-5.6-terra', created_at: '2025-01-01T00:00:00Z' });
    expect(list.last_id).toBe('claude-wisp-sol');
  });

  // The pinned model in the row is a per-user preference (wisp.bridge.aliasPickerShowsModel): an alias
  // arriving without a model renders bare — no dangling ' — '.
  it('renders a bare alias name when no model is passed', () => {
    const list = buildAnthropicModelsList([], [{ name: 'sol' }]);
    expect(list.data[0].display_name).toBe('sol');
  });

  // Alias-only (#81): the clean-list decision lives HERE, not at the call site, so the fallback
  // below can't be skipped by a caller. With aliases present the Provider rows drop out.
  it('alias-only with aliases present lists only the aliases', () => {
    const list = buildAnthropicModelsList([modelInfo('codex', 'Codex — gpt-5')], [{ name: 'sol' }], true);
    expect(list.data.map((m) => m.id)).toEqual(['claude-wisp-sol']);
  });

  // Zero-alias fallback (#81): alias-only effectively on with an empty Routing map must never
  // serve an empty picker — the Provider rows come back until the first Alias exists.
  it('alias-only with zero aliases falls back to the Provider rows', () => {
    const list = buildAnthropicModelsList([modelInfo('codex', 'Codex — gpt-5')], [], true);
    expect(list.data.map((m) => m.id)).toEqual(['claude-wisp-codex']);
  });
});

describe('buildClaudeCodeSnippets', () => {
  const snips = buildClaudeCodeSnippets('http://127.0.0.1:8971', 's3cret_x');

  // Per-session PowerShell lines: $env: form, quoted values, all four vars, bare origin (no /v1). The
  // advisor flag rides along so the native /advisor works through the Bridge (a claude-wisp-* base model
  // has no advisor_rank, so Claude Code only injects the advisor tool under this experimental flag).
  it('builds the PowerShell per-session lines', () => {
    expect(snips.powershell).toBe(
      '$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:8971"\n' +
      '$env:ANTHROPIC_API_KEY = "s3cret_x"\n' +
      '$env:CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = "1"\n' +
      '$env:CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL = "1"',
    );
  });

  // Per-session bash lines: export form, same four vars.
  it('builds the bash per-session lines', () => {
    expect(snips.bash).toBe(
      'export ANTHROPIC_BASE_URL=http://127.0.0.1:8971\n' +
      'export ANTHROPIC_API_KEY=s3cret_x\n' +
      'export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1\n' +
      'export CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL=1',
    );
  });

  // The persistent variant is a valid project .claude/settings.json env block — parseable JSON carrying
  // exactly the four vars. The global ~/.claude form must never be produced (PRD #43 ban).
  it('builds a parseable project settings.json env block', () => {
    expect(JSON.parse(snips.settingsJson)).toEqual({
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8971',
        ANTHROPIC_API_KEY: 's3cret_x',
        CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
        CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL: '1',
      },
    });
  });
});

describe('buildClaudeLaunch', () => {
  // The launcher's whole contract in one shape: the Bridge env vars (discovery + advisor) plus CLAUDE_BINARY
  // (so relay-style respawners inside the session re-use the wrapper), argv verbatim. The advisor flag lets
  // the native /advisor work through the Bridge out of the box.
  it('builds the env vars + CLAUDE_BINARY from port + secret', () => {
    const launch = buildClaudeLaunch(8971, 's3cret_x', []);
    expect(launch.env).toEqual({
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8971',
      ANTHROPIC_API_KEY: 's3cret_x',
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
      CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL: '1',
      CLAUDE_BINARY: 'claude-wisp',
    });
  });

  // Verbatim passthrough: flags, values with spaces, and things that look like our own flags all survive.
  it('passes argv through untouched', () => {
    const argv = ['--dangerously-skip-permissions', '-p', 'say hi there', '--port'];
    expect(buildClaudeLaunch(8971, 's', argv).args).toEqual(argv);
  });

  // The returned args are a copy — a caller mutating them must not reach back into the argv it was given.
  it('copies argv rather than aliasing it', () => {
    const argv = ['-p'];
    const launch = buildClaudeLaunch(8971, 's', argv);
    launch.args.push('extra');
    expect(argv).toEqual(['-p']);
  });
});

// ----------------------------- Advisor (server tool) — parse + emit ----------------------------- //

describe('parseAnthropicMessagesRequest — advisor', () => {
  // Claude Code injects {type:'advisor_20260301', name:'advisor', model} into tools when the Advisor is on.
  // The door extracts it (the model rides to the reviewer sub-call) and keeps it OUT of the regular tools —
  // forwarding it schema-less was the old dangle.
  it('extracts the advisor server tool from tools and exposes its model', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [{ role: 'user', content: 'hi' }], tools: [
      { type: 'advisor_20260301', name: 'advisor', model: 'claude-opus-4-8' },
      { name: 'read', description: 'read a file', input_schema: { type: 'object' } },
    ] } as any);
    expect(parsed.advisor).toEqual({ model: 'claude-opus-4-8' });
    expect(parsed.tools).toEqual([{ name: 'read', description: 'read a file', inputSchema: { type: 'object' } }]);
  });

  // No advisor tool → the field stays absent, and a plain request is byte-identical to before.
  it('leaves advisor absent when the tool is not sent', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [{ role: 'user', content: 'hi' }], tools: [
      { name: 'read', description: '', input_schema: { type: 'object' } },
    ] } as any);
    expect(parsed.advisor).toBeUndefined();
  });

  // A server_tool_use block in assistant history becomes a normalized toolCall (input → argsJson), so the
  // backend sees the same regular-tool exchange the door synthesized live — not a silently dropped block.
  it('maps an assistant server_tool_use block to a toolCall', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [
      { role: 'assistant', content: [
        { type: 'text', text: 'consulting' },
        { type: 'server_tool_use', id: 'srvtoolu_1', name: 'advisor', input: {} },
      ] },
    ] } as any);
    expect(parsed.turns[0].toolCalls).toEqual([{ id: 'srvtoolu_1', name: 'advisor', argsJson: '{}' }]);
    expect(parsed.turns[0].text).toBe('consulting');
  });

  // The advisor_tool_result rides in the SAME assistant message on the wire, but the normalized shape (and
  // every backend) wants tool results on the NEXT user turn — so the advice text carries forward as a
  // toolResult there, paired to the server_tool_use id.
  it('carries an assistant advisor_tool_result forward to the next user turn as a toolResult', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [
      { role: 'assistant', content: [
        { type: 'server_tool_use', id: 'srvtoolu_1', name: 'advisor', input: {} },
        { type: 'advisor_tool_result', tool_use_id: 'srvtoolu_1', content: { type: 'advisor_result', text: 'do X first' } },
        { type: 'text', text: 'ok, doing X' },
      ] },
      { role: 'user', content: 'thanks' },
    ] } as any);
    expect(parsed.turns[1].toolResults).toEqual([{ callId: 'srvtoolu_1', content: 'do X first' }]);
    expect(parsed.turns[1].text).toBe('thanks');
    expect(parsed.turns[0].text).toBe('ok, doing X');
  });

  // An error result (advisor_tool_result_error content) carries forward as an isError toolResult.
  it('carries an advisor error result forward as an isError toolResult', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [
      { role: 'assistant', content: [
        { type: 'server_tool_use', id: 'srvtoolu_2', name: 'advisor', input: {} },
        { type: 'advisor_tool_result', tool_use_id: 'srvtoolu_2', content: { type: 'advisor_tool_result_error', error_code: 'unavailable' } },
      ] },
      { role: 'user', content: 'go on' },
    ] } as any);
    expect(parsed.turns[1].toolResults).toEqual([{ callId: 'srvtoolu_2', content: 'advisor error: unavailable', isError: true }]);
  });

  // A trailing advisor result with no following user turn has nowhere to land — dropped, never a crash.
  it('drops a trailing advisor result with no following user turn', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [
      { role: 'assistant', content: [
        { type: 'server_tool_use', id: 's1', name: 'advisor', input: {} },
        { type: 'advisor_tool_result', tool_use_id: 's1', content: { type: 'advisor_result', text: 'advice' } },
      ] },
    ] } as any);
    expect(parsed.turns).toHaveLength(1);
  });

  // On a thinking-bearing turn the rawContent sidecar replays verbatim to the Anthropic backend — but the
  // backend never saw advisor blocks (the door executed them as a regular tool round-trip). server_tool_use
  // rewrites to a plain tool_use; advisor_tool_result drops (its text lives on the next user turn).
  it('scrubs advisor blocks from the rawContent sidecar', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'm', messages: [
      { role: 'assistant', content: [
        { type: 'thinking', thinking: 'hm', signature: 'sig' },
        { type: 'server_tool_use', id: 's1', name: 'advisor', input: { focus: 'plan' } },
        { type: 'advisor_tool_result', tool_use_id: 's1', content: { type: 'advisor_result', text: 'advice' } },
        { type: 'text', text: 'after' },
      ] },
      { role: 'user', content: 'k' },
    ] } as any);
    expect(parsed.turns[0].rawContent).toEqual([
      { type: 'thinking', thinking: 'hm', signature: 'sig' },
      { type: 'tool_use', id: 's1', name: 'advisor', input: { focus: 'plan' } },
      { type: 'text', text: 'after' },
    ]);
  });
});

describe('anthropic SSE encoder — advisor events', () => {
  // A server_tool_use event emits the whole block: start (empty input) + one input_json_delta + stop —
  // the same whole-call folding the regular tool_use path uses, under the server_tool_use block type.
  it('emits a server_tool_use block whole', () => {
    const enc = createAnthropicSseEncoder(meta);
    enc.start();
    const fs = frames(enc.push({ type: 'server_tool_use', call: { id: 'srvtoolu_1', name: 'advisor', argsJson: '{"a":1}' } }));
    expect(fs.map((f) => f.event)).toEqual(['content_block_start', 'content_block_delta', 'content_block_stop']);
    expect(fs[0].data.content_block).toEqual({ type: 'server_tool_use', id: 'srvtoolu_1', name: 'advisor', input: {} });
    expect(fs[1].data.delta).toEqual({ type: 'input_json_delta', partial_json: '{"a":1}' });
  });

  // The advisor result is one whole block: Claude Code copies the full content off content_block_start,
  // so start carries everything and stop follows immediately.
  it('emits an advisor_tool_result block whole', () => {
    const enc = createAnthropicSseEncoder(meta);
    enc.start();
    const fs = frames(enc.push({ type: 'advisor_result', toolUseId: 'srvtoolu_1', text: 'do X' }));
    expect(fs.map((f) => f.event)).toEqual(['content_block_start', 'content_block_stop']);
    expect(fs[0].data.content_block).toEqual({
      type: 'advisor_tool_result', tool_use_id: 'srvtoolu_1', content: { type: 'advisor_result', text: 'do X' },
    });
  });

  // The error twin: content is the advisor_tool_result_error shape Claude Code renders as "Advisor unavailable".
  it('emits an advisor error result block whole', () => {
    const enc = createAnthropicSseEncoder(meta);
    enc.start();
    const fs = frames(enc.push({ type: 'advisor_error', toolUseId: 'srvtoolu_1', errorCode: 'unavailable' }));
    expect(fs[0].data.content_block).toEqual({
      type: 'advisor_tool_result', tool_use_id: 'srvtoolu_1', content: { type: 'advisor_tool_result_error', error_code: 'unavailable' },
    });
  });

  // Advisor is a SERVER tool — fully handled inside the turn, so it must not flip stop_reason to tool_use
  // (that would tell Claude Code to run a client tool that doesn't exist). Text around it stays intact.
  it('keeps stop_reason end_turn across an advisor round-trip', () => {
    const sse = buildAnthropicSse([
      { type: 'text', text: 'before' },
      { type: 'server_tool_use', call: { id: 's1', name: 'advisor', argsJson: '{}' } },
      { type: 'advisor_result', toolUseId: 's1', text: 'advice' },
      { type: 'text', text: 'after' },
    ], meta);
    const fs = frames(sse);
    const delta = fs.find((f) => f.event === 'message_delta');
    expect(delta?.data.delta.stop_reason).toBe('end_turn');
    // Indexes stay strictly increasing across text → server_tool_use → result → text blocks.
    const starts = fs.filter((f) => f.event === 'content_block_start');
    expect(starts.map((f) => f.data.index)).toEqual([0, 1, 2, 3]);
  });
});

describe('buildAnthropicMessageResponse — advisor events', () => {
  // The buffered mirror: advisor events become their blocks in order, stop_reason stays end_turn.
  it('renders advisor events as blocks without flipping stop_reason', () => {
    const res = buildAnthropicMessageResponse([
      { type: 'server_tool_use', call: { id: 's1', name: 'advisor', argsJson: '{"q":2}' } },
      { type: 'advisor_result', toolUseId: 's1', text: 'advice' },
      { type: 'text', text: 'done' },
    ], meta);
    expect(res.content).toEqual([
      { type: 'server_tool_use', id: 's1', name: 'advisor', input: { q: 2 } },
      { type: 'advisor_tool_result', tool_use_id: 's1', content: { type: 'advisor_result', text: 'advice' } },
      { type: 'text', text: 'done' },
    ]);
    expect(res.stop_reason).toBe('end_turn');
  });
});

describe('advisorToolSpec', () => {
  // The synthetic REGULAR tool the door forwards to the base backend so it has an 'advisor' to call —
  // the backend isn't Anthropic-first-party and can't do server tools, so the advisor rides as an ordinary
  // no-input tool, and the door intercepts the call.
  it('is a no-input tool named advisor', () => {
    const spec = advisorToolSpec();
    expect(spec.name).toBe('advisor');
    expect(spec.inputSchema).toEqual({ type: 'object', properties: {}, additionalProperties: false });
    expect(typeof spec.description).toBe('string');
    expect(spec.description.length).toBeGreaterThan(0);
  });
});

describe('reviewerSystem', () => {
  // The live failure this guards: fed the base system prompt (with Claude Code's `# Advisor Tool` section)
  // plus a weak frame, the reviewer echoed those meta-instructions instead of reviewing — reproduced on real
  // Opus, not just foreign Targets. The frame must name the conversation as material (not instructions to the
  // reviewer), forbid obeying/repeating it, and refuse the empty-echo. Weaken any of those → this fails.
  it('quarantines the transcript and forbids echoing instructions', () => {
    const s = reviewerSystem();
    expect(s).toMatch(/not addressed to you|no instructions for you to follow|material for you to review/i);
    expect(s).toMatch(/do not obey|do not .*repeat|never to perform/i);
    expect(s).toMatch(/rather than echoing/i);
  });
});

describe('serializeForReview', () => {
  // Why this exists: the reviewer sub-call must NOT receive the raw turns. They carry tool_use/tool_result
  // blocks and replayed thinking, which tripped Anthropic's "max 4 blocks with cache_control … Found 5" 400.
  // Flattening to text means the reviewer request is one plain user message — no tool/thinking blocks to mark.
  it('flattens turns to labelled plain text with no structured blocks', () => {
    const turns: NormalizedTurn[] = [
      { role: 'user', text: 'fix the bug', toolCalls: [], toolResults: [] },
      { role: 'assistant', text: 'reading it', toolCalls: [{ id: 'c1', name: 'Read', argsJson: '{}' }], toolResults: [] },
      { role: 'user', text: '', toolCalls: [], toolResults: [{ callId: 'c1', content: 'file body' }] },
    ];
    const s = serializeForReview(turns);
    expect(s).toContain('User: fix the bug');
    expect(s).toContain('Assistant: reading it');
    expect(s).toContain('[called Read]');
    expect(s).toContain('[result: file body]');
    // No structured markers or objects leak through — it is a string of role-labelled lines.
    expect(typeof s).toBe('string');
  });

  // Tool-result dumps (whole file reads) are capped so the review input stays focused and the single message
  // can't balloon — the cap is readability/cost, not correctness.
  it('caps long tool-result content and flags errors', () => {
    const big = 'x'.repeat(5000);
    const turns: NormalizedTurn[] = [
      { role: 'user', text: '', toolCalls: [], toolResults: [{ callId: 'c1', content: big }] },
      { role: 'user', text: '', toolCalls: [], toolResults: [{ callId: 'c2', content: 'boom', isError: true }] },
    ];
    const s = serializeForReview(turns);
    expect(s).toContain('… (truncated)');
    expect(s.length).toBeLessThan(big.length + 500);
    expect(s).toContain('[result (error): boom]');
  });

  // Images are noted, not embedded — the reviewer is a text pass, and image blocks would re-introduce the
  // structured content the flattening exists to remove.
  it('notes images without embedding them', () => {
    const turns: NormalizedTurn[] = [
      { role: 'user', text: 'look', toolCalls: [], toolResults: [], images: [{ mimeType: 'image/png', dataBase64: 'AAAA' }] },
    ];
    const s = serializeForReview(turns);
    expect(s).toContain('[1 image(s) omitted]');
    expect(s).not.toContain('AAAA');
  });
});

describe('buildReviewerRequest', () => {
  // #142 (#139 regression): the reviewer request was built as {...parsed, system: reviewerSystem()}, which
  // copied systemSplit along — and the Anthropic arm PREFERS systemSplit.stable over system, so the reviewer
  // got the client's full system prompt (advisor meta-instructions included) instead of the quarantine frame.
  it('quarantines the reviewer: reviewerSystem only, systemSplit stripped, no tools, no advisor', () => {
    const parsed = parseAnthropicMessagesRequest({ model: 'claude-wisp-opus', stream: true, system: [
      { type: 'text', text: 'client system with # Advisor Tool section', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: '<system-reminder>new skills</system-reminder>' },
    ], messages: [
      { role: 'user', content: 'ship it?' },
    ], tools: [
      { name: 'Read', description: 'd', input_schema: { type: 'object' } },
      { type: 'advisor_20260301', name: 'advisor', model: 'claude-wisp-opus' },
    ] } as any);
    expect(parsed.systemSplit).toBeDefined(); // the regression precondition — the split is present

    const out = buildReviewerRequest(parsed, parsed.turns);
    expect(out.system).toBe(reviewerSystem());
    expect(out.systemSplit).toBeUndefined();
    expect(out.tools).toEqual([]);
    expect(out.advisor).toBeUndefined();
    expect(out.turns).toEqual([expect.objectContaining({
      role: 'user', text: `Conversation to review:\n\n${serializeForReview(parsed.turns)}`, toolCalls: [], toolResults: [],
    })]);
  });

  // #141: the reviewer transcript rides as per-turn text blocks so successive advisor calls share a
  // byte-stable prefix — the old single grown block re-billed the whole transcript every invocation.
  // `text` stays the full join: a non-Anthropic advisor Target reads only turn.text.
  it('splits the review transcript into per-turn blocks with a byte-stable prefix', () => {
    const t = (role: 'user' | 'assistant', text: string): NormalizedTurn => ({ role, text, toolCalls: [], toolResults: [] });
    const base = { model: 'm', stream: true, system: '', turns: [], tools: [] } as any;
    const short = buildReviewerRequest(base, [t('user', 'fix bug'), t('assistant', 'reading')]);
    const grown = buildReviewerRequest(base, [t('user', 'fix bug'), t('assistant', 'reading'), t('user', 'and tests'), t('assistant', 'ok')]);
    const sb = short.turns[0].textBlocks!;
    const gb = grown.turns[0].textBlocks!;
    expect(sb[0]).toBe('Conversation to review:');
    expect(sb.length).toBe(3);
    expect(gb.length).toBe(5);
    expect(gb.slice(0, 3)).toEqual(sb); // the grown call's leading blocks are identical — the cacheable prefix
    expect(sb.join('\n\n')).toBe(short.turns[0].text); // invariant: blocks join back to the flat text
    expect(gb.join('\n\n')).toBe(grown.turns[0].text);
  });

  // Empty-serialization turns (e.g. a bare tool-shuffle with no text) must not create empty blocks — an
  // empty text block is never emitted by the body builder, and a skipped turn must not shift later blocks.
  it('drops empty per-turn serializations from textBlocks', () => {
    const turns: NormalizedTurn[] = [
      { role: 'user', text: 'hi', toolCalls: [], toolResults: [] },
      { role: 'assistant', text: '', toolCalls: [], toolResults: [] },
      { role: 'user', text: 'still there?', toolCalls: [], toolResults: [] },
    ];
    const out = buildReviewerRequest({ model: 'm', stream: true, system: '', turns: [], tools: [] } as any, turns);
    expect(out.turns[0].textBlocks!.every((b) => b.length > 0)).toBe(true);
    expect(out.turns[0].textBlocks!.length).toBe(3); // header + 2 non-empty turns
  });
});

describe('runAdvisorLoop', () => {
  const initial: NormalizedTurn[] = [{ role: 'user', text: 'ship it?', toolCalls: [], toolResults: [] }];

  // No advisor call: the loop is a pass-through — base events stream out unchanged, one base pass only.
  it('passes base events through when the model never calls advisor', async () => {
    const { basePass, calls } = scriptedBase([[{ type: 'text', text: 'looks good' }]]);
    const events = await drain(runAdvisorLoop({ turns: initial, basePass, reviewer: async () => 'x' }));
    expect(events).toEqual([{ type: 'text', text: 'looks good' }]);
    expect(calls).toHaveLength(1);
  });

  // The core round-trip: base emits text then an advisor call → the loop emits the text, a server_tool_use,
  // the advisor_result from the reviewer, then the continuation pass's text. The reviewer sees the turns.
  it('runs the reviewer on an advisor call and streams the result then the continuation', async () => {
    const { basePass, calls } = scriptedBase([
      [{ type: 'text', text: 'let me check. ' }, { type: 'tool_call', call: { id: 'srv1', name: 'advisor', argsJson: '{}' } }],
      [{ type: 'text', text: 'advisor says yes, shipping.' }],
    ]);
    let reviewerTurns: NormalizedTurn[] | undefined;
    const reviewer = async (turns: NormalizedTurn[]) => { reviewerTurns = turns; return 'yes, safe to ship'; };
    const events = await drain(runAdvisorLoop({ turns: initial, basePass, reviewer }));
    expect(events).toEqual([
      { type: 'text', text: 'let me check. ' },
      { type: 'server_tool_use', call: { id: 'srv1', name: 'advisor', argsJson: '{}' } },
      { type: 'advisor_result', toolUseId: 'srv1', text: 'yes, safe to ship' },
      { type: 'text', text: 'advisor says yes, shipping.' },
    ]);
    expect(reviewerTurns).toEqual(initial);
    expect(calls).toHaveLength(2);
  });

  // The continuation pass carries the advisor exchange in history: the assistant turn holds the accumulated
  // text + the advisor toolCall, and a following user turn holds the advice as a toolResult — so the base
  // backend resumes with the advice in context.
  it('appends the advisor exchange to the continuation pass turns', async () => {
    const { basePass, calls } = scriptedBase([
      [{ type: 'text', text: 'thinking… ' }, { type: 'tool_call', call: { id: 'srv1', name: 'advisor', argsJson: '{}' } }],
      [{ type: 'text', text: 'done' }],
    ]);
    await drain(runAdvisorLoop({ turns: initial, basePass, reviewer: async () => 'do X' }));
    expect(calls[1]).toEqual([
      ...initial,
      { role: 'assistant', text: 'thinking… ', toolCalls: [{ id: 'srv1', name: 'advisor', argsJson: '{}' }], toolResults: [] },
      { role: 'user', text: '', toolCalls: [], toolResults: [{ callId: 'srv1', content: 'do X' }] },
    ]);
  });

  // A reviewer failure surfaces as an advisor_error block (Claude Code renders "Advisor unavailable"), and
  // the loop still continues once with the error fed back so the base model isn't left dangling.
  it('emits advisor_error when the reviewer throws and continues', async () => {
    const { basePass, calls } = scriptedBase([
      [{ type: 'tool_call', call: { id: 'srv1', name: 'advisor', argsJson: '{}' } }],
      [{ type: 'text', text: 'proceeding without advice' }],
    ]);
    const events = await drain(runAdvisorLoop({ turns: initial, basePass, reviewer: async () => { throw new Error('boom'); } }));
    expect(events).toEqual([
      { type: 'server_tool_use', call: { id: 'srv1', name: 'advisor', argsJson: '{}' } },
      { type: 'advisor_error', toolUseId: 'srv1', errorCode: 'boom' },
      { type: 'text', text: 'proceeding without advice' },
    ]);
    expect(calls[1][calls[1].length - 1].toolResults[0].isError).toBe(true);
  });

  // A non-advisor (client) tool call is terminal: it streams through as a tool_call for Claude Code to run,
  // and the loop stops — no continuation pass, no reviewer.
  it('passes a non-advisor tool call through and stops', async () => {
    const { basePass, calls } = scriptedBase([
      [{ type: 'text', text: 'reading' }, { type: 'tool_call', call: { id: 't1', name: 'read', argsJson: '{"path":"a"}' } }],
      [{ type: 'text', text: 'SHOULD NOT RUN' }],
    ]);
    let reviewerRan = false;
    const events = await drain(runAdvisorLoop({ turns: initial, basePass, reviewer: async () => { reviewerRan = true; return ''; } }));
    expect(events).toEqual([
      { type: 'text', text: 'reading' },
      { type: 'tool_call', call: { id: 't1', name: 'read', argsJson: '{"path":"a"}' } },
    ]);
    expect(calls).toHaveLength(1);
    expect(reviewerRan).toBe(false);
  });

  // Safety cap: a model that keeps calling advisor every pass is bounded — after maxConsults the loop stops
  // rather than looping forever. Each consult still emits its result; only further continuation is cut.
  it('caps the number of advisor consults', async () => {
    const advisorPass: BridgeStreamEvent[] = [{ type: 'tool_call', call: { id: 'srv', name: 'advisor', argsJson: '{}' } }];
    const { basePass, calls } = scriptedBase([advisorPass, advisorPass, advisorPass, advisorPass]);
    const events = await drain(runAdvisorLoop({ turns: initial, basePass, reviewer: async () => 'a', maxConsults: 2 }));
    const consults = events.filter((e) => e.type === 'advisor_result').length;
    expect(consults).toBe(2);
    expect(calls).toHaveLength(2);
  });
});

// ----------------------------- Advisor usage surfacing (#143) ----------------------------- //

describe('advisor usage iterations (#143)', () => {
  const initial: NormalizedTurn[] = [{ role: 'user', text: 'ship it?', toolCalls: [], toolResults: [] }];
  const advUsage = { input_tokens: 1200, cache_creation_input_tokens: 30, cache_read_input_tokens: 900, output_tokens: 250 };
  const baseUsage = { input_tokens: 5000, cache_creation_input_tokens: 100, cache_read_input_tokens: 4000, output_tokens: 700 };

  // The reviewer verdict may carry the sub-call's real usage + the resolved Target model; the loop then
  // yields an advisor_usage event right after the advisor_result so the door can surface it in
  // usage.iterations. String verdicts (the pre-#143 shape) stay valid — no usage, no event.
  it('yields advisor_usage after the result when the reviewer reports usage', async () => {
    const { basePass } = scriptedBase([
      [{ type: 'tool_call', call: { id: 'srv1', name: 'advisor', argsJson: '{}' } }],
      [{ type: 'text', text: 'done' }],
    ]);
    const reviewer = async () => ({ text: 'advice', usage: advUsage, model: 'gpt-5.6' });
    const events = await drain(runAdvisorLoop({ turns: initial, basePass, reviewer }));
    expect(events).toEqual([
      { type: 'server_tool_use', call: { id: 'srv1', name: 'advisor', argsJson: '{}' } },
      { type: 'advisor_result', toolUseId: 'srv1', text: 'advice' },
      { type: 'advisor_usage', usage: advUsage, model: 'gpt-5.6' },
      { type: 'text', text: 'done' },
    ]);
  });

  // A verdict without usage (the reviewer Target reported no counts) yields no advisor_usage — the entry
  // is omitted rather than emitted with fake zeros.
  it('yields no advisor_usage when the verdict has no usage', async () => {
    const { basePass } = scriptedBase([
      [{ type: 'tool_call', call: { id: 'srv1', name: 'advisor', argsJson: '{}' } }],
      [{ type: 'text', text: 'done' }],
    ]);
    const events = await drain(runAdvisorLoop({ turns: initial, basePass, reviewer: async () => ({ text: 'advice' }) }));
    expect(events.some((e) => e.type === 'advisor_usage')).toBe(false);
    expect(events).toContainEqual({ type: 'advisor_result', toolUseId: 'srv1', text: 'advice' });
  });

  // Streaming: captured advisor usage rides out as usage.iterations on the closing message_delta — advisor
  // entries in consult order, then the final base pass as the LAST entry. Claude Code reads iterations[-1]
  // as the authoritative final context window (openclaude tokens.ts finalContextTokensFromLastResponse), so
  // an advisor entry sitting last would corrupt its window math. Top-level usage stays the base pass only.
  it('message_delta carries usage.iterations: advisor entries then the base entry last', () => {
    const firstPass = { input_tokens: 4000, cache_creation_input_tokens: 100, cache_read_input_tokens: 3000, output_tokens: 40 };
    const enc = createAnthropicSseEncoder(meta);
    enc.start();
    enc.setUsage(firstPass);
    expect(enc.push({ type: 'advisor_usage', usage: advUsage, model: 'gpt-5.6' })).toBe(''); // no wire frame
    enc.setUsage(baseUsage); // continuation pass — the final cumulative counts
    const delta = frames(enc.finish()).find((x) => x.event === 'message_delta')!;
    expect(delta.data.usage.iterations).toEqual([
      { type: 'advisor_message', model: 'gpt-5.6', ...advUsage },
      { type: 'message', model: meta.model, ...baseUsage },
    ]);
    expect(delta.data.usage.input_tokens).toBe(baseUsage.input_tokens); // #111 guard reads these — unchanged
  });

  // No advisor consult → no iterations key at all: a plain turn's wire stays byte-identical to pre-#143.
  it('omits iterations when no advisor usage was captured', () => {
    const enc = createAnthropicSseEncoder(meta);
    enc.start();
    enc.setUsage(baseUsage);
    const delta = frames(enc.finish()).find((x) => x.event === 'message_delta')!;
    expect('iterations' in delta.data.usage).toBe(false);
  });

  // No base usage (non-Anthropic base Target emits none) → no safe last entry, so iterations is dropped
  // entirely rather than letting an advisor entry sit last and hijack the window math.
  it('omits iterations when the base pass reported no usage', () => {
    const enc = createAnthropicSseEncoder(meta);
    enc.start();
    enc.push({ type: 'advisor_usage', usage: advUsage, model: 'gpt-5.6' });
    const delta = frames(enc.finish()).find((x) => x.event === 'message_delta')!;
    expect('iterations' in delta.data.usage).toBe(false);
  });

  // The buffered (non-streaming) reply mirrors the encoder: advisor_usage events fold into usage.iterations
  // in order (no content block), the last usage event supplies the closing base entry.
  it('buildAnthropicMessageResponse folds advisor usage into usage.iterations', () => {
    const adv2 = { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 };
    const events: BridgeStreamEvent[] = [
      { type: 'usage', usage: baseUsage },
      { type: 'text', text: 'hi' },
      { type: 'advisor_usage', usage: advUsage, model: 'gpt-5.6' },
      { type: 'advisor_usage', usage: adv2, model: 'sol' },
    ];
    const out = buildAnthropicMessageResponse(events, meta);
    expect(out.usage.iterations).toEqual([
      { type: 'advisor_message', model: 'gpt-5.6', ...advUsage },
      { type: 'advisor_message', model: 'sol', ...adv2 },
      { type: 'message', model: meta.model, ...baseUsage },
    ]);
    expect(out.content).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('buildAnthropicMessageResponse omits iterations without advisor usage', () => {
    const out = buildAnthropicMessageResponse([{ type: 'text', text: 'hi' }, { type: 'usage', usage: baseUsage }], meta);
    expect('iterations' in out.usage).toBe(false);
  });
});

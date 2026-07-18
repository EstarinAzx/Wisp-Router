// ---------------- bridgeAnthropic.test.ts — pure Anthropic <-> Wisp protocol translator ---------------- //

import { describe, it, expect } from 'vitest';
import {
  parseAnthropicMessagesRequest,
  buildAnthropicSse,
  buildAnthropicMessageResponse,
  buildAnthropicModelsList,
  anthropicErrorFrame,
  buildClaudeCodeSnippets,
  buildClaudeLaunch,
} from '../src/bridgeAnthropic';
import type { ChatModelInfo } from '../src/catalog';
import type { BridgeStreamEvent } from '../src/bridge';

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

  // A tool call becomes a tool_use block with its args parsed back to an object, and flips stop_reason.
  it('emits a tool_use block with parsed input and a tool_use stop_reason', () => {
    const events: BridgeStreamEvent[] = [{ type: 'tool_call', call: { id: 'toolu_1', name: 'read', argsJson: '{"path":"a.ts"}' } }];
    const res = buildAnthropicMessageResponse(events, meta);
    expect(res.content).toEqual([{ type: 'tool_use', id: 'toolu_1', name: 'read', input: { path: 'a.ts' } }]);
    expect(res.stop_reason).toBe('tool_use');
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

  // Per-session PowerShell lines: $env: form, quoted values, all three vars, bare origin (no /v1).
  it('builds the PowerShell per-session lines', () => {
    expect(snips.powershell).toBe(
      '$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:8971"\n' +
      '$env:ANTHROPIC_API_KEY = "s3cret_x"\n' +
      '$env:CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = "1"',
    );
  });

  // Per-session bash lines: export form, same three vars.
  it('builds the bash per-session lines', () => {
    expect(snips.bash).toBe(
      'export ANTHROPIC_BASE_URL=http://127.0.0.1:8971\n' +
      'export ANTHROPIC_API_KEY=s3cret_x\n' +
      'export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1',
    );
  });

  // The persistent variant is a valid project .claude/settings.json env block — parseable JSON carrying
  // exactly the three vars. The global ~/.claude form must never be produced (PRD #43 ban).
  it('builds a parseable project settings.json env block', () => {
    expect(JSON.parse(snips.settingsJson)).toEqual({
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8971',
        ANTHROPIC_API_KEY: 's3cret_x',
        CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
      },
    });
  });
});

describe('buildClaudeLaunch', () => {
  // The launcher's whole contract in one shape: the Bridge env trio plus CLAUDE_BINARY (so relay-style
  // respawners inside the session re-use the wrapper), argv verbatim.
  it('builds the env trio + CLAUDE_BINARY from port + secret', () => {
    const launch = buildClaudeLaunch(8971, 's3cret_x', []);
    expect(launch.env).toEqual({
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8971',
      ANTHROPIC_API_KEY: 's3cret_x',
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
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

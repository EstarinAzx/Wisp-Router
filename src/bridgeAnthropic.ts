// ---------------- bridgeAnthropic.ts — Wisp: pure Anthropic <-> Wisp protocol translator ---------------- //

/*
 * The Anthropic door (PRD #43, slice #45) — the sibling of bridge.ts's OpenAI door. It lets real Claude
 * Code talk to the whole Wisp Provider catalog as if Wisp were the Anthropic Messages API: inbound
 * /v1/messages request → normalized Wisp turns (the same BridgeChatRequest the OpenAI door produces, plus
 * the forced tool_choice + temperature the Anthropic wire carries), and an Anthropic-SSE emitter on the
 * way out. Pure and vscode-free, opens no socket — the listener + door routes + side-panel snippet are
 * later slices (#46/#47). Wire facts are pinned by slice #44 (issue #44's comments).
 *
 * Reuses catalog.ts's normalized vocabulary (NormalizedTurn, ToolSpec, ChatModelInfo) and bridge.ts's
 * BridgeChatRequest + BridgeStreamEvent, so the OpenAI and Anthropic doors feed the same downstream
 * send-builders — no second normalized shape.
 */

import type { NormalizedTurn, ToolSpec, ChatModelInfo } from './catalog';
import type { BridgeChatRequest, BridgeStreamEvent } from './bridge';

// ----------------------------- Inbound: Anthropic Messages request -> Wisp ----------------------------- //

// The Anthropic request shapes we read. Structural (no SDK import) — only the fields the translator needs.
// A text block appears both as a `system` entry and inside message content; tool_use/tool_result/image are
// message-only. cache_control and other beta annotations ride along and are simply never read.
type AntTextBlock = { type: 'text'; text: string };
type AntToolUseBlock = { type: 'tool_use'; id: string; name: string; input: unknown };
type AntToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string | AntTextBlock[] };
type AntImageBlock = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
type AntContentBlock = AntTextBlock | AntToolUseBlock | AntToolResultBlock | AntImageBlock;
type AntMessage = { role: 'user' | 'assistant' | 'system'; content: string | AntContentBlock[] };
type AntTool = { name: string; description?: string; input_schema?: object };
type AntToolChoice = { type: 'auto' } | { type: 'any' } | { type: 'none' } | { type: 'tool'; name: string };
export type AnthropicMessagesRequest = {
  model: string;
  system?: string | AntTextBlock[];
  messages: AntMessage[];
  tools?: AntTool[];
  tool_choice?: AntToolChoice;
  temperature?: number;
  stream?: boolean;
};

// The normalized tool_choice the door carries downstream. A bare string for auto/any/none; { name } for a
// FORCED pick — the background tier sends {type:"tool",name:…} and #46 must honor it, so unlike the OpenAI
// door (which hardcodes 'auto') this survives the round-trip.
export type NormalizedToolChoice = 'auto' | 'any' | 'none' | { name: string };

// The Anthropic door's normalized request: the shared BridgeChatRequest plus the two fields the Anthropic
// wire adds. Both optional — a request may carry neither. #46 reads them when forwarding to the active Provider.
export type BridgeAnthropicRequest = BridgeChatRequest & {
  toolChoice?: NormalizedToolChoice;
  temperature?: number;
};

// The joined text of a string-or-text-block field. A bare string is itself; a block array joins its text
// blocks with `sep`. System uses '\n\n' (each block is a separate directive — billing marker, then prompt);
// user content and tool_result use '' (the blocks are fragments of one message). Non-text blocks skip.
const blockText = (v: string | AntTextBlock[] | AntContentBlock[] | undefined, sep = ''): string => {
  if (typeof v === 'string') return v;
  if (!Array.isArray(v)) return '';
  return v.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => (b as AntTextBlock).text).join(sep);
};

// Normalize an Anthropic tool_choice into the door's vocabulary. A forced {type:"tool",name} becomes
// { name }; auto/any/none keep their bare type; anything unrecognized (or absent) yields undefined.
const normalizeToolChoice = (tc: AntToolChoice | undefined): NormalizedToolChoice | undefined => {
  if (!tc) return undefined;
  if (tc.type === 'tool') return { name: tc.name };
  if (tc.type === 'auto' || tc.type === 'any' || tc.type === 'none') return tc.type;
  return undefined;
};

// Split one user content block array into text (concatenated), the tool results it carries, and its images —
// the inbound inverse of buildAnthropicMessagesBody's user-turn block expansion. tool_result content is
// itself flattened to a string (the normalized toolResults content is plain text, as the OpenAI door's is).
const splitUserBlocks = (blocks: AntContentBlock[]): {
  text: string;
  toolResults: { callId: string; content: string }[];
  images: { mimeType: string; dataBase64: string }[];
} => {
  let text = '';
  const toolResults: { callId: string; content: string }[] = [];
  const images: { mimeType: string; dataBase64: string }[] = [];
  for (const b of blocks) {
    if (b?.type === 'text' && typeof b.text === 'string') text += b.text;
    else if (b?.type === 'tool_result') toolResults.push({ callId: b.tool_use_id, content: blockText(b.content) });
    else if (b?.type === 'image' && b.source?.data) images.push({ mimeType: b.source.media_type ?? '', dataBase64: b.source.data });
    // Unknown / partial blocks are skipped, never dereferenced blindly — the body is untrusted.
  }
  return { text, toolResults, images };
};

// Parse an Anthropic /v1/messages body into Wisp's normalized shape. System text is lifted out of the turn
// list into a separate string — both the top-level `system` (string or block array) AND any mid-conversation
// role:"system" turn (the mid-conversation-system beta) fold in, joined blank-line-separated.
// ponytail: mid-conversation system loses its position among turns — the normalized seam has one top-level
// system slot; fine for the translator, #46 revisits if positioned system ever matters.
// The claude-wisp- discovery alias is stripped from `model` (slice-1 decision); a stock claude-* id (the
// background tier's haiku) has no such prefix and passes verbatim. Beta fields (thinking, context_management,
// output_config, metadata, cache_control) are simply never read — ignored, never rejected.
export const parseAnthropicMessagesRequest = (body: AnthropicMessagesRequest): BridgeAnthropicRequest => {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const systemParts: string[] = [];
  if (body.system !== undefined) systemParts.push(blockText(body.system, '\n\n'));

  const turns: NormalizedTurn[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') { systemParts.push(blockText(msg.content, '\n\n')); continue; }
    if (typeof msg.content === 'string') {
      turns.push({ role: msg.role, text: msg.content, toolCalls: [], toolResults: [] });
      continue;
    }
    const blocks = Array.isArray(msg.content) ? msg.content : [];
    if (msg.role === 'assistant') {
      // Assistant blocks: text concatenates, tool_use → toolCalls with input stringified back to argsJson.
      let text = '';
      const toolCalls: { id: string; name: string; argsJson: string }[] = [];
      for (const b of blocks) {
        if (b?.type === 'text' && typeof b.text === 'string') text += b.text;
        else if (b?.type === 'tool_use') toolCalls.push({ id: b.id, name: b.name, argsJson: JSON.stringify(b.input ?? {}) });
      }
      turns.push({ role: 'assistant', text, toolCalls, toolResults: [] });
    } else {
      const { text, toolResults, images } = splitUserBlocks(blocks);
      turns.push({ role: 'user', text, toolCalls: [], toolResults, ...(images.length ? { images } : {}) });
    }
  }

  const tools: ToolSpec[] = (body.tools ?? []).map((t) => ({
    name: t.name ?? '',
    description: t.description ?? '',
    ...(t.input_schema !== undefined ? { inputSchema: t.input_schema } : {}),
  }));

  const toolChoice = normalizeToolChoice(body.tool_choice);
  return {
    model: (body.model ?? '').replace(/^claude-wisp-/, ''),
    stream: body.stream ?? false,
    system: systemParts.filter(Boolean).join('\n\n'),
    turns,
    tools,
    // Only attach the extras when present, so a plain request stays byte-identical to a bare BridgeChatRequest.
    ...(toolChoice !== undefined ? { toolChoice } : {}),
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
  };
};

// ----------------------------- Outbound: Wisp stream -> Anthropic SSE ----------------------------- //

// The message identity every frame of one reply shares — injected so this module stays deterministic (no
// Date.now() / random id here; the HTTP slice supplies a stable msg id).
export type AnthropicSseMeta = { id: string; model: string };

// Frame one Anthropic SSE event: `event: <type>\ndata: <json>\n\n` (named event + a single data line,
// blank-line terminated) — the two-line form Anthropic uses, unlike the OpenAI door's data-only line.
const frame = (event: string, data: unknown): string => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

// A stateful encoder driving the Wisp stream onto the Anthropic content-block protocol. Anthropic blocks are
// INDEXED and must open/close, and text vs tool_use are different block types — so unlike the OpenAI door's
// stateless per-chunk emitters this holds a small state machine (which block is open, the running index,
// whether a tool ran). It lives here rather than in the impure #46 layer so the state logic stays unit-tested.
// Each method returns the wire frames to write; the HTTP slice concatenates them onto the socket.
export const createAnthropicSseEncoder = (meta: AnthropicSseMeta) => {
  let nextIndex = 0;              // the index the next content block will claim
  let openKind: 'text' | 'tool' | null = null;   // the currently-open block's kind, or none
  let openIndex = 0;             // the currently-open block's index
  let sawTool = false;           // any tool call emitted → stop_reason is tool_use, not end_turn

  // Close whatever block is open (no-op if none), returning its content_block_stop frame.
  const closeOpen = (): string => {
    if (openKind === null) return '';
    const s = frame('content_block_stop', { type: 'content_block_stop', index: openIndex });
    openKind = null;
    return s;
  };

  return {
    // The opening frames: message_start (the message envelope, empty content) + a ping keepalive — the shape
    // slice #44 confirmed real Claude Code accepts.
    start: (): string =>
      frame('message_start', {
        type: 'message_start',
        message: { id: meta.id, type: 'message', role: 'assistant', model: meta.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
      }) + frame('ping', { type: 'ping' }),

    // Handle one stream event. Text opens (once) a text block then streams text_delta fragments into it. A
    // tool call closes any open block, opens its own tool_use block, streams the whole args as one
    // input_json_delta (Wisp folds tool calls whole — no fragments), then closes immediately.
    push: (ev: BridgeStreamEvent): string => {
      if (ev.type === 'text') {
        let s = '';
        if (openKind !== 'text') {
          s += closeOpen();
          openIndex = nextIndex++;
          openKind = 'text';
          s += frame('content_block_start', { type: 'content_block_start', index: openIndex, content_block: { type: 'text', text: '' } });
        }
        return s + frame('content_block_delta', { type: 'content_block_delta', index: openIndex, delta: { type: 'text_delta', text: ev.text } });
      }
      sawTool = true;
      let s = closeOpen();
      openIndex = nextIndex++;
      openKind = 'tool';
      s += frame('content_block_start', { type: 'content_block_start', index: openIndex, content_block: { type: 'tool_use', id: ev.call.id, name: ev.call.name, input: {} } });
      // Empty args → no delta; the block's input stays {} (nothing to stream).
      if (ev.call.argsJson) s += frame('content_block_delta', { type: 'content_block_delta', index: openIndex, delta: { type: 'input_json_delta', partial_json: ev.call.argsJson } });
      return s + closeOpen();
    },

    // The closing frames: close any still-open block, then message_delta (stop_reason tool_use if a tool ran,
    // else end_turn) + message_stop.
    finish: (): string =>
      closeOpen() +
      frame('message_delta', { type: 'message_delta', delta: { stop_reason: sawTool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 0 } }) +
      frame('message_stop', { type: 'message_stop' }),
  };
};

// Drive a whole ordered stream through the encoder to its complete SSE wire string — the testable spec of the
// streaming semantics, and the buffered form #46 can use when it isn't streaming live.
export const buildAnthropicSse = (events: BridgeStreamEvent[], meta: AnthropicSseMeta): string => {
  const enc = createAnthropicSseEncoder(meta);
  let out = enc.start();
  for (const ev of events) out += enc.push(ev);
  return out + enc.finish();
};

// ----------------------------- Models: ChatModelInfo[] -> GET /v1/models ----------------------------- //

// One entry of the Anthropic models list. created_at is fixed (the catalog has no per-Provider creation time
// and Date.now() is forbidden here); the id is the claude-wisp- discovery alias slice #44 locked, so the
// picker lists it and the inbound parse strips it back to the Provider id.
type AntModel = { type: 'model'; id: string; display_name: string; created_at: string };
export type AntModelsList = { data: AntModel[]; has_more: false; first_id: string | null; last_id: string | null };

// A fixed created_at — the catalog carries no real creation time and this module reads no clock.
const FIXED_CREATED_AT = '2025-01-01T00:00:00Z';

// Build the GET /v1/models response in Anthropic shape from the ChatModelInfo[] buildChatModelInfos produces
// (one entry per usable Provider). id is claude-wisp-<providerId> (the alias the picker filters to); the
// Provider label rides as display_name. first_id/last_id bound the page, null when empty.
export const buildAnthropicModelsList = (infos: ChatModelInfo[]): AntModelsList => {
  const data: AntModel[] = infos.map((info) => ({
    type: 'model', id: `claude-wisp-${info.id}`, display_name: info.name, created_at: FIXED_CREATED_AT,
  }));
  return {
    data,
    has_more: false,
    first_id: data[0]?.id ?? null,
    last_id: data[data.length - 1]?.id ?? null,
  };
};

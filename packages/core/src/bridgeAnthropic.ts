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

import type { NormalizedTurn, ToolSpec, ChatModelInfo, EffortLevel } from './catalog';
import type { BridgeChatRequest, BridgeStreamEvent } from './bridge';

// ----------------------------- Inbound: Anthropic Messages request -> Wisp ----------------------------- //

// The Anthropic request shapes we read. Structural (no SDK import) — only the fields the translator needs.
// A text block appears both as a `system` entry and inside message content; tool_use/tool_result/image are
// message-only. cache_control and other beta annotations ride along and are simply never read.
type AntTextBlock = { type: 'text'; text: string };
type AntToolUseBlock = { type: 'tool_use'; id: string; name: string; input: unknown };
type AntToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string | AntContentBlock[]; is_error?: boolean };
type AntImageBlock = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
type AntDocumentBlock = { type: 'document'; source: { type: 'base64'; media_type: string; data: string } };
type AntThinkingBlock = { type: 'thinking'; thinking: string; signature?: string };
type AntRedactedThinkingBlock = { type: 'redacted_thinking'; data: string };
type AntContentBlock = AntTextBlock | AntToolUseBlock | AntToolResultBlock | AntImageBlock | AntDocumentBlock | AntThinkingBlock | AntRedactedThinkingBlock;
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
  output_config?: { effort?: string }; // Claude Code's /effort rides here (effort beta) — the one beta field the door reads
};

// The normalized tool_choice the door carries downstream. A bare string for auto/any/none; { name } for a
// FORCED pick — the background tier sends {type:"tool",name:…} and #46 must honor it, so unlike the OpenAI
// door (which hardcodes 'auto') this survives the round-trip.
export type NormalizedToolChoice = 'auto' | 'any' | 'none' | { name: string };

// The Anthropic door's normalized request: the shared BridgeChatRequest plus the fields the Anthropic
// wire adds. All optional — a request may carry none. #46 reads them when forwarding to the active Provider.
export type BridgeAnthropicRequest = BridgeChatRequest & {
  toolChoice?: NormalizedToolChoice;
  temperature?: number;
  effort?: EffortLevel; // Claude Code's /effort (output_config.effort) — overrides the panel effort when present
};

// Validate an inbound output_config.effort against Wisp's ladder — the body is untrusted, so an unknown
// string yields undefined (the door then falls back to the panel effort) rather than a junk wire value.
const normalizeEffort = (v: string | undefined): EffortLevel | undefined =>
  v === 'low' || v === 'medium' || v === 'high' || v === 'xhigh' || v === 'max' ? v : undefined;

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
  toolResults: { callId: string; content: string; isError?: boolean }[];
  images: { mimeType: string; dataBase64: string }[];
  documents: { mimeType: string; dataBase64: string }[];
} => {
  let text = '';
  const toolResults: { callId: string; content: string; isError?: boolean }[] = [];
  const images: { mimeType: string; dataBase64: string }[] = [];
  const documents: { mimeType: string; dataBase64: string }[] = [];
  // An image or document block, wherever it sits, joins the turn's images[]/documents[] — the normalized
  // shape has no per-result slot. ponytail: base64 sources only — text/url document sources stay dropped
  // until a client actually sends one.
  const takeMedia = (b: AntContentBlock | undefined): void => {
    if (b?.type === 'image' && b.source?.data) images.push({ mimeType: b.source.media_type ?? '', dataBase64: b.source.data });
    else if (b?.type === 'document' && b.source?.type === 'base64' && b.source.data) documents.push({ mimeType: b.source.media_type ?? '', dataBase64: b.source.data });
  };
  for (const b of blocks) {
    if (b?.type === 'text' && typeof b.text === 'string') text += b.text;
    else if (b?.type === 'tool_result') {
      // is_error rides through so the backend keeps Claude Code's explicit "this tool failed" signal.
      toolResults.push({ callId: b.tool_use_id, content: blockText(b.content), ...(b.is_error ? { isError: true } : {}) });
      // Claude Code's Read-on-image/PDF puts the payload INSIDE tool_result content — hoist it, don't drop it.
      if (Array.isArray(b.content)) for (const inner of b.content) takeMedia(inner);
    } else takeMedia(b);
    // Unknown / partial blocks are skipped, never dereferenced blindly — the body is untrusted.
  }
  return { text, toolResults, images, documents };
};

// Parse an Anthropic /v1/messages body into Wisp's normalized shape. System text is lifted out of the turn
// list into a separate string — both the top-level `system` (string or block array) AND any mid-conversation
// role:"system" turn (the mid-conversation-system beta) fold in, joined blank-line-separated.
// ponytail: mid-conversation system loses its position among turns — the normalized seam has one top-level
// system slot; fine for the translator, #46 revisits if positioned system ever matters.
// The claude-wisp- discovery alias is stripped from `model` (slice-1 decision); a stock claude-* id (the
// background tier's haiku) has no such prefix and passes verbatim. output_config.effort is read (Claude
// Code's /effort — #47 threads it to the backend); the other beta fields (thinking, context_management,
// metadata, cache_control) are simply never read — ignored, never rejected.
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
      let hasThinking = false;
      for (const b of blocks) {
        if (b?.type === 'text' && typeof b.text === 'string') text += b.text;
        else if (b?.type === 'tool_use') toolCalls.push({ id: b.id, name: b.name, argsJson: JSON.stringify(b.input ?? {}) });
        else if (b?.type === 'thinking' || b?.type === 'redacted_thinking') hasThinking = true;
      }
      // A thinking-bearing turn keeps its ORIGINAL block array as the byte-for-byte replay sidecar —
      // Anthropic wants thinking blocks back verbatim (signatures + interleaved order), which the
      // normalized fields can't reconstruct. Non-thinking turns stay sidecar-free (today's exact shape).
      // Sidecar blocks shed any client cache_control marker (unsigned metadata): the body builder places
      // Wisp's OWN breakpoints, and client markers riding in verbatim would bust the 4-per-request cap.
      const stripCache = (b: AntContentBlock): AntContentBlock => {
        if (b && typeof b === 'object' && 'cache_control' in b) {
          const { cache_control: _c, ...rest } = b as AntContentBlock & { cache_control?: unknown };
          return rest as AntContentBlock;
        }
        return b;
      };
      turns.push({ role: 'assistant', text, toolCalls, toolResults: [], ...(hasThinking ? { rawContent: blocks.map(stripCache) } : {}) });
    } else {
      const { text, toolResults, images, documents } = splitUserBlocks(blocks);
      turns.push({ role: 'user', text, toolCalls: [], toolResults, ...(images.length ? { images } : {}), ...(documents.length ? { documents } : {}) });
    }
  }

  const tools: ToolSpec[] = (body.tools ?? []).map((t) => ({
    name: t.name ?? '',
    description: t.description ?? '',
    ...(t.input_schema !== undefined ? { inputSchema: t.input_schema } : {}),
  }));

  const toolChoice = normalizeToolChoice(body.tool_choice);
  const effort = normalizeEffort(body.output_config?.effort);
  return {
    model: (body.model ?? '').replace(/^claude-wisp-/, ''),
    stream: body.stream ?? false,
    system: systemParts.filter(Boolean).join('\n\n'),
    turns,
    tools,
    // Only attach the extras when present, so a plain request stays byte-identical to a bare BridgeChatRequest.
    ...(toolChoice !== undefined ? { toolChoice } : {}),
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(effort !== undefined ? { effort } : {}),
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
  let openKind: 'text' | 'tool' | 'thinking' | null = null;   // the currently-open block's kind, or none
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
      // Thinking passthrough: thinking_start opens a block (the OAuth wire sends EMPTY thinking blocks —
      // start straight to signature — so the start must open on its own); thinking deltas stream into it
      // (opening one themselves if no start arrived); the signature_delta is the last delta and CLOSES the
      // block, so the next start/delta claims a fresh index (per-block signatures — interleaved thinking).
      // The block-start shape matches the real Anthropic wire: { type:'thinking', thinking:'', signature:'' }.
      if (ev.type === 'thinking_start') {
        let s = closeOpen();
        openIndex = nextIndex++;
        openKind = 'thinking';
        return s + frame('content_block_start', { type: 'content_block_start', index: openIndex, content_block: { type: 'thinking', thinking: '', signature: '' } });
      }
      if (ev.type === 'thinking') {
        let s = '';
        if (openKind !== 'thinking') {
          s += closeOpen();
          openIndex = nextIndex++;
          openKind = 'thinking';
          s += frame('content_block_start', { type: 'content_block_start', index: openIndex, content_block: { type: 'thinking', thinking: '', signature: '' } });
        }
        return s + frame('content_block_delta', { type: 'content_block_delta', index: openIndex, delta: { type: 'thinking_delta', thinking: ev.text } });
      }
      if (ev.type === 'thinking_signature') {
        if (openKind !== 'thinking') return ''; // a signature with no open thinking block has nowhere to land
        return frame('content_block_delta', { type: 'content_block_delta', index: openIndex, delta: { type: 'signature_delta', signature: ev.signature } }) + closeOpen();
      }
      // redacted_thinking arrives whole — one start frame carrying the opaque data, closed immediately.
      if (ev.type === 'redacted_thinking') {
        let s = closeOpen();
        const idx = nextIndex++;
        s += frame('content_block_start', { type: 'content_block_start', index: idx, content_block: { type: 'redacted_thinking', data: ev.data } });
        return s + frame('content_block_stop', { type: 'content_block_stop', index: idx });
      }
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

// ----------------------------- Outbound: Wisp stream -> non-streaming Messages reply ----------------------------- //

// One block of a non-streaming reply: assembled text, or a completed tool_use whose args are parsed back to
// an object (the streaming path streams args as a raw partial_json string; the buffered object wants input).
type AntReplyBlock =
  | AntTextBlock
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string };

// The non-streaming /v1/messages reply — the JSON Messages object Claude Code parses when it did NOT ask to
// stream. Its `/model` validation probe is exactly this: a stream:false request whose body it reads
// usage.input_tokens off — so a missing usage (or an SSE stream in its place) crashes model selection.
export type AnthropicMessageResponse = {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: AntReplyBlock[];
  stop_reason: 'end_turn' | 'tool_use';
  stop_sequence: null;
  usage: { input_tokens: number; output_tokens: number };
};

// Reduce a whole ordered Wisp stream to one non-streaming Messages object — the buffered counterpart of
// buildAnthropicSse. Consecutive text events merge into one text block (Anthropic groups them); each tool
// call is its own tool_use block with argsJson parsed to an object (bad/partial JSON → {}). stop_reason is
// tool_use when any tool ran, else end_turn — mirroring the encoder's finish().
export const buildAnthropicMessageResponse = (events: BridgeStreamEvent[], meta: AnthropicSseMeta): AnthropicMessageResponse => {
  const content: AntReplyBlock[] = [];
  let sawTool = false;
  for (const ev of events) {
    if (ev.type === 'text') {
      const last = content[content.length - 1];
      if (last && last.type === 'text') last.text += ev.text;
      else content.push({ type: 'text', text: ev.text });
    } else if (ev.type === 'thinking_start') {
      // A start always begins a fresh block — the OAuth wire's empty thinking blocks arrive as a bare
      // start + signature, so the block must exist before (or without) any thinking delta.
      content.push({ type: 'thinking', thinking: '', signature: '' });
    } else if (ev.type === 'thinking') {
      // Thinking deltas merge into the open (unsigned) thinking block; a signed block is closed, so the
      // next delta starts a new one — the buffered mirror of the encoder's per-block-signature rule.
      const last = content[content.length - 1];
      if (last && last.type === 'thinking' && !last.signature) last.thinking += ev.text;
      else content.push({ type: 'thinking', thinking: ev.text, signature: '' });
    } else if (ev.type === 'thinking_signature') {
      const last = content[content.length - 1];
      if (last && last.type === 'thinking') last.signature = ev.signature;
    } else if (ev.type === 'redacted_thinking') {
      content.push({ type: 'redacted_thinking', data: ev.data });
    } else {
      sawTool = true;
      let input: unknown = {};
      try { input = ev.call.argsJson ? JSON.parse(ev.call.argsJson) : {}; } catch { input = {}; }
      content.push({ type: 'tool_use', id: ev.call.id, name: ev.call.name, input });
    }
  }
  return {
    id: meta.id, type: 'message', role: 'assistant', model: meta.model,
    content, stop_reason: sawTool ? 'tool_use' : 'end_turn', stop_sequence: null,
    // Wisp doesn't meter tokens — zeroed, same as the streaming frames report. The field must exist and be
    // numeric: Claude Code's /model validation reads usage.input_tokens, and a missing usage is the crash.
    usage: { input_tokens: 0, output_tokens: 0 },
  };
};

// An Anthropic `error` SSE frame. When a backend fails AFTER the SSE head is out there is no HTTP status left
// to set, so the door writes this instead of silently truncating the stream — Claude Code then surfaces the
// real message rather than reporting an "empty or malformed" response.
export const anthropicErrorFrame = (message: string): string =>
  frame('error', { type: 'error', error: { type: 'api_error', message } });

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
// Provider label rides as display_name. Routing-map Aliases (#52) follow, same prefix — the inbound parse
// strips it back to the raw alias, so a picked entry round-trips to the alias route; their display_name
// carries the pinned model when one is passed ('sol — gpt-5', matching the Provider rows), bare otherwise
// — the caller decides via the wisp.bridge.aliasPickerShowsModel preference. Family routes stay unlisted.
// first_id/last_id bound the page, null when empty.
export const buildAnthropicModelsList = (infos: ChatModelInfo[], aliases: { name: string; model?: string }[] = [], aliasOnly = false): AntModelsList => {
  // Alias-only (#81) hides the Provider rows — but with zero Aliases that would serve Claude Code
  // an empty picker, so the Provider rows come back. The decision lives here, not at call sites.
  const providerRows = aliasOnly && aliases.length > 0 ? [] : infos;
  const data: AntModel[] = [
    ...providerRows.map((info) => ({ id: info.id, name: info.name })),
    ...aliases.map((a) => ({ id: a.name, name: a.model ? `${a.name} — ${a.model}` : a.name })),
  ].map((m) => ({
    type: 'model' as const, id: `claude-wisp-${m.id}`, display_name: m.name, created_at: FIXED_CREATED_AT,
  }));
  return {
    data,
    has_more: false,
    first_id: data[0]?.id ?? null,
    last_id: data[data.length - 1]?.id ?? null,
  };
};

// ----------------------------- Setup snippets: the side-panel Claude Code section ----------------------------- //

// The three copy-paste setup variants the panel offers (slice #47): per-session shell lines (PowerShell and
// bash) and the persistent project-scoped .claude/settings.json env block. The global ~/.claude/settings.json
// form is deliberately absent — it has the highest precedence and would silently reroute every Claude Code
// session on the machine (PRD #43).
export type ClaudeCodeSnippets = { powershell: string; bash: string; settingsJson: string };

// Build all three variants from the live Bridge address + access secret. ANTHROPIC_BASE_URL is the bare
// origin (no /v1 — Claude Code appends /v1/messages itself); the discovery flag makes /model list the
// claude-wisp-* aliases. Env is read at Claude Code startup only, so every variant implies a fresh terminal.
export const buildClaudeCodeSnippets = (address: string, secret: string): ClaudeCodeSnippets => ({
  powershell: [
    `$env:ANTHROPIC_BASE_URL = "${address}"`,
    `$env:ANTHROPIC_API_KEY = "${secret}"`,
    `$env:CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = "1"`,
  ].join('\n'),
  bash: [
    `export ANTHROPIC_BASE_URL=${address}`,
    `export ANTHROPIC_API_KEY=${secret}`,
    `export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`,
  ].join('\n'),
  // JSON.stringify keeps the block valid even if the secret ever carries a quotable character.
  settingsJson: JSON.stringify(
    {
      env: {
        ANTHROPIC_BASE_URL: address,
        ANTHROPIC_API_KEY: secret,
        CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
      },
    },
    null,
    2,
  ),
});

// ----------------------------- Launcher env assembly: the claude-wisp bin ----------------------------- //

// What the `claude-wisp` launcher (#64) sets on the spawned `claude` child: the same env trio as the
// snippets above plus CLAUDE_BINARY, and the user's argv passed through verbatim. Pure so the whole
// launch contract is unit-testable; the bin itself only does IO (probe, spawn, exit mirror).
export type ClaudeLaunch = { env: Record<string, string>; args: string[] };

// The Bridge is loopback-only, so the address derives from the port alone. CLAUDE_BINARY tells
// session-respawning tools inside the child (e.g. relay loops) to re-launch the wrapper, not bare
// `claude` — overriding any inherited value is right: this session IS running under the wrapper.
// args is a copy — the bin mutating its spawn list must never reach back into process.argv.
export const buildClaudeLaunch = (port: number, secret: string, argv: string[]): ClaudeLaunch => ({
  env: {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    ANTHROPIC_API_KEY: secret,
    CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
    CLAUDE_BINARY: 'claude-wisp',
  },
  args: [...argv],
});

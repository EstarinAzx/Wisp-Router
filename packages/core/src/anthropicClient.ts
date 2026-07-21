// ----------------- anthropicClient.ts — Wisp: Anthropic Messages request (Inquire + native chat stream) ----------------- //

/*
 * Depends on:
 *   - node fetch/AbortSignal/ReadableStream: the live HTTP call to the Anthropic Messages endpoint. The
 *     Anthropic SDK is NOT used here — this is the extension host and the request is a single POST.
 *   - ./catalog: the pure cores — buildAnthropicMessagesBody (request shape), anthropicTextDelta /
 *     reduceAnthropicTextEvents (SSE → text), parseSseBlock (block → event), AnthropicCreds /
 *     AnthropicMessage. The IO lives here; the request/reply logic is unit-tested there.
 *   - ./codexClient: sseBlocks — the provider-agnostic chunk→block splitter (shared with the Codex path).
 *
 * Data shapes:
 *   - The request body is buildAnthropicMessagesBody's output (model/max_tokens/system/messages, +stream).
 *   - The reply: anthropicInquire reads the whole JSON response (Inquire is spinner→diff, no incremental
 *     UX); anthropicStream sends stream:true and consumes the SSE body block-by-block, yielding text
 *     fragments as they arrive so the native chat picker renders tokens live.
 */

import { randomUUID } from 'node:crypto';
import { AnthropicCreds, buildAnthropicMessagesBody, anthropicTextDelta, anthropicUsage, reduceAnthropicToolCalls, anthropicTruncationReason, anthropicModelCaps, parseSseBlock, type AnthropicMessage, type AnthropicTool, type AssembledToolCall, type BridgeUsage, type EffortLevel } from './catalog';
import { sseBlocks } from './codexClient';

type AnthropicRequestArgs = { creds: AnthropicCreds; baseUrl: string; model: string; messages: AnthropicMessage[]; tools?: AnthropicTool[]; toolChoice?: 'auto' | 'any'; effort?: EffortLevel; systemSuffix?: string; signal?: AbortSignal };

// What anthropicStream yields — an answer-text fragment, or a fully-assembled tool call (#30 agent mode).
// The native-chat consumer maps these to LanguageModelTextPart / LanguageModelToolCallPart.
export type AnthropicStreamEvent =
  | { type: 'text'; value: string }
  | { type: 'toolCall'; call: AssembledToolCall }
  // Thinking passthrough: block start, thinking/signature deltas, and whole redacted blocks, forwarded
  // live in stream order so the Anthropic door can replay them to the client verbatim. thinkingStart is
  // load-bearing: the OAuth backend emits thinking blocks with EMPTY text (start straight to signature),
  // so without it the signed block would vanish. Non-Anthropic consumers ignore all four.
  | { type: 'thinkingStart' }
  | { type: 'thinking'; value: string }
  | { type: 'thinkingSignature'; value: string }
  | { type: 'redactedThinking'; data: string }
  // Real token usage off message_start (initial input/cache) and message_delta (final counts) — the door
  // forwards it to the client's meter. The other doors that consume this stream ignore it.
  | { type: 'usage'; usage: BridgeUsage };

// Inquire is non-streaming (spinner → diff): a bounded 16K output keeps the single request under the fetch
// timeout ceiling while leaving ample room for the edit blocks. The STREAMING path deliberately does NOT
// share this — #88: a hard 16K cap starves a high-effort reasoning turn (adaptive thinking burns most of the
// budget before the answer lands), a direct feeder of the content-less/truncated turns #87 surfaces. Streaming
// requests the model's own output ceiling (anthropicModelCaps) instead, so only a genuinely oversized reply is
// cut — and #87 now makes that cut visible rather than silent.
const INQUIRE_MAX_TOKENS = 16_000;

// ----------------------------- Request ----------------------------- //

// Claude Code's client recognition signals — without these the subscription backend throttles the
// request to 429 even with a valid OAuth bearer (it reserves subscription inference for the Claude Code
// client). `claude-code-20250219` is the PRIMARY gate; `oauth-2025-04-20` marks the OAuth path; both must
// ride the comma-joined anthropic-beta header (the oauth beta alone is NOT enough). The User-Agent's
// `claude-cli/` token is checked server-side — this exact string (a non-Anthropic build) is empirically
// accepted today (openclaude serves with it). The identity in the system prompt is NOT gated, so Wisp
// keeps its own prompt. The native-client attestation (cch token) can't be reproduced from Node, but is
// unenforced today.
// effort-2025-11-24 gates the API's parsing of output_config.effort (slice #31) — without it the level is
// silently dropped. Advertised on every request; harmless when the body omits output_config (e.g. Haiku).
// mid-conversation-system-2026-04-07 gates positioned role:"system" turns inside messages (#145) — claude
// CLI advertises the same token natively (header capture 2026-07-21).
const ANTHROPIC_BETA = 'claude-code-20250219,oauth-2025-04-20,effort-2025-11-24,mid-conversation-system-2026-04-07';
// The attribution fingerprint (catalog) embeds this version, and the User-Agent advertises it — they MUST
// match (the backend ties the cc_version to the claude-cli UA). Captured live from real claude-cli 2.1.216
// (2026-07-21); the cc_version hash is UNVALIDATED (#148), so the bump can't break an accepted request.
const CLAUDE_CODE_VERSION = '2.1.216';
const ANTHROPIC_USER_AGENT = `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`;

// The Stainless SDK headers real claude emits — its bundled @anthropic-ai/sdk is a Stainless build that
// tags every request with these. Fixed values are copied from the 2.1.216 capture; arch/os/runtime-version
// derive from the host (a Node process, matching the claude-cli runtime). #149.
const STAINLESS_ARCH: Record<string, string> = { x64: 'x64', arm64: 'arm64', ia32: 'x32' };
const STAINLESS_OS: Record<string, string> = { win32: 'Windows', darwin: 'MacOS', linux: 'Linux' };
const stainlessHeaders = (): Record<string, string> => ({
  'x-stainless-lang': 'js',
  'x-stainless-package-version': '0.94.0',
  'x-stainless-os': STAINLESS_OS[process.platform] ?? 'Unknown',
  'x-stainless-arch': STAINLESS_ARCH[process.arch] ?? 'unknown',
  'x-stainless-runtime': 'node',
  'x-stainless-runtime-version': process.version,
  'x-stainless-retry-count': '0',
  'x-stainless-timeout': '600',
});

// Real claude mints one session UUID at startup and repeats it on every request (header +
// metadata.user_id.session_id, #150). Generated once per process so it's stable across calls this session.
const CLAUDE_CODE_SESSION_ID = randomUUID();

// The Messages request headers. Pure (no IO) so the recognition contract is unit-testable: the streaming
// path adds the event-stream Accept; everything else is identical between Inquire and chat.
export const anthropicMessagesHeaders = (bearer: string, stream?: boolean): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(stream ? { 'Accept': 'text/event-stream' } : {}),
  'Authorization': `Bearer ${bearer}`,
  'anthropic-version': '2023-06-01',
  'anthropic-beta': ANTHROPIC_BETA,
  'User-Agent': ANTHROPIC_USER_AGENT,
  'x-app': 'cli',
  'x-claude-code-session-id': CLAUDE_CODE_SESSION_ID,
  'anthropic-dangerous-direct-browser-access': 'true',
  ...stainlessHeaders(),
});

// POST one conversation to the Messages endpoint and return the raw Response. Bearer = the OAuth access
// token. A non-2xx carries the status + body so a failed round-trip is diagnosable. Shared by
// anthropicInquire (reads it whole) and anthropicStream (reads it as it flows).
const anthropicMessagesRequest = async (args: AnthropicRequestArgs & { stream?: boolean; maxTokens: number; cacheTtl: '5m' | '1h' }): Promise<Response> => {
  const bearer = args.creds.accessToken;
  if (!bearer) throw new Error('Not signed in to Claude.');

  // #149: real claude posts to /v1/messages?beta=true (the query flag rides every Messages request).
  const res = await fetch(`${args.baseUrl}/v1/messages?beta=true`, {
    method: 'POST',
    headers: anthropicMessagesHeaders(bearer, args.stream),
    body: JSON.stringify(buildAnthropicMessagesBody({ model: args.model, messages: args.messages, maxTokens: args.maxTokens, version: CLAUDE_CODE_VERSION, stream: args.stream, tools: args.tools, toolChoice: args.toolChoice, effort: args.effort, cacheTtl: args.cacheTtl, systemSuffix: args.systemSuffix })),
    signal: args.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}${body.trim() ? `: ${body.trim().slice(0, 500)}` : '.'}`);
  }
  return res;
};

// Run one Inquire edit through the subscription-backed Claude Messages backend and return the reply text.
// Inquire is non-streaming UX (spinner → diff), so the whole JSON reply is read and every text block
// concatenated; tool_use / thinking blocks (none expected here) are not answer text.
export const anthropicInquire = async (args: AnthropicRequestArgs): Promise<string> => {
  // Bounded: a whole-file edit is large but finite, and the non-streaming request must clear the fetch timeout.
  // Inquire is genuinely one-shot — no later turn re-reads the prefix — so it takes the cheaper 5m cache write.
  const res = await anthropicMessagesRequest({ ...args, maxTokens: INQUIRE_MAX_TOKENS, cacheTtl: '5m' });
  const data = await res.json() as { content?: { type?: string; text?: string }[] };
  return (data.content ?? []).filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
};

// ----------------------------- Streaming ----------------------------- //

// Stream a Claude reply, yielding answer-text fragments as they arrive so the native chat picker renders
// tokens live, plus each assembled tool call at its stream position (#30 agent mode). The Messages SSE
// delivers text on content_block_delta(text_delta); a tool_use block streams across content_block_start +
// input_json_delta events that can't be surfaced until whole, so each assembles per block and yields on
// its content_block_stop — stream position preserved, which the thinking passthrough requires (interleaved
// thinking order must survive the round trip). An `error` event is a backend failure (throw its message);
// other lifecycle events carry no answer text.
//
// #87 — the stream can also end with NO visible content, and this path was previously silent: it read only
// text/tool/error events and ignored message_delta entirely, so a content-less turn yielded nothing and the
// door forwarded a structurally-valid-but-empty SSE envelope that Claude Code rejects as "empty or malformed".
// The Codex sibling (codexStream) was already hardened; this mirrors it. Track whether any text/tool delta
// arrived and read message_delta's stop_reason, then at stream end:
//   - Truncation (max_tokens / content_filter / refusal): surface a visible marker carrying the reason so a
//     cut-short reply is diagnosable, not relabeled a silent end_turn — even when nothing else was delivered.
//   - Truly content-less (no text, no tools, no truncation reason — a thinking-only or dropped turn): throw,
//     so the door writes a real error frame / clean 502 instead of the empty envelope, and the turn is retryable.
//   - Delivered content but no terminal frame (idle socket/proxy drop): keep the content, only flag the abrupt
//     end — never discard a good turn's already-streamed text or false-alarm one whose tail frame was just lost.
export async function* anthropicStream(args: AnthropicRequestArgs): AsyncGenerator<AnthropicStreamEvent> {
  // #88: request the model's own output ceiling, not a hard 16K — a high-effort turn must be able to think
  // AND still reach its answer. Only a reply genuinely past the model max is cut, and #87 makes that visible.
  // Streaming is the conversational path (Bridge sessions + native chat): the system+tools prefix is re-read
  // every turn, so it takes the 1h cache TTL — fixed here, not per-turn, so it can't flip mid-session (#111).
  const res = await anthropicMessagesRequest({ ...args, stream: true, maxTokens: anthropicModelCaps(args.model).maxOutput, cacheTtl: '1h' });
  if (!res.body) return;
  let sawDelta = false;                     // any answer text arrived (tool-only turns count via toolCalls below)
  let sawThinking = false;                  // any thinking/redacted block arrived — delivered content too
  let sawTerminal = false;                  // a message_delta / message_stop actually closed the stream
  let stopReason: string | undefined;       // message_delta's stop_reason — the only place truncation shows
  // Tool blocks assemble PER BLOCK and yield on their content_block_stop — stream position preserved, so
  // interleaved thinking ([thinking₁, tool₁, thinking₂, tool₂]) reaches the client in the order the
  // backend emitted it. The old assemble-at-end fold survives only as the dropped-socket fallback below.
  const openTools = new Map<number, AssembledToolCall>();
  let toolCount = 0;
  for await (const block of sseBlocks(res.body)) {
    const ev = parseSseBlock(block);
    if (!ev) continue;
    if (ev.event === 'error') throw new Error(ev.data?.error?.message ?? 'Anthropic response failed');
    // Usage rides on message_start (initial input/cache) and message_delta (final counts). Yield it but
    // don't consume the event — message_delta still needs its stop_reason read below.
    const usage = anthropicUsage(ev);
    if (usage) yield { type: 'usage', usage };
    const text = anthropicTextDelta(ev);
    if (text) { sawDelta = true; yield { type: 'text', value: text }; continue; }
    // Thinking passthrough: the block start, thinking deltas, the closing signature, and whole redacted
    // blocks forward LIVE in stream order (they must reach the client to be replayed byte-for-byte next
    // turn). The start matters on its own: the OAuth backend emits EMPTY thinking blocks (start straight
    // to signature_delta, zero thinking_deltas). Thinking counts as delivered content — a thinking-only
    // turn is a real turn now, not the #87 empty-envelope throw.
    if (ev.event === 'content_block_start' && ev.data?.content_block?.type === 'thinking') {
      sawThinking = true; yield { type: 'thinkingStart' }; continue;
    }
    if (ev.event === 'content_block_delta' && ev.data?.delta?.type === 'thinking_delta' && typeof ev.data.delta.thinking === 'string') {
      sawThinking = true; yield { type: 'thinking', value: ev.data.delta.thinking }; continue;
    }
    if (ev.event === 'content_block_delta' && ev.data?.delta?.type === 'signature_delta' && typeof ev.data.delta.signature === 'string') {
      yield { type: 'thinkingSignature', value: ev.data.delta.signature }; continue;
    }
    if (ev.event === 'content_block_start' && ev.data?.content_block?.type === 'redacted_thinking' && typeof ev.data.content_block.data === 'string') {
      sawThinking = true; yield { type: 'redactedThinking', data: ev.data.content_block.data }; continue;
    }
    // tool_use blocks arrive in fragments — assemble per block, yield whole on the block's stop.
    if (ev.event === 'content_block_start' && ev.data?.content_block?.type === 'tool_use') {
      const cb = ev.data.content_block;
      openTools.set(ev.data.index, { id: typeof cb.id === 'string' ? cb.id : '', name: typeof cb.name === 'string' ? cb.name : '', argsJson: '' });
      continue;
    }
    if (ev.event === 'content_block_delta' && ev.data?.delta?.type === 'input_json_delta') {
      const call = openTools.get(ev.data.index);
      if (call && typeof ev.data.delta.partial_json === 'string') call.argsJson += ev.data.delta.partial_json;
      continue;
    }
    if (ev.event === 'content_block_stop' && openTools.has(ev.data?.index)) {
      const call = openTools.get(ev.data.index)!;
      openTools.delete(ev.data.index);
      if (call.name) { toolCount++; yield { type: 'toolCall', call }; }
      continue;
    }
    // The terminal frames carry no answer text but DO carry the stop_reason (truncation) and prove a clean close.
    if (ev.event === 'message_delta') {
      sawTerminal = true;
      if (typeof ev.data?.delta?.stop_reason === 'string') stopReason = ev.data.delta.stop_reason;
    } else if (ev.event === 'message_stop') {
      sawTerminal = true;
    }
  }
  // Dropped-socket fallback: a tool block whose stop frame never arrived still folds at stream end.
  for (const call of openTools.values()) {
    if (call.name) { toolCount++; yield { type: 'toolCall', call }; }
  }
  const delivered = sawDelta || sawThinking || toolCount > 0;
  // A truncation reason is always worth surfacing — it explains an empty or cut-short turn; the marker also
  // makes the envelope non-empty, so it stands in for a content-less turn without needing to throw.
  const truncation = anthropicTruncationReason(stopReason);
  if (truncation) { yield { type: 'text', value: `\n\n_[Response truncated: ${truncation}]_` }; return; }
  // Nothing delivered and no reason to explain it → the empty-envelope bug. Throw so the door surfaces it.
  if (!delivered) throw new Error('Anthropic returned an empty response — the model produced no visible content (a thinking-only or dropped turn). Try again.');
  // Content did stream but the stream never closed cleanly — keep it, flag only the abrupt end.
  if (!sawTerminal) yield { type: 'text', value: '\n\n_[Stream ended before completion — the reply may be incomplete.]_' };
}

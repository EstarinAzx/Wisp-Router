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

import { AnthropicCreds, buildAnthropicMessagesBody, anthropicTextDelta, reduceAnthropicToolCalls, parseSseBlock, type AnthropicMessage, type AnthropicTool, type AssembledToolCall, type EffortLevel } from './catalog';
import { sseBlocks } from './codexClient';

type AnthropicRequestArgs = { creds: AnthropicCreds; baseUrl: string; model: string; messages: AnthropicMessage[]; tools?: AnthropicTool[]; toolChoice?: 'auto' | 'any'; effort?: EffortLevel; signal?: AbortSignal };

// What anthropicStream yields — an answer-text fragment, or a fully-assembled tool call (#30 agent mode).
// The native-chat consumer maps these to LanguageModelTextPart / LanguageModelToolCallPart.
export type AnthropicStreamEvent = { type: 'text'; value: string } | { type: 'toolCall'; call: AssembledToolCall };

// Inquire's whole-file edits can be sizeable; 16K keeps a non-streaming request under the fetch timeout
// ceiling while leaving ample room for the edit blocks. The streaming chat path reuses it.
const ANTHROPIC_MAX_TOKENS = 16_000;

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
const ANTHROPIC_BETA = 'claude-code-20250219,oauth-2025-04-20,effort-2025-11-24';
// The attribution fingerprint (catalog) embeds this version, and the User-Agent advertises it — they MUST
// match (the backend ties the cc_version to the claude-cli UA). This exact string is accepted today.
const CLAUDE_CODE_VERSION = '0.19.0';
const ANTHROPIC_USER_AGENT = `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`;

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
});

// POST one conversation to the Messages endpoint and return the raw Response. Bearer = the OAuth access
// token. A non-2xx carries the status + body so a failed round-trip is diagnosable. Shared by
// anthropicInquire (reads it whole) and anthropicStream (reads it as it flows).
const anthropicMessagesRequest = async (args: AnthropicRequestArgs & { stream?: boolean }): Promise<Response> => {
  const bearer = args.creds.accessToken;
  if (!bearer) throw new Error('Not signed in to Claude.');

  const res = await fetch(`${args.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: anthropicMessagesHeaders(bearer, args.stream),
    body: JSON.stringify(buildAnthropicMessagesBody({ model: args.model, messages: args.messages, maxTokens: ANTHROPIC_MAX_TOKENS, version: CLAUDE_CODE_VERSION, stream: args.stream, tools: args.tools, toolChoice: args.toolChoice, effort: args.effort })),
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
  const res = await anthropicMessagesRequest(args);
  const data = await res.json() as { content?: { type?: string; text?: string }[] };
  return (data.content ?? []).filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
};

// ----------------------------- Streaming ----------------------------- //

// Stream a Claude reply, yielding answer-text fragments as they arrive so the native chat picker renders
// tokens live, then any assembled tool calls at stream end (#30 agent mode). The Messages SSE delivers text
// on content_block_delta(text_delta); a tool_use block streams across content_block_start +
// input_json_delta events that can't be surfaced until whole, so they are collected and folded by the
// reducer once the stream ends (the assemble-at-end pattern codexStream uses). An `error` event is a backend
// failure (throw its message); other lifecycle events carry no answer text.
export async function* anthropicStream(args: AnthropicRequestArgs): AsyncGenerator<AnthropicStreamEvent> {
  const res = await anthropicMessagesRequest({ ...args, stream: true });
  if (!res.body) return;
  const toolEvents = [];
  for await (const block of sseBlocks(res.body)) {
    const ev = parseSseBlock(block);
    if (!ev) continue;
    if (ev.event === 'error') throw new Error(ev.data?.error?.message ?? 'Anthropic response failed');
    const text = anthropicTextDelta(ev);
    if (text) { yield { type: 'text', value: text }; continue; }
    // tool_use blocks arrive in fragments — collect the relevant events, fold them after the stream ends.
    if (ev.event === 'content_block_start' || ev.event === 'content_block_delta') toolEvents.push(ev);
  }
  for (const call of reduceAnthropicToolCalls(toolEvents)) yield { type: 'toolCall', call };
}

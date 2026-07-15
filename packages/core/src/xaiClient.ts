// ----------------- xaiClient.ts — Wisp: Grok (xAI) Responses request + SSE→text/tool calls ----------------- //

/*
 * Depends on:
 *   - node fetch/AbortSignal/ReadableStream: the live HTTP call to the Grok Responses endpoint. Grok speaks
 *     the OpenAI *Responses* API (events, not chat completions) — the Codex twin, not the OpenAI-chat path.
 *   - ./catalog: the pure cores — buildCodexResponsesBody (Grok reuses it, same Responses shape),
 *     xaiReasoning (per-model reasoning gate), xaiResponsesUrl / xaiRequestHeaders (model→endpoint routing +
 *     x-grok-* headers), rewriteXaiResponsesPayload (xAI payload sanitizer), and the shared Responses SSE
 *     reducers (parseSseBlock / reduceResponsesTextEvents / reduceResponsesToolCalls / extractResponsesText /
 *     responsesIncompleteReason). The IO lives here; the logic is unit-tested there.
 *   - ./codexClient: sseBlocks (the provider-agnostic byte-stream→SSE-block splitter) + the CodexStreamEvent
 *     shape (text fragment | assembled tool call) — Grok's stream yields the same events.
 *
 * Data shapes:
 *   - The request body is buildCodexResponsesBody's output, run through rewriteXaiResponsesPayload.
 *   - The response is an SSE stream of `event:`/`data:` blocks. xaiRequest reads the whole body (Inquire is
 *     spinner→diff, no incremental UX); xaiStream consumes it chunk-by-chunk and yields XaiStreamEvents.
 */

import {
  XaiCreds, buildCodexResponsesBody, xaiReasoning, xaiResponsesUrl, xaiRequestHeaders, rewriteXaiResponsesPayload,
  isGrokCliProxyModel, parseSseBlock, reduceResponsesTextEvents, reduceResponsesToolCalls, extractResponsesText,
  responsesIncompleteReason, type EffortLevel, type CodexResponsesEvent, type CodexResponsesTool,
} from './catalog';
import { sseBlocks, type CodexStreamEvent } from './codexClient';

// A conversation message for the Grok backend — the same shape the Codex/Anthropic clients take, so dispatch
// stays uniform: user/assistant/system text, optional images, and (agent mode) tool calls + results.
type XaiMessage = { role: 'system' | 'user' | 'assistant'; content: string; images?: { mimeType: string; dataBase64: string }[]; toolCalls?: { id: string; name: string; argsJson: string }[]; toolResults?: { callId: string; content: string }[] };

type XaiRequestArgs = { creds: XaiCreds; baseUrl: string; model: string; messages: XaiMessage[]; effort?: EffortLevel; tools?: CodexResponsesTool[]; toolChoice?: 'auto' | 'required'; signal?: AbortSignal };

// What xaiStream yields — an answer-text fragment or a fully-assembled tool call. Aliased to the Codex
// stream event: Grok's Responses stream carries the identical events, so the consumer glue is shared.
export type XaiStreamEvent = CodexStreamEvent;

// ----------------------------- Request ----------------------------- //

// POST one conversation to the Grok Responses endpoint and return the raw streaming Response. Bearer = the
// OAuth access token; the URL + x-grok-* headers are model-routed (proxy for grok-build/composer, api.x.ai
// for grok-4.5). The body is our clean Responses body, run through rewriteXaiResponsesPayload for xAI safety.
// A non-2xx carries the status + body so a failed round-trip is diagnosable. Shared by xaiRequest + xaiStream.
const xaiResponsesRequest = async (args: XaiRequestArgs): Promise<Response> => {
  const bearer = args.creds.accessToken;
  if (!bearer) throw new Error('Not signed in to Grok.');

  const rawBody = buildCodexResponsesBody({
    model: args.model, messages: args.messages,
    reasoning: xaiReasoning(args.model, args.effort), tools: args.tools, toolChoice: args.toolChoice,
  });
  const body = rewriteXaiResponsesPayload(rawBody as unknown as Record<string, unknown>, { proxy: isGrokCliProxyModel(args.model) });

  const res = await fetch(xaiResponsesUrl(args.baseUrl, args.model), {
    method: 'POST',
    headers: xaiRequestHeaders(args.model, bearer, crypto.randomUUID()),
    body: JSON.stringify(body),
    signal: args.signal,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Grok API error ${res.status}${errBody.trim() ? `: ${errBody.trim().slice(0, 500)}` : '.'}`);
  }
  return res;
};

// Run one Inquire edit through the Grok backend and return the model's full reply text. The whole SSE body is
// read before parsing — Inquire is non-streaming UX (spinner → diff) — using the same parseSseBlock the
// streaming path splits block by block.
export const xaiRequest = async (args: XaiRequestArgs): Promise<string> => {
  const res = await xaiResponsesRequest(args);
  const events = (await res.text())
    .split('\n\n')
    .map(parseSseBlock)
    .filter((e): e is CodexResponsesEvent => e !== undefined);
  return reduceResponsesTextEvents(events);
};

// ----------------------------- Streaming ----------------------------- //

// Stream a Grok reply, yielding answer-text fragments as they arrive and, once the stream ends, any tool
// calls the model made — the exact Responses state machine codexStream runs (Grok shares the wire). A
// response.failed is a backend error (throw). If only a terminal frame carried text (no deltas), emit it once
// so the answer is never dropped. A truncation surfaces incomplete_details.reason as a visible marker. A
// stream that ends with NOTHING delivered throws (retryable); one that delivered partial content keeps it and
// only flags the abrupt end.
export async function* xaiStream(args: XaiRequestArgs): AsyncGenerator<XaiStreamEvent> {
  const res = await xaiResponsesRequest(args);
  if (!res.body) return;
  let sawDelta = false;
  let sawTerminal = false;
  let completed = '';
  let incompleteReason: string | undefined;
  let streamError: string | undefined;
  const toolEvents: CodexResponsesEvent[] = [];
  for await (const block of sseBlocks(res.body)) {
    const ev = parseSseBlock(block);
    if (!ev) continue;
    if (ev.event === 'response.failed') {
      throw new Error(ev.data?.response?.error?.message ?? ev.data?.error?.message ?? 'Grok response failed');
    }
    if (ev.event === 'response.output_text.delta') {
      if (typeof ev.data?.delta === 'string') { sawDelta = true; yield { type: 'text', value: ev.data.delta }; }
    } else if (ev.event === 'response.output_item.added' || ev.event === 'response.function_call_arguments.delta') {
      toolEvents.push(ev);
    } else if (ev.event === 'response.completed' || ev.event === 'response.incomplete') {
      sawTerminal = true;
      const text = extractResponsesText(ev.data?.response);
      if (text) completed = text;
      incompleteReason = responsesIncompleteReason(ev.data?.response) ?? incompleteReason;
    } else if (ev.event === 'error') {
      streamError = ev.data?.message ?? ev.data?.error?.message ?? streamError;
    }
  }
  if (!sawDelta && completed) yield { type: 'text', value: completed };
  if (incompleteReason) yield { type: 'text', value: `\n\n_[Response truncated: ${incompleteReason}]_` };
  const toolCalls = reduceResponsesToolCalls(toolEvents);
  for (const call of toolCalls) yield { type: 'toolCall', call };
  if (!sawTerminal) {
    if (!sawDelta && !completed && toolCalls.length === 0) {
      throw new Error(streamError ?? 'Grok stream ended before completion — the connection dropped or timed out before any reply. Try again.');
    }
    yield { type: 'text', value: '\n\n_[Stream ended before completion — the reply may be incomplete.]_' };
  }
}

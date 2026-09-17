import type { BridgeChatRequest } from './bridge';
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
  responsesIncompleteReason, responsesUsage, type EffortLevel, type CodexResponsesEvent, type CodexResponsesTool,
} from './catalog';
import { sseBlocks, type CodexStreamEvent } from './codexClient';
import { DesktopUpstreamError } from './desktopUpstream';

// A conversation message for the Grok backend — the same shape the Codex/Anthropic clients take, so dispatch
// stays uniform: user/assistant/system text, optional images, and (agent mode) tool calls + results.
type XaiMessage = { role: 'system' | 'user' | 'assistant'; content: string; images?: { mimeType: string; dataBase64: string }[]; toolCalls?: { id: string; name: string; argsJson: string }[]; toolResults?: { callId: string; content: string }[] };

type XaiRequestArgs = { rejectRedirects?: boolean; responses?: BridgeChatRequest['responses']; creds: XaiCreds; baseUrl: string; model: string; messages: XaiMessage[]; effort?: EffortLevel; tools?: CodexResponsesTool[]; toolChoice?: 'auto' | 'required'; signal?: AbortSignal };

// What xaiStream yields — an answer-text fragment or a fully-assembled tool call. Aliased to the Codex
// stream event: Grok's Responses stream carries the identical events, so the consumer glue is shared.
export type XaiStreamEvent = CodexStreamEvent;

// Grok cannot compile nested root unions. Nest only those tool schemas, keeping native
// tool names/arguments unchanged outside this wire. Visit schema positions, not enum/default data.
const wrapXaiTool = (tool: CodexResponsesTool): CodexResponsesTool => {
  const schema = tool.parameters;
  if (schema.type !== 'object' || ![schema.oneOf, schema.anyOf].some(Array.isArray)) return tool;
  let preserveOriginal = false;
  const visit = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const node = { ...value } as Record<string, unknown>;
    if (['$id', 'id', '$dynamicRef', '$recursiveRef', 'unevaluatedProperties'].some(key => key in node)) preserveOriginal = true;
    if (typeof node.$ref === 'string' && node.$ref.startsWith('#')) {
      try {
        const fragment = decodeURIComponent(node.$ref.slice(1));
        if (!fragment || fragment.startsWith('/')) node.$ref = '#/properties/arguments' + node.$ref.slice(1);
      } catch { preserveOriginal = true; }
    }
    for (const key of ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas', 'dependencies']) {
      const map = node[key];
      if (map && typeof map === 'object' && !Array.isArray(map)) node[key] = Object.fromEntries(Object.entries(map).map(([name, child]) => [name, visit(child)]));
    }
    for (const key of ['oneOf', 'anyOf', 'allOf', 'prefixItems']) if (Array.isArray(node[key])) node[key] = node[key].map(visit);
    for (const key of ['items', 'additionalItems', 'additionalProperties', 'unevaluatedProperties', 'unevaluatedItems', 'contains', 'propertyNames', 'contentSchema', 'not', 'if', 'then', 'else']) if (key in node) node[key] = Array.isArray(node[key]) ? node[key].map(visit) : visit(node[key]);
    // JSON Schema defaults to open objects; Grok defaults to closed ones, even with strict:false.
    if (node.additionalProperties === undefined && (node.type === 'object' || (Array.isArray(node.type) && node.type.includes('object')) || node.properties !== undefined)) node.additionalProperties = true;
    return node;
  };
  const inner = visit(schema) as Record<string, unknown>;
  if (preserveOriginal) return tool; // Scoped refs/evaluation annotations need a separate translation.
  delete inner.$schema;
  return { ...tool, parameters: { ...(schema.$schema ? { $schema: schema.$schema } : {}), type: 'object', properties: { arguments: inner }, required: ['arguments'], additionalProperties: false } };
};

// ----------------------------- Request ----------------------------- //

// POST one conversation to the Grok Responses endpoint and return the raw streaming Response. Bearer = the
// OAuth access token; the URL + x-grok-* headers are model-routed (proxy for grok-build/composer, api.x.ai
// for grok-4.5). The body is our clean Responses body, run through rewriteXaiResponsesPayload for xAI safety.
// A non-2xx carries the status + body so a failed round-trip is diagnosable. Shared by xaiRequest + xaiStream.
const xaiResponsesRequest = async (args: XaiRequestArgs): Promise<{ res: Response; wrapped: Set<string> }> => {
  const bearer = args.creds.accessToken;
  if (!bearer) throw new Error('Not signed in to Grok.');

  const tools = args.tools?.map(wrapXaiTool);
  const wrapped = new Set(tools?.filter((tool, index) => tool !== args.tools![index]).map(tool => tool.name));
  const rawBody = buildCodexResponsesBody({
    model: args.model, messages: args.messages, preserveSystemMessages: !!args.responses,
    reasoning: xaiReasoning(args.model, args.effort), tools, toolChoice: args.toolChoice, parallelToolCalls: args.responses?.parallelToolCalls, verbosity: args.responses?.verbosity,
  });
  for (const item of rawBody.input) if (item.type === 'function_call' && wrapped.has(item.name)) {
    try { item.arguments = JSON.stringify({ arguments: JSON.parse(item.arguments) }); }
    catch { throw new Error('Invalid Grok tool call history'); }
  }
  const body = rewriteXaiResponsesPayload(rawBody as unknown as Record<string, unknown>, { proxy: isGrokCliProxyModel(args.model) });

  const res = await fetch(xaiResponsesUrl(args.baseUrl, args.model), {
    method: 'POST',
    ...(args.rejectRedirects ? { redirect: 'error' as const } : {}),
    headers: xaiRequestHeaders(args.model, bearer, crypto.randomUUID()),
    body: JSON.stringify(body),
    signal: args.signal,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    if (args.rejectRedirects) throw DesktopUpstreamError.fromResponse(res, errBody);
    throw new Error(`Grok API error ${res.status}${errBody.trim() ? `: ${errBody.trim().slice(0, 500)}` : '.'}`);
  }
  return { res, wrapped };
};

// Run one Inquire edit through the Grok backend and return the model's full reply text. The whole SSE body is
// read before parsing — Inquire is non-streaming UX (spinner → diff) — using the same parseSseBlock the
// streaming path splits block by block.
export const xaiRequest = async (args: XaiRequestArgs): Promise<string> => {
  const { res } = await xaiResponsesRequest(args);
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
  const { res, wrapped } = await xaiResponsesRequest(args);
  if (!res.body) return;
  let sawDelta = false;
  let sawTerminal = false;
  let completed = '';
  let incompleteReason: string | undefined;
  let streamError: string | undefined;
  const toolEvents: CodexResponsesEvent[] = [];
  let streamedText = '';
  for await (const block of sseBlocks(res.body)) {
    const ev = parseSseBlock(block);
    if (!ev) continue;
    if (ev.event === 'response.failed') {
      if (args.rejectRedirects) throw new DesktopUpstreamError(undefined, 'stream_failed');
      throw new Error(ev.data?.response?.error?.message ?? ev.data?.error?.message ?? 'Grok response failed');
    }
    if (ev.event === 'response.output_text.delta') {
      if (typeof ev.data?.delta === 'string') { sawDelta = true; streamedText += ev.data.delta; yield { type: 'text', value: ev.data.delta }; }
    } else if (ev.event === 'response.output_item.added' || ev.event === 'response.function_call_arguments.delta' || (args.responses && ev.event === 'response.output_item.done')) {
      toolEvents.push(ev);
    } else if (ev.event === 'response.completed' || ev.event === 'response.incomplete') {
      sawTerminal = true;
      if (args.responses) {
        if (ev.event === 'response.incomplete') incompleteReason = 'max_output_tokens';
        for (const item of ev.data?.response?.output ?? []) {
          if (item.type === 'function_call') toolEvents.push({ event: 'response.output_item.done', data: { item } });
        }
      }
      const text = extractResponsesText(ev.data?.response);
      if (text) completed = text;
      incompleteReason = responsesIncompleteReason(ev.data?.response) ?? incompleteReason;
      // #165: same wire, same mapping function as Codex — see responsesUsage for why no usage means no event.
      const usage = responsesUsage(ev.data?.response, !!args.responses);
      if (usage) yield { type: 'usage', usage };
    } else if (ev.event === 'error') {
      streamError = ev.data?.message ?? ev.data?.error?.message ?? streamError;
    }
  }
  if (args.responses && completed) {
    if (!completed.startsWith(streamedText)) throw args.rejectRedirects ? new DesktopUpstreamError(undefined, 'stream_invalid') : new Error('Provider terminal text disagrees with streamed text');
    if (completed.length > streamedText.length) yield { type: 'text', value: completed.slice(streamedText.length) };
  } else if (!sawDelta && completed) yield { type: 'text', value: completed };
  if (args.responses && (streamError || !sawTerminal)) throw args.rejectRedirects ? new DesktopUpstreamError(undefined, streamError ? 'stream_failed' : 'stream_incomplete') : new Error(streamError ?? 'Provider stream ended before completion');
  if (args.responses && incompleteReason) yield { type: 'truncation', reason: incompleteReason === 'content_filter' ? 'content_filter' : 'max_tokens' };
  if (!args.responses && incompleteReason) yield { type: 'text', value: `\n\n_[Response truncated: ${incompleteReason}]_` };
  const toolCalls = reduceResponsesToolCalls(toolEvents);
  for (const call of toolCalls) {
    if (wrapped.has(call.name)) {
      try {
        const envelope = JSON.parse(call.argsJson);
        if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || Object.keys(envelope).length !== 1 || !envelope.arguments || typeof envelope.arguments !== 'object' || Array.isArray(envelope.arguments)) throw new Error();
        call.argsJson = JSON.stringify(envelope.arguments);
      } catch { throw new DesktopUpstreamError(undefined, 'stream_invalid'); }
    }
    yield { type: 'toolCall', call };
  }
  if (!sawTerminal) {
    if (!sawDelta && !completed && toolCalls.length === 0) {
      throw new Error(streamError ?? 'Grok stream ended before completion — the connection dropped or timed out before any reply. Try again.');
    }
    yield { type: 'text', value: '\n\n_[Stream ended before completion — the reply may be incomplete.]_' };
  }
}

// ----------------- codexClient.ts — Wisp: Codex Responses request + SSE→text/tool calls ----------------- //

/*
 * Depends on:
 *   - node fetch/AbortSignal/ReadableStream: the live HTTP call to the Codex Responses endpoint. The
 *     OpenAI SDK is NOT used here — Codex speaks the Responses API (events, not chat completions).
 *   - ./catalog: the pure cores — buildCodexResponsesBody (request shape), parseSseBlock (SSE block→event),
 *     reduceResponsesTextEvents / reduceResponsesToolCalls / extractResponsesText (events→text or tool
 *     calls), codexReasoning, CodexCreds. The IO lives here; the logic is unit-tested there.
 *
 * Data shapes:
 *   - The request body is buildCodexResponsesBody's output (model/instructions/input/store/stream + tools).
 *   - The response is an SSE stream of `event:`/`data:` blocks. codexInquire reads the whole body (Inquire
 *     is spinner→diff, no incremental UX); codexStream consumes the body chunk-by-chunk and yields
 *     CodexStreamEvents — text fragments as they arrive, then any assembled tool calls (the native chat
 *     picker streams text and agent mode invokes the tools).
 */

import { CodexCreds, buildCodexResponsesBody, codexReasoning, parseSseBlock, reduceResponsesTextEvents, reduceResponsesToolCalls, extractResponsesText, responsesIncompleteReason, type CodexEffort, type CodexResponsesEvent, type CodexResponsesTool, type AssembledToolCall } from './catalog';

// A conversation message for the Codex backend: Inquire sends system+user, native chat sends user/assistant
// — optionally with images and, in agent mode, the tool calls it made / the tool results it carries.
type CodexMessage = { role: 'system' | 'user' | 'assistant'; content: string; images?: { mimeType: string; dataBase64: string }[]; toolCalls?: { id: string; name: string; argsJson: string }[]; toolResults?: { callId: string; content: string }[] };

type CodexRequestArgs = { creds: CodexCreds; baseUrl: string; model: string; messages: CodexMessage[]; effort?: CodexEffort; tools?: CodexResponsesTool[]; toolChoice?: 'auto' | 'required'; signal?: AbortSignal };

// What codexStream yields: an answer-text fragment, or a fully-assembled tool call (emitted once the stream
// ends). The native-chat consumer maps these to LanguageModelTextPart / LanguageModelToolCallPart.
export type CodexStreamEvent = { type: 'text'; value: string } | { type: 'toolCall'; call: AssembledToolCall };

// ----------------------------- Request ----------------------------- //

// POST one conversation to the Codex Responses endpoint and return the raw streaming Response. Bearer =
// the OAuth access token (the subscription path against chatgpt.com/backend-api/codex); the exchanged
// apiKey is only a fallback. The CLI-identifying headers (account id, originator, OpenAI-Beta, session_id)
// mirror the Codex CLI so the backend accepts the request. A non-2xx carries the status + body so a failed
// round-trip is diagnosable. Shared by codexInquire (reads it whole) and codexStream (reads it as it flows).
const codexResponsesRequest = async (args: CodexRequestArgs): Promise<Response> => {
  const bearer = args.creds.accessToken || args.creds.apiKey;
  if (!bearer) throw new Error('Not signed in to Codex.');
  // The Codex backend requires the account id — fail early with an actionable message rather than send
  // a header-less request and get an opaque 401/403.
  if (!args.creds.accountId) throw new Error('Codex account id missing — sign out and sign in to Codex again.');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Authorization': `Bearer ${bearer}`,
    'chatgpt-account-id': args.creds.accountId,
    'OpenAI-Beta': 'responses=experimental',
    'originator': 'codex_cli_rs',
    'session_id': crypto.randomUUID(),
  };

  const res = await fetch(`${args.baseUrl}/responses`, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildCodexResponsesBody({ model: args.model, messages: args.messages, reasoning: codexReasoning(args.model, args.effort), tools: args.tools, toolChoice: args.toolChoice })),
    signal: args.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Codex API error ${res.status}${body.trim() ? `: ${body.trim().slice(0, 500)}` : '.'}`);
  }
  return res;
};

// Run one Inquire edit through the Codex backend and return the model's full reply text. The whole SSE
// body is read before parsing — Inquire is non-streaming UX (spinner → diff), so there is no need for
// incremental delivery here; the same parseSseBlock splits it that the streaming path uses block by block.
export const codexInquire = async (args: CodexRequestArgs): Promise<string> => {
  const res = await codexResponsesRequest(args);
  const events = (await res.text())
    .split('\n\n')
    .map(parseSseBlock)
    .filter((e): e is CodexResponsesEvent => e !== undefined);
  return reduceResponsesTextEvents(events);
};

// ----------------------------- Streaming ----------------------------- //

// Yield complete SSE blocks off a byte stream as they arrive: decode each chunk, split on the blank line
// that ends a block, hold the trailing partial in the buffer until the next chunk completes it, then flush
// whatever remains at end-of-stream. Provider-agnostic (block framing, not event names) — Codex's Responses
// stream and Anthropic's Messages stream both flow through it; anthropicClient reuses it.
export async function* sseBlocks(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? ''; // last element is the incomplete tail — carry it forward
      for (const block of blocks) yield block;
    }
    if (buffer.trim()) yield buffer; // a stream that ended without a trailing blank line
  } finally {
    reader.releaseLock();
  }
}

// Stream a Codex reply, yielding answer-text fragments as they arrive (so the native chat picker renders
// tokens live) and, once the stream ends, any tool calls the model made. response.failed is a backend error
// (throw its message). If no text deltas arrived — only a terminal response.completed/incomplete payload —
// emit that text once so the answer is never silently dropped. Function-call events stream interleaved with
// text but can't be emitted until whole (their arguments arrive as fragments), so they are collected and
// folded by reduceResponsesToolCalls at end — mirroring the chat-completions assemble-at-end pattern.
//
// The stream can also end BADLY, and both modes were previously silent (a truncated/blank turn that looked
// like a Wisp bug and couldn't be diagnosed):
//   - Backend truncation (response.incomplete / status incomplete): the deltas just stop; we surface a marker
//     carrying incomplete_details.reason so a max_output_tokens / content_filter cut is visible, not mystery.
//   - No terminal frame at all: a long HIGH-effort reasoning turn emits no text for a while, so an idle
//     socket/proxy drops the connection before response.completed. If NOTHING was delivered we throw (VS Code
//     shows and can retry a real failure); if some text/tool calls DID stream we keep them and only flag the
//     abrupt end — never discard delivered content or false-alarm a good turn whose tail frame was just lost.
export async function* codexStream(args: CodexRequestArgs): AsyncGenerator<CodexStreamEvent> {
  const res = await codexResponsesRequest(args);
  if (!res.body) return;
  let sawDelta = false;
  let sawTerminal = false;                    // a response.completed/incomplete frame actually closed the stream
  let completed = '';
  let incompleteReason: string | undefined;   // set when the backend truncated the reply (budget / content filter)
  let streamError: string | undefined;        // a bare `error` SSE frame emitted after the 200 OK
  const toolEvents: CodexResponsesEvent[] = [];
  for await (const block of sseBlocks(res.body)) {
    const ev = parseSseBlock(block);
    if (!ev) continue;
    if (ev.event === 'response.failed') {
      throw new Error(ev.data?.response?.error?.message ?? ev.data?.error?.message ?? 'Codex response failed');
    }
    if (ev.event === 'response.output_text.delta') {
      if (typeof ev.data?.delta === 'string') { sawDelta = true; yield { type: 'text', value: ev.data.delta }; }
    } else if (ev.event === 'response.output_item.added' || ev.event === 'response.function_call_arguments.delta') {
      toolEvents.push(ev);
    } else if (ev.event === 'response.completed' || ev.event === 'response.incomplete') {
      sawTerminal = true;
      const text = extractResponsesText(ev.data?.response);
      if (text) completed = text;
      // Covers both wire shapes: response.incomplete, and response.completed carrying incomplete_details.reason.
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
    // Truly-empty drop → fail so the turn is retryable; anything delivered → keep it and only flag the end.
    if (!sawDelta && !completed && toolCalls.length === 0) {
      throw new Error(streamError ?? 'Codex stream ended before completion — the connection dropped or timed out before any reply. Try again.');
    }
    yield { type: 'text', value: '\n\n_[Stream ended before completion — the reply may be incomplete.]_' };
  }
}

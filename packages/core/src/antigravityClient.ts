// -------------- antigravityClient.ts — Wisp: Antigravity Cloud Code request + SSE→bridge events -------------- //

/*
 * Depends on:
 *   - node fetch/AbortSignal/ReadableStream + crypto.randomUUID/getRandomValues: the live HTTP call to the
 *     Cloud Code turn endpoint, and the two injected random values the pure layer refuses to mint itself
 *     (the request id and the session-id fallback).
 *   - ./catalog: the pure cores — buildAntigravityRequestBody (payload → envelope → forks → schema clean →
 *     response normalization → signature repair), the host chain / URL / header builders, the throw shape,
 *     the next-host predicate, and antigravityStreamEvents (the chunk → BridgeStreamEvent mapper). The IO
 *     lives here; every decision is unit-tested there.
 *   - ./codexClient: sseBlocks — the provider-agnostic byte-stream → SSE-block splitter.
 *
 * Data shapes:
 *   - The request body is buildAntigravityRequestBody's output: a Gemini generateContent payload nested
 *     under `request`, inside the Cloud Code envelope. A THIRD wire — neither OpenAI- nor Anthropic-shaped.
 *   - The streaming response is `data:`-only SSE (no `event:` lines, and no [DONE] sentinel — the mapper
 *     synthesises the terminating flush). The non-streaming response is one JSON document.
 *
 * TRANSPORT, MEASURED NOT ASSUMED (#189 acceptance criterion): the reference clones its Go transport to
 * force HTTP/1.1, because Go's http.DefaultTransport negotiates HTTP/2 via ALPN — the comment there says
 * the goal is "to perfectly mimic Node.js https defaults". This runtime IS that default, and it was probed
 * rather than reasoned about: a plain fetch against an h2-capable host reported `http/1.1` on BOTH hosts of
 * this Bridge — bun 1.3.14 (`wisp serve`) and node 22.17 / undici (the extension host). undici does not
 * negotiate h2 unless a Client is built with allowH2, which nothing here does. So the fork costs nothing
 * and is deliberately NOT ported: there is no knob to set, and adding one would be dead configuration.
 */

import {
  AntigravityCreds, AntigravityTurn, buildAntigravityRequestBody, antigravityRequestId,
  antigravityFallbackSessionId, antigravityHostChain, antigravityTurnUrl, antigravityModelsUrl,
  antigravityRequestHeaders, antigravityApiError, antigravityShouldTryNextHost, antigravityStreamEvents,
  parseAntigravityModels, type ToolSpec, type AntigravityThinkingLevel,
} from './catalog';
// TYPE only, exactly as antigravity.ts imports it: erased at runtime, so bridge -> catalog stays the sole
// runtime edge and the module graph never cycles (the xai.ts pattern).
import type { BridgeStreamEvent } from './bridge';
import { sseBlocks } from './codexClient';

type AntigravityRequestArgs = {
  strictCompletion?: boolean;
  creds: AntigravityCreds;
  baseUrl: string;
  model: string;
  messages: AntigravityTurn[];
  tools?: ToolSpec[];
  // Already folded to this wire's three stops by the caller. Absent = send no thinkingConfig at all,
  // which is every row whose id already pins its tier.
  thinkingLevel?: AntigravityThinkingLevel;
  signal?: AbortSignal;
};

// 16 random hex chars — the injected randomness antigravityFallbackSessionId folds into a session id.
const randomHex = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

// ----------------------------- Request (the daily-first host chain) ----------------------------- //

/*
 * POST one conversation and return the raw Response, walking the host chain: daily, then production.
 * Three conditions move to the next host — a transport error, a 429, and the capacity 503 — and on the
 * LAST host each of them surfaces instead. The body is built ONCE: re-minting the request id per host
 * would make the two attempts look like different turns to the upstream.
 *
 * Shared by antigravityStream and antigravityRequest.
 */
const antigravityFetch = async (args: AntigravityRequestArgs, stream: boolean): Promise<Response> => {
  const token = args.creds.accessToken;
  if (!token) throw new Error('Not signed in to Antigravity.');
  // The envelope must carry a Cloud Code project — a hard failure at request-build time, not something the
  // upstream should have to word for us. AntigravityAuth.current() bootstraps it, so an absent one here
  // means that bootstrap failed; 400 (not 429/5xx) keeps it OUT of the transient-retry predicate, because
  // retrying cannot conjure a project.
  if (!args.creds.projectId) {
    throw new Error('Antigravity API error 400: no Cloud Code project for this account — sign out and sign in again.');
  }

  const body = JSON.stringify(buildAntigravityRequestBody({
    model: args.model,
    messages: args.messages,
    tools: args.tools,
    projectId: args.creds.projectId,
    requestId: antigravityRequestId(crypto.randomUUID()),
    fallbackSessionId: antigravityFallbackSessionId(randomHex()),
    thinkingLevel: args.thinkingLevel,
  }));
  const headers = antigravityRequestHeaders(token);
  const hosts = antigravityHostChain(args.baseUrl);

  for (const [index, host] of hosts.entries()) {
    const isLast = index === hosts.length - 1;
    let res: Response;
    try {
      res = await fetch(antigravityTurnUrl(host, stream), { method: 'POST', headers, body, signal: args.signal });
    } catch (err) {
      // The client hanging up is not a host failure — never burn the fallback on it.
      if (isLast || args.signal?.aborted) throw err;
      continue;
    }
    if (res.ok) return res;
    const errBody = await res.text().catch(() => '');
    if (!isLast && antigravityShouldTryNextHost(res.status, errBody)) continue;
    throw antigravityApiError(res.status, errBody);
  }
  // Unreachable: antigravityHostChain never answers empty. The throw is the type-level restatement.
  throw new Error('Antigravity API error 503: no Antigravity host available');
};

// ----------------------------- Model discovery ----------------------------- //

/*
 * The upstream's own model list — what the pickers prefer over the static ANTIGRAVITY_MODELS table when
 * signed in, so a model released after the snapshot appears without a Wisp release. Same host chain and
 * mirrored headers as a turn; the walk policy is the reference fetch tool's, not the turn's — ANY failure
 * moves to the next host (a discovery read has no request id to keep stable and no 429 verdict to
 * classify), and the last host's failure surfaces in the API-error contract shape.
 */
export const fetchAntigravityModels = async (creds: AntigravityCreds, baseUrl?: string): Promise<string[]> => {
  const token = creds.accessToken;
  if (!token) throw new Error('Not signed in to Antigravity.');
  const body = JSON.stringify(creds.projectId ? { project: creds.projectId } : {});
  const headers = antigravityRequestHeaders(token);
  const hosts = antigravityHostChain(baseUrl);

  let lastError: Error = new Error('Antigravity API error 503: no Antigravity host available');
  for (const host of hosts) {
    let res: Response;
    try {
      res = await fetch(antigravityModelsUrl(host), { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }
    if (!res.ok) {
      lastError = antigravityApiError(res.status, await res.text().catch(() => ''));
      continue;
    }
    return parseAntigravityModels(await res.json().catch(() => undefined));
  }
  throw lastError;
};

// ----------------------------- Streaming ----------------------------- //

// `alt=sse` frames carry `data:` lines only — no `event:` line, so the shared parseSseBlock (which requires
// one) does not fit. Blank/[DONE] payloads answer undefined and are skipped; malformed JSON is dropped
// rather than throwing, because one bad frame must not lose a turn that is otherwise streaming fine.
const parseDataFrame = (block: string): unknown => {
  const raw = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .join('\n');
  if (!raw || raw === '[DONE]') return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
};

// The non-streaming document as a one-element async iterable, so both paths drain the SAME mapper.
const oneChunk = async function* (value: unknown): AsyncGenerator<unknown> { yield value; };

const antigravityChunks = async function* (body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  for await (const block of sseBlocks(body)) {
    const frame = parseDataFrame(block);
    if (frame !== undefined) yield frame;
  }
};

// Stream one Antigravity turn as door-neutral BridgeStreamEvents. The state machine — thinking parts
// dropped, usage kept only on the terminal chunk, tool calls flushed when the iterable ends — is
// antigravityStreamEvents', unit-tested in antigravity.test.ts. This adds the socket and nothing else.
export const antigravityStream = async function* (args: AntigravityRequestArgs): AsyncGenerator<BridgeStreamEvent> {
  const res = await antigravityFetch(args, true);
  if (!res.body) return;
  yield* antigravityStreamEvents(antigravityChunks(res.body), args.strictCompletion);
};

// ----------------------------- Non-streaming ----------------------------- //

// One turn through the `generateContent` endpoint, folded to the model's reply text. The same event mapper
// drains the single JSON document, so the two paths cannot disagree about what counts as answer text
// (thinking parts are dropped in exactly one place).
export const antigravityRequest = async (args: AntigravityRequestArgs): Promise<string> => {
  const res = await antigravityFetch(args, false);
  const document = await res.json().catch(() => undefined);
  let text = '';
  for await (const event of antigravityStreamEvents(oneChunk(document))) {
    if (event.type === 'text') text += event.text;
  }
  return text;
};

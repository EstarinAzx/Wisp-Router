// ----------------- bridgeServer.ts — Wisp: the Bridge HTTP listener (keyed walking skeleton) ----------------- //

/*
 * Depends on:
 *   - http (node stdlib): the local OpenAI-compatible listener — no web framework, this is one route table.
 *   - crypto (node stdlib): constant-time secret compare + a response id (the pure bridge.ts forbids both).
 *   - openai: the streamed chat client type — built per-Provider by the injected clientFor (same path Inquire
 *     and the LM Chat Provider already use).
 *   - ./catalog: Provider routing (resolveModel), message/tool builders, tool-call assembly, the /v1/models
 *     descriptor builder, and the Codex/Anthropic kind guards.
 *   - ./bridge: the PURE translator — parseOpenAiChatRequest inbound, the OpenAI-SSE emitters + buildModelsList
 *     outbound. This module is only the impure socket/route glue around it.
 *
 * Design: the outward mirror of chatProvider.ts. Where that registers Wisp's Providers INTO VS Code's chat,
 * this exposes the same {baseUrl, key, model} backends OUT as one ordinary OpenAI endpoint on 127.0.0.1.
 * Per the PRD this slice is the walking skeleton — KEYED Providers only (Codex #39 / Anthropic #40 later) — and
 * is glue: F5/manual-verified, not unit-tested (the genuinely-new logic lives in the unit-tested bridge.ts).
 *
 * Data shapes:
 *   - BridgeDeps: the seam to extension.ts — the catalog, the current model-map/baseUrl getters, the async
 *     per-Provider key/client resolvers, the listen port, and the access secret. extension.ts owns secrets;
 *     this module reads none directly, mirroring the chatProvider seam.
 */

import * as http from 'http';
import * as crypto from 'crypto';
import type OpenAI from 'openai';
import { codexCatalog } from './codexModels';
import {
  Provider, resolveModel, resolveBaseUrl, buildOpenAiChatMessages, toOpenAiTools, toCodexResponsesTools,
  toAnthropicTools, assembleToolCalls, buildChatModelInfos, standardEffortToAntigravity, isCodexProvider, isAnthropicProvider, isXaiProvider,
  isAntigravityProvider, isAntigravityImageModel, antigravityImageRefusal,
  antigravityFailureOf, ANTIGRAVITY_QUOTA_EXHAUSTED_CODE,
  anthropicCacheOutcome, anthropicDiagnosisStale, createAnthropicDiagnosisChain, createAnthropicCacheGrowthTracker, isFableFamilyModel,
  classifyCodexErrorMessage, buildStatus, codexEffortOptions, anthropicThinkingEffort, xaiReasoning,
  type ToolCallDelta, type AssembledToolCall, type CodexCreds, type AnthropicCreds, type XaiCreds, type AntigravityCreds, type EffortLevel, type BridgeUsage, type AnthropicCacheMissReason, type CodexErrorClass,
  type QuotaMeter, type WispStatus,
} from './catalog';
import { codexStream } from './codexClient';
import { parseResponsesRequest, createResponsesEncoder } from './bridgeResponses';
import { anthropicStream, type AnthropicStreamEvent } from './anthropicClient';
import { xaiStream } from './xaiClient';
import { antigravityStream } from './antigravityClient';
import {
  parseOpenAiChatRequest, buildModelsList, textChunk, toolCallChunk, finalChunk, sseLine, SSE_DONE, chatCompletionsUsage,
  type ChunkMeta, type BridgeChatRequest, type BridgeStreamEvent,
} from './bridge';
import {
  parseAnthropicMessagesRequest, buildAnthropicModelsList, createAnthropicSseEncoder, buildAnthropicMessageResponse, anthropicErrorFrame,
  advisorToolSpec, runAdvisorLoop, buildReviewerRequest,
  type AnthropicSseMeta, type BridgeAnthropicRequest, type ReviewerVerdict,
} from './bridgeAnthropic';
import type { NormalizedTurn } from './catalog';
import {
  resolveRoute, withCooldownFallback, createProviderCooldowns,
  isTransientProviderError, retryDelayMs, MAX_PROVIDER_ATTEMPTS, DEFAULT_COOLDOWN_SECONDS,
  type RoutingMap, type RouteMatch,
} from './routing';

// ----------------------------- Dependencies ----------------------------- //

// One default port for every host of this engine (#63: extension + TUI + wisp serve) — a per-face
// constant would let the faces drift onto different ports while sharing one config store.
export const DEFAULT_BRIDGE_PORT = 41184;

// The seam to extension.ts. Key/client resolution lives there (it reads SecretStorage); this module is handed
// the catalog plus pure getters so it never touches secrets or config directly.
export type BridgeDeps = {
  providers: Provider[];
  modelMap: () => Record<string, string>;                         // current per-Provider model memory
  customBaseUrl: () => string;                                    // wisp.baseUrl (only Custom resolves from it)
  keyFor: (provider: Provider) => Promise<string>;                // resolved key, '' when none — gates /v1/models
  clientFor: (provider: Provider) => Promise<OpenAI | undefined>; // built {baseUrl, key} client, undefined when keyless
  // Codex has no API key — it is "usable when signed in". These two feed the codex path (#39): the signed-in
  // flag gates the /v1/models row, current() returns the refreshed OAuth bundle for the Responses stream.
  codexSignedIn: () => Promise<boolean>;
  codexCreds: () => Promise<CodexCreds | undefined>;
  // Anthropic is the same "usable when signed in" shape as Codex (no API key) — these feed the anthropic
  // path (#40): the flag gates the /v1/models row, current() returns the refreshed OAuth bundle for the
  // Messages stream.
  anthropicSignedIn: () => Promise<boolean>;
  anthropicCreds: () => Promise<AnthropicCreds | undefined>;
  // Grok (xAI) is the same "usable when signed in" shape (no API key) — these feed the xai path (#95): the
  // flag gates the /v1/models row, current() returns the refreshed OAuth bundle for the Responses stream.
  // OPTIONAL until the faces wire XaiAuth (#96 TUI / #97 VS Code): a face that omits them makes Grok read
  // signed-out (a clean 401), never a crash — so this slice ships without touching extension.ts / the TUI.
  xaiSignedIn?: () => Promise<boolean>;
  xaiCreds?: () => Promise<XaiCreds | undefined>;
  // Antigravity (#189) — the same "usable when signed in" shape, on a THIRD wire (Gemini generateContent
  // inside a Cloud Code envelope). OPTIONAL for the same reason the xai pair is: a face that omits them
  // makes the row read signed-out (a clean 401), never a crash. current() returns the bundle refreshed AND
  // with the Cloud Code project bootstrapped, so the request path can assume projectId when it is gettable.
  antigravitySignedIn?: () => Promise<boolean>;
  antigravityCreds?: () => Promise<AntigravityCreds | undefined>;
  effort: () => EffortLevel;                                      // the panel's reasoning Effort — same value the chat path + Inquire use
  activeProviderId: () => string;                                // the panel's Active Provider — the default route for a non-id model (#b: Copilot sends the resolved model name)
  routingMap: () => RoutingMap;                                  // the panel's Routing map (#51) — read live per request so an edit applies to the next call
  aliasPickerShowsModel: () => boolean;                          // wisp.bridge.aliasPickerShowsModel — alias picker rows carry the pinned model id (#52)
  aliasOnlyModels: () => boolean;                                // EFFECTIVE bridge.aliasOnlyModels (#67, defaults ON #81) — hosts read via home's effectiveAliasOnly
  port: () => number;                                             // 127.0.0.1 listen port (wisp.bridge.port)
  accessSecret: () => string;                                     // required Bearer on every request
  log: (message: string) => void;
  // #171: persist the statusline snapshot after a bridged turn (the face writes ~/.wisp/status.json). OPTIONAL
  // — a host that omits it simply produces no live statusline, never an error, and the Bridge never reads it
  // back: this is write-only telemetry consumed by an out-of-process script.
  recordStatus?: (status: WispStatus) => void;
};

// A local process that already holds the secret is the threat model (per the PRD security note), but an
// inbound JSON body is still untrusted — cap it so a malformed/huge body can't blow up the host's memory.
// ponytail: fixed 25MB cap; revisit only if a real request legitimately exceeds it.
const MAX_BODY_BYTES = 25 * 1024 * 1024;

// ----------------------------- Plain HTTP helpers (deps-free) ----------------------------- //

// Read the whole request body as a string, rejecting once it crosses the size cap (and killing the socket).
const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { req.destroy(); reject(new Error('request body too large')); return; }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

// Constant-time secret check. The secret arrives as `Authorization: Bearer` (OpenAI-style clients) or
// `x-api-key` (Anthropic-style — Claude Code sends whichever matches the env var the user set, PRD #43).
// timingSafeEqual throws on a length mismatch, so the length guard runs first — it leaks only the secret's
// length, which a high-entropy random secret can afford.
const authOk = (req: http.IncomingMessage, secret: string): boolean => {
  const apiKey = req.headers['x-api-key'];
  const bearer = /^Bearer (.+)$/.exec(req.headers['authorization'] ?? '')?.[1];
  const presented = typeof apiKey === 'string' && apiKey ? apiKey : bearer;
  if (!presented) return false;
  const given = Buffer.from(presented);
  const want = Buffer.from(secret);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
};

// Send a JSON body with a status. sendError uses OpenAI's { error: { message } } envelope so clients surface it.
const sendJson = (res: http.ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
// #166: `type` rides the body when the failure was classified, so a client reading the error object sees the
// condition and not just prose. Omitted otherwise — every pre-existing caller keeps its exact shape.
const sendError = (res: http.ServerResponse, status: number, message: string, type?: string): void =>
  sendJson(res, status, { error: { ...(type ? { type } : {}), message } });

// #166: pull the FIRST event out of a provider stream before a door commits its 200 SSE head. The provider
// streams are async generators, so calling one performs NO IO — the upstream request, and any 4xx it throws,
// happens on the first pull. Writing the head first therefore locked every pre-stream failure into a 200 with
// an empty body, leaving no status to answer with; priming moves the throw ahead of the head, which is what
// makes a classified status reachable at all. The pulled event is re-yielded first, so the consumer sees the
// identical sequence it saw before.
const primeStream = async <T>(source: AsyncIterable<T>): Promise<AsyncIterable<T>> => {
  const it = source[Symbol.asyncIterator]();
  const first = await it.next();
  return {
    [Symbol.asyncIterator]: async function* () {
      if (first.done) return;
      yield first.value;
      yield* { [Symbol.asyncIterator]: () => it };
    },
  };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// What an executor / the Anthropic door's startProviderStream answers with: an opened stream, or a refusal
// carrying its own status. openPrimed below is generic over it so each door keeps the extra fields it returns.
type OpenedStream = { ok: false; status: number; message: string } | { ok: true; events: AsyncIterable<BridgeStreamEvent> };

// The non-streaming reply envelope. bridge.ts is deliberately streaming-only (it emits SSE chunks), so when a
// client asks stream:false this glue assembles the drained stream into one OpenAI chat.completion object.
const buildCompletion = (meta: ChunkMeta, text: string, calls: { id: string; name: string; argsJson: string }[]) => ({
  id: meta.id, object: 'chat.completion', created: meta.created, model: meta.model,
  choices: [{
    index: 0,
    message: {
      role: 'assistant',
      content: text || null,
      ...(calls.length ? { tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.argsJson } })) } : {}),
    },
    finish_reason: calls.length ? 'tool_calls' : 'stop',
  }],
});

// ----------------------------- The listener ----------------------------- //

// Build the Bridge listener over the deps seam. Returns a start/stop lifecycle plus a Disposable so the
// command (and slice #38's panel toggle) drive the exact same server; OFF until start() is called.
export const createBridgeServer = (deps: BridgeDeps) => {
  let server: http.Server | undefined;

  // The usable-Provider descriptors both doors' discovery lists derive from. Keyed = has a key; the OAuth rows
  // (Codex #39, Anthropic #40) are usable when signed in. caps is omitted: the list only needs ids/labels, so
  // the conservative default windows are fine (no models.dev fetch to stall on).
  const computeModelInfos = async () => {
    const keyedPairs = await Promise.all(deps.providers.map(async (p) =>
      [p.id, isCodexProvider(p) ? await deps.codexSignedIn()
        : isAnthropicProvider(p) ? await deps.anthropicSignedIn()
        : isXaiProvider(p) ? await (deps.xaiSignedIn?.() ?? false)
        : isAntigravityProvider(p) ? await (deps.antigravitySignedIn?.() ?? false) : !!(await deps.keyFor(p))] as const));
    return buildChatModelInfos(deps.providers, {
      keyed: Object.fromEntries(keyedPairs),
      modelMap: deps.modelMap(),
      customBaseUrl: deps.customBaseUrl(),
    });
  };

  // #161: the usage-limit cooldown store — a provider that 429'd usage_limit_reached is skipped by family
  // routes until its plan window resets, so a dead codex doesn't eat every request (and the user doesn't
  // babysit the Routing map). One instance per Bridge host, like the diagnosis chain below.
  const cooldowns = createProviderCooldowns();

  // Record a provider error against the cooldown store. A recognized usage-limit 429 logs the multi-day horizon
  // and RETURNS — the plan window is the answer, and letting the same failure also touch the short channel is
  // exactly the contamination #168 forbids. Anything transient feeds the blip channel instead, which only cools
  // once the failures repeat.
  const noteProviderError = (providerId: string, err: unknown): void => {
    const message = String(err);
    // #190: a record that classified the failure itself already knows the horizon the server stated, so the
    // long channel is seeded from that number instead of being re-parsed out of prose. Checked FIRST, so a
    // spent plan window can never fall through and be counted as a blip. A horizonless exhaustion takes the
    // same short default #161 uses — wrong guesses self-heal, and rediscovering it every request does not.
    const failure = antigravityFailureOf(err);
    if (failure?.code === ANTIGRAVITY_QUOTA_EXHAUSTED_CODE) {
      const quotaSeconds = failure.cooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS;
      cooldowns.noteQuotaWindow(providerId, quotaSeconds);
      deps.log(`[bridge] provider ${providerId} quota exhausted — cooling down ${Math.round(quotaSeconds / 60)}m until ${new Date(Date.now() + quotaSeconds * 1000).toISOString()} (#190)`);
      return;
    }
    const seconds = cooldowns.noteUsageLimit(providerId, message);
    if (seconds !== undefined) {
      deps.log(`[bridge] provider ${providerId} usage limit hit — cooling down ${Math.round(seconds / 60)}m; claude-* family routes fall back to anthropic until ${new Date(Date.now() + seconds * 1000).toISOString()} (#161)`);
      return;
    }
    const transient = cooldowns.noteTransient(providerId, message);
    if (transient !== undefined) deps.log(`[bridge] provider ${providerId} repeated transient failures — cooling down ${transient}s; family routes fall back to a healthy Target meanwhile (#168)`);
  };

  // Resolve a requested model name through the Routing map (#51): Provider id → Alias exact → Family
  // fuzzy → Active fallback. One log line per routed request names the matched row kind + Target (the
  // observable the acceptance criteria demand); undefined (dangling Target / no Active) → the caller 404s.
  // #161: a family match whose Target provider is cooling re-aims to the anthropic Provider with the
  // requested claude-* id pinned — the same flip the user used to make by hand, minus the babysitting.
  const routeFor = (requestedModel: string): RouteMatch | undefined => {
    const direct = resolveRoute(deps.routingMap(), deps.providers, deps.activeProviderId(), requestedModel);
    const route = withCooldownFallback(direct, requestedModel, deps.providers, cooldowns.cooling, isAnthropicProvider);
    if (route) {
      const fellBack = direct && route.provider.id !== direct.provider.id;
      deps.log(`[bridge] route ${route.matched} '${requestedModel}' -> ${route.provider.id}${route.pinnedModel ? ` model=${route.pinnedModel}` : ''}${fellBack ? ` (cooldown fallback: ${direct.provider.id} limited until ${new Date(cooldowns.coolingUntil(direct.provider.id) ?? 0).toISOString()} #161)` : ''}`);
    }
    return route;
  };

  // The Routing-map Alias names (#52), read live so a panel edit shows up on the next list fetch.
  const aliasNames = (): string[] => deps.routingMap().aliases.map((a) => a.name);

  // GET /v1/models — the OpenAI-door discovery list (one entry per usable Provider id, then the Aliases).
  const handleModels = async (res: http.ServerResponse): Promise<void> =>
    sendJson(res, 200, buildModelsList(await computeModelInfos(), aliasNames()));

  // GET /v1/models — the Anthropic-door discovery list: the same usable Providers + Aliases in Anthropic
  // shape, ids aliased claude-wisp-<id> so Claude Code's /model picker lists them (slice #44's decision).
  // Aliases carry their pinned model so the picker row reads 'sol — gpt-5', like the Provider rows —
  // unless the user prefers bare alias names (wisp.bridge.aliasPickerShowsModel off).
  // aliasOnlyModels (#67) drops the Provider rows — Claude Code's picker then lists just the user-named
  // Aliases; with zero Aliases the builder falls back to the Provider rows so the picker is never empty
  // (#81). Anthropic door only, on purpose: that IS Claude Code's list; the OpenAI door serves generic
  // clients where hiding backends has no story. Infos are always computed — local key/creds reads only.
  const handleAnthropicModels = async (res: http.ServerResponse): Promise<void> =>
    sendJson(res, 200, buildAnthropicModelsList(
      await computeModelInfos(),
      deps.routingMap().aliases.map((a) => ({ name: a.name, model: deps.aliasPickerShowsModel() ? a.target.model : undefined })),
      deps.aliasOnlyModels(),
    ));

  // ----------------------------- Provider streams (shared by both doors) ----------------------------- //

  // Map a Codex/Anthropic/Grok provider stream (text fragments live, whole tool calls at end) onto the
  // door-neutral BridgeStreamEvent both doors render from. Empty text fragments are dropped (nothing to
  // stream). The thinking passthrough events only the Anthropic upstream produces map to their bridge twins —
  // the Anthropic door's encoder renders them; the OpenAI door, which has no thinking vocabulary, drops them.
  const mapOAuthStream = async function* (
    upstream: AsyncIterable<AnthropicStreamEvent>,
    onDiagnosis?: (messageId: string) => void,
  ): AsyncGenerator<BridgeStreamEvent> {
    for await (const ev of upstream) {
      if (ev.type === 'text') { if (ev.value) yield { type: 'text', text: ev.value }; }
      else if (ev.type === 'toolCall') yield { type: 'tool_call', call: ev.call };
      else if (ev.type === 'thinkingStart') yield { type: 'thinking_start' };
      else if (ev.type === 'thinking') { if (ev.value) yield { type: 'thinking', text: ev.value }; }
      else if (ev.type === 'thinkingSignature') yield { type: 'thinking_signature', signature: ev.value };
      else if (ev.type === 'redactedThinking') yield { type: 'redacted_thinking', data: ev.data };
      else if (ev.type === 'usage') yield { type: 'usage', usage: ev.usage };
      else if (ev.type === 'truncation') yield { type: 'truncation', reason: ev.reason };
      // #156: record the message id the moment it arrives (an aborted stream must still advance the chain
      // — the server DID mint this message), then forward the diagnosis for the door's cache-health log.
      else if (ev.type === 'diagnosis') { onDiagnosis?.(ev.messageId); yield { type: 'diagnosis', messageId: ev.messageId, missReason: ev.missReason }; }
    }
  };

  // Map a keyed OpenAI-SDK stream onto BridgeStreamEvent. Tool calls arrive as fragments across chunks, so they
  // buffer and assemble whole once the stream ends (the same shape the LM Chat Provider path folds). Structural
  // chunk type (not the SDK's) keeps this in the module's hand-rolled-shape style.
  // #169: `usage` rides the stream's FINAL chunk, and only when the request opted in. That chunk carries an
  // EMPTY choices array, so the delta reads below already skip it — the mapping is purely additive.
  type KeyedChunk = { choices?: { finish_reason?: string | null; delta?: { content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[]; usage?: unknown };
  const mapKeyedStream = async function* (upstream: AsyncIterable<KeyedChunk>, strict = false): AsyncGenerator<BridgeStreamEvent> {
    const toolDeltas: ToolCallDelta[] = [];
    let terminal = false;
    for await (const chunk of upstream) {
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) {
        terminal = true;
        if (strict && ['length', 'content_filter'].includes(choice.finish_reason)) yield { type: 'truncation', reason: choice.finish_reason === 'length' ? 'max_tokens' : 'content_filter' };
      }
      const delta = choice?.delta?.content ?? '';
      if (delta) yield { type: 'text', text: delta };
      for (const tc of choice?.delta?.tool_calls ?? []) toolDeltas.push({ index: tc.index, id: tc.id, name: tc.function?.name, args: tc.function?.arguments });
      // No usage on the chunk → no event at all. A Provider that ignores the opt-in must finish clean, and a
      // synthesized zero is the bug #165 exists to kill (see chatCompletionsUsage).
      const usage = chatCompletionsUsage(chunk, strict);
      if (usage) yield { type: 'usage', usage };
    }
    if (strict && !terminal) throw new Error('Provider stream ended before completion');
    for (const call of assembleToolCalls(toolDeltas)) yield { type: 'tool_call', call };
  };

  // ----------------------------- The ProviderExecutor record (#167) ----------------------------- //

  /*
   * The OpenAI door used to carry one chat handler PER Provider kind — codex, anthropic and xai each a
   * near-copy of the next, with the keyed path inline as a fourth — and the same gateway-error catch block
   * pasted at every one. A new backend meant a new handler, and #168's retry would have been written four
   * times over. One record per kind replaces them: what it answers for, how to open the upstream, and how to
   * read a failure. Everything a door does around that — priming, rendering, the error answer — is shared.
   *
   * Deliberately minimal (the spec's call): no class hierarchy, no translator matrix. Each record's open()
   * keeps its own request shaping, because that is the ONLY part that genuinely differs per backend.
   */
  type ExecutorStart =
    | { ok: false; status: number; message: string }
    | { ok: true; events: AsyncIterable<BridgeStreamEvent> };

  type ExecutorArgs = {
    parsed: BridgeChatRequest;
    provider: Provider;
    model: string;      // the resolved model id (a routed Target's pinned model already applied)
    baseUrl: string;
    signal: AbortSignal;
  };

  type ProviderExecutor = {
    id: string;                                    // the record's own name — the Provider KIND it answers for
    matches: (provider: Provider) => boolean;
    // Resolve credentials/client and open the upstream as door-neutral events. The creds check is EAGER, so a
    // signed-out (401) / keyless (400) Provider is answered before any SSE head is written.
    open: (args: ExecutorArgs) => Promise<ExecutorStart>;
    // #166: read a failed turn as the condition the backend actually reported, so the door answers with a
    // status the client can act on. Codex is the only backend whose wire is parsed today; every other record
    // returns undefined and its caller keeps the 502 — an unknown failure must stay a gateway error.
    classify: (err: unknown) => CodexErrorClass | undefined;
  };

  const signedOut = (provider: Provider): ExecutorStart => ({ ok: false, status: 401, message: `provider '${provider.id}' is not signed in` });

  // The keyed record answers for any Provider with an API key, so it matches everything and is LAST — the
  // three OAuth kinds claim their rows first. Adding a backend means adding a row here, not a handler.
  const keyedExecutor: ProviderExecutor = {
    id: 'keyed',
    matches: () => true,
    classify: () => undefined,
    open: async ({ parsed, provider, model, signal }) => {
      const client = await deps.clientFor(provider);
      if (!client) return { ok: false, status: 400, message: `provider '${provider.id}' has no API key configured` };
      // bridge.ts keeps system OUT of the turns; the OpenAI path re-prepends it as the leading system message.
      const base = buildOpenAiChatMessages(parsed.turns);
      const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...base] : base;
      const tools = toOpenAiTools(parsed.tools);
      // #169: stream_options is the opt-in — a chat-completions stream reports NO usage without it. The door
      // always streams upstream (even when the client asked stream:false), so the flag is unconditional too.
      const upstream = await client.chat.completions.create(
        { model, messages, stream: true, stream_options: { include_usage: true }, ...(tools.length ? { tools, tool_choice: 'auto' as const } : {}),
          ...(parsed.responses?.parallelToolCalls !== undefined ? { parallel_tool_calls: parsed.responses.parallelToolCalls } : {}),
          ...(parsed.responses?.effort ? { reasoning_effort: parsed.responses.effort as OpenAI.ChatCompletionCreateParams['reasoning_effort'] } : {}),
          ...(parsed.responses?.verbosity ? { verbosity: parsed.responses.verbosity } : {}) },
        { signal },
      );
      return { ok: true, events: mapKeyedStream(upstream, !!parsed.responses) };
    },
  };

  const providerExecutors: ProviderExecutor[] = [
    {
      // The Responses stream behind the ChatGPT sign-in (#39). No API key: creds come from the OAuth seam
      // (codexAuth via deps), so a signed-out state is a clean 401, not a crash.
      id: 'codex',
      matches: isCodexProvider,
      classify: (err) => classifyCodexErrorMessage(String(err)),
      open: async ({ parsed, provider, model, baseUrl, signal }) => {
        const creds = await deps.codexCreds();
        if (!creds) return signedOut(provider);
        signal.throwIfAborted();
        const modelInfo = parsed.responses?.effort ? (await codexCatalog.get({ creds, baseUrl })).models.find(m => m.id === model) : undefined;
        if (parsed.responses?.effort && !codexEffortOptions(modelInfo).includes(parsed.responses.effort)) {
          return { ok: false, status: 400, message: `Unsupported reasoning effort '${parsed.responses.effort}' for Codex model '${model}'` };
        }
        // bridge.ts lifts system OUT of the turns; Codex consumes it as `instructions`, so re-attach it as the
        // leading system message buildCodexResponsesBody folds into instructions (its only role:'system' source).
        const turns = parsed.turns.map((t) => ({ role: t.role, content: t.text, images: t.images, contentParts: t.contentParts, toolCalls: t.toolCalls, toolResults: t.toolResults }));
        const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...turns] : turns;
        const upstream = codexStream({ creds, baseUrl, model, modelInfo, messages, effort: parsed.responses?.effort ?? deps.effort(), tools: toCodexResponsesTools(parsed.tools, !parsed.responses), toolChoice: 'auto', signal, responses: parsed.responses });
        return { ok: true, events: mapOAuthStream(upstream) };
      },
    },
    {
      // The Messages SSE stream behind the Claude.ai sign-in (#40). Same "usable when signed in" shape as Codex.
      id: 'anthropic',
      matches: isAnthropicProvider,
      classify: () => undefined,
      open: async ({ parsed, provider, model, baseUrl, signal }) => {
        const creds = await deps.anthropicCreds();
        if (!creds) return signedOut(provider);
        // bridge.ts lifts system OUT of the turns; buildAnthropicMessagesBody lifts a role:'system' message back
        // to the top-level `system`, so re-attach it as the leading system message. Responses carries
        // ordered images in contentParts; Chat Completions retains its existing flattened behavior.
        const turns = parsed.turns.map((t) => ({ role: t.role, content: t.text, contentParts: t.contentParts, toolCalls: t.toolCalls, toolResults: t.toolResults }));
        const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...turns] : turns;
        const upstream = anthropicStream({ creds, baseUrl, model, messages, effort: parsed.responses?.effort ?? deps.effort(), tools: toAnthropicTools(parsed.tools), toolChoice: 'auto', signal, strictCompletion: !!parsed.responses, parallelToolCalls: parsed.responses?.parallelToolCalls });
        return { ok: true, events: mapOAuthStream(upstream) };
      },
    },
    {
      // Grok (#95) — a Codex twin on the Responses wire, but its own effort ladder: xaiReasoning folds
      // max→xhigh + gates per model, so the shared EffortLevel rides raw into that provider's adapter.
      id: 'xai',
      matches: isXaiProvider,
      classify: () => undefined,
      open: async ({ parsed, provider, model, baseUrl, signal }) => {
        const creds = await deps.xaiCreds?.();
        if (!creds) return signedOut(provider);
        // Images ride along (grok-4.5 is multimodal).
        const turns = parsed.turns.map((t) => ({ role: t.role, content: t.text, images: t.images, contentParts: t.contentParts, toolCalls: t.toolCalls, toolResults: t.toolResults }));
        const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...turns] : turns;
        const upstream = xaiStream({ creds, baseUrl, model, messages, effort: parsed.responses?.effort ?? deps.effort(), tools: toCodexResponsesTools(parsed.tools, !parsed.responses), toolChoice: 'auto', signal, responses: parsed.responses });
        return { ok: true, events: mapOAuthStream(upstream) };
      },
    },
    {
      // Antigravity (#189) — the THIRD wire: a Gemini generateContent payload inside a Cloud Code envelope,
      // reached by Google OAuth. Its stream already speaks BridgeStreamEvent (the mapper lives in the pure
      // layer, unit-tested), so unlike the three above it needs no mapOAuthStream hop.
      id: 'antigravity',
      matches: isAntigravityProvider,
      // #190: the FIRST record to answer a rate limit as 429 rather than leaving it a gateway fault. The
      // verdict is read off the Error the client threw, never re-derived from its message — a 429 the pure
      // layer DECLINED carries its raw upstream body, which uses the same vocabulary, so a string matcher
      // would stop the bounded retry that declining exists to allow.
      classify: (err) => antigravityFailureOf(err),
      open: async ({ parsed, provider, model, baseUrl, signal }) => {
        const creds = await deps.antigravityCreds?.();
        if (!creds) return signedOut(provider);
        // The image row is LISTED (it is real, and hiding it would make its absence a mystery) and refused
        // here, before anything opens, naming the reason. Delete this check, the two constants it uses and
        // its test the day a door grows an image-output channel.
        if (isAntigravityImageModel(model)) return { ok: false, status: 400, message: antigravityImageRefusal(model) };
        // bridge.ts lifts system OUT of the turns; buildAntigravityPayload folds a role:'system' message
        // into request.systemInstruction, so re-attach it as the leading system message. Images ride along
        // as inlineData parts — #186 confirmed this upstream accepts vision input.
        const turns = parsed.turns.map((t) => ({ role: t.role, content: t.text, images: t.images, contentParts: t.contentParts, toolCalls: t.toolCalls, toolResults: t.toolResults }));
        const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...turns] : turns;
        return { ok: true, events: antigravityStream({ creds, baseUrl, model, messages, tools: parsed.tools, signal, strictCompletion: !!parsed.responses }) };
      },
    },
    keyedExecutor,
  ];

  // The record answering for a Provider. keyedExecutor matches everything, so the lookup always lands — the
  // `??` is the type-level restatement of that, not a real fallback.
  const executorFor = (provider: Provider): ProviderExecutor =>
    providerExecutors.find((e) => e.matches(provider)) ?? keyedExecutor;

  // #168: open an upstream and prime it, retrying while NOTHING has been delivered. Priming (#167) is what makes
  // this expressible: it pulls the first event before any head is written, so "the stream failed before
  // delivering anything" is a condition with a clean boundary — everything up to and including the first pull is
  // retryable, everything after it has already reached the client and must never be discarded and restarted.
  // Written once here, so both doors retry the same way. Four things stop a retry: the client hung up, the
  // attempts ran out, #166 classified the failure (a client error cannot succeed on a retry), or the failure is
  // not transient at all. A refusal (`ok:false`) is a creds/key problem and returns untouched — never retried.
  const openPrimed = async <R extends OpenedStream>(
    provider: Provider, executor: ProviderExecutor, controller: AbortController, attempt: () => Promise<R>,
  ): Promise<R> => {
    for (let n = 1; ; n++) {
      try {
        const started = await attempt();
        if (!started.ok) return started;
        // Only `events` is replaced; every other field the door's own result carries (the Anthropic door's
        // resolved `model`) rides through the spread untouched.
        return { ...started, events: await primeStream(started.events) } as R;
      } catch (err) {
        const message = String(err);
        if (controller.signal.aborted || n >= MAX_PROVIDER_ATTEMPTS || executor.classify(err) || !isTransientProviderError(message)) throw err;
        const wait = retryDelayMs(n, Math.random);
        deps.log(`[bridge] provider ${provider.id} transient failure — retrying in ${Math.round(wait)}ms (attempt ${n + 1}/${MAX_PROVIDER_ATTEMPTS}): ${message} (#168)`);
        await sleep(wait);
        controller.signal.throwIfAborted();
      }
    }
  };

  // The ONE gateway-error answer, shared by both doors (#167 — this used to be five copies). An aborted
  // request is the client hanging up, not a failure. A failure the Provider's record classifies answers with
  // its own status (#166), so Claude Code compacts instead of retrying a request that cannot succeed; anything
  // unrecognised stays a 502. Once a head is out there is no status left to set, so the caller's mid-stream
  // frame (the Anthropic door's `error` event) runs instead and the response just ends.
  const failProviderRequest = (
    res: http.ServerResponse,
    provider: Provider,
    err: unknown,
    controller: AbortController,
    executor: ProviderExecutor,
    midStreamFrame?: (message: string) => string,
  ): void => {
    if (controller.signal.aborted) { res.end(); return; } // client hung up — normal, not a failure
    deps.log(`[bridge] error ${provider.id} ${String(err)}`);
    noteProviderError(provider.id, err);
    // The log line names the classified code so the four cases are tellable apart in operation.
    const classified = executor.classify(err);
    if (classified) deps.log(`[bridge] ${provider.id} failure classified code=${classified.code} -> HTTP ${classified.status} (#166)`);
    if (res.headersSent) { if (midStreamFrame) res.write(midStreamFrame(String(err))); res.end(); return; }
    if (classified) return sendError(res, classified.status, classified.message, classified.type);
    sendError(res, 502, `provider request failed: ${String(err)}`);
  };

  // POST /v1/chat/completions — ONE handler for every Provider (#167). Parse → route → the answering
  // Provider's record opens the upstream as BridgeStreamEvents → render back through bridge.ts's SSE emitters
  // (or one chat.completion object when stream:false). Kinds differ only inside their record's open().
  const handleChat = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    let body: unknown;
    try { body = JSON.parse(await readBody(req)); } catch { return sendError(res, 400, 'request body is not valid JSON'); }

    const parsed = parseOpenAiChatRequest(body as Parameters<typeof parseOpenAiChatRequest>[0]);
    // The translator DEGRADES on malformed input (never throws): a body that yields no turns is a deliberate
    // 400 here, not a crash — don't lean on try/catch for this control flow.
    if (!parsed.turns.length) return sendError(res, 400, 'no messages to send');

    // The Routing map (#51) picks the answering Provider: a Provider id routes to it (curl can address any
    // Provider explicitly), an Alias/Family hit routes to its Target, and anything else — notably the
    // resolved model NAME Copilot CLI sends as COPILOT_MODEL (#b) — keeps the ACTIVE Provider fallback.
    // The map + panel model are read live per request, so a mid-session edit applies without a relaunch.
    const route = routeFor(parsed.model);
    if (!route) return sendError(res, 404, `unknown provider '${parsed.model}'`);
    const { provider, pinnedModel } = route;
    const executor = executorFor(provider);

    // A routed Target's pinned model (#51) beats the Provider's panel-selected model — this request only.
    const model = pinnedModel ?? resolveModel(deps.modelMap(), provider);
    const baseUrl = resolveBaseUrl(provider, deps.customBaseUrl());

    // Bridge the client hanging up to an AbortController so the upstream call dies with the request.
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    try {
      // #168: the open is primed and bounded-retried in one step — a stream that dies before delivering
      // anything is re-opened instead of costing the user the turn.
      const started = await openPrimed(provider, executor, controller, () =>
        executor.open({ parsed, provider, model, baseUrl, signal: controller.signal }));
      if (!started.ok) return sendError(res, started.status, started.message);

      const meta: ChunkMeta = { id: `chatcmpl-${crypto.randomBytes(12).toString('hex')}`, model: parsed.model, created: Math.floor(Date.now() / 1000) };
      // Tool calls arrive whole (the maps assemble streamed fragments before yielding), so each becomes one
      // chunk — bridge.ts then folds it into a tool_calls delta.
      const calls: AssembledToolCall[] = [];
      if (parsed.stream) {
        // #166: openPrimed already pulled the first event, so an upstream rejection threw BEFORE this head and
        // the catch still had a status to answer with. Uniform across every record — only the Codex path primed
        // before, so the other three wrote the head first and locked every pre-stream failure into an empty 200.
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        for await (const ev of started.events) {
          if (ev.type === 'text') res.write(sseLine(textChunk(ev.text, meta)));
          else if (ev.type === 'tool_call') calls.push(ev.call);
          // Every other BridgeStreamEvent member is Anthropic-door vocabulary — thinking passthrough, usage,
          // the cache diagnosis, truncation, the advisor frames. This door has no channel for any of them and
          // drops them, exactly as its per-kind handlers did; never read "not text" as "must be a tool call".
        }
        calls.forEach((call, i) => res.write(sseLine(toolCallChunk(call, i, meta))));
        res.write(sseLine(finalChunk(calls.length ? 'tool_calls' : 'stop', meta)));
        res.write(SSE_DONE);
        res.end();
      } else {
        // Non-streaming client: drain the same stream into one chat.completion object.
        let text = '';
        for await (const ev of started.events) {
          if (ev.type === 'text') text += ev.text;
          else if (ev.type === 'tool_call') calls.push(ev.call);
        }
        sendJson(res, 200, buildCompletion(meta, text, calls));
      }
    } catch (err) {
      failProviderRequest(res, provider, err, controller, executor);
    }
  };

  const handleResponses = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    // IncomingMessage.close also fires when reading the body finishes. Only the response socket closing
    // before end is cancellation; install this before reading or resolving any upstream credentials.
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    let parsed: ReturnType<typeof parseResponsesRequest>;
    try { parsed = parseResponsesRequest(JSON.parse(await readBody(req))); }
    catch (err) { if (!controller.signal.aborted) sendError(res, 400, String(err)); return; }
    if (controller.signal.aborted) return;
    const route = routeFor(parsed.model);
    if (!route) return sendError(res, 404, `unknown provider '${parsed.model}'`);
    const { provider, pinnedModel } = route;
    const executor = executorFor(provider);
    const encoder = createResponsesEncoder(parsed, `resp_${crypto.randomBytes(12).toString('hex')}`);
    const model = pinnedModel ?? resolveModel(deps.modelMap(), provider);
    const effort = parsed.responses?.effort;
    const images = parsed.turns.flatMap(t => [...(t.contentParts ?? []), ...t.toolResults.flatMap(r => r.contentParts ?? [])]).filter(p => p.type === 'image');
    if (images.length && (isAntigravityProvider(provider) || (isAnthropicProvider(provider) && images.some(p => p.detail && p.detail !== 'auto'))
      || (!isCodexProvider(provider) && !isXaiProvider(provider) && images.some(p => p.detail === 'original')))) {
      return sendError(res, 400, 'This Provider wire cannot preserve the requested image content/detail');
    }
    if (effort && !isCodexProvider(provider)) {
      const supported = isAnthropicProvider(provider) ? anthropicThinkingEffort(model, effort).output_config?.effort === effort
        : isXaiProvider(provider) ? xaiReasoning(model, effort)?.effort === effort
        : isAntigravityProvider(provider) ? false : ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(effort);
      if (!supported) return sendError(res, 400, `Unsupported reasoning effort '${effort}' for Provider '${provider.id}' model '${model}'`);
    }
    if (!isCodexProvider(provider) && !isXaiProvider(provider) && !isAnthropicProvider(provider) && parsed.turns.some(t => t.toolResults.some(r => r.contentParts))) {
      return sendError(res, 400, 'This Provider wire cannot preserve image-bearing tool results');
    }
    if (isAntigravityProvider(provider)) {
      const firstConversation = parsed.turns.findIndex(t => t.role !== 'system');
      if (firstConversation >= 0 && parsed.turns.slice(firstConversation).some(t => t.role === 'system')) {
        return sendError(res, 400, 'Antigravity cannot preserve positioned developer messages; choose a Responses, Messages or Chat Completions Provider');
      }
    }
    try {
      const started = await openPrimed(provider, executor, controller, async () => {
        controller.signal.throwIfAborted();
        return executor.open({ parsed, provider, model: pinnedModel ?? resolveModel(deps.modelMap(), provider), baseUrl: resolveBaseUrl(provider, deps.customBaseUrl()), signal: controller.signal });
      });
      if (controller.signal.aborted) return;
      if (!started.ok) return sendError(res, started.status, started.message);
      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        res.write(encoder.start());
      }
      for await (const event of started.events) {
        controller.signal.throwIfAborted();
        const frames = encoder.push(event); if (parsed.stream && frames) res.write(frames);
      }
      controller.signal.throwIfAborted();
      const final = encoder.finish();
      if (parsed.stream) { res.end(final.frames); } else sendJson(res, 200, final.response);
    } catch (err) { failProviderRequest(res, provider, err, controller, executor, encoder.fail); }
  };

  // ----------------------------- The Anthropic door (POST /v1/messages, GET /v1/models) ----------------------------- //

  // Anthropic-door traffic is told apart from OpenAI-door traffic on the shared routes by the headers only an
  // Anthropic client sends. Slice #44 verified `anthropic-version || x-api-key` cleanly separates them (a
  // Bearer-only OpenAI client hits neither), so this is the live door selector.
  const isAnthropicFlavored = (req: http.IncomingMessage): boolean =>
    !!(req.headers['anthropic-version'] || req.headers['x-api-key']);

  // #156: previous_message_id chain — remembers each Anthropic response's message id per conversation so
  // the next request can name it and the server's cache diagnosis has a compare target. One instance per
  // Bridge host; only the Anthropic arm below reads/writes it.
  const diagnosisChain = createAnthropicDiagnosisChain();

  // #162: the growth tracker — same per-conversation keying as the chain, remembers read+creation so
  // the next turn can tell healthy incremental growth from a real partial re-bill. Only the Anthropic
  // door's cache-health log consults it.
  const growthTracker = createAnthropicCacheGrowthTracker();

  // Resolve a normalized request + routed Provider to a BridgeStreamEvent stream, doing the creds/client check
  // EAGERLY so a signed-out (401) / keyless (400) provider is caught before any SSE head is written. Same five
  // kinds as the OpenAI door's executor table, but NOT that table: this door's arms carry request shaping the
  // records deliberately don't have — the #139 stable/volatile system split, the #156 diagnosis chain, vision,
  // documents, and non-strict tools (Claude Code's rich schemas). Folding them together would move those onto
  // the other door's wire, so the shared piece is the error answer, not the request. #191 added the fourth arm
  // (Antigravity) and is the standing proof that this chain must be edited by hand: adding an executor record
  // does NOT add a Provider here, it only makes the fall-through say `has no API key configured`.
  // ponytail: send params match the records (tool_choice 'auto'); the forced tool_choice + temperature #45
  // carries on `parsed` are not yet threaded to the backend (each backend's tool_choice API differs) — the
  // background tip call degrades to a no-op, as slice #44 observed. Wire them through if that call must fire.
  // onQuota (#171) is threaded ONLY by the door's base pass — the reviewer sub-call and advisor continuations
  // spend from the same account, but the snapshot describes the user's turn, so the last writer must be it.
  const startProviderStream = async (
    parsed: BridgeAnthropicRequest, provider: Provider, pinnedModel: string | undefined, controller: AbortController,
    onQuota?: (meters: QuotaMeter[]) => void,
  ): Promise<{ ok: false; status: number; message: string } | { ok: true; events: AsyncIterable<BridgeStreamEvent>; model: string; contextWindow?: number }> => {
    // A routed Target's pinned model (#51) beats the Provider's panel-selected model — this request only.
    const modelId = pinnedModel ?? resolveModel(deps.modelMap(), provider);
    const baseUrl = resolveBaseUrl(provider, deps.customBaseUrl());
    // Claude Code's /effort (output_config.effort, #47) wins over the panel effort when present — the badge
    // Claude Code shows next to the model then matches what the backend actually runs.
    const effort = parsed.effort ?? deps.effort();
    if (isCodexProvider(provider)) {
      const creds = await deps.codexCreds();
      if (!creds) return { ok: false, status: 401, message: `provider '${provider.id}' is not signed in` };
      const turns = parsed.turns.map((t) => ({ role: t.role, content: t.text, images: t.images, toolCalls: t.toolCalls, toolResults: t.toolResults }));
      const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...turns] : turns;
      // Non-strict tools: the door forwards an external client's toolset, and Codex strict mode rejects the
      // rich schemas Claude Code's tools carry (dynamic maps / propertyNames). strict:false passes them through.
      const modelInfo = (await codexCatalog.get({ creds, baseUrl })).models.find((m) => m.id === modelId);
      const upstream = codexStream({ creds, baseUrl, model: modelId, modelInfo, messages, effort, tools: toCodexResponsesTools(parsed.tools, false), toolChoice: 'auto', sessionId: parsed.sessionId, signal: controller.signal, onQuota });
      return { ok: true, events: mapOAuthStream(upstream), model: modelId, contextWindow: modelInfo?.contextWindow };
    }
    if (isAnthropicProvider(provider)) {
      const creds = await deps.anthropicCreds();
      if (!creds) return { ok: false, status: 401, message: `provider '${provider.id}' is not signed in` };
      // images and documents must ride along (the Codex + keyed paths already forward images) — omitting
      // images here was the door's vision hole: inline attaches never reached the Anthropic backend.
      // rawContent is the thinking-passthrough sidecar — Anthropic-only, the other arms leave it unread.
      const turns = parsed.turns.map((t) => ({ role: t.role, content: t.text, textBlocks: t.textBlocks, images: t.images, documents: t.documents, toolCalls: t.toolCalls, toolResults: t.toolResults, rawContent: t.rawContent }));
      // #139: with a recorded split, only the STABLE side rides as the system message (it takes the cache
      // marker); the volatile tail threads separately and lands after the breakpoint, so a mid-session
      // <system-reminder> append re-bills itself, not the whole tools+system prefix. No split → full system.
      const sys = parsed.systemSplit?.stable ?? parsed.system;
      const messages = sys ? [{ role: 'system' as const, content: sys }, ...turns] : turns;
      // #156: name the conversation's previous response so the server's cache diagnosis has a compare
      // target, and record this response's id for the next turn. Keyed off the same messages + tool lineup
      // the request ships (model + first user turn + tool names — #158: the advisor tool arrives in
      // parsed.tools already, so each prefix variant chains its own previous message) — advisor
      // continuation passes chain through here too.
      const tools = toAnthropicTools(parsed.tools);
      const upstream = anthropicStream({ creds, baseUrl, model: modelId, messages, effort, tools, toolChoice: 'auto', systemSuffix: parsed.systemSplit?.volatile || undefined, previousMessageId: diagnosisChain.previousIdFor(modelId, messages, tools), signal: controller.signal, onQuota });
      return { ok: true, events: mapOAuthStream(upstream, (id) => diagnosisChain.record(modelId, messages, id, tools)), model: modelId };
    }
    if (isXaiProvider(provider)) {
      const creds = await deps.xaiCreds?.();
      if (!creds) return { ok: false, status: 401, message: `provider '${provider.id}' is not signed in` };
      const turns = parsed.turns.map((t) => ({ role: t.role, content: t.text, images: t.images, toolCalls: t.toolCalls, toolResults: t.toolResults }));
      const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...turns] : turns;
      // Non-strict tools: the door forwards an external client's toolset (same reason as the Codex arm above).
      const upstream = xaiStream({ creds, baseUrl, model: modelId, messages, effort, tools: toCodexResponsesTools(parsed.tools, false), toolChoice: 'auto', signal: controller.signal });
      return { ok: true, events: mapOAuthStream(upstream), model: modelId };
    }
    if (isAntigravityProvider(provider)) {
      const creds = await deps.antigravityCreds?.();
      if (!creds) return { ok: false, status: 401, message: `provider '${provider.id}' is not signed in` };
      // Refused before anything opens, same reason string as the OpenAI door's record: the image row is
      // listed (it is real) but no door has an image-output channel. Both doors must say the same thing.
      if (isAntigravityImageModel(modelId)) return { ok: false, status: 400, message: antigravityImageRefusal(modelId) };
      // Documents ride alongside images — this wire has ONE attachment shape (inlineData), so a PDF differs
      // from a PNG by mimeType only. #186 confirmed the upstream accepts both. textBlocks/rawContent are
      // Anthropic-wire sidecars with no counterpart here: a replayed thinking block has nothing to become,
      // so it is dropped and only the turn's text survives — deliberately, not an oversight.
      const turns = parsed.turns.map((t) => ({ role: t.role, content: t.text, images: t.images, documents: t.documents, toolCalls: t.toolCalls, toolResults: t.toolResults }));
      // The FULL system, not systemSplit.stable — unlike the Anthropic arm above. The split exists to place
      // a cache breakpoint, and this wire has no breakpoint to place; taking `stable` alone would silently
      // drop the volatile tail (the mid-session <system-reminder> append) from every request.
      const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...turns] : turns;
      // Effort reaches only the '-tiered' rows — every other id on this wire pins its own reasoning depth
      // (gemini-3.1-pro-low vs -high are two models, not one with a dial), so applyAntigravityThinkingLevel
      // drops the level for them rather than overriding a tier the user picked by picking the row. The fold
      // to this wire's three stops happens here before calling the provider's adapter.
      // No tool strictness knob: buildAntigravityTools already cleans Claude Code's rich schemas for this
      // wire, so the door's `false` strict flag has no equivalent to pass. The stream already speaks
      // BridgeStreamEvent, so unlike the three arms above it needs no mapOAuthStream hop.
      return { ok: true, events: antigravityStream({ creds, baseUrl, model: modelId, messages, tools: parsed.tools, thinkingLevel: standardEffortToAntigravity(effort), signal: controller.signal }), model: modelId };
    }
    const client = await deps.clientFor(provider);
    if (!client) return { ok: false, status: 400, message: `provider '${provider.id}' has no API key configured` };
    const base = buildOpenAiChatMessages(parsed.turns);
    const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...base] : base;
    const tools = toOpenAiTools(parsed.tools);
    // #169: same opt-in as the OpenAI door's keyed executor — this is the tail Claude Code actually goes through.
    const upstream = await client.chat.completions.create(
      { model: modelId, messages, stream: true, stream_options: { include_usage: true }, ...(tools.length ? { tools, tool_choice: 'auto' as const } : {}) },
      { signal: controller.signal },
    );
    return { ok: true, events: mapKeyedStream(upstream), model: modelId };
  };

  // POST /v1/messages — the Anthropic door. Parse the Messages body → route (a Provider-id model to that
  // Provider, an unrecognized id — notably the background tier's raw claude-* — to the Active Provider) →
  // stream the provider's reply back as Anthropic SSE via the #45 encoder. Claude Code always streams, so this
  // is SSE-only. message_start echoes the model the client requested (raw, pre-alias-strip).
  const handleAnthropicMessages = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    let body: unknown;
    try { body = JSON.parse(await readBody(req)); } catch { return sendError(res, 400, 'request body is not valid JSON'); }

    const parsed = parseAnthropicMessagesRequest(body as Parameters<typeof parseAnthropicMessagesRequest>[0]);
    // #145: system turns ride in `turns` now — a body with ONLY those still has no conversation to send
    // (the build would hoist them and ship an empty messages array upstream; fail loud here instead).
    if (!parsed.turns.some((t) => t.role !== 'system')) return sendError(res, 400, 'no messages to send');

    // The Routing map (#51) picks the answering Provider: Provider id → Alias → Family fuzzy (the
    // background tier's raw claude-* ids land here when their family row is set) → Active fallback.
    const route = routeFor(parsed.model);
    if (!route) return sendError(res, 404, `unknown provider '${parsed.model}'`);
    const provider = route.provider;

    // One line per door call: whose effort won — Claude Code's /effort (output_config.effort) or the panel's
    // — plus how many images the request carried (the vision observable: 0 here means the client never sent
    // pixels; >0 means any blindness is downstream of the door).
    const imageCount = parsed.turns.reduce((n, t) => n + (t.images?.length ?? 0), 0);
    // The advisor observable: whether the request carried the server tool + which model will review (the door
    // now plays the server role — a dangling advisor call was the old failure). off when Claude Code didn't send it.
    const advisorNote = parsed.advisor ? ` advisor=${parsed.advisor.model ?? 'default'}` : '';
    deps.log(`[bridge] messages ${provider.id} effort=${parsed.effort ?? deps.effort()} (${parsed.effort ? 'claude code' : 'panel'}) images=${imageCount}${advisorNote}`);

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const requested = (body as { model?: unknown }).model;
    const meta: AnthropicSseMeta = { id: `msg_${crypto.randomBytes(12).toString('hex')}`, model: typeof requested === 'string' ? requested : parsed.model };

    // Advisor (server tool): the base pass carries the synthetic `advisor` tool so the Target can call it,
    // and the reviewer sub-call routes the picker's advisor model through the Routing map (Stage 4). Absent
    // an advisor tool this whole block is skipped and the door behaves exactly as before.
    const advisorTools = parsed.advisor ? [...parsed.tools, advisorToolSpec()] : parsed.tools;
    // #171: the base pass's quota headers, captured off the response head (see the clients' onQuota). Stays
    // undefined for a Provider that reports none — the snapshot then carries no meters at all.
    let quotaMeters: QuotaMeter[] | undefined;
    // The reviewer: hand the advisor Target the conversation + the review instruction, no tools, drain its
    // text as the advice. Its own model route is the picker's choice (claude-wisp- stripped like body.model),
    // falling back to the base route so the Target advises itself when no separate advisor model resolves.
    const reviewer = async (turns: NormalizedTurn[]): Promise<ReviewerVerdict> => {
      const advModel = (parsed.advisor?.model ?? '').replace(/^claude-wisp-/, '');
      const advRoute = (advModel ? routeFor(advModel) : undefined) ?? route;
      // The reviewer request is the quarantined shape built by buildReviewerRequest (reviewerSystem() only,
      // systemSplit stripped, no tools, conversation flattened to ONE plain-text user turn) — constructed in
      // core so the quarantine is unit-tested; see #142 for the spread-copied-systemSplit regression.
      const r = await startProviderStream(buildReviewerRequest(parsed, turns), advRoute.provider, advRoute.pinnedModel, controller);
      if (!r.ok) throw new Error(r.message);
      // Drain text as the advice and keep the sub-call's own usage aside (#143): it reports the RESOLVED
      // Target model (honest even when routing pinned the reviewer off-catalog), and it must never touch
      // this request's lastUsage — top-level usage / the #111 cache guard read the base pass only.
      let text = '';
      let usage: BridgeUsage | undefined;
      for await (const ev of r.events) {
        if (ev.type === 'text') text += ev.text;
        else if (ev.type === 'usage') usage = ev.usage;
      }
      return { text: text.trim(), usage, model: r.model };
    };

    try {
      // #168: same bounded retry as the OpenAI door, over this door's own request shaping. Only the eager base
      // pass is retried — an advisor continuation pass below is mid-conversation, so content has already been
      // delivered and re-opening it would discard the turn.
      const result = await openPrimed(provider, executorFor(provider), controller, () =>
        startProviderStream({ ...parsed, tools: advisorTools }, provider, route.pinnedModel, controller, (m) => { quotaMeters = m; }));
      if (!result.ok) return sendError(res, result.status, result.message);

      // The event source: with an advisor tool, the door plays the server role via runAdvisorLoop (the first
      // base pass reuses the eager stream above so a signed-out provider still 4xxs before headers; later
      // continuation passes call the backend fresh). Without one, it's the plain single-pass stream.
      let eventsSource: AsyncIterable<BridgeStreamEvent> = result.events;
      if (parsed.advisor) {
        let firstPass = true;
        const basePass = (turns: NormalizedTurn[]): AsyncIterable<BridgeStreamEvent> => {
          if (firstPass) { firstPass = false; return result.events; }
          return (async function* () {
            const r = await startProviderStream({ ...parsed, turns, tools: advisorTools }, provider, route.pinnedModel, controller);
            if (!r.ok) throw new Error(r.message);
            yield* r.events;
          })();
        };
        eventsSource = runAdvisorLoop({ turns: parsed.turns, basePass, reviewer });
      }

      // Non-streaming request (notably Claude Code's /model validation probe): buffer the provider stream
      // into one JSON Messages object with a usage block. The door used to always stream — handing an SSE
      // body to a client that parses usage.input_tokens is what crashed /model. A mid-stream error falls to
      // the catch below with the head not yet sent, so a clean JSON error goes out, not a torn stream.
      if (!parsed.stream) {
        const events: BridgeStreamEvent[] = [];
        for await (const ev of eventsSource) events.push(ev);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(buildAnthropicMessageResponse(events, meta)));
        return;
      }

      // #166: prime BEFORE the head — this door is Claude Code's route, so it is where a pre-stream rejection
      // used to become a 200 with an empty body (or, once headers were out, an unclassifiable 502). The base
      // pass arrives already primed from openPrimed; only the advisor loop can still throw on its first pull.
      const primed = parsed.advisor ? await primeStream(eventsSource) : eventsSource;

      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const enc = createAnthropicSseEncoder(meta);
      // message_start is deferred until the first upstream usage event (the Anthropic wire's first frame,
      // arriving near-instantly) so it carries the real input/cache counts — not synthesized zeros. Usage
      // rides via setUsage, never a content frame; the final usage event updates the closing message_delta.
      // A provider that emits no usage (non-Anthropic through this door) starts on its first content instead.
      let started = false;
      let lastUsage: BridgeUsage | undefined;               // message_delta carries the final cumulative counts
      let lastDiagnosis: { messageId: string; missReason?: AnthropicCacheMissReason } | undefined; // #156: message_start's server diagnosis
      const ensureStarted = (): void => { if (!started) { res.write(enc.start()); started = true; } };
      for await (const ev of primed) {
        if (ev.type === 'usage') { lastUsage = ev.usage; enc.setUsage(ev.usage); ensureStarted(); continue; }
        // #156: door-internal like usage — never a wire frame (the door's synthesized message_start doesn't
        // carry diagnostics; inbound passthrough is deliberately not built, same call as the betas).
        if (ev.type === 'diagnosis') { lastDiagnosis = ev; continue; }
        ensureStarted();
        res.write(enc.push(ev));
      }
      ensureStarted();
      res.write(enc.finish());
      res.end();
      // #171: the statusline snapshot — the turn's real cost + the account's utilization, for the bridged
      // Claude Code session's badge. Written from THIS door only: it is the route Claude Code takes, and the
      // statusline exists nowhere else. lastUsage absent (a Provider that reports none) → buildStatus omits
      // every context field rather than writing a zero.
      // ponytail: streaming path only. The non-streaming branch above is Claude Code's /model validation
      // probe, not a turn — recording it would overwrite a real reading with a probe's.
      deps.recordStatus?.(buildStatus({ now: Date.now(), provider, model: result.model, usage: lastUsage, meters: quotaMeters, contextWindow: result.contextWindow }));
      // Cache-health check (#111 regression guard): only the Anthropic OAuth path reports real cache tokens,
      // and only a probable MISS or PARTIAL is worth a line — a healthy hit/fresh turn stays silent so the
      // log isn't noise.
      if (isAnthropicProvider(provider)) {
        // #145: system turns don't count toward the ≥3-turn gate — a first exchange carrying two hook
        // reminders is not "past the first exchange".
        const convoTurns = parsed.turns.filter((t) => t.role !== 'system').length;
        // #162: classify this turn against the conversation's previous read+creation baseline — every
        // usage-carrying turn records (the baseline must track through healthy turns), the verdict is
        // consumed only by the heuristic PARTIAL branch below. Key parity with the diagnosis chain:
        // same first-user-turn text, same tool lineup (advisorTools is what actually shipped).
        const growth = lastUsage
          ? growthTracker.classify(result.model, parsed.turns.map((t) => ({ role: t.role, content: t.text })), advisorTools, lastUsage)
          : undefined;
        // #156: the server's own diagnosis is authoritative when it reports a break — reason + magnitude,
        // no inference. A null diagnosis does NOT silence the heuristic below: it also means "no compare
        // target" (first bridged turn, evicted chain entry), and the heuristic's known false-positive rate
        // is already low (~1/392 post-#145).
        // #156: the server verdict is authoritative ONLY when the bill agrees with it. A STALE verdict (the
        // bill contradicts the claimed miss) is untrustworthy, so it must NOT suppress the heuristic below —
        // that suppression was the #162 blind spot: a genuine tail re-bill hid behind a STALE line saying
        // "not a real miss", so the "prior write not read back" line could never fire (fix, 2.0.47).
        const staleVerdict = Boolean(lastDiagnosis?.missReason) && !!lastUsage
          && anthropicDiagnosisStale(lastDiagnosis!.missReason!.cacheMissedInputTokens, lastUsage);
        const authoritativeServerMiss = Boolean(lastDiagnosis?.missReason) && !staleVerdict;
        if (staleVerdict)
          deps.log(`[bridge] prompt-cache diagnosis STALE ${provider.id} ${parsed.model}: reason=${lastDiagnosis!.missReason!.type} missed_input=${lastDiagnosis!.missReason!.cacheMissedInputTokens} but billed=${lastUsage!.cache_creation_input_tokens + lastUsage!.input_tokens} read=${lastUsage!.cache_read_input_tokens} turns=${convoTurns} — bill contradicts the verdict: stale compare target (concurrent send or prefix-variant flip), not a real miss (#156)`);
        if (authoritativeServerMiss) {
          deps.log(`[bridge] prompt-cache MISS (server) ${provider.id} ${parsed.model}: reason=${lastDiagnosis!.missReason!.type} missed_input=${lastDiagnosis!.missReason!.cacheMissedInputTokens} read=${lastUsage?.cache_read_input_tokens ?? 0} creation=${lastUsage?.cache_creation_input_tokens ?? 0} turns=${convoTurns} (#156)`);
        } else if (lastUsage) {
          // Runs for a STALE verdict (fell through — the server compare was untrustworthy) AND for a null
          // diagnosis (no compare target). Only a non-stale server MISS above suppresses it.
          const outcome = anthropicCacheOutcome(lastUsage, convoTurns);
          if (outcome.kind === 'miss') deps.log(`[bridge] prompt-cache MISS ${provider.id} ${parsed.model}: read=${outcome.readTokens} creation=${outcome.creationTokens} uncached_input=${outcome.uncachedInput} turns=${convoTurns} — prefix re-billed uncached, check cache breakpoints (#111)`);
          // #162: a partial whose read swallowed the previous turn's write is incremental growth — the
          // cache working as designed, not a re-bill. Silent. Only a stalled read (prior write not read
          // back) or a baseline-less first sighting still earns the advisory line.
          else if (outcome.kind === 'partial' && growth?.kind !== 'grew') {
            if (growth?.kind === 'stalled') {
              // 2.1.0: on a Fable/Mythos model this stall is the backend re-billing a slice of its own thinking,
              // not a Wisp cache break — Claude Code's request shape is identical on Fable and Opus, Wisp rebuilds
              // Fable thinking blocks byte-for-byte, and Opus 5 on the same session reads back exactly. Name the
              // class; only a model that reads back exactly earns the "check your breakpoints" instruction.
              const verdict = isFableFamilyModel(result.model)
                ? 'known Fable backend re-bill, not a Wisp cache break (Opus 5 on this wire reads back exactly)'
                : 'real history re-bill';
              deps.log(`[bridge] prompt-cache PARTIAL ${provider.id} ${parsed.model}: read=${outcome.readTokens} expected>=${growth.expectedRead} creation=${outcome.creationTokens} turns=${convoTurns} — prior write not read back: ${verdict} (#162)`);
            }
            else deps.log(`[bridge] prompt-cache PARTIAL ${provider.id} ${parsed.model}: read=${outcome.readTokens} creation=${outcome.creationTokens} uncached_input=${outcome.uncachedInput} turns=${convoTurns} — probable history re-bill behind a stable prefix (#145)`);
          }
        }
      }
    } catch (err) {
      // Head already out (mid-stream failure) → the shared answer writes a proper Anthropic `error` event so
      // Claude Code shows the real message instead of "empty or malformed"; otherwise a clean status.
      failProviderRequest(res, provider, err, controller, executorFor(provider), anthropicErrorFrame);
    }
  };

  // ----------------------------- Routing ----------------------------- //

  // Route one request: the access secret is enforced on EVERY request before any routing.
  const handle = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    if (!authOk(req, deps.accessSecret())) return sendError(res, 401, 'invalid or missing access secret');
    const url = req.url ?? '';
    // Both doors share /v1/models — the Anthropic client's headers select the Anthropic-shaped list.
    if (req.method === 'GET' && url.startsWith('/v1/models')) {
      return isAnthropicFlavored(req) ? handleAnthropicModels(res) : handleModels(res);
    }
    // Exact path only — /v1/messages/count_tokens must fall through to the 404, not the messages door.
    if (req.method === 'POST' && (url === '/v1/messages' || url.startsWith('/v1/messages?'))) return handleAnthropicMessages(req, res);
    if (req.method === 'POST' && (url === '/v1/responses' || url.startsWith('/v1/responses?'))) return handleResponses(req, res);
    if (req.method === 'POST' && url.startsWith('/v1/chat/completions')) return handleChat(req, res);
    return sendError(res, 404, `no route for ${req.method} ${url}`);
  };

  // Start the listener, resolving on 'listening' and rejecting on a bind error so the caller can report a port
  // clash (user story 15). server is set only on a successful bind, so isRunning() stays honest.
  const start = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (server) return resolve();
      const s = http.createServer((req, res) => {
        handle(req, res).catch((err) => {
          deps.log(`[bridge] unhandled ${String(err)}`);
          if (res.headersSent) res.end(); else sendError(res, 500, 'internal error');
        });
      });
      s.on('error', (err) => { server = undefined; reject(err); });
      s.listen(deps.port(), '127.0.0.1', () => { server = s; deps.log(`[bridge] listening on 127.0.0.1:${deps.port()}`); resolve(); });
    });

  const stop = (): void => { if (server) { server.close(); server = undefined; deps.log('[bridge] stopped'); } };

  // dispose === stop, so the handle drops straight onto context.subscriptions and closes on deactivate.
  return { start, stop, isRunning: () => !!server, dispose: stop };
};

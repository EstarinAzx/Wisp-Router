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
import {
  Provider, resolveModel, resolveBaseUrl, buildOpenAiChatMessages, toOpenAiTools, toCodexResponsesTools,
  toAnthropicTools, assembleToolCalls, buildChatModelInfos, standardEffortToCodex, isCodexProvider, isAnthropicProvider,
  type ToolCallDelta, type AssembledToolCall, type CodexCreds, type AnthropicCreds, type EffortLevel,
} from './catalog';
import { codexStream } from './codexClient';
import { anthropicStream } from './anthropicClient';
import {
  parseOpenAiChatRequest, buildModelsList, textChunk, toolCallChunk, finalChunk, sseLine, SSE_DONE,
  type ChunkMeta, type FinishReason, type BridgeChatRequest, type BridgeStreamEvent,
} from './bridge';
import {
  parseAnthropicMessagesRequest, buildAnthropicModelsList, createAnthropicSseEncoder, type AnthropicSseMeta,
} from './bridgeAnthropic';

// ----------------------------- Dependencies ----------------------------- //

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
  effort: () => EffortLevel;                                      // the panel's reasoning Effort — same value the chat path + Inquire use
  activeProviderId: () => string;                                // the panel's Active Provider — the default route for a non-id model (#b: Copilot sends the resolved model name)
  port: () => number;                                             // 127.0.0.1 listen port (wisp.bridge.port)
  accessSecret: () => string;                                     // required Bearer on every request
  log: (message: string) => void;
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
const sendError = (res: http.ServerResponse, status: number, message: string): void => sendJson(res, status, { error: { message } });

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
        : isAnthropicProvider(p) ? await deps.anthropicSignedIn() : !!(await deps.keyFor(p))] as const));
    return buildChatModelInfos(deps.providers, {
      keyed: Object.fromEntries(keyedPairs),
      modelMap: deps.modelMap(),
      customBaseUrl: deps.customBaseUrl(),
    });
  };

  // GET /v1/models — the OpenAI-door discovery list (one entry per usable Provider id).
  const handleModels = async (res: http.ServerResponse): Promise<void> =>
    sendJson(res, 200, buildModelsList(await computeModelInfos()));

  // GET /v1/models — the Anthropic-door discovery list: the same usable Providers in Anthropic shape, ids
  // aliased claude-wisp-<id> so Claude Code's /model picker lists them (slice #44's decision).
  const handleAnthropicModels = async (res: http.ServerResponse): Promise<void> =>
    sendJson(res, 200, buildAnthropicModelsList(await computeModelInfos()));

  // POST /v1/chat/completions for the `codex` Provider — the Responses stream behind the ChatGPT sign-in,
  // rendered back through the SAME bridge.ts SSE emitters the keyed path uses (so the wire shape is identical).
  // No API key: creds come from the OAuth seam (codexAuth via deps), so a signed-out state is a clean 401, not
  // a crash. Mirrors chatProvider.ts's Codex branch — only the in/out edges differ (HTTP body, not vscode parts).
  const handleCodexChat = async (parsed: BridgeChatRequest, provider: Provider, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const creds = await deps.codexCreds();
    if (!creds) return sendError(res, 401, `provider '${provider.id}' is not signed in`);

    const modelId = resolveModel(deps.modelMap(), provider);
    const baseUrl = resolveBaseUrl(provider, deps.customBaseUrl());
    // bridge.ts lifts system OUT of the turns; Codex consumes it as `instructions`, so re-attach it as the
    // leading system message buildCodexResponsesBody folds into instructions (its only role:'system' source).
    const turns = parsed.turns.map((t) => ({ role: t.role, content: t.text, images: t.images, toolCalls: t.toolCalls, toolResults: t.toolResults }));
    const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...turns] : turns;
    const tools = toCodexResponsesTools(parsed.tools);

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const meta: ChunkMeta = { id: `chatcmpl-${crypto.randomBytes(12).toString('hex')}`, model: parsed.model, created: Math.floor(Date.now() / 1000) };
    // codexStream yields text fragments live and the assembled tool calls at stream end (whole), so unlike the
    // chat-completions path there are no fragments to reduce — collect the calls and emit each as one chunk.
    const calls: AssembledToolCall[] = [];
    try {
      const upstream = codexStream({ creds, baseUrl, model: modelId, messages, effort: standardEffortToCodex(deps.effort()), tools, toolChoice: 'auto', signal: controller.signal });
      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        for await (const ev of upstream) {
          if (ev.type === 'text') { if (ev.value) res.write(sseLine(textChunk(ev.value, meta))); }
          else calls.push(ev.call);
        }
        calls.forEach((call, i) => res.write(sseLine(toolCallChunk(call, i, meta))));
        res.write(sseLine(finalChunk(calls.length ? 'tool_calls' : 'stop', meta)));
        res.write(SSE_DONE);
        res.end();
      } else {
        // Non-streaming client: drain the same stream into one chat.completion object.
        let text = '';
        for await (const ev of upstream) {
          if (ev.type === 'text') text += ev.value;
          else calls.push(ev.call);
        }
        sendJson(res, 200, buildCompletion(meta, text, calls));
      }
    } catch (err) {
      if (controller.signal.aborted) { res.end(); return; } // client hung up — normal, not a failure
      deps.log(`[bridge] error ${provider.id} ${String(err)}`);
      // A signed-out / refresh-failed Codex throws here — a clean 502 (or end if the SSE head is already out).
      if (res.headersSent) res.end(); else sendError(res, 502, `provider request failed: ${String(err)}`);
    }
  };

  // POST /v1/chat/completions for the `anthropic` Provider — the Messages SSE stream behind the Claude.ai
  // sign-in, rendered back through the SAME bridge.ts SSE emitters the keyed/Codex paths use (identical wire
  // shape). No API key: creds come from the OAuth seam (anthropicAuth via deps), so a signed-out state is a
  // clean 401, and refresh failure mid-stream a 502. Mirrors handleCodexChat — only the cores differ.
  const handleAnthropicChat = async (parsed: BridgeChatRequest, provider: Provider, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const creds = await deps.anthropicCreds();
    if (!creds) return sendError(res, 401, `provider '${provider.id}' is not signed in`);

    const modelId = resolveModel(deps.modelMap(), provider);
    const baseUrl = resolveBaseUrl(provider, deps.customBaseUrl());
    // bridge.ts lifts system OUT of the turns; buildAnthropicMessagesBody lifts a role:'system' message back
    // to the top-level `system`, so re-attach it as the leading system message. Images are dropped (the chat
    // path's toAnthropicMessages drops them too — Anthropic image support is a separate follow-up).
    const turns = parsed.turns.map((t) => ({ role: t.role, content: t.text, toolCalls: t.toolCalls, toolResults: t.toolResults }));
    const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...turns] : turns;
    const tools = toAnthropicTools(parsed.tools);

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const meta: ChunkMeta = { id: `chatcmpl-${crypto.randomBytes(12).toString('hex')}`, model: parsed.model, created: Math.floor(Date.now() / 1000) };
    // anthropicStream yields text fragments live and the assembled tool calls at stream end (whole) — same
    // shape as codexStream, so the rendering is identical: collect the calls, emit each as one chunk.
    const calls: AssembledToolCall[] = [];
    try {
      const upstream = anthropicStream({ creds, baseUrl, model: modelId, messages, effort: deps.effort(), tools, toolChoice: 'auto', signal: controller.signal });
      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        for await (const ev of upstream) {
          if (ev.type === 'text') { if (ev.value) res.write(sseLine(textChunk(ev.value, meta))); }
          else calls.push(ev.call);
        }
        calls.forEach((call, i) => res.write(sseLine(toolCallChunk(call, i, meta))));
        res.write(sseLine(finalChunk(calls.length ? 'tool_calls' : 'stop', meta)));
        res.write(SSE_DONE);
        res.end();
      } else {
        // Non-streaming client: drain the same stream into one chat.completion object.
        let text = '';
        for await (const ev of upstream) {
          if (ev.type === 'text') text += ev.value;
          else calls.push(ev.call);
        }
        sendJson(res, 200, buildCompletion(meta, text, calls));
      }
    } catch (err) {
      if (controller.signal.aborted) { res.end(); return; } // client hung up — normal, not a failure
      deps.log(`[bridge] error ${provider.id} ${String(err)}`);
      // A signed-out / refresh-failed Anthropic throws here — a clean 502 (or end if the SSE head is already out).
      if (res.headersSent) res.end(); else sendError(res, 502, `provider request failed: ${String(err)}`);
    }
  };

  // POST /v1/chat/completions — parse → route to a keyed Provider → send via the OpenAI SDK → render the reply
  // back through bridge.ts's SSE emitters (or one chat.completion object when stream:false).
  const handleChat = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    let body: unknown;
    try { body = JSON.parse(await readBody(req)); } catch { return sendError(res, 400, 'request body is not valid JSON'); }

    const parsed = parseOpenAiChatRequest(body as Parameters<typeof parseOpenAiChatRequest>[0]);
    // The translator DEGRADES on malformed input (never throws): a body that yields no turns is a deliberate
    // 400 here, not a crash — don't lean on try/catch for this control flow.
    if (!parsed.turns.length) return sendError(res, 400, 'no messages to send');

    // A request naming a Provider id routes to it (curl can address any Provider explicitly). Anything else —
    // notably the resolved model NAME Copilot CLI sends as COPILOT_MODEL (#b: so its UI shows the real model,
    // not the Provider id) — falls back to the ACTIVE Provider. Trade: an unknown model no longer 404s, it
    // serves the active Provider (fine for a local single-user endpoint); the model actually used stays live
    // (resolveModel reads the panel per request), so a mid-session model switch is picked up without a relaunch.
    const provider = deps.providers.find((p) => p.id === parsed.model)
      ?? deps.providers.find((p) => p.id === deps.activeProviderId());
    if (!provider) return sendError(res, 404, `unknown provider '${parsed.model}'`);
    // The OAuth Providers route through their own streams (no API key): Codex → Responses (#39),
    // Anthropic → Messages (#40).
    if (isCodexProvider(provider)) return handleCodexChat(parsed, provider, req, res);
    if (isAnthropicProvider(provider)) return handleAnthropicChat(parsed, provider, req, res);
    const client = await deps.clientFor(provider);
    if (!client) return sendError(res, 400, `provider '${provider.id}' has no API key configured`);

    const modelId = resolveModel(deps.modelMap(), provider);
    // bridge.ts keeps system OUT of the turns; the OpenAI path re-prepends it as the leading system message.
    const base = buildOpenAiChatMessages(parsed.turns);
    const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...base] : base;
    const tools = toOpenAiTools(parsed.tools);

    // Bridge the client hanging up to an AbortController so the upstream call dies with the request.
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    try {
      const upstream = await client.chat.completions.create({
        model: modelId,
        messages,
        stream: true,
        ...(tools.length ? { tools, tool_choice: 'auto' as const } : {}),
      }, { signal: controller.signal });

      const meta: ChunkMeta = { id: `chatcmpl-${crypto.randomBytes(12).toString('hex')}`, model: parsed.model, created: Math.floor(Date.now() / 1000) };
      // Tool calls stream as fragments across chunks; collect them and assemble once the stream ends (whole),
      // exactly as the LM Chat Provider path does — bridge.ts then folds each into one tool_calls delta.
      const toolDeltas: ToolCallDelta[] = [];

      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        for await (const chunk of upstream) {
          const choice = chunk.choices[0];
          const delta = choice?.delta?.content ?? '';
          if (delta) res.write(sseLine(textChunk(delta, meta)));
          for (const tc of choice?.delta?.tool_calls ?? []) toolDeltas.push({ index: tc.index, id: tc.id, name: tc.function?.name, args: tc.function?.arguments });
        }
        assembleToolCalls(toolDeltas).forEach((call, i) => res.write(sseLine(toolCallChunk(call, i, meta))));
        const finish: FinishReason = toolDeltas.length ? 'tool_calls' : 'stop';
        res.write(sseLine(finalChunk(finish, meta)));
        res.write(SSE_DONE);
        res.end();
      } else {
        // Non-streaming client: drain the same upstream stream and answer with one chat.completion object.
        let text = '';
        for await (const chunk of upstream) {
          const choice = chunk.choices[0];
          text += choice?.delta?.content ?? '';
          for (const tc of choice?.delta?.tool_calls ?? []) toolDeltas.push({ index: tc.index, id: tc.id, name: tc.function?.name, args: tc.function?.arguments });
        }
        sendJson(res, 200, buildCompletion(meta, text, assembleToolCalls(toolDeltas)));
      }
    } catch (err) {
      if (controller.signal.aborted) { res.end(); return; } // client hung up — normal, not a failure
      deps.log(`[bridge] error ${provider.id} ${String(err)}`);
      // Once the SSE head is out there's no status left to set — just end; otherwise a clean 502.
      if (res.headersSent) res.end(); else sendError(res, 502, `provider request failed: ${String(err)}`);
    }
  };

  // ----------------------------- The Anthropic door (POST /v1/messages, GET /v1/models) ----------------------------- //

  // Anthropic-door traffic is told apart from OpenAI-door traffic on the shared routes by the headers only an
  // Anthropic client sends. Slice #44 verified `anthropic-version || x-api-key` cleanly separates them (a
  // Bearer-only OpenAI client hits neither), so this is the live door selector.
  const isAnthropicFlavored = (req: http.IncomingMessage): boolean =>
    !!(req.headers['anthropic-version'] || req.headers['x-api-key']);

  // Map a Codex/Anthropic provider stream (text fragments live, whole tool calls at end) onto the door-neutral
  // BridgeStreamEvent both doors render from. Empty text fragments are dropped (nothing to stream).
  const mapOAuthStream = async function* (
    upstream: AsyncIterable<{ type: 'text'; value: string } | { type: 'toolCall'; call: AssembledToolCall }>,
  ): AsyncGenerator<BridgeStreamEvent> {
    for await (const ev of upstream) {
      if (ev.type === 'text') { if (ev.value) yield { type: 'text', text: ev.value }; }
      else yield { type: 'tool_call', call: ev.call };
    }
  };

  // Map a keyed OpenAI-SDK stream onto BridgeStreamEvent. Tool calls arrive as fragments across chunks, so they
  // buffer and assemble whole once the stream ends (the same shape the LM Chat Provider path folds). Structural
  // chunk type (not the SDK's) keeps this in the module's hand-rolled-shape style.
  type KeyedChunk = { choices?: { delta?: { content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
  const mapKeyedStream = async function* (upstream: AsyncIterable<KeyedChunk>): AsyncGenerator<BridgeStreamEvent> {
    const toolDeltas: ToolCallDelta[] = [];
    for await (const chunk of upstream) {
      const choice = chunk.choices?.[0];
      const delta = choice?.delta?.content ?? '';
      if (delta) yield { type: 'text', text: delta };
      for (const tc of choice?.delta?.tool_calls ?? []) toolDeltas.push({ index: tc.index, id: tc.id, name: tc.function?.name, args: tc.function?.arguments });
    }
    for (const call of assembleToolCalls(toolDeltas)) yield { type: 'tool_call', call };
  };

  // Resolve a normalized request + routed Provider to a BridgeStreamEvent stream, doing the creds/client check
  // EAGERLY so a signed-out (401) / keyless (400) provider is caught before any SSE head is written. The three
  // provider kinds mirror the OpenAI door's own senders (handleChat/handleCodexChat/handleAnthropicChat).
  // ponytail: send params match those senders (tool_choice 'auto'); the forced tool_choice + temperature #45
  // carries on `parsed` are not yet threaded to the backend (each backend's tool_choice API differs) — the
  // background tip call degrades to a no-op, as slice #44 observed. Wire them through if that call must fire.
  const startProviderStream = async (
    parsed: BridgeChatRequest, provider: Provider, controller: AbortController,
  ): Promise<{ ok: false; status: number; message: string } | { ok: true; events: AsyncIterable<BridgeStreamEvent> }> => {
    const modelId = resolveModel(deps.modelMap(), provider);
    const baseUrl = resolveBaseUrl(provider, deps.customBaseUrl());
    if (isCodexProvider(provider)) {
      const creds = await deps.codexCreds();
      if (!creds) return { ok: false, status: 401, message: `provider '${provider.id}' is not signed in` };
      const turns = parsed.turns.map((t) => ({ role: t.role, content: t.text, images: t.images, toolCalls: t.toolCalls, toolResults: t.toolResults }));
      const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...turns] : turns;
      const upstream = codexStream({ creds, baseUrl, model: modelId, messages, effort: standardEffortToCodex(deps.effort()), tools: toCodexResponsesTools(parsed.tools), toolChoice: 'auto', signal: controller.signal });
      return { ok: true, events: mapOAuthStream(upstream) };
    }
    if (isAnthropicProvider(provider)) {
      const creds = await deps.anthropicCreds();
      if (!creds) return { ok: false, status: 401, message: `provider '${provider.id}' is not signed in` };
      const turns = parsed.turns.map((t) => ({ role: t.role, content: t.text, toolCalls: t.toolCalls, toolResults: t.toolResults }));
      const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...turns] : turns;
      const upstream = anthropicStream({ creds, baseUrl, model: modelId, messages, effort: deps.effort(), tools: toAnthropicTools(parsed.tools), toolChoice: 'auto', signal: controller.signal });
      return { ok: true, events: mapOAuthStream(upstream) };
    }
    const client = await deps.clientFor(provider);
    if (!client) return { ok: false, status: 400, message: `provider '${provider.id}' has no API key configured` };
    const base = buildOpenAiChatMessages(parsed.turns);
    const messages = parsed.system ? [{ role: 'system' as const, content: parsed.system }, ...base] : base;
    const tools = toOpenAiTools(parsed.tools);
    const upstream = await client.chat.completions.create(
      { model: modelId, messages, stream: true, ...(tools.length ? { tools, tool_choice: 'auto' as const } : {}) },
      { signal: controller.signal },
    );
    return { ok: true, events: mapKeyedStream(upstream) };
  };

  // POST /v1/messages — the Anthropic door. Parse the Messages body → route (a Provider-id model to that
  // Provider, an unrecognized id — notably the background tier's raw claude-* — to the Active Provider) →
  // stream the provider's reply back as Anthropic SSE via the #45 encoder. Claude Code always streams, so this
  // is SSE-only. message_start echoes the model the client requested (raw, pre-alias-strip).
  const handleAnthropicMessages = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    let body: unknown;
    try { body = JSON.parse(await readBody(req)); } catch { return sendError(res, 400, 'request body is not valid JSON'); }

    const parsed = parseAnthropicMessagesRequest(body as Parameters<typeof parseAnthropicMessagesRequest>[0]);
    if (!parsed.turns.length) return sendError(res, 400, 'no messages to send');

    // A model naming a Provider id routes to it; anything else (the background tier's raw claude-* id) falls
    // back to the Active Provider — so a mid-session background call never 404s.
    const provider = deps.providers.find((p) => p.id === parsed.model)
      ?? deps.providers.find((p) => p.id === deps.activeProviderId());
    if (!provider) return sendError(res, 404, `unknown provider '${parsed.model}'`);

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const requested = (body as { model?: unknown }).model;
    const meta: AnthropicSseMeta = { id: `msg_${crypto.randomBytes(12).toString('hex')}`, model: typeof requested === 'string' ? requested : parsed.model };

    try {
      const result = await startProviderStream(parsed, provider, controller);
      if (!result.ok) return sendError(res, result.status, result.message);

      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const enc = createAnthropicSseEncoder(meta);
      res.write(enc.start());
      for await (const ev of result.events) res.write(enc.push(ev));
      res.write(enc.finish());
      res.end();
    } catch (err) {
      if (controller.signal.aborted) { res.end(); return; } // client hung up — normal, not a failure
      deps.log(`[bridge] error ${provider.id} ${String(err)}`);
      // A signed-out / refresh-failed OAuth provider throws here — a clean 502 (or end if the SSE head is out).
      if (res.headersSent) res.end(); else sendError(res, 502, `provider request failed: ${String(err)}`);
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

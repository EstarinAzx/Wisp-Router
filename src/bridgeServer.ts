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
  Provider, resolveModel, buildOpenAiChatMessages, toOpenAiTools, assembleToolCalls, buildChatModelInfos,
  isCodexProvider, isAnthropicProvider, type ToolCallDelta,
} from './catalog';
import {
  parseOpenAiChatRequest, buildModelsList, textChunk, toolCallChunk, finalChunk, sseLine, SSE_DONE,
  type ChunkMeta, type FinishReason,
} from './bridge';

// ----------------------------- Dependencies ----------------------------- //

// The seam to extension.ts. Key/client resolution lives there (it reads SecretStorage); this module is handed
// the catalog plus pure getters so it never touches secrets or config directly.
export type BridgeDeps = {
  providers: Provider[];
  modelMap: () => Record<string, string>;                         // current per-Provider model memory
  customBaseUrl: () => string;                                    // wisp.baseUrl (only Custom resolves from it)
  keyFor: (provider: Provider) => Promise<string>;                // resolved key, '' when none — gates /v1/models
  clientFor: (provider: Provider) => Promise<OpenAI | undefined>; // built {baseUrl, key} client, undefined when keyless
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

// Constant-time Bearer check. timingSafeEqual throws on a length mismatch, so the length guard runs first —
// it leaks only the secret's length, which a high-entropy random secret can afford.
const authOk = (req: http.IncomingMessage, secret: string): boolean => {
  const match = /^Bearer (.+)$/.exec(req.headers['authorization'] ?? '');
  if (!match) return false;
  const given = Buffer.from(match[1]);
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

  // GET /v1/models — the usable Provider ids. Keyed = has a key; Codex/Anthropic stay hidden until their send
  // paths land (#39/#40), so they are forced false here. caps is omitted: the list only needs ids, so the
  // conservative default windows are fine (no models.dev fetch to stall on).
  const handleModels = async (res: http.ServerResponse): Promise<void> => {
    const keyedPairs = await Promise.all(deps.providers.map(async (p) =>
      [p.id, isCodexProvider(p) || isAnthropicProvider(p) ? false : !!(await deps.keyFor(p))] as const));
    const infos = buildChatModelInfos(deps.providers, {
      keyed: Object.fromEntries(keyedPairs),
      modelMap: deps.modelMap(),
      customBaseUrl: deps.customBaseUrl(),
    });
    sendJson(res, 200, buildModelsList(infos));
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

    const provider = deps.providers.find((p) => p.id === parsed.model);
    if (!provider) return sendError(res, 404, `unknown provider '${parsed.model}'`);
    // Keyed Providers only this slice — the subscription kinds get their own streams in #39/#40.
    if (isCodexProvider(provider) || isAnthropicProvider(provider)) return sendError(res, 400, `provider '${provider.id}' is not yet reachable over the Bridge`);
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

  // Route one request: the access-secret Bearer is enforced on EVERY request before any routing.
  const handle = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    if (!authOk(req, deps.accessSecret())) return sendError(res, 401, 'invalid or missing access secret');
    const url = req.url ?? '';
    if (req.method === 'GET' && url.startsWith('/v1/models')) return handleModels(res);
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

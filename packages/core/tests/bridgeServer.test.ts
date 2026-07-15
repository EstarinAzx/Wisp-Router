// ---------------- bridgeServer.test.ts — Grok dispatch through both Bridge doors (#95) ---------------- //

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createServer } from 'http';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { createBridgeServer, type BridgeDeps } from '../src/bridgeServer';
import type { Provider } from '../src/catalog';

// The Grok catalog row — id 'xai', the subscription-proxy base (grok-build routes there).
const GROK: Provider = { id: 'xai', label: 'Grok', baseUrl: 'https://cli-chat-proxy.grok.com/v1', defaultModel: 'grok-build', apiKeyEnv: '', kind: 'xai-oauth' };

// A canned Grok Responses SSE stream (same wire as Codex): one text delta + a clean terminal frame.
const grokSse = (): Response => {
  const text =
    'event: response.output_text.delta\ndata: {"delta":"Hello from Grok"}\n\n' +
    'event: response.completed\ndata: {"response":{"output":[{"type":"message","content":[{"type":"output_text","text":"Hello from Grok"}]}]}}\n\n';
  const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } });
  return new Response(body, { status: 200 });
};

// Grab a free loopback port so the test server never clashes with a fixed one.
const freePort = (): Promise<number> => new Promise((resolve, reject) => {
  const s = createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const p = (s.address() as AddressInfo).port; s.close(() => resolve(p)); });
});

// Minimal BridgeDeps — only the xai path + routing + auth matter here; every other resolver is inert.
const makeDeps = (over: Partial<BridgeDeps>): BridgeDeps => ({
  providers: [GROK],
  modelMap: () => ({}),
  customBaseUrl: () => '',
  keyFor: async () => '',
  clientFor: async () => undefined,
  codexSignedIn: async () => false,
  codexCreds: async () => undefined,
  anthropicSignedIn: async () => false,
  anthropicCreds: async () => undefined,
  xaiSignedIn: async () => true,
  xaiCreds: async () => ({ accessToken: 'tok' }),
  effort: () => 'medium',
  activeProviderId: () => 'xai',
  routingMap: () => ({ families: {}, aliases: [] }),
  aliasPickerShowsModel: () => false,
  aliasOnlyModels: () => false,
  port: () => 0,
  accessSecret: () => 'secret',
  log: () => {},
  ...over,
});

// POST over node http (NOT fetch — fetch is stubbed for the upstream xai call) → { status, body }.
const post = (port: number, path: string, payload: unknown): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Authorization: 'Bearer secret' } },
      (res) => { let body = ''; res.setEncoding('utf8'); res.on('data', (c) => (body += c)); res.on('end', () => resolve({ status: res.statusCode ?? 0, body })); },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });

// Stand up the real listener on a free port, run the assertions, always tear it down.
const runServer = async (deps: BridgeDeps, fn: (port: number) => Promise<void>): Promise<void> => {
  const port = await freePort();
  const server = createBridgeServer({ ...deps, port: () => port });
  await server.start();
  try { await fn(port); } finally { server.stop(); }
};

describe('Bridge — Grok dispatch (#95)', () => {
  afterEach(() => vi.unstubAllGlobals());

  // OpenAI door: a Grok Target streams its reply back as OpenAI chat.completion SSE.
  it('streams a Grok Target through the OpenAI door (/v1/chat/completions)', async () => {
    vi.stubGlobal('fetch', async () => grokSse());
    await runServer(makeDeps({}), async (port) => {
      const { status, body } = await post(port, '/v1/chat/completions', { model: 'xai', stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(200);
      expect(body).toContain('Hello from Grok');
    });
  });

  // Anthropic door: the same Grok Target streams back as Anthropic Messages SSE (this IS Claude Code's route).
  it('streams a Grok Target through the Anthropic door (/v1/messages)', async () => {
    vi.stubGlobal('fetch', async () => grokSse());
    await runServer(makeDeps({}), async (port) => {
      const { status, body } = await post(port, '/v1/messages', { model: 'xai', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(200);
      expect(body).toContain('Hello from Grok');
    });
  });

  // Signed-out Grok on the OpenAI door → a clean 401, NOT an empty SSE envelope (the #87/#88 failure mode).
  it('returns a real 401 for a signed-out Grok Target on the OpenAI door', async () => {
    await runServer(makeDeps({ xaiCreds: async () => undefined }), async (port) => {
      const { status, body } = await post(port, '/v1/chat/completions', { model: 'xai', stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(401);
      expect(body).not.toContain('data:'); // an error, not a silent event-stream
    });
  });

  // Signed-out Grok on the Anthropic door → a clean 401 before any SSE head (checked eagerly in startProviderStream).
  it('returns a real 401 for a signed-out Grok Target on the Anthropic door', async () => {
    await runServer(makeDeps({ xaiCreds: async () => undefined }), async (port) => {
      const { status } = await post(port, '/v1/messages', { model: 'xai', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(401);
    });
  });

  // Non-streaming /v1/messages — Claude Code's `/model` validation probe. Must be a JSON Messages object
  // carrying a usage block, NOT an SSE stream: reading usage.input_tokens off an event-stream body is what
  // crashed /model with "undefined is not an object (evaluating 'B.usage.input_tokens')".
  it('answers a non-streaming /v1/messages with a JSON Messages object carrying usage.input_tokens', async () => {
    vi.stubGlobal('fetch', async () => grokSse());
    await runServer(makeDeps({}), async (port) => {
      const { status, body } = await post(port, '/v1/messages', { model: 'xai', max_tokens: 100, stream: false, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(200);
      expect(body).not.toContain('event:'); // a JSON body, never an SSE stream
      const parsed = JSON.parse(body);
      expect(parsed.type).toBe('message');
      expect(typeof parsed.usage.input_tokens).toBe('number');
      expect(parsed.content).toEqual([{ type: 'text', text: 'Hello from Grok' }]);
      expect(parsed.stop_reason).toBe('end_turn');
    });
  });
});

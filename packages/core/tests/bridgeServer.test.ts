// ---------------- bridgeServer.test.ts — Grok dispatch through both Bridge doors (#95) ---------------- //

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createServer } from 'http';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { createBridgeServer, type BridgeDeps } from '../src/bridgeServer';
import { MAX_PROVIDER_ATTEMPTS, TRANSIENT_FAILURES_BEFORE_COOLDOWN, TRANSIENT_COOLDOWN_SECONDS, DEFAULT_COOLDOWN_SECONDS, type RoutingMap } from '../src/routing';
import { ANTIGRAVITY_QUOTA_EXHAUSTED_CODE, antigravityImageRefusal } from '../src/catalog';
import type { Provider } from '../src/catalog';
import { codexCatalog } from '../src/codexModels';

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

describe('exact Codex routes through every public Bridge door', () => {
  it.each(['/v1/responses', '/v1/messages', '/v1/chat/completions'])('reads independent routes live on %s and fails invalid Targets', async path => {
    const sent: any[] = [], logs: string[] = [];
    vi.stubGlobal('fetch', async (_url: unknown, init: RequestInit) => { sent.push(JSON.parse(init.body as string)); return grokSse(); });
    const second = { ...GROK, id: 'second' };
    const map: RoutingMap = { families: {}, aliases: [], codexModels: {
      'native-mini': { providerId: 'xai', model: 'mini-target' },
      'native-spark': { providerId: 'second', model: 'spark-target' },
    } };
    try {
      await runServer(makeDeps({ providers: [GROK, second], routingMap: () => map, log: line => logs.push(line) }), async port => {
        const request = (model: string) => post(port, path, { model, stream: true,
          ...(path === '/v1/responses' ? { input: 'hi', store: false } : { max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }) });
        for (const model of ['native-mini', 'native-spark']) { const reply = await request(model); expect(reply.status, reply.body).toBe(200); }
        expect(sent.map(b => b.model)).toEqual(['mini-target', 'spark-target']);
        expect(logs.some(l => l.includes("route codex-model 'native-spark' -> second model=spark-target"))).toBe(true);
        map.aliases.push({ name: 'native-mini', target: { providerId: 'second', model: 'alias-target' } });
        expect((await request('native-mini')).status).toBe(200);
        expect(sent.at(-1).model).toBe('alias-target');
        map.aliases = [];
        delete map.codexModels!['native-mini'];
        expect((await request('native-mini')).status).toBe(200);
        expect(sent.at(-1).model).toBe(GROK.defaultModel);
        map.codexModels!['native-mini'] = { providerId: 'missing', model: 'bad' };
        expect((await request('native-mini')).status).toBe(404);
        expect(sent).toHaveLength(4);
        map.codexModels!['native-mini'] = { providerId: 'xai', model: '' };
        expect((await request('native-mini')).status).toBe(500);
        expect(sent).toHaveLength(4);
      });
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('Codex catalogue capabilities through both Bridge doors', () => {
  it.each(['/v1/messages', '/v1/chat/completions'].flatMap((path) =>
    ['max', 'future-depth'].map((effort) => [path, effort])))('preserves a future model on %s with %s effort', async (path, effort) => {
    const model = { id: 'future-name-nano', name: 'Future', visible: true, reasoningEfforts: ['medium', 'max', 'future-depth'], defaultEffort: 'medium', contextWindow: 345_000 };
    const discovery = vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [model] });
    const bodies: any[] = [];
    vi.stubGlobal('fetch', async (_url: unknown, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string)); return grokSse();
    });
    const provider: Provider = { id: 'codex', label: 'Codex', kind: 'codex', baseUrl: 'https://codex.example', defaultModel: model.id, apiKeyEnv: '' };
    try {
      await runServer(makeDeps({ providers: [provider], activeProviderId: () => 'codex', effort: () => path === '/v1/messages' ? 'medium' : effort,
        codexSignedIn: async () => true, codexCreds: async () => ({ accessToken: 'test-token', accountId: 'test-account' }),
      }), async (port) => {
        const reply = await post(port, path, { model: 'codex', stream: true, max_tokens: 10,
          output_config: { effort }, messages: [{ role: 'user', content: 'hi' }] });
        expect(reply.status).toBe(200);
        expect(bodies).toHaveLength(1);
        expect(bodies[0]).toMatchObject({ model: model.id, reasoning: { effort } });
      });
    } finally { discovery.mockRestore(); vi.unstubAllGlobals(); }
  });
});

describe('Codex conversation cache continuity', () => {
  it('keeps session identity and the prompt prefix across turns, without sharing independent sessions', async () => {
    const model = { id: 'gpt-6-astra', name: 'Astra', visible: true, reasoningEfforts: ['low'], defaultEffort: 'low' };
    const discovery = vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [model] });
    const sent: { headers: Headers; body: any }[] = [];
    vi.stubGlobal('fetch', async (_url: unknown, init: RequestInit) => {
      sent.push({ headers: new Headers(init.headers), body: JSON.parse(init.body as string) });
      return grokSse();
    });
    const provider: Provider = { id: 'codex', label: 'Codex', kind: 'codex', baseUrl: 'https://codex.example', defaultModel: model.id, apiKeyEnv: '' };
    const sessionA = '11111111-1111-4111-8111-111111111111';
    const sessionB = '22222222-2222-4222-8222-222222222222';
    const metadata = (session_id: string) => ({ user_id: JSON.stringify({ device_id: 'device', account_uuid: 'private-account', session_id }) });
    try {
      await runServer(makeDeps({ providers: [provider], activeProviderId: () => 'codex',
        codexSignedIn: async () => true, codexCreds: async () => ({ accessToken: 'test-token', accountId: 'test-account' }),
      }), async (port) => {
        const first = { model: 'codex', stream: true, system: 'stable rules', metadata: metadata(sessionA), messages: [{ role: 'user', content: 'hi' }] };
        expect((await post(port, '/v1/messages', first)).status).toBe(200);
        expect((await post(port, '/v1/messages', { ...first, messages: [
          ...first.messages, { role: 'assistant', content: 'hello' }, { role: 'system', content: 'late note' }, { role: 'user', content: 'continue' },
        ] })).status).toBe(200);
        expect((await post(port, '/v1/messages', { ...first, metadata: metadata(sessionB) })).status).toBe(200);
        for (const value of [undefined, undefined, { user_id: '{invalid' }, metadata('bad\r\nheader')]) {
          expect((await post(port, '/v1/messages', { ...first, metadata: value })).status).toBe(200);
        }
      });
      expect(sent).toHaveLength(7);
      expect(sent[0].headers.get('session_id')).toBe(sessionA);
      expect(sent[1].headers.get('session_id')).toBe(sessionA);
      expect(sent[2].headers.get('session_id')).toBe(sessionB);
      const fallbacks = sent.slice(3).map(s => s.headers.get('session_id'));
      expect(new Set(fallbacks).size).toBe(4);
      for (const id of fallbacks) expect(id).toMatch(/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i);
      expect(sent[1].body.instructions).toBe('stable rules');
      expect(sent[1].body.input.slice(0, sent[0].body.input.length)).toEqual(sent[0].body.input);
      expect(sent[1].body.input[2]).toEqual({ type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'late note' }] });
      expect(JSON.stringify(sent)).not.toContain('private-account');
    } finally { discovery.mockRestore(); vi.unstubAllGlobals(); }
  });
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

// GET over node http, with extra headers so the Anthropic door's header selector can be exercised.
const get = (port: number, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET', headers: { Authorization: 'Bearer secret', ...headers } },
      (res) => { let body = ''; res.setEncoding('utf8'); res.on('data', (c) => (body += c)); res.on('end', () => resolve({ status: res.statusCode ?? 0, body })); },
    );
    req.on('error', reject);
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

// #166: a failed Codex turn used to leave either door as `502 provider request failed`, whatever went wrong.
// A 502 tells Claude Code "the server broke, retry" — so it retried an oversized conversation that could only
// get bigger. These assert the door answers with the classified status instead, on BOTH doors, and that an
// unrecognised failure still stays a 502.
describe('Bridge — classified Codex failures (#166)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const CODEX: Provider = { id: 'codex', label: 'Codex', baseUrl: 'https://chatgpt.com/backend-api/codex', defaultModel: 'gpt-5.4', apiKeyEnv: '', kind: 'codex' };

  // Deps whose only usable Provider is Codex, signed in with the account id the Responses request requires.
  const codexDeps = (over: Partial<BridgeDeps> = {}): BridgeDeps => makeDeps({
    providers: [CODEX],
    codexSignedIn: async () => true,
    codexCreds: async () => ({ accessToken: 'tok', accountId: 'acct' }),
    xaiSignedIn: async () => false,
    xaiCreds: async () => undefined,
    activeProviderId: () => 'codex',
    ...over,
  });

  // The recorded failure verbatim (#163): the backend rejects on its own window with a 400 naming the cause.
  const windowRejection = () => new Response(
    '{"error":{"message":"Your input exceeds the context window of this model.","type":"invalid_request_error","code":"context_length_exceeded"}}',
    { status: 400 },
  );

  // OpenAI door — the exceeded window comes back as a client error naming the cause, not a gateway error.
  it('answers an exceeded context window with 400 on the OpenAI door', async () => {
    vi.stubGlobal('fetch', async () => windowRejection());
    await runServer(codexDeps(), async (port) => {
      const { status, body } = await post(port, '/v1/chat/completions', { model: 'codex', stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(400);
      expect(JSON.parse(body).error.type).toBe('invalid_request_error');
    });
  });

  // Anthropic door — THIS is Claude Code's route, and the one where a 502 caused the retry loop.
  it('answers an exceeded context window with 400 on the Anthropic door', async () => {
    vi.stubGlobal('fetch', async () => windowRejection());
    await runServer(codexDeps(), async (port) => {
      const { status } = await post(port, '/v1/messages', { model: 'codex', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(400);
    });
  });

  // An expired / revoked credential is an authentication error, so the user is told to sign in again.
  it('answers an unavailable credential with 401', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":{"message":"Missing bearer token.","type":"authentication_error"}}', { status: 401 }));
    await runServer(codexDeps(), async (port) => {
      const { status } = await post(port, '/v1/messages', { model: 'codex', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(401);
    });
  });

  // The safety property, end to end: a genuine upstream outage must NOT be relabelled a client error.
  it('keeps 502 for an unrecognised upstream failure', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":{"message":"internal server error"}}', { status: 500 }));
    await runServer(codexDeps(), async (port) => {
      const { status } = await post(port, '/v1/chat/completions', { model: 'codex', stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(502);
    });
  });

  // The operator's handle on the four cases: the Bridge log names the classified code.
  it('logs the classified code', async () => {
    vi.stubGlobal('fetch', async () => windowRejection());
    const lines: string[] = [];
    await runServer(codexDeps({ log: (m) => lines.push(m) }), async (port) => {
      await post(port, '/v1/chat/completions', { model: 'codex', stream: true, messages: [{ role: 'user', content: 'hi' }] });
    });
    expect(lines.some((l) => l.includes('context_length_exceeded'))).toBe(true);
  });
});

// #168: a transient upstream failure used to cost the user the whole turn. These assert the retry only fires
// where NOTHING was delivered, never fires for a failure #166 classified, is bounded, and that repeated
// failures put the provider on the SHORT cooldown channel.
describe('Bridge — transient retry and cooldown (#168)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const CODEX: Provider = { id: 'codex', label: 'Codex', baseUrl: 'https://chatgpt.com/backend-api/codex', defaultModel: 'gpt-5.4', apiKeyEnv: '', kind: 'codex' };

  const codexDeps = (over: Partial<BridgeDeps> = {}): BridgeDeps => makeDeps({
    providers: [CODEX],
    codexSignedIn: async () => true,
    codexCreds: async () => ({ accessToken: 'tok', accountId: 'acct' }),
    xaiSignedIn: async () => false,
    xaiCreds: async () => undefined,
    activeProviderId: () => 'codex',
    ...over,
  });

  // A clean Responses turn (the Codex/Grok wire): one text delta then the terminal frame.
  const goodSse = (): Response => {
    const text =
      'event: response.output_text.delta\ndata: {"delta":"recovered"}\n\n' +
      'event: response.completed\ndata: {"response":{"output":[{"type":"message","content":[{"type":"output_text","text":"recovered"}]}]}}\n\n';
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } });
    return new Response(body, { status: 200 });
  };

  // A 200 that delivers a delta and THEN breaks — the case that must never be retried. Enqueue-then-error in
  // one tick would NOT model this: controller.error() discards the queue, so the delta would never be read.
  // Driving it from pull() makes the delta genuinely reach the consumer before the socket drops.
  const partialThenBreak = (): Response => {
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (!sent) {
          sent = true;
          c.enqueue(new TextEncoder().encode('event: response.output_text.delta\ndata: {"delta":"half a "}\n\n'));
          return;
        }
        c.error(new Error('socket hang up'));
      },
    });
    return new Response(body, { status: 200 });
  };

  const badGateway = () => new Response('{"error":{"message":"internal server error"}}', { status: 500 });

  // Count upstream attempts so "was it retried" is an observable, not an inference.
  const countingFetch = (responses: (() => Response)[]) => {
    const state = { calls: 0 };
    vi.stubGlobal('fetch', async () => {
      const make = responses[Math.min(state.calls, responses.length - 1)];
      state.calls += 1;
      return make();
    });
    return state;
  };

  it('retries a stream that failed before delivering anything (OpenAI door)', async () => {
    const state = countingFetch([badGateway, goodSse]);
    await runServer(codexDeps(), async (port) => {
      const { status, body } = await post(port, '/v1/chat/completions', { model: 'codex', stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(200);
      expect(body).toContain('recovered');
    });
    expect(state.calls).toBe(2);
  });

  // Claude Code's route — the one where losing the turn actually hurts.
  it('retries a stream that failed before delivering anything (Anthropic door)', async () => {
    const state = countingFetch([badGateway, goodSse]);
    await runServer(codexDeps(), async (port) => {
      const { status, body } = await post(port, '/v1/messages', { model: 'codex', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(200);
      expect(body).toContain('recovered');
    });
    expect(state.calls).toBe(2);
  });

  // Never discard delivered content: a torn stream surfaces what arrived, it does not start over.
  it('never retries a stream that already delivered content', async () => {
    const state = countingFetch([partialThenBreak]);
    await runServer(codexDeps(), async (port) => {
      const { status, body } = await post(port, '/v1/chat/completions', { model: 'codex', stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(200);
      expect(body).toContain('half a ');
    });
    expect(state.calls).toBe(1);
  });

  // A #166-classified failure cannot succeed on a retry, so it must not cost one.
  it('never retries a classified client error', async () => {
    const state = countingFetch([() => new Response('{"error":{"code":"context_length_exceeded","message":"too big"}}', { status: 400 })]);
    await runServer(codexDeps(), async (port) => {
      const { status } = await post(port, '/v1/chat/completions', { model: 'codex', stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(400);
    });
    expect(state.calls).toBe(1);
  });

  // The bound: a provider that is genuinely down fails the request, it does not retry forever.
  it('bounds the attempts and still answers 502 when they are exhausted', async () => {
    const state = countingFetch([badGateway]);
    await runServer(codexDeps(), async (port) => {
      const { status } = await post(port, '/v1/chat/completions', { model: 'codex', stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(502);
    });
    expect(state.calls).toBe(MAX_PROVIDER_ATTEMPTS);
  });

  // Repeated failed REQUESTS (not attempts) trip the short channel — and the log says so, with #168 not #161.
  it('cools the provider on the short channel after repeated failed requests', async () => {
    countingFetch([badGateway]);
    const lines: string[] = [];
    await runServer(codexDeps({ log: (m) => lines.push(m) }), async (port) => {
      for (let i = 0; i < TRANSIENT_FAILURES_BEFORE_COOLDOWN; i++)
        await post(port, '/v1/chat/completions', { model: 'codex', stream: true, messages: [{ role: 'user', content: 'hi' }] });
    });
    expect(lines.some((l) => l.includes('#168') && l.includes('retrying'))).toBe(true);
    const cooled = lines.find((l) => l.includes('#168') && l.includes('cooling down'));
    expect(cooled).toBeDefined();
    // The blip channel, never the plan-window one — #161's line is the multi-day answer.
    expect(cooled).not.toContain('#161');
    expect(cooled).toContain(`${TRANSIENT_COOLDOWN_SECONDS}s`);
  });
});

// ---------------- #169: API-key Providers report real token usage ---------------- //

// A plain OpenAI-compatible catalog row — no `kind`, so it falls through to the keyed executor.
const KEYED: Provider = { id: 'opencode-go', label: 'OpenCode Go', baseUrl: 'https://opencode.ai/zen/go/v1', defaultModel: 'gpt-x', apiKeyEnv: 'OPENCODE_API_KEY' };

// A stand-in for the OpenAI SDK client `deps.clientFor` hands back: yields the given chunks and records the
// request body, so a test can assert BOTH what was asked for and what came back.
const keyedClient = (chunks: unknown[], seen: { body?: any } = {}) => ({
  seen,
  client: {
    chat: {
      completions: {
        create: async (body: any) => {
          seen.body = body;
          return (async function* () { for (const c of chunks) yield c; })();
        },
      },
    },
  } as any,
});

// One text chunk, then the terminal usage chunk an opted-in stream sends — note its EMPTY choices array.
const KEYED_TEXT = { choices: [{ delta: { content: 'Hello from the key' } }] };
const KEYED_USAGE = { choices: [], usage: { prompt_tokens: 1000, prompt_tokens_details: { cached_tokens: 800 }, completion_tokens: 300 } };

const keyedDeps = (chunks: unknown[], seen: { body?: any } = {}): BridgeDeps => {
  const { client } = keyedClient(chunks, seen);
  return makeDeps({ providers: [KEYED], activeProviderId: () => 'opencode-go', clientFor: async () => client });
};

describe('Bridge — API-key Provider usage (#169)', () => {
  afterEach(() => vi.unstubAllGlobals());

  // The opt-in itself: chat-completions streams omit usage entirely unless the request asks for it, so both
  // keyed call sites must send stream_options. The OpenAI door's executor is the first of the two.
  it('asks for usage on the keyed stream from the OpenAI door', async () => {
    const seen: { body?: any } = {};
    await runServer(keyedDeps([KEYED_TEXT, KEYED_USAGE], seen), async (port) => {
      await post(port, '/v1/chat/completions', { model: 'opencode-go', stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(seen.body.stream_options).toEqual({ include_usage: true });
    });
  });

  // The second call site — startProviderStream's keyed tail, which is what Claude Code actually goes through.
  it('asks for usage on the keyed stream from the Anthropic door', async () => {
    const seen: { body?: any } = {};
    await runServer(keyedDeps([KEYED_TEXT, KEYED_USAGE], seen), async (port) => {
      await post(port, '/v1/messages', { model: 'opencode-go', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(seen.body.stream_options).toEqual({ include_usage: true });
    });
  });

  // The payoff: the final chunk's counts reach the client as real numbers, split by #165's convention —
  // cached prompt tokens in cache-read, the uncached remainder in input. Only the Anthropic door forwards
  // usage to the client, so this is the door the criterion is read through.
  it('reports the real counts on the Anthropic door, cached tokens split into cache-read', async () => {
    await runServer(keyedDeps([KEYED_TEXT, KEYED_USAGE]), async (port) => {
      const { status, body } = await post(port, '/v1/messages', { model: 'opencode-go', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(200);
      expect(body).toContain('Hello from the key');
      const delta = body.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6))).find((d) => d.type === 'message_delta');
      expect(delta.usage).toMatchObject({ input_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 800, output_tokens: 300 });
    });
  });

  // A Provider that IGNORES the opt-in sends no usage chunk at all. The turn must still complete cleanly, and
  // no usage event may be synthesized — the counts stay the encoder's zeroed default rather than a fake.
  it('completes cleanly with no usage event when the Provider ignores the opt-in', async () => {
    await runServer(keyedDeps([KEYED_TEXT]), async (port) => {
      const { status, body } = await post(port, '/v1/messages', { model: 'opencode-go', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(200);
      expect(body).toContain('Hello from the key');
      const delta = body.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6))).find((d) => d.type === 'message_delta');
      expect(delta.usage).toEqual({ output_tokens: 0 });
    });
  });

  // The usage chunk carries an EMPTY choices array; a reader that assumes every chunk has a choice would
  // mangle it. Nothing about the non-streaming reply may change — same text, same JSON shape as before.
  it('leaves a non-streaming keyed reply unaffected', async () => {
    await runServer(keyedDeps([KEYED_TEXT, KEYED_USAGE]), async (port) => {
      const { status, body } = await post(port, '/v1/chat/completions', { model: 'opencode-go', stream: false, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(200);
      expect(body).not.toContain('event:');
      expect(JSON.parse(body).choices[0].message.content).toBe('Hello from the key');
    });
  });
});

// ---------------- #190: Antigravity answers rate limits as 429 and seeds the long cooldown channel ---------------- //

/*
 * Every executor record used to return undefined from classify, so EVERY rate limit on every Provider left
 * the Bridge as a 502 — a gateway fault, which is neither what happened nor something a client can act on.
 * Antigravity is the first record to say 429. These drive the real listener, because the boundary that
 * matters (classified vs declined) is exactly where the bounded retry does or does not run.
 */
describe('Bridge — Antigravity rate limits (#190)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const ANTIGRAVITY: Provider = {
    id: 'antigravity', label: 'Antigravity', baseUrl: 'https://daily-cloudcode-pa.googleapis.com',
    defaultModel: 'gemini-3.1-pro-low', apiKeyEnv: '', kind: 'antigravity-oauth',
  };

  // projectId is a PLACEHOLDER on purpose — a real Cloud Code project id is account-identifying and never
  // belongs in this repo (see .context/decisions, 2026-07-29).
  const antigravityDeps = (over: Partial<BridgeDeps> = {}): BridgeDeps => makeDeps({
    providers: [ANTIGRAVITY],
    xaiSignedIn: async () => false,
    xaiCreds: async () => undefined,
    antigravitySignedIn: async () => true,
    antigravityCreds: async () => ({ accessToken: 'tok', projectId: 'example-project-1' }),
    activeProviderId: () => 'antigravity',
    ...over,
  });

  // The live 429 shape #189 actually received from the upstream.
  const quota429 = (reason: string, retryDelay?: string) => () => new Response(JSON.stringify({
    error: {
      code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Resource has been exhausted',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason },
        ...(retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : []),
      ],
    },
  }), { status: 429 });

  // A 429 moves to the next host before it surfaces, so ONE attempt is two upstream calls (#189's host walk).
  const CALLS_PER_ATTEMPT = 2;

  const countingFetch = (make: () => Response) => {
    const state = { calls: 0 };
    vi.stubGlobal('fetch', async () => { state.calls += 1; return make(); });
    return state;
  };

  const chat = (port: number) =>
    post(port, '/v1/chat/completions', { model: 'antigravity', stream: true, messages: [{ role: 'user', content: 'hi' }] });

  it('answers a spent quota window with 429, not 502, and does not spend the retries', async () => {
    const state = countingFetch(quota429('QUOTA_EXHAUSTED', '1h'));
    await runServer(antigravityDeps(), async (port) => {
      const { status, body } = await chat(port);
      expect(status).toBe(429);
      expect(JSON.parse(body).error.type).toBe('rate_limit_error');
    });
    expect(state.calls).toBe(CALLS_PER_ATTEMPT); // one attempt — a classified failure can never succeed on a retry
  });

  /*
   * The Anthropic door's own 429 lives in the #191 block below, where the arm that reaches it was added.
   * Nothing about the classification is per-door: BOTH doors answer through the one shared
   * failProviderRequest, which reads executorFor(provider).classify — so wiring #191's arm was all it took.
   */

  // At or above the instant-retry threshold the rate limit is the client's business, not a gateway fault.
  it('answers an at-threshold rate limit with 429', async () => {
    const state = countingFetch(quota429('RATE_LIMIT_EXCEEDED', '30s'));
    await runServer(antigravityDeps(), async (port) => {
      expect((await chat(port)).status).toBe(429);
    });
    expect(state.calls).toBe(CALLS_PER_ATTEMPT);
  });

  /*
   * The boundary, and the whole reason the verdict is carried on the Error rather than sniffed out of its
   * message: BELOW the threshold the pure layer declines, the raw upstream body (which says RESOURCE_EXHAUSTED
   * and RATE_LIMIT_EXCEEDED, exactly like a classified one) becomes the message, and the bounded retry must
   * still run. A message-matching classifier passes every test above and breaks this one.
   */
  it('leaves a below-threshold 429 to the bounded retry, and it stays a 502', async () => {
    const state = countingFetch(quota429('RATE_LIMIT_EXCEEDED', '1s'));
    await runServer(antigravityDeps(), async (port) => {
      expect((await chat(port)).status).toBe(502);
    });
    expect(state.calls).toBe(MAX_PROVIDER_ATTEMPTS * CALLS_PER_ATTEMPT);
  });

  /*
   * The operator's handle: the log names the classified code and the horizon it seeded. Driven ENOUGH TIMES
   * to trip the blip channel if the spent window were also counted there — a spent quota window must not
   * accumulate blip credit, or a genuine hiccup after the window resets would cool early on a streak it did
   * not earn. That is what "checked first, then return" in noteProviderError buys.
   */
  it('logs the classified code and cools on the LONG channel only, from the stated horizon', async () => {
    countingFetch(quota429('QUOTA_EXHAUSTED', '2h'));
    const lines: string[] = [];
    await runServer(antigravityDeps({ log: (m) => lines.push(m) }), async (port) => {
      for (let i = 0; i < TRANSIENT_FAILURES_BEFORE_COOLDOWN; i++) await chat(port);
    });
    expect(lines.some((l) => l.includes(ANTIGRAVITY_QUOTA_EXHAUSTED_CODE))).toBe(true);
    const cooled = lines.find((l) => l.includes('#190') && l.includes('cooling down'));
    expect(cooled).toContain('120m'); // the server's own 2h, not a default anyone picked
    expect(lines.some((l) => l.includes('#168') && l.includes('cooling down'))).toBe(false);
  });

  // A spent window the server gave no horizon for still cools — on #161's short default, never on nothing.
  it('falls back to the default horizon when the server stated none', async () => {
    countingFetch(quota429('QUOTA_EXHAUSTED'));
    const lines: string[] = [];
    await runServer(antigravityDeps({ log: (m) => lines.push(m) }), async (port) => { await chat(port); });
    const cooled = lines.find((l) => l.includes('#190') && l.includes('cooling down'));
    expect(cooled).toContain(`${Math.round(DEFAULT_COOLDOWN_SECONDS / 60)}m`);
  });
});

// ---------------- #191: the Anthropic door's Antigravity arm — Claude Code driven by Gemini ---------------- //

/*
 * The Anthropic door does NOT shape requests through the executor records: startProviderStream carries its
 * own hand-rolled per-kind chain, because the door owns wire behaviour the records cannot express (the #139
 * system split, the #156 diagnosis chain, vision/documents, non-strict tools). Before this ticket that chain
 * ran codex → anthropic → xai → keyed, so an Antigravity Target fell through to the keyed tail and answered
 * `400 has no API key configured` — a missing arm wearing a config mistake's error message.
 *
 * Every test here drives the REAL listener over `/v1/messages`, because the gap was unit-invisible by
 * construction: every OpenAI-door test passes with the arm absent.
 */
describe('Bridge — Antigravity on the Anthropic door (#191)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const ANTIGRAVITY: Provider = {
    id: 'antigravity', label: 'Antigravity', baseUrl: 'https://daily-cloudcode-pa.googleapis.com',
    defaultModel: 'gemini-3.1-pro-low', apiKeyEnv: '', kind: 'antigravity-oauth',
  };

  // projectId is a PLACEHOLDER — a real Cloud Code project id is account-identifying (see .context/decisions).
  const deps = (over: Partial<BridgeDeps> = {}): BridgeDeps => makeDeps({
    providers: [ANTIGRAVITY],
    xaiSignedIn: async () => false,
    xaiCreds: async () => undefined,
    antigravitySignedIn: async () => true,
    antigravityCreds: async () => ({ accessToken: 'tok', projectId: 'example-project-1' }),
    activeProviderId: () => 'antigravity',
    ...over,
  });

  /*
   * The separator the upstream really sends. NOT '\n\n' — #189 shipped a green suite over a fixture that had
   * been retyped rather than copied, normalising CRLF to LF, and the first live turn answered EMPTY at 200
   * because every frame was dropped. Keep these frames CRLF.
   */
  const FRAME = '\r\n\r\n';
  const sse = (...frames: string[]) =>
    new Response(frames.join(FRAME) + FRAME, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

  const textFrames = [
    'data: {"response":{"candidates":[{"content":{"role":"model","parts":[{"thought":true,"text":"weighing it up"},{"text":"Hello from Gemini"}]}}]}}',
    'data: {"response":{"candidates":[{"content":{"role":"model","parts":[{"text":""}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":3,"thoughtsTokenCount":7}}}',
  ];

  // The captured tool-call wire (#189's real capture): the upstream's own functionCall.id, never minted.
  const toolFrames = [
    'data: {"response":{"candidates":[{"content":{"role":"model","parts":[{"thoughtSignature":"EpUFCpIF","functionCall":{"name":"get_weather","args":{"city":"Paris"},"id":"noxjacvf"}}]}}]}}',
    'data: {"response":{"candidates":[{"content":{"role":"model","parts":[{"text":""}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":48,"candidatesTokenCount":16,"thoughtsTokenCount":138}}}',
  ];

  const messages = (port: number, over: Record<string, unknown> = {}) =>
    post(port, '/v1/messages', { model: 'antigravity', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'hi' }], ...over });

  // ----------------------------- A turn completes ----------------------------- //

  it('streams a Gemini turn through the Anthropic door', async () => {
    vi.stubGlobal('fetch', async () => sse(...textFrames));
    await runServer(deps(), async (port) => {
      const { status, body } = await messages(port);
      expect(status).toBe(200);
      expect(body).toContain('Hello from Gemini');
      expect(body).toContain('"type":"text_delta"');
    });
  });

  /*
   * Thinking surfaces where the door supports it — as a thinking block, NOT folded into the answer. The
   * check that matters is the second one: reasoning text reaching the client as answer text would read as
   * the model rambling its scratchpad into the reply.
   */
  it('surfaces thinking as a thinking block, never as answer text', async () => {
    vi.stubGlobal('fetch', async () => sse(...textFrames));
    await runServer(deps(), async (port) => {
      const { body } = await messages(port);
      expect(body).toContain('"type":"thinking_delta"');
      expect(body).toContain('weighing it up');
      // the reasoning is in a thinking_delta; no text_delta ever carries it
      const textDeltas = body.split('\n').filter((l) => l.includes('"type":"text_delta"'));
      expect(textDeltas.join('')).not.toContain('weighing it up');
    });
  });

  // Tool calling end to end: a tool_use block carrying the UPSTREAM's own id (never a minted one).
  it('round-trips a tool call through this door, keeping the upstream id', async () => {
    vi.stubGlobal('fetch', async () => sse(...toolFrames));
    await runServer(deps(), async (port) => {
      const { status, body } = await messages(port, {
        tools: [{ name: 'get_weather', description: 'weather', input_schema: { type: 'object', properties: { city: { type: 'string' } } } }],
      });
      expect(status).toBe(200);
      expect(body).toContain('"type":"tool_use"');
      expect(body).toContain('"id":"noxjacvf"');
      expect(body).toContain('get_weather');
      expect(body).toContain('"stop_reason":"tool_use"');
    });
  });

  // The tools the door forwards reach the wire as functionDeclarations — Claude Code's schemas, cleaned.
  it('forwards the door\'s tools to the wire as function declarations', async () => {
    let sent: any;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return sse(...toolFrames); });
    await runServer(deps(), async (port) => {
      await messages(port, { tools: [{ name: 'get_weather', description: 'weather', input_schema: { type: 'object', properties: { city: { type: 'string' } } } }] });
    });
    expect(sent.request.tools[0].functionDeclarations[0].name).toBe('get_weather');
  });

  // ----------------------------- What the door carries that the record does not ----------------------------- //

  /*
   * The door normalizes images AND documents into their own channels; this wire has one attachment shape, so
   * both land as inlineData parts. #186 answered the open question with a live yes to each, and leaving
   * documents unwired would repeat the door's old silent-vision hole with PDFs.
   */
  it('carries both an image and a document to the wire as inlineData parts', async () => {
    let sent: any;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return sse(...textFrames); });
    await runServer(deps(), async (port) => {
      await messages(port, { messages: [{ role: 'user', content: [
        { type: 'text', text: 'what are these' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBER' } },
      ] }] });
    });
    const parts = sent.request.contents[0].parts;
    expect(parts).toContainEqual({ inlineData: { mimeType: 'image/png', data: 'AAA' } });
    expect(parts).toContainEqual({ inlineData: { mimeType: 'application/pdf', data: 'JVBER' } });
  });

  /*
   * The FULL system rides, not systemSplit.stable. The Anthropic arm one branch up prefers `stable` because
   * the split places a CACHE BREAKPOINT — and this wire has no breakpoint to place, so taking `stable` alone
   * would silently drop the volatile tail (the mid-session <system-reminder> append) from every request.
   */
  it('sends the whole system prompt, including the volatile tail past the cache marker', async () => {
    let sent: any;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return sse(...textFrames); });
    await runServer(deps(), async (port) => {
      await messages(port, { system: [
        { type: 'text', text: 'STABLE RULES', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'VOLATILE REMINDER' },
      ] });
    });
    const system = JSON.stringify(sent.request.systemInstruction);
    expect(system).toContain('STABLE RULES');
    expect(system).toContain('VOLATILE REMINDER');
  });

  // ----------------------------- Refusals, before anything opens ----------------------------- //

  it('answers a signed-out Antigravity Target with 401 before any SSE head', async () => {
    await runServer(deps({ antigravityCreds: async () => undefined }), async (port) => {
      const { status, body } = await messages(port);
      expect(status).toBe(401);
      expect(body).not.toContain('data:'); // an error, not a silent event-stream
    });
  });

  // The same refusal string as the OpenAI door's record — one reason, both doors, or the model's absence
  // becomes a mystery on whichever door words it differently.
  it('refuses the image model here too, with the same reason', async () => {
    await runServer(deps({ modelMap: () => ({ antigravity: 'gemini-3.1-flash-image' }) }), async (port) => {
      const { status, body } = await messages(port);
      expect(status).toBe(400);
      expect(JSON.parse(body).error.message).toBe(antigravityImageRefusal('gemini-3.1-flash-image'));
    });
  });

  // ----------------------------- Routing: a family route and an Alias both answer ----------------------------- //

  it('answers through a family route pointing at an Antigravity Target', async () => {
    vi.stubGlobal('fetch', async () => sse(...textFrames));
    await runServer(deps({
      routingMap: () => ({ families: { sonnet: { providerId: 'antigravity', model: 'gemini-3.1-pro-low' } }, aliases: [] }),
    }), async (port) => {
      const { status, body } = await post(port, '/v1/messages', { model: 'claude-sonnet-4-5', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(200);
      expect(body).toContain('Hello from Gemini');
    });
  });

  it('answers through an Alias pointing at an Antigravity Target, with the Alias\'s pinned model', async () => {
    let sent: any;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return sse(...textFrames); });
    await runServer(deps({
      routingMap: () => ({ families: {}, aliases: [{ name: 'gem', target: { providerId: 'antigravity', model: 'gemini-3-flash' } }] }),
    }), async (port) => {
      const { status, body } = await post(port, '/v1/messages', { model: 'claude-wisp-gem', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'hi' }] });
      expect(status).toBe(200);
      expect(body).toContain('Hello from Gemini');
    });
    expect(sent.model).toBe('gemini-3-flash'); // the Alias's pin beat the Provider's panel model
  });

  // The door's own discovery list: Claude Code's /model picker reads THIS, and it aliases ids claude-wisp-<id>.
  it('lists a signed-in Antigravity in the door\'s own flavour', async () => {
    await runServer(deps(), async (port) => {
      const { status, body } = await get(port, '/v1/models', { 'anthropic-version': '2023-06-01' });
      expect(status).toBe(200);
      expect(JSON.parse(body).data.map((m: { id: string }) => m.id)).toContain('claude-wisp-antigravity');
    });
  });

  // ----------------------------- Failure: the 429, the retry boundary, the error frame ----------------------------- //

  const quota429 = () => new Response(JSON.stringify({
    error: {
      code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Resource has been exhausted',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'QUOTA_EXHAUSTED' },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '1h' },
      ],
    },
  }), { status: 429 });

  /*
   * #190's classification is door-neutral — both doors answer through the one shared failProviderRequest,
   * which reads executorFor(provider).classify. This is the pin that the arm inherits it rather than
   * re-implementing it: the arm contains no 429 handling at all.
   */
  it('answers a spent quota window with 429 on this door too, for free', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => { calls += 1; return quota429(); });
    await runServer(deps(), async (port) => {
      const { status, body } = await messages(port);
      expect(status).toBe(429);
      expect(JSON.parse(body).error.type).toBe('rate_limit_error');
    });
    expect(calls).toBe(2); // ONE attempt — a 429 walks both hosts before it surfaces; no retries spent
  });

  /*
   * The door's retry boundary, matched not widened: the eager BASE pass retries a transient failure, because
   * nothing has been delivered yet, and MAX_PROVIDER_ATTEMPTS bounds it.
   *
   * One call per attempt, not two: only a 429 and the CAPACITY 503 (recognized by its body) walk to the
   * second host — a generic 503 surfaces on the first, so the host chain does not multiply this budget.
   */
  it('retries a transient failure on the base pass, within the door\'s existing budget', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => { calls += 1; return new Response('upstream is down', { status: 503 }); });
    await runServer(deps(), async (port) => {
      expect((await messages(port)).status).toBe(502);
    });
    expect(calls).toBe(MAX_PROVIDER_ATTEMPTS);
  });

  /*
   * The other side of that boundary, and the reason the arm must not open its own retry: once the first
   * event is out the turn is committed. A failure after it is answered, never restarted — a retry here would
   * replay delivered content. ONE upstream call, and the door's error frame rather than a truncated stream.
   */
  it('emits the door\'s error frame on a mid-stream failure, and never restarts the turn', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      // The frame must be READ before the error: controller.error() discards whatever is still queued, so
      // enqueueing and erroring in the same tick would deliver nothing and fail before the head instead.
      let delivered = false;
      const body = new ReadableStream<Uint8Array>({
        pull(c) {
          if (delivered) return c.error(new Error('socket hang up'));
          delivered = true;
          c.enqueue(new TextEncoder().encode(`data: {"response":{"candidates":[{"content":{"parts":[{"text":"partial"}]}}]}}${FRAME}`));
        },
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    });
    await runServer(deps(), async (port) => {
      const { status, body } = await messages(port);
      expect(status).toBe(200);          // the head was already out — the failure cannot change it
      expect(body).toContain('partial'); // delivered content is kept, never discarded
      expect(body).toContain('event: error');
      expect(body).toContain('socket hang up');
    });
    expect(calls).toBe(1); // the bounded retry stops at the first delivered event
  });
});

// ---------------- #156/#162 (2.0.47): a STALE server verdict must not shadow the tail-rebill line ---------------- //

/*
 * Regression for the log blind spot: when the server sends a cache diagnosis the bill contradicts (STALE),
 * the door logged only the advisory "not a real miss" line and skipped the whole heuristic — including the
 * #162 "prior write not read back" line. So a genuine per-turn history re-bill (read frozen on the stable
 * prefix, creation growing) hid behind a message saying nothing was wrong. The fix lets a STALE verdict fall
 * through to the heuristic; only a NON-stale server MISS suppresses it.
 */
describe('Bridge — a STALE diagnosis still surfaces the #162 tail re-bill (2.0.47)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const ANTHROPIC: Provider = {
    id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-opus-5', apiKeyEnv: '', kind: 'anthropic-oauth',
  };
  const deps = (over: Partial<BridgeDeps> = {}): BridgeDeps => makeDeps({
    providers: [ANTHROPIC],
    xaiSignedIn: async () => false,
    xaiCreds: async () => undefined,
    anthropicSignedIn: async () => true,
    anthropicCreds: async () => ({ accessToken: 'tok', deviceId: 'd'.repeat(64), accountUuid: 'a' }),
    activeProviderId: () => 'anthropic',
    ...over,
  });

  // One Anthropic Messages SSE run: message_start carries the initial usage + optional cache diagnosis, the
  // text delta, then message_delta with the FINAL cumulative usage the door classifies on.
  const sse = (opts: { read: number; creation: number; missed?: number }): Response => {
    const start: Record<string, unknown> = { id: 'msg_x', usage: { input_tokens: 2 } };
    if (opts.missed !== undefined) start.diagnostics = { cache_miss_reason: { type: 'messages_changed', cache_missed_input_tokens: opts.missed } };
    const frames = [
      `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: start })}`,
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"text"}}',
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"ok"}}',
      `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 2, cache_creation_input_tokens: opts.creation, cache_read_input_tokens: opts.read, output_tokens: 40 } })}`,
      'event: message_stop\ndata: {"type":"message_stop"}',
    ];
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(frames.join('\n\n') + '\n\n')); c.close(); } });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };

  // Two turns of ONE conversation (same first user turn + no tools → same growth key). Turn 1 banks the
  // read+creation baseline; turn 2's read stalls below it (prior write NOT read back) AND the server sends a
  // STALE verdict. The stalled line must still fire.
  const T1 = [{ role: 'user', content: 'A' }, { role: 'assistant', content: 'B' }, { role: 'user', content: 'C' }];
  const T2 = [...T1, { role: 'assistant', content: 'D' }, { role: 'user', content: 'E' }];

  it('logs the #162 stalled re-bill even when the diagnosis verdict is STALE', async () => {
    const lines: string[] = [];
    // Turn 1: read=10000, creation=5000 (baseline: next expects read >= 15000), no diagnosis.
    // Turn 2: read=12000 (< 15000 → stalled), creation=5000 (>= 4000 → partial), missed=200000 (>> 2×bill → STALE).
    let call = 0;
    vi.stubGlobal('fetch', async () => (call++ === 0 ? sse({ read: 10000, creation: 5000 }) : sse({ read: 12000, creation: 5000, missed: 200000 })));
    await runServer(deps({ log: (m) => lines.push(m) }), async (port) => {
      await post(port, '/v1/messages', { model: 'anthropic', max_tokens: 100, stream: true, messages: T1 });
      await post(port, '/v1/messages', { model: 'anthropic', max_tokens: 100, stream: true, messages: T2 });
    });
    const t2 = lines.filter((l) => l.includes('turns=5'));
    expect(t2.some((l) => l.includes('diagnosis STALE'))).toBe(true);          // advisory still printed
    expect(t2.some((l) => l.includes('prior write not read back') && l.includes('#162'))).toBe(true); // no longer shadowed
  });

  /*
   * 2.1.0: the SAME stalled verdict on a Fable/Mythos-family model is the known backend re-bill, not a Wisp
   * cache break — proven by a same-session model control (2026-09-04): 40 consecutive Opus 5 turns on the
   * identical wire grew exactly (read(n+1) = read(n)+creation(n)) while the Fable turns beside them fell
   * 4-16k short every few turns. Claude Code's request shape is identical on both, and Wisp rebuilds Fable
   * thinking blocks byte-for-byte. So on Fable the line must name that class instead of sending the user
   * to chase cache breakpoints; on every other model the #162 wording is still the right instruction.
   */
  it('names the known Fable backend re-bill on a fable-family model instead of "real history re-bill"', async () => {
    const lines: string[] = [];
    let call = 0;
    vi.stubGlobal('fetch', async () => (call++ === 0 ? sse({ read: 10000, creation: 5000 }) : sse({ read: 12000, creation: 5000 })));
    await runServer(deps({ modelMap: () => ({ anthropic: 'claude-fable-5-1' }), log: (m) => lines.push(m) }), async (port) => {
      await post(port, '/v1/messages', { model: 'anthropic', max_tokens: 100, stream: true, messages: T1 });
      await post(port, '/v1/messages', { model: 'anthropic', max_tokens: 100, stream: true, messages: T2 });
    });
    const line = lines.find((l) => l.includes('turns=5') && l.includes('prior write not read back'));
    expect(line).toBeDefined();
    expect(line).toContain('known Fable backend re-bill');
    expect(line).not.toContain('real history re-bill');
  });

  // The control: the same stall on Opus keeps the #162 instruction, so a genuine cache break on a model
  // that reads back exactly is still called what it is.
  it('keeps the #162 "real history re-bill" wording on a non-fable model', async () => {
    const lines: string[] = [];
    let call = 0;
    vi.stubGlobal('fetch', async () => (call++ === 0 ? sse({ read: 10000, creation: 5000 }) : sse({ read: 12000, creation: 5000 })));
    await runServer(deps({ log: (m) => lines.push(m) }), async (port) => {
      await post(port, '/v1/messages', { model: 'anthropic', max_tokens: 100, stream: true, messages: T1 });
      await post(port, '/v1/messages', { model: 'anthropic', max_tokens: 100, stream: true, messages: T2 });
    });
    const line = lines.find((l) => l.includes('turns=5') && l.includes('prior write not read back'));
    expect(line).toContain('real history re-bill');
    expect(line).not.toContain('known Fable backend re-bill');
  });
});

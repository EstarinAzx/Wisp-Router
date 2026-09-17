import { describe, it, expect, vi } from 'vitest';
import { codexCatalog } from '../src/codexModels';
import { readDesktopNativeModels } from '../src/codexDesktop';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import OpenAI from 'openai';
import { createBridgeServer, type BridgeDeps } from '../src/bridgeServer';

const listen = (s: ReturnType<typeof createServer>): Promise<number> => new Promise(r => s.listen(0, '127.0.0.1', () => r((s.address() as AddressInfo).port)));
const close = async (s: ReturnType<typeof createServer>) => { s.closeAllConnections(); await new Promise<void>(r => s.close(() => r())); };
const post = (port: number, model: unknown, headers: Record<string, string> = { 'x-api-key': 'local-secret', authorization: 'Bearer native-token', 'chatgpt-account-id': 'native-account', 'x-untrusted': 'NO' }, path = '/codex-desktop/v1/responses', extra: Record<string, unknown> = {}) => new Promise<{status: number; text: string}>((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port, path, method: 'POST', headers }, res => { let text = ''; res.on('data', c => text += c); res.on('end', () => resolve({ status: res.statusCode!, text })); });
  req.on('error', reject); req.end(JSON.stringify({ model, input: 'hello', stream: true, metadata: { unchanged: true }, ...extra }));
});
const answer = (res: ServerResponse) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('data: {"choices":[{"delta":{"content":"EXTERNAL_OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'); };

async function fixture(run: (port: number, seen: any[], deps: BridgeDeps) => Promise<void>, upstreamReply = answer) {
  const seen: any[] = [];
  const upstream = createServer(async (req, res) => { let raw = ''; for await (const c of req) raw += c; seen.push({ headers: req.headers, body: raw ? JSON.parse(raw) : undefined, url: req.url }); upstreamReply(res); });
  const up = await listen(upstream); const spare = createServer(); const port = await listen(spare); await close(spare);
  const provider = { id: 'external', label: 'External', baseUrl: `http://127.0.0.1:${up}/v1`, defaultModel: 'DEFAULT', apiKeyEnv: '' };
  const map = { families: {}, aliases: [{ name: 'alias', target: { providerId: 'external', model: 'EXACT' } }], codexModels: { 'native-overridden': { providerId: 'external', model: 'OVERRIDE' } } };
  const deps: BridgeDeps = { providers: [provider], modelMap: () => ({}), customBaseUrl: () => '', keyFor: async () => 'external-token',
    clientFor: async () => new OpenAI({ apiKey: 'external-token', baseURL: provider.baseUrl, maxRetries: 0 }),
    codexSignedIn: async () => false, codexCreds: async () => undefined, anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
    effort: () => 'medium', activeProviderId: () => 'external', routingMap: () => map, aliasPickerShowsModel: () => false, aliasOnlyModels: () => false,
    port: () => port, accessSecret: () => 'local-secret', log: () => {},
    desktopNativeModels: () => ['native', 'native-overridden'],
    nativeFetch: async (url, init) => { seen.push({ native: true, url, headers: Object.fromEntries(new Headers(init?.headers)), body: JSON.parse(init?.body as string), redirect: init?.redirect }); return new Response('NATIVE_UNCHANGED', { status: 201 }); },
  } as BridgeDeps;
  const bridge = createBridgeServer(deps); await bridge.start();
  try { await run(port, seen, deps); } finally { bridge.stop(); await close(upstream); }
}

describe('signed desktop production Bridge', () => {
  it.each((['codex', 'anthropic-oauth'] as const).flatMap(kind => [400, 401, 503].map(status => ({ kind, status }))))('preserves signed sibling $kind HTTP $status retry boundaries', async ({ kind, status }) => {
    const discovery = vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [] });
    try { await fixture(async (port, seen, deps) => {
      deps.providers[0].kind = kind;
      deps.codexCreds = async () => ({ accessToken: 'synthetic-external', accountId: 'synthetic-account' });
      deps.anthropicCreds = async () => ({ accessToken: 'synthetic-external' });
      const logs: string[] = []; deps.log = text => logs.push(text);
      let attempts = 0; const saved = globalThis.fetch;
      globalThis.fetch = (async () => { attempts++; return Response.json({ error: { code: 'PRIVATE_CODE', message: 'PRIVATE_BODY fetch failed API error 503' } }, { status }); }) as typeof fetch;
      try {
        const reply = await post(port, 'alias');
        expect(reply.status).toBe(status); expect(attempts).toBe(status === 503 ? 3 : 1);
        expect(reply.text + logs.join('\n')).not.toContain('PRIVATE_');
      } finally { globalThis.fetch = saved; }
    }); } finally { discovery.mockRestore(); }
  });
  it.each([
    { body: 'event: response.completed\ndata: {"response":{"output":[]}}\n\n', status: 200, code: 'empty_output' },
    { body: 'event: response.output_text.delta\ndata: {"delta":"visible"}\n\n', status: 200, code: 'stream_incomplete' },
    { body: 'event: response.output_text.delta\ndata: {"delta":"visible"}\n\nevent: response.failed\ndata: {"response":{"error":{"status":401,"code":"invalid_api_key","message":"PRIVATE_BODY fetch failed API error 503"}}}\n\n', status: 200, code: 'stream_failed' },
    { body: 'event: response.failed\ndata: {"error":{"status":401,"message":"PRIVATE_BODY fetch failed API error 503"}}\n\n', status: 502, code: 'stream_failed' },
    { body: 'not valid SSE or JSON', status: 502, code: 'stream_incomplete' },
  ])('keeps SSE failure $code safe without retrying or promoting text to HTTP status', async scenario => fixture(async (port, seen, deps) => {
    deps.providers[0].kind = 'xai-oauth'; deps.routingMap().aliases[0].target.model = 'grok-4.6'; deps.xaiCreds = async () => ({ accessToken: 'synthetic-external' });
    const logs: string[] = []; deps.log = text => logs.push(text);
    let attempts = 0; const saved = globalThis.fetch;
    globalThis.fetch = (async () => { attempts++; return new Response(scenario.body, { headers: { 'Content-Type': 'text/event-stream' } }); }) as typeof fetch;
    try {
      const reply = await post(port, 'alias');
      expect(reply.status).toBe(scenario.status); expect(attempts).toBe(1); expect(reply.text).toContain(scenario.code);
      expect(reply.text + logs.join('\n')).not.toContain('PRIVATE_');
      expect(reply.text).not.toContain('invalid_api_key');
      if (scenario.body.includes('"delta"')) expect((reply.text.match(/"delta":"visible"/g) ?? []).length).toBe(1);
    } finally { globalThis.fetch = saved; }
  }));
  it('stops signed retry work when the client disconnects during backoff', async () => fixture(async (port, seen, deps) => {
    deps.providers[0].kind = 'xai-oauth'; deps.routingMap().aliases[0].target.model = 'grok-4.6'; deps.xaiCreds = async () => ({ accessToken: 'synthetic-external' });
    let attempts = 0; const saved = globalThis.fetch;
    globalThis.fetch = (async () => { attempts++; return new Response('', { status: 503 }); }) as typeof fetch;
    try {
      await new Promise<void>((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port, path: '/codex-desktop/v1/responses', method: 'POST', headers: { 'x-api-key': 'local-secret' } });
        req.on('error', () => resolve());
        deps.log = line => { if (line.includes('retrying')) req.destroy(new Error('test disconnect')); };
        req.end(JSON.stringify({ model: 'alias', input: 'synthetic', stream: true }));
        req.on('response', () => reject(new Error('unexpected completed request')));
      });
      await new Promise(r => setTimeout(r, 800)); expect(attempts).toBe(1);
    } finally { globalThis.fetch = saved; }
  }));
  it.each([400, 401, 403, 422, 429, 500, 503])('preserves authoritative xAI HTTP %s without exposing error-body prose', async status => fixture(async (port, seen, deps) => {
    deps.providers[0].kind = 'xai-oauth';
    deps.routingMap().aliases[0].target.model = 'grok-4.6';
    deps.xaiCreds = async () => ({ accessToken: 'synthetic-external' });
    const logs: string[] = []; deps.log = text => logs.push(text);
    let attempts = 0;
    const saved = globalThis.fetch;
    globalThis.fetch = (async () => { attempts++; return Response.json({ error: { code: 'PRIVATE_CODE_401', message: 'PRIVATE_BODY fetch failed API error 503 invalid_api_key' } }, { status }); }) as typeof fetch;
    try {
      const reply = await post(port, 'alias');
      expect(reply.status).toBe(status);
      expect(attempts).toBe([429, 500, 503].includes(status) ? 3 : 1);
      expect(reply.text + logs.join('\n')).not.toContain('PRIVATE_');
      expect(reply.text).not.toContain('invalid_api_key');
    } finally { globalThis.fetch = saved; }
  }));
  it('accepts the captured fresh shape on a supported keyed wire without hosted search or neutral effort', async () => fixture(async (port, seen) => {
    const input = ['developer', 'user', 'developer', 'developer', 'user', 'developer'].map((role, index) => ({ type: 'message', role, content: `content-${index}` }));
    const tools = [...Array.from({ length: 11 }, (_, n) => ({ type: 'function', name: `function_${n}`, parameters: { type: 'object', properties: {} } })),
      { type: 'custom', name: 'custom_tool', format: { type: 'text' } },
      ...Array.from({ length: 12 }, (_, n) => ({ type: 'namespace', name: `namespace_${n}`, tools: [{ type: 'function', name: 'read', parameters: { type: 'object', properties: {} } }] })), { type: 'web_search' }];
    const reply = await post(port, 'alias', undefined, undefined, { input, tools, instructions: 'root instructions', tool_choice: 'auto', reasoning: { effort: 'none' } });
    expect(reply.status).toBe(200); expect(seen).toHaveLength(1);
    expect(seen[0].body.model).toBe('EXACT'); expect(seen[0].body).not.toHaveProperty('reasoning_effort');
    expect(seen[0].body.messages.map((m: any) => [m.role, m.content])).toEqual([['system', 'root instructions'], ...input.map(m => [m.role === 'developer' ? 'system' : m.role, m.content])]);
    expect(seen[0].body.tools).toHaveLength(24); expect(seen[0].body.tools.every((t: any) => t.type === 'function')).toBe(true);
  }));
  it('keeps ordinary web_search-named tools and rejects forced/executed hosted search', async () => fixture(async (port, seen) => {
    const ordinary = [{ type: 'function', name: 'web_search', parameters: { type: 'object', properties: {} } }, { type: 'custom', name: 'web_search_custom' },
      { type: 'namespace', name: 'web_search', tools: [{ type: 'function', name: 'lookup', parameters: { type: 'object', properties: {} } }] }];
    expect((await post(port, 'alias', undefined, undefined, { tools: [...ordinary, { type: 'web_search_preview' }] })).status).toBe(200);
    expect(seen[0].body.tools.map((t: any) => t.function.description)).toEqual(expect.arrayContaining([expect.stringContaining('web_search (function)'), expect.stringContaining('web_search_custom (custom)'), expect.stringContaining('web_search.lookup (function)')]));
    for (const extra of [{ tool_choice: { type: 'web_search' } }, { include: ['web_search_call.action.sources'] }, { web_search_options: {} }, { input: [{ type: 'web_search_call', id: 'history', status: 'completed' }] }, { input: [{ type: 'reasoning', encrypted_content: 'opaque' }] }]) {
      expect((await post(port, 'alias', undefined, undefined, { tools: [{ type: 'web_search' }], ...extra })).status).toBe(400);
    }
    expect(seen).toHaveLength(1);
  }));
  it.each([
    { filters: { allowed_domains: ['private-domain.invalid'] } },
    { user_location: { type: 'approximate', country: 'NZ' } },
    { search_context_size: 'high' },
    { external_web_access: 'invalid' },
    { external_web_access: null },
    { external_web_access: 1 },
    { external_web_access: [] },
    { external_web_access: {} },
    { indexed_web_access: true },
    { search_content_types: ['text'] },
    { PRIVATE_HOSTED_OPTION_83ab: 'PRIVATE_HOSTED_VALUE_83ab' },
  ])('refuses attached hosted declaration options without exposing values: %j', async options => fixture(async (port, seen) => {
    for (const type of ['web_search', 'web_search_preview']) {
      const reply = await post(port, 'alias', undefined, undefined, { tools: [{ type, ...options }], tool_choice: 'auto' });
      expect(reply.status).toBe(400); expect(JSON.parse(reply.text).error.diagnostic.reason.code).toBe('unsupported_hosted_search_option');
      expect(reply.text).not.toContain('PRIVATE_HOSTED'); expect(reply.text).not.toContain('private-domain.invalid');
    }
    expect(seen).toHaveLength(0);
  }));
  it.each([true, false])('accepts only the demonstrated native ambient access flag %s', async external_web_access => fixture(async (port, seen) => {
    for (const choice of [undefined, 'auto']) {
      const reply = await post(port, 'alias', undefined, undefined, { tools: [{ type: 'web_search', external_web_access }], ...(choice ? { tool_choice: choice } : {}) });
      expect(reply.status).toBe(200); expect(seen.at(-1).body).not.toHaveProperty('tools');
    }
    expect((await post(port, 'alias', undefined, undefined, { tools: [{ type: 'web_search_preview', external_web_access }] })).status).toBe(400);
    expect(seen).toHaveLength(2);
  }));
  it('refuses unsupported Antigravity signed targets before credential lookup and never falls back native', async () => fixture(async (port, seen, deps) => {
    deps.providers[0].kind = 'antigravity-oauth'; const credentials = vi.fn(async () => undefined); deps.antigravityCreds = credentials;
    for (const model of ['alias', 'native-overridden']) {
      const reply = await post(port, model, undefined, undefined, { reasoning: { effort: 'PRIVATE_ANTIGRAVITY_EFFORT' } }); expect(reply.status).toBe(400); expect(JSON.parse(reply.text).error.type).toBe('desktop_target_incompatible'); expect(reply.text).toContain('instruction ordering'); expect(reply.text).not.toContain('PRIVATE_ANTIGRAVITY_EFFORT');
    }
    expect(credentials).not.toHaveBeenCalled(); expect(seen).toHaveLength(0);
  }));
  it('rejects meaningful unadvertised keyed effort while leaving ordinary Responses control intact', async () => fixture(async (port, seen) => {
    const request = { reasoning: { effort: 'medium' } };
    expect((await post(port, 'alias', undefined, undefined, request)).status).toBe(400); expect(seen).toHaveLength(0);
    expect((await post(port, 'alias', { authorization: 'Bearer local-secret' }, '/v1/responses', request)).status).toBe(200); expect(seen[0].body.reasoning_effort).toBe('medium');
  }));
  it('keeps native body/status, allowlisted credentials and fixed destination', async () => fixture(async (port, seen) => {
    const nativeFields = { tools: [{ type: 'web_search' }], reasoning: { effort: 'none' }, input: [{ type: 'reasoning', encrypted_content: 'native-history' }], service_tier: 'priority' };
    expect(await post(port, 'native', undefined, undefined, nativeFields)).toEqual({ status: 201, text: 'NATIVE_UNCHANGED' });
    expect(seen).toHaveLength(1); expect(seen[0].url).toBe('https://chatgpt.com/backend-api/codex/responses');
    expect(seen[0].headers).toEqual({ authorization: 'Bearer native-token', 'chatgpt-account-id': 'native-account', 'content-type': 'application/json' });
    expect(seen[0].body.metadata).toEqual({ unchanged: true }); expect(seen[0].redirect).toBe('manual');
    expect(seen[0].body).toMatchObject(nativeFields);
  }));
  it('preserves UTF-8 characters split across native request chunks', async () => fixture(async (port, seen) => {
    const body = Buffer.from(JSON.stringify({ model: 'native', input: '🙂' })); const split = body.indexOf(Buffer.from('🙂')) + 2;
    await new Promise<void>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/codex-desktop/v1/responses', method: 'POST', headers: { 'x-api-key': 'local-secret', authorization: 'Bearer native-token' } }, res => { res.resume(); res.on('end', resolve); });
      req.on('error', reject); req.write(body.subarray(0, split)); setTimeout(() => req.end(body.subarray(split)), 20);
    }); expect(seen[0].body.input).toBe('🙂');
  }));
  it('routes exact aliases/overrides live and never leaks either caller credential', async () => fixture(async (port, seen, deps) => {
    for (const model of ['alias', 'native-overridden']) expect((await post(port, model)).status).toBe(200);
    expect(seen.map(s => s.body.model)).toEqual(['EXACT', 'OVERRIDE']);
    for (const s of seen) { expect(s.headers.authorization).toBe('Bearer external-token'); expect(s.headers['x-api-key']).toBeUndefined(); expect(s.headers['chatgpt-account-id']).toBeUndefined(); }
    deps.routingMap().aliases[0].target.model = 'LIVE'; await post(port, 'alias'); expect(seen.at(-1).body.model).toBe('LIVE');
    deps.routingMap().aliases.push({ name: 'native', target: { providerId: 'external', model: 'COLLISION' } }); await post(port, 'native'); expect(seen.at(-1).body.model).toBe('COLLISION');
    deps.routingMap().aliases[0].target.providerId = 'missing'; expect((await post(port, 'alias')).status).toBe(404); expect(seen).toHaveLength(4);
  }));
  it('does not inherit OpenAI organization/project headers into a signed external client', async () => {
    const org = process.env.OPENAI_ORG_ID, project = process.env.OPENAI_PROJECT_ID;
    process.env.OPENAI_ORG_ID = 'native-org-canary'; process.env.OPENAI_PROJECT_ID = 'native-project-canary';
    try { await fixture(async (port, seen) => { expect((await post(port, 'alias')).status).toBe(200); expect(seen[0].headers['openai-organization']).toBeUndefined(); expect(seen[0].headers['openai-project']).toBeUndefined(); }); }
    finally { if (org === undefined) delete process.env.OPENAI_ORG_ID; else process.env.OPENAI_ORG_ID = org; if (project === undefined) delete process.env.OPENAI_PROJECT_ID; else process.env.OPENAI_PROJECT_ID = project; }
  });
  it('fails closed for unknown IDs, malformed model, missing registry and local auth', async () => fixture(async (port, seen, deps) => {
    for (const headers of [{}, { authorization: 'Bearer native-token' }, { 'x-api-key': 'wrong' }, { 'x-api-key': '', authorization: 'Bearer local-secret' }]) expect((await post(port, 'native', headers)).status).toBe(401);
    for (const id of ['unknown/external', 'external', 'gpt-invented']) expect((await post(port, id)).status).toBe(404);
    expect((await post(port, null)).status).toBe(400);
    deps.desktopNativeModels = () => undefined; const unavailable = await post(port, 'native'); expect(unavailable.status).toBe(503); expect(unavailable.text).toContain('disable'); expect(unavailable.text).toContain('native discovery'); expect(seen).toHaveLength(0);
  }));
  it('retains the ordinary Responses Active fallback', async () => fixture(async (port, seen) => {
    expect((await post(port, 'unknown', { authorization: 'Bearer local-secret' }, '/v1/responses')).status).toBe(200); expect(seen[0].body.model).toBe('DEFAULT');
  }));
  it('rejects native redirects without reflecting Location', async () => fixture(async (port, seen, deps) => {
    deps.nativeFetch = async () => new Response('', { status: 307, headers: { location: 'https://evil.invalid/secret' } });
    expect((await post(port, 'native')).status).toBe(502); expect(seen).toHaveLength(0);
  }));
  it('does not expose credential-bearing upstream errors in signed logs or replies', async () => fixture(async (port, _seen, deps) => {
    const logs: string[] = []; deps.log = line => logs.push(line);
    const reply = await post(port, 'alias'); expect(reply.status).toBe(502);
    expect(reply.text + logs.join('\n')).not.toContain('external-token');
  }, res => { res.writeHead(502, { 'content-type': 'application/json' }); res.end('{"error":{"message":"fetch failed external-token"}}'); }));
  it('returns/logs bounded structural rejections without request/header/tool contents', async () => fixture(async (port, seen, deps) => {
    const secret = 'PRIVATE_DIAGNOSTIC_CANARY_829ab'; const logs: string[] = []; deps.log = line => logs.push(line);
    const bodies = [
      JSON.stringify({ model: 'alias', service_tier: 'default', input: secret, instructions: secret, reasoning: { effort: 'medium' } }),
      JSON.stringify({ model: 'alias', input: secret, [secret]: secret }),
      JSON.stringify({ model: 'alias', tools: [{ type: 'function', name: secret }], input: [{ type: 'function_call', call_id: secret, name: secret, arguments: secret }] }),
      '{"input":"' + secret,
    ];
    const replies: any[] = [];
    for (const body of bodies) {
      const response = await new Promise<{ status: number; text: string }>((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port, path: '/codex-desktop/v1/responses', method: 'POST', headers: { 'x-api-key': 'local-secret', authorization: `Bearer ${secret}`, 'chatgpt-account-id': secret } }, res => {
          let text = ''; res.on('data', c => text += c); res.on('end', () => resolve({ status: res.statusCode!, text }));
        }); req.on('error', reject); req.end(body);
      });
      expect(response.status).toBe(400); expect(response.text).not.toContain(secret); replies.push(JSON.parse(response.text));
    }
    expect(replies[0].error.diagnostic.reason).toEqual({ code: 'unsupported_field', scope: 'request', field: 'service_tier' });
    expect(replies[0].error.diagnostic.shape.reasoningEffort).toBe('medium');
    expect(logs.filter(line => line.includes('desktop rejection'))).toHaveLength(4);
    expect(logs.join('\n')).not.toContain(secret); expect(seen).toHaveLength(0);
  }));
  it.each(['keyed', 'codex'] as const)('does not reflect arbitrary effort values from the %s validation path', async kind => {
    const discovery = vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [] });
    try { await fixture(async (port, seen, deps) => {
      if (kind !== 'keyed') deps.providers[0].kind = kind;
      deps.codexCreds = async () => ({ accessToken: 'provider-token', accountId: 'provider-account' });
      const logs: string[] = []; deps.log = line => logs.push(line);
      const canary = 'PRIVATE_EFFORT_VALUE_7619';
      const reply = await post(port, 'alias', undefined, undefined, { reasoning: { effort: canary } });
      expect(reply.status).toBe(400); expect(reply.text + logs.join('\n')).not.toContain(canary);
      const diagnostic = JSON.parse(reply.text).error.diagnostic;
      expect(diagnostic.reason.code).toBe('unsupported_reasoning_effort'); expect(diagnostic.shape.reasoningEffort).toBe('unrecognized'); expect(seen).toHaveLength(0);
    }); } finally { discovery.mockRestore(); }
  });
  it('refuses redirects during real cold Codex catalog discovery on the signed adapter', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wisp-cold-catalog-')); const prior = process.env.WISP_HOME; process.env.WISP_HOME = root;
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (url: string | URL, init?: RequestInit) => {
      if (String(url) === 'https://registry.npmjs.org/@openai/codex/latest') return Promise.resolve(Response.json({ version: '0.154.0' }));
      if (!String(url).startsWith('http://127.0.0.1:')) throw new Error('Test refuses non-local network');
      return realFetch(url, init);
    });
    try { await fixture(async (port, seen, deps) => {
      deps.providers[0].kind = 'codex'; deps.codexCreds = async () => ({ accessToken: 'provider-token', accountId: 'provider-account' });
      await post(port, 'alias');
      expect(seen.some(s => s.url.startsWith('/v1/models'))).toBe(true);
      expect(seen.filter(s => s.url === '/stolen')).toHaveLength(0);
    }, res => {
      if (res.req.url?.startsWith('/v1/models')) { res.writeHead(307, { location: '/stolen' }); res.end(); }
      else if (res.req.url === '/stolen') { res.setHeader('content-type', 'application/json'); res.end('{"models":[]}'); }
      else { res.setHeader('content-type', 'text/event-stream'); res.end('event: response.completed\ndata: {"response":{"status":"completed","output":[]}}\n\n'); }
    }); } finally { vi.unstubAllGlobals(); if (prior === undefined) delete process.env.WISP_HOME; else process.env.WISP_HOME = prior; rmSync(root, { recursive: true, force: true }); }
  });
  it.each([false, true])('rejects external redirects, cross-origin=%s', async cross => {
    let hits = 0; const sink = createServer((_req, res) => { hits++; answer(res); }); const sinkPort = await listen(sink);
    try { await fixture(async (port, seen) => { expect((await post(port, 'alias')).status).toBe(502); expect(hits).toBe(0); expect(seen.every(s => s.url === '/v1/chat/completions')).toBe(true); }, res => { res.writeHead(307, { location: cross ? `http://127.0.0.1:${sinkPort}/stolen` : '/stolen' }); res.end(); }); }
    finally { await close(sink); }
  });
  it.each((['codex', 'anthropic-oauth', 'xai-oauth'] as const).flatMap(kind => [false, true].map(cross => ({ kind, cross }))))('refuses OAuth redirects on $kind cross=$cross', async ({ kind, cross }) => {
    let hits = 0; const sink = createServer((_req, res) => { hits++; answer(res); }); const sinkPort = await listen(sink);
    const discovery = vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [] });
    try { await fixture(async (port, seen, deps) => {
      deps.providers[0].kind = kind;
      if (kind === 'xai-oauth') deps.routingMap().aliases[0].target.model = 'grok-build';
      deps.codexCreds = async () => ({ accessToken: 'provider-token', accountId: 'provider-account' });
      deps.anthropicCreds = async () => ({ accessToken: 'provider-token' }) as any;
      deps.xaiCreds = async () => ({ accessToken: 'provider-token' });
      deps.antigravityCreds = async () => ({ accessToken: 'provider-token', projectId: 'project' }) as any;
      expect((await post(port, 'alias')).status).toBe(502); expect(hits).toBe(0); expect(seen.every(s => s.url !== '/stolen')).toBe(true);
    }, res => { res.writeHead(307, { location: cross ? `http://127.0.0.1:${sinkPort}/stolen` : '/stolen' }); res.end(); }); }
    finally { discovery.mockRestore(); await close(sink); }
  });
  it('bounds signed request bodies before either upstream opens', async () => fixture(async (port, seen) => {
    await expect(new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/codex-desktop/v1/responses', method: 'POST', headers: { 'x-api-key': 'local-secret' } }, res => { res.resume(); res.on('end', resolve); });
      req.on('error', reject); req.end(JSON.stringify({ model: 'native', input: 'x'.repeat(26 * 1024 * 1024) }));
    })).rejects.toThrow(); expect(seen).toHaveLength(0);
  }));
  it('propagates cancellation to the external adapter stream', async () => {
    let ended = false;
    await fixture(async (port, seen) => {
      const req = request({ host: '127.0.0.1', port, path: '/codex-desktop/v1/responses', method: 'POST', headers: { 'x-api-key': 'local-secret' } });
      req.on('error', () => {}); req.end(JSON.stringify({ model: 'alias', input: 'hello', stream: true }));
      const until = Date.now() + 2000; while (!seen.length && Date.now() < until) await new Promise(r => setTimeout(r, 10));
      expect(seen).toHaveLength(1); req.destroy();
      while (!ended && Date.now() < until) await new Promise(r => setTimeout(r, 10)); expect(ended).toBe(true);
    }, res => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('data: {"choices":[{"delta":{"content":"start"}}]}\n\n'); res.on('close', () => { ended = true; }); });
  });
  it('both hosts registry reader fails closed and reads refresh/removal live', () => {
    const root = mkdtempSync(join(tmpdir(), 'wisp-registry-')); const before = process.env.WISP_HOME; process.env.WISP_HOME = root;
    try {
      expect(readDesktopNativeModels()).toBeUndefined(); mkdirSync(join(root, 'codex-desktop'));
      const file = join(root, 'codex-desktop/state.json');
      for (const body of ['{', '{}', '{"schema":1,"phase":"prepared","nativeModels":["native"]}', '{"schema":1,"phase":"active","nativeModels":[42]}', '{"schema":1,"phase":"active","nativeModels":["legacy-bundled"]}']) { writeFileSync(file, body); expect(readDesktopNativeModels()).toBeUndefined(); }
      const state = { schema: 1, phase: 'active', nativeSource: 'native-client-export', nativeCapturedAt: new Date().toISOString() };
      writeFileSync(file, JSON.stringify({ ...state, nativeCatalog: { models: [{ slug: 'first' }, { slug: 'second' }] } })); expect(readDesktopNativeModels()).toEqual(['first', 'second']);
      writeFileSync(file, JSON.stringify({ ...state, nativeCatalog: { models: [{ slug: 'second' }] } })); expect(readDesktopNativeModels()).toEqual(['second']);
    } finally { if (before === undefined) delete process.env.WISP_HOME; else process.env.WISP_HOME = before; rmSync(root, { recursive: true, force: true }); }
  });
});

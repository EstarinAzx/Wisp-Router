import { describe, it, expect, vi } from 'vitest';
import { createServer, request, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import OpenAI from 'openai';
import { createBridgeServer, type BridgeDeps } from '../src/bridgeServer';
import { buildCodexResponsesBody, buildAnthropicMessagesBody, antigravityStreamEvents } from '../src/catalog';
import { codexCatalog } from '../src/codexModels';

const listen = (server: ReturnType<typeof createServer>): Promise<number> => new Promise(resolve =>
  server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));
const post = (port: number, body: unknown): Promise<{ status: number; events: any[]; raw: string }> => new Promise((resolve, reject) => {
  const req = request({ hostname: '127.0.0.1', port, path: '/v1/responses', method: 'POST', headers: { Authorization: 'Bearer synthetic' } }, res => {
    let raw = ''; res.on('data', c => raw += c); res.on('end', () => resolve({ status: res.statusCode!, raw,
      events: raw.split('\n').filter(s => s.startsWith('data: ')).map(s => JSON.parse(s.slice(6))) }));
  }); req.on('error', reject); req.end(JSON.stringify(body));
});
const frame = (res: ServerResponse, data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
const answer = (res: ServerResponse, text = 'VISIBLE_FINAL', finish = 'stop') => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  frame(res, { choices: [{ delta: { content: text }, finish_reason: null }] });
  frame(res, { choices: [{ delta: {}, finish_reason: finish }] }); res.end('data: [DONE]\n\n');
};
const call = (res: ServerResponse, name: string, args = '{}', count = 1) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  frame(res, { choices: [{ delta: { tool_calls: Array.from({ length: count }, (_, index) => ({ index, id: `call_${index}`, type: 'function', function: { name, arguments: args } })) } }] });
  frame(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }); res.end('data: [DONE]\n\n');
};
const withBridge = async (up: (body: any, res: ServerResponse) => void, run: (port: number, seen: any[]) => Promise<void>, override: Partial<BridgeDeps> = {}) => {
  const seen: any[] = [];
  const upstream = createServer(async (req, res) => { let raw = ''; for await (const c of req) raw += c;
    const body = JSON.parse(raw); seen.push(body); up(body, res); });
  const upstreamPort = await listen(upstream);
  const spare = createServer(); const port = await listen(spare); await new Promise<void>(resolve => spare.close(() => resolve()));
  const provider = { id: 'local', label: 'Local', baseUrl: `http://127.0.0.1:${upstreamPort}/v1`, defaultModel: 'backend', apiKeyEnv: '' };
  const deps: BridgeDeps = { providers: [provider], modelMap: () => ({}), customBaseUrl: () => '', keyFor: async () => 'synthetic',
    clientFor: async () => new OpenAI({ apiKey: 'synthetic', baseURL: provider.baseUrl, maxRetries: 0 }),
    codexSignedIn: async () => false, codexCreds: async () => undefined, anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
    effort: () => 'medium', activeProviderId: () => 'local', routingMap: () => ({ families: {}, aliases: [] }), aliasPickerShowsModel: () => false,
    aliasOnlyModels: () => false, port: () => port, accessSecret: () => 'synthetic', log: () => {} };
  const bridge = createBridgeServer({ ...deps, ...override }); await bridge.start();
  try { await run(port, seen); } finally { bridge.stop(); upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
};
const message = (role: string, text: string) => ({ type: 'message', role, content: [{ type: 'input_text', text }] });
const fn = (name: string) => ({ type: 'function', name, parameters: { type: 'object', properties: {} } });
const native = (extra = {}) => ({ model: 'gpt-6-astra', stream: true, input: [message('user', 'hi')], parallel_tool_calls: false,
  reasoning: { effort: 'low', context: 'all_turns' }, text: { verbosity: 'low' }, include: ['reasoning.encrypted_content'], store: false, ...extra });

describe('Responses public HTTP contract', () => {
  it('preserves explicit false on Responses and Anthropic Provider bodies', () => {
    const tool = { type: 'function' as const, name: 'f', description: '', strict: false, parameters: { type: 'object' } };
    expect(buildCodexResponsesBody({ model: 'm', messages: [], tools: [tool], parallelToolCalls: false } as any).parallel_tool_calls).toBe(false);
    expect(buildAnthropicMessagesBody({ model: 'claude-opus-4-6', messages: [], maxTokens: 1, version: 'test', tools: [{ name: 'f', description: '', input_schema: {} }], parallelToolCalls: false } as any).tool_choice).toMatchObject({ disable_parallel_tool_use: true });
  });
  it('preserves ordered developer notes and delivers complete visible text items', async () => {
    await withBridge((_body, res) => answer(res), async (port, seen) => {
      const reply = await post(port, native({ input: [message('developer', 'rules'), message('user', 'hi'), message('developer', 'late note')] }));
      expect(reply.status).toBe(200);
      const done = reply.events.find(e => e.type === 'response.output_item.done');
      expect(done.item.content[0].text).toBe('VISIBLE_FINAL');
      expect(reply.events.at(-1).response.output).toEqual([done.item]);
      expect(reply.events.map(e => e.type)).toContain('response.output_text.done');
      expect(seen[0]).toMatchObject({ model: 'backend', parallel_tool_calls: false });
      expect(seen[0].messages.map((m: any) => m.content)).toEqual(['rules', 'hi', 'late note']);
      expect(reply.events.at(-1).response).not.toHaveProperty('usage');
    });
  });
  it('roundtrips custom namespace tools declared in additional_tools and text-array results', async () => {
    const format = { type: 'grammar', syntax: 'lark', definition: 'start: /[\\s\\S]+/' };
    const input = [{ type: 'additional_tools', role: 'developer', tools: [{ type: 'namespace', name: 'functions', tools: [{ type: 'custom', name: 'exec', format }] }] }, message('user', 'run')];
    await withBridge((body, res) => body.messages.some((m: any) => m.role === 'tool') ? answer(res) : call(res, body.tools[0].function.name, JSON.stringify({ input: 'text(42)' })), async (port, seen) => {
      const first = await post(port, native({ input })); expect(first.status).toBe(200);
      const item = first.events.find(e => e.type === 'response.output_item.done').item;
      expect(item).toMatchObject({ type: 'custom_tool_call', namespace: 'functions', name: 'exec', input: 'text(42)', call_id: 'call_0' });
      expect(seen[0].tools[0].function.description).toContain(JSON.stringify(format));
      const second = await post(port, native({ input: [...input, item, { type: 'custom_tool_call_output', call_id: item.call_id, output: [{ type: 'input_text', text: '42' }] }] }));
      expect(second.raw).toContain('VISIBLE_FINAL');
      expect(seen[1].messages.at(-1)).toMatchObject({ role: 'tool', content: '42' });
    });
  });
  it('keeps namespace/leaf/kind identities distinct and registers discovered-only schemas', async () => {
    const tools = [fn('same'), { type: 'custom', name: 'same' }, { type: 'namespace', name: 'a', tools: [fn('same')] }, { type: 'tool_search', execution: 'client', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }];
    const discovery = { type: 'tool_search_output', call_id: 'search_1', execution: 'client', tools: [{ type: 'namespace', name: 'b', tools: [{ ...fn('same'), defer_loading: true }] }] };
    await withBridge((body, res) => { expect(new Set(body.tools.map((t: any) => t.function.name)).size).toBe(5); call(res, body.tools.find((t: any) => t.function.description.includes('b.same')).function.name); }, async port => {
      const reply = await post(port, native({ tools, input: [message('user', 'discover'), { type: 'tool_search_call', call_id: 'search_1', execution: 'client', arguments: { query: 'tools' } }, discovery] }));
      expect(reply.status).toBe(200);
      expect(reply.events.find(e => e.type === 'response.output_item.done').item).toMatchObject({ type: 'function_call', namespace: 'b', name: 'same', arguments: '{}' });
    });
  });
  it.each([
    { input: [{ type: 'reasoning', summary: [] }] }, { input: [{ type: 'compaction', encrypted_content: 'opaque' }] },
    { previous_response_id: 'resp_remote' }, { tools: [{ type: 'web_search' }] }, { reasoning: { context: 'unknown' } },
    { text: { format: { type: 'json_schema' } } }, { tools: [fn('same'), { ...fn('same'), description: 'conflict' }] },
    { input: [{ type: 'function_call', name: 'missing', call_id: 'x', arguments: '{}' }] },
  ])('rejects unsupported or inconsistent input before execution: %j', async extra => {
    await withBridge((_body, res) => answer(res), async (port, seen) => {
      expect((await post(port, native(extra))).status).toBe(400); expect(seen).toHaveLength(0);
    });
  });
  it.each(['bad-json', 'unknown', 'parallel'])('fails malformed tool output without emitting calls: %s', async mode => {
    await withBridge((body, res) => call(res, mode === 'unknown' ? 'unknown' : body.tools[0].function.name, mode === 'bad-json' ? '{' : '{}', mode === 'parallel' ? 2 : 1), async port => {
      const reply = await post(port, native({ tools: [fn('test')] }));
      expect(reply.events.map(e => e.type)).toContain('response.failed');
      expect(reply.events.map(e => e.type)).not.toContain('response.completed');
      expect(reply.events.map(e => e.type)).not.toContain('response.output_item.done');
    });
  });
  it('marks length truncation incomplete', async () => {
    await withBridge((_body, res) => answer(res, 'partial', 'length'), async port => {
      const reply = await post(port, native()); expect(reply.events.at(-1).type).toBe('response.incomplete');
    });
  });
  it('marks a midstream transport failure failed', async () => {
    await withBridge((_body, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); frame(res, { choices: [{ delta: { content: 'partial' } }] }); setTimeout(() => res.destroy(), 30); }, async port => {
      const reply = await post(port, native()); expect(reply.events.at(-1).type).toBe('response.failed');
    });
  });
  it('cancels upstream when the client disconnects after receiving text', async () => {
    let closed!: () => void;
    const disconnected = new Promise<void>(resolve => { closed = resolve; });
    await withBridge((_body, res) => { res.on('close', closed); res.writeHead(200, { 'Content-Type': 'text/event-stream' }); frame(res, { choices: [{ delta: { content: 'first' } }] }); }, async (port, seen) => {
      await new Promise<void>((resolve, reject) => {
        const req = request({ hostname: '127.0.0.1', port, path: '/v1/responses', method: 'POST', headers: { Authorization: 'Bearer synthetic' } }, res => {
          res.once('data', () => { res.destroy(); resolve(); });
        }); req.on('error', reject); req.end(JSON.stringify(native()));
      });
      await Promise.race([disconnected, new Promise((_, reject) => setTimeout(() => reject(new Error('upstream not cancelled')), 1500))]);
      expect(seen).toHaveLength(1);
    });
  });
  it.each(['codex', 'anthropic'] as const)('forwards controls and marks dropped %s streams failed', async kind => {
    let wire: any;
    const model = kind === 'codex' ? 'gpt-6-astra' : 'claude-opus-4-6';
    const discovery = vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [{ id: model, name: model, visible: true, reasoningEfforts: ['low'], defaultEffort: 'low' }] });
    vi.stubGlobal('fetch', async (_url: unknown, init: RequestInit) => {
      wire = JSON.parse(init.body as string);
      const ev = kind === 'codex' ? { type: 'response.output_text.delta', delta: 'partial' } : { type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } };
      return new Response(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    try {
      await withBridge((_body, res) => answer(res), async port => {
        const reply = await post(port, native({ tools: [fn('goal')] }));
        expect(reply.events.at(-1).type).toBe('response.failed');
        if (kind === 'codex') expect(wire).toMatchObject({ parallel_tool_calls: false, reasoning: { effort: 'low', context: 'all_turns' }, text: { verbosity: 'low' }, tools: [{ strict: false }] });
        else expect(wire.tool_choice).toMatchObject({ disable_parallel_tool_use: true });
      }, { providers: [{ id: kind, label: kind, kind: kind === 'anthropic' ? 'anthropic-oauth' : kind, baseUrl: 'http://localhost/unused', defaultModel: model, apiKeyEnv: '' }], activeProviderId: () => kind,
        codexCreds: async () => ({ accessToken: 'synthetic', accountId: 'test' }), anthropicCreds: async () => ({ accessToken: 'synthetic' }) as any });
    } finally { discovery.mockRestore(); vi.unstubAllGlobals(); }
  });
  it('preserves classified pre-stream Codex failures as HTTP errors', async () => {
    const discovery = vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [] });
    vi.stubGlobal('fetch', async () => new Response('{"error":{"code":"context_length_exceeded"}}', { status: 400 }));
    try {
      await withBridge((_body, res) => answer(res), async port => {
        const reply = await post(port, native()); expect(reply.status).toBe(400); expect(reply.events).toHaveLength(0);
      }, { providers: [{ id: 'codex', label: 'Codex', kind: 'codex', baseUrl: 'http://localhost/unused', defaultModel: 'gpt-6-astra', apiKeyEnv: '' }], activeProviderId: () => 'codex', codexCreds: async () => ({ accessToken: 'synthetic', accountId: 'test' }) });
    } finally { discovery.mockRestore(); vi.unstubAllGlobals(); }
  });
  it('rejects an empty success instead of reporting invisible completion', async () => {
    await withBridge((_body, res) => answer(res, ''), async port => {
      const reply = await post(port, native()); expect(reply.events.at(-1).type).toBe('response.failed');
    });
  });
  it('rejects an Antigravity stream without a terminal reason on the Responses door', async () => {
    const source = async function* () { yield { candidates: [{ content: { parts: [{ text: 'partial' }] } }] }; };
    const drain = async () => { const result = []; for await (const event of (antigravityStreamEvents as any)(source(), true)) result.push(event); return result; };
    await expect(drain()).rejects.toThrow('before completion');
  });
  it('groups parallel calls into one assistant message before keyed tool results', async () => {
    await withBridge((_body, res) => answer(res), async (port, seen) => {
      const reply = await post(port, native({ tools: [fn('goal')], input: [message('user', 'two calls'),
        { type: 'function_call', name: 'goal', call_id: 'a', arguments: '{}' }, { type: 'function_call', name: 'goal', call_id: 'b', arguments: '{}' },
        { type: 'function_call_output', call_id: 'a', output: 'one' }, { type: 'function_call_output', call_id: 'b', output: 'two' }], parallel_tool_calls: true }));
      expect(reply.status).toBe(200);
      expect(seen[0].messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool']);
      expect(seen[0].messages[1].tool_calls.map((c: any) => c.id)).toEqual(['a', 'b']);
    });
  });
  it('refuses positioned developer notes before Antigravity credentials or upstream work', async () => {
    const credentials = vi.fn(async () => undefined);
    await withBridge((_body, res) => answer(res), async (port, seen) => {
      const reply = await post(port, native({ input: [message('user', 'first'), message('developer', 'late-only'), message('user', 'last')] }));
      expect(reply.status).toBe(400); expect(reply.raw).toContain('positioned'); expect(credentials).not.toHaveBeenCalled(); expect(seen).toHaveLength(0);
    }, { providers: [{ id: 'antigravity', label: 'Antigravity', kind: 'antigravity-oauth', baseUrl: 'http://localhost/unused', defaultModel: 'gemini-3-pro', apiKeyEnv: '' }], activeProviderId: () => 'antigravity', antigravityCreds: credentials });
  });
  it.each(['done-only', 'incomplete'])('handles a Codex %s terminal without losing its meaning', async mode => {
    const discovery = vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [] });
    vi.stubGlobal('fetch', async (_url: unknown, init: RequestInit) => {
      const wire = JSON.parse(init.body as string);
      const item = { id: 'fc_up', type: 'function_call', call_id: 'call_up', name: wire.tools[0].name, arguments: '{}' };
      const events = mode === 'done-only' ? [{ type: 'response.output_item.done', item }, { type: 'response.completed', response: { output: [item] } }]
        : [{ type: 'response.output_text.delta', delta: 'partial' }, { type: 'response.incomplete', response: { output: [] } }];
      return new Response(events.map(ev => `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`).join(''));
    });
    try {
      await withBridge((_body, res) => answer(res), async port => {
        const reply = await post(port, native({ tools: [fn('goal')] }));
        if (mode === 'done-only') expect(reply.events.find(e => e.type === 'response.output_item.done')?.item).toMatchObject({ type: 'function_call', name: 'goal', call_id: 'call_up' });
        else expect(reply.events.at(-1).type).toBe('response.incomplete');
      }, { providers: [{ id: 'codex', label: 'Codex', kind: 'codex', baseUrl: 'http://localhost/unused', defaultModel: 'gpt-6-astra', apiKeyEnv: '' }], activeProviderId: () => 'codex', codexCreds: async () => ({ accessToken: 'synthetic', accountId: 'test' }) });
    } finally { discovery.mockRestore(); vi.unstubAllGlobals(); }
  });
});

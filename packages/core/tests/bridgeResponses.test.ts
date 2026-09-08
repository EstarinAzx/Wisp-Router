import { describe, it, expect, vi } from 'vitest';
import { createServer, request, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import OpenAI from 'openai';
import { createBridgeServer, type BridgeDeps } from '../src/bridgeServer';
import { buildCodexResponsesBody, buildAnthropicMessagesBody, antigravityStreamEvents } from '../src/catalog';
import { codexCatalog } from '../src/codexModels';
import { createResponsesEncoder, parseResponsesRequest } from '../src/bridgeResponses';

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
const withBridge = async (up: (body: any, res: ServerResponse) => void, run: (port: number, seen: any[]) => Promise<void>, override: Partial<BridgeDeps> | ((provider: BridgeDeps['providers'][number]) => Partial<BridgeDeps>) = {}) => {
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
  const bridge = createBridgeServer({ ...deps, ...(typeof override === 'function' ? override(provider) : override) }); await bridge.start();
  try { await run(port, seen); } finally { bridge.stop(); upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
};
const message = (role: string, text: string) => ({ type: 'message', role, content: [{ type: 'input_text', text }] });
const fn = (name: string) => ({ type: 'function', name, parameters: { type: 'object', properties: {} } });
const native = (extra = {}) => ({ model: 'gpt-6-astra', stream: true, input: [message('user', 'hi')], parallel_tool_calls: false,
  reasoning: { effort: 'low', context: 'all_turns' }, text: { verbosity: 'low' }, include: ['reasoning.encrypted_content'], store: false, ...extra });

describe('Responses public HTTP contract', () => {
  const image = { type: 'input_image', image_url: 'data:image/png;base64,aGVsbG8=', detail: 'auto' };
  const parts = [{ type: 'input_text', text: 'before' }, image, { type: 'input_text', text: 'after' }];
  const wireDeps = (kind: 'codex' | 'anthropic') => (provider: BridgeDeps['providers'][number]): Partial<BridgeDeps> => ({
    providers: [{ ...provider, kind: kind === 'codex' ? 'codex' : 'anthropic-oauth', defaultModel: kind === 'codex' ? 'gpt-6-astra' : 'claude-opus-4-6' }],
    codexCreds: async () => ({ accessToken: 'synthetic', accountId: 'test' }), anthropicCreds: async () => ({ accessToken: 'synthetic' }) as any,
  });
  const wireAnswer = (kind: string, res: ServerResponse, usage?: unknown) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const events = kind === 'codex'
      ? [{ type: 'response.output_text.delta', delta: 'VISIBLE_FINAL' }, { type: 'response.completed', response: { output: [], ...(usage ? { usage } : {}) } }]
      : [{ type: 'message_start', message: { id: 'upstream', ...(usage ? { usage } : {}) } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'VISIBLE_FINAL' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, ...(usage ? { usage } : {}) }, { type: 'message_stop' }];
    for (const event of events) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    res.end();
  };
  it('preserves interleaved base64 images on the keyed wire', async () => {
    await withBridge((_body, res) => answer(res), async (port, seen) => {
      expect((await post(port, native({ input: [{ role: 'user', content: parts }] }))).status).toBe(200);
      expect(seen[0].messages[0].content).toEqual([{ type: 'text', text: 'before' }, { type: 'image_url', image_url: { url: image.image_url, detail: 'auto' } }, { type: 'text', text: 'after' }]);
    });
  });
  it.each(['codex', 'anthropic'] as const)('preserves ordered messages and image tool results on %s', async kind => {
    const discovery = vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [{ id: 'gpt-6-astra', name: 'gpt', visible: true, reasoningEfforts: ['low'], defaultEffort: 'low' }] });
    try {
      await withBridge((_body, res) => wireAnswer(kind, res), async (port, seen) => {
        const reply = await post(port, native({ instructions: 'top', tools: [fn('inspect')], input: [message('developer', 'first'), { role: 'user', content: parts },
          { type: 'function_call', name: 'inspect', call_id: 'image_call', arguments: '{}' },
          { type: 'function_call_output', call_id: 'image_call', output: parts }, message('developer', 'last')] }));
        expect(reply.status).toBe(200); expect(reply.events.at(-1).type).toBe('response.completed');
        const body = seen[0];
        if (kind === 'codex') {
          expect(body.input.map((m: any) => m.type)).toEqual(['message', 'function_call', 'function_call_output', 'message']);
          expect(body.instructions).toBe('top\n\nfirst');
          expect(body.input[0].content).toEqual(parts);
          expect(body.input[2]).toEqual({ type: 'function_call_output', call_id: 'image_call', output: parts });
          expect(body.input[3]).toMatchObject({ role: 'developer', content: [{ text: 'last' }] });
        } else {
          const expected = [{ type: 'text', text: 'before' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } }, { type: 'text', text: 'after' }];
          expect(body.messages.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'user', 'system']);
          expect(body.messages[1].content).toMatchObject(expected);
          expect(body.messages[3].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'image_call', content: expected });
          expect(body.messages[4].content[0].text).toBe('last');
        }
      }, wireDeps(kind));
    } finally { discovery.mockRestore(); }
  });
  it.each([
    { type: 'input_image', image_url: 'https://example.com/image.png' },
    { type: 'input_image', image_url: 'data:image/svg+xml;base64,aGVsbG8=' },
    { type: 'input_image', image_url: 'data:image/png;base64,!!' },
    { ...image, detail: 'unknown' }, { type: 'input_file', file_data: 'abc' },
  ])('refuses unsupported image/file content before execution: %j', async part => {
    await withBridge((_body, res) => answer(res), async (port, seen) => {
      expect((await post(port, native({ input: [{ role: 'user', content: [part] }] }))).status).toBe(400); expect(seen).toHaveLength(0);
    });
  });
  it('refuses image tool output on the text-only keyed tool wire', async () => {
    await withBridge((_body, res) => answer(res), async (port, seen) => {
      const reply = await post(port, native({ tools: [fn('inspect')], input: [message('user', 'look'), { type: 'function_call', call_id: 'a', name: 'inspect', arguments: '{}' }, { type: 'function_call_output', call_id: 'a', output: [image] }] }));
      expect(reply.status).toBe(400); expect(reply.raw).toContain('image'); expect(seen).toHaveLength(0);
    });
  });
  it('preserves explicit false on Responses and Anthropic Provider bodies', () => {
    const tool = { type: 'function' as const, name: 'f', description: '', strict: false, parameters: { type: 'object' } };
    expect(buildCodexResponsesBody({ model: 'm', messages: [], tools: [tool], parallelToolCalls: false } as any).parallel_tool_calls).toBe(false);
    expect(buildAnthropicMessagesBody({ model: 'claude-opus-4-6', messages: [], maxTokens: 1, version: 'test', tools: [{ name: 'f', description: '', input_schema: {} }], parallelToolCalls: false } as any).tool_choice).toMatchObject({ disable_parallel_tool_use: true });
  });
  it.each(['anthropic', 'antigravity', 'local'] as const)('refuses unsupported image controls on %s before sampling', async kind => {
    await withBridge((_body, res) => answer(res), async (port, seen) => {
      const reply = await post(port, native({ reasoning: {}, input: [{ role: 'user', content: [{ ...image, detail: kind === 'anthropic' ? 'high' : 'original' }] }] }));
      expect(reply.status).toBe(400); expect(seen).toHaveLength(0);
    }, provider => kind === 'anthropic' ? wireDeps(kind)(provider) : kind === 'antigravity' ? { providers: [{ ...provider, kind: 'antigravity-oauth' }] } : {});
  });
  it.each([
    { prompt_tokens: 20, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 8 } },
    { prompt_tokens: -1, completion_tokens: 7 }, { prompt_tokens: 1.5, completion_tokens: 7 },
    { prompt_tokens: 20, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 'bad' } },
    { prompt_tokens: 20, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 21 } },
  ])('reports only measured, valid keyed usage: %j', async usage => {
    await withBridge((_body, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      frame(res, { choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] }); frame(res, { choices: [], usage }); res.end('data: [DONE]\n\n');
    }, async port => {
      const reply = await post(port, native({ stream: false })); const response = JSON.parse(reply.raw);
      if (usage.prompt_tokens_details?.cached_tokens === 8) expect(response.usage).toEqual({ input_tokens: 20, output_tokens: 7, total_tokens: 27, input_tokens_details: { cached_tokens: 8 } });
      else expect(response).not.toHaveProperty('usage');
    });
  });
  it.each(['codex', 'anthropic'] as const)('reports valid %s usage and omits malformed counts', async kind => {
    const discovery = vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [] });
    try {
      for (const malformed of [false, true]) await withBridge((_body, res) => wireAnswer(kind, res, kind === 'codex'
        ? { input_tokens: 20, output_tokens: 7, input_tokens_details: { cached_tokens: malformed ? 'bad' : 8 } }
        : { input_tokens: 10, output_tokens: 7, cache_creation_input_tokens: malformed ? -2 : 2, cache_read_input_tokens: 8 }), async port => {
        const reply = await post(port, native({ reasoning: {} })); const response = reply.events.at(-1).response;
        if (malformed) expect(response).not.toHaveProperty('usage');
        else expect(response.usage).toEqual({ input_tokens: 20, output_tokens: 7, total_tokens: 27, input_tokens_details: { cached_tokens: 8 } });
      }, wireDeps(kind));
    } finally { discovery.mockRestore(); }
  });
  it('merges Anthropic initial input with final output-only usage', async () => {
    await withBridge((_body, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const event of [{ type: 'message_start', message: { usage: { input_tokens: 10, cache_read_input_tokens: 8, cache_creation_input_tokens: 2, output_tokens: 0 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'answer' } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } }, { type: 'message_stop' }]) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      } res.end();
    }, async port => {
      const reply = await post(port, native()); expect(reply.events.at(-1).response.usage).toMatchObject({ input_tokens: 20, output_tokens: 7, total_tokens: 27 });
    }, wireDeps('anthropic'));
  });
  it.each([undefined, null, {}, { output_tokens: 'bad' }])('omits Anthropic usage without a measured final output count: %j', async usage => {
    await withBridge((_body, res) => {
      const events = [{ type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'answer' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage }, { type: 'message_stop' }];
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const event of events) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      res.end();
    }, async port => {
      const reply = await post(port, native()); expect(reply.events.at(-1).type).toBe('response.completed');
      expect(reply.events.at(-1).response).not.toHaveProperty('usage');
    }, wireDeps('anthropic'));
  });
  it('forwards keyed reasoning effort instead of discarding it', async () => {
    await withBridge((_body, res) => answer(res), async (port, seen) => {
      expect((await post(port, native())).status).toBe(200); expect(seen[0].reasoning_effort).toBe('low');
      expect((await post(port, native({ reasoning: { effort: 'invented' } }))).status).toBe(400); expect(seen).toHaveLength(1);
    });
  });
  it.each(['codex', 'anthropic'] as const)('rejects unsupported explicit %s effort without sampling', async kind => {
    const discovery = vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [{ id: 'gpt-6-astra', name: 'gpt', visible: true, reasoningEfforts: ['low'], defaultEffort: 'low' }] });
    try {
      await withBridge((_body, res) => wireAnswer(kind, res), async (port, seen) => {
        const reply = await post(port, native({ reasoning: { effort: 'xhigh' } })); expect(reply.status).toBe(400); expect(seen).toHaveLength(0);
      }, wireDeps(kind));
    } finally { discovery.mockRestore(); }
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
    { reasoning: { summary: 'none' } }, { reasoning: { summary: 'detailed' } }, { service_tier: 'priority' }, { service_tier: 'default' },
    { input: [{ type: 'function_call', name: 'missing', call_id: 'x', arguments: '{}' }] },
  ])('rejects unsupported or inconsistent input before execution: %j', async extra => {
    await withBridge((_body, res) => answer(res), async (port, seen) => {
      expect((await post(port, native(extra))).status).toBe(400); expect(seen).toHaveLength(0);
    });
  });
  it('accepts the native unknown-model automatic-summary default without promising reasoning output', async () => {
    await withBridge((_body, res) => answer(res), async port => {
      const reply = await post(port, native({ reasoning: { summary: 'auto' } }));
      expect(reply.status).toBe(200); expect(reply.events.at(-1).response.output.map((item: any) => item.type)).toEqual(['message']);
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
  it('does not start discovery or sampling after cancellation during credential lookup', async () => {
    let entered!: () => void, release!: (value: any) => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const credentials = new Promise<any>(resolve => { release = resolve; });
    const discovery = vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [] });
    try {
      await withBridge((_body, res) => wireAnswer('codex', res), async (port, seen) => {
        const req = request({ hostname: '127.0.0.1', port, path: '/v1/responses', method: 'POST', headers: { Authorization: 'Bearer synthetic' } });
        req.on('error', () => {}); req.end(JSON.stringify(native()));
        await waiting; req.destroy();
        await new Promise(resolve => setTimeout(resolve, 30));
        release({ accessToken: 'synthetic', accountId: 'test' });
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(discovery).not.toHaveBeenCalled(); expect(seen).toHaveLength(0);
      }, provider => ({ ...wireDeps('codex')(provider), codexCreds: async () => { entered(); return credentials; } }));
    } finally { release(undefined); discovery.mockRestore(); }
  });
  it('isolates repeated call IDs and stream identities across concurrent sessions', async () => {
    await withBridge((body, res) => call(res, body.tools[0].function.name), async port => {
      const replies = await Promise.all(['one', 'two'].map(name => post(port, native({ tools: [fn(name)] }))));
      const ids = replies.map(reply => reply.events.at(-1).response.id); expect(new Set(ids).size).toBe(2);
      replies.forEach((reply, i) => {
        expect(reply.events.map(e => e.sequence_number)).toEqual(reply.events.map((_, n) => n));
        expect(reply.events.filter(e => e.response).every(e => e.response.id === ids[i])).toBe(true);
        expect(reply.events.at(-1).response.output[0]).toMatchObject({ name: ['one', 'two'][i], call_id: 'call_0' });
      });
    });
  });
  it('rejects opaque replay after a route change while preserving visible follow-ups and context selectors', async () => {
    let active = 'local';
    await withBridge((_body, res) => answer(res), async (port, seen) => {
      for (const context of ['auto', 'current_turn', 'all_turns']) expect((await post(port, native({ reasoning: { context } }))).status).toBe(200);
      active = 'other';
      for (const type of ['reasoning', 'compaction']) expect((await post(port, native({ input: [message('user', 'old'), { type, encrypted_content: 'opaque' }] }))).status).toBe(400);
      expect(seen).toHaveLength(3);
      expect((await post(port, native({ input: [message('user', 'old'), message('assistant', 'answer'), message('developer', 'new note'), message('user', 'followup')] }))).status).toBe(200);
      expect(seen[3].messages.map((m: any) => m.content)).toEqual(['old', 'answer', 'new note', 'followup']);
      expect(seen[3].model).toBe('other-model');
    }, provider => ({ providers: [provider, { ...provider, id: 'other', defaultModel: 'other-model' }], activeProviderId: () => active }));
  });
  it('forwards context without inventing effort when Codex has no effort metadata', async () => {
    const discovery = vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [] });
    try {
      await withBridge((_body, res) => wireAnswer('codex', res), async (port, seen) => {
        expect((await post(port, native({ reasoning: { context: 'current_turn' } }))).status).toBe(200);
        expect(seen[0].reasoning).toEqual({ context: 'current_turn' });
      }, wireDeps('codex'));
    } finally { discovery.mockRestore(); }
  });
  it.each(['codex', 'xai'] as const)('reconciles partial deltas with complete terminal text on %s', async kind => {
    const discovery = vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [] });
    try {
      for (const mismatch of [false, true]) {
        vi.stubGlobal('fetch', async () => {
          const events = [{ type: 'response.output_text.delta', delta: 'FULL' }, { type: 'response.completed', response: { output: [
            { type: 'message', content: [{ type: 'output_text', text: mismatch ? 'DIFFERENT' : 'FULL ' }] }, { type: 'message', content: [{ type: 'output_text', text: 'ANSWER' }] },
          ] } }];
          return new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''));
        });
        await withBridge((_body, res) => answer(res), async port => {
          const reply = await post(port, native({ reasoning: {} }));
          if (mismatch) { expect(reply.events.at(-1).type).toBe('response.failed'); expect(reply.events.some(e => e.type === 'response.completed')).toBe(false); }
          else expect(reply.events.at(-1).response.output[0].content[0].text).toBe('FULL ANSWER');
        }, provider => ({ ...wireDeps('codex')(provider), providers: [{ ...provider, kind: kind === 'codex' ? 'codex' : 'xai-oauth', defaultModel: kind === 'codex' ? 'gpt-6-astra' : 'grok-4.5' }], xaiCreds: async () => ({ accessToken: 'synthetic' }) as any }));
      }
    } finally { discovery.mockRestore(); vi.unstubAllGlobals(); }
  });
  it('returns an incomplete JSON response on non-streaming truncation', async () => {
    await withBridge((_body, res) => answer(res, 'partial', 'length'), async port => {
      const reply = await post(port, native({ stream: false })); const body = JSON.parse(reply.raw);
      expect(body).toMatchObject({ status: 'incomplete', incomplete_details: { reason: 'max_tokens' }, output: [{ status: 'incomplete', content: [{ text: 'partial' }] }] });
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
        const reply = await post(port, native({ reasoning: {} })); expect(reply.status).toBe(400); expect(reply.events).toHaveLength(0);
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
  it.each([
    { promptTokenCount: 'bad', candidatesTokenCount: 2 }, { candidatesTokenCount: 2 }, { promptTokenCount: 10 },
    { promptTokenCount: 10, candidatesTokenCount: 2, cachedContentTokenCount: 11 },
    { promptTokenCount: 10, candidatesTokenCount: -2 }, { promptTokenCount: 10, candidatesTokenCount: 2, thoughtsTokenCount: null },
    { promptTokenCount: 10, candidatesTokenCount: 2, cachedContentTokenCount: 4, thoughtsTokenCount: 3 },
  ])('keeps Antigravity strict usage honest: %j', async usageMetadata => {
    const encoder = createResponsesEncoder(parseResponsesRequest(native()), 'test_usage');
    const source = async function* () { yield { candidates: [{ content: { parts: [{ text: 'answer' }] }, finishReason: 'STOP' }], usageMetadata }; };
    for await (const event of antigravityStreamEvents(source(), true)) encoder.push(event);
    const result = encoder.finish().response;
    if (usageMetadata.thoughtsTokenCount === 3) expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 4 } });
    else expect(result).not.toHaveProperty('usage');
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
      const reply = await post(port, native({ reasoning: {}, input: [message('user', 'first'), message('developer', 'late-only'), message('user', 'last')] }));
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
        const reply = await post(port, native({ reasoning: {}, tools: [fn('goal')] }));
        if (mode === 'done-only') expect(reply.events.find(e => e.type === 'response.output_item.done')?.item).toMatchObject({ type: 'function_call', name: 'goal', call_id: 'call_up' });
        else expect(reply.events.at(-1).type).toBe('response.incomplete');
      }, { providers: [{ id: 'codex', label: 'Codex', kind: 'codex', baseUrl: 'http://localhost/unused', defaultModel: 'gpt-6-astra', apiKeyEnv: '' }], activeProviderId: () => 'codex', codexCreds: async () => ({ accessToken: 'synthetic', accountId: 'test' }) });
    } finally { discovery.mockRestore(); vi.unstubAllGlobals(); }
  });
});

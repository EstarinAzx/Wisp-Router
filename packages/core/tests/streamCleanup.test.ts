import { afterEach, describe, expect, it, vi } from 'vitest';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { createBridgeServer, type BridgeDeps } from '../src/bridgeServer';
import { codexStream, sseBlocks } from '../src/codexClient';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};
const within = async <T>(promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('stream cleanup did not settle')), 1000);
  })]); } finally { clearTimeout(timer); }
};
const bytes = (text: string) => new TextEncoder().encode(text);
afterEach(() => vi.unstubAllGlobals());

describe('shared SSE reader cleanup', () => {
  it.each(['resolve', 'reject', 'never'] as const)('cancels an early break and releases the lock when cancel will %s', async mode => {
    let cancellations = 0;
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(bytes('data: first\n\ndata: second\n\n')); },
      cancel() { cancellations++; return mode === 'reject' ? Promise.reject(new Error('cancel failed'))
        : mode === 'never' ? new Promise<void>(() => {}) : undefined; },
    });
    await within((async () => { for await (const block of sseBlocks(body)) { expect(block).toBe('data: first'); break; } })());
    expect(cancellations).toBe(1);
    expect(body.locked).toBe(false);
  });

  it.each(['reject', 'never'] as const)('cancels and unlocks response.failed when cancel will %s, preserving the upstream error', async mode => {
    let cancellations = 0;
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(bytes('event: response.failed\ndata: {"response":{"error":{"message":"upstream failed"}}}\n\n')); },
      cancel() { cancellations++; return mode === 'reject' ? Promise.reject(new Error('cancel failed')) : new Promise<void>(() => {}); },
    });
    vi.stubGlobal('fetch', async () => new Response(body));
    await expect(within((async () => { for await (const _ of codexStream({ creds: { accessToken: 'synthetic', accountId: 'test' },
      baseUrl: 'https://upstream.invalid', model: 'test', modelInfo: { id: 'test', name: 'Test', visible: true }, messages: [] })) {} })()))
      .rejects.toThrow('upstream failed');
    expect(cancellations).toBe(1);
    expect(body.locked).toBe(false);
  });

  it('releases the lock after a read error without hiding that error', async () => {
    const body = new ReadableStream<Uint8Array>({ pull(c) { c.error(new Error('read failed')); } });
    await expect(within((async () => { for await (const _ of sseBlocks(body)) {} })())).rejects.toThrow('read failed');
    expect(body.locked).toBe(false);
  });

  it('does not cancel an exhausted body, including its final unterminated block', async () => {
    let cancellations = 0;
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes('data: first\n\ndata: tail')); c.close(); },
      cancel() { cancellations++; } });
    const blocks: string[] = [];
    for await (const block of sseBlocks(body)) blocks.push(block);
    expect(blocks).toEqual(['data: first', 'data: tail']);
    expect(cancellations).toBe(0);
    expect(body.locked).toBe(false);
  });
});

const deps = (): BridgeDeps => ({
  providers: [{ id: 'xai', label: 'Grok', baseUrl: 'https://upstream.invalid', defaultModel: 'test', apiKeyEnv: '', kind: 'xai-oauth' }],
  modelMap: () => ({}), customBaseUrl: () => '', keyFor: async () => '', clientFor: async () => undefined,
  codexSignedIn: async () => false, codexCreds: async () => undefined,
  anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
  xaiSignedIn: async () => true, xaiCreds: async () => ({ accessToken: 'synthetic' }),
  effort: () => 'medium', activeProviderId: () => 'xai', routingMap: () => ({ families: {}, aliases: [] }),
  aliasPickerShowsModel: () => false, aliasOnlyModels: () => false, port: () => 0, accessSecret: () => 'secret', log: () => {},
});
const freePort = (): Promise<number> => new Promise((resolve, reject) => {
  const server = http.createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = (server.address() as AddressInfo).port; server.close(() => resolve(port)); });
});

describe('HTTP client disconnect cancellation', () => {
  it.each(['/v1/chat/completions', '/v1/messages'].flatMap(path =>
    ['before headers', 'after first token', 'during credentials'].map(stage => ({ path, stage }))))
    ('aborts upstream on $path $stage', async ({ path, stage }) => {
      const opened = deferred<AbortSignal>(), cancelled = deferred<void>(), credentials = deferred<{ accessToken: string }>();
      const credentialsStarted = deferred<void>();
      let upstreamBody: ReadableStream<Uint8Array> | undefined;
      vi.stubGlobal('fetch', (_url: unknown, init: RequestInit) => {
        const signal = init.signal!;
        opened.resolve(signal);
        if (stage !== 'after first token') return new Promise<Response>((_resolve, reject) => {
          const abort = () => { cancelled.resolve(); reject(signal.reason); };
          if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
        });
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(bytes('event: response.output_text.delta\ndata: {"delta":"first token"}\n\n'));
            signal.addEventListener('abort', () => { cancelled.resolve(); c.error(signal.reason); }, { once: true });
          },
        });
        upstreamBody = body;
        return Promise.resolve(new Response(body));
      });
      const port = await freePort();
      const bridge = createBridgeServer({ ...deps(), port: () => port,
        ...(stage === 'during credentials' ? { xaiCreds: () => { credentialsStarted.resolve(); return credentials.promise; } } : {}) });
      await bridge.start();
      const received = deferred<void>(), closed = deferred<void>();
      const payload = JSON.stringify({ model: 'xai', stream: true, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });
      const req = http.request({ host: '127.0.0.1', port, path, method: 'POST', headers: {
        Authorization: 'Bearer secret', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload),
      } }, res => { res.on('data', chunk => { if (chunk.toString().includes('first token')) received.resolve(); }); });
      req.on('error', () => {});
      req.on('close', () => closed.resolve());
      req.end(payload);
      try {
        if (stage === 'during credentials') await within(credentialsStarted.promise);
        else await within(opened.promise);
        if (stage === 'after first token') await within(received.promise);
        req.destroy();
        await within(closed.promise);
        // Allow the server to observe the socket close before releasing credentials.
        if (stage === 'during credentials') { await new Promise(r => setTimeout(r, 20)); credentials.resolve({ accessToken: 'synthetic' }); }
        await within(cancelled.promise);
        expect((await within(opened.promise)).aborted).toBe(true);
        if (upstreamBody) await vi.waitFor(() => expect(upstreamBody!.locked).toBe(false));
      } finally { credentials.resolve({ accessToken: 'synthetic' }); req.destroy(); bridge.stop(); }
    });

  it.each(['/v1/chat/completions', '/v1/messages'])('does not abort a normally finished response on %s', async path => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', async (_url: unknown, init: RequestInit) => {
      signal = init.signal!;
      return new Response('event: response.output_text.delta\ndata: {"delta":"done"}\n\n' +
        'event: response.completed\ndata: {"response":{"output":[]}}\n\n');
    });
    const port = await freePort(), bridge = createBridgeServer({ ...deps(), port: () => port });
    await bridge.start();
    try {
      const payload = JSON.stringify({ model: 'xai', stream: true, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });
      await within(new Promise<void>((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path, method: 'POST', headers: {
          Authorization: 'Bearer secret', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload),
        } }, res => { res.resume(); res.on('end', () => resolve()); });
        req.on('error', reject); req.end(payload);
      }));
      expect(signal).toBeDefined();
      expect(signal!.aborted).toBe(false);
    } finally { bridge.stop(); }
  });
});

describe('advisor continuation on the Anthropic wire', () => {
  it('serializes signed, empty, redacted thinking and interleaved text/tool history in order', async () => {
    const sent: any[] = [];
    const expected = [
      { type: 'thinking', thinking: 'consider', signature: 'sig-1' },
      { type: 'text', text: 'before' },
      { type: 'thinking', thinking: '', signature: 'sig-empty' },
      { type: 'text', text: 'between' },
      { type: 'redacted_thinking', data: 'opaque' },
      { type: 'tool_use', id: 'advisor-1', name: 'advisor', input: { question: 'check' } },
    ];
    const secondPass = [{ type: 'text', text: 'after advice' }, { type: 'redacted_thinking', data: 'opaque-2' },
      { type: 'tool_use', id: 'advisor-2', name: 'advisor', input: { question: 'recheck' } }];
    const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const reply = (blocks: any[]) => {
      let text = frame('message_start', { message: { id: 'synthetic', usage: { input_tokens: 1, output_tokens: 0 } } });
      for (const [index, block] of blocks.entries()) {
        text += frame('content_block_start', { index, content_block: block.type === 'redacted_thinking' ? block :
          block.type === 'tool_use' ? { ...block, input: {} } : { type: block.type, [block.type]: '' } });
        if (block.type === 'thinking') {
          if (block.thinking) text += frame('content_block_delta', { index, delta: { type: 'thinking_delta', thinking: block.thinking } });
          text += frame('content_block_delta', { index, delta: { type: 'signature_delta', signature: block.signature } });
        } else if (block.type === 'text') text += frame('content_block_delta', { index, delta: { type: 'text_delta', text: block.text } });
        else if (block.type === 'tool_use') text += frame('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } });
        text += frame('content_block_stop', { index });
      }
      text += frame('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }) + frame('message_stop', {});
      return new Response(text, { headers: { 'Content-Type': 'text/event-stream' } });
    };
    vi.stubGlobal('fetch', async (_url: unknown, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string));
      return reply(sent.length === 1 ? expected : sent.length === 3 ? secondPass :
        [{ type: 'text', text: sent.length === 5 ? 'done' : 'advice' }]);
    });
    const port = await freePort();
    const provider = { id: 'anthropic', label: 'Claude', baseUrl: 'https://upstream.invalid', defaultModel: 'claude-opus-4-6', apiKeyEnv: '', kind: 'anthropic-oauth' as const };
    const bridge = createBridgeServer({ ...deps(), providers: [provider], port: () => port, activeProviderId: () => provider.id,
      anthropicSignedIn: async () => true, anthropicCreds: async () => ({ accessToken: 'synthetic' }) });
    await bridge.start();
    try {
      const payload = JSON.stringify({ model: provider.id, stream: true, max_tokens: 100, messages: [{ role: 'user', content: 'hi' }],
        tools: [{ type: 'advisor_20260301', name: 'advisor' }] });
      const result = await within(new Promise<string>((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: '/v1/messages', method: 'POST', headers: {
          Authorization: 'Bearer secret', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload),
        } }, res => { let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve(text)); });
        req.on('error', reject); req.end(payload);
      }));
      expect(result).toContain('done');
      expect(sent).toHaveLength(5);
      expect(sent[2].thinking).toEqual({ type: 'adaptive' });
      const content = sent[2].messages.find((message: any) => message.role === 'assistant').content;
      expect(content.map(({ cache_control, ...block }: any) => block)).toEqual(expected);
      expect(sent[2].messages.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'advisor-1', content: 'advice' });
      const later = sent[4].messages.filter((message: any) => message.role === 'assistant');
      expect(later.map((message: any) => message.content.map(({ cache_control, ...block }: any) => block))).toEqual([expected, secondPass]);
      expect(sent[4].messages.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'advisor-2', content: 'advice' });
    } finally { bridge.stop(); }
  });
});

import { describe, it, expect } from 'vitest';
import { createServer, request, type IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import { connect, type AddressInfo, type Socket } from 'node:net';
import { createBridgeServer, type BridgeDeps } from '../src/bridgeServer';

const CALL = '/codex-desktop/backend-api/codex/realtime/calls?intent=quicksilver&architecture=avas';
const headers = { 'x-api-key': 'local-only', authorization: 'Bearer native-only', 'chatgpt-account-id': 'native-account', 'openai-alpha': 'quicksilver=v2', 'x-untrusted': 'PRIVATE' };
const listen = (s: ReturnType<typeof createServer>): Promise<number> => new Promise(resolve => s.listen(0, '127.0.0.1', () => resolve((s.address() as AddressInfo).port)));
const fixture = async (run: (port: number, deps: BridgeDeps, stop: () => void) => Promise<void>) => {
  const spare = createServer(); const port = await listen(spare); await new Promise<void>(r => spare.close(() => r()));
  const deps: BridgeDeps = { providers: [], modelMap: () => ({}), customBaseUrl: () => '', keyFor: async () => '', clientFor: async () => undefined,
    codexSignedIn: async () => false, codexCreds: async () => undefined, anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
    effort: () => 'medium', activeProviderId: () => '', routingMap: () => ({ families: {}, aliases: [] }), aliasPickerShowsModel: () => false, aliasOnlyModels: () => false,
    port: () => port, accessSecret: () => 'local-only', log: () => {}, nativeFetch: async () => { throw new Error('unconfigured fixture'); } };
  const bridge = createBridgeServer(deps); await bridge.start();
  try { await run(port, deps, bridge.stop); } finally { bridge.stop(); }
};
const post = (port: number, path = CALL, body: unknown = { sdp: 'v=offer\r\n', session: { model: 'gpt-live-1-codex' } }, supplied = headers) => new Promise<{status: number; text: string; headers: IncomingMessage['headers']} >((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json', ...supplied } }, res => {
    let text = ''; res.on('data', c => text += c); res.on('end', () => resolve({ status: res.statusCode!, text, headers: res.headers }));
  }); req.on('error', reject); req.end(JSON.stringify(body));
});

describe('signed desktop voice call', () => {
  it('forwards native-shaped calls to the fixed backend, preserves SDP/Location, and strips the local secret', async () => fixture(async (port, deps) => {
    let seen: any;
    deps.nativeFetch = async (url, init) => { seen = { url, init }; return new Response('v=answer\r\n', { status: 201, headers: { 'content-type': 'application/sdp', location: '/v1/live/rtc_fixture', 'set-cookie': 'PRIVATE' } }); };
    const result = await post(port);
    expect(result.status).toBe(201); expect(result.text).toBe('v=answer\r\n'); expect(result.headers.location).toBe('/v1/live/rtc_fixture'); expect(result.headers['set-cookie']).toBeUndefined();
    expect(seen.url).toBe('https://chatgpt.com/backend-api/codex/realtime/calls?intent=quicksilver&architecture=avas');
    expect(JSON.parse(seen.init.body)).toEqual({ sdp: 'v=offer\r\n', session: { model: 'gpt-live-1-codex' } });
    const sent = new Headers(seen.init.headers); expect(sent.get('authorization')).toBe('Bearer native-only'); expect(sent.get('chatgpt-account-id')).toBe('native-account');
    expect(sent.get('openai-alpha')).toBe('quicksilver=v2'); expect(sent.get('x-api-key')).toBeNull(); expect(sent.get('x-untrusted')).toBeNull(); expect(seen.init.redirect).toBe('manual');
  }));
  it('refuses missing authentication, invalid body and arbitrary queries before upstream', async () => fixture(async (port, deps) => {
    let calls = 0; deps.nativeFetch = async () => { calls++; throw new Error(); };
    expect((await post(port, CALL, {}, { ...headers, 'x-api-key': '' })).status).toBe(401);
    expect((await post(port, CALL, {}, { ...headers, authorization: '' })).status).toBe(401);
    expect((await post(port, CALL, { sdp: 'offer', session: [] })).status).toBe(400);
    expect((await post(port, CALL + '&destination=https://evil.invalid')).status).toBe(400);
    expect(calls).toBe(0);
  }));
  it('refuses redirects and missing Location; errors retain status without leaking provider bodies', async () => fixture(async (port, deps) => {
    for (const [status, expected] of [[302, 502], [200, 502], [401, 401], [429, 429], [503, 503]]) {
      deps.nativeFetch = async () => new Response('PRIVATE', { status, headers: { 'retry-after': '3' } });
      const result = await post(port); expect(result.status).toBe(expected); expect(result.text).not.toContain('PRIVATE');
    }
  }));
  it('aborts pending native voice requests when the Bridge stops', async () => fixture(async (port, deps, stop) => {
    let aborted = false; let opened!: () => void; const ready = new Promise<void>(r => opened = r);
    deps.nativeFetch = async (_url, init) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }); opened();
    });
    const pending = post(port).catch(() => undefined); await ready; stop();
    expect(aborted).toBe(true); await pending;
  }));
});

const upgrade = (port: number, path: string, supplied = headers) => new Promise<{status: number; socket?: Socket; head?: Buffer}>((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port, path, headers: { ...supplied, connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' } });
  req.on('response', res => { res.resume(); resolve({ status: res.statusCode! }); }); req.on('upgrade', (res, socket, head) => resolve({ status: res.statusCode!, socket, head })); req.on('error', reject); req.end();
});
describe('signed desktop voice sideband', () => {
  it('closes rejected upgrades even when the client keeps its write half open', async () => fixture(async port => {
    const socket = connect({ port, host: '127.0.0.1', allowHalfOpen: true });
    try {
      const ended = new Promise<void>(resolve => socket.once('end', resolve)); socket.resume();
      socket.write('GET /codex-desktop/voice/live/rtc_fixture HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
      await ended;
      // A FIN alone permits writing forever on an allowHalfOpen peer; probe the server's close.
      const closed = new Promise<void>(resolve => socket.once('close', () => resolve())); socket.on('error', () => {});
      socket.write('after rejection'); socket.write('after rejection again');
      await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('rejected upgrade stayed open')), 500))]);
    } finally { socket.destroy(); }
  }));
  it('cancels a pending upstream handshake when the client sends EOF', async () => fixture(async (port, deps) => {
    const upstream = createServer(); let remote: Socket | undefined; let opened!: () => void; const ready = new Promise<void>(r => opened = r);
    upstream.on('upgrade', (_req, socket) => { remote = socket as Socket; socket.on('error', () => {}); opened(); }); const up = await listen(upstream);
    (deps as any).nativeVoiceRequest = (_url: URL, options: any) => request(`http://127.0.0.1:${up}`, options);
    const socket = connect({ port, host: '127.0.0.1', allowHalfOpen: true }); socket.on('error', () => {}); socket.resume();
    try {
      socket.write('GET /codex-desktop/voice/live/rtc_fixture HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nx-api-key: local-only\r\nAuthorization: Bearer native-only\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
      await ready; const ended = new Promise<void>(resolve => remote!.once('end', resolve)); remote!.resume(); socket.end();
      await Promise.race([ended, new Promise((_, reject) => setTimeout(() => reject(new Error('upstream handshake survived client EOF')), 500))]);
    } finally { socket.destroy(); remote?.destroy(); await new Promise<void>(r => upstream.close(() => r())); }
  }));
  it('authenticates upgrades, pins their destination, strips secrets and relays exact frame bytes', async () => fixture(async (port, deps) => {
    const upstream = createServer(); const sockets = new Set<Socket>(); const observed: any[] = [];
    upstream.on('upgrade', (req, socket) => {
      sockets.add(socket as Socket); socket.on('error', () => {}); observed.push(req.headers);
      const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      socket.on('data', bytes => socket.write(bytes));
    });
    const up = await listen(upstream); const urls: string[] = [];
    (deps as any).nativeVoiceRequest = (url: URL, options: any) => { urls.push(String(url)); return request(`http://127.0.0.1:${up}${url.pathname}${url.search}`, options); };
    try {
      for (const [path, target] of [['/codex-desktop/voice/live/rtc_fixture', 'https://api.openai.com/v1/live/rtc_fixture'], ['/codex-desktop/voice/realtime?intent=quicksilver&call_id=rtc_fixture', 'https://api.openai.com/v1/realtime?intent=quicksilver&call_id=rtc_fixture']]) {
        const result = await upgrade(port, path); expect(result.status).toBe(101);
        expect(urls.at(-1)).toBe(target); expect(observed.at(-1).authorization).toBe('Bearer native-only'); expect(observed.at(-1)['x-api-key']).toBeUndefined(); expect(observed.at(-1)['x-untrusted']).toBeUndefined();
        const bytes = Buffer.from([0x81, 0x82, 1, 2, 3, 4, 0x69, 0x6b]); // A masked client frame, relayed opaquely.
        const reply = new Promise<Buffer>(r => result.socket!.once('data', r)); result.socket!.write(bytes); expect(await reply).toEqual(bytes); result.socket!.destroy();
      }
      for (const path of ['/codex-desktop/voice/live/../../evil', '/codex-desktop/voice/live/rtc_fixture?host=evil', '/unknown']) expect((await upgrade(port, path)).status).toBe(400);
      expect((await upgrade(port, '/codex-desktop/voice/live/rtc_fixture', { ...headers, 'x-api-key': '' })).status).toBe(401);
      expect((await upgrade(port, '/codex-desktop/voice/live/rtc_fixture', { ...headers, authorization: '' })).status).toBe(401);
      expect(urls).toHaveLength(2);
    } finally { for (const socket of sockets) socket.destroy(); await new Promise<void>(r => upstream.close(() => r())); }
  }));
});

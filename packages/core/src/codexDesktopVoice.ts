// Native voice only: a fixed HTTP destination and an opaque WebSocket tunnel.
// Provider credentials never enter adapters; the local Bridge capability never leaves loopback.
import { createHash } from 'crypto';
import { request as httpsRequest, type RequestOptions } from 'https';
import type { IncomingMessage, ServerResponse, ClientRequest } from 'http';
import type { Duplex } from 'stream';
import type { NativeFetch } from './codexDesktop';

export const DESKTOP_VOICE_CALL_PATH = '/codex-desktop/backend-api/codex/realtime/calls';
const nativeCall = 'https://chatgpt.com/backend-api/codex/realtime/calls?intent=quicksilver&architecture=avas';
const nativeHeaders = ['authorization', 'chatgpt-account-id', 'openai-beta', 'openai-alpha', 'originator', 'version', 'user-agent', 'session_id', 'conversation_id', 'x-session-id', 'x-codex-turn-state', 'x-codex-turn-metadata', 'x-oai-attestation'];
const callId = /^(?:rtc_[A-Za-z0-9_-]{1,200}|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})$/;
const selectedHeaders = (req: IncomingMessage, names: string[]): Record<string, string> => Object.fromEntries(names.flatMap(name => typeof req.headers[name] === 'string' ? [[name, req.headers[name] as string]] : []));
const error = (res: ServerResponse, status: number, message: string): void => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message } })); };
const nativeAuth = (req: IncomingMessage): boolean => /^Bearer \S+$/.test(req.headers.authorization ?? '');
const queryOnly = (url: URL, allowed: Record<string, string | RegExp>): boolean => {
  const seen = new Set<string>();
  for (const [key, value] of url.searchParams) {
    const rule = allowed[key];
    if (!rule || seen.has(key) || (typeof rule === 'string' ? value !== rule : !rule.test(value))) return false;
    seen.add(key);
  }
  return true;
};

export const forwardDesktopVoiceCall = async (req: IncomingMessage, res: ServerResponse, raw: string, signal: AbortSignal, request: NativeFetch = fetch): Promise<void> => {
  if (!nativeAuth(req)) return error(res, 401, 'Native ChatGPT authorization required');
  const url = new URL(req.url!, 'http://localhost');
  if (!queryOnly(url, { intent: 'quicksilver', architecture: 'avas' })) return error(res, 400, 'Unsupported voice query');
  try {
    const body = JSON.parse(raw);
    if (Buffer.byteLength(raw) > 1024 * 1024 || !body || typeof body.sdp !== 'string' || !body.sdp.trim() || !body.session || typeof body.session !== 'object' || Array.isArray(body.session)
      || Object.keys(body).some(key => !['sdp', 'session'].includes(key))) throw new Error();
  } catch { return error(res, 400, 'Invalid native voice call'); }
  const upstream = await request(nativeCall, { method: 'POST', body: raw, headers: { ...selectedHeaders(req, nativeHeaders), 'content-type': 'application/json' }, signal, redirect: 'manual' });
  if (!upstream.ok) {
    await upstream.body?.cancel();
    const retry = upstream.headers.get('retry-after'); if (retry && /^\d{1,6}$/.test(retry)) res.setHeader('retry-after', retry);
    return error(res, upstream.status >= 400 ? upstream.status : 502, 'Native voice request failed');
  }
  const location = upstream.headers.get('location');
  if (!location || !callId.test(location.split('?')[0].split('/').at(-1) ?? '')) { await upstream.body?.cancel(); throw new Error('Invalid native voice response'); }
  // SDP is small. Bound the answer independently of Content-Length and do not buffer provider errors.
  const reader = upstream.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    if (reader) while (true) {
      signal.throwIfAborted(); const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength; if (size > 1024 * 1024) throw new Error('Voice answer too large'); chunks.push(chunk.value);
    }
  } finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
  if (!size) throw new Error('Empty native voice answer');
  res.writeHead(upstream.status, { 'content-type': 'application/sdp', location }); res.end(Buffer.concat(chunks));
};

export type NativeVoiceRequest = (url: URL, options: RequestOptions) => ClientRequest;
export const rejectVoiceUpgrade = (socket: Duplex, status: number): void => { socket.end(`HTTP/1.1 ${status} ${status === 401 ? 'Unauthorized' : status === 400 ? 'Bad Request' : 'Bad Gateway'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, () => socket.destroy()); };

const sidebandUrl = (raw: string): URL | undefined => {
  // Match the raw path before URL normalisation can erase traversal components.
  const [path] = raw.split('?'); const url = new URL(raw, 'http://localhost');
  if (path.startsWith('/codex-desktop/voice/live/')) {
    const id = path.slice('/codex-desktop/voice/live/'.length);
    if (callId.test(id) && !url.search) return new URL(`https://api.openai.com/v1/live/${id}`);
  }
  if (path === '/codex-desktop/voice/realtime' && callId.test(url.searchParams.get('call_id') ?? '') && queryOnly(url, { intent: 'quicksilver', call_id: callId })) {
    return new URL(`https://api.openai.com/v1/realtime${url.search}`);
  }
  return undefined;
};

export const forwardDesktopVoiceUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer, request: NativeVoiceRequest = httpsRequest): void => {
  if (!nativeAuth(req)) return rejectVoiceUpgrade(socket, 401);
  const url = sidebandUrl(req.url ?? ''); const key = req.headers['sec-websocket-key'];
  if (!url || req.method !== 'GET' || req.headers.upgrade?.toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13'
    || typeof key !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(key)) return rejectVoiceUpgrade(socket, 400);
  const headers = selectedHeaders(req, [...nativeHeaders, 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions']);
  const upstream = request(url, { method: 'GET', headers: { ...headers, connection: 'Upgrade', upgrade: 'websocket' } });
  let peer: Duplex | undefined; let answered = false; let failed = false;
  const fail = (status = 502) => { if (failed) return; failed = true; clearTimeout(timer); if (!answered && !socket.destroyed) { answered = true; rejectVoiceUpgrade(socket, status); } else socket.destroy(); upstream.destroy(); peer?.destroy(); };
  const timer = setTimeout(() => fail(504), 15000); timer.unref();
  socket.on('error', () => { upstream.destroy(); peer?.destroy(); });
  socket.once('end', () => { socket.destroy(); upstream.destroy(); peer?.destroy(); });
  socket.once('close', () => { clearTimeout(timer); upstream.destroy(); peer?.destroy(); });
  upstream.once('error', () => fail());
  upstream.once('response', response => { response.resume(); fail(response.statusCode && response.statusCode >= 400 ? response.statusCode : 502); });
  upstream.once('upgrade', (response, remote, remoteHead) => {
    clearTimeout(timer); peer = remote;
    const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    if (socket.destroyed || response.statusCode !== 101 || response.headers['sec-websocket-accept'] !== accept || response.headers.upgrade?.toLowerCase() !== 'websocket') return fail();
    answered = true;
    const responseHeaders = selectedHeaders(response, ['sec-websocket-accept', 'sec-websocket-protocol', 'sec-websocket-extensions']);
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n' + Object.entries(responseHeaders).map(([k, v]) => `${k}: ${v}\r\n`).join('') + '\r\n');
    remote.on('error', () => socket.destroy()); remote.once('close', () => socket.destroy());
    if (remoteHead.length) socket.write(remoteHead); if (head.length) remote.write(head);
    // Streams supply backpressure and half-close handling; frames (including close/ping) stay opaque.
    socket.pipe(remote).pipe(socket);
  });
  upstream.end();
};

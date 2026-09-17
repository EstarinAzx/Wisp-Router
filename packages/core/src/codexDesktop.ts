// Signed desktop traffic has its own credential boundary. Native auth never enters an adapter.
import type { IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import { wispHomeDir } from './homeStore';

export const desktopStatePath = (home = wispHomeDir()): string => join(home, 'codex-desktop', 'state.json');
export const readDesktopNativeModels = (): string[] | undefined => {
  try {
    const state = JSON.parse(readFileSync(desktopStatePath(), 'utf8'));
    return state.schema === 1 && state.phase === 'active' && Array.isArray(state.nativeModels)
      && state.nativeModels.every((s: unknown) => typeof s === 'string' && s.length > 0)
      ? state.nativeModels : undefined;
  } catch { return undefined; }
};

export type NativeFetch = (url: string, init: RequestInit) => Promise<Response>;
const requestHeaders = ['authorization', 'chatgpt-account-id', 'openai-beta', 'originator', 'version', 'session_id', 'conversation_id', 'x-codex-turn-state', 'x-codex-turn-metadata'];
const responseHeaders = ['content-type', 'cache-control', 'retry-after', 'x-request-id', 'x-codex-turn-state'];

export const forwardDesktopNative = async (req: IncomingMessage, res: ServerResponse, body: string, signal: AbortSignal, request: NativeFetch = fetch): Promise<void> => {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const name of requestHeaders) { const value = req.headers[name]; if (typeof value === 'string') headers.set(name, value); }
  const upstream = await request('https://chatgpt.com/backend-api/codex/responses', { method: 'POST', headers, body, signal, redirect: 'manual' });
  if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); throw new Error('Native redirects are not supported'); }
  const outgoing: Record<string, string> = {};
  for (const name of responseHeaders) { const value = upstream.headers.get(name); if (value) outgoing[name] = value; }
  res.writeHead(upstream.status, outgoing);
  if (upstream.body) {
    const reader = upstream.body.getReader();
    try {
      while (true) {
        signal.throwIfAborted(); const chunk = await reader.read(); if (chunk.done) break;
        if (!res.write(chunk.value)) await new Promise<void>((resolve, reject) => {
          const done = () => { res.off('drain', drained); signal.removeEventListener('abort', aborted); };
          const drained = () => { done(); resolve(); }; const aborted = () => { done(); reject(new Error('Request cancelled')); };
          res.once('drain', drained); signal.addEventListener('abort', aborted, { once: true }); if (signal.aborted) aborted();
        });
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  res.end();
};

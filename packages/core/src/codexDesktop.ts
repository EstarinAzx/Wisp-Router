// Signed desktop traffic has its own credential boundary. Native auth never enters an adapter.
import type { IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import { wispHomeDir } from './homeStore';
import type { Provider } from './catalog';
import type { Target } from './routing';
import { parseCodexModels } from './codexModels';

export const DESKTOP_PROTOCOL = 5;
// Existing-auth live and Desktop tool/follow-up qualification: docs/codex-desktop.md.
const qualifiedAntigravityTargets: readonly Target[] = [
  'gemini-3.8-flash-tiered', 'gemini-4-argon-low', 'gemini-4-argon-medium', 'gemini-4-argon-high',
].map(model => ({ providerId: 'antigravity', model }));
export const desktopTargetIssue = (provider: Provider, model?: string, hoisting = false, admittedTargets = qualifiedAntigravityTargets): string | undefined => {
  if (provider.id === 'gemini-api' || provider.kind === 'gemini-interactions') return 'Gemini API is not qualified for signed Desktop.';
  if (provider.kind !== 'antigravity-oauth') return undefined;
  if (!hoisting) return 'Antigravity cannot preserve signed desktop instruction ordering. Select a supported Provider for desktop; the existing Wisp route is unchanged for other clients.';
  // Release admission is explicit, not inferred from an upstream catalog or mutable Alias name.
  if (!admittedTargets.some(target => target.providerId === provider.id && target.model === model)) return 'Antigravity Target is not validated for Desktop instruction-hoisting compatibility.';
  return undefined;
};

export const desktopStatePath = (home = wispHomeDir()): string => join(home, 'codex-desktop', 'state.json');
export const readDesktopAntigravityHoisting = (home = wispHomeDir()): boolean => {
  try {
    const state = JSON.parse(readFileSync(desktopStatePath(home), 'utf8'));
    return state.schema === 1 && state.phase === 'active' && state.nativeSource === 'native-client-export'
      && Number.isFinite(Date.parse(state.nativeCapturedAt)) && state.antigravityInstructions === 'hoist-developer';
  } catch { return false; }
};
export const readDesktopNativeModels = (): string[] | undefined => {
  try {
    const state = JSON.parse(readFileSync(desktopStatePath(), 'utf8'));
    if (state.schema !== 1 || state.phase !== 'active' || state.nativeSource !== 'native-client-export' || !Number.isFinite(Date.parse(state.nativeCapturedAt))) return undefined;
    return parseCodexModels(state.nativeCatalog).map(model => model.id);
  } catch { return undefined; }
};

export type NativeFetch = (url: string, init: RequestInit) => Promise<Response>;
// Native routing/features are part of the request contract, not just telemetry.
// Keep this allowlist separate from external adapters and never forward the local x-api-key.
const requestHeaders = ['authorization', 'chatgpt-account-id', 'openai-beta', 'originator', 'version',
  'session_id', 'conversation_id', 'thread_id', 'x-codex-turn-state', 'x-codex-turn-metadata',
  'x-codex-routing-hint', 'x-codex-beta-features', 'x-openai-internal-codex-responses-lite',
  'x-codex-installation-id', 'x-codex-window-id', 'x-codex-parent-thread-id', 'x-openai-subagent'];
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

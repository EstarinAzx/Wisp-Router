import { describe, it, expect, vi } from 'vitest';
import { createServer, request, type ClientRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createBridgeServer, type BridgeDeps } from '../src/bridgeServer';
import { ANTIGRAVITY_DAILY_HOST, ANTIGRAVITY_PROD_HOST } from '../src/catalog';

const listen = (server: ReturnType<typeof createServer>): Promise<number> =>
  new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));
const close = async (server: ReturnType<typeof createServer>) => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
};

// Real signed Bridge, client, fetch and sockets; only upstream routing/credentials are synthetic.
// Removing signal forwarding or the client's abort retry guard must break these checks.
describe('signed Antigravity cancellation', () => {
  it.each(['before-headers', 'streaming', 'clone-drain'] as const)('closes stalled upstream without retry: %s', async mode => {
    let upstreamRequests = 0, upstreamClosed = false, clientText = '', cloneRejected = false;
    let upstreamSignal: AbortSignal | null | undefined;
    let upstreamResponse: Response | undefined;
    const attempts: string[] = [];
    const logs: string[] = [];
    const upstream = createServer(async (req, res) => {
      for await (const _chunk of req) { /* consume the complete request before stalling */ }
      upstreamRequests++;
      res.on('close', () => { upstreamClosed = true; });
      if (mode !== 'before-headers') {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: {"response":{"candidates":[{"content":{"parts":[{"text":"START"}]}}]}}\r\n\r\n');
      }
      // No terminal frame or end: only caller cancellation should close this socket.
    });
    const upstreamPort = await listen(upstream);
    const spare = createServer(); const port = await listen(spare); await close(spare);
    const realFetch = globalThis.fetch;
    const allowed = [ANTIGRAVITY_DAILY_HOST, ANTIGRAVITY_PROD_HOST].map(host => `${host}/v1internal:streamGenerateContent?alt=sse`);
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url); attempts.push(target);
      if (!allowed.includes(target)) throw new Error('External network denied by cancellation fixture');
      upstreamSignal = init?.signal;
      // Both host-chain endpoints terminate at this one owned loopback server; no external fetch runs.
      const response = await realFetch(`http://127.0.0.1:${upstreamPort}/synthetic`, init);
      upstreamResponse = response;
      if (mode === 'clone-drain') {
        // Same pre-drain used by the live harness; exercise cancellation before it returns the Response.
        try { await response.clone().text(); }
        catch (error) { cloneRejected = true; throw error; }
      }
      return response;
    });
    const model = 'gemini-3.8-flash-tiered';
    const deps: BridgeDeps = {
      providers: [{ id: 'antigravity', kind: 'antigravity-oauth', label: 'Synthetic', baseUrl: ANTIGRAVITY_DAILY_HOST, defaultModel: model, apiKeyEnv: '' }],
      modelMap: () => ({}), customBaseUrl: () => '', keyFor: async () => '', clientFor: async () => undefined,
      codexSignedIn: async () => false, codexCreds: async () => undefined,
      anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
      antigravitySignedIn: async () => true, antigravityCreds: async () => ({ accessToken: 'synthetic-token', projectId: 'synthetic-project' }),
      effort: () => 'medium', activeProviderId: () => 'antigravity',
      routingMap: () => ({ families: {}, aliases: [{ name: 'synthetic-alias', target: { providerId: 'antigravity', model } }] }),
      aliasPickerShowsModel: () => false, aliasOnlyModels: () => false,
      port: () => port, accessSecret: () => 'synthetic-secret', log: message => logs.push(message),
      desktopNativeModels: () => ['synthetic-native'], desktopAntigravityHoisting: () => true,
      desktopAntigravityTargets: [{ providerId: 'antigravity', model }],
    };
    const bridge = createBridgeServer(deps);
    let client: ClientRequest | undefined;
    try {
      await bridge.start();
      client = request({ host: '127.0.0.1', port, path: '/codex-desktop/v1/responses', method: 'POST',
        headers: { 'x-api-key': 'synthetic-secret', authorization: 'Bearer synthetic-native', 'content-type': 'application/json' } }, res => {
        res.on('data', chunk => { clientText += String(chunk); });
      });
      client.on('error', () => {});
      client.end(JSON.stringify({ model: 'synthetic-alias', input: 'hello', stream: mode === 'streaming' }));
      await vi.waitFor(() => {
        expect(upstreamRequests).toBe(1);
        if (mode === 'streaming') expect(clientText).toContain('START');
        if (mode === 'clone-drain') expect(upstreamResponse).toBeDefined();
      });
      expect(upstreamSignal?.aborted).not.toBe(true);
      expect(upstreamClosed).toBe(false);
      client.destroy();
      await vi.waitFor(() => {
        expect(upstreamClosed).toBe(true);
        expect(upstreamSignal?.aborted).toBe(true);
        if (mode === 'streaming') expect(upstreamResponse?.body?.locked).toBe(false);
        if (mode === 'clone-drain') expect(cloneRejected).toBe(true);
      });
      expect(attempts).toEqual([allowed[0]]);
      expect(upstreamRequests).toBe(1);
      expect(logs.some(message => message.includes('retrying'))).toBe(false);
    } finally {
      client?.destroy(); bridge.stop();
      await close(upstream);
      vi.unstubAllGlobals();
    }
  });
});

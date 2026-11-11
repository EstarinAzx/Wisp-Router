import { afterEach, expect, it } from 'vitest';
import { createServer } from 'http';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createBridgeServer, type BridgeDeps } from '../src/bridgeServer';
import { createSessionLogger, listLogSessions, readSessionLog } from '../src/sessionLog';

const home = mkdtempSync(join(tmpdir(), 'wisp-bridge-sessions-'));
afterEach(() => rmSync(home, { recursive: true, force: true }));
const port = () => new Promise<number>(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as any).port; s.close(() => resolve(p)); }); });

it('attributes interleaved Messages and preserves the base route through advisor calls', async () => {
  const p = await port();
  let unblock!: () => void;
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const sentModels: string[] = [];
  let advisorPass = 0;
  const deps: BridgeDeps = {
    providers: [{ id: 'custom', label: 'Custom', defaultModel: 'test-model', baseUrl: 'http://localhost', apiKeyEnv: '' },
      { id: 'reviewer', label: 'Reviewer', defaultModel: 'reviewer-model', baseUrl: 'http://localhost', apiKeyEnv: '' }],
    modelMap: () => ({}), customBaseUrl: () => 'http://localhost', keyFor: async () => 'PRIVATE-KEY',
    clientFor: async () => ({ chat: { completions: { create: async (body: any) => {
      sentModels.push(body.model);
      if (JSON.stringify(body).includes('PRIVATE-A')) { entered(); await gate; }
      if (body.model === 'test-model' && JSON.stringify(body).includes('CHECK-ADVISOR') && advisorPass++ === 0) {
        return (async function* () { yield { choices: [{ delta: { tool_calls: [{ index: 0, id: 'advisor-call',
          function: { name: 'advisor', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }; })();
      }
      return (async function* () { yield { choices: [{ delta: { content: 'PRIVATE-ANSWER' }, finish_reason: null }] }; })();
    } } } } as any),
    codexSignedIn: async () => false, codexCreds: async () => undefined,
    anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
    effort: () => 'medium', activeProviderId: () => 'custom', routingMap: () => ({ families: {}, aliases: [] }),
    aliasPickerShowsModel: () => false, aliasOnlyModels: () => false, port: () => p, accessSecret: () => 'PRIVATE-KEY', log: () => {},
    sessionLog: createSessionLogger('terminal-bridge', home),
  };
  const bridge = createBridgeServer(deps);
  const send = (id: string, text: string, tools?: unknown[]) => fetch(`http://127.0.0.1:${p}/v1/messages`, {
    method: 'POST', headers: { 'x-api-key': 'PRIVATE-KEY' }, body: JSON.stringify({ model: 'custom', max_tokens: 16,
      metadata: { user_id: JSON.stringify({ session_id: id }) }, messages: [{ role: 'user', content: text }], tools }),
  }).then(async r => ({ status: r.status, body: await r.text() }));
  await bridge.start();
  try {
    const a = send('11111111-1111-4111-8111-111111111111', 'PRIVATE-A');
    await waiting;
    expect((await send('22222222-2222-4222-8222-222222222222', 'PRIVATE-B')).status).toBe(200);
    const during = listLogSessions(home);
    expect(during).toHaveLength(2);
    expect(during.map(s => s.inFlight).sort()).toEqual([0, 1]);
    unblock(); expect((await a).status).toBe(200);
    expect(listLogSessions(home).every(s => s.inFlight === 0 && s.correlated)).toBe(true);
    const records = listLogSessions(home).flatMap(s => readSessionLog(s.id, home));
    expect(records.filter(e => e.event === 'route')).toHaveLength(2);
    expect(JSON.stringify(records)).not.toMatch(/PRIVATE|11111111|22222222/);
    const reply = await send('33333333-3333-4333-8333-333333333333', 'CHECK-ADVISOR',
      [{ type: 'advisor_20260301', name: 'advisor', model: 'reviewer' }]);
    expect(reply.status).toBe(200); expect(reply.body).toContain('advisor_tool_result');
    expect(sentModels.slice(-3)).toEqual(['test-model', 'reviewer-model', 'test-model']);
    const advisorSession = listLogSessions(home).find(s => !during.some(previous => previous.id === s.id))!;
    expect(advisorSession.model).toBe('test-model'); expect(advisorSession.provider).toBe('custom');
  } finally { unblock(); bridge.stop(); }
});

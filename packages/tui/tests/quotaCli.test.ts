import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { AnthropicAuth, CodexAuth, WispHome, type QuotaProvider } from '@wisp/core';
import type { QuotaCommandDeps } from '../src/quotaCli';

// Deferred import makes the missing command an individual RED assertion, not a test discovery error.
const runQuota = async (args: string[], deps?: QuotaCommandDeps) => (await import('../src/quotaCli')).runQuota(args, deps);
let dir: string;
let home: WispHome;
let now: number;
let calls: QuotaProvider[];
let deps: QuotaCommandDeps;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wisp-quota-'));
  home = new WispHome(dir);
  now = 1000000;
  calls = [];
  home.writeAuth({ codex: { accessToken: 'fixture-token', accountId: 'fixture-account' }, anthropic: { accessToken: 'fixture-token' } });
  deps = { home, now: () => now, current: async provider => home.readAuth()[provider] as { accessToken: string; accountId?: string },
    fetch: async provider => { calls.push(provider); return { ok: true, meters: [{ label: '5h', percent: 42, resetAt: 2000000000 }] }; } };
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

test('invalid args cause no store, credential or clock IO', async () => {
  const noIO = new Proxy({}, { get: () => { throw new Error('unexpected IO'); } }) as QuotaCommandDeps;
  for (const args of [['codex'], ['refresh', 'unknown'], ['refresh', 'codex', '--force'], ['--force']]) {
    const result = await runQuota(args, noIO);
    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('Usage:');
  }
});

test('cached display is read-only and refuses expired, future or differently bound readings', async () => {
  await runQuota(['refresh', 'codex'], deps);
  const saved = readFileSync(join(dir, 'quota.json'), 'utf8');
  deps.current = async () => { throw new Error('display must not renew'); };
  now += 100000;
  const result = await runQuota([], deps);
  expect(result.exitCode).toBe(0);
  expect(result.lines.join('\n')).toContain('42%');
  expect(result.lines.join('\n')).toContain('100s');
  expect(readFileSync(join(dir, 'quota.json'), 'utf8')).toBe(saved);
  for (const time of [999999, 1000000 + 86400001]) {
    now = time;
    expect((await runQuota([], deps)).lines.join('\n')).not.toContain('42%');
  }
  now = 1100000;
  home.writeAuth({ codex: {} });
  expect((await runQuota([], deps)).lines.join('\n')).not.toContain('42%');
  expect(calls).toEqual(['codex']);
});

test('display selects whole passive readings without changing context or renewing credentials', async () => {
  await runQuota(['refresh', 'codex'], deps);
  now += 1000;
  home.writeStatus({ updatedAt: now, providerId: 'codex', model: 'fixture', contextPercent: 17,
    authRevision: home.quotaAuthRevision(), meters: [{ label: '7d', percent: 71 }] });
  const before = readFileSync(join(dir, 'status.json'), 'utf8');
  deps.current = async () => { throw new Error('No renewal'); };
  const result = await runQuota([], deps);
  expect(result.lines.join('\n')).toContain('71%');
  expect(result.lines.join('\n')).not.toContain('42%');
  expect(readFileSync(join(dir, 'status.json'), 'utf8')).toBe(before);
  expect(calls).toEqual(['codex']);
  home.writeAuth({ codex: { accessToken: 'different-token' } });
  expect((await runQuota([], deps)).lines.join('\n')).not.toMatch(/42%|71%/);
});

test('reserves the five-minute floor before outbound work and keeps it across instances', async () => {
  home.writeConfig({ provider: 'groq', effort: 'high' });
  home.writeStatus({ updatedAt: 123, providerId: 'groq', model: 'test', contextPercent: 17 });
  const config = readFileSync(join(dir, 'config.json'), 'utf8');
  const status = readFileSync(join(dir, 'status.json'), 'utf8');
  let renewals = 0;
  deps.current = async provider => {
    renewals++;
    expect(home.readQuota().providers[provider]?.nextAllowedAt).toBe(now + 300000);
    return home.readAuth()[provider] as { accessToken: string; accountId?: string };
  };
  expect((await runQuota(['refresh', 'codex'], deps)).exitCode).toBe(0);
  now = 1299999;
  await runQuota(['refresh', 'codex'], { ...deps, home: new WispHome(dir) });
  expect(calls).toEqual(['codex']);
  expect(renewals).toBe(1);
  now = 1300000;
  await runQuota(['refresh', 'codex'], { ...deps, home: new WispHome(dir) });
  expect(calls).toEqual(['codex', 'codex']);
  expect(readFileSync(join(dir, 'config.json'), 'utf8')).toBe(config);
  expect(readFileSync(join(dir, 'status.json'), 'utf8')).toBe(status);
});

test('failures retain the last successful whole reading and a longer retry deadline', async () => {
  await runQuota(['refresh', 'codex'], deps);
  const reading = home.readQuota().providers.codex?.reading;
  now = 1300000;
  deps.fetch = async () => ({ ok: false, code: 'rate_limited', retryAfterMs: 900000 });
  const result = await runQuota(['refresh', 'codex'], deps);
  expect(result.exitCode).toBe(1);
  expect(result.lines.join('\n')).toMatch(/rate.limit/i);
  expect(result.lines.join('\n')).toContain('42%');
  expect(home.readQuota().providers.codex).toEqual({ reading, nextAllowedAt: 2200000 });
  deps.fetch = async provider => { calls.push(provider); return { ok: true, meters: [{ label: '7d', percent: 12 }] }; };
  now = 2199999;
  await runQuota(['refresh', 'codex'], deps);
  expect(calls).toEqual(['codex']);
  now++;
  await runQuota(['refresh', 'codex'], deps);
  expect(home.readQuota().providers.codex?.reading?.meters).toEqual([{ label: '7d', percent: 12 }]);
});

test('account changes during fetch discard readings while preserving all deadlines', async () => {
  await runQuota(['refresh', 'anthropic'], deps);
  deps.fetch = async () => {
    home.writeAuth({ codex: { accessToken: 'new-token', accountId: 'new-account' } });
    return { ok: true, meters: [{ label: '5h', percent: 99 }] };
  };
  const result = await runQuota(['refresh', 'codex'], deps);
  expect(result.exitCode).toBe(1);
  expect(result.lines.join('\n')).toMatch(/credentials changed/i);
  expect(result.lines.join('\n')).not.toMatch(/42%|99%/);
  expect(home.readQuota().providers.codex?.reading).toBeUndefined();
  expect(home.readQuota().providers.codex?.nextAllowedAt).toBe(1300000);
  expect(home.readQuota().providers.anthropic?.nextAllowedAt).toBe(1300000);
});

test('a received retry deadline survives cancellation racing an account change', async () => {
  const controller = new AbortController();
  deps.signal = controller.signal;
  deps.fetch = async () => {
    home.writeAuth({ codex: {} });
    controller.abort();
    return { ok: false, code: 'rate_limited', retryAfterMs: 900000 };
  };
  await runQuota(['refresh', 'codex'], deps);
  expect(home.readQuota().providers.codex).toEqual({ nextAllowedAt: 1900000 });
});

test('credential renewal binds the persisted new revision; stale returned credentials cannot be relabeled', async () => {
  deps.current = async () => {
    const renewed = { accessToken: 'renewed-token', accountId: 'fixture-account' };
    home.writeAuth({ codex: renewed });
    return renewed;
  };
  expect((await runQuota(['refresh', 'codex'], deps)).exitCode).toBe(0);
  expect(home.readQuota().providers.codex?.reading?.authRevision).toBe(home.quotaAuthRevision());
  now = 1300000;
  deps.current = async () => {
    home.writeAuth({ codex: {} });
    return { accessToken: 'renewed-token', accountId: 'fixture-account' };
  };
  expect((await runQuota(['refresh', 'codex'], deps)).exitCode).toBe(1);
  expect(calls).toEqual(['codex']);
  expect((await runQuota([], deps)).lines.join('\n')).not.toContain('42%');
});

test('missing Wisp sign-in skips credential resolution and does not import native credentials', async () => {
  home.writeAuth({ codex: undefined, anthropic: {} });
  deps.current = async () => { throw new Error('must not resolve/import'); };
  expect((await runQuota(['refresh', 'codex'], deps)).lines.join('\n')).toMatch(/sign.in/i);
  expect((await runQuota(['refresh'], deps)).exitCode).toBe(1);
  expect(calls).toEqual([]);
  expect(existsSync(join(dir, 'quota.json'))).toBe(false);
});

test.each(['anthropic', 'codex'] as const)('%s quota renewal preserves concurrent sign-out, replacement and removal', async provider => {
  const originalFetch = globalThis.fetch;
  const expired = `e30.${Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url')}.fixture`;
  const manager = provider === 'codex'
    ? new CodexAuth({ read: () => home.readAuth().codex, write: (c, expected) => { home.writeAuth({ codex: c }, expected === undefined ? undefined : { provider: 'codex', snapshot: expected }); } }, async () => false, () => {})
    : new AnthropicAuth({ read: () => home.readAuth().anthropic, write: (c, expected) => { home.writeAuth({ anthropic: c }, expected === undefined ? undefined : { provider: 'anthropic', snapshot: expected }); } }, async () => false, () => {});
  deps.current = async () => (manager instanceof CodexAuth ? manager.current({ importNative: false }) : manager.current()) as Promise<{ accessToken: string; accountId?: string } | undefined>;
  try {
    for (const change of ['signout', 'replacement', 'removal']) {
      home.writeAuth({ [provider]: { accessToken: expired, refreshToken: 'fixture-refresh', expiresAt: 1, accountId: 'fixture-original' } });
      let expected = '', renewals = 0;
      globalThis.fetch = (async (url: unknown) => {
        expect(String(url)).toBe(provider === 'codex' ? 'https://auth.openai.com/oauth/token' : 'https://platform.claude.com/v1/oauth/token');
        renewals++;
        if (change === 'signout') manager.signOut();
        else home.writeAuth({ [provider]: change === 'removal' ? undefined : { accessToken: 'fixture-new-login', accountId: 'fixture-new-account' } });
        expected = readFileSync(join(dir, 'auth.json'), 'utf8');
        return Response.json({ access_token: 'fixture-renewed-old-login', refresh_token: 'fixture-rotated', expires_in: 3600 });
      }) as typeof fetch;
      const result = await runQuota(['refresh', provider], deps);
      expect(renewals).toBe(1);
      expect(readFileSync(join(dir, 'auth.json'), 'utf8')).toBe(expected);
      expect(result.exitCode).toBe(1);
      expect(calls).toEqual([]);
      expect(home.readQuota().providers[provider]).toEqual({ nextAllowedAt: now + 300000 });
      now += 300000;
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('the real Codex manager can disable native import even if its store becomes absent', async () => {
  const native = join(dir, 'native');
  const nativeHome = new WispHome(native);
  nativeHome.writeAuth({ tokens: { access_token: 'native-token', account_id: 'native-account' } } as any);
  const before = process.env.CODEX_HOME;
  process.env.CODEX_HOME = native;
  try {
    const auth = new CodexAuth({ read: () => undefined, write: () => { throw new Error('unexpected native import'); } },
      async () => { throw new Error('unexpected browser'); }, () => {});
    expect(await auth.current({ importNative: false })).toBeUndefined();
  } finally { if (before === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = before; }
});

test('refresh all is sequential and continues after a redacted provider failure', async () => {
  let active = false;
  deps.fetch = async provider => {
    expect(active).toBe(false);
    active = true;
    calls.push(provider);
    await Promise.resolve();
    active = false;
    if (provider === 'anthropic') throw new Error('PRIVATE_TOKEN PRIVATE_ACCOUNT upstream prose');
    return { ok: true, meters: [{ label: '5h', percent: 42 }] };
  };
  const result = await runQuota(['refresh'], deps);
  expect(result.exitCode).toBe(1);
  expect(calls).toEqual(['anthropic', 'codex']);
  expect(result.lines.join('\n')).not.toContain('PRIVATE');
  expect(readFileSync(join(dir, 'quota.json'), 'utf8')).not.toContain('PRIVATE');
});

test('unknown auth revision and an unwritable deadline fail before a usage request', async () => {
  deps.home.quotaAuthRevision = () => undefined;
  expect((await runQuota(['refresh', 'codex'], deps)).exitCode).toBe(1);
  expect(calls).toEqual([]);
  deps.home = new WispHome(dir);
  now = 1300000;
  deps.home.writeQuota = () => { throw new Error('PRIVATE filesystem error'); };
  const result = await runQuota(['refresh', 'codex'], deps);
  expect(result.exitCode).toBe(1);
  expect(result.lines.join('\n')).not.toContain('PRIVATE');
  expect(calls).toEqual([]);
});

test('a corrupt cache recovers without changing any auth fields', async () => {
  const auth = readFileSync(join(dir, 'auth.json'), 'utf8');
  writeFileSync(join(dir, 'quota.json'), '{broken');
  expect((await runQuota(['refresh', 'codex'], deps)).exitCode).toBe(0);
  expect(home.readQuota().providers.codex?.nextAllowedAt).toBe(1300000);
  expect(readFileSync(join(dir, 'auth.json'), 'utf8')).toBe(auth);
});

test('pre-cancelled actions do no IO, and cancelling fetch aborts it and releases the lock', async () => {
  const controller = new AbortController();
  deps.signal = controller.signal;
  deps.fetch = async (_provider, _creds, { signal }) => {
    calls.push('codex');
    const result = new Promise<never>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    controller.abort();
    return result;
  };
  expect((await runQuota(['refresh', 'codex'], deps)).exitCode).toBe(1);
  expect(existsSync(join(dir, 'quota-refresh.lock'))).toBe(false);
  expect(home.readQuota().providers.codex?.nextAllowedAt).toBe(1300000);
  const before = readFileSync(join(dir, 'quota.json'), 'utf8');
  expect((await runQuota(['refresh', 'anthropic'], deps)).exitCode).toBe(1);
  expect(readFileSync(join(dir, 'quota.json'), 'utf8')).toBe(before);
  expect(calls).toEqual(['codex']);
});

test('each usage request aborts after ten seconds and retains its reservation', async () => {
  let aborted = false;
  deps.fetch = async (_provider, _creds, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true });
  });
  const started = performance.now();
  const result = await runQuota(['refresh', 'codex'], deps);
  expect(performance.now() - started).toBeGreaterThanOrEqual(9900);
  expect(performance.now() - started).toBeLessThan(14000);
  expect(aborted).toBe(true);
  expect(result.exitCode).toBe(1);
  expect(existsSync(join(dir, 'quota-refresh.lock'))).toBe(false);
  expect(home.readQuota().providers.codex?.nextAllowedAt).toBe(1300000);
}, 16000);

test('two processes cannot duplicate a refresh; dead owners recover without bypassing the floor', async () => {
  const root = resolve(import.meta.dir, '../../..');
  const script = join(dir, 'refresh.ts');
  const started = join(dir, 'requests');
  const gate = join(dir, 'continue');
  writeFileSync(script, `
    import { WispHome } from ${JSON.stringify(join(root, 'packages/core/src/homeStore.ts'))};
    import { runQuota } from ${JSON.stringify(join(root, 'packages/tui/src/quotaCli.ts'))};
    import { appendFileSync, existsSync } from 'fs';
    const home = new WispHome(${JSON.stringify(dir)});
    let lockError;
    const lock = home.withQuotaRefreshLock;
    home.withQuotaRefreshLock = async action => {
      try { return await lock(action); }
      catch (error) { lockError = { code: error.code, message: error.message }; throw error; }
    };
    const result = await runQuota(['refresh', 'codex'], { home, now: () => 1000000,
      current: async () => home.readAuth().codex,
      fetch: async () => {
        appendFileSync(${JSON.stringify(started)}, 'request\\n');
        while (!existsSync(${JSON.stringify(gate)})) await Bun.sleep(10);
        return { ok: true, meters: [{ label: '5h', percent: 42 }] };
      } });
    console.log(JSON.stringify({ ...result, lockError }));
  `);
  const launch = () => Bun.spawn([process.execPath, script], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  const first = launch();
  try {
    for (let i = 0; i < 200 && !existsSync(started); i++) await Bun.sleep(10);
    expect(existsSync(started)).toBe(true);
    const second = launch();
    expect(await second.exited).toBe(0);
    expect(JSON.parse(await new Response(second.stdout).text()).lines.join('\n')).toMatch(/busy/i);
    // Crash the owner after the reservation and request; recovery must respect its on-disk floor.
    first.kill();
    await first.exited;
    writeFileSync(gate, 'go');
    const recovered = [launch(), launch()];
    const results = await Promise.all(recovered.map(async child => {
      expect(await child.exited).toBe(0);
      return JSON.parse(await new Response(child.stdout).text());
    }));
    expect(results.some(result => result.exitCode === 0)).toBe(true);
    expect(results.every(result => result.exitCode === 0 || result.lines.join('\n').includes('busy')), JSON.stringify(results)).toBe(true);
    expect(readFileSync(started, 'utf8').trim().split('\n')).toHaveLength(1);
    expect(home.readQuota().providers.codex?.nextAllowedAt).toBe(1300000);
    expect(existsSync(join(dir, 'quota-refresh.lock'))).toBe(false);
  } finally { first.kill(); await first.exited; }
}, 10000);

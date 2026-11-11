import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const freshCatalog = async () => {
  vi.resetModules();
  return (await import('../src/modelsDev')).getModelsDevCatalog;
};

it.each(['headers', 'body'])('bounds stalled catalog %s, aborts transport, and permits retry', async (stage) => {
  vi.useFakeTimers();
  const get = await freshCatalog();
  let transport: AbortSignal | undefined;
  let finish: ((value: unknown) => void) | undefined;
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    transport = init.signal as AbortSignal;
    const stalled = new Promise(resolve => { finish = resolve; });
    return stage === 'headers' ? stalled : { ok: true, json: () => stalled };
  });
  let settled = false;
  const pending = get().then(value => { settled = true; return value; });
  await vi.advanceTimersByTimeAsync(4_000);
  expect(settled).toBe(true);
  expect(await pending).toBeUndefined();
  expect(transport?.aborted).toBe(true);

  // A late answer from a transport/body that ignored abort must not poison the cache.
  finish!(stage === 'headers' ? { ok: true, json: async () => ({ stale: {} }) } : { stale: {} });
  await Promise.resolve();
  vi.stubGlobal('fetch', async () => Response.json({ fresh: { models: {} } }));
  expect(await get()).toEqual({ fresh: { models: {} } });
  vi.stubGlobal('fetch', () => { throw Error('cache should avoid transport'); });
  expect(await get()).toEqual({ fresh: { models: {} } });
});

it('preserves initiating cancellation even when transport ignores abort', async () => {
  const get = await freshCatalog();
  let transport: AbortSignal | undefined;
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    transport = init.signal as AbortSignal;
    return new Promise(() => {});
  });
  const initiating = new AbortController();
  let settled = false;
  const pending = get(initiating.signal).then(value => { settled = true; return value; });
  initiating.abort();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(settled).toBe(true);
  expect(transport?.aborted).toBe(true);
  expect(await pending).toBeUndefined();
});

it('releases aborted later callers without cancelling another caller or caching their fallback', async () => {
  const get = await freshCatalog();
  let answer!: (res: Response) => void;
  let requests = 0;
  let transport: AbortSignal | undefined;
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    requests++;
    transport = init.signal as AbortSignal;
    return new Promise<Response>(resolve => { answer = resolve; });
  });
  const first = get();
  const later = new AbortController();
  const already = new AbortController(); already.abort();
  let settled = 0;
  const waiting = get(later.signal).then(value => { settled++; return value; });
  const cancelled = get(already.signal).then(value => { settled++; return value; });
  later.abort();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(settled).toBe(2);
  expect(await waiting).toBeUndefined();
  expect(await cancelled).toBeUndefined();
  expect(transport?.aborted).toBe(false);
  expect(requests).toBe(1);
  answer(Response.json({ shared: { models: {} } }));
  expect(await first).toEqual({ shared: { models: {} } });
  expect(await get()).toEqual({ shared: { models: {} } });
  expect(await get(already.signal)).toBeUndefined();
});

it('does not start catalog I/O for an already-aborted initiating caller', async () => {
  const get = await freshCatalog();
  let requests = 0;
  vi.stubGlobal('fetch', async () => { requests++; return Response.json({}); });
  const controller = new AbortController(); controller.abort();
  expect(await get(controller.signal)).toBeUndefined();
  expect(requests).toBe(0);
});

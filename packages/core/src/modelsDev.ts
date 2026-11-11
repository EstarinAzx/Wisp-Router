// ----------------- modelsDev.ts — Wisp: fetch + cache the models.dev capability catalog ----------------- //

/*
 * Depends on:
 *   - global fetch (Node 18+, present in the VS Code extension host) — one GET of models.dev/api.json.
 *   - ./catalog: the ModelsDevCatalog type. The pure parse/lookup over this data lives in catalog.ts;
 *     this module owns ONLY the network + cache.
 *
 * models.dev publishes a public, no-auth aggregated catalog (~145 providers) carrying each model's real
 * limit.context / limit.output and modalities — the source that lets Wisp read context/vision instead
 * of hardcoding. It is an enhancement, never a hard dependency: any failure degrades to the table.
 */

import type { ModelsDevCatalog } from './catalog';

// ----------------------------- Constants ----------------------------- //

const API_URL = 'https://models.dev/api.json';
const TTL_MS = 30 * 60 * 1000; // models.dev changes rarely — refetch at most ~twice an hour.
const FETCH_TIMEOUT_MS = 4_000;

// ----------------------------- Cache ----------------------------- //

let cache: { at: number; catalog: ModelsDevCatalog } | undefined;
let inflight: Promise<ModelsDevCatalog | undefined> | undefined;

// A stalled body/transport may ignore abort; release the caller independently of that work.
const untilAborted = async (pending: Promise<ModelsDevCatalog | undefined>, signal: AbortSignal): Promise<ModelsDevCatalog | undefined> => {
  if (signal.aborted) return undefined;
  let onAbort!: () => void;
  const aborted = new Promise<undefined>((resolve) => {
    onAbort = () => resolve(undefined);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([pending, aborted]); }
  finally { signal.removeEventListener('abort', onAbort); }
};

// One network GET, swallowing any failure (offline, 5xx, bad JSON) into undefined so the caller falls
// back to the table/default. Failures are NOT cached, so the next call retries.
const fetchCatalog = async (signal?: AbortSignal): Promise<ModelsDevCatalog | undefined> => {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), FETCH_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  try {
    return await untilAborted((async () => {
      const res = await fetch(API_URL, { signal: combined });
      if (!res.ok) return undefined;
      return (await res.json()) as ModelsDevCatalog;
    })(), combined);
  } catch {
    return undefined;
  } finally { clearTimeout(timer); }
};

// The cached catalog, refetching only past the TTL. Concurrent callers share one in-flight request, so
// VS Code's frequent provideLanguageModelChatInformation calls never fan out duplicate GETs.
export const getModelsDevCatalog = async (signal?: AbortSignal): Promise<ModelsDevCatalog | undefined> => {
  if (signal?.aborted) return undefined;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.catalog;
  if (!inflight) {
    inflight = fetchCatalog(signal).then((catalog) => {
      if (catalog) cache = { at: Date.now(), catalog };
      inflight = undefined;
      return catalog;
    });
  }
  return signal ? untilAborted(inflight, signal) : inflight;
};

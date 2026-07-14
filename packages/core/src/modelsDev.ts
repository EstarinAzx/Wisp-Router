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

// ----------------------------- Cache ----------------------------- //

let cache: { at: number; catalog: ModelsDevCatalog } | undefined;
let inflight: Promise<ModelsDevCatalog | undefined> | undefined;

// One network GET, swallowing any failure (offline, 5xx, bad JSON) into undefined so the caller falls
// back to the table/default. Failures are NOT cached, so the next call retries.
const fetchCatalog = async (): Promise<ModelsDevCatalog | undefined> => {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) return undefined;
    return (await res.json()) as ModelsDevCatalog;
  } catch {
    return undefined;
  }
};

// The cached catalog, refetching only past the TTL. Concurrent callers share one in-flight request, so
// VS Code's frequent provideLanguageModelChatInformation calls never fan out duplicate GETs.
export const getModelsDevCatalog = async (): Promise<ModelsDevCatalog | undefined> => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.catalog;
  if (!inflight) {
    inflight = fetchCatalog().then((catalog) => {
      if (catalog) cache = { at: Date.now(), catalog };
      inflight = undefined;
      return catalog;
    });
  }
  return inflight;
};

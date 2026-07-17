// ---------------------------- modelFetch.ts — renderer-free model-list fetch ---------------------------- //

/*
 * Depends on:
 *   - @wisp/core: curated OAuth lists + base-URL/key resolution.
 *   - ./store: the shared ~/.wisp handle.
 *
 * Data shapes: none of its own.
 *
 * Extracted from providerScreens.tsx with #123 so the headless `wisp models` path never
 * imports a Screen module (renderer-free seam — same rule as the routing CLI).
 */

import {
  resolveBaseUrl, resolveKeyId, oauthModelOptions, getModelsDevCatalog, type Provider,
} from '@wisp/core';
import { home } from './store';

// ----------------------------- Fetch (throwing) ----------------------------- //

// A Provider's model list: curated for the OAuth kinds, live GET <base>/models for keyed rows
// (same probe the extension uses). undefined = the Provider has no list to give (no base URL /
// empty answer). Failures THROW with the backend's own words — `wisp models` prints them
// verbatim; the TUI face below swallows into the pickers' free-text fallback.
export const fetchModelList = async (p: Provider): Promise<string[] | undefined> => {
  const catalog = await getModelsDevCatalog().catch(() => undefined);
  const curated = oauthModelOptions(p, catalog);
  if (curated) return curated;
  const base = resolveBaseUrl(p, home.readConfig().customBaseUrl ?? '');
  if (!base) return undefined;
  const key = home.readAuth().keys?.[resolveKeyId(p)] || (p.apiKeyEnv ? process.env[p.apiKeyEnv] : undefined);
  const res = await fetch(`${base}/models`, {
    headers: key ? { Authorization: `Bearer ${key}` } : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).trim().slice(0, 300);
    throw new Error(`${res.status}${res.statusText ? ` ${res.statusText}` : ''}${text ? ` — ${text}` : ''} (GET ${base}/models)`);
  }
  const body = (await res.json()) as { data?: Array<{ id?: string }> };
  const ids = (body.data ?? []).map((m) => m.id).filter((id): id is string => !!id).sort();
  return ids.length ? ids : undefined;
};

// ----------------------------- Fetch (swallowing — the Screens' face) ----------------------------- //

// The pickers' contract, unchanged (#117): undefined on ANY failure → free-text fallback.
export const fetchModelOptions = async (p: Provider): Promise<string[] | undefined> => {
  try { return await fetchModelList(p); } catch { return undefined; }
};

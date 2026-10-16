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
  resolveBaseUrl, oauthModelOptions, getModelsDevCatalog, isAntigravityProvider, fetchAntigravityModels,
  isCodexProvider, codexCatalog, codexModelIds, codexModelEffort, codexEffortOptions, effortOptionsFor, resolveModel, type Provider,
} from '@wisp/core';
import { home, bearerFor, antigravityAuth, codexAuth } from './store';
import { isGeminiApiProvider } from '@wisp/core';

// ----------------------------- Fetch (throwing) ----------------------------- //

// A Provider's model list: curated for the OAuth kinds, live GET <base>/models for keyed rows
// (same probe the extension uses). undefined = the Provider has no list to give (no base URL /
// empty answer). Failures THROW with the backend's own words — `wisp models` prints them
// verbatim; the TUI face below swallows into the pickers' free-text fallback.
export const fetchModelList = async (p: Provider, refresh = false): Promise<string[] | undefined> => {
  if (isGeminiApiProvider(p)) return ['gemini-4-argon'];
  if (isCodexProvider(p)) {
    const result = await codexCatalog.get({ creds: await codexAuth.current(), baseUrl: resolveBaseUrl(p, ''), refresh });
    if (result.source === 'unavailable') throw new Error(result.error);
    return codexModelIds(result.models);
  }
  // Antigravity: prefer the upstream's own list when signed in, so a model released after the static
  // snapshot appears without a Wisp release. A live failure falls back to the curated table instead of
  // throwing — the static list is a real answer, and the picker stays useful offline.
  if (isAntigravityProvider(p)) {
    const creds = await antigravityAuth.current().catch(() => undefined);
    if (creds?.accessToken) {
      try {
        const live = await fetchAntigravityModels(creds, resolveBaseUrl(p, home.readConfig().customBaseUrl ?? ''));
        if (live.length) return live;
      } catch { /* static fallback below */ }
    }
  }
  const catalog = await getModelsDevCatalog().catch(() => undefined);
  const curated = oauthModelOptions(p, catalog);
  if (curated) return curated;
  const base = resolveBaseUrl(p, home.readConfig().customBaseUrl ?? '');
  if (!base) return undefined;
  const key = await bearerFor(p);
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
export const fetchModelOptions = async (p: Provider, refresh = false): Promise<string[] | undefined> => {
  try { const ids = await fetchModelList(p, refresh); return ids?.length ? ids : undefined; } catch { return undefined; }
};

export const fetchEffortOptions = async (p: Provider): Promise<{ options: string[]; current?: string }> => {
  const cfg = home.readConfig();
  if (!isCodexProvider(p)) return { options: effortOptionsFor(p), current: cfg.effort };
  const { models } = await codexCatalog.get({ creds: await codexAuth.current(), baseUrl: resolveBaseUrl(p, '') });
  const info = models.find((m) => m.id === resolveModel(cfg.models ?? {}, p));
  return { options: codexEffortOptions(info), current: codexModelEffort(info, cfg.effort) };
};

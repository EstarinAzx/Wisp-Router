# Live OAuth Model Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The panel MODEL dropdowns for the Codex and Anthropic OAuth Providers, and their picker context windows, come live from models.dev instead of hardcoded lists/tables — curated fallbacks when offline.

**Architecture:** Two new pure filter/sort functions in `src/catalog.ts` (the vscode-free pure layer) read the already-fetched models.dev catalog (`src/modelsDev.ts`, cached, 30-min TTL). `getState` in `src/extension.ts` feeds them into `modelOptions` behind a 4s race-timeout so panel open never stalls. The caps closure in `src/chatProvider.ts` prefers a models.dev lookup (`openai` / `anthropic` keys) over the hardcoded window tables.

**Tech Stack:** TypeScript, Vitest (pure-logic unit tests only — no Electron host), VS Code extension host.

**Spec:** `docs/superpowers/specs/2026-07-13-live-oauth-model-lists-design.md`

## Global Constraints

- Work on branch `feat/live-oauth-model-lists` off `main` (create it in Task 1 Step 0).
- Arrow functions by default (project CLAUDE.md rule).
- Elucidate house style: section banners, sparse why-comments; update a comment in the same edit as its code.
- The curated lists (`CODEX_MODELS`, `ANTHROPIC_MODELS`) remain and are the fallback — never removed.
- Each OAuth row's `defaultModel` must remain a member of its curated fallback list.
- Panel/webview code untouched — it already renders whatever `modelOptions` arrives.
- Run tests with `npm test` (Vitest, all suites) or `npx vitest run src/<file>` for one file.

---

### Task 1: `codexModelsFrom` — live Codex dropdown ids

**Files:**
- Modify: `src/catalog.ts` (models.dev section ~line 253; Codex section ~line 629)
- Test: `src/codex.test.ts`

**Interfaces:**
- Consumes: `ModelsDevCatalog` type (exists), `CODEX_MODELS` (exists).
- Produces: `export const codexModelsFrom = (catalog?: ModelsDevCatalog): string[]` — Task 3 imports it. Also a private `sortByReleaseDesc(models, ids)` helper reused by Task 2, and `release_date?: string` on `ModelsDevEntry`.

- [ ] **Step 0: Create the branch**

```bash
git checkout -b feat/live-oauth-model-lists
```

- [ ] **Step 1: Write the failing tests**

In `src/codex.test.ts`, add `codexModelsFrom` to the existing `./catalog` import list, then append:

```ts
describe('codexModelsFrom', () => {
  // A miniature models.dev openai entry exercising every filter rule at once.
  const catalog = {
    openai: {
      models: {
        'gpt-5.6-sol': { release_date: '2026-07-09' },
        'gpt-5.6-terra': { release_date: '2026-07-09' },
        'gpt-5.5': { release_date: '2026-03-12' },
        'gpt-5.5-pro': { release_date: '2026-03-12' },
        'gpt-5.4-nano': { release_date: '2025-12-05' },
        'gpt-5.3-chat-latest': { release_date: '2025-10-01' },
        'o4-mini-deep-research': { release_date: '2025-06-26' },
        'o4-mini': { release_date: '2025-04-16' },
        'gpt-5.2': {}, // undated → must trail the dated ids, not vanish
        'o1': { release_date: '2024-12-17' },
        'gpt-4.1': { release_date: '2025-04-14' },
      },
    },
  };

  it('keeps the Codex-served families newest-first, drops the API-only variants', () => {
    // Dropped: -pro, -nano, -chat-latest, -deep-research suffixes; o1/gpt-4.1 (outside the keep families).
    // Sol before terra: same release_date → alphabetical tiebreak. Undated gpt-5.2 trails.
    expect(codexModelsFrom(catalog)).toEqual(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.5', 'o4-mini', 'gpt-5.2']);
  });

  it('falls back to the curated list when the catalog is absent, has no openai entry, or filters to nothing', () => {
    expect(codexModelsFrom(undefined)).toEqual(CODEX_MODELS);
    expect(codexModelsFrom({})).toEqual(CODEX_MODELS);
    expect(codexModelsFrom({ openai: { models: { 'gpt-4.1': {} } } })).toEqual(CODEX_MODELS);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/codex.test.ts`
Expected: FAIL — `codexModelsFrom` is not exported.

- [ ] **Step 3: Implement**

In `src/catalog.ts`:

(a) Extend `ModelsDevEntry` (line ~253) with the release date:

```ts
type ModelsDevEntry = { limit?: { context?: number; output?: number }; modalities?: { input?: string[] }; release_date?: string };
```

(b) Below `lookupModelsDevCaps` (line ~269), add the shared sort helper:

```ts
// Order dropdown ids newest-first by models.dev release_date (ISO dates compare lexicographically);
// undated ids trail, alphabetically, so an entry missing metadata can never bury a fresh release.
const sortByReleaseDesc = (models: Record<string, ModelsDevEntry>, ids: string[]): string[] =>
  [...ids].sort((a, b) => {
    const da = models[a]?.release_date ?? '';
    const db = models[b]?.release_date ?? '';
    return da !== db ? (db < da ? -1 : 1) : a.localeCompare(b);
  });
```

(c) Refresh the curated fallback (line ~629) — comment updated in the same edit:

```ts
// Curated Codex model ids — the OFFLINE FALLBACK for codexModelsFrom (the live models.dev list is the
// primary source). The codex row's defaultModel must stay a member of this list.
export const CODEX_MODELS: string[] = [
  'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex',
  'gpt-5.3-codex-spark', 'gpt-5.2-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini',
  'gpt-5.4-mini', 'o3', 'o4-mini',
];
```

(d) Directly below `CODEX_MODELS`, the live list:

```ts
// Live Codex dropdown ids from models.dev's openai lineup — keep the families the ChatGPT-subscription
// Codex backend serves (gpt-5*, o3*, o4-mini*), drop the API-only variants it rejects (-pro, -nano,
// -chat-latest, -deep-research). Catalog absent or filter empty → curated fallback, the old behaviour.
export const codexModelsFrom = (catalog?: ModelsDevCatalog): string[] => {
  const models = catalog?.openai?.models;
  if (!models) return CODEX_MODELS;
  const ids = Object.keys(models).filter(
    (id) => /^(gpt-5|o3|o4-mini)/.test(id) && !/-(pro|nano|chat-latest|deep-research)$/.test(id),
  );
  return ids.length ? sortByReleaseDesc(models, ids) : CODEX_MODELS;
};
```

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run src/codex.test.ts`
Expected: PASS, including the pre-existing `CODEX_MODELS` describe (the list gained ids, lost none).

- [ ] **Step 5: Commit**

```bash
git add src/catalog.ts src/codex.test.ts
git commit -m "feat(catalog): live Codex model list from models.dev, curated fallback"
```

---

### Task 2: `anthropicModelsFrom` — live Claude dropdown ids

**Files:**
- Modify: `src/catalog.ts` (Anthropic section ~line 865)
- Test: `src/anthropic.test.ts`

**Interfaces:**
- Consumes: `sortByReleaseDesc` (Task 1), `ANTHROPIC_MODELS` (exists).
- Produces: `export const anthropicModelsFrom = (catalog?: ModelsDevCatalog): string[]` — Task 3 imports it.

- [ ] **Step 1: Write the failing tests**

In `src/anthropic.test.ts`, add `anthropicModelsFrom` and `ANTHROPIC_MODELS` to the `./catalog` import list, then append:

```ts
describe('anthropicModelsFrom', () => {
  const catalog = {
    anthropic: {
      models: {
        'claude-opus-4-8': { release_date: '2026-05-28' },
        'claude-sonnet-5': { release_date: '2026-06-29' },
        'claude-haiku-4-5': { release_date: '2025-10-01' },
        'claude-haiku-4-5-20251001': { release_date: '2025-10-01' }, // dated snapshot → dropped
        'claude-fable-5': { release_date: '2026-07-01' }, // unknown family → kept (no whitelist)
      },
    },
  };

  it('drops dated snapshots, keeps every undated id newest-first — no family whitelist', () => {
    expect(anthropicModelsFrom(catalog)).toEqual(['claude-fable-5', 'claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5']);
  });

  it('falls back to the curated list when the catalog is absent or empty', () => {
    expect(anthropicModelsFrom(undefined)).toEqual(ANTHROPIC_MODELS);
    expect(anthropicModelsFrom({ anthropic: { models: {} } })).toEqual(ANTHROPIC_MODELS);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/anthropic.test.ts`
Expected: FAIL — `anthropicModelsFrom` is not exported.

- [ ] **Step 3: Implement**

In `src/catalog.ts`, replace the `ANTHROPIC_MODELS` block (line ~865) with:

```ts
// Curated Claude model ids — the OFFLINE FALLBACK for anthropicModelsFrom (the live models.dev list is
// the primary source). The anthropic row's defaultModel must stay a member.
export const ANTHROPIC_MODELS: string[] = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

// Live Claude dropdown ids from models.dev — undated aliases only (dated -YYYYMMDD snapshots duplicate
// them). Deliberately NO family whitelist: a brand-new family name must appear, never be filtered out.
export const anthropicModelsFrom = (catalog?: ModelsDevCatalog): string[] => {
  const models = catalog?.anthropic?.models;
  if (!models) return ANTHROPIC_MODELS;
  const ids = Object.keys(models).filter((id) => !/-\d{8}$/.test(id));
  return ids.length ? sortByReleaseDesc(models, ids) : ANTHROPIC_MODELS;
};
```

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run src/anthropic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/catalog.ts src/anthropic.test.ts
git commit -m "feat(catalog): live Claude model list from models.dev, curated fallback"
```

---

### Task 3: Wire the panel — `getState` feeds live lists into `modelOptions`

**Files:**
- Modify: `src/extension.ts` (imports ~line 25; `getState` lines 320–357)
- Modify: `src/sidePanelProvider.ts:37` (comment only — sync with the new source)

**Interfaces:**
- Consumes: `codexModelsFrom` (Task 1), `anthropicModelsFrom` (Task 2), `getModelsDevCatalog` from `./modelsDev` (exists; NOT yet imported in extension.ts).
- Produces: `PanelState.modelOptions` now models.dev-sourced. No new exports.

- [ ] **Step 1: Add imports**

In `src/extension.ts`: add `codexModelsFrom` and `anthropicModelsFrom` to the existing `./catalog` import list (lines 25–26), and add:

```ts
import { getModelsDevCatalog } from './modelsDev';
```

- [ ] **Step 2: Fetch the catalog in `getState`**

Inside `getState` (line ~320), after the `signedIn` resolution and before the `return`, insert:

```ts
  // The OAuth dropdowns are models.dev-sourced — race the cached fetch against a short timeout (same
  // pattern as chatProvider) so a cold/slow models.dev can never stall panel open; undefined → curated
  // fallback inside the *ModelsFrom pures. Skipped entirely for the API-key kinds (live /models instead).
  const catalog = isCodexProvider(p) || isAnthropicProvider(p)
    ? await Promise.race([
        getModelsDevCatalog(),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 4000)),
      ])
    : undefined;
```

- [ ] **Step 3: Swap the `modelOptions` line**

Replace lines 339–340:

```ts
    // The OAuth Providers have no /models route — offer the curated list instead of a live fetch.
    modelOptions: isCodexProvider(p) ? CODEX_MODELS : isAnthropicProvider(p) ? ANTHROPIC_MODELS : undefined,
```

with:

```ts
    // The OAuth Providers have no /models route — their dropdown comes from models.dev (curated fallback).
    modelOptions: isCodexProvider(p) ? codexModelsFrom(catalog) : isAnthropicProvider(p) ? anthropicModelsFrom(catalog) : undefined,
```

If `CODEX_MODELS` / `ANTHROPIC_MODELS` are now unused in extension.ts, remove them from the import list (your change made them orphans).

- [ ] **Step 4: Sync the PanelState comment**

In `src/sidePanelProvider.ts:37`, update the field comment:

```ts
  modelOptions?: string[]; // OAuth kinds only: models.dev-sourced ids for the dropdown (curated fallback; no live /models route)
```

- [ ] **Step 5: Compile + full suite**

Run: `npm run compile` — Expected: clean (tsc x2 + vite).
Run: `npm test` — Expected: all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add src/extension.ts src/sidePanelProvider.ts
git commit -m "feat(panel): OAuth model dropdowns read live models.dev lists"
```

---

### Task 4: Live caps for the OAuth kinds (spec Slice 2)

**Files:**
- Modify: `src/chatProvider.ts:126-131` (the `caps` closure)

**Interfaces:**
- Consumes: `lookupModelsDevCaps`, `codexModelCaps`, `anthropicModelCaps` (all already imported in chatProvider.ts).
- Produces: picker windows for Codex/Anthropic ids now prefer models.dev's real limits (e.g. gpt-5.6-sol 1.05M/128K) over the regex tables. No signature changes.

- [ ] **Step 1: Rework the closure**

Replace lines 126–131:

```ts
    // Codex and Anthropic have no models.dev catalogKey (no /models route), so each uses its own real-window
    // table; every other row pulls live caps from models.dev when it has a catalogKey.
    const caps = (provider: Provider, model: string) =>
      isCodexProvider(provider) ? codexModelCaps(model)
        : isAnthropicProvider(provider) ? anthropicModelCaps(model)
          : provider.catalogKey ? lookupModelsDevCaps(catalog, provider.catalogKey, model) : undefined;
```

with:

```ts
    // Codex and Anthropic have no catalogKey, but models.dev's openai/anthropic entries DO carry their
    // real windows — look the id up there first so new releases (gpt-5.6's 1M window) are honest, and
    // fall back to each kind's hardcoded table offline; every other row pulls caps via its catalogKey.
    const caps = (provider: Provider, model: string) =>
      isCodexProvider(provider) ? (lookupModelsDevCaps(catalog, 'openai', model) ?? codexModelCaps(model))
        : isAnthropicProvider(provider) ? (lookupModelsDevCaps(catalog, 'anthropic', model) ?? anthropicModelCaps(model))
          : provider.catalogKey ? lookupModelsDevCaps(catalog, provider.catalogKey, model) : undefined;
```

- [ ] **Step 2: Compile + full suite**

Run: `npm run compile` — Expected: clean.
Run: `npm test` — Expected: PASS (the pure pieces — `lookupModelsDevCaps`, the tables — are already covered; this is glue).

- [ ] **Step 3: Commit**

```bash
git add src/chatProvider.ts
git commit -m "feat(chat): OAuth picker caps prefer live models.dev windows over the tables"
```

---

### Task 5: Verification gate

**Files:** none (verification only).

- [ ] **Step 1: Full gates**

Run: `npm test` — Expected: every suite green (278 pre-existing + the new describes).
Run: `npm run compile` — Expected: clean; `out/` + `dist/` rebuilt.

- [ ] **Step 2: Manual demo (user drives — Extension Dev Host)**

⚠ `npm run compile` FIRST (stale-build trap), uninstall any installed Wisp before F5 (dup-panel trap). Then F5:

1. Panel → Provider **Codex** → MODEL dropdown lists `gpt-5.6-sol` / `-terra` / `-luna` at the top, no `-pro`/`-nano`/`-chat-latest` ids.
2. Panel → Provider **Anthropic** → dropdown shows `claude-sonnet-5` etc., newest first, no dated snapshots.
3. Copilot picker → the Codex row's Context Size reflects the 5.6 window (~1.05M total), not 400K.
4. Offline check (optional): disconnect network, Developer: Reload Window → dropdowns still populate (curated fallback).

- [ ] **Step 3: Hand off**

Implementation done → `/preset wrap-up` gates the finish (context update, pick-up note, ship decision: PR `feat/live-oauth-model-lists` → main).

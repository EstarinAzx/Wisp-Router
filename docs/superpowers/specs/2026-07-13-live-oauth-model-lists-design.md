# Live OAuth model lists — design

**Date:** 2026-07-13 · **Status:** approved (brainstorm) · **Owner:** Wisp panel / catalog

## Problem

The panel MODEL dropdowns for the two OAuth Providers (Codex, Anthropic) come from hardcoded
curated lists (`CODEX_MODELS` at `catalog.ts:631`, `ANTHROPIC_MODELS` at `catalog.ts:867`),
because neither backend exposes a `/models` route. ChatGPT shipped gpt-5.6 Sol/Terra/Luna and
the dropdown doesn't show them; the user had to type the id manually. Every future OpenAI or
Anthropic release goes stale the same way. API-key Providers don't have this problem — their
dropdown is a live `/v1/models` fetch.

## Decision

Source both OAuth dropdowns from **models.dev** — already fetched and cached by Wisp
(`modelsDev.ts`, 30-min TTL) for capability data, and verified to carry the new ids
(`gpt-5.6-sol/terra/luna`, `claude-sonnet-5`, `claude-opus-4-8`) within hours of release.
The curated lists remain as the offline fallback, refreshed once now.

## Behavior

Two new pure functions in `catalog.ts` (unit-tested):

- **`codexModelsFrom(catalog?)`** — the keys of `catalog.openai.models`:
  - keep ids matching `^(gpt-5|o3|o4-mini)`;
  - drop ids with a `-pro`, `-nano`, `-chat-latest`, or `-deep-research` suffix (the
    ChatGPT-subscription Codex backend does not serve them);
  - sort newest-first by the entry's `release_date` (entries without one sort last,
    alphabetically);
  - catalog absent, provider missing, or filter result empty → return `CODEX_MODELS` unchanged.
- **`anthropicModelsFrom(catalog?)`** — the keys of `catalog.anthropic.models`:
  - drop dated snapshots (ids ending `-YYYYMMDD`) — they duplicate the undated aliases;
  - no family whitelist (a new family name must not be filtered out);
  - same sort and same fallback to `ANTHROPIC_MODELS`.

Curated fallback refresh (one-time): prepend `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` to
`CODEX_MODELS`; add `claude-sonnet-5` to `ANTHROPIC_MODELS`. The invariant that each OAuth row's
`defaultModel` is a member of its fallback list is unchanged.

Wiring: `getState` (`extension.ts:320`, already async) awaits `getModelsDevCatalog()` raced
against a short timeout — the same never-stall pattern `chatProvider.ts:119` uses — and feeds
the result to the two pures for `modelOptions`. Fetch failure or timeout → fallback lists; the
panel never blocks on the network. The webview is untouched: it already renders whatever list
arrives and prepends the active model when it isn't a member.

New ids work day one without code changes: `codexModelCaps` and `anthropicModelCaps` match by
family/regex, and `anthropicThinkingEffort` omits the thinking fields for ids not in its support
table (degrades, never 400s).

## Slice 2 — live caps for the OAuth kinds (approved in-scope)

models.dev reports `gpt-5.6-sol` at 1.05M context / 128K output; `codexModelCaps` hardcodes
400K/32K for all gpt-5.x — the caps tables go stale exactly like the model lists did. Fix in the
same pattern: when the models.dev catalog has an entry for the id (under `openai` /
`anthropic`), use its limits; else fall back to the existing regex tables. Small change in the
caps path only.

## Error handling

- models.dev unreachable/slow → timeout fires → curated fallback; no user-visible error.
- Junk or unexpected ids in models.dev → the keep/drop filters bound what can appear.
- A listed id the backend rejects (filter false-positive) → existing backend-error surface when
  picked; user picks another. Accepted trade-off (chosen over a stale whitelist).

## Testing

Vitest on the pures: keep/drop filter cases (codex suffix drops, anthropic dated-snapshot
drops), release_date sort incl. missing-date entries, fallback on absent catalog and on empty
filter result. Existing `codex.test.ts` / `anthropic.test.ts` / `catalog.test.ts` suites stay
green.

## Out of scope

- Effort-support tables stay id-based (mirrors openclaude; a new Claude family silently sends no
  effort until its row is added — safe degrade, same as Haiku today).
- No live-refresh button for the OAuth dropdowns (the 30-min TTL covers it).
- `defaultModel` values unchanged.
- Forced `tool_choice` / `temperature` threading — unrelated, still deliberately deferred.

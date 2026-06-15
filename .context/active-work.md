---
type: active-work
project: wisp
updated: 2026-06-15
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-06-15 by Opus 4.8 (auto)_
_At commit: uncommitted (rebrand across package.json, src/*, webview, docs) on branch `docs/inquire-spec` off `main`_

## Current focus
**Issue 3 — rebrand the product to Wisp** (provider/product split). Pure mechanical rename, **no
behavior change**: the product is now **Wisp**; **OpenCode Zen** is the (current, first) **Provider**.
Done + grilled; ready to land. Sets up future multi-provider work.

## State
- **In flight:** nothing — Issue 3 built, compiles clean, packaged `wisp-0.0.5.vsix`.
- **Done this session:**
  - Product identifiers `opencodeAutocomplete`/"OpenCode" → `wisp`/"Wisp": `package.json` (name,
    v0.0.5, container/view ids+titles, 4 command ids+titles, menu, config title, 8 setting keys, icon),
    `src/extension.ts` (`CONFIG_NS`, `SECRET_KEY=wisp.apiKey`, status bar, output channel "Wisp", all
    `Wisp:` toasts, `registerCommand`s, `affectsConfiguration`s, class refs), `src/sidePanelProvider.ts`
    (`WispPanelProvider`, `viewId=wisp.panel`, `<title>`), `webview/app.tsx` (key placeholder).
  - `media/opencode.svg` → `media/wisp.svg` (git mv, same glyph); lockfile synced to `wisp`/`0.0.5`.
  - **Provider plumbing untouched** (`DEFAULT_BASE_URL`, `OPENCODE_API_KEY`, "OpenCode Zen provider").
  - Docs: README rewritten + drive-by fixes (`minimax-m3`, `maxTokens` 0) + Inquire synced; `CONTEXT.md`,
    `PRD.md`, all `.context/*` updated; rebrand ADR in `decisions.md`.
  - **Grill (shared understanding):** `CONTEXT.md` gained **Provider** (first-class swappable role),
    canonical **OpenCode Zen** name (vendor+product; gateway excluded), "the extension" blessed synonym;
    `PRD.md` M3 `OpenCodeClient` → **`ProviderClient`**.
- **Blocked:** nothing.

## Pick up here
Issue 3 is **done**; about to commit. `issues.md` has no open slices (Issues 1–3 all done). Next:
1. **Ship** — `/preset ship` to push `docs/inquire-spec` + open a PR (not pushed; wrap-up commits only).
2. **F5 smoke test** — the one unrun Issue 3 criterion: install `wisp-0.0.5.vsix` (or F5), confirm it
   loads as "Wisp", four `Wisp: …` commands appear, settings under `wisp.*`; the previously stored key
   is **orphaned** by design → run **Wisp: Set API Key**, then confirm Completion **and** Inquire work.
3. New work → add an `issues.md` slice first.

## Skills for next session
- `/preset ship` — push + PR for the rebrand build.

## Open questions
- None blocking. Future (out of this issue): a second **Provider** — multi-provider architecture +
  provider-switching UI + logo redesign are deferred to later issues (see `decisions.md` rebrand ADR).

## Recent context
- The rename is **breaking**: setting namespace + SecretStorage key both moved, so any previously
  stored key is orphaned — re-enter once. Accepted for a 0.0.x pre-release; no silent-migration shim.
- Grep guard is satisfied *in spirit*: no live `opencodeAutocomplete` identifiers remain; the only
  matches are `issues.md` spec text + the rebrand ADR, which document the old name. All other `opencode`
  hits are provider-scoped (base URL, `OPENCODE_API_KEY`, `opencode.ai`, `opencode/` prefix).
- Carried-forward (pre-rebrand, still open): faster default model (try `deepseek-v4-flash`/`kimi-k2.6`);
  TDD for M1/M2 pure fns + the `buildInquiryPrompt` slicer.

## Related
- [[overview]]
- [[api]]
- [[decisions]]
- [[gotchas]]

---
type: pick-up
project: wisp
updated: 2026-06-15
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task finished (2026-06-15):** **Issue 3 — rebrand to Wisp** (`issues.md`, all criteria `[X]`
except the F5 manual check). Pure mechanical rename, **no behavior change**: product identifiers
`opencodeAutocomplete`/"OpenCode" → `wisp`/"Wisp" across `package.json` (v0.0.5), `src/extension.ts`,
`src/sidePanelProvider.ts` (`WispPanelProvider`), `webview/app.tsx`, `README.md`, all docs; `media/
opencode.svg` → `media/wisp.svg`; lockfile synced. **Provider plumbing left untouched** —
**OpenCode Zen** keeps its name (`DEFAULT_BASE_URL`, `OPENCODE_API_KEY`). `tsc`/`vite` clean; grep
guards green; packaged `wisp-0.0.5.vsix`. Grill also landed `CONTEXT.md` (**Provider** is now a
first-class term), `PRD.md` (M3 → `ProviderClient`), and the README Inquire sync. Rebrand ADR in
`decisions.md`.

**Next task:** no open slices left (Issues 1–3 all done). Pick one:
- **Ship** — `/preset ship` to push branch `docs/inquire-spec` + open a PR (this commit is **not pushed**).
- **F5 smoke test** — install `wisp-0.0.5.vsix` (or F5): loads as "Wisp", four `Wisp: …` commands,
  settings under `wisp.*`. The previously stored key is **orphaned** (expected) → **Wisp: Set API Key**,
  then confirm Completion **and** Inquire work. This is the one unticked Issue 3 criterion.
- Carried-forward: faster default model, or `/tdd` for M1/M2 (+ `buildInquiryPrompt` slicer).
- New work → add an `issues.md` slice first.

**Landmines (see [[gotchas]] + [[active-work]]):**
- **Wisp** = product; **OpenCode Zen** = the (current, first) **Provider** — don't re-merge them. Keep
  the provider plumbing (base URL, `OPENCODE_API_KEY`, "OpenCode Zen provider" wording) intact.
- The rebrand orphaned the stored key (SecretStorage key moved to `wisp.apiKey`) — re-enter once.
- Still live (pre-rebrand): bare model ids on `zen/go/v1` (the `opencode/` prefix 401s); reasoning
  models (keep `stripThink`, `maxTokens` default `0`); key never crosses to the webview; two tsconfigs.

Full rolling state in [[active-work]]; settled choices in [[decisions]]; domain language in `CONTEXT.md`.

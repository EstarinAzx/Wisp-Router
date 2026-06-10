---
type: pick-up
project: opencode-autocomplete
updated: 2026-06-10
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task finished (2026-06-10):** shipped **Issue 1 — side-panel activity indicator** (`issues.md`).
The panel now shows the live **Activity** (Thinking / Idle) as a top status row with a pulse dot, muted
(`opacity-50`) when disabled. New `activity{thinking}` ext→webview message: `enter/exitInFlight` push it
via `panel.postActivity`, and the `ready` handler pushes current activity via new `PanelHost.getActivity`;
the webview holds `thinking` separate from `state`. **Status bar untouched.** Files: `src/extension.ts`,
`src/sidePanelProvider.ts`, `webview/app.tsx`, `package.json` (0.0.2→0.0.3). Added glossary `CONTEXT.md`
(**Activity = Thinking | Idle**); synced `PRD.md`/`api`/`decisions`/`overview`. Verified `tsc -p ./` +
`tsc -p webview` + `vite build` clean, new CSS utilities present, repackaged
`opencode-autocomplete-0.0.3.vsix`; user eyeballed live and approved.

**Next task (pick one — nothing mid-flight):**
1. **Faster default model** — `minimax-m3` is a reasoning model, 4–7.6s/suggestion. Try
   `deepseek-v4-flash` / `kimi-k2.6` in the panel; if a non-reasoning id is reliably sub-second, change
   `DEFAULT_MODEL` (`src/extension.ts`) + the `model` default (`package.json`).
2. **TDD M1 + M2** — pure fns in `src/extension.ts` (`stripFences`/`stripPrefixOverlap`/`stripThink`/
   `looksLikeCode`/`reindent`/`relocateAfterComment`/`buildContext`) still untested + unexported. Spec in
   `PRD.md`. Test-export or extract first. Use `/tdd`.
3. **(optional) ship** — repo is **non-git**; `git init` first if you want `/preset ship` / a PR.

**Landmines (see [[gotchas]]):**
- Repo is **non-git** → no commit/branch/PR until `git init`. `wrap-up`'s commit step is a no-op here.
- After editing, the running build is stale until **rebuild + reload window** (recompile + repackage +
  `--force` install, or F5).
- Still live from prior work: model ids are **bare** on `zen/go/v1` (the `opencode/` prefix 401s); served
  models are **reasoning models** (keep `stripThink`, `maxTokens` default `0`); don't weaken the
  `relocateAfterComment` gates; key never crosses to the webview; two tsconfigs — keep `tsc -p webview`.

Full rolling state in [[active-work]]; settled choices in [[decisions]].

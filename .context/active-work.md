---
type: active-work
project: opencode-autocomplete
updated: 2026-06-10
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-06-10 by Opus 4.8 (background)_
_At commit: uncommitted (repo is non-git) — packaged `opencode-autocomplete-0.0.3.vsix`_

## Current focus
Shipped the **side-panel activity indicator** (Issue 1 in [[#issues]]): the panel now shows the
extension's live **Activity** (Thinking / Idle) as a top status row with a pulsing dot, muted when
disabled. The status bar (4-state ready/thinking/disabled/error) was deliberately left untouched —
the panel was the blind spot. Terminology fixed in `CONTEXT.md`: **Activity = Thinking | Idle**;
the status bar's "ready" is just Idle-dressed-for-the-editor.

## State
- **In flight:** nothing — Issue 1 landed and the user eyeballed 0.0.3 live and approved.
- **Done this session:**
  - `src/extension.ts` — `enter/exitInFlight` also call `panel?.postActivity(inFlight > 0)`;
    `getActivity: () => inFlight > 0` added to the injected `PanelHost`.
  - `src/sidePanelProvider.ts` — new sync `postActivity(thinking)` (separate from async `postState`);
    `ready` handler now pushes current activity via `host.getActivity()`; `PanelHost` + file-top doc updated.
  - `webview/app.tsx` — `activity{thinking}` added to `InMsg`; `thinking` held separate from `state`;
    top "Activity" status row (pulse dot + "Thinking…"/"Idle", `opacity-50` when `!enabled`).
  - `package.json` — `0.0.2` → `0.0.3`.
  - Docs: `PRD.md` (4 additive edits), `CONTEXT.md` (new glossary), `issues.md` (new tracker).
  - Verified: `tsc -p ./` + `tsc -p webview` + `vite build` all clean; new utilities
    (`animate-pulse`/`@keyframes pulse`, `--vscode-progressBar-background`, charts-green fallback,
    `opacity:.5`) present in `dist/webview/main.css`. Repackaged `opencode-autocomplete-0.0.3.vsix`.
- **Blocked:** nothing.

## Pick up here
No active feature work — the indicator is done. Open next-step options (carried forward + new):
1. **(optional) `/preset ship`** — but repo is non-git; would need `git init` first. Otherwise
   distribute the `.vsix` directly.
2. **Faster default model** — `minimax-m3` is a reasoning model (4–7.6s). Try `deepseek-v4-flash` /
   `kimi-k2.6` in the panel; if a non-reasoning id is reliably sub-second, change `DEFAULT_MODEL`
   (`src/extension.ts`) + the `model` default (`package.json`).
3. **TDD M1 + M2** — pure fns in `src/extension.ts` (`stripFences`/`stripPrefixOverlap`/`stripThink`/
   `looksLikeCode`/`reindent`/`relocateAfterComment`/`buildContext`) still untested + unexported.
   Spec in `PRD.md`. Test-export or extract first. Use `/tdd`.

## Skills for next session
- /tdd — option 3 (the pure-function tests) is a red-green-refactor loop.

## Open questions
- None.

## Recent context
- The feature was *already half-built*: the status bar had thinking/idle; the panel didn't. The work
  was bridging that signal to the webview, not inventing it.
- Chose a dedicated `activity{thinking}` message over folding `thinking` into `state` — `getState` is
  async and `state` triggers the model-refetch path; firing it per keystroke would be wrong. See [[decisions]].
- `activity` is pushed on every in-flight transition **and** on `ready`, so reopening the panel
  mid-request still shows "Thinking…".

## Related
- [[overview]]
- [[api]]
- [[decisions]]
- [[gotchas]]

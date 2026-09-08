---
type: active-work
project: wisp
updated: 2026-09-08
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-09-08 by GPT-6 Astra / Codex (auto)_
_At source commit: `e45cc9bd978b9549a792741fb41f1cfbd85034d7`_

## Current focus

Wisp terminal 2.1.5 and companion VSIX 1.13.8 source and local Windows candidates are complete. The four-ticket relay is finished. Publication and installation were not part of this run.

## State

- **Done:** #215 picker Aliases (PR #219), #216 exact Codex model routes (PR #220), #217 Traycer compatibility investigation (PR #221), and #218 local package acceptance (PR #222). All four issues are closed and all relay workers/reviewers archived.
- **Gate:** 1,147 core tests, 96 TUI tests / 335 assertions, both typechecks, extension build, archive checks and 48 source/compiled/npm native cases passed. Independent review repeated the 48-case matrix. Coordinator reverified the four artifact hashes and packaged smoke after merge.
- **Traycer:** compatibility remains **NOT VERIFIED**. Discovery uses Codex model/list, but a separately isolated catalog/transport connection across GUI discovery and execution was not demonstrated. See `docs/investigations/traycer-codex-compatibility.md`.
- **In flight:** none. Last published release remains the separately delivered 2.1.4/1.13.7; this run made no global installation or live runtime changes.

## Pick up here

No active implementation work — queue empty. Publication requires a new instruction. If requested, start with the reviewed candidate inventory and release constraints:

`C:/Users/S.D/.traycer/worktrees/estarinazx__wisp-router/ticket-215-codex-picker-aliases/out/release-2.1.5/`

Candidates: `wisp-v2.1.5-win32-x64.exe`, `wisp-router-2.1.5.tgz`, `tsd47216-wisp-router-win32-x64-2.1.5.tgz`, `wisp-1.13.8.vsix`. `inventory.json` owns exact byte counts, SHA256 hashes and archive entries. Preserve this directory and its runnable checks.

Acceptance/review: `C:/Users/S.D/.traycer/epics/b35873d7-fb18-441e-b64f-5a9613b76895/artifacts/codex-wisp-2-1-5-plan/tickets/04-package-acceptance/evidence/index.md` and sibling `review/index.md`.
Relay state: `.claude/relay/codex-wisp-2.1.5.traycer.json` (stopped/completed).

## Skills for next session

- `preset pick-up` — resume this handoff and inspect actual release/install state.
- `verification-before-completion` — verify exact artifacts and release surfaces before any authorized publication.

## Open questions

2.1.5 publication, cross-platform release workflow execution and installation remain separate actions. Traycer integration needs a supported connection contract or separately authorized investigation; do not advertise it as working.

## Recent context

- The user wants every discovered native Codex choice independently routable, not four fixed named families. Catalog metadata refreshes on relaunch; Target routing stays live. Existing snapshots still cover Alias/Claude rows only.
- Windows Bun 1.3.14 leaked inherited listener handles. The repository/builds use verified Bun 1.4.2; global Bun was left unchanged. Use the retained isolated runtime for native checks. Avoid rerunning old-runtime failure diagnostics: historical non-serving kernel listener entries may remain, with no owned live process to stop.
- Native matrices use a source-hosted Bridge; compiled Bridge smoke is separate. VSIX resolver bytes were executed, but installed VS Code, Traycer GUI, macOS/Linux native and live-provider acceptance are not claimed.
- Preserve user-owned `.context/flows.md` and `.context/Untitled.canvas`, prior worktrees and old release artifacts. Context updates are committed separately on main.
- Credentials, TLS, provider settings, permissions and managed Traycer files remain unchanged. Earlier bearer/TLS concerns stay separate in [[release-follow-ups]].

## Related

- [[overview]]
- [[pick-up]]
- [[happy-path]]
- [[decisions]]
- [[release-follow-ups]]

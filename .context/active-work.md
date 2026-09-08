---
type: active-work
project: wisp
updated: 2026-09-08
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-09-08 by GPT-6 Astra / Codex (auto)_
_At source commit: `e23f103` (#211 merged; 2.1.3 remains installed)_

## Current focus

Codex Wisp terminal 2.1.4 source and local Windows artifacts are complete. The assigned feature queue is empty: #209, #210 and #211 are closed. Publication remains pending.

## State

- **Done:** #209 via PR #212 (`da6bc5a`), #210 via PR #213 (`169a8c7`), #211 via [PR #214](https://github.com/EstarinAzx/Wisp-Router/pull/214) (`e23f1033602d00e4ea688c4aade8b4f233cea093`). #211 implementation: `cdebd96f6d7ae86aa26874486ccb6ba1e894b2b0`.
- **Gate:** 1,139 core tests, 86 terminal tests, both typechecks, extension compilation, compiled/npm smoke and 21 native cases passed. Independent reviewer `8425ae9b-8678-4cc8-bd33-32b638775ca7` returned PASS after a local staging UTF-8 correction.
- **In flight:** none. Coordinator verification passed, parent #208 is closed, and the relay is stopped as completed. All workers and reviewers are archived.
- **Pending decision:** release tag, GitHub/npm publication, global installation and extension version/publication. None was performed.

## Pick up here

No further implementation ticket in this run. [#208](https://github.com/EstarinAzx/Wisp-Router/issues/208) and all three child tickets are closed. The stopped relay state is `.claude/relay/codex-wisp-2.1.4.traycer.json`; do not restart completed units. Next work requires a separate release instruction or a new task.

Read `docs/codex-wisp.md` for supported behavior and release surfaces. Preparation evidence and exact SHA-256 inventory:
`C:/Users/S.D/.traycer/epics/b35873d7-fb18-441e-b64f-5a9613b76895/artifacts/codex-wisp-2-1-4/ticket-211/index.md`.
Independent review is sibling `review-211/index.md`.

Retained worktree: `C:/Users/S.D/.traycer/worktrees/estarinazx__wisp-router/ticket-codex-wisp-2-1-4`, clean on `ticket/211-codex-wisp-packaging`. Artifacts live under its `out/release-2.1.4/`: standalone Windows executable, thin npm archive and Windows platform archive. Preserve this directory for separate release review.

## Skills for next session

- `preset pick-up` — rehydrate this handoff and verify live state.
- `verification-before-completion` — verify artifacts and the authorized release scope before any future publication.

## Open questions

Release publication and installation need a separate instruction. A rebuilt extension includes new shared core; its unchanged 1.13.6 manifest would yield different code under the same version. Decide its release version before publishing an extension.

## Recent context

- Native `codex-cli 0.153.4` passed all seven cases through source, compiled and npm launchers on Windows x64. Compiled/npm PATH excludes Bun and source. Native checks use a source-hosted Bridge and deterministic local keyed upstreams; compiled Bridge HTTP smoke runs separately.
- No real-provider acceptance or macOS/Linux execution is claimed. The four-platform release matrix is configured but unrun. The HTTP suite also covers local Codex/Anthropic wires.
- Installed terminal 2.1.3, installed extension 1.13.6 and slot plugin remain untouched. No runtime restart, credential repair or TLS weakening occurred.
- Keep user-owned `.context/flows.md` and `.context/Untitled.canvas` out of commits. Context commits belong on main; only explicit paths were staged.
- Saved bearer 401 and TLS-chain concerns remain separate. See [[release-follow-ups]] for held work.

## Related

- [[overview]]
- [[pick-up]]
- [[happy-path]]
- [[decisions]]
- [[release-follow-ups]]
- [[2026-09-08-codex-wisp-native-contract-before-implementation]]

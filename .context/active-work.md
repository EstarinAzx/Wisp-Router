---
type: active-work
project: wisp
updated: 2026-09-08
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-09-08 by GPT-6 Astra / Codex (auto)_
_At source commit: `da6bc5a` (#209 merged; 2.1.3 remains installed)_

## Current focus

Build **codex-wisp for terminal 2.1.4** through the user's autonomous `vibe init`. Planning passed independent scrutiny. [Spec #208](https://github.com/EstarinAzx/Wisp-Router/issues/208) is authoritative; implementation has three sequential slices.

## State

- **In flight:** self-paced Traycer relay, one ticket per fresh worker. Control state: `D:/.claude/claude projects/autocomplete_extension/.claude/relay/codex-wisp-2.1.4.traycer.json`. The coordinator owns dispatch; check its live phase before spawning.
- **Done:** [#209](https://github.com/EstarinAzx/Wisp-Router/issues/209) closed via [PR #212](https://github.com/EstarinAzx/Wisp-Router/pull/212), squash `da6bc5a`. Native source launcher and Responses door are implemented. Worktree: `C:/Users/S.D/.traycer/worktrees/estarinazx__wisp-router/ticket-codex-wisp-2-1-4`; create the next ticket branch from updated `origin/main` after coordinator dispatch.
- **Baseline:** 1,093 core tests, 85 terminal tests, both typechecks, extension build and six native CLI cases pass. Independent reviewer `d263e4ae-c72b-4df2-922c-42bc7896b2d5` returned clean after verified fixes.
- **Blocked:** no implementation blocker. Publication and installation remain separate decisions.

## Pick up here

Read the relay state and recorded worker first. The frontier is [#210: content/failure fidelity](https://github.com/EstarinAzx/Wisp-Router/issues/210), then [#211: package and verify](https://github.com/EstarinAzx/Wisp-Router/issues/211). Parent #208 is a spec, not another implementation ticket. Read `docs/codex-wisp.md`, the full ticket and parent contract. Images/non-text parts currently fail explicitly; #210 extends them without silent loss.

Run artifact: `C:/Users/S.D/.traycer/epics/b35873d7-fb18-441e-b64f-5a9613b76895/artifacts/codex-wisp-2-1-4/index.md`. Native evidence in main: `out/codex-wisp-2.1.4-probe/REPORT.md`, `contracts.json`; recheck with `python out/codex-wisp-2.1.4-probe/verify.py`.

Implementation evidence: run artifact children `ticket-209` and `review-209`; worktree `out/codex-native-2026-09-08T00-39-02-744Z/REPORT.md`. Reproduce using `bun packages/tui/tests/nativeCodex.check.ts`. Windows/Bun with a local deterministic keyed upstream only; no live Provider claim.

## Skills for next session

- `relay` — Traycer procedure and recorded state; historical Claude relay files are unrelated.
- `traycer-implement`, `superpowers:test-driven-development` — scoped implementation and runnable checks.
- `traycer-review` — independent review before merging.
- `preset wrap-up` — ticket-loop's gateless handoff; context commits on main.

## Open questions

No answer is required to build. Release/tag/npm/global installation remain pending. No confirmed quality bar exists, so no gauntlet is chained.

## Recent context

- Native `codex-cli 0.153.4` changes its tool envelope with model metadata. Preserve native model selection. Definitions arrive through top-level tools, `additional_tools`, and previous `tool_search_output`.
- Probe evidence is mock-only: successful text/function/custom execution and discovery; read-only policy rejected shell/patch writes. `response.completed` alone can exit zero while losing final text.
- Scope rejects opaque reasoning/compaction replay, hosted search, explicit profiles and provider overrides. It preserves visible history and requires honest failure/incomplete/cancellation behavior from slice one. Exact mechanisms are in the spec.
- Antigravity refuses positioned developer notes it cannot preserve. Native proxy checks saw zero Bridge/hostile requests; native background CONNECTs were blocked. Generic upstreams receive custom-tool grammar as metadata without enforcement.
- Keep user-owned `.context/flows.md` and `.context/Untitled.canvas` out of commits. Preserve saved routes/credentials/model/provider settings, permissions, sandbox, hook trust, notifications and browser settings.
- Wisp 2.1.3 remains installed; VS Code remains 1.13.6. The saved Wisp Codex bearer 401 and TLS-chain issue remain held concerns; do not copy/rotate tokens or relax TLS.

## Related

- [[overview]]
- [[pick-up]]
- [[happy-path]]
- [[decisions]]
- [[release-follow-ups]]
- [[2026-09-08-codex-wisp-native-contract-before-implementation]]

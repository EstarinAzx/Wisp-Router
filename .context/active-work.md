---
type: active-work
project: wisp
updated: 2026-09-08
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-09-08 by GPT-6 Astra / Codex (auto)_
_At source commit: `169a8c7` (#210 merged; 2.1.3 remains installed)_

## Current focus

Build **codex-wisp for terminal 2.1.4** through the user's autonomous `vibe init`. [Spec #208](https://github.com/EstarinAzx/Wisp-Router/issues/208) is authoritative. Native source and content/Provider fidelity are complete; packaging is next.

## State

- **In flight:** self-paced Traycer relay, one ticket per fresh worker. Coordinator owns `D:/.claude/claude projects/autocomplete_extension/.claude/relay/codex-wisp-2.1.4.traycer.json`; check live assignment before starting.
- **Done:** #209 via PR #212 (`da6bc5a`); #210 via [PR #213](https://github.com/EstarinAzx/Wisp-Router/pull/213), squash `169a8c7`. Worktree: `C:/Users/S.D/.traycer/worktrees/estarinazx__wisp-router/ticket-codex-wisp-2-1-4`, clean on `ticket/210-codex-wisp-fidelity` at implementation `e844649`. Create the next branch from updated `origin/main`.
- **Gate:** 1,139 core tests, 85 terminal tests, both typechecks, extension build and seven native cases pass. Reviewer `70d14d64-cd04-42be-9d7c-7b6770fbbd2b` returned clean after four reproduced fidelity fixes.
- **Blocked:** no implementation blocker. Publication/global installation remain separate decisions.

## Pick up here

Read live relay state, then [#211: package and verify](https://github.com/EstarinAzx/Wisp-Router/issues/211), `docs/codex-wisp.md` and parent #208. Do only #211 after coordinator dispatch; parent #208 is not an implementation ticket. Packaging/version changes have not started.

Run artifact: `C:/Users/S.D/.traycer/epics/b35873d7-fb18-441e-b64f-5a9613b76895/artifacts/codex-wisp-2-1-4/index.md`; children `ticket-210` and `review-210` hold evidence.

Final native report: worktree `out/codex-native-2026-09-08T01-38-16-582Z/REPORT.md`. Reproduce with `bun packages/tui/tests/nativeCodex.check.ts`. Actual `codex-cli 0.153.4`, Windows x64, source launcher/Bridge, isolated synthetic homes and local keyed upstreams. HTTP tests also cover local Anthropic/Codex wires. No live Provider or POSIX claim.

## Skills for next session

- `relay` — recorded Traycer assignment; historical Claude relay files are unrelated.
- `traycer-implement`, `superpowers:test-driven-development` — scoped implementation.
- `traycer-review` — independent review before merging.
- `preset wrap-up` — ticket-loop's gateless handoff; context commits on main.

## Open questions

No answer required for #211. Publication/installation remain pending. No confirmed quality bar exists, so no gauntlet is chained.

## Recent context

- Unknown-model fallback requires `reasoning.summary: "auto"`; non-auto modes and explicit service tiers are refused. Preserve native model metadata and tool declaration locations.
- Supported image content and wire/detail limits are documented in `docs/codex-wisp.md`. Native vision checks assert images on both first request and resumed follow-up.
- Review fixed partial-delta/terminal text loss, provisional Anthropic usage, malformed Antigravity usage and silent control drops.
- Keep user-owned `.context/flows.md` and `.context/Untitled.canvas` out of commits. Preserve credentials, routes, models, permissions, sandbox, hook trust, notifications and browser settings.
- Wisp 2.1.3 remains installed; VS Code remains 1.13.6. Saved bearer 401 and TLS-chain concerns remain separate. No credential repair, runtime restart, publication or global installation occurred.

## Related

- [[overview]]
- [[pick-up]]
- [[happy-path]]
- [[decisions]]
- [[release-follow-ups]]
- [[2026-09-08-codex-wisp-native-contract-before-implementation]]

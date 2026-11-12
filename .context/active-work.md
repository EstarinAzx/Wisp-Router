---
type: active-work
project: wisp
updated: 2026-11-12
tags: [context, active-work, session-logs, vscode]
---

# Active Work

_Last updated: 2026-11-12 by Codex (GPT-6 Astra)._
_Usage fix committed locally as9bc71ab; release metadata for2.2.12/1.14.9 is in progress. Published v2.2.11 remains unchanged at e831d803f6d1baf829e84a527dec75ccaabe88a4._

## Current focus

khitarashi authorized **Wisp2.2.12 / companion1.14.9** publication. [PR234](https://github.com/EstarinAzx/Wisp-Router/pull/234) is the existing integration PR; do not create another. Its initial platform checks and reviews completed. A review-found Anthropic malformed-usage edge case is corrected with six additional regressions. Follow the existing PR and local release receipt through final checks, merge and publication. Installed clients remain unchanged.

## Work contract

- **Authority:** khitarashi,2026-11-12 in root515709ef: usage fix/regressions/dev-host verification, then explicit "ok release it now", superseding the earlier publication hold. Prior primary-checkout/no-worktree and auth/settings preservation remain. No client installation/restart.
- **Requirements/plan:** local `.claude/wisp-2.2.12/work.md` owns release progress; `.claude/context-usage-diagnosis/work.md` retains completed implementation/host evidence.
- **Execution:** root515709ef, inline in primary checkout. Prior2.2.11 relay stays stopped/completed; this is separate unreleased work.
- **Review:** [[review-policy]] on. Initial native-vscode-usage1/3 and release-prep1/3 reviews completed with0 findings. PR234 then identified malformed Anthropic usage and stale handoff text; both are addressed in the follow-up. Current coverage/budgets and dispositions are authoritative in local `.claude/wisp-2.2.12/work.md` and follow-up review evidence; do not restart completed review scopes or reset counters.
- **Integration:** use existing release-prep/wisp-2.2.12 and PR234 in this primary checkout. Merge only the verified final head, return main, then tag/publish. Versioned baton; local evidence ignored. No worktrees.
- **Evidence:** local `.claude/context-usage-diagnosis/`: red.log, green.log, core.log, checks.json, host-receipt.json, review-1/manifest.json/events.ndjson/dispositions.json and final-receipt.json. Published release evidence remains `.claude/wisp-2.2.11/publication-receipt.json`.
- **Pending:** release completion on existing PR234. Read local `.claude/wisp-2.2.12/work.md` and release-receipt.json for exact head, active process and review/CI status before acting. Interactive development host remains open.
- **Checkpoint:** initial2135 core/191 TUI tests, types/build/packages and host checks passed. Follow-up malformed updates had RED6 then GREEN39/39 provider tests; fresh full/package/host evidence is retained separately under `.claude/wisp-2.2.12/followup-checks/`. User confirmed live GPT5%; no live Anthropic/Grok UI claim.

## Verified state

- **Current local fix:** native adapter emits Copilot `usage` data parts for Codex/Anthropic/Grok; prompt usage includes uncached input plus cache creation/read once, with cached-read detail. Missing usage stays absent; invalid numeric counts are not emitted. Anthropic opening input/cache and final output-only updates merge correctly. Tool-only replies and actual zero counts are covered. Below is historical2.2.11 release evidence, not a claim that the current fix is published.

- Shared bounded per-session logs across CLI/TUI/VS Code, lifecycle-only serve stdout, safe request attribution and interleaved multi-process regressions. `docs/session-logs.md` owns behavior/limits.
- Both actual Copilot SDK/Agent Host failures reproduced and corrected: authenticated encrypted reasoning preserves state when response-ID markers disappear; exact-model Claude OTHER is accepted only for well-formed native tool calls. Replay/tool-ID/account/conversation guards remain enforced.
- Actual VS Code1.146.0 / Copilot0.74.0 SDK UI/live transport: Carbon high and Claude Opus5.5 high each read a controlled file, returned PEAR, then answered OK on the next user turn. Sanitized evidence: `copilot-host-events.jsonl`; clean API synthetic receipt: `synthetic-host-receipt.json`.
- Bun1.4.2: **2120 core +191 TUI tests**, **1027 TUI assertions**, types/build pass. **34 actual TUI captures** differ only by version. VSIX1.14.8 contains the tested extension bundle, byte-identical to Unit2's clean build. Windows binary2.2.11 passes isolated launcher/Responses and signed Desktop smokes plus3 compiled activity-status cases.
- PR review caught a stale CLI detail heading after a crashed request; two-file correction reuses session-list freshness. RED2 stale failures -> GREEN11/11, full suites/package checks pass; scoped CodeRabbit attempt4 covers2/2, zero issues. Stale baton was refreshed. The non-blocking Gemini test-clarity nitpick remains: a separate matching-model end-to-end test already covers non-Claude OTHER rejection. Dispositions: `release-pr-review-dispositions.json`.
- Final CI [43111319990](https://github.com/EstarinAzx/Wisp-Router/actions/runs/43111319990) passed all four native builds and both package smokes on5fdcc7f; publication skipped. Automatic PR re-review succeeded with no new inline findings. Package checks use fixtures, not additional live-provider qualification.
- Publication workflow43115208900 rebuilt all four platforms and published five GitHub assets plus npm. Downloaded Windows/VSIX SHA-256 values match GitHub; all three VSIX bundles match the accepted build. Registry integrity matches downloaded npm shell/Windows archives; their binary equals GitHub, and both package checks pass through compiled and npm commands. npm latest2.2.11 and shell/Windows/macOS packages are visible. Linux optional package returned404 at final verification; the existing GitHub-download fallback covers it. Exact hashes/metadata: publication receipt and `published-npm-verified.json`.

## Limits and preservation

Classic Local isolated UI required GitHub sign-in and stopped before transport; synthetic continuation checks through the actual host API passed with provider network disabled. Direct Claude forced ANY tool choice returned HTTP400; automatic tools passed. All variants, live compaction, full-window generation and every model/tool combination remain unqualified. Existing broken chats need a new chat.

All disposable test hosts stopped and temporary Wisp credential copies removed. SYSTEM-only Git askpass remnants remain at exact paths in `copilot-cleanup.json`; leave ACLs and unrelated cleanup alone. The installed host's pre-existing integrity warning was not repaired. Real auth/settings, permissions, hook trust, running clients,233 excluded historical files and the old worktree are preserved. Desktop protocol5 and wisp-slot1.7.5 are unchanged.

## Pick up here

Continue existing PR234 from the local release ledger; reconcile its final source hashes, follow-up reviews and exact-head CI before merging/tagging. Initial metadata review and PR creation are already done. Verify published GitHub/npm artifacts and finish context. Do not move older tags, create a duplicate PR or restart the completed2.2.11 relay. No installed-client replacement/restart.

## Related

- [[pick-up]]
- [[overview]]
- [[review-policy]]
- [[release-follow-ups]]

---
type: active-work
project: wisp
updated: 2026-11-12
tags: [context, active-work, session-logs, vscode]
---

# Active Work

_Last updated: 2026-11-12 by Codex (GPT-6 Astra)._
_Current fix: uncommitted changes on main, baseline31b0ab8d9d55eb4c2407c3eb60ffad2a8a52fdb1. Published v2.2.11 remains unchanged at e831d803f6d1baf829e84a527dec75ccaabe88a4._

## Current focus

Native VS Code usage reporting for **Codex, Anthropic and Grok is fixed locally and verified**, following khitarashi's2026-11-12 request. The rebuilt development host reports usage; the user's GPT-6 Astra screenshot shows5% instead of0%. Changes remain uncommitted/unreleased; no version bump, tag, publication or installed-client replacement. Published Wisp2.2.11 / companion1.14.8 remains the prior release.

## Work contract

- **Authority:** khitarashi,2026-11-12 in root515709ef: "Fix native VS Code usage reporting for Codex, Anthropic and Grok, add regression coverage, and verify it in the dev host. Don't publish another release yet." Prior primary-checkout/no-worktree and auth/settings preservation remain.
- **Requirements/plan:** local `.claude/context-usage-diagnosis/work.md`; forward real native usage, preserve cached prompt accounting, merge Anthropic partial snapshots, verify regressions and host behavior.
- **Execution:** root515709ef, inline in primary checkout. Prior2.2.11 relay stays stopped/completed; this is separate unreleased work.
- **Review:** [[review-policy]] on. New checkpoint native-vscode-usage **passed1/3**, all5 files covered,0 findings, current hashes match; ledger/dispositions in local `.claude/context-usage-diagnosis/work.md` and `review-1/`. Native ExitCode capture was null; completed NDJSON and shell0 retained honestly. Prior release ledger remains closed: logging4/5, Copilot1/3, release-prep1/3 under `.claude/relay/wisp-2.2.11.body.md`.
- **Integration:** five product/test files remain local on main; `usage-host.cjs` is staged, other edits unstaged. Versioned baton updated; local evidence ignored. No commit/push/publication performed for this fix.
- **Evidence:** local `.claude/context-usage-diagnosis/`: red.log, green.log, core.log, checks.json, host-receipt.json, review-1/manifest.json/events.ndjson/dispositions.json and final-receipt.json. Published release evidence remains `.claude/wisp-2.2.11/publication-receipt.json`.
- **Pending:** none. Core/build, synthetic host and CodeRabbit shells finished. Interactive development host intentionally remains open.
- **Checkpoint:** fix complete locally:33 provider tests,2135 full core tests, types/build, six real-extension-host API requests across three providers, user visual GPT5% confirmation and CodeRabbit5/5. Live Anthropic/Grok UI meters were not separately tested.

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

No implementation work remains for the native usage fix; preserve the reviewed local diff and await the user's next request. Do not publish, move the2.2.11 tag, restart the old relay or repeat unchanged reviews. Review the final receipt/current source hashes before integrating. The user confirmed the GPT development-host meter at5%; no live Anthropic/Grok meter claim. Prior Carbon smoke and published-release limits remain historical evidence.

## Related

- [[pick-up]]
- [[overview]]
- [[review-policy]]
- [[release-follow-ups]]

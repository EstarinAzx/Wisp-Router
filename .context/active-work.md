---
type: active-work
project: wisp
updated: 2026-11-12
tags: [context, active-work, vscode, release]
---

# Active Work

_Last updated: 2026-11-12 by Codex (GPT-6 Astra)._
_Published v2.2.12: e251eb3ed9211ffb8dc72008204758c815b2612d. Tested PR head: 26afa39c7eb709efc38fa273f1810fb05913b43a; identical Git tree._

## Current focus

**Wisp 2.2.12 / companion 1.14.9 is published and verified.** [PR234](https://github.com/EstarinAzx/Wisp-Router/pull/234) is merged; [GitHub release](https://github.com/EstarinAzx/Wisp-Router/releases/tag/v2.2.12) has four native binaries and the VSIX. npm latest is 2.2.12. No active implementation or release work remains. Installed clients were not replaced or restarted; the development host remains open for the user.

## Work contract

- **Authority:** khitarashi, 2026-11-12 in root515709ef: fix native Codex/Anthropic/Grok usage reporting, add regression coverage and verify the dev host; then explicitly "ok release it now". Primary checkout only/no worktrees; preserve real auth/settings/permissions. Publication is complete, not standing approval for another release or client installation.
- **Execution:** root515709ef, inline in primary checkout. The earlier 2.2.11 ownership relay remains stopped/completed; do not restart it.
- **Review:** [[review-policy]] on. Native-vscode-usage and wisp-2.2.12-release-prep both passed **2/3**. Initial scopes5/5 and16/16 plus one joint follow-up5/5; zero remaining findings, all21 changed PR paths covered. Follow-up and release reviews have native exit0. The initial native review retained a null exit capture alongside an explicit completed NDJSON outcome. No paid credits or pending review. Authoritative ledger: local `.claude/wisp-2.2.12/work.md`.
- **Integration:** release merged and tagged. Final context updates are status-only. Source/tag identities and final synchronized main are in local `.claude/wisp-2.2.12/release-receipt.json`.
- **Evidence:** local `.claude/wisp-2.2.12/`: `followup-checks/`, `review-1/`, `review-2/`, `pr-final-evidence.json`, `published/verification.json`, `published/npm-fallback-receipt.json`, and release-receipt.json. Original implementation evidence remains `.claude/context-usage-diagnosis/`; immutable earlier receipts are historical, not current queues.
- **Pending:** none. Review, verification and publication/registry watchers finished. No worker or disposable test host is active.
- **Checkpoint:** complete. Tests, reviews, exact-tree integration, tag publication, downloaded package checks and registry verification are settled.

## Verified state

- Native Codex, Anthropic and Grok send Copilot usage data parts. Prompt totals include uncached input and both cache tiers once; cached-read detail remains separate. Missing usage stays absent and true zero usage is preserved.
- Anthropic opening input/cache counts merge with final output-only updates. The PR review exposed malformed updates overwriting valid counts; RED6 then GREEN39 provider tests confirm the correction. Non-strict updates accept only nonnegative safe integers; strict validation is preserved.
- **2,141 core tests**, **191 TUI tests / 1,027 assertions**, core/TUI typechecks, extension/webview build and all34 version-only TUI captures passed. VSIX and Windows launcher/Responses and signed Desktop checks passed.
- Real VS Code1.146.0 development-host API: six synthetic requests across three providers returned correct100->200 prompt counts, output10 and cache details. No real credentials/provider network used. User screenshot separately confirms live GPT-6 Astra xhigh at5% rather than0%; live Anthropic/Grok UI meters were not separately exercised.
- Final PR CI [43123986194](https://github.com/EstarinAzx/Wisp-Router/actions/runs/43123986194) passed four builds/eight smokes. Automatic CodeRabbit re-review succeeded and marked both findings addressed; no new inline findings.
- Publication [43124930414](https://github.com/EstarinAzx/Wisp-Router/actions/runs/43124930414) passed all five jobs. Downloaded Windows/VSIX hashes match GitHub; all three VSIX bundles match the corrected accepted build. npm shell/Windows tarballs pass registry integrity; Windows npm binary matches GitHub, platform pins are2.2.12, and compiled/npm package checks pass.
- npm latest/shell/Windows/macOS packages were visible at final verification. Linux optional package returned404; the existing GitHub-download fallback covers it. The published npm shell actually downloaded the correct Windows release binary into an isolated home, matched its digest and passed version/both-launcher checks.

## Limits and preservation

All variants, live compaction and full-window generation remain unqualified. Prior classic Local UI sign-in and direct Claude forced ANY limitations remain; automatic tools were qualified for the earlier Copilot repairs. Existing broken Antigravity chats need new chats. This accounting fix does not expand provider or context-capacity support.

Real auth/settings, permissions, hook trust, excluded historical files and the old worktree remain preserved. Disposable test hosts exited and synthetic homes were removed; protected Git askpass profile remnants are recorded in local receipts, with no ACL changes or unrelated cleanup. Desktop protocol5 and wisp-slot1.7.5 are unchanged. Prior 2.2.11 review budgets stay closed: logging4/5, Copilot1/3, release-prep1/3; its publication receipt remains `.claude/wisp-2.2.11/publication-receipt.json`.

## Pick up here

No active work. Preserve published tags and completed review budgets. Await a new user request before another release, client installation or restart. Read this baton and the final release receipt before acting; old plans and historical worktrees are not queues.

## Related

- [[pick-up]]
- [[overview]]
- [[review-policy]]
- [[release-follow-ups]]

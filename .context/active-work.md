---
type: active-work
project: wisp
updated: 2026-11-13
tags: [context, active-work, release]
---

# Active Work

_Last updated: 2026-11-13 by Codex, agent 73a06749-2fc6-4187-b7aa-601691ee578a._
_Release source: 3c76ad7283846e8d9372b79b8748c6d4c0be606d on main; tree identical to reviewed/tested branch head 030688a9d11fad48e4ce35757ef90332b10a22d4._

## Current focus

**Wisp 2.2.14 and companion 1.14.11 are published, verified and installed.** The Antigravity cooldown fix is complete. Existing Bridge/client processes were not restarted; a restart/reload loads the installed code. No implementation or watcher remains active.

## Work contract

- **Authority:** khitarashi requested model-specific Antigravity cooldowns while preserving provider settings, then explicitly authorized: "Merge, release, and install the verified Antigravity cooldown fix, preserving my provider settings. then guve me a summary what the flaw was and what you fixed" (2026-11-13).
- **Execution/integration:** primary agent implemented on fix/antigravity-model-cooldown, merged [PR237](https://github.com/EstarinAzx/Wisp-Router/pull/237), and published [v2.2.14](https://github.com/EstarinAzx/Wisp-Router/releases/tag/v2.2.14). Worktree remains at C:/Users/S.D/.traycer/worktrees/estarinazx__wisp-router/fix-antigravity-model-cooldown for local evidence; main is authoritative. Context is versioned; the unrelated flow-note edit is excluded.
- **Review:** [[review-policy]], checkpoint antigravity-model-cooldown passed **2/3** CLI launches: all3 implementation/test files and all12 release files covered, zero findings. Hosted PR review also passed. One authoritative ledger: .claude/antigravity-model-cooldown/work.md in that worktree; manifests and results are beside it. No pending review, no paid-credit escalation. Earlier codex-wisp-context-limits checkpoint remains closed at5/6; it was not reopened.
- **Evidence:** main checkout .claude/wisp-2.2.14/receipt.json; published/verification.json; installation.json. PR workflow43241884133 and publication workflow43243848641 succeeded. Release merge tree equals the reviewed head; GitHub tag points to that merge.
- **Checks:** core2166 tests, TUI215 tests/1163 assertions, core and terminal typechecks, companion build/VSIX, compiled Windows launcher/Responses/Desktop smokes. All34 TUI screen captures changed only the version label. Eight regression cases cover all3 Bridge doors, switching both directions, family edits, alias pinning, cooldown expiry and in-flight selection changes. No live inference.
- **Delivery:** global npm wisp-router2.2.14 and installed VS Code esarinazx.wisp1.14.11 verified. Installed Windows binary matches the GitHub release digest. All5 GitHub assets verified; main, Windows, AppleSilicon and Linux npm archives passed integrity/content checks. IntelMac optional npm2.2.14 remained unavailable after8 probes; its verified GitHub binary remains the installer's fallback. No npm republish attempted. Slot remains1.7.6 and was not changed/installed.
- **Preservation:** provider config SHA25672d0f6dc1d55ea907b167f9ed56c3f786dba4b702e235d33a322c845e70013f2 unchanged across installation. Existing .context/flows.md edit preserved, hash abb6e8469eb6d665c3e2657daa450218425239e9019cf92c7fd733084f60414d. Existing clients/Bridge not stopped.
- **Pending:** none. Installation is complete; runtime activation needs the user's next Bridge restart / VS Code reload.

## Behavior and limits

Antigravity quota and repeated-transient cooldowns now use the resolved provider/model pair. A Carbon limit no longer cools unrelated Claude targets. Failures stay attributed to the dispatched model when selection changes in flight. Other providers, explicit alias pinning, same-model fallback and expiry keep existing behavior. Exact model IDs are used; shared upstream quota groups are not guessed, so another model sharing a real exhausted bucket can reject once before its own cooldown is learned. Genuine quota limits and signed Claude launch-profile restrictions still apply. The original fallback Anthropic502 error text was not retained; its exact upstream rejection is unknown.

## Previous completed work

- Release2.2.13 and its source/context acceptance limits remain recorded in .claude/wisp-2.2.13/release-receipt.json and docs/releases/v2.2.13.md. This patch does not newly qualify full-window inference, automatic compaction, the Anthropic stamp's live acceptance, Local sign-in, forced Claude ANY or Desktop UI.
- Earlier held work remains in [[release-follow-ups]]. The old relay remains stopped/completed.

## Pick up here

No active work. Do not repeat publication or installation. If asked to check activation, distinguish the installed binary from an already-running Bridge. Preserve provider settings, the flow edit and closed review budgets. Read the release receipt for exact package and process boundaries.

## Related

- [[pick-up]]
- [[overview]]
- [[review-policy]]
- [[release-follow-ups]]

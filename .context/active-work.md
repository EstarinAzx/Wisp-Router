---
type: active-work
project: wisp
updated: 2026-11-12
tags: [context, active-work, vscode, release]
---

# Active Work

_Last updated: 2026-11-12 by Codex (GPT-6 Astra)._
_Runtime release: `c514368c96637b6503817459a444b176c2f89678` / `v2.2.10`._

## Current focus

**Release complete:** Wisp **2.2.10**, VS Code companion **1.14.7**, Slot unchanged **1.7.5**. [PR #232](https://github.com/EstarinAzx/Wisp-Router/pull/232) merged with a merge commit; [release workflow 43021318794](https://github.com/EstarinAzx/Wisp-Router/actions/runs/43021318794) passed all four native builds and publication. The [GitHub release](https://github.com/EstarinAzx/Wisp-Router/releases/tag/v2.2.10) contains the VSIX and four binaries, and all five npm packages are visible at 2.2.10. No installation or client handover was performed.

**Workspace guard:** use the primary checkout on local `main`. If elsewhere, locate `refs/heads/main` with `git worktree list --porcelain`, then read that checkout's `.context/pick-up.md`. This is the only current baton. Preserved `wisp/` notes and the retained old worktree are historical, not separate queues.

## Work contract and completed checkpoint

- **Authority:** khitarashi, 2026-11-12: eyeball passed; release now and address uncommitted files. Scoped commit/PR/merge/tag/publication and non-destructive Source Control cleanup are complete. Installation remains a separate request.
- **Scope:** `docs/releases/v2.2.10.md` describes native Antigravity accounts/discovery, shared text/chat state, dynamic limits, Codex maximum context and MCP schema preservation. Existing Bridge qualification and Desktop protocol 5 are unchanged.
- **Owner:** root chat `8f60fde8-74fa-49f0-98e5-788163a75924`, primary checkout, owns VS Code fix coordination. The predecessor handoff is complete; no relay or review worker is pending.
- **Integration:** release source `07c837229364af5cec7673eaced00640d02d1dd5` passed PR build43019841620, then merged as `c514368c96637b6503817459a444b176c2f89678`. The tag points to that merge and its tree is identical to the verified candidate. Later release-verification/context commits change documentation only. Do not reset primary main or revive the old worktree's baton.
- **Review policy:** independent scoped reviews plus regression-tested correction passes. No persistent CodeRabbit opt-in; the earlier audit checkpoint remains closed at 1/3 with 47-file coverage. Final GPT-budget and MCP-schema reviewers returned no actionable findings and are archived.
- **Native acceptance:** the user passed basic Argon, Carbon and Codex chat and confirmed account-backed 1M/872K displays. Agent generation tests used intercepted I/O. Full-window requests, actual Pylance dynamic-key invocation, every model/tool combination and interactive compaction are not newly qualified.
- **Source checks:** core2081/TUI201 (896 assertions), core/TUI typechecks and extension/webview compilation passed. A release-prep run timed out in `authLifecycle.test.ts` Antigravity callback cleanup because OAuth test files share fixed ports; isolated62 and full2081 passed after core file execution was serialized. Production auth code was unchanged.
- **Package checks:** local Windows launcher/Responses and signed-Desktop smokes passed. Downloaded VSIX and Windows executable match GitHub digests; the VSIX bundle equals the tested build. The published Windows smoke and npm tarball integrity passed. The published npm wrapper downloaded and ran the exact GitHub binary in an isolated home.
- **Registry:** some lookups initially returned404 while publication became visible. Final registry checks confirmed the dispatcher and all four platform packages at2.2.10. The Windows fallback was independently exercised; no npm version was republished or replaced.
- **Evidence:** `.claude/vscode-parity/release-2.2.10.json` records final revisions and verification; `.claude/vscode-parity/release-2.2.10/` contains logs, public manifests and downloaded artifacts. `dynamic-models-review.md`, `codex-context-plan.md` and `codex-tool-schema-plan.md` preserve code-review and RED/GREEN evidence.
- **Cleanup:** all233 pre-existing untracked files are preserved and hash-unchanged. Local `.git/info/exclude` hides `/wisp/` and `/docs/Screenshot 2026-10-13 114007.png`; neither was deleted or published. Canonical `.context/` remains tracked. The original preservation manifest is under `.claude/vscode-parity/main-before-handoff/`.
- **Preservation:** real settings/auth/provider selection, permissions, hook trust and running clients were preserved. Git's first tag push stalled; a task-local retry used the existing gh credentials without changing persistent authentication configuration. Keep the old worktree until separately authorized to remove it.

## Pick up here

No active release work. Wait for the user's next request. Do not republish2.2.10 or install/restart clients automatically. If installation is requested, use the published VSIX/binaries and coordinate any Bridge handover. Historical held issues remain in [[release-follow-ups]]; they are not a new work queue.

## Implementation boundaries

- Antigravity native chat requires VS Code1.145.3+. One adapter handles discovered text/chat IDs, including Argon and Carbon. Account metadata supplies context/output/image-input capability. Local history is bounded to32 checkpoints/16MiB and needs a new chat after reload/eviction. Classic encrypted packets preserve original state. Image-generation output and Antigravity Inquire remain unsupported.
- Native Codex uses the account maximum automatically, with the known default as fallback. `wisp.codexContextWindows` permits smaller exact-model budgets within the known ceiling. Native Codex configuration and public API limits remain separate.
- Native Codex/Grok preserve client/MCP schemas with explicit `strict:false`. Optional fields and dynamic maps survive. Bridge callers keep their explicit schema policy; execution and permissions remain with the native host.
- Earlier2.2.9 publication and old provider experiments remain closed. One earlier test-profile askpass socket resisted cleanup; no permissions or user processes were changed to remove it.

## Related

- [[pick-up]]
- [[overview]]
- [[flows]]
- [[decisions]]
- [[release-follow-ups]]

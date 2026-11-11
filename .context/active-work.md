---
type: active-work
project: wisp
updated: 2026-11-12
tags: [context, active-work, vscode, release]
---

# Active Work

_Last updated: 2026-11-12 by Codex (GPT-6 Astra)._

## Current focus

Release Wisp **2.2.10** with VS Code companion **1.14.7** after the user passed the native-chat eyeball checks. Runtime repairs and independent reviews are complete. Release packaging and local verification passed; PR #232 integration and publication are in progress. The current status and exact revisions/run IDs are recorded in `.claude/vscode-parity/release-2.2.10.json`.

**Workspace guard:** work in the primary checkout on local `main`. If elsewhere, locate `refs/heads/main` with `git worktree list --porcelain`, then read that checkout's `.context/pick-up.md`. This is the only current baton. Preserved `wisp/` notes and the retained old worktree are historical, not separate queues.

## Work contract

- **Authority:** khitarashi, 2026-11-12: "okay eyeball passed. so can we release this now? and also can we address tehse uncommeted shit". This authorizes scoped commits, PR integration, release publication and non-destructive Source Control cleanup. Installation and replacement of running clients remain separate.
- **Release scope:** `docs/releases/v2.2.10.md`, terminal/npm2.2.10, companion1.14.7, Slot unchanged1.7.5. Native Antigravity accounts/discovery, generic text/chat state, dynamic limits, Codex maximum context and MCP schema preservation. Existing Bridge qualification and Desktop protocol5 remain unchanged.
- **Owner:** root chat `8f60fde8-74fa-49f0-98e5-788163a75924`, primary checkout; owns VS Code fix coordination and this release. Predecessor ownership transfer is complete in `.claude/vscode-parity/handoff-to-main/state.json`. No relay is active.
- **Integration:** reuse [PR #232](https://github.com/EstarinAzx/Wisp-Router/pull/232), branch `fix/vscode-provider-parity`. Local main includes additional fixes beyond the existing PR head27ee22d: publish the complete reviewed local head to that branch before merging. Require successful release-build checks, merge with a merge commit (not squash), then fast-forward primary main and tag the merged revision. Do not reset/rebase away local work or force-push main.
- **Review policy:** independent scoped reviews plus one regression-tested correction pass. No persistent CodeRabbit opt-in; the old audit checkpoint remains closed at1/3 with47-file coverage. Existing GitHub PR app checks are not a new local review loop.
- **Native acceptance:** user reported basic Argon and Carbon chat working, confirmed GPT872K display, then passed a Codex greeting after the Pylance schema fix. No agent-issued live generation probes. Full-window requests, actual Pylance dynamic-key invocation, all model/tool combinations and interactive compaction remain unqualified.
- **Source validation:** core2081/TUI201 (896 assertions), core/TUI typechecks and extension build passed. A concurrent release-preparation run timed out in `authLifecycle.test.ts` Antigravity callback cleanup: separate test files share fixed OAuth ports. The isolated62-test suite passed; core files now run serially and all2081 passed again. Production auth code is unchanged.
- **Package validation:** local VSIX1.14.7 manifest and compiled payloads match the build. Compiled Windows2.2.10 passed launcher/Responses and signed-Desktop smoke checks in isolated homes. Four-platform CI and registry verification still gate publication completion.
- **Evidence:** `.claude/vscode-parity/release-2.2.10/` owns package/check logs; `dynamic-models-review.md`, `codex-context-plan.md` and `codex-tool-schema-plan.md` record code review and RED/GREEN evidence. Final review agents `67c108af-1e8e-40f2-abce-b9ad3f5e3433` (GPT context) and `2e197152-7ac9-4166-bb0e-dddcf7bd4c01` (MCP schemas) returned no actionable findings. No review reply is pending.
- **Cleanup:** all233 pre-existing untracked files are preserved. Local `.git/info/exclude` now hides `/wisp/` and `/docs/Screenshot 2026-10-13 114007.png`; neither is release source or published. The preservation manifest remains in `.claude/vscode-parity/main-before-handoff/`. All tracked implementation/release changes are scoped for commit.
- **Client boundaries:** preserve real settings/auth/provider selection, permissions, hook trust and running clients. Keep the old worktree until the user separately authorizes removal. One earlier test-profile askpass socket resisted cleanup; no permission/process workaround was used.

## Pick up here

Read `.claude/vscode-parity/release-2.2.10.json` before any release action. Reconcile the recorded PR head, merge commit, tag and workflow state with GitHub; never create or publish the same release twice. Finish authorized publication, verify GitHub assets/npm, and leave primary main clean and synchronized. Then wait for the user; do not install or resume old provider experiments automatically.

## Implementation boundaries

- Antigravity native chat requires VS Code1.145.3+. One adapter handles discovered text/chat IDs, including Argon and Carbon. Context/output/image-input capabilities come from account metadata. Classic encrypted packets preserve original tool/reasoning state; Local uses32 checkpoints/16MiB and needs a new chat after reload/eviction. Image-generation output and Antigravity Inquire remain unsupported.
- Native Codex uses the account maximum automatically, with the known default as fallback. `wisp.codexContextWindows` can request a smaller exact-model budget but cannot exceed that ceiling. No native Codex config import/mutation or blanket public-API window.
- Native Codex/Grok tools preserve client/MCP schemas with explicit `strict:false`; optional fields and dynamic maps survive. Bridge callers keep their explicit schema policy. Tool execution/permissions remain with VS Code.
- Earlier Wisp2.2.9/companion1.14.6 publication is complete; do not repeat it. Slot1.7.5 is unchanged. Held historical issues remain in [[release-follow-ups]].

## Related

- [[pick-up]]
- [[overview]]
- [[flows]]
- [[decisions]]
- [[release-follow-ups]]

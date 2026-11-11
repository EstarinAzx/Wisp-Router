---
type: active-work
project: wisp
updated: 2026-11-12
tags: [context, active-work, session-logs, vscode]
---

# Active Work

_Last updated: 2026-11-12 by Codex (GPT-6 Astra)._
_Source: reviewed Unit 2 over 2b92446ab3fcf78dda4054546bbe5512489cdf33; exact local commit in `.claude/wisp-2.2.11/unit2-receipt.json`._

## Current focus

Wisp **2.2.11**: session logging and both reproduced Copilot SDK/Agent Host failures are implemented and review-passed. The next root owns release preparation and remote-main integration. No release readiness is claimed yet.

## Work contract

- **Authority:** khitarashi, 2026-11-12, root chat 4cbf4b5f-18e7-4f99-84e1-31a6607f68cc: full autonomous engineering, CodeRabbit ON, Traycer root relays, no worktrees, integrate into main and leave release-ready in a fresh ownership-transferred main chat. Approval excerpt and acceptance: local `.claude/relay/wisp-2.2.11.body.md`.
- **Requirements:** `docs/superpowers/specs/2026-11-12-session-logs-copilot-design.md`; plan `docs/superpowers/plans/2026-11-12-session-logs-copilot.md`. Do not repeat planning or ask for design approval already covered by autonomy.
- **Execution:** primary checkout only, one inline root owner. `.claude/relay/wisp-2.2.11.traycer.json` owns runtime identity/phase; N=1 meaningful unit per leg, max20. This checkpoint was written by 21e2d4f4-4b08-4e20-960f-bb231f121db6 in leg3; the control JSON names the current owner. Preserve GUI settings across roots.
- **Review:** [[review-policy]] on. Session-logs **passed at 3/3**, Copilot **passed at 1/3**, release-prep **not started at 0/3**. No pending run or unresolved finding. Copilot attempt1 completed exit0, all8 paths covered, zero issues; delivered source/instruction hashes match. Local `.claude/relay/wisp-2.2.11.body.md` is the single budget ledger; `.claude/wisp-2.2.11/unit{1,2}-receipt.json` and `copilot-review-1/` retain evidence. Reuse matching reviews; do not reopen identical source.
- **Integration:** versioned context/docs; local relay/evidence ignored. Commit/PR/merge into remote main authorized. No tag/publication, actual client installation/restart or historical cleanup. No worktree creation/use.
- **Pending:** no implementation worker or review. Root transfer identifiers/thread live in relay JSON. Only ACTIVATE grants a successor body ownership.
- **Checkpoint:** Units1/2 are review-passed; exact local commits are in their receipts. Unit3 is the next authorized substantive work.

## State

- Unit1 local commit `2b92446`: bounded shared per-session logs across CLI/TUI/VS Code; lifecycle-only serve stdout; safe request attribution and multi-process regression coverage. Its evidence remains closed and unchanged.
- Unit2 reproduced the actual installed VS Code1.146.0 (`69047191fc`) / Copilot0.74.0 SDK harness. Full history dropped response-ID markers between user turns; Wisp now carries the same authenticated packet in reasoning `encrypted_content`. Matching dual carriers are accepted; missing, altered, duplicate or conflicting state is rejected. No cache-based unauthenticated recovery or plaintext thinking.
- Cloud Code's Claude tool-use replies ended with `OTHER`. Native chat now recognizes only well-formed tool calls with exact requested/returned Claude model identity. Default Bridge validation stays STOP-only. Truncation, safety stops, bad IDs, bad arguments and account/model/conversation changes remain guarded.
- Real SDK UI/live transport: Carbon high and Claude Opus5.5 high each read a controlled file, returned PEAR, then answered OK in the next user turn. Sanitized evidence: `copilot-host-events.jsonl`. RED/GREEN logs: `copilot-carrier-*`, `copilot-claude-*`; clean real API synthetic receipt: `synthetic-host-receipt.json`.
- Final checks: **2120 core +187 TUI tests**, both typechecks and extension/webview build pass on Bun1.4.2; `copilot-checks.json`. CodeRabbit0.9.5 completed 8/8 files with0 issues. Clean build contains no diagnostic hooks.
- Classic Local UI asked for GitHub sign-in in the isolated profile and was stopped before transport. Its real API synthetic classic/incremental/SDK history tests passed. Direct Claude forced ANY tool mode returned HTTP400; automatic tool selection is the qualified path. All variants, live compaction and full-window generation remain unqualified.
- All disposable host processes stopped and temporary Wisp credential copies removed. SYSTEM-only Git askpass directories resisted deletion; exact harmless test-profile remnants are recorded in `copilot-cleanup.json`. Leave actual permissions/installations untouched. The installed host displayed a pre-existing integrity warning; no installed files were edited.
- Unit3 must recapture TUI spans for version changes. Unit1's old fixture recapture and Windows EPERM investigation remain in its original evidence, not new issues to reopen.

## Pick up here

After ACTIVATE, verify relay ownership and the Unit2 receipt, then execute **Unit3**: versions/changelogs, package/binary smokes, final regression checks, release-prep CodeRabbit0/3, and remote-main integration through existing repository policy. Reuse matching Units1/2 source reviews. No worker/review remains pending. Versions are still2.2.10/1.14.7; prepare2.2.11/1.14.8 without publishing or tagging. Preserve the documented qualification limits. Transfer final readiness ownership to a fresh verified root using PREPARE/READY/ACTIVATE.

## Preservation

Real auth/settings, permissions, hook trust, running clients, 233 excluded historical files and the retained old worktree are unchanged. Prior 2.2.10 receipt: `.claude/vscode-parity/release-2.2.10.json`. Native full-window generation, all model/tool combinations and live compaction remain incompletely qualified. Run fixed OAuth-port core tests serially. Pinned Bun: task scratch `bun-1.4.2/bun.exe`; do not replace the older global Bun.

## Related

- [[pick-up]]
- [[overview]]
- [[review-policy]]
- [[release-follow-ups]]

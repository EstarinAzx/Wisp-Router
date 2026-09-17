---
type: active-work
project: wisp
updated: 2026-09-17
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-09-17 by GPT-6 Astra / Codex (auto)_
_Feature commit: `38ccde1dac9cede878b64b63210924104bf06dd8`; main application remains stable2.1.5._

## Current focus

Wisp2.2.0 / VSIX1.14.0 adds signed-in Codex desktop Alias routing. Implementation/review/packages/four-platform CI pass, but actual Grok follow-up fails. **Release held; user requested wrap-up and a fresh session.** No further live testing in the old session.

## State

- **Feature:** clean `feat/codex-desktop-signed-in` worktree at `C:/Users/S.D/.traycer/worktrees/estarinazx__wisp-router/feat-codex-desktop-signed-in`; pushed draft https://github.com/EstarinAzx/Wisp-Router/pull/223 . No merge/tag/publication/global install.
- **Reviewed:** phase2 compatibility/native snapshot/rollback PASS at932f5eb; safe status/retry slice PASS at38ccde1 (core1221, types, same-thread actualCLI synthetic protocol and exact extracted archives). Latest slice improves diagnostics; it does NOT establish a live fix.
- **Latest CI:** https://github.com/EstarinAzx/Wisp-Router/actions/runs/35214844449 at38ccde1. All4 builds/smokes PASS, publish SKIPPED. All4 ZIP digests verified; downloaded Windows bytes passed both checks. Evidence: `D:/wisp-release-candidate-2.2.0-20260917/ci-35214844449/verification.json`.
- **Current candidate:** `D:/wisp-release-candidate-2.2.0-20260917/38ccde1/` contains immutable exe/VSIX/npm archives, manifest/inventory, handoff and hash-checked acceptance helper. EXE SHA256 `947305ae8ec10e8792395376d6785b921587a4a1a6548b819c4e8df078ce8d49`. Earlier16 candidate hashes unchanged.
- **Safe live state verified at wrap:** integration disabled; no listener41184; native gpt-5.6-sol/medium/openai; original routes/aliases restored; native and Wisp auth hashes unchanged against pretest. All root shells exited/stopped; builder5011a81c and evaluator ddab1276 archived.
- **Blocked:** actual desktop follow-up root cause and tool execution. Last UI tested932f5eb: Grok hi succeeded, ok failed generic502; later fresh hi also failed. Native GPTSol hi/ok worked; picker/login survived restart. Latest38ccde1 has NOT been tried in UI.

## Pick up here

Read the durable parent investigation below, latest independent review and candidate handoff. Next targeted step: obtain actual desktop failure category from38ccde1 (HTTP status versus stream_failed/incomplete/invalid/empty_output); if needed, record only flattened tool counts/schema categories. Prefer isolated reproduction, but don't repeat passing history probes or silently truncate tools. No root cause is established yet.

For a coordinated UI retry: pause peers before shared CODEX_HOME enable; recheck app version/candidate hash; temporarily add `Grok 4.6 (Wisp)` -> xai/grok-4.6 and remove only redundant native exact routes documented in prior before.json so the native control stays native. Preserve every original route, snapshot changes, use fresh chat, restore/disable before resuming peers. Do not leave the user unexpectedly routed.

After reproduced fix: independent review, new immutable packages/CI as needed, actual same-chat text follow-up + read-only tool continuation + native control/restart/rollback. Only then finalize release wording, integrate PR, tag/publish2.2.0 plus VSIX1.14.0, verify downloads/npm. Slot unchanged. Existing user authorization covers eventual work; no routine approval questions.

Evidence pointers:

- Durable checkpoint: `D:/wisp-release-candidate-2.2.0-20260917/desktop-acceptance-v2/investigation-20260917-1120.md` and siblings `result-and-rollback.json`, `grok-recorded-text.json`, `grok-tool-count.json`, `grok-cli-tools.json`.
- Build artifacts root: `C:/Users/S.D/.traycer/epics/1702a7c7-a431-43c2-ab5f-79d9cf189643/artifacts/autobuild/wisp-desktop/`. Latest review `grok-followup/evaluator/review-02/index.md`; phase2 `desktop-repair/phase-2-review-02/index.md`. Candidate directory also has durable handoff.md.
- Selected actual test session: `C:/Users/S.D/.codex/sessions/2026/09/17/rollout-2026-09-17T22-27-09-01a0aee7-e861-7222-9daf-67f15a99ffa2.jsonl`. Never dump contents/change original; only structural reporting. Parent replay script hash-checks it.
- Matching CLI installed only in scratch `D:/wisp-desktop-cli-0.155.0-alpha.2.6`; `generator-check/comparison.json` and scratch scripts compare alpha/baseline. Pinned Bun1.4.2: `C:/Users/S.D/.traycer/worktrees/estarinazx__wisp-router/ticket-215-codex-picker-aliases/out/bun-1.4.2/bun-windows-x64/bun.exe`; global Bun1.3.14 unchanged.

## Skills for next session

- preset pick-up + systematic-debugging: resume specific unresolved live failure.
- verification-before-completion + existing autobuild/review pair: distinguish candidate proof from real UI/release acceptance.
- computer-use only if helper becomes available; currently native pipe unavailable. Do not bypass WindowsApps access restrictions or substitute CLI proof for desktop UI.

## Open questions

Actual desktop flattened tools/schema/options triggering rejection are unknown. No user design decision outstanding. One targeted UI retry may be needed after fresh-session orientation; do not ask for keys or raw prompts.

## Recent context

- **Disproven as sufficient causes:** output_text history, late developer messages, hi/ok with one tool, and actual selected first/follow-up messages without tools all pass real Grok. Matching alpha/0.154.0 synthetic request structures match. Native fixture's14 mapped tools pass real Grok with fixed marker/no execution.
- **Unproven hypothesis:** synthetic128/256 functions pass;512 returnsHTTP400. Actual desktop count unknown. Do not claim tool count is the bug or silently remove tools.
- **Settled boundaries:** Antigravity excluded for desktop because positioned roles cannot be preserved; no role folding. Ordinary native-mode discovery/saved snapshot, no bundled-only union/temporary shared-config stripping. Only narrowly observed unused hosted-search declarations omitted; forced/history/options reject. Initial phantomGPT5.2 and Antigravity failures were addressed before current Grok issue.
- **Environment drift:** app now26.911.7940.0; failing session CLI0.155.0-alpha.2.6; globalCLI0.154.0. Official scratch alpha passes synthetic tests. Recheck version next session. OpenCodeGo/KimiK3 credential probe401; existing Grok works independently. Never copy credentials/log provider bodies.
- Preserve user `.context/flows.md` and `.context/Untitled.canvas`, worktrees/evidence. One old synthetic state.json EPERM did not recur; no cause/fix claimed. No need to redo completed full suites unless new source/evidence warrants it.

## Related

- [[overview]]
- [[pick-up]]
- [[decisions]]
- [[release-follow-ups]]

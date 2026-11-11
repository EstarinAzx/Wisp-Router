# Session logs and Copilot Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for native inline execution, one meaningful unit per root relay leg. Follow TDD and the selected CodeRabbit policy; no worktrees.

**Goal:** Separate Wisp serve output from per-chat logs and make the pictured VS Code Copilot harness work through verified adapters.

**Architecture:** Shared bounded filesystem session telemetry in core, consumed by renderer-free CLI and TUI. Reuse validated conversation identities and native host transports. Reproduce Copilot adapter mismatches before changing them.

**Tech Stack:** Existing Bun, TypeScript, Node stdlib, React/OpenTUI, VS Code APIs, Vitest/Bun tests.

**Spec:** `docs/superpowers/specs/2026-11-12-session-logs-copilot-design.md`.

## Global constraints

- Work only in the primary checkout; no worktree creation/use. Preserve existing auth/settings/clients.
- `wisp logs`, `wisp log <id> [-f|--follow]`, TUI `/show logs`, legacy `/show-log` alias.
- Store limit: 128 sessions, 256 KiB per file plus one rotation; recent activity window 30 minutes.
- No prompts, response content, tool arguments/results, credentials or replay packets in diagnostic persistence.
- CodeRabbit on, maximum three launched attempts per checkpoint; record immutable submitted bytes and process identity before launch.
- 2.2.11 release-ready on remote main, without publication. Fresh root chat owns final verification/report.

## Review focus

- Concurrent same-model requests must never swap session attribution; integration test interleaved A/B requests.
- Host restart/failed bind must not rotate or delete another host's live log; test distinct host writers and failed starts.
- Hostile IDs, terminal escapes, corrupt/partial files and huge input must neither traverse paths nor render arbitrary control sequences; test reader and writer boundaries.
- Native Copilot incremental tool continuation must restore the right account/model/conversation without replaying tools; test actual host conversion plus tampered/missing state.
- A fresh TUI must read external serve/extension sessions without acquiring the Bridge port or touching settings; verify cross-process behavior.

## Unit 1: shared session logging end to end

Files: create `packages/core/src/sessionLog.ts` and core tests; update core index and Bridge request boundary; `packages/tui/src/bridgeLog.ts`, `bridge.ts`, `serve.ts`, `index.tsx`, `app.tsx`, `modes.ts`, `infoScreens.tsx`, core `slash.ts`; native `packages/vscode/src/chatProvider.ts` and extension Bridge wiring; corresponding tests/docs.

Interfaces: core owns types, validated public ID, session metadata/read/write/list operations; finalize exact exported signatures in this plan before dependent edits. Consumers receive no credentials or raw conversation objects. Implementer may simplify the proposed store while preserving all behavior/limits.

Selected API: `createSessionLogger(source, home?)` returns `begin(protocol, identity?)` and `lifecycle(start|stop)`. A request handle exposes `id`, `event(kind, {provider?, model?, attempt?, status?})` and idempotent `finish(complete|error|cancel, status?)`. Readers use `listLogSessions(home?, includeHosts?)`, `readSessionLog(id, home?)` and `formatSessionLog(entry)`. Each host instance namespaces IDs; Bridge attribution uses AsyncLocalStorage and response finish/close, while native chat owns its request handle through cancellation/finally. Structured events replace arbitrary text persistence; internal diagnostic callbacks remain available for controlled instrumentation.

- [x] Trace every Bridge/native log caller and session identity boundary; pin the storage API and request attribution design.
- [x] Add failing tests for A/B separation, stale vs in-flight listing, path/escape rejection, bounded storage/read, corrupt tails, concurrent writers, best-effort failures and safe event fields. Run focused core tests and retain RED.
- [x] Implement minimal core store and integrate request-scoped metadata/safe logs across all three hosts. Run focused core/native tests and retain GREEN.
- [x] Add failing CLI/slash/TUI navigation tests: list, exact ID, missing/unknown ID, follow/rotation, `/show logs`, legacy alias, list/detail back navigation, empty state. Confirm RED, implement, confirm GREEN.
- [x] Run isolated multi-process serve/client/reader smoke. Assert serve stdout has no traffic, both sessions remain distinct, CLI and a fresh TUI see the same data without starting another Bridge.
- [x] Update user docs, run core/TUI typechecks, focused/full suites and compilation as appropriate. Capture immutable review scope, reserve/log CodeRabbit launch, resolve findings within ledger budget, then commit the reviewed unit locally.

## Unit 2: Copilot harness diagnosis and correction

Files: begin `packages/vscode/src/nativeAntigravityChat.ts`, `chatProvider.ts`, core `antigravityResponses.ts`/`antigravityClient.ts`; tests `packages/core/tests/vscodeArgon.test.ts`, `vscodeChat.test.ts`; `packages/vscode/tests/argon-host.cjs`; parity docs. Do not assume all need edits.

- [x] Identify installed VS Code/Copilot harness version and trace its actual request/marker conversion. Read relevant existing pinned source; refresh official source if necessary. Retain sanitized evidence for the two supplied errors.
- [x] Reproduce text response for Antigravity Claude and tool-follow-up for Carbon in the actual pictured Copilot harness. Distinguish native response validation, request conversion and upstream failure. Use the new session diagnostics to isolate boundaries without logging sensitive content.
- [x] Write a minimal failing regression for each demonstrated root cause, confirm RED, make the smallest shared fix, confirm GREEN. Keep replay/account binding, original tool IDs, complete responses and cancellation enforced.
- [x] Exercise classic/native and Local continuation plus the Copilot SDK/Agent Host path; cover other supported providers' text/tool requests using existing fixtures. Record actual UI vs intercepted-I/O evidence separately.
- [x] Finish parity docs/tests and CodeRabbit checkpoint, with exact scope and review dispositions, then commit locally. If a real upstream/platform dependency blocks one probe, preserve the negative evidence and continue independent authorized work; do not fake acceptance.

Unit2 evidence: actual VS Code1.146.0 / Copilot0.74.0 SDK reproduced both failures, then Carbon and Claude
Opus5.5 high each completed a file-read tool cycle and a following user turn. Classic Local UI required
GitHub sign-in and was stopped before transport; its real API path passed synthetic tests. Direct Claude
forced ANY tool mode returned HTTP400; automatic selection is qualified. These are documented limits,
not passing live Local/forced-tool claims. Core2120/TUI187, typechecks/build pass. CodeRabbit completed
8/8 paths with zero issues at1/3. Exact revision/evidence: local `.claude/wisp-2.2.11/unit2-receipt.json`.

## Unit 3: release readiness and integration

- [x] Update release versions/changelogs/surface notes only after deliverables are verified. Check existing package/release scripts for all required version mirrors.
- [x] Run full core tests, TUI tests, package typechecks, extension/webview build; package VSIX and Windows binary and run existing isolated smokes. Retain command exits and source identities.
- [x] Complete CodeRabbit for new release-prep bytes; reuse matching completed source reviews. Verify final source tree matches tested/reviewed bytes.
- [x] Integrate authorized commits into remote main through existing GitHub policy; reconcile remote changes and rerun affected checks if needed. Return this checkout to main. Confirm CI, clean intended working tree and exact remote revision.
- [ ] Refresh baton, retain review/evidence links, and transfer ownership to a fresh verified root/main chat using PREPARE/READY/ACTIVATE. Final owner verifies readiness and presents the result. No tag/publication.

## Initial plan check

The design's CLI/TUI/serve behavior is Unit 1; the screenshot failures and both host modes are Unit 2; integration and fresh-owner delivery are Unit 3. The five review risks each have an explicit check above. Native transport causes and exact log API are intentionally investigation steps before implementation, under the user's engineering discretion.

# Wisp audit hardening implementation plan

> For agentic workers: use the connected Traycer execution route with `traycer-implement` for scoped workers and `traycer-review` for independent reviews. Native inline execution uses `superpowers:executing-plans`. Apply TDD to behavior fixes.

**Goal:** Repair all 17 validated audit findings, prove the repaired behavior, and leave a reviewed, committed fix branch.

**Architecture:** Keep the shared core, existing provider managers and client adapters. Extend the existing credential guards, fix cancellation/replay at shared seams, and protect configuration mutations with a cooperative atomic operation. Keep disabled Gemini API enrollment disabled.

**Tech stack:** TypeScript, Bun 1.4.2, Vitest, Node, React/OpenTUI, VS Code/Preact.

**Spec:** The user-approved audit is Traycer artifact `whole-codebase-audit` in task `1702a7c7-a431-43c2-ab5f-79d9cf189643`; `findings.json` is the numbered repair contract. The local execution brief records its absolute path, hash and attributable approval. This plan implements the approved repairs, not a new feature scope.

## Global constraints

- Preserve credentials, real Wisp/Codex settings, model/provider selection and existing running clients. Tests use synthetic stores and intercepted or loopback-only transport.
- No live provider/auth/quota experiment, real native-client discovery, package install, tag, merge or release is part of this repair run.
- Use Bun 1.4.2, including child-process PATH. The default npm shim is older and caused the audit's initial test-launch failures.
- Keep source in the existing linked worktree on `fix/audit-hardening`. Do not edit the audit snapshot repositories or push their artificial histories.
- No new dependency, provider framework or speculative refactor. Preserve validation, credential-change checks, existing unknown configuration fields and failure reporting.
- Write a regression first, observe the intended failure, then fix. Existing audit probes establish the cases but do not replace committed regression coverage.
- Current docs may be corrected; historical evidence keeps its dates and claims. Formatting repairs must not rewrite history.
- No version bump is implied. The previous 2.3.0 discussion did not choose release scope or authorize publication.

## Review focus

1. Sign-out/account replacement during pending or failed renewal never restores or returns superseded credentials (Task 1).
2. An unrelated concurrent config write survives, or the stale mutation fails explicitly; malformed/unreadable stores remain intact (Task 2).
3. Disconnect before headers and after first output aborts local upstream work; cleanup cannot hang on an arbitrary cancel promise (Task 3).
4. Empty signed thinking, redacted thinking, interleaved text and tool calls survive advisor continuation in their original order (Task 3).
5. Verification scripts remain hermetic, exercise their intended screens, exit nonzero on failure and never discover real native clients (Tasks 4–5).

## Task 1 — Credential lifecycle (findings 2, 4, 5, 16)

**Files:** `packages/core/src/{codexAuth,anthropicAuth,antigravityAuth,xaiAuth,kimiAuth,homeStore}.ts`; `packages/tui/src/store.ts`; `packages/vscode/src/extension.ts`; corresponding core auth/store tests.

**Interfaces:** Preserve public `current`, `signIn`, `signOut` behavior. Extend the existing optional expected-credential snapshot write contract to Grok/Kimi and wire it through both hosts. Keep one in-flight refresh per manager; do not hold the file write lock during network I/O.

- [x] Add regression cases for pending Kimi/Grok refresh followed by sign-out and account replacement. Assert the tombstone/new bundle survives and stale credentials are not returned.
- [x] Add concurrent-current cases for Codex, Claude, Antigravity and Grok: one grant per manager; both callers get the valid result. Include failed grant and later retry, and account replacement while callers share the pending promise.
- [x] Add malformed 200 refresh cases for Claude/Grok: `{}`, blank/wrong-typed tokens and invalid expiry preserve the original usable bundle and retry eligibility.
- [x] Add success/rejected-callback cases proving each of the four browser OAuth flows clears its five-minute timeout. Intercept provider requests and clean up loopback resources.
- [x] Run the selected tests and retain genuine RED output.
- [x] Implement the smallest shared-guard/in-flight/validation/timer corrections. Search every store adapter before changing its signature. Preserve successful rotation when only an ordinary disk write fails, without accepting a concurrent sign-out.
- [x] Run affected tests, core suite and core/TUI/extension typechecks; record any failure by name. Independently review the auth changes, address findings and commit this unit.

## Task 2 — Shared configuration and replay identity (findings 3, 11)

**Depends on:** Task 1 (both touch `homeStore.ts` and host wiring).

**Files:** `packages/core/src/homeStore.ts`; routing/snapshot command seams; nested config writers in `packages/tui/src` and `packages/vscode/src/extension.ts`; `packages/core/tests/homeStore.test.ts`; relevant CLI/Bridge tests.

**Interfaces:** Add a synchronous guarded config mutation operation (for example `updateConfig(update: (current: WispConfig) => WispConfig): WispConfig`) if it is the smallest complete solution. Make ordinary `writeConfig` use the same guard. Async routing validation must commit against a checked current snapshot or recompute its pure edit under the guard; no await inside the file lock.

- [x] Port the audit's deferred credential-check race into a regression: a second successful alias write must survive, or the stale first edit must fail rather than claim success.
- [x] Cover independent family/alias edits, snapshots/revert, preservation of unrelated config fields, busy-lock handling and malformed/unreadable files. Search all nested read-modify-write callers and migrate those exposed to the same lost-update mechanism.
- [x] Add a replay test where a whitespace-padded stored Bridge secret authenticates and derives the same replay identity as its trimmed value.
- [x] Observe RED, implement the guarded config changes, and normalize the secret in `WispHome.antigravityReplayContext` without weakening replay identity validation.
- [x] Run core and affected TUI tests/typechecks, independently review the shared-write boundary, then commit.

## Task 3 — Stream cancellation and replay (findings 1, 6, 7, 15)

**Files:** `packages/core/src/{bridgeServer,bridgeAnthropic,codexClient,geminiResponses}.ts`; `packages/core/tests/{bridgeServer,bridgeAnthropic,codex,geminiResponses}.test.ts` (or a focused sibling test file).

**Interfaces:** Keep Bridge protocols unchanged. Use guarded response-close cancellation. Preserve original assistant blocks through the existing `NormalizedTurn.rawContent` sidecar. Keep the shared `sseBlocks` generator API.

- [x] Add actual local-HTTP disconnect regressions for Chat Completions and Messages before upstream headers and after the first SSE token; assert upstream signal and cleanup behavior.
- [x] Add an advisor regression that serializes the next Anthropic request and checks signed/empty/redacted thinking, text and original tool-call order.
- [x] Add early-break and upstream-error reader cleanup regressions, plus a normally exhausted control. Include a nonsettling/rejected cancel callback so cleanup cannot strand the caller.
- [x] Add Gemini usage cases: absent, output-only, cached-only and complete totals. Incomplete provider observations must not become malformed Responses usage; public Gemini enrollment remains disabled.
- [x] Observe RED, implement minimal shared fixes, run the focused cases and complete core suite, review and commit.

## Task 4 — Model discovery and explicit TUI commands (findings 8, 9, 10)

**Files:** `packages/core/src/modelsDev.ts`; `packages/tui/src/modelFetch.ts`, `packages/tui/src/testScreen.tsx`, `packages/tui/src/app.tsx`; existing model/terminal command tests and a core modelsDev test if needed.

**Interfaces:** Keep model-discovery APIs and fallback semantics. Bound the shared catalog fetch/body operation and caller cancellation without introducing a new service. Use the correct provider dispatch or explicit unsupported result for `/test`.

- [x] Add a stalled catalog/body regression proving fallback occurs within the chosen bounded deadline; preserve the initiating signal and verify an already-aborted later caller settles promptly.
- [x] Add real-App command coverage for `/key xai`: it must direct to OAuth and never save `keys.xai`.
- [x] Add `/test antigravity` and alias cases with synthetic credentials: qualified non-Argon models use the Antigravity client; unqualified Argon tests refuse before transport instead of falling into Chat Completions.
- [x] Observe RED, implement the smallest repairs, then run focused and complete TUI/core tests and relevant typechecks. Commit.

## Task 5 — Hermetic verification tools (findings 12, 13)

**Files:** `packages/tui/scripts/span-baseline.tsx`, `span-baseline.json`; `packages/core/tests/fixtures/argonAcceptanceFixture.ts`; the synthetic parent guard in `packages/core/src/argonAcceptance.ts`; associated test support.

**Interfaces:** Preserve the operator's production path/ancestor checks. Canonicalize only the temporary-parent comparisons used by synthetic fixtures. Keep the existing span command but make its execution safe and its exit status reliable.

- [x] BEFORE running the span script again, intercept its native discovery seam and isolate all stores. Its previous fetch stub did not cover `execFile`.
- [x] Add checks for current routing-screen navigation and nonzero exit on capture failure. Observe RED safely with native processes blocked.
- [x] Add canonical/linked-temp-parent controls and cleanup assertions; observe RED without reading or writing real Wisp home.
- [x] Fix fixture creation, synthetic-entry validation and cleanup consistently; preserve rejection of untrusted ancestor links.
- [x] Repair span navigation and failure handling. Only then capture and review the current baseline; verify repeat capture passes without `--update` and an intentional mismatch fails.
- [x] Run relevant suites, document Windows-only platform evidence, review and commit.

## Task 6 — Current docs and historical formatting (findings 14, 17)

**Files:** `packages/vscode/README.md`, `CONTEXT.md`, `docs/codex-wisp.md`, `packages/{tui,vscode}/CHANGELOG.md`, `docs/investigations/2.2.8-argon-api.md`.

- [x] Reconcile current companion version, auth-file storage, default Provider, both Bridge hosts and npm source-template versions against manifests/source. Search connected current sections for the same contradictory claim.
- [x] Restore corrupted changelog separators and escape the two literal table pipes; preserve historical content and dates.
- [x] Check links, table shape and `git diff --check`; use no implementation-mirroring tests for prose-only repairs. Commit.

## Task 7 — Integrated verification and CodeRabbit

- [x] Map every finding 1–17 to its changed files and verification evidence. No unchecked item is silently dropped because it is minor or dormant.
- [x] With pinned Bun and process-local PATH, run root `bun run test`, `bun test packages/tui/tests`, core typecheck, TUI compile, root `bun run compile`, `node plugins/slot/statusline/check.js`, and the repaired hermetic span check.
- [x] Get an independent whole-diff review of the integrated branch. Preserve actual failures and qualified platform limits.
- [ ] Run CodeRabbit on the actual fix-branch diff against the recorded audit base, after local checks. Use the single checkpoint in the execution brief; initial plus at most two follow-ups, never paid credits without approval. Record complete coverage/outcome and validate each finding before acting.
- [ ] Apply justified in-scope follow-ups and rerun affected checks/review within budget. Exhausted budget or auth/quota blockers stay explicit; do not label them a pass.
- [ ] Commit the final verified state and push the fix branch. Do not merge, tag, publish or install a release.
- [ ] Produce the final changeset walkthrough and concise user report: commits, all 17 dispositions, tests, CodeRabbit outcome and remaining platform/live acceptance limits.

## Execution order and ownership

One coordinator owns integration, the execution brief and review budget. Task 1 precedes Task 2. Tasks 3 and 4 may be delegated with explicit file boundaries while Task 1 runs; the coordinator resolves shared test/host files instead of allowing overlapping edits. Task 5 follows relevant TUI work; Task 6 is independent. Task 7 requires all earlier tasks.

The approved full-autonomy request selects execution without another approval gate. A connected main-chat relay may rotate after a verified batch. Pending workers/reviews must settle before rotation; the owner transfers through PREPARE/READY/ACTIVATE and leaves the old chat unarchived.

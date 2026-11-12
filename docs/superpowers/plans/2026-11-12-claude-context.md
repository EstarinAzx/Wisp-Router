# Claude Context Windows Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. The project's CodeRabbit policy supplies the independent review boundary.

**Goal:** Give claude-wisp the selected Target's exact context budget and refuse unsafe model changes.

**Architecture:** Core issues a signed launch profile and validates it on the Messages path. The launcher selects a Target, requests the profile and adds child-only configuration. A new launch/resume is required to change Targets.

**Tech Stack:** Existing TypeScript, Node HTTP/crypto/child_process, Bun and Vitest; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-12-claude-context-design.md`

## Global Constraints

- Primary checkout, branch `feat/claude-context-windows`; preserve existing flow-note edit.
- Qualified client floor 2.1.322; stamp also becomes 2.1.322, with independent meanings.
- Child-only settings and no persistent alias migration. CodeRabbit 0/3 initially.
- No publication or client installation/restart.

## Review Focus

- Alternate model/fallback/subagent request must not inherit a mismatched context budget.
- Route/base-URL changes during metadata lookup or after launch must not redirect the profile.
- Explicit settings and environment overrides must not bypass transport or context enforcement.
- Malformed/unavailable capability metadata must never advertise an invented large window.
- Resume and concurrent launches must preserve conversation and configuration isolation.

## Task 1: Core launch profile and Bridge enforcement

Files: create `packages/core/src/claudeContext.ts` and `packages/core/tests/claudeContext.test.ts`; modify `bridgeServer.ts`, `index.ts`, and `bridgeServer.test.ts`.

Interfaces: `ClaudeContextProfile` identifies protocol, generated ID, route, target, base URL, context window and source. `signClaudeContext`/`readClaudeContext` authenticate profiles. `resolveClaudeContextRoute` strictly resolves a launch selection. `readClaudeContextWindow` reuses existing capability readers.

- [x] Write/run failing profile tests: exact windows, invalid limits/signatures, strict route selection and changed-target refusal.
- [x] Implement minimal core functions, then run `bun run --cwd packages/core test tests/claudeContext.test.ts` to green.
- [x] Write/run failing HTTP tests for authenticated `/claude-code/context`, normal profiled generation, alternative-model refusal, route mutation and unauthenticated synthetic IDs.
- [x] Integrate endpoint and guard before generation; run both scoped test files to green.

## Task 2: Launcher selection, configuration and lifecycle

Files: create `packages/tui/src/claudeContextLaunch.ts`, `packages/tui/tests/claudeContext.test.ts`; modify `claude-wisp.ts` and dispatcher if needed.

Interfaces: parse native argv while extracting one `--model`; compose returned core profile into a child launch. Preserve unrelated settings/permissions; reject incompatible context/transport values. Export launcher entry for fixture-based process checks.

- [x] Write failing tests for 128000/400000/500000/1000000 budgets, native argument preservation, resume requiring explicit model, settings merge/conflicts and version floor.
- [x] Implement selection/profile fetch/version preflight/child launch; run `bun test packages/tui/tests/claudeContext.test.ts` to green.
- [x] Run a synthetic Bridge plus installed Claude Code and assert reported budgets, suffix behavior, route refusal and resume launch construction. Store evidence under `.claude/alias-context-research/`.

## Task 3: Stamp, documentation and review

Files: `packages/core/src/anthropicClient.ts`, `packages/core/tests/anthropic.test.ts`, launcher documentation and unreleased changelog entries.

- [x] Add a failing wire test requiring matching 2.1.322 User-Agent and billing stamp, then update the one version constant.
- [x] Document launch selection, exact versus conservative metadata, safe refusal/relaunch, subagent/fallback limits and unchanged ordinary gateway mode.
- [x] Run core/TUI suites, both typechecks and extension build. Inspect failures; preserve logs.
- [x] Reserve CodeRabbit attempt before launch, capture scoped content hashes and run selected native review. Resolve findings and recheck changed scope within the three-run limit.
- [x] Record final evidence and deliver the reviewed changes; no release or installation.

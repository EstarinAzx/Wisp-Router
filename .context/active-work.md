---
type: active-work
project: wisp
updated: 2026-06-24
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-06 by Opus 4.8._
_On branch `fix/codex-stream-cutoff` off `main` (v1.4.1); this session fixed the Codex streaming cutoff and bumped to v1.4.2. PR open, not merged._

## Current focus
**Codex streaming replies cut off / don't complete — FIXED (diagnosability + safe truncation handling).**
A user hit intermittent blank/cut-off Codex replies in native chat on `gpt-5.5 · high` (a reasoning model).
Root-caused with a 13-agent research + adversarial-verify workflow. The Codex path relayed a *bad stream
ending silently* — good turns were always fine, the bug was invisibility.

Ranked causes: **D3** (top) — no terminal-event guard: a long high-effort reasoning window emits no text,
the idle socket drops before any terminal frame, and `codexStream` returned yielding nothing (= the blank
turn). **D1** — `response.incomplete` swallowed, `incomplete_details.reason` discarded (= silent mid-sentence
cut). Plus swallowed `error` frames and invisible cancellations. **D2 REFUTED**: the missing
`max_output_tokens` was a red herring — gpt-5.x *rejects* it (400); adding it would break gpt-5.5. Full
write-up: `CODEX-STREAM-CUTOFF-FINDINGS.md`.

## State
- **Done this session (branch `fix/codex-stream-cutoff`):**
  - **Codex stream end-state reworked (`src/codexClient.ts`).** Track `sawTerminal`; after the read loop:
    truly-empty drop → **throw** a retryable error; content delivered but no terminal → keep it + soft
    marker (never throw — preserves near-complete agent turns, no false-alarm on lost tail frame); a bare
    `error` frame is captured for the throw message. Skeptics refuted the naive "always throw" — the shipped
    guard only throws on the empty drop.
  - **`responsesIncompleteReason` pure helper + D1 marker (`src/catalog.ts`, `src/codexClient.ts`).** A
    `response.incomplete` now yields a visible `_[Response truncated: <reason>]_` part (covers both wire
    shapes). Marker lives in `codexStream` only — Inquire edit replies are never polluted.
  - **Cancel log (`src/chatProvider.ts`)** — abort path logs `[cancel] …` instead of a bare return.
  - **D2 guard comment (`src/catalog.ts`)** at `buildCodexResponsesBody` — records why `max_output_tokens`
    is deliberately omitted, so nobody re-adds it.
  - **v1.4.2 bump:** `package.json` 1.4.1 → 1.4.2, `CHANGELOG.md` 1.4.2 entry, `CODEX-STREAM-CUTOFF-FINDINGS.md`.
  - **Checks:** `tsc` clean, full `npm run compile` clean, **244 tests green** (was 237; +2 helper, +5
    first-ever `codexStream` fetch-mock IO tests). vsix built (`wisp-1.4.2.vsix`).
- **In flight:** PR open on `fix/codex-stream-cutoff`, not merged.
- **Blocked:** nothing. **NOT runtime-verified** against the live Codex OAuth backend (needs user F5).

## Prior session (2026-06-24, v1.4.1)
Anthropic native-chat vision fixed (`7dfa8b0`), provider label `Claude`→`Anthropic` (`4834ecc`). Wire proven
correct; **agent-mode vision intermittency stays OPEN** (decisive "empty" datum never captured). Ask mode
reliable, v1.4.1 shipped, no rollback.

## Pick up here
Nothing forced — vision is resolved, v1.4.1 is out. Optional follow-ups, rough priority:
1. **Bridge image follow-up.** `handleAnthropicChat` in `src/bridgeServer.ts` still drops images —
   same shape as the native fix, now that `buildAnthropicMessagesBody` accepts `images`. Just thread
   them through the Bridge's message mapping. Low priority (Copilot CLI rarely sends images).
2. **Close PRD #34** (the Bridge parent) if still open.
3. **Copilot CLI catalog warning** (`injectCopilotEnv`): inject
   `COPILOT_PROVIDER_MAX_PROMPT_TOKENS` / `_MAX_OUTPUT_TOKENS` from real model caps to kill the
   `not in the built-in catalog` token-window warning. Cosmetic.

## Skills for next session
- /preset ship — push `main`, open a PR if you want review (commits are local).
- /preset pick-up — resume from this note.

## Open questions
- **Agent-mode vision is intermittent — root cause NOT pinned (OPEN).** Plain/Ask mode reads images
  reliably; agent mode sometimes answers "attachment empty" (same image/model/build, confirmed both a
  success AND a failure in agent mode). To resolve: re-add the probe (incoming `images=` count + last-turn
  part kinds + `OUT` body shape — both blocks were in `chatProvider.ts` `provideLanguageModelChatResponse`),
  F5, reproduce a FAILURE, read the pair at the "empty" turn. `images=0` → VS Code dropped it on that turn
  (host, not ours). `images≥1` + no `image(...)` in `OUT` → our builder dropped it (our bug → fix).
  `images≥1` + `OUT` shows `image(…b64)` → sent correct, model ignored it (model/host behavior).
- ~~Live vision round-trip not F5-proven.~~ RESOLVED — wire confirmed (image block leaves with real bytes,
  Claude reads it) for non-agent turns.

## Recent context
- **Vision is advertised per `VISION_FAMILIES`** ([catalog.ts:226](../src/catalog.ts#L226)) — Claude
  rows light up `imageInput:true`, so VS Code *attaches* the image and sends it. The drop was purely on
  Wisp's send side. The Codex path was already correct; Anthropic was the lone gap.
- **Anthropic image block shape:** `{type:'image', source:{type:'base64', media_type, data}}`, images
  before text (Anthropic's recommended vision ordering).

## Related
- [[overview]]
- [[happy-path]] — the Bridge golden-path MVD
- [[api]] — Bridge endpoints, `COPILOT_*` env, `wisp.bridge.secret` slot
- [[decisions]] — Bridge + side-panel forks
- [[gotchas]] — PowerShell curl trap, F5 dup trap, new-terminal env trap, GUI-app-no-Bridge trap

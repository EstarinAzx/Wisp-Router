# Codex streaming replies cut off / don't complete — findings & fix

**Date:** 2026-07-06 · **Area:** Codex provider (ChatGPT OAuth, Responses API) · native Copilot chat
**Status:** Fixed (diagnosability + safe truncation handling). One speculative resilience item deliberately deferred (see §6).
**Files touched:** `src/codexClient.ts`, `src/catalog.ts`, `src/chatProvider.ts`, `src/codex.test.ts`

---

## 1. Symptom

Codex replies in VS Code native chat "don't complete and sometimes cut off." Intermittent — the
same model at the same effort fails one turn and succeeds the next.

Decisive screenshot: model footer **`Codex — gpt-5.5 · high`** (a *reasoning* model at *high* effort),
in native Copilot chat. One turn ("who are you") rendered **fragmentary/blank** — only Copilot's own
chrome ("Optimized tool selection" status + "GitHub Copilot" byline) over an empty body — while the
next turn was coherent and complete.

## 2. How the path works (so the failure modes are locatable)

`chatProvider.ts` (`provideLanguageModelChatResponse`) → `codexStream` (`codexClient.ts`) → `sseBlocks`
(byte stream → SSE blocks) → `parseSseBlock` + the reducers in `catalog.ts`. On a **normal** turn the
code relays every `response.output_text.delta` faithfully — **it does not drop text on a good turn.**
So a cutoff means what *arrives* is already truncated, and the bug was that **the code relayed the bad
ending silently**, leaving nothing to diagnose.

## 3. Root causes (ranked; verified by a 13-agent research + adversarial-verification pass)

| # | Cause | Likelihood | Fits the symptom |
|---|-------|-----------|------------------|
| **D3** | **No terminal-event guard.** During a long high-effort reasoning window the model emits no `output_text.delta`, so the `chatgpt.com/backend-api/codex` socket looks idle and an intermediary drops it **before** `response.completed/incomplete/failed`. The `for await` over `sseBlocks` just ends; `sawDelta=false`, `completed=''`, so the old fallback was falsy and the generator returned **yielding nothing** — no throw, no marker. | High | Best fit for *all* of it, incl. the **blank** "who are you" turn (a drop before the first delta → zero text → only Copilot chrome shows). Intermittency tracks reasoning duration. |
| **D1** | **`response.incomplete` swallowed silently.** It was handled identically to `response.completed`; `incomplete_details.reason` was discarded. A budget/content-filter cut looked like a mystery mid-sentence stop; a reasoning-only budget blowout yielded an empty turn. | High | Best fit for the "sometimes cut off" (mid-sentence) half. |
| 3 | **Bare `error` SSE frame swallowed.** Only `response.failed` was caught; a top-level `error` event after the 200 OK fell through every branch → silent short/empty reply. | Medium | An intermittent silent short reply that is neither a clean incomplete nor a socket drop. |
| 4 | **Mid-stream cancellation invisible.** `token.onCancellationRequested → abort()` → the catch did a bare `return` with **no log**. A superseded/regenerated agent turn is indistinguishable from a clean finish. | Medium | A "cut off" turn that looks like a normal end; previously untraceable. |
| D2 | **`max_output_tokens` omitted.** *Premise true, implied fix WRONG.* | — (refuted) | Cannot match an *intermittent* symptom — it is a steady per-request property. See §5. |

**Not the cause: SSE framing / multibyte / `\r\n`.** The adversarial code re-read confirmed `sseBlocks`
framing is correct for this stream; those were considered and ruled out.

## 4. The fix

All changes make a bad ending **visible** instead of silent, and were shaped by adversarial review to
**never destroy delivered content or false-alarm a good turn**.

- **`codexStream` (`src/codexClient.ts`) — terminal-state handling reworked.** Track `sawTerminal`.
  After the read loop:
  - Emit the completed-fallback text and **all assembled tool calls first** (unchanged good-turn behavior).
  - **D1:** if the terminal payload carried `incomplete_details.reason`, append a visible marker
    `_[Response truncated: <reason>]_` (covers both wire shapes: `response.incomplete`, and
    `response.completed` carrying `status/incomplete_details`).
  - **D3:** if **no** terminal frame arrived:
    - **Nothing delivered** (no text, no tool calls) → **throw** a diagnosable
      "stream ended before completion — connection dropped or timed out" error, so VS Code surfaces a
      real, retryable failure instead of a blank turn.
    - **Something delivered** → keep it and append a soft `_[Stream ended before completion …]_` marker;
      **never throw** (this is the key refinement — it preserves near-complete agent turns and does not
      false-alarm Copilot's retry when only the tail `response.completed` frame was lost).
  - **error frame:** a bare `error` event is captured and used as the thrown message on an empty drop.
- **`responsesIncompleteReason` (`src/catalog.ts`) — new pure helper.** Reads `incomplete_details.reason`
  off a terminal payload; `undefined` for a clean completion or a non-string. Unit-tested.
- **Cancellation log (`src/chatProvider.ts`).** The abort path now logs `[cancel] chat <id> aborted
  mid-stream` before returning, so cancellations stop being invisible.
- **D2 guard comment (`src/catalog.ts`).** A note at `buildCodexResponsesBody` records *why*
  `max_output_tokens` is deliberately omitted, so nobody "consistency-fixes" it later (see §5).

### Why cancel-safety holds
A user cancel aborts the fetch, so the pending `reader.read()` **rejects** and `sseBlocks` throws
**before** the post-loop guard is reached — the throw is caught at `chatProvider.ts` (now logged) and
the D3 guard cannot fire spuriously on cancel.

## 5. Deliberately NOT done — `max_output_tokens` (D2)

The Anthropic sibling body sends `max_tokens`; the Codex body sends none. This looks like an
inconsistency to fix. **It is not.** gpt-5.x / o-series reasoning models **reject** `max_output_tokens`
on the Responses API (400 "not permitted"), the real Codex CLI omits it, and omitting already grants the
**model-max** output budget. Adding a cap cannot fix truncation and **would break every gpt-5.5 turn**.
Length is governed by `reasoning.effort`, not an output cap. `codexModelCaps.maxOutput` is
picker-display metadata only. A comment now guards this.

## 6. Deferred (gated on evidence) — idle-timeout watchdog

If the failure is a silent **hang** (proxy holds the socket open but no bytes flow) rather than a hard
**drop**, the D3 guard never runs because the loop never ends, and VS Code imposes no timeout on a
provider stream → the turn would hang forever. The real Codex CLI survives via a
`stream_idle_timeout_ms ≈ 300s` + bounded sampling-request retries. An idle-timeout watchdog (race each
`reader.read()` against a generous timer) is the mirror of that, but it is the one **speculative
behavior change** with real regression risk (a too-tight threshold aborts a legitimately long reasoning
turn). **Deferred** until the user's logs show hangs (turns that never end) rather than drops (turns
that end empty). The new markers/errors + cancel log are designed so the next repro reveals which.

## 7. How the next real repro self-diagnoses

- **Thrown "stream ended before completion"** (turn errors, VS Code offers retry) → **D3** hard drop.
- **`_[Stream ended before completion …]_`** marker after partial text → **D3** tail-frame loss.
- **`_[Response truncated: max_output_tokens]_`** (or `content_filter`) → **D1** backend truncation.
- **`[cancel] … aborted mid-stream`** in the Wisp output channel → cause #4 (a supersede/stop), not a bug.
- **Nothing new + still blank** → the deferred **hang** case (§6) → graduate the watchdog to a fix.

## 8. Verification

- `npx tsc -p ./ --noEmit` — clean.
- `npm run compile` (extension + webview + vite) — clean.
- `npm test` — **244 passed** (was 237; +2 `responsesIncompleteReason`, +5 `codexStream` streaming-IO
  tests — the repo's first fetch-mocked stream tests: clean completion, empty drop → throw, partial +
  soft marker, tool-calls preserved on drop, and the D1 truncation marker).

*Not runtime-verified against the live ChatGPT/Codex OAuth backend* — that needs an F5 Extension
Development Host + a ChatGPT subscription on the user's machine. §7 is the runtime confirmation plan.

## 9. Method note

Root causes were ranked by a parallel research + synthesis + adversarial-verification workflow (13
agents, ~631k tokens): 4 researchers (Responses API semantics, Codex CLI reference, adversarial code
re-read, VS Code LM-provider limits) → synthesis → 8 skeptic verdicts (2 lenses × 4 candidate fixes).
The skeptics **refuted the naive "throw whenever no terminal frame"** version — it would suppress valid
tool calls and false-alarm good turns — which is why the shipped guard only throws on a truly-empty drop.

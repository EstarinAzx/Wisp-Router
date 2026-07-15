---
type: decision
project: wisp
updated: 2026-06-19
tags: [context, decisions]
---

# Codex in native chat (slice #14): visible + streaming, on real caps + vision

**Decision:** Surface Codex on VS Code's native chat / Ctrl+I picker, streaming text through the Responses
API. `keyed[codex] = codexAuth.isSignedIn()` advertises the row when signed in; a new **`codexStream`**
async-generator (`codexClient.ts`) yields `response.output_text.delta` text live into the chat surface,
reusing the pure **`parseSseBlock`** (extracted from the non-streaming reader — one SSE parser) and a
shared `codexResponsesRequest` helper. `chatProvider.ts` branches `provideLanguageModelChatResponse` on
`isCodexProvider`. New pure cores in `catalog.ts` (TDD, `npm test` **121/121**); F5 verified end-to-end.

**Four load-bearing sub-decisions:**
1. **Codex advertises `toolCalling: true` — reverses #14's own acceptance #3 ("advertise false").**
   VS Code **hard-filters the picker on `toolCalling`**: a model without it is invisible *everywhere*
   (Ask mode + Manage Models too, F5-confirmed; docs: "if the model doesn't support tool calling, it
   won't be shown in the model picker"). So #1 (appears in picker) and #3 (false) are mutually exclusive —
   the user chose visibility. Tools are **not forwarded yet** (`options.tools` ignored → model answers as
   text); real tool calling is **#15**. The honesty gap is bounded (degrades to text, no crash).
2. **The Codex `/responses` backend REQUIRES a non-empty `instructions`** (400 "Instructions are required").
   `buildCodexResponsesBody` now defaults `"You are a helpful coding assistant."` when no system turn —
   the native-chat path has none (VS Code's chat API has no System role; Inquire always supplies one, so it
   never hit this). `CodexResponsesBody.instructions` is now required, not optional.
3. **Assistant turns serialize as `output_text`** (user/system stay `input_text`) — the Responses API
   rejects the wrong content type on a replayed assistant message. Was `input_text` for all roles.
4. **`codexModelCaps` — real windows + vision — partially reopens the 2026-06-18 "drop the context guess
   table" door, scoped to Codex.** gpt-5.x family = **400K/32K**, o-series = **200K/100K**, `vision: true`.
   Justified: Codex has **no models.dev catalogKey and no `/models` route**, so the live-caps path that
   retired the table can't reach these ids — a small codex-only table is the *only* source of real numbers,
   and they're authoritative (models.dev/api.json via XETH-7), not guesses. **Vision corrects a mid-session
   error:** I first called Codex text-only (trusting Copilot's conservative `modalities` flag), but XETH-7's
   codexShim forwards `input_image` to the *same* backend → vision is real. Images now ride as `input_image`
   data-URIs (`buildCodexResponsesBody` + `toCodexMessages`).

**Why these aren't guesses:** the instructions-required, output_text, and 400-on-omit facts are the live
request contract (F5 + cross-checked against XETH-7 `codexShim.ts`); the caps numbers are models.dev data.

**Reversibility:** the streaming branch + caps function are additive (easy to drop). But the four sub-facts
are load-bearing contract, not preferences — don't "simplify" `instructions` back to omittable, assistant
back to `input_text`, or re-close the codex caps as the neutral default. The `toolCalling:true` advertise is
the one to revisit *with* #15 (once tools are forwarded it becomes fully honest). Reference: `XETH--7`
`codexShim.ts` (`convertContentBlocksToResponsesParts`, `input_image`, instructions handling). See [[gotchas]].

## Related

- [[decisions]] — index

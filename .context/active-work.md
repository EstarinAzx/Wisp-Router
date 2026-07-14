---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: 219c00f on `main` (PR #74 merged), pushed._

## Current focus
**TUI slice 5 landed.** #62 — **`/test <provider|alias>`** shipped as PR
[#74](https://github.com/EstarinAzx/Wisp-Router/pull/74): fires one canned prompt through the named
Provider or Routing-map Alias and streams the raw reply into a TUI box. Not a chat — no markdown,
no history; Esc aborts the request. All five acceptance criteria verified **live** against the real
`~/.wisp` (headless, through the production code path), plus a user screenshot of the rendered screen.

## State
- **Done this session (#62, PR #74, main @ 219c00f):**
  - core: `chatCompletionTextDelta` — OpenAI chat SSE is data-only blocks (`parseSseBlock` needs
    `event:` lines). Joined parse first (SSE multi-line payloads), per-line fallback recovers a
    CRLF-framed backend's unsplit mega-block; `message.content` covers pseudo-streamed completions.
  - core: `slash.ts` gained `test`; suite **352/352**.
  - tui: `test` mode — resolves via `resolveRoute(routing, PROVIDERS, '', name)` (**empty active id**
    = unknown names error, no silent Active fallback); alias pinned model beats remembered model
    (same rule as the Bridge); dispatch mirrors `bridgeServer.startProviderStream` (codexStream /
    anthropicStream / plain fetch on `<base>/chat/completions` + `sseBlocks`). Keyless rows send
    bare — backend's 401 is the loud real error. Esc = seq-guard bump + AbortController abort.
    Zero-yield stream = phase `error` ("no reply"), never a fake pass.
  - Review (cavecrew) found + fixed pre-merge: CRLF mega-block parsed to nothing; zero-yield stream
    rendered as done.
  - `streamTestReply` is **exported** from app.tsx — headless acceptance runs drive the production
    helper (scratchpad harness pattern; no TTY needed for the wiring).
  - Live acceptance: keyed (opencode-go/kimi), OAuth (anthropic/fable), alias→pinned model
    (temp alias, restored), signed-out codex → real error, keyless openai → verbatim 401,
    unknown name → refused. Evidence table on PR #74.
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
**Fan-out remaining: #63 / #65.** Suggested next: `/preset scope 63` (`wisp serve` — the critical
path: unblocks #64 `claude-wisp` launcher → #67 release). Re-read #63's body against decisions.md
first — its title's "extension host removed" wording is stale (the extension Bridge host STAYS;
#63 only adds a terminal host).

## Skills for next session
- /preset scope — entry gate for #63 (or #65).

## Open questions
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — all deliberate skips.
- `claude-wisp` **bin is not declared yet** — deferred to #64 (a bin pointing at a missing file
  breaks install linking).
- Cosmetic nit (unconfirmed cause): the /test box's **border title didn't render** in the user's
  screenshot (`/test — Anthropic · claude-fable-5` expected on the top edge). Other bordered
  screens show titles; maybe the em-dash/`·` or title width. Eyeball on the next TUI slice.
- Codex is currently **signed out** on this machine (tombstone from #61 testing) — sign in before
  any Codex-path live checks.

## Recent context
- Ticket shape: #58✅→#59✅→#60✅→#61✅→#62✅; fan-out #63/#65 open; #64 behind #63; #67 behind
  #64; backlog #68/#69.
- TUI dev run: `cd packages/tui; bun run dev` (real `~/.wisp`; set `WISP_HOME` to sandbox).
- /test error philosophy is settled — see decisions.md 2026-07-14 (/test explicit-target-only).

## Related
- [[overview]] — TUI command list + test count re-anchored
- [[stack]] — test count bumped
- [[decisions]] — 2026-07-14 /test explicit-target-only entry
- [[gotchas]]
- [[pick-up]]

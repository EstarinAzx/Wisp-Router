---
type: active-work
project: wisp
updated: 2026-07-14
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-14 by Fable 5 (auto)._
_At commit: 997e033 on `main` (PR #73 merged), pushed._

## Current focus
**TUI slice 4 landed.** #61 — **OAuth from the terminal** shipped as PR
[#73](https://github.com/EstarinAzx/Wisp-Router/pull/73): `/signin codex|anthropic` runs the real
browser OAuth flows from the TUI (tokens → `~/.wisp/auth.json`, extension picks them up live),
`/signout` writes the tombstone, `/effort` persists the shared low→max ladder, and `/providers`
now shows `signed in / signed out` on the OAuth rows. User verified all acceptance criteria
end to end, including sign-out + re-sign-in round-trips.

## State
- **Done this session (#61, PR #73, main @ 997e033):**
  - core: `codexAuth.ts` + `anthropicAuth.ts` **moved from packages/vscode into core** — they were
    already editor-free (injected `openExternal` + store slices); port = `Thenable`→`PromiseLike`,
    `./catalog` imports (barrel = cycle), codexAuth's local PKCE helpers deduped against catalog's
    byte-identical ones. Barrel-exported; extension imports from `@wisp/core`. Success page says
    "return to Wisp".
  - core: `slash.ts` palette + `signin` / `signout` / `effort`; suite **345/345**.
  - tui: `openExternal` via spawn (**`rundll32 url.dll,FileProtocolHandler` on win32** — `cmd /c
    start` would need `&`-escaping inside the OAuth query; `open`/`xdg-open` elsewhere; failed
    spawn REJECTS so sign-in fails fast); `signin-wait` screen with a seq guard (same race pattern
    as #60's model fetch); `oauth-pick` shared by signin/signout; `effort-pick` full ladder ('max'
    offered globally — send-time clamps fold it for Codex); `/key` on OAuth rows points at `/signin`.
  - Review (cavecrew) found + fixed: browser-spawn silent false → reject fast. Deliberate skip
    (`ponytail:` in app.tsx): Esc detaches the UI only — the loopback lives out its own 5-min
    timeout and a flow finished in the browser still lands tokens; cancel handle if it bites.
  - Probe-verified: Bun's `child_process` emits `'spawn'` (no hang on the await).
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
**Fan-out remaining: #62 / #63 / #65.** Suggested next: `/preset scope 62` (`/test` — one canned
prompt through a Provider or Alias; natural follow-on that proves the freshly signed-in OAuth
Providers actually answer from the terminal). #63 (`wisp serve`) is the critical path — it
unblocks #64 (`claude-wisp`) → #67 (release).

## Skills for next session
- /preset scope — entry gate for whichever fan-out ticket is picked.

## Open questions
- (carried) forced `tool_choice` + `temperature` not threaded on the OpenAI door; OpenAI-door
  Codex strict-tools limit; routing-map rename migration — all deliberate skips.
- `claude-wisp` **bin is not declared yet** — deferred to #64 (a bin pointing at a missing file
  breaks install linking).
- #63's title still says "extension host removed" — stale wording from before the #66
  amendment (the panel/extension Bridge host **stays**; `wisp serve` adds a terminal host).
  Re-read the body against decisions.md before scoping it.

## Recent context
- Ticket shape: #58✅→#59✅→#60✅→#61✅; fan-out #62/#63/#65 open; #64 behind #63; #67 behind
  #64; backlog #68/#69.
- TUI dev run: `cd packages/tui; bun run dev` (real `~/.wisp`; set `WISP_HOME` to sandbox).
- Active ≠ signed-in: sign-out clears credentials, never the Active Provider selection (matches
  the extension; see decisions.md 2026-07-14).

## Related
- [[overview]] — layout re-anchored: auth managers live in core now
- [[stack]] — test count bumped
- [[decisions]] — 2026-07-14 active-vs-signed-in entry
- [[flows]] — anthropicAuth citations re-pathed to packages/core
- [[pick-up]]

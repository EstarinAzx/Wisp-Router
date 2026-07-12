---
type: active-work
project: wisp
updated: 2026-07-13
tags: [context, active-work]
---

# Active Work

_Last updated: 2026-07-13 by Fable 5._
_On `main` at `bb4667f` (v1.4.3 released). No code this session — design funnel only._

## Current focus
**Bridge Anthropic door — route Claude Code through Wisp providers. PRD #43, slices #44–#47 published, none started.**
The Bridge grows a second front door speaking Anthropic's Messages protocol so Claude Code (pointed at it
via `ANTHROPIC_BASE_URL` + Bridge secret) sees Wisp providers in its own `/model` picker and runs coding
tasks through any of them — headline: Claude Code on the ChatGPT-subscription Codex provider.

## State
- **Done this session (design only, no code):**
  - Full `/preset init` funnel: grill → MVD → PRD → tickets. Decisions in [[decisions]] (2026-07-13 entry).
  - **PRD #43** published (`ready-for-agent`), embeds the golden path from [[happy-path]].
  - **Slices #44 → #47** published, linear chain: #44 gate (real Claude Code vs canned door — answers
    picker-filter + wire-shape unknowns) → #45 pure translator pair + Vitest → #46 door live end-to-end
    (Codex demo) → #47 side-panel copy-paste snippet section.
  - **#34 closed** as shipped (its six slices #35–#40 all landed earlier).
  - `CONTEXT.md` **Bridge** entry broadened: two dialects (OpenAI + Anthropic Messages), Active-Provider fallback.
  - Repo renamed **`EstarinAzx/Wisp-Router`** (old `Wisp` URLs redirect).
- **In flight:** nothing.
- **Blocked:** nothing.

## Pick up here
1. **Slice #44 (the gate)** — only unblocked ticket. Canned `/v1/models` (mixed plain + `claude-wisp-*` ids)
   + echo `/v1/messages` on the running Bridge; point a real Claude Code at it; record picker-filter verdict,
   auth header, system-array shape, tier model strings as an issue comment. `/preset scope 44`.
2. Older optional follow-ups (unchanged, lower priority): agent-mode vision flake (see Open questions),
   Bridge outbound image threading (`handleAnthropicChat` drops images), Copilot catalog-warning env vars.

## Skills for next session
- /preset pick-up — resume from the note.
- /preset scope 44 — enter the work loop on the gate slice.

## Open questions
- **Does Claude Code's `/model` picker filter non-`claude-*` ids from discovery?** Gate slice #44 answers;
  fallback plan (alias + inbound strip) already in PRD #43.
- **Agent-mode vision is intermittent — root cause NOT pinned (OPEN, pre-existing).** Plain/Ask mode reads
  images reliably; agent mode sometimes answers "attachment empty". To resolve: re-add the probe (incoming
  `images=` count + last-turn part kinds + `OUT` body shape in `chatProvider.ts`
  `provideLanguageModelChatResponse`), F5, reproduce a FAILURE, read the pair.

## Recent context
- **Active-Provider fallback already live on the Bridge** (prior session, verified against the real
  `@github/copilot` binary): unknown model names serve the active Provider instead of 404. The Anthropic
  door's routing rule reuses this exact behavior — no new routing machinery in #46.
- Claude Code gateway contract (verified 2026-07-13 from docs): `POST /v1/messages` must stream SSE;
  `GET /v1/models` only read when `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`; auth arrives as
  `x-api-key` (from `ANTHROPIC_API_KEY`) or `Bearer` (from `ANTHROPIC_AUTH_TOKEN`); env read at startup only;
  `count_tokens` optional (local estimate fallback).

## Related
- [[overview]]
- [[happy-path]] — both Bridge golden paths (Copilot door + Anthropic door)
- [[api]] — Bridge endpoints, `COPILOT_*` env, `wisp.bridge.secret` slot
- [[decisions]] — Bridge forks + 2026-07-13 Anthropic-door entry
- [[gotchas]] — PowerShell curl trap, F5 dup trap, new-terminal env trap, GUI-app-no-Bridge trap

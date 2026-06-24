---
type: pick-up
project: wisp
updated: 2026-06-24
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What just finished (this session — investigation only, NO code change)
- **Anthropic native-chat vision: confirmed working, no bug.** A user reported "inconsistent" image
  blindness. Added a temporary boundary probe in `chatProvider.ts`, watched the live output: every
  request carries the `image` block with real base64 bytes and Claude reads it (F5, real PNGs —
  single-turn, multi-turn, multi-image). The v1.4.1 fix (`7dfa8b0`) was already correct.
- **The "can't see image" cases were Copilot agent mode** — when the chat runs tools first (workspace
  search / MCP "AI Research Assistant"), the model answers off tool results and claims "empty" though
  the image is in context. Chat/model behavior, not a Wisp wire drop. Some early failures were also
  plain Copilot chat, not the Wisp provider.
- **Probe fully removed** — `git diff src/chatProvider.ts` is empty (== HEAD). 237 tests green, compile clean.
- **Uninstalled the stale local extension** `local.opencode-autocomplete@0.0.4` (the F5 dup trap; the
  real id, not the `local.wisp` earlier notes guessed — gotchas corrected).
- **Only `.context/` docs changed this session** (this update). v1.4.1 is fully shipped: pushed,
  released as Latest, `wisp-1.4.1.vsix` attached.

## Next task → nothing forced
No release pending — v1.4.1 already out and code is unchanged since. Optional follow-ups in
`active-work.md` (Bridge image follow-up, close PRD #34, Copilot catalog token-window warning).

## Landmines
- **Don't cut a 1.4.2 expecting a vision fix** — nothing functional changed; it'd be byte-identical to 1.4.1.
- **Before any F5:** uninstall the stale local extension (`code --list-extensions | grep -E 'wisp|opencode'`,
  then uninstall) and open a NEW terminal after Start. See [[gotchas]].
- `.context/flows.md` is untracked and **not mine** — leave it out of commits.

## Related
- [[active-work]] · [[overview]] · [[gotchas]]

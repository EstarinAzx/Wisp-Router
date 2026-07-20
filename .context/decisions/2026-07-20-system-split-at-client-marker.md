---
type: decision
project: wisp
date: 2026-07-20
tags: [context, decision]
---

# System split at the client's cache_control marker (#139)

**SHIPPED 2.0.25, live-verified (kill-shot: volatile change = read 9,385 / write 87; old shape read 0 / write 9,400+).**

## Decision

The Anthropic door splits the client's system text at the client's OWN `cache_control` marker: the last marked top-level system block ends the stable prefix; later blocks and every mid-conversation `role:system` turn are volatile. Seam shape: `parsed.system` stays the FULL join (every other backend arm untouched); optional `systemSplit { stable, volatile }` rides alongside, consumed only by the Anthropic arm, which sends stable as the marked system block and threads volatile through `anthropicStream` → `buildAnthropicMessagesBody({ systemSuffix })` as a final UNMARKED block after the breakpoint. No client marker → no split → byte-identical prior behavior. `anthropicCacheOutcome` gains the creation-shaped miss (`read=0 && creation≥4000 && turns≥3`).

## Why

Claude Code appends `<system-reminder>` blocks to `system` mid-session; the old fold (one joined block, marker at the joined end) re-billed the whole ~77k tools+system+history prefix as `cache_creation` on every append — the observed subscription-quota spikes. Native Claude Code keeps the marker on its stable block; matching that layout is the ceiling (a volatile change still re-bills message history behind it — prefix-cache physics, native pays the same). Rejected alternatives: preserving every block boundary (no stable/volatile signal without the marker anyway); making `system` stable-only + suffix field (silent-drop footgun for future non-Anthropic arms).

Partially supersedes [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]: breakpoints stay Wisp-placed, but inbound system-block `cache_control` is no longer ignored — it is read as the split boundary (still never forwarded verbatim).

## Reversibility

Easy — `systemSplit`/`systemSuffix` are optional fields; deleting them restores the fold. Don't: the quota spike returns.

## Related

- [[decisions]]
- [[2026-07-16-anthropic-cache-breakpoints-are-wisp-placed]]
- [[2026-07-18-anthropic-cache-ttl-is-fixed-per-path-not-turn-count]]

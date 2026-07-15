---
type: decision
project: wisp
updated: 2026-06-18
tags: [context, decisions]
---

# OpenCode Zen/Go split (rename id + add the real Zen)

**Decision:** The catalog row historically id'd `opencode-zen` actually targets `/zen/go/v1`, so
**rename its id to `opencode-go`** (label "OpenCode Go", kept as default `PROVIDERS[0]`; base URL +
`catalogKey: 'opencode-go'` unchanged → id now matches key) and **add a new `opencode-zen` row** for
the real `/zen/v1` (`catalogKey: 'opencode'`, shared `OPENCODE_API_KEY`, bare ids assumed pending a
build-time `GET /zen/v1/models` check). A second **one-time migration** moves the stored key +
remembered model from the old `opencode-zen` slot to `opencode-go`, and the legacy `wisp.apiKey`
shim is re-pointed at `opencode-go`. Planned as slice #12.

**Why:** the id was a misnomer driving the id↔catalogKey mismatch that `gotchas.md` warns about;
honest ids remove it. The stored key is provably a Go key (Wisp only ever talked to `/zen/go/v1`),
so the move is unambiguous and safe — the same reasoning that justified the 2026-06-15 legacy-key
shim. OpenCode Go stays the default because it is the proven endpoint and the new `/zen/v1` is
unverified.

**Reversibility:** easy (additive row + a pure migration planner) — but don't keep the misnamed id;
the rename is the point.

## Related

- [[decisions]] — index

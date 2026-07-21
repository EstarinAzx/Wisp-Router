---
type: pick-up
project: wisp
updated: 2026-07-21
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task (DONE + CLOSED + RELEASED): #156 — server-side cache diagnostics; the #148 umbrella arc is finished.**

- #152 probe proved the OAuth backend honors `cache-diagnosis-2026-04-07` (full
  captures breadcrumbed on #152). Adoption merged via PR #157 (631 tests green,
  5 new; compile + TUI typecheck clean; live-verified end to end — turn 2 chained
  turn 1's real message id, no 400/429). #156, #152, #148 all closed.
- **v2.0.30 released — workflow green (2m10s), binaries + npm published.**
  Decision recorded: [[2026-07-21-server-cache-diagnosis-adopted]].

**Next task: NONE queued — the queue is EMPTY.** Ask what's next (#69 backlog,
new spec, or a vscode-face release; the extension changelog does not mention
#156, only the TUI one does).

**Landmines:**

- `selectAnthropicBetas` gates are EXCLUSION lists; the diagnosis token rides
  LAST (trailing position is the probe-validated one) — don't re-sort.
- Server diagnosis null ≠ healthy (no compare target also reads null) — never
  let it suppress the heuristic; server reports nothing for the #145 PARTIAL shape.
- Diagnosis chain keys on model + FIRST user turn — leading system churn must
  not shift the key (tested).
- Refresh/sign-out must keep creds identity fields; `cc_entrypoint=cli` + UA
  `(external, cli)`; fingerprint hash UNVALIDATED.
- Live-check gotcha from this session: haiku's min cacheable prefix is 4096
  tokens — pad probe fillers well past it or creation=0 looks like a bug.

## Related

- [[active-work]]
- [[overview]]
- [[2026-07-21-server-cache-diagnosis-adopted]]

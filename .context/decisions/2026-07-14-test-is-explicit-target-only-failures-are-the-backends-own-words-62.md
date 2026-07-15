---
type: decision
project: wisp
updated: 2026-07-14
tags: [context, decisions]
---

# /test is explicit-target-only; failures are the backend's own words (#62 / PR #74)

**Decision:** `/test <provider|alias>` resolves through `resolveRoute` with an **empty active
provider id**, so an unknown name errors instead of inheriting the Bridge's Active-Provider
fallback — the wiring check never tests something the user didn't name. Failure surface is the
Provider's REAL error: keyless rows (local Ollama is legitimately keyless) send with no
Authorization header rather than being pre-gated, so the backend's own 401 status+body is what
prints; a stream that ends having yielded zero text is phase `error` ("no reply"), never a
silent pass. `streamTestReply` stays exported from app.tsx so acceptance can drive the
production helper headless.
**Why:** the check exists to prove wiring loudly — a silent fallback or a local pre-gate would
mask exactly the misconfiguration it hunts; local gating was rejected because keyless-valid
backends exist.
**Reversibility:** easy — call-site behavior only.

## Related

- [[decisions]] — index

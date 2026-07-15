---
type: decision
project: wisp
updated: 2026-07-14
tags: [context, decisions]
---

# Release delivery: one dispatcher binary, scoped platform packages, release-download fallback (#67)

**Decision:** the TUI ships as ONE `bun build --compile` binary per platform whose entry
dispatches on argv (`serve` / `claude-wisp` / else TUI) — the npm `claude-wisp` bin is a JS shim
invoking `wisp claude-wisp …`, not a second 100MB binary. Platform packages publish **scoped**
(`@tsd47216/wisp-router-<target>`) because npm's spam filter 403'd the batch of fresh unscoped
names — and after it then REMOVED the scoped ones minutes post-publish, the shim gained a
GitHub-release download fallback (`~/.wisp/bin/v<ver>/`): optionalDependency first, release asset
second. CI publishes platform packages best-effort, the thin shell hard-fails, and the GitHub
release is created before npm publish so the fallback target always exists. darwin-x64 builds on
`macos-15-intel` (macos-13 retired Dec 2025). Versions: 2.0.0 burned (npm forbids republish even
after unpublish; deprecated with pointer), 2.0.1 is the live first release.
**Why:** two compiled bins would double every package (~100MB each); unscoped names + fresh
account + CI-published big binaries is exactly npm's spam heuristic; a delivery that survives npm
takedowns beats one support ticket away from broken.
**Reversibility:** the npm names (`wisp-router`, `@tsd47216/*`) are public — one-way. The
fallback + dispatch shape: easy.

## Related

- [[decisions]] — index

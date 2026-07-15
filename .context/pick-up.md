---
type: pick-up
project: wisp
updated: 2026-07-15
tags: [context, pick-up]
---

# Pick up here

**Start:** read `.context/overview.md` + `.context/active-work.md` to rehydrate, then continue below.

## What this session finished
**Built + live-verified the whole Grok (xAI OAuth) provider — epic #91, slices #92–#97 merged to `main`.**
- `/loop /preset ticket-loop` (self-paced) walked the self-promoting chain #92→#97 in one session — PRs
  #99–#104, all squash-merged. Tests **387 → 431**; vscode + webview + TUI `tsc` clean throughout.
- **Live-verified** through `claude-wisp`: **grok-4.5** (public api.x.ai) AND **grok-build** (subscription
  proxy + `x-grok-*` headers) both stream real replies → the best-effort header values
  (`grok-cli`/`1.0.0`) are **confirmed working**. Recorded in
  [[decisions]] (2026-07-15 "Grok … SHIPPED + live-verified").

## Next task
**Finish the release — `wisp-router 2.0.5`. Human-gated (irreversible npm publish); the prep is done.**

Prep is in **PR #105** (branch `ticket/98-release-2.0.5`): version → 2.0.5, CHANGELOG, README 13 built-ins.

```
1. Merge PR #105  →  git tag v2.0.5 && git push --tags
2. gh run list --workflow release.yml   → wait for the v2.0.5 run to go GREEN
3. npm view wisp-router version         → expect 2.0.5
4. Close epic #91 (+ issue #98) on green.
```

## Landmines
- **npm publish is irreversible** — a burned `2.0.5` can never be republished. That's why the tag was left
  for a human; the live checks are already done, so it's safe to proceed.
- If the run/publish fails, **registry-probe before blaming CI**:
  `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`.
- **Rotate `NPM_TOKEN`** (repo secret) if it hasn't been.
- **Grok ≠ Groq** — Grok is `id:'xai'`; leave the `id:'groq'` row alone.
- (carried) grok-4.5 works on the public lane, but its **billing** (SuperGrok vs metered) is unverified.

## Related
- [[active-work]] · [[overview]] · [[decisions]] · [[gotchas]] · [[stack]]

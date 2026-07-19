---
type: pick-up
project: wisp
updated: 2026-07-19
tags: [context, pick-up]
---

# Pick up

Start: read `.context/overview.md` + `.context/active-work.md` to rehydrate the project.

**Last task (DONE, committed, not yet tagged):** Advisor mid-turn 400 + reviewer
echo — fixed and cut as `wisp-router@2.0.22` on `main` (`82d90e2` fix,
`2f0e61a` release). Live-verified on a real heavy session (no more
`"Found 5"` 400; reviewer returns real advice; continuation round-trips).
Details in [[2026-07-19-advisor-cache-control-mutation-and-reviewer-frame]].

**Next task:** tag + push the release.

```
git tag v2.0.22
git push origin main --tags
```

Then watch `release.yml` (tag must equal `packages/tui/package.json` = `2.0.22`).
After green: optional `npm i -g wisp-router@2.0.22` — **stop any running
`wisp.exe` first** or the npm unlink fails (file locked).

**If advisor / cache comes up again:**
- Mutation root: `buildAnthropicMessagesBody` in `packages/core/src/anthropic.ts`
  — always replay a *copy* of `rawContent`, never the caller's array. Regression
  in `anthropic.test.ts` ("does not mutate the caller rawContent…").
- Reviewer frame: `reviewerSystem` + `serializeForReview` in
  `bridgeAnthropic.ts`; door wiring in `bridgeServer.ts`. Don't forward
  `parsed.system` or raw turns to the reviewer.
- Landmine: don't remove #111 cache breakpoints; don't re-derive TTL from
  `convo.length` ([[anthropic-cache-ttl-flip-busts-the-prefix-mid-session]]).
- Binary trap: version banner can't tell installed vs source until the version
  bumps — confirm bind log + that the old exe is dead before live-testing.

## Related

- [[active-work]]
- [[overview]]
- [[2026-07-19-advisor-cache-control-mutation-and-reviewer-frame]]
- [[buildanthropicmessagesbody-must-not-mutate-caller-rawcontent]]

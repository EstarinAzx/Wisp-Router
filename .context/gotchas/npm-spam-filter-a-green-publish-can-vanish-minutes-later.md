---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# npm spam filter: a green publish can vanish minutes later

Observed on the #67 release (2026-07-14): `npm publish` printed `+ pkg@ver` (registry accepted it)
and the four `@tsd47216/wisp-router-*` platform packages **404'd minutes later** — npm's spam
system removes post-publish, silently (unscoped names had already been 403'd up front with
"Package name triggered spam detection"). So: after any publish of these, verify with
`curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@tsd47216%2fwisp-router-win32-x64`
— a green CI run proves nothing about what's still on the registry. The shim's GitHub-release
download fallback exists precisely for this; reinstatement needs an npm support ticket. Related:
a burned version number can NEVER be republished (2.0.0 is dead forever, even after unpublish).

## Related

- [[gotchas]] — index

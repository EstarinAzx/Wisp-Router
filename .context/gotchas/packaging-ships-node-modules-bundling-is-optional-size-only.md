---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Packaging ships node_modules — bundling is optional (size only)

**Empirically verified:** `vsce package` includes production `dependencies`, so `node_modules/openai` is inside the `.vsix` and the extension runs installed without esbuild/webpack. (The earlier claim that it "won't ship without bundling" was wrong.) Bundling remains worth doing later to shrink the package — the unbundled `.vsix` is ~1402 files / 2.33 MB and vsce warns about it — but it is not a correctness blocker.

## Related

- [[gotchas]] — index

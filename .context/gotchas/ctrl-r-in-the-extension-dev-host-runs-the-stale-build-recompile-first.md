---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# `Ctrl+R` in the Extension Dev Host runs the STALE build — recompile first (#46)

The extension runs the compiled bundle (`packages/vscode/dist/extension.js` since #58; `out/` before), not the TS
source. `Ctrl+R` (Reload Window) reloads the extension host against **whatever `dist/` already holds** — it does
NOT recompile. Only a full **stop → F5** re-runs the `compile: vscode` preLaunchTask. So after editing source, a
bare `Ctrl+R` silently tests the OLD code (cost two demo rounds — the identical error reappeared byte-for-byte).
Fix: run `bun run compile` in `packages/vscode` THEN `Ctrl+R`, or do a full stop+F5. The dup-panel trap makes
recompile+`Ctrl+R` the safer combo (no fresh F5). Note `tsc` alone no longer produces a runnable build — it's
typecheck-only since #58; the bundle comes from esbuild (`bun run bundle`).

## Related

- [[gotchas]] — index

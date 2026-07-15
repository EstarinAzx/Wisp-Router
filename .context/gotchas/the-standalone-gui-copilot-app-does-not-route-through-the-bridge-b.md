---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# The standalone GUI Copilot app does NOT route through the Bridge (#b)

The `COPILOT_*` vars are injected into VS Code **integrated terminals** only. The standalone GitHub Copilot
**desktop/GUI app** (launched from the Start menu) inherits no terminal env → it talks to GitHub, not the Bridge,
and its model picker shows GitHub's own catalog (Auto/Haiku/GPT-5 mini/…), never Wisp Providers. Drive the Bridge
with `copilot` in a terminal opened after Start. (An app launched *by a command typed in a Bridge-env terminal*
would inherit it; from the Start menu it won't.)

## Related

- [[gotchas]] — index

---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Testing the Bridge from PowerShell: `curl.exe` mangles inline JSON — use `Invoke-RestMethod`

PowerShell 5.1 strips the double-quotes out of an inline JSON body (`-d '{"model":"x"}'`) when forwarding it
to a native exe, so `curl.exe` receives non-JSON and the Bridge correctly answers `400 request body is not
valid JSON` (its degrade-to-400 path — **not** a listener bug). For Bridge F5 tests use the PS-native
`Invoke-RestMethod` (build the body with `ConvertTo-Json`), or a `-d "@body.json"` file body. Also: the OpenAI
`model` field is a **Provider id** (`opencode-go`), not a model name and not the bare `opencode` (bare
`opencode` → `404 unknown provider`); `GET /v1/models` lists the usable keyed ids. And `curl` (bare) is a
PowerShell alias for `Invoke-WebRequest` with different flags — always call `curl.exe` explicitly.

## Related

- [[gotchas]] — index

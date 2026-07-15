---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# Output-channel logs persist on disk — read them to debug a user's error

`OutputChannel` content is written to `%APPDATA%\Code\logs\<session>\window<n>\exthost\output_logging_<ts>\<n>-Wisp.log`. When the user can't surface the Output panel, glob the newest matching file and grep `[error]` instead of walking them through the UI. This is how the `401 … not supported` cause was found.

## Related

- [[gotchas]] — index

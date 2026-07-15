---
type: gotcha
project: wisp
updated: 2026-07-14
tags: [context, gotchas]
---

# A shared-credential Provider must set `keyId` or it's hidden from the chat picker

`buildChatModelInfos` only advertises **keyed** Providers (a keyless row would be a dead pick). So a new
row that shares another row's credential is **invisible** until it has its own key — even though the
credential already exists. **OpenCode Go + OpenCode Zen are one OpenCode account / one key, two endpoints**
(`/zen/go/v1` vs `/zen/v1`); the Zen row sets **`keyId: 'opencode-go'`** so it borrows Go's stored key via
`resolveKeyId`/`keySlotFor`. This also dictated the #12 migration: the zen→go move **deletes** the old
`opencode-zen` slot, because a Go key left in it would be inherited by the new `/zen/v1` row → 401. When
adding any Provider that shares an existing account's key, set `keyId` — don't make the user enter it twice.
See [[decisions]] 2026-06-18 Zen/Go-split-built entry.

## Related

- [[gotchas]] — index

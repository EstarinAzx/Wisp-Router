---
type: decision
project: wisp
updated: 2026-06-18
tags: [context, decisions]
---

# Zen/Go split built (slice #12); keyId shared-credential added

**Decision:** Shipped the split per the entry above. Renamed `opencode-zen` → **`opencode-go`** ("OpenCode
Go", default, id==catalogKey), added a new **`opencode-zen`** row at `/zen/v1` (`catalogKey: 'opencode'`,
`defaultModel: claude-haiku-4-5`). New pure cores in `catalog.ts` (TDD, `npm test` 73/73): `planZenToGoMigration`
(idempotent on go-slot-present; **moves** the old zen-slot key+model to the go slot and **clears** the zen
slot) and `resolveKeyId`. `migrateLegacyKey` re-pointed to the go slot; `migrateZenToGo` runs **before** it
on activate. `package.json` enum/default synced. **Live-verified** (`GET /zen/v1/models`, public): `/zen/v1`
serves **bare** ids and is the **premium** Claude/GPT/Gemini catalog (distinct from Go's budget set).

**Key addition not in the plan — `keyId` shared credential:** the new `opencode-zen` row sets
`keyId: 'opencode-go'`. OpenCode Go and Zen are **one OpenCode account / one key, two endpoints**, so Zen
**borrows Go's stored key** instead of demanding a second entry. Added pure `resolveKeyId` + a `keySlotFor`
that routes every key get/store/delete/display through the borrowed slot.
**Why:** F5 surfaced that the new keyless Zen row was **hidden** from the chat picker (`buildChatModelInfos`
hides keyless Providers by design). Without `keyId` it would stay invisible until re-keyed — wrong, since the
credential already exists in the go slot. This is also why the zen→go migration **deletes** the old zen slot:
a Go key left there would feed the new `/zen/v1` row → 401.
**Reversibility:** easy (`keyId` is an optional row field) — but don't drop it for the OpenCode rows; the
shared-credential model is the point. See [[gotchas]].

## Related

- [[decisions]] — index

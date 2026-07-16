---
type: decision
project: wisp
updated: 2026-07-16
tags: [context, decisions, refactor, executed]
---

# catalog.ts modularization — seam map + phased plan (4-file peel EXECUTED)

**Status:** the 4-file peel is **DONE** (2026-07-16, commits `4bb4e29` → `b8de90d` → `2980f07` →
`7e0de9b`). `packages/core/src/catalog.ts` **1293 → 486 lines**; `shared.ts` + `codex.ts` +
`anthropic.ts` + `xai.ts` extracted per the map below. catalog **re-exports** all four, so the
`@wisp/core` barrel surface is byte-identical — no sibling or face touched an import. Each provider
file depends only on `./shared` + `import type { Provider }` (type-only back-edge → runtime graph
`catalog → provider → shared`, acyclic). Green-to-green: 434 tests + core/tui/vscode `tsc` clean at
every leg; a runtime barrel smoke, `bun run dev`, and live sign-ins all pass. The remaining
**someday-9** split (providers/edit/chat/oauth/migration, then repoint siblings to per-concern
imports and drop the re-export facade) stays **deferred** — low payoff, "only if it earns it."

_Original plan below, kept for the record._
Nothing was broken: `packages/core/src/catalog.ts` was ~1,300 lines of **pure** data + functions,
fully covered by (then) 431 green tests. This was cohesion cleanup, not a bug fix.

**Plan:** split `catalog.ts` (today ~13 unrelated concerns in one file) into per-concern files,
keeping `index.ts` (the `@wisp/core` barrel) re-exporting everything flat — so **the faces change
zero imports**. Cut along **cohesion**, never by line count.

**Why now-ish:** low cohesion — the LCS `diffLines` algorithm sits next to Codex token refresh.
The tests already partition it (`catalog.test.ts` / `codex.test.ts` / `anthropic.test.ts` /
`xai.test.ts`); the source just doesn't match the tests yet. **Why not urgent:** it works, it's
tested, and the elucidate section banners already give an in-file table of contents — so the payoff
is modest (test↔source parity + per-concern imports), not "now I can find things."

## End-state file map (the someday 9)

Repo convention is camelCase (`homeStore.ts`, `codexClient.ts`). Pure cores named plainly, distinct
from the existing impure IO layer (`codexClient.ts`, `codexAuth.ts`, `xaiClient.ts`, …).

| File | Holds |
|---|---|
| `providers.ts` | `Provider` type, `CUSTOM_ID`, `PROVIDERS`, `resolveModel/BaseUrl/KeyId` |
| `edit.ts` | `stripThink`, Inquire prompt (`EDIT_SYSTEM_PROMPT`, `buildEditPrompt`), SEARCH/REPLACE blocks, `diffLines` |
| `chat.ts` | native-picker descriptors (`buildChatModelInfos`, vision), OpenAI tools + messages, `chatCompletionTextDelta` |
| `migration.ts` | `planLegacyMigration`, `planZenToGoMigration` |
| `codex.ts` | Codex creds, Responses request/reply, JWT introspection, `auth.json` import, model list + caps |
| `anthropic.ts` | Anthropic creds, attestation fingerprint, Messages request/reply, thinking/effort, model list + caps |
| `xai.ts` | Grok creds, Responses request, endpoint guards, `auth.json` import, model list + caps |
| `oauth.ts` | PKCE/state primitives — `base64url`, `codeVerifier`, `oauthState`, `codeChallenge` |
| `shared.ts` | **the kernel** — `ModelCaps` + models.dev helpers, effort ladder (`EffortLevel`/`CodexReasoning`/`standardEffortToCodex`), SSE (`SseEvent`/`parseSseBlock`), `ToolSpec`/`AssembledToolCall` |

`index.ts` (barrel) stays as-is.

## The two placement calls that decide clean-vs-tangle

- **`shared.ts` is the kernel — everything ≥2 provider files import.** Dependencies must flow one
  way (`codex`/`anthropic`/`xai` → `shared`), never sideways (no `anthropic.ts` importing
  `codex.ts`). Get this wrong → import cycles.
- **`oauthModelOptions`** dispatches to all three `*ModelsFrom` — it sits **above** the providers,
  not in the kernel. Lands in `providers.ts` or its own tiny dispatcher; putting it in `shared.ts`
  would invert the dependency.
- Quirk to carry: `anthropicTruncationReason` currently lives in catalog's "Codex Responses reply"
  section but is Anthropic's — move it to `anthropic.ts`.

## Do this first — the 4-file peel (not the full 9)

First move: extract only **`codex.ts` / `anthropic.ts` / `xai.ts` / `shared.ts`**; leave providers,
edit, chat, oauth, migration in a slimmed `catalog.ts`. ~half the file, the most clearly separable
half — ~80% of the benefit, ~40% of the risk. Split further only if it earns it.

**Method — green-to-green:** move ONE concern, run `bun run test` (431 must stay green), commit,
repeat. Never a big-bang move (40 red tests with no bisect). The barrel absorbs each move, so no
face touches an import.

## Related

- [[decisions]] — index
- [[overview]] · [[gotchas]]
- Related gotcha: [[unit-testable-logic-must-live-vscode-free-in-catalog-ts-not-in]] (the split keeps everything vscode-free)

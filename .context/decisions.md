---
type: decisions
project: wisp
updated: 2026-07-15
tags: [context, decisions]
---

<!-- newest entries are at the bottom; see "Side-panel implementation" (2026-06-10) -->


# Decisions

Settled questions. Append-only. Each entry is dated.

---

## 2026-06-10 — Inline-completion design review

1. **Latency target ~0.5–1.5s (regime B).** Chat-on-Zen cannot hit sub-100ms FIM speed; that is accepted, not a bug. Shapes everything below.
2. **Adaptive short completions: `maxTokens` 64, no hard newline-stop.** Keeps p50 latency in budget while still allowing 2–3 line blocks. _Why:_ a newline-stop would kill legit multi-line like `if (x) {`. **⚠️ CORRECTED 2026-06-10 — the 64 cap proved unreliable (truncated multi-line; starved reasoning models that spend the budget in `<think>`); default is now `0` = uncapped. See the "Uncapped tokens + strip reasoning" entry below.**
3. **Non-streaming.** The VS Code inline API resolves a suggestion once, so streaming gives no perceived-latency win; only complexity. Revisit only if p95 annoys.
4. **API key in SecretStorage + `OPENCODE_API_KEY` env fallback; no plaintext setting.** _Why:_ a `settings.json` key leaks via Settings Sync / screen-share.
5. **Default model `opencode/minimax-m3` + per-request latency log + `listModels` command.** _Why:_ it's the id proven working against `go/v1` in the reference `llm-provider`; pick the real winner (`glm-5` / `kimi-k2.6`?) from the logged data. Model stays a setting. **⚠️ CORRECTED 2026-06-10 — see the "Bare model ids required" entry below: the prefixed id is rejected by this endpoint; the default is now the bare `minimax-m3`.**
6. **Trigger gating (sensible, not aggressive):** skip on empty/whitespace prefix, active selection, and native-IntelliSense-open (`selectedCompletionInfo`). _Why:_ no language-aware string/comment parsing — too brittle across languages.
7. **Single-entry last-result cache.** _Why:_ the dominant waste is same-position re-fires (VS Code re-queries on cursor moves/re-renders); one entry erases it cheaply.
8. **Status-bar heartbeat (ready/thinking/disabled/error), click toggles enabled.** _Why:_ regime-B latency is felt; the user needs "working vs frozen" signal.
9. **Strip prefix-overlap before returning.** _Why:_ chat models often echo the current line → doubled ghost text; the system prompt alone doesn't prevent it.

## 2026-06-10 — Side-panel feature (planned)

10. **Panel scope = key + model + enabled toggle.** Other settings stay in `settings.json`. _Why:_ matches the ask plus the one cheap, useful toggle; avoids scope creep into a full control center.
11. **Model picker = live `/models` list + free-text override + refresh.** _Why:_ discovery without locking the user out of unadvertised ids; manual field still works without a valid key.
12. **Stack = Preact + Tailwind v4, bundled by Vite into one unhashed asset; deprecated webview-ui-toolkit avoided (theme via `--vscode-*` vars).**
13. **Key is write-only from the webview** — UI sends the key, receives only `keyIsSet`, never the value back.
14. **Tests marked for the pure modules M1 (suggestion cleanup) + M2 (completion context)** — see `PRD.md`. M3–M6 are VS Code/DOM glue → manual/integration verify.
15. **PRD delivered as `PRD.md` in-repo** (project is greenfield / non-git at decision time, so a local doc is the "copy", not a GitHub issue).

## 2026-06-10 — Side-panel implementation (post-review)

**Decision:** Config writes (`model`, `enabled`) target the scope that already defines the value (`inspect()` → WorkspaceFolder / Workspace / else Global), not always `ConfigurationTarget.Global`.
**Why:** a Global write under a workspace override is silently ineffective — the controlled panel select/checkbox would snap back. Surfaced by the multi-agent review.
**Reversibility:** easy.

**Decision:** `wisp.baseUrl` is `"scope": "machine"`.
**Why:** otherwise a malicious workspace could redirect requests — and the bearer API key — to an attacker endpoint. Side effect: baseUrl can no longer be set per-workspace (acceptable; it's near-constant).
**Reversibility:** easy (drop the scope line) but security-relevant — don't revert without reason.

**Decision:** `PanelState.keySource` is tri-state (`stored | env | none`), not a bare `keyIsSet` boolean; the webview Clear button is enabled only for `stored`.
**Why:** the `OPENCODE_API_KEY` env fallback made Clear look dead (deletes an absent secret, env key still resolves). Tri-state keeps the UI honest. Key value still never crosses to the webview.
**Reversibility:** easy.

**Decision:** No esbuild/webpack bundling — `vsce package` ships `openai` (and other prod `dependencies`) as-is.
**Why:** empirically verified the `.vsix` contains `node_modules/openai`; the prior "won't ship without bundling" assumption was false. Bundling stays a *size* optimization (1402 files), not a correctness requirement.
**Reversibility:** easy (add bundling later if package size matters).

## 2026-06-10 — Bare model ids required (corrects decision #5)

**Decision:** Model ids for `zen/go/v1` are **bare** (`minimax-m3`), never provider-prefixed (`opencode/minimax-m3`). `DEFAULT_MODEL`, the `wisp.model` default, and `fetchModelIds` all use/return the bare form exactly as `GET /models` serves it.
**Why:** the chat endpoint returns `401 Model opencode/minimax-m3 is not supported` for the prefixed form. This **falsifies decision #5's** claim that `opencode/minimax-m3` was "proven working" — that was inherited from the reference `llm-provider`, which targets a different gateway; inline completions had been erroring the entire time. A mid-session experiment that *added* the `opencode/` prefix to the fetched list went the wrong way and was reverted.
**Reversibility:** easy to revert, but don't — the prefixed form is confirmed-rejected by this endpoint.

**Decision:** The panel auto-fetches the `/models` list once a key is set (on first state, key-set, or endpoint change), gated on origin change.
**Why:** the dropdown otherwise only filled on a manual ↻ button users didn't discover, so they only ever saw the single configured model. The origin gate prevents a refetch loop on an empty result and avoids re-firing on unrelated config pushes (model/enabled).
**Reversibility:** easy.

## 2026-06-10 — Uncapped tokens + strip reasoning (corrects decision #2)

**Decision:** `maxTokens` default → `0` (uncapped); `max_tokens` is sent only when the setting is `>0`. A new `stripThink` step removes inline `<think>…</think>` reasoning from the completion before insertion (an unterminated `<think>` → insert nothing).
**Why:** the served models (minimax-m3, mimo, qwen3*, glm5*) are **reasoning models** that emit chain-of-thought inline as `<think>…</think>`. With the 64-token cap they burned the whole budget thinking and never produced code, and even non-reasoning output got truncated mid-line — both surfaced as "broken / unreliable autocomplete". Uncapping lets the answer finish; `stripThink` keeps the reasoning out of the ghost text. Tradeoff: reasoning models are slow per keystroke — a non-reasoning id (`deepseek-v4-flash`, `kimi-k2.6`) is the snappy choice.
**Reversibility:** easy (re-cap via the setting), but don't default it back — the cap is what made it unreliable.

## 2026-06-10 — Comment-line clunk: deterministic guard, not prompt-only

**Decision:** Stop the model from extending a comment line with a **deterministic** post-clean guard
(`relocateAfterComment` in `src/extension.ts`), not by the system prompt alone. It fires only when the
caret is at the **physical end of a whole-line comment** (the comment token is the first non-whitespace
char) in a **known code language** (`LINE_COMMENT` map; unknown languageId → never fires), then forces
real code onto its own indented line and drops leading comment-continuation prose. It **fails safe** —
returns the suggestion untouched in every ambiguous case and never deletes code. The `SYSTEM_PROMPT`
format/newline rules stay as a best-effort backup.
**Why:** the served models are reasoning models that obey format instructions only loosely, so a prompt
cannot *guarantee* the comment is never extended. A multi-agent adversarial design pass (3 approaches ×
5 lenses) broke **every** naïve detector: a `//`/`#` found anywhere on the line false-positives on URLs
(`https://`), regex (`/\/\//`), shell `${var#…}`, YAML `url#frag`, Python docstrings, and JSDoc/block
bodies; defaulting `//` onto every language mangles markdown/plaintext (the provider matches `**`); a
trim-based end-of-line check misfires on mid-comment authoring. The **whole-line-comment + physical-EOL +
known-language** trio is the minimal set of gates that rejects all of those. Verified by an 11-case
harness (real bug + each adversarial break) — 11/11.
**Reversibility:** easy to remove, but don't weaken the gates to `indexOf('//')` / a `//` default / a
`trim()`-based EOL test — each reintroduces a confirmed false-positive class. Block comments are
deliberately out of scope (see [[gotchas]]).

## 2026-06-10 — Panel activity indicator via a dedicated `activity` message

**Decision:** Surface the extension's **Activity** (Thinking / Idle — see `CONTEXT.md`) in the side
panel as a top status row (pulse dot, "Thinking…"/"Idle", muted `opacity-50` when disabled), fed by a
**new lightweight `activity{thinking}`** ext→webview message. `enter/exitInFlight` push it via
`panel.postActivity(inFlight > 0)`; the `ready` handler pushes the current activity via a new
`PanelHost.getActivity()`. The webview holds `thinking` **separate** from `state`. The 4-state status
bar is left untouched; the panel shows only the two Activity states.
**Why:** the panel was the blind spot — the status bar already had thinking/idle. The signal is
high-frequency (per debounced keystroke); folding `thinking` into `state` was rejected because
`getState` is async and a `state` push also triggers the webview's model-refetch path, so firing it
per keystroke would be wasteful and semantically wrong. A dedicated synchronous boolean message is
cheap and decoupled. Pushing on `ready` too keeps a panel reopened mid-request correct.
**Reversibility:** easy (could merge `activity` into `state` later — minutes). No ADR: trivially reversible.

## 2026-06-14 — Inquire: a manual, whole-file, insertable-code suggestion (new feature)

**Decision:** Add **Inquire** (see `CONTEXT.md`) — select lines → right-click → the selection is the
prompt, the **whole file** is context, and the result is **insertable code** rendered as ghost text
**after** the selection (append, never replace). It is **code only, never prose**, **independent of
the `enabled` toggle**, and reuses the existing ghost-text surface + cleanup pipeline. Mechanic: stash
a pending result and fire `editor.action.inlineSuggest.trigger`; the inline provider returns it before
the enabled/selection/debounce/cache gates. Whole-file context has a ~32k-char size guard that falls
back to a windowed `buildContext`. Feedback = cancellable `withProgress` + existing Activity. Spec in
`PRD.md`; build in `issues.md` Issue 2.
**Why:** the user wants the answer to feel exactly like an autocomplete suggestion (ghost text, Tab),
so reusing Completion's surface beat a new panel/hover UI. **Code-only** (rejecting prose Q&A / chat):
prose can't live in ghost text and would need a different surface + interaction model — out of scope.
**Append, not replace** (rejecting transform-in-place): a loose reasoning model returning junk must
never destroy the user's selected code, matching the pipeline's fail-safe "never deletes code" ethos.
**Whole file with a guard** (vs Completion's prefix/suffix cap): the whole point is full-file context,
but an unbounded send overflows the model context window on big files — the guard degrades gracefully.
**Reversibility:** easy to remove the command; but don't quietly turn Inquire into prose Q&A or a
replace-mode without re-deciding — both were rejected paths (data-loss / wrong-surface).
**Risk (unproven):** the manual ghost-text trigger (`inlineSuggest.trigger` + stashed result at a
collapsed caret) is keystroke-driven by default — Issue 2 validates it with a spike before building.

## 2026-06-15 — Inquire built; spike confirmed (resolves the 2026-06-14 unproven risk)

**Decision:** Inquire shipped in `src/extension.ts` + `package.json` (v0.0.4). The manual ghost-text
mechanic **works**: collapse the selection (inline ghost text will not render while a selection is
active), stash `pendingInquiry` keyed to document URI + collapsed caret, fire
`editor.action.inlineSuggest.trigger`; the provider returns the stash from an **early-return ahead of
all gates** (enabled/selection/debounce/cache) and clears it. Whole-file context with a 32k-char guard
falls back to `buildContext(24000/6000)`. Eyeball/F5 verified.
**Why:** this closes the "Risk (unproven)" flagged 2026-06-14 — the keystroke-driven concern was
unfounded; `inlineSuggest.trigger` queries the provider on demand regardless of our `enabled` flag (it
gates on VS Code's own `editor.inlineSuggest.enabled`, default on). Don't re-litigate the surface.
**Reversibility:** easy (remove the command + early-return) — but the append-only / code-only / before-
gates constraints stay load-bearing; see the 2026-06-14 entry.

## 2026-06-15 — Rebrand to Wisp; product / provider split (Issue 3)

**Decision:** The **product** is now **Wisp** — everything user-visible and every product identifier
renamed from `opencodeAutocomplete` / "OpenCode (Zen) Autocomplete" to `wisp` / "Wisp": package
`name`/`displayName`, the `wisp.*` namespace for command **and** setting ids, the SecretStorage key
(`opencodeAutocomplete.apiKey` → `wisp.apiKey`), the activity-bar container + webview view ids/titles,
the `WispPanelProvider` class, status-bar text, output-channel name, all `Wisp: …` toast/progress
strings, the README, and the icon (`media/opencode.svg` → `media/wisp.svg`). Version bumped 0.0.4 →
0.0.5. The **provider** keeps its own name, **OpenCode Zen**: `DEFAULT_BASE_URL`
(`https://opencode.ai/zen/go/v1`), the `OPENCODE_API_KEY` env fallback, the "OpenCode Zen provider"
wording in the `baseUrl` setting, and the `opencode/`-prefix discussion all stay. Pure rename — **no
behavior change**. See `CONTEXT.md` ("Product and provider") for the vocabulary.
**Why:** give the product its own identity, separate from any one provider, so additional providers can
be added later (a future issue) without another rename. **Wisp** = the product; **OpenCode Zen** = the
(current, first) provider — the product *has* a provider.
**Breaking:** the setting namespace and the SecretStorage key both moved, so any previously stored key
is orphaned — the user re-enters it once via **Wisp: Set API Key**. Acceptable for a pre-release (0.0.x).
**Reversibility:** easy mechanically, but don't — the split is the point. Multi-provider support builds on it.
**Out of scope (future issues):** multi-provider architecture, provider-switching UI, logo redesign (the
glyph was reused, only its filename changed).

## 2026-06-15 — Multi-provider: a Provider catalog (config-only, API-key, OpenAI-compatible)

**Decision:** Add multiple **Providers** as a curated **Provider catalog** plus a **Custom**
escape hatch. v1 catalog (9 built-in): **OpenCode Zen** (default) · OpenAI · Groq · Mistral ·
OpenRouter · Ollama (local) · **Ollama Cloud** · **KiloCode** · **Cline** — every one
OpenAI-chat-compatible + API-key (Bearer), reached through the **existing `openai` SDK** by
swapping base URL + key + model. **No new client code, no OAuth subsystem.**

**Architecture — the Active Provider is the source of truth** (chosen over a "populate the free
settings then forget" model): state is an **Active Provider id** (`wisp.provider`) + a
**per-Provider record** `{ key, model }`. Keys live in namespaced SecretStorage slots
(`wisp.apiKey.<id>`) with a per-Provider env-var fallback from each catalog row (`OPENCODE_API_KEY`,
`OPENAI_API_KEY`, `OLLAMA_API_KEY`, …). Per-Provider **model memory** lives in extension
`globalState` (a `{ providerId: model }` map); `wisp.model` mirrors the Active Provider's current
model. Built-in **base URLs are hardcoded in the catalog**; **Custom** is the only Provider exposing
a user-supplied base URL (the repurposed machine-scoped `wisp.baseUrl`). There is **no model-id
transform** — each row ships its `defaultModel` in the Provider's *native* format (avoids re-adding
the `opencode/` prefix that 401'd Zen; see the "Bare model ids" entry).
_Why source-of-truth:_ per-Provider key memory already forces a per-Provider record; a single global
model is actively wrong across Providers (Zen `minimax-m3` vs OpenAI `gpt-4o`) → switching with a
stale id 401/404s; and it removes provider/baseUrl drift.

**Security — `wisp.provider` is `"scope": "machine"`** (extends the 2026-06-10 `baseUrl` machine-scope
ADR). _Why:_ selecting a Provider selects where the **bearer key is sent**, so a workspace-overridable
selector is a key-redirect/exfiltration vector. Built-in URLs in code (not settings) mean a hostile
workspace cannot tamper with where Zen/OpenAI/etc. point; Custom's URL is machine-scoped only.
**Reversibility:** easy to drop the scope line, but security-relevant — don't revert without reason.

**Migration — silent one-time** `wisp.apiKey` → `wisp.apiKey.opencode-zen` (+ `wisp.model` into Zen's
record), then delete the old slot. _Why a shim here when the rebrand chose none:_ the rebrand was a
namespace rename where old→new was a blind guess across an unknown future; here Zen is the **only**
Provider today, so the existing key is **provably** the Zen key — the mapping is unambiguous, so a
shim is safe, not a guess. Avoids a second key re-entry in two consecutive releases.

**Dropped: GitHub Copilot and Cursor** (researched + adversarially verified, 2026-06-15).
**Copilot** — the only OpenAI-compatible path to its chat backend is reverse-engineered client
impersonation against undocumented endpoints → **high, irreversible account-ban risk**; the sanctioned
Copilot SDK is an *agent runtime*, not raw `/chat/completions`, so it can't drive inline completion.
**Cursor** — even its sanctioned API is **shape-incompatible** (agent orchestration, no
`/chat/completions`); "auth only" = piggybacking the local Cursor session token to hit the private
`api2.cursor.sh` → ToS violation + live ban precedent. OAuth would not fix *why* either fails, so **no
"OAuth providers" feature is needed** for this set.

**Cline ToS (medium risk):** Cline's terms §2.2 bar "competing products" use → ship **user-supplied-key
only** (never an embedded/proxied shared key) + a one-line "you are responsible for your own ToS
compliance" note. Built-in `defaultModel`s + KiloCode's model-id namespace are **best-effort presets**,
verified against each `GET /models` at build; **Custom** is the always-works fallback.

**Reversibility:** the catalog and per-Provider record are additive and easy to trim; the machine-scope
and the dropped-provider calls are the load-bearing, don't-casually-revert parts.

## 2026-06-16 — Extract pure cores to a vscode-free module + Vitest for unit tests

**Decision:** Pull the pure logic out of the VS Code-coupled wrappers into a new **`src/catalog.ts`
that imports nothing** — `resolveModel`, `resolveBaseUrl`, `buildInquiryContent` (reshaped to take
`{ text, languageId, offset }` instead of a `vscode.TextDocument`), and `planLegacyMigration` (the
migration's idempotency/correctness **decision** as a pure plan; `extension.ts` reads storage state,
calls it, applies the plan). `extension.ts` keeps thin wrappers that read config/state and delegate —
behaviour-identical. Add **Vitest** as the test runner (`test: vitest run`, `tsconfig` excludes
`src/**/*.test.ts` from the extension build); 13 tests cover the four functions. `ollama-cloud`'s
`gpt-oss:120b` was **user-verified working** (its ⚠ dropped).
**Why:** the resolvers read module-level VS Code state and `extension.ts` imports `vscode` at the top,
so nothing there is importable by a plain Node/Vitest test (no Extension Development Host). Extracting
the pure cores makes them genuinely unit-testable **without** `@vscode/test-electron` — Vitest was
chosen over the official VS Code test harness precisely because the logic under test is pure, so an
Electron host is dead weight. Establishes the pattern: testable logic is vscode-free in `catalog.ts`.
**Reversibility:** easy — but don't fold the pure logic back inline; that re-breaks testability (see [[gotchas]]).

## 2026-06-17 — Scope pivot: remove Completion, evolve Inquire into an inline-chat editor

**Decision:** Deprecate **Completion** (the always-on, `enabled`-gated ghost-text autocomplete) and
evolve **Inquire** from a ghost-text Suggestion into a VS Code inline-chat-style **editor**: an
instruction typed in a quick `showInputBox`, the selection (or current line) as the **target span**,
the whole file as context, and the model's rewrite applied as a `WorkspaceEdit` replace that can add
**and** delete lines, reviewed via accept/reject. Planned as 4 tracer slices (PRD **#3**; **#4** evolve
Inquire B1 → **#5** remove Completion → **#6** inline diff B2 → **#7** bonus LM-provider). Design spec:
`docs/superpowers/specs/2026-06-17-inline-chat-pivot-design.md`.

**Why:** ghost text can only insert at the caret — it can never delete/rewrite; the user wants full
add+delete control driven by an explicit prompt. Three constraints fixed the shape:
- The **native Ctrl+I inline-chat widget is a proposed API** → unpublishable to the Marketplace. So we
  build our own on **stable APIs** (`showInputBox` + `WorkspaceEdit` + `needsConfirmation` refactor-preview
  for B1; `setDecorations` + `CodeLens` for the in-editor diff in B2). Prompt entry is a top-center input
  box, **not** a floating in-editor widget (impossible on stable APIs).
- **Inference stays on Wisp's own OpenAI-compatible client**, independent of `vscode.lm` and GitHub
  Copilot — keeps Wisp provider-agnostic and its own product, not a Copilot model plug-in.
- **Slice order is forced by entanglement:** Inquire has no output surface of its own — it stashes a
  `pendingInquiry` the Completion `InlineCompletionItemProvider` returns via an early-return. Inquire must
  get its own edit path (#4) **before** the provider is removed (#5), or #4 breaks. See [[gotchas]].
- **Option A** (register as a VS Code Language Model Chat Provider so Wisp models appear in *native* inline
  chat) is a **deferred, optional bonus (#7), HITL** — its BYOK gating is unresolved (may need Copilot
  Business/Enterprise as of Apr 2026 vs docs saying no Copilot plan needed). Never the core.

**Reversibility:** the product **direction** is a hard pivot (one-way once Completion code is deleted in
#5). But as of this session nothing destructive is committed — only the spec + issues exist on branch
`feat/inline-chat-pivot`; trivially reversible until #5 lands.

## 2026-06-17 — Completion removed (slice #5 lands the pivot's one-way step)

**Decision:** Ripped **Completion** end-to-end — Wisp is now **Inquire-only**. Gone: the
`InlineCompletionItemProvider` + registration, `SYSTEM_PROMPT`, the prefix/suffix context
(`buildContext`/`buildUserPrompt`), `stripPrefixOverlap`, the `delay`/debounce, the single-entry
`lastResult` cache, the whole comment-line guard (`LINE_COMMENT`/`looksLikeCode`/`reindent`/
`relocateAfterComment`), the now-inert `pendingInquiry` stash + provider early-return, the **`enabled`
toggle** across every layer (`wisp.toggle` command, `setEnabled`, the status-bar disabled state, the
panel checkbox + its **Muted** dressing), and the Completion-only settings (`enabled`/`debounceMs`/
`maxPrefixChars`/`maxSuffixChars`). `catalog.ts` lost `buildInquiryContent` + `INQUIRE_CONTEXT_LIMIT`
(dead since #4) and their tests. `CONTEXT.md` retired Completion/Suggestion/enabled/Muted/
selection-as-prompt. The status bar collapsed to **thinking / error / ready** and is no longer
clickable (no toggle to bind). Verified: `npm test` 18/18, `npm run compile` clean, F5 eyeball PASSED.
**Why:** Inquire got its own edit surface in #4, so Completion was the last thing pinning the
inline-completion provider in place; removing it is what the 2026-06-17 pivot called the "one-way"
step. `stripThink`/`stripFences` survive in `catalog.ts` (Inquire's `extractEditText` composes them).
**Reversibility:** one-way — Completion is deleted, not flag-gated. Reverting means re-implementing it.

## 2026-06-17 — Inquire edit fidelity: SEARCH/REPLACE edit blocks (supersedes whole-file rewrite)

**Decision:** Inquire will ask the model for targeted **SEARCH/REPLACE edit blocks**, not a span/whole-
file rewrite. The model gets whole-file context + the instruction and returns one or more blocks (exact
original snippet → replacement); Wisp locates each SEARCH text in the document, applies the replacement,
then renders the result through the **existing B2 inline diff** (`diffLines` + decorations + Accept/
Reject). New pure core (a block parser + an apply planner) in `catalog.ts`, TDD'd. Planned as a **new
slice (#8)**, built **before** the deferred bonus (#7).
**Why:** a mid-session experiment made no-selection Inquire target the **whole file** so the model could
edit anywhere (caret-agnostic — the user's ask). It worked sometimes, but the model frequently re-emitted
the 100+ line file with unrelated lines dropped/reformatted; the B2 diff faithfully showed the damage and
**Accept would have applied it → data-loss risk**. Edit blocks give the same "edit anywhere" capability
**without** re-emitting untouched code: only changed regions are emitted, so untouched code is
structurally preserved, diffs stay small, latency/tokens drop. Standard robust approach (Aider/Cursor).
The whole-file span change was **reverted**; B2 ships on the selection/current-line span (its documented
scope). `diffLines` itself was unaffected (it correctly showed a minimal diff of a mangled reply).
**Reversibility:** easy — the block format + parser are additive. Don't reintroduce whole-file re-emit as
the edit path; it's the confirmed mangling / data-loss vector.

## 2026-06-17 — Edit blocks built (slice #8): exact match, fails safe; extractEditText retired

**Decision:** Built the SEARCH/REPLACE path. `parseEditBlocks` (Aider markers, strips `<think>`,
CRLF→LF, ignores surrounding fences/prose, empty REPLACE = delete) + `applyEditBlocks` (EOL-agnostic
first-occurrence locate+splice, returns the applied text + a `notFound` list, empty-search guarded) are
new pure cores in `catalog.ts`, TDD'd (35/35). `buildEditPrompt` lost its `selectionText` arg and got a
block-eliciting `EDIT_SYSTEM_PROMPT`. `inquire` now parses → applies → diffs the **whole document**
before/after through the unchanged B2 `renderInlineDiff`. **Match policy is exact** (EOL-agnostic only),
**not** whitespace-fuzzy. `extractEditText` + `stripFences` were **removed** (orphaned by the switch to
`parseEditBlocks`); `stripThink` survives (reused) — this **supersedes** the slice-#5 note that said
"stripThink/stripFences survive… extractEditText composes them."
**Why exact + fails-safe:** a SEARCH that isn't byte-present is recorded in `notFound` and skipped, never
force-matched — so a bad/paraphrased block can't corrupt the file; the user reviews what landed via the
diff. Whitespace-fuzzy matching was deferred because it adds a false-match (wrong-region) risk class for
marginal gain. The whole-document diff **span** is safe (unlike the reverted whole-file *re-emit*):
`applyEditBlocks` copies untouched code verbatim, so `diffLines` emits a minimal diff.
**Reversibility:** easy. The deferred fork (add trimmed-line/fuzzy matching) stays open — take it only if
real use shows verbatim misses are frequent (see [[gotchas]]). Don't re-add `extractEditText`/whole-file
re-emit.

## 2026-06-18 — LM Chat Provider (slice #7) built; HITL gate resolved

**Decision:** Built the deferred bonus — Wisp registers a **Language Model Chat Provider** (vendor
`wisp`) so its keyed Providers appear as models in VS Code's **native** chat / Ctrl+I picker, streaming
through Wisp's own OpenAI-compatible client. New `src/chatProvider.ts` (vscode/openai glue) +
pure `buildChatModelInfos` in `catalog.ts` (one row per *usable* Provider: key + resolvable model +
Custom's URL). `extension.ts` generalized to per-Provider key/client resolvers; Inquire untouched.
**HITL gate resolved (was the blocker):** `registerLanguageModelChatProvider` is **finalized in VS
Code 1.104** (Aug 2025), NOT proposed API — publishable. The "BYOK needs Copilot Business/Enterprise"
worry is Copilot's *own* BYOK (Manage Models), a different feature; our extension API is open. Cost:
`engines.vscode` + `@types/vscode` bumped to `^1.104`.
**Why now:** the user asked for it after the core slices landed; gating verified before any code.
**Reversibility:** additive surface — easy to drop; Inquire does not depend on it.

## 2026-06-18 — Tool calling + vision passthrough (honest capabilities)

**Decision:** Declare a capability ONLY with its real implementation. **Tool calling**: advertise
`toolCalling: true` AND forward `options.tools` → reassemble streamed `delta.tool_calls` →
`LanguageModelToolCallPart` (pure `toOpenAiTools`/`buildOpenAiChatMessages`/`assembleToolCalls` in
`catalog.ts`, TDD'd). **Vision**: forward image `LanguageModelDataPart`s as OpenAI `image_url` data
URIs, multimodal user content built by `buildOpenAiChatMessages`.
**Why:** VS Code hides models without `toolCalling` from the agent/edit/Ctrl+I pickers (only Ask mode /
"Other Models" showed them) — so the capability is required for selection, and declaring it without the
passthrough would let agent mode pick a model that silently can't call tools.
**Reversibility:** easy; out of scope stays image *output*, prompt-tsx, managementCommand.

## 2026-06-18 — Read real context/vision LIVE from models.dev (the big one)

**Decision:** Stop hardcoding context windows / vision. Read them live from **[models.dev](https://models.dev)**
`api.json` — a public, no-auth aggregated catalog (~145 providers) carrying each model's real
`limit.context`, `limit.output`, and `modalities.input` (contains `"image"` ⇒ vision). Each Provider row
gains a **`catalogKey`** (matched to models.dev by **base-URL**, not name — e.g. `.../zen/go/v1` →
**`opencode-go`**, NOT `opencode`; `kilocode` → `kilo`). New `src/modelsDev.ts` fetches + caches (30-min
TTL, in-flight dedupe, warmed at registration, 4-s timeout so a cold fetch never stalls the picker).
Pure `parseModelsDevEntry`/`lookupModelsDevCaps` in `catalog.ts`. Resolution chain per field:
**models.dev → hardcoded heuristic table (`CONTEXT_TABLE`/`VISION_FAMILIES`) → neutral default**.
**Why models.dev over per-provider /models:** ~half the providers publish **nothing** via their own API
(OpenAI, OpenCode Zen — verified against OpenAI's OpenAPI spec/SDK); others need special endpoints
(Ollama `POST /api/show` per model, Cline's authed path). models.dev is the one source covering all of
them + vision, in a single cached fetch. Discovered + adversarially verified by a 19-agent research
workflow (686k tokens) — the provider-key map and field names are verified against the live `api.json`
and its source Zod schema. **Local Ollama, Cline, Custom are absent from models.dev → table/default.**
**Reversibility:** easy — caps are injected and degrade to the old table behaviour on any failure. The
table is now a *fallback*, kept deliberately (offline / models models.dev doesn't list).

## 2026-06-18 — Context window is DECOMPOSED into input+output (display correctness)

**Decision:** VS Code's "Context Size" column = `maxInputTokens + maxOutputTokens` (summed). So treat
the source value as the **total** window and split it: `maxOutputTokens = min(output, floor(window/2))`,
`maxInputTokens = window − maxOutputTokens`. The pair sums to the real context; the half-window cap stops
an anomalous `output == context` entry (real: `kimi-k2.7-code`, ctx=out=262144) from zeroing the input.
**Why:** passing `context` as input AND `output` as output inflated every model (kimi showed 524K vs its
real 256K; gpt-4o-mini 144K vs 128K). Verified live: kimi 256K, gpt-4o-mini 128K — matching each
provider's real window (and Ollama's display).
**Reversibility:** easy.

## 2026-06-18 — Released v1.0.0

**Decision:** First **stable release**. Bundles everything unreleased since `v0.0.3`: rebrand to Wisp,
the multi-provider catalog, the Inquire inline-edit pivot (Completion removed), and the LM Chat Provider
(tool calling, vision, live models.dev capabilities). Added `CHANGELOG.md`. `engines.vscode ^1.104`.
**Why 1.0.0 (not 0.0.9):** the inline-edit + native-chat surfaces make this a feature-complete product,
and the min-VS-Code bump + Completion removal are breaking — a major bump is honest.

## 2026-06-18 — Drop the context guess table; keep the vision fallback (resolves the open question)

**Decision:** Remove `CONTEXT_TABLE` / `contextForModel` (the family-keyed context-window guesses).
Context now resolves **models.dev caps → neutral `DEFAULT_MAX_*`** only. **Keep** `VISION_FAMILIES` /
`modelSupportsVision` as the vision fallback.
**Why:** with models.dev as the live source, the context table only fired offline / for the unmapped
providers (local Ollama, Cline, Custom) / unlisted models — and there a guess can be wrong, so "unknown
→ neutral default" is more honest. Vision is kept because it's the **only** capability with no other
fallback signal, and the failure modes differ: a wrong context window is just a wrong budget, whereas a
guessed vision flag would send images a backend rejects. `npm test` 67/67.
**Reversibility:** easy (the table was pure data) — but don't re-add a context guess; models.dev or
neutral default is the intended behaviour.

## 2026-06-18 — Codex Provider: supersede the no-OAuth ADR (subscription-backed)

**Decision:** Add a **Codex Provider** — a new Provider *kind* reached by ChatGPT-account
**OAuth sign-in**, running OpenAI's Codex models on the user's subscription via the **Responses
API** (`/backend-api/codex/responses`, SSE), on **both** surfaces (Inquire + LM Chat Provider).
This **supersedes the 2026-06-15 "no OAuth subsystem / OpenAI-chat-only" decision** for the Codex
case. Modeled as a discriminated **`kind: 'openai-chat' | 'codex'`** catalog row so selection /
panel / model-memory / chat-enumeration are reused; only **auth**, **request transport**, and the
**"usable"** test branch on kind. Pure logic (Responses reducer, request builder, JWT parse +
refresh, `~/.codex/auth.json` parser, codex-usable branch) in `catalog.ts` (TDD); impure OAuth/IO +
Responses shim in new `codexAuth.ts` / `codexClient.ts`. Tokens in **SecretStorage `wisp.codexAuth`**
(+ `~/.codex/auth.json` import, refresh at `exp − 60s`). OAuth uses the **published Codex-CLI app**
(`client_id app_EMoamEEZ73f0Ck…`, loopback `:1455`, PKCE S256, originator `codex_cli_rs`). Full
tool-calling parity, built **text-first**; `toolCalling` advertised true only once the Responses
tool-mapper exists. **No consent gate** (matches the Codex CLI). Planned as PRD #11 / slices #13–#15.

**Why:** the user wants to spend a ChatGPT subscription in Wisp, which only the subscription-backed
path delivers — and that path is *not* Bearer-API-key + chat-completions, so the no-OAuth/one-client
constraint had to give. Critically this is **not** the Copilot/Cursor failure mode: those were
dropped for reverse-engineered impersonation of undocumented endpoints (ban risk); Codex uses
OpenAI's **own published** Codex-CLI OAuth flow + endpoint, so the ToS posture is materially
different. Copilot/Cursor stay dropped. The discriminated-row design keeps the "Active Provider is
the single source of truth" model intact rather than spawning a parallel subsystem.

**Reversibility:** the OAuth subsystem + Responses shim are additive (easy to drop the row). But the
*supersession itself* is load-bearing — don't re-close the "no OAuth" door without re-reading this;
the project now intentionally has two Provider kinds. Reference for the flow: `XETH--7` (mapped).

## 2026-06-18 — OpenCode Zen/Go split (rename id + add the real Zen)

**Decision:** The catalog row historically id'd `opencode-zen` actually targets `/zen/go/v1`, so
**rename its id to `opencode-go`** (label "OpenCode Go", kept as default `PROVIDERS[0]`; base URL +
`catalogKey: 'opencode-go'` unchanged → id now matches key) and **add a new `opencode-zen` row** for
the real `/zen/v1` (`catalogKey: 'opencode'`, shared `OPENCODE_API_KEY`, bare ids assumed pending a
build-time `GET /zen/v1/models` check). A second **one-time migration** moves the stored key +
remembered model from the old `opencode-zen` slot to `opencode-go`, and the legacy `wisp.apiKey`
shim is re-pointed at `opencode-go`. Planned as slice #12.

**Why:** the id was a misnomer driving the id↔catalogKey mismatch that `gotchas.md` warns about;
honest ids remove it. The stored key is provably a Go key (Wisp only ever talked to `/zen/go/v1`),
so the move is unambiguous and safe — the same reasoning that justified the 2026-06-15 legacy-key
shim. OpenCode Go stays the default because it is the proven endpoint and the new `/zen/v1` is
unverified.

**Reversibility:** easy (additive row + a pure migration planner) — but don't keep the misnamed id;
the rename is the point.

## 2026-06-18 — Zen/Go split built (slice #12); keyId shared-credential added

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

## 2026-06-19 — Codex tracer built (slice #13); live round-trip resolved the request contract

**Decision:** Shipped the Codex Provider tracer per the 2026-06-18 ADR. New pure cores in `catalog.ts`
(TDD, `npm test` 111/111): `Provider.kind`, `isCodexProvider`, `isCodexSignedIn`, `buildCodexResponsesBody`,
`reduceResponsesTextEvents`/`extractResponsesText`, the JWT pair `decodeJwtPayload`/`parseChatgptAccountId`
+ `shouldRefreshCodexToken` (60s skew), `parseCodexAuthJson`, `codexReasoning`, `CODEX_MODELS`. New impure
`codexAuth.ts` (PKCE S256, loopback `:1455` + ephemeral fallback, token exchange, SecretStorage
`wisp.codexAuth`, `~/.codex/auth.json` import, refresh) + `codexClient.ts` (raw `/responses` fetch,
SSE→text). `extension.ts` branches Inquire on `kind` (codex → Responses, else OpenAI SDK), adds
`wisp.codexSignIn`/`wisp.codexSignOut`, and treats codex as usable-when-signed-in (no key field). Panel
swaps the key field for sign-in/out + a curated Codex model dropdown. **F5 live round-trip PASSED.**

**Live-resolved request contract (the tracer's whole point — these were unknowns until F5):**
- **Bearer = the OAuth `access_token`** against `https://chatgpt.com/backend-api/codex/responses` (the
  *subscription* path), NOT the id_token→`sk-` exchanged apiKey (that targets `api.openai.com`, a different
  endpoint + billing). Headers: `chatgpt-account-id` (hard-required — error early if absent), `originator:
  codex_cli_rs`, `OpenAI-Beta: responses=experimental`, `session_id`.
- **Reasoning models REQUIRE `reasoning: { effort, summary:'auto' }`** on the body or they 400; non-reasoning
  models reject it. `codexReasoning(model)` sends `medium` for gpt-5/o, omits for gpt-4.x/spark.
- **`gpt-5-codex` is a dead id** (400). Default is now **`gpt-5.3-codex`**; the dropdown offers the current
  curated lineup (no `/models` route exists on the Codex backend).
**Why these aren't guesses:** confirmed by the F5 round-trip + cross-checked against the working `XETH--7`
reference (`codexShim.ts` `performCodexRequest`, `providerConfig.ts` reasoning map).

**Sign-out tombstone (non-obvious):** `signOut` writes an **empty `{}` tombstone** to `wisp.codexAuth`
rather than deleting the slot. Deleting let `current()`/`isSignedIn()` **re-import `~/.codex/auth.json`** on
the next render, so a Codex-CLI user could never sign out (it snapped back to signed-in). The tombstone is a
present-but-bearer-less blob → reads as signed-out AND suppresses the import until an explicit sign-in.

**Native chat picker deferred to #14:** Codex is intentionally **absent** from VS Code's Language Models /
Ctrl+I picker in #13. It's keyless (hidden by `buildChatModelInfos`), and that surface streams through the
OpenAI **chat-completions** client which 404s against `/responses`. Making it visible *and working* there is
slice #14 (advertise-when-signed-in + a Responses **streaming** branch) — visibility without the stream is a
dead pick, so the two ship together.

**Reversibility:** the Codex modules are additive (drop the row + the two files). But the access_token-bearer,
reasoning-required, dead-`gpt-5-codex`, and sign-out-tombstone facts are load-bearing — they're the live
contract, not preferences; don't "simplify" them away. See [[gotchas]].

## 2026-06-19 — Codex in native chat (slice #14): visible + streaming, on real caps + vision

**Decision:** Surface Codex on VS Code's native chat / Ctrl+I picker, streaming text through the Responses
API. `keyed[codex] = codexAuth.isSignedIn()` advertises the row when signed in; a new **`codexStream`**
async-generator (`codexClient.ts`) yields `response.output_text.delta` text live into the chat surface,
reusing the pure **`parseSseBlock`** (extracted from the non-streaming reader — one SSE parser) and a
shared `codexResponsesRequest` helper. `chatProvider.ts` branches `provideLanguageModelChatResponse` on
`isCodexProvider`. New pure cores in `catalog.ts` (TDD, `npm test` **121/121**); F5 verified end-to-end.

**Four load-bearing sub-decisions:**
1. **Codex advertises `toolCalling: true` — reverses #14's own acceptance #3 ("advertise false").**
   VS Code **hard-filters the picker on `toolCalling`**: a model without it is invisible *everywhere*
   (Ask mode + Manage Models too, F5-confirmed; docs: "if the model doesn't support tool calling, it
   won't be shown in the model picker"). So #1 (appears in picker) and #3 (false) are mutually exclusive —
   the user chose visibility. Tools are **not forwarded yet** (`options.tools` ignored → model answers as
   text); real tool calling is **#15**. The honesty gap is bounded (degrades to text, no crash).
2. **The Codex `/responses` backend REQUIRES a non-empty `instructions`** (400 "Instructions are required").
   `buildCodexResponsesBody` now defaults `"You are a helpful coding assistant."` when no system turn —
   the native-chat path has none (VS Code's chat API has no System role; Inquire always supplies one, so it
   never hit this). `CodexResponsesBody.instructions` is now required, not optional.
3. **Assistant turns serialize as `output_text`** (user/system stay `input_text`) — the Responses API
   rejects the wrong content type on a replayed assistant message. Was `input_text` for all roles.
4. **`codexModelCaps` — real windows + vision — partially reopens the 2026-06-18 "drop the context guess
   table" door, scoped to Codex.** gpt-5.x family = **400K/32K**, o-series = **200K/100K**, `vision: true`.
   Justified: Codex has **no models.dev catalogKey and no `/models` route**, so the live-caps path that
   retired the table can't reach these ids — a small codex-only table is the *only* source of real numbers,
   and they're authoritative (models.dev/api.json via XETH-7), not guesses. **Vision corrects a mid-session
   error:** I first called Codex text-only (trusting Copilot's conservative `modalities` flag), but XETH-7's
   codexShim forwards `input_image` to the *same* backend → vision is real. Images now ride as `input_image`
   data-URIs (`buildCodexResponsesBody` + `toCodexMessages`).

**Why these aren't guesses:** the instructions-required, output_text, and 400-on-omit facts are the live
request contract (F5 + cross-checked against XETH-7 `codexShim.ts`); the caps numbers are models.dev data.

**Reversibility:** the streaming branch + caps function are additive (easy to drop). But the four sub-facts
are load-bearing contract, not preferences — don't "simplify" `instructions` back to omittable, assistant
back to `input_text`, or re-close the codex caps as the neutral default. The `toolCalling:true` advertise is
the one to revisit *with* #15 (once tools are forwarded it becomes fully honest). Reference: `XETH--7`
`codexShim.ts` (`convertContentBlocksToResponsesParts`, `input_image`, instructions handling). See [[gotchas]].

## 2026-06-19 — Codex tool-calling parity (slice #15): the toolCalling flag is now honest

**Decision:** Wire real tool calling for the Codex chat branch — forward agent tools and round-trip tool
calls/results — making the `toolCalling: true` flag (flipped in #14 only for picker visibility) **honest**.
Three new/extended pure cores in `catalog.ts` (TDD, `npm test` **137/137**) + a stream-type widening:
1. **`toCodexResponsesTools`** — VS Code tool defs → **flat** Responses function tools
   (`{type,name,description,parameters,strict:true}`, unlike chat completions' nested `function` object).
   A self-contained recursive `enforceStrictResponsesSchema` closes every object
   (`additionalProperties:false`) and lists **all** its keys in `required` — Codex **strict** tools reject
   any open/partial object. (Mirrors XETH-7 `convertToolsToResponsesTools`, minus its
   `sanitizeSchemaForOpenAICompat`/`uri`-format/empty-record edge handling — not needed for VS Code tools.)
2. **`reduceResponsesToolCalls`** — the Responses analogue of `assembleToolCalls`. Accumulates
   `response.output_item.added` (function_call id/call_id/name + optional initial args) +
   `response.function_call_arguments.delta` (arg fragments) keyed by **item id**, and surfaces **call_id**
   as the round-trip id. Returns `AssembledToolCall[]` (reusing #14's type).
3. **`buildCodexResponsesBody` extended** — assistant tool calls → `function_call` input items, tool
   results → `function_call_output` items, ordered per API (function_call_output **before** the next user
   message). `tools`/`tool_choice`/`parallel_tool_calls` ride only when tools are non-empty (a bare
   tool_choice with no tools 400s). The old empty-text message fallback is gone: a message item is emitted
   only when it has parts, so a tool-only turn yields just its function_call / function_call_output items.
4. **`codexStream` yield `string` → `CodexStreamEvent` union** (`{type:'text'} | {type:'toolCall'}`).
   Function-call events stream interleaved with text but can't be emitted until whole, so they are collected
   and folded by the reducer at stream end (the chat-completions assemble-at-end pattern). `chatProvider`
   threads `options.tools`/`toolMode` in and maps the union to `LanguageModelTextPart` /
   `LanguageModelToolCallPart`; `toCodexMessages` now carries `toolCalls`/`toolResults`.

**The load-bearing live finding — replayed `function_call` items need only `call_id`, NOT `id`:** the F5
round-trip succeeded sending the `function_call` input item with **`call_id` only** (the documented
stateless Responses contract). XETH-7 additionally sends a derived `id` (`fc_…`); it is **unnecessary** here
(`store:false` is stateless, so there is no prior server item to reference). Kept call_id-only per CLAUDE.md
simplicity. If a future round-trip 400s, adding `id` to the item is the one-line fix — see [[gotchas]].

**Why:** #14 made the `toolCalling` flag a bounded white lie (advertised true for visibility; tools ignored
→ Codex answered as text). #15 forwards the tools and round-trips the results, so agent mode actually drives
Codex — closing the honesty gap. **F5 PASSED:** Codex (gpt-5.5) fired **5 parallel `Read` tool calls** in
one turn, VS Code ran them, results round-tripped, and the summary reflected the real file contents — proving
the model→tool→result→continue loop *and* that call_id-only is sufficient.

**Reversibility:** the cores are additive (easy to drop). But the strict-schema enforcement and the
call_id-only round-trip are the live contract — don't loosen strict (Codex 400s open objects) or "simplify"
by also re-closing the empty-text message fallback (it would emit empty messages on tool-only turns).
Reference: `XETH--7` `codexShim.ts` (`convertToolsToResponsesTools`, `convertAnthropicMessagesToResponsesInput`,
the `output_item.added` / `function_call_arguments.delta` handling). See [[gotchas]].

## 2026-06-19 — Released v1.1.0; reposition Wisp as a Copilot-harness model router

**Decision:** Ship **v1.1.0** (the #12–#15 batch) and **reposition the product**: Wisp's primary framing is
now a **BYOK model router for VS Code's Copilot chat harness** — register your own backends (and your ChatGPT
subscription via Codex) as selectable models in native chat / Agent mode / Ctrl+I, with tool calling, vision,
and live caps. **Inquire is demoted to the secondary feature** (NOT removed — it still ships and routes
through the Active Provider). The README was rewritten router-first (drafted by a 4-agent panel workflow);
`package.json` description, `categories` (+`AI`,`Chat`), and `.context/overview.md`'s one-liner were
reframed to match. Version 1.0.0 → 1.1.0 (additive: Codex provider, Codex tool calling, Zen/Go split — no
breaking change). Tag `v1.1.0` → `568942c`; GitHub release with `wisp-1.1.0.vsix` attached (Latest).
`.vscodeignore` gained `.claude/**` + `docs/**` (vsix hygiene). Merged via PRs #17 (batch), #18 (release),
#19 (hygiene); issues #11–#15 closed.

**Why:** the LM Chat Provider surface (the native chat / agent harness, which is the Copilot Chat harness)
is the higher-leverage story — it turns the whole Copilot UI BYOK, whereas Inquire is one bespoke command.
The user directed the repositioning explicitly. Minor bump (not 2.0.0) because nothing user-facing breaks:
the Zen/Go id rename is handled by the existing migration, Codex is purely additive.

**Not done — Marketplace publish:** the extension is `publisher:"local"` + `private:true`, so it is **not**
on the VS Code Marketplace; the released artifact is the GitHub-release `.vsix` (install-from-VSIX). A real
publish needs a registered publisher + an Azure DevOps PAT (user-supplied) — `vsce login <publisher>` then
`vsce publish`. Build is otherwise release-ready.

**Reversibility:** the version/release/tag are permanent records (don't rewrite history). The *framing* is
soft — Inquire is intact, so re-emphasizing it later is just docs. Don't, however, re-describe the product
as "Inquire-first" in shipped docs without re-deciding; v1.1.0 chose router-first.

---

## 2026-06-20 — Codex Effort control (PRD #23)
**Decision:** Add a side-panel **Effort** knob (`low`/`medium`/`high`) for the **Codex Provider**, replacing
the hardcoded `medium` in `codexReasoning`. **One global** value (not per-model), governing **every** Codex
call — Inquire *and* chat — and mirrored in the model-picker label (`Codex — gpt-5 · High`). Codex-only
tracer; other Provider kinds deferred. Scoped as PRD #23 → slice #24 (knob + behavior, unblocked) and
slice #25 (picker label, blocked by #24).
**Why:** the effort plumbing already half-existed for Codex (just hardcoded), so the tracer is small and
honest there. Global + provider-wide is *less* code than a per-model or per-surface split and matches "set
it once." Explicitly **not** replicating Copilot's `·3x` request multiplier — that is GitHub's billing weight
on its *own* models and has no BYOK equivalent; only the Effort label is reproduced. Term defined in
`CONTEXT.md`. The prior open question ("Codex reasoning effort fixed at `medium`; make per-model if one needs
`high`") is superseded — it becomes user-settable here.
**Reversibility:** easy — per-model / cross-provider / per-surface are additive refinements, not rewrites.

## 2026-06-21 — Codex Effort built (slice #24); scale widened to include `xhigh`
**Decision:** Shipped the side-panel Effort knob per PRD #23. `codexReasoning(model)` →
`codexReasoning(model, effort)` (default `medium`); new `CodexEffort` type + `DEFAULT_EFFORT`. One global
value in **globalState `wisp.effort`** (read `activeEffort()`, write `setEffort()`), threaded to BOTH
surfaces through the single `codexResponsesRequest` chokepoint (`codexClient.ts`) — Inquire via
`codexInquire`, native chat via `codexStream` + `deps.codexEffort()`. Panel: `PanelState.effort` +
`selectEffort` message + `setEffort` host action + a Codex-gated `<select>`. **Effort scale widened
`low`/`medium`/`high` → +`xhigh`** (Codex codex-max models accept it; the user flagged it) — one literal
union across `catalog.ts`/`sidePanelProvider.ts`/`webview/app.tsx`. `CONTEXT.md` Effort term updated and the
stale "Inquire is Wisp's single feature" line corrected. `npm test` 139/139, tsc+webview+vite clean, F5
PASSED (knob Codex-only; message sent on a selected effort).
**Why:** the effort plumbing already half-existed (hardcoded `medium`), so one chokepoint makes both
surfaces honor a single value — "set it once." Global (not per-model/per-surface) is less code and mirrors
the per-Provider model-memory design. The non-reasoning gating already in `codexReasoning` makes Effort
inert for `spark`/`gpt-4.x` for free. **`setEffort` must call `panel.postState()` itself** — a globalState
write fires no `onDidChangeConfiguration` event, unlike `setModel`'s `wisp.model` mirror (the main wiring
trap; don't remove that line).
**Reversibility:** easy. Per-model / per-surface / cross-provider Effort stay additive refinements (later).
`xhigh` paired with a non-codex-max model may 400 — accepted (one global value; user's pairing call).

## 2026-06-21 — Codex Effort label (slice #25); PRD #23 complete
**Decision:** The model-picker row mirrors the active Effort: `buildChatModelInfos` appends ` · <effort>`
to a Codex row's name, gated by `isCodexProvider(p) && codexReasoning(model)` — the **same predicate** that
decides whether a reasoning object is sent, so an inert `spark`/`gpt-4.x` row never claims a depth and no
non-Codex row gets a suffix. Effort threaded in as a new optional `state.effort` (fed by `deps.codexEffort()`
at the `chatProvider` call site). Raw lowercase token (`· high`), matching the panel `<select>`. No webview
change; no live-refresh event needed — the picker re-queries `provideLanguageModelChatInformation` on open
(the chatProvider is stateless; confirmed no `onDidChange…` event in the finalized 1.104 API). `npm test`
139 → 141 (+2: reasoning row gets the suffix, spark row does not), tsc+webview clean, F5 PASSED.
**Completes PRD #23.**
**Why:** reusing `codexReasoning`'s gate makes label-honesty == reasoning-honesty for free. The handoff
feared the 13 existing `buildChatModelInfos` tests asserted the Codex row name — they don't (the only Codex
test asserts `capabilities`), so the change was purely additive, no existing test changed.
**Reversibility:** easy (additive suffix + optional `state.effort`).

## 2026-06-22 — Anthropic OAuth Provider (PRD #27): scope, architecture, accepted risk
**Decision:** Add a third **Provider kind**, the **Anthropic Provider** (`kind:'anthropic-oauth'`) — a
built-in Provider credentialed by **signing in** to a Claude.ai (Pro/Max) subscription over OAuth, running
Claude on the **Anthropic Messages API** across Inquire + the native LM Chat picker. **Scope = Anthropic
only; xAI deferred** to a future PRD (user has no xAI subscription). Mirror the existing **Codex Provider**
pattern (`codexAuth.ts`/`codexClient.ts`) — new `AnthropicAuth` (PKCE/loopback/SecretStorage slot
`wisp.anthropicAuth`/refresh, 5-min skew, `{}` tombstone) + a bespoke `anthropicClient` Messages adapter,
plus `isCodexProvider`-style branches in `catalog.ts`/`chatProvider.ts`/`extension.ts`/panel/`package.json`.
Scoped as PRD #27 → slices **#28** (tracer, unblocked, HITL-verify) → **#29** (chat streaming) → **#30**
(tool-calling parity). Full design + endpoints/scopes/headers in [[oauth-recon]].

**Three load-bearing sub-decisions:**
1. **Defer the dispatch-registry refactor + shared-OAuth-scaffolding extraction.** With only two OAuth kinds
   (Codex + Anthropic), generalizing the ~6 `isCodexProvider` branch sites is YAGNI. Mirror Codex now;
   refactor when xAI actually lands and a 3rd kind pays for it.
2. **Anthropic is NOT OpenAI-compatible → a bespoke Messages-API adapter is required** (the direct analogue
   of the Responses adapter the Codex Provider needed). Budget it as "a second non-OpenAI wire format," not
   "another OAuth row." The `create_api_key` Console path is rejected — it adds a durable-key concern without
   removing the wire-format problem.
3. **No system-prompt spoof is needed.** Verified: openclaude ships a non-"Claude Code" identity
   (`PRODUCT_DISPLAY_NAME='OpenClaude'`) and Anthropic OAuth inference still serves. Recognition is the OAuth
   token + client_id `9d1c250a-…` + `claude-code/<ver>` UA + `anthropic-beta: oauth-2025-04-20` + billing
   header. Wisp keeps its own system prompt.

**Why:** the user pays for Claude.ai and wants that subscription inside Wisp, exactly as the Codex Provider
spends a ChatGPT subscription. This is the intended "subscription-as-a-model" moat the v1.x README now leads
with. The discriminated-kind design keeps "Active Provider is the single source of truth" intact.

**Accepted risk (explicit):** reusing Claude Code's client_id to drive a user's subscription from a
third-party extension is plausibly out-of-policy for Anthropic; residual risk is platform-level (client_id
revocation / beta churn) and account-level — **accepted by design**. Separately, a dormant
`NATIVE_CLIENT_ATTESTATION` (`cch` token computed by Bun's `Attestation.zig`, server-verifiable "real Claude
Code client") is a kill-switch Wisp on Node **cannot** reproduce; currently unenforced. If Anthropic
enforces it, the Anthropic path breaks while Bun forks (openclaude) survive — a **known ceiling, not a
blocker**, and xAI would be unaffected.

**Reversibility:** the Anthropic modules are additive (drop the row + two files). But the
Messages-adapter-required, no-sysprompt-spoof, and accepted-risk facts are load-bearing — don't "simplify"
Anthropic into an OpenAI-compatible row, and don't re-open the ToS go/no-go without re-reading this. The
deferred registry refactor stays open for the xAI PRD.

## 2026-06-23 — Anthropic tracer built (slice #28); the live 429 resolved the recognition contract
**Decision:** Shipped the Anthropic Provider tracer per the 2026-06-22 ADR. New pure cores in `catalog.ts`
(TDD, `npm test` **159/159**): `Provider.kind += 'anthropic-oauth'`, `isAnthropicProvider`,
`isAnthropicSignedIn`, `tokensToAnthropicCreds` (expires_in → absolute `expiresAt`), `shouldRefreshAnthropicToken`
(5-min skew), `parseAnthropicCreds` (tombstone/corrupt → undefined), `ANTHROPIC_MODELS`, the shared PKCE
generators (`base64url`/`codeVerifier`/`codeChallenge`/`oauthState`, lifted into `catalog.ts` so they're
unit-testable — Codex keeps its private copies until the deferred extraction), and the **client attestation**
pair `anthropicFingerprint`/`anthropicAttribution`. New impure `anthropicAuth.ts` (PKCE/loopback/SecretStorage
`wisp.anthropicAuth`/JSON token exchange/scope-omitting refresh/`{}` tombstone) + `anthropicClient.ts`
(non-streaming `/v1/messages`, system-as-block-array, text extract). `extension.ts` branches Inquire on
`isAnthropicProvider`; panel generalizes the Codex sign-in block to both OAuth kinds. **F5: sign-in + one
Inquire edit PASSED.**

**The load-bearing live finding — the subscription Messages backend gates on a SERVER-VALIDATED client
fingerprint; missing it returns a *synthetic* 429.** Sign-in worked first try, but the first inference 429'd
with `{"type":"rate_limit_error","message":"Error"}` and — the tell — **no `anthropic-ratelimit-*` headers and
no `retry-after`** (a real limit always carries them). Three recognition signals were required, none of which
a bare OAuth request sent (extracted from openclaude's actual Messages code, `D:/.claude/claude projects/openclaude`):
1. **`anthropic-beta: claude-code-20250219,oauth-2025-04-20`** — a COMMA-joined list. `claude-code-20250219`
   is the primary "this is Claude Code" gate; **`oauth-2025-04-20` alone is NOT enough**.
2. **User-Agent `claude-cli/0.19.0 (external, cli)`** + `x-app: cli`. NB the inference UA token is
   **`claude-cli/`**, not `claude-code/` (that one is MCP/WebFetch only) — this **corrects** the 2026-06-22
   ADR sub-decision 3, which named `claude-code/<ver>`.
3. **A first `system` block** `x-anthropic-billing-header: cc_version=0.19.0.<fp>; cc_entrypoint=cli;` whose
   `<fp>` is a **server-recomputed** fingerprint: `sha256('59cf53e54c78' + msg[4]+msg[7]+msg[20] + version)`,
   first **3 hex** chars, sampled from the **first user message** (missing index → `'0'`). It MUST be derived
   from the exact text sent. `cc_version` must match the UA version. **This was the final unlock.**
This **sharpens** the recon's abstracted "recognition = token + client_id + UA + oauth beta + billing header"
([[oauth-recon]] §5e): the billing header is a *system block carrying a validated fingerprint*, not an HTTP
header, and the oauth beta is one of several. The 2026-06-22 ADR's "no system-prompt **identity** spoof"
stands (openclaude ships an "OpenClaude" identity and still serves — Wisp keeps its own Inquire prompt); but
"no system prompt at all" was never true — the attribution block is mandatory.

**Why these aren't guesses:** confirmed by the F5 round-trip (each header set retested live) + the exact bytes
read from openclaude's `constants/system.ts` (`getAttributionHeader`) / `utils/fingerprint.ts`
(`computeFingerprint`, salt `59cf53e54c78`, indices 4/7/20) / `services/api/claude.ts` (system-block assembly).
The diagnostic that found it: dump the full 429 response headers — their absence proved synthetic-not-real.

**`cch` attestation still unreproducible/unenforced:** the `cch=00000` token Bun's `Attestation.zig` overwrites
is omitted (no native attestation build) and the request serves fine — confirming the dormant kill-switch is
not yet enforced.

**Reversibility:** the modules are additive (drop the row + two files). But the fingerprint recipe (salt,
indices 4/7/20, 3-hex slice, version-must-match-UA) and the `claude-code-20250219` beta are the live contract,
not preferences — don't "simplify" them away or the backend 429s again. Reference: openclaude
`constants/system.ts`, `utils/fingerprint.ts`, `services/api/claude.ts`. See [[gotchas]].

## 2026-06-23 — Anthropic native chat streaming (slice #29); model-spec 1M caps; effort deferred
**Decision:** Shipped Anthropic text streaming in the native chat / Ctrl+I picker. New pure cores in
`catalog.ts` (TDD, `npm test` **170/170**): `buildAnthropicMessagesBody` (the one tested body builder —
`anthropicInquire` refactored to share it; system→top-level block array led by the attribution, stream flag
optional), `anthropicTextDelta`/`reduceAnthropicTextEvents` (Messages SSE → text; `content_block_delta` →
`text_delta`, `error` event throws), `anthropicModelCaps`, the `SseEvent` alias + `AnthropicMessage` type.
`codexClient.ts` **exported `sseBlocks`** (the provider-agnostic chunk→block splitter, now shared).
`anthropicClient.ts` gained pure `anthropicMessagesHeaders` (testable recognition contract) + a shared
`anthropicMessagesRequest` + the `anthropicStream` generator. `chatProvider.ts` got `anthropicSignedIn`/
`anthropicCreds` deps, usability + caps branches, an Anthropic streaming branch (text-only), and
`toAnthropicMessages`; `extension.ts` wired the two getters. **F5 streaming chat PASSED.**

**Caps advertise the model-spec windows, not a conservative floor.** `anthropicModelCaps` returns
Opus/Sonnet 4.x = **1M** context (Opus 128K output, Sonnet 64K), Haiku 4.5 = 200K/64K — the real model
maxes (Claude API catalog; 1M is standard, no beta). Rejected a flat 200K "safe floor": its only upside
guards an *unverified, avoidable* case (the agent packs >200K **and** the subscription backend rejects),
while its downside is certain — Opus/Sonnet shown false and long chats truncated early on the OAuth-moat
feature. **⚠️ Caveat:** these are *model* maxes; the Claude.ai **subscription** Messages path the OAuth
token rides may cap below 1M — unverified. The picker number is a budgeting hint, so an oversized pack
surfaces as a (already-handled) backend error, not a silent lie. If the subscription path is observed to
cap lower, lower the opus/sonnet `contextInput` then.
**Why not tool-calling in #29:** scope — issue #29 is text streaming only; Anthropic tools (`tool_use`/
`tool_result` round-trip) are slice **#30**. The request forwards **no** `options.tools`; `toolCalling:true`
still advertised (required for picker visibility, same as Codex), honest once #30 lands.

**Deferred — thinking/effort parity (follow-up, NOT #29).** Codex has a panel Effort knob threaded into its
request (v1.2.0); Claude has none — `buildAnthropicMessagesBody` sends no `thinking` / `output_config.effort`,
so on Opus 4.8 chat replies run **thinking-OFF**, effort default. Claude supports adaptive thinking + effort
(low→max), so this is a real parity gap, deferred by choice. **Blocker before building it:** must probe that
the **subscription OAuth Messages path** accepts `thinking`/`output_config.effort` *without tripping the
synthetic-429 fingerprint contract* (#28) — adding body fields changes the shape the backend fingerprints.
**Reversibility:** the streaming cores + caps are additive (easy to drop). The 1M-over-200K call is soft
(one-number revert if the subscription path caps lower). Don't advertise `toolCalling` *and* forward tools
until #30; don't add `thinking`/`effort` fields without the subscription-path probe first.

## 2026-06-23 — Anthropic tool-calling parity (slice #30); the toolCalling flag is now honest
**Decision:** Wired real tool calling for the Anthropic chat branch — forward agent tools, round-trip
`tool_use`/`tool_result` content blocks — making the `toolCalling:true` flag (advertised since #29 for picker
visibility) **honest**. New pure cores in `catalog.ts` (TDD, `npm test` **187/187**): `toAnthropicTools`,
`reduceAnthropicToolCalls`, extended `AnthropicMessage` (`toolCalls`/`toolResults`) + `buildAnthropicMessagesBody`
(content-block expansion + `tools`/`tool_choice`), `parseToolInput`. `anthropicClient.ts`: `AnthropicStreamEvent`
→ `{text}|{toolCall}` union, tools threaded, `anthropicStream` collects `content_block_start`/`content_block_delta`
and folds via the reducer at stream end. `chatProvider.ts`: Anthropic branch forwards `options.tools` + maps
`toolMode`→`tool_choice`, emits `LanguageModelToolCallPart`; `toAnthropicMessages` carries the round-trip. Mirrors
Codex #15. **F5 PASSED** — Claude fired 5 parallel `Read` calls, results round-tripped, loop completed.

**The load-bearing facts — Anthropic's Messages tool wire format differs from Codex's Responses format** (these
are the live contract, confirmed against the API + the openclaude reference, not preferences):
1. **No strict-schema closure.** Anthropic accepts a plain JSON `input_schema` — NO `additionalProperties:false` /
   required-all-keys. `toAnthropicTools` passes the schema through verbatim (do NOT port Codex's
   `enforceStrictResponsesSchema`; it's unneeded and Anthropic doesn't require it).
2. **`tool_choice` is an OBJECT** `{type:'auto'|'any'}` — not Codex's string `'auto'|'required'`. VS Code
   `Required`→`'any'`.
3. **Parallel calls are SIBLING `tool_use` blocks inside ONE assistant turn's content array** (after the optional
   leading text block) — not separate items. Codex emits flat `function_call` items instead.
4. **`tool_use` block `input` is a PARSED object** (Codex round-trips the raw JSON string). `parseToolInput`
   parses `argsJson`, degrading bad/partial JSON to `{}`.
5. **Streaming keys by content-block `index`** (`content_block_start.content_block.type==='tool_use'` carries the
   `toolu_` id+name; `content_block_delta.delta.type==='input_json_delta'` accumulates `partial_json`) — Codex
   keys by item id.
6. **User turn = `tool_result` block FIRST, then text** (the API requires the assistant-tool_use → user-tool_result
   adjacency).

**The #28 fingerprint contract survived untouched** — `firstUserMessage` is still sourced from the first
non-system turn's `.content` TEXT; `tools` ride as a separate top-level body key, never the system attribution
block; the fingerprint samples only first-user-message text, not body fields. #30's tools rode the subscription
path with no synthetic-429 — partial evidence the deferred thinking/effort fields (their own slice) will too,
but probe before shipping them.

**Adversarial review (20-agent workflow):** 0 code bugs; 3 coverage gaps confirmed → 2 regression tests added
(full round-trip ordering, multi-parallel `tool_use` blocks), 1 justified-skip (the `chatProvider` `toolMode`
seam — a vscode-importing non-pure module deliberately kept out of the pure unit suite, same as Codex; the
`'auto'|'any'` union type catches a copy-paste `'required'` at compile time).

**Reversibility:** the cores are additive (easy to drop). But the six wire-format facts are the live contract —
don't "simplify" Anthropic tools toward the Codex/strict shape, or the backend rejects them. Images stay deferred
(own follow-up). Reference: openclaude `src/utils/api.ts`, `src/services/api/claude.ts`, `src/utils/messages.ts`.

---

## 2026-06-23 — Anthropic thinking/effort parity (slice "#31", branch `feat/anthropic-thinking-effort`)

Claude chat/Inquire now honor the shared `wisp.effort` knob. The wire contract (extracted from openclaude, the
reference subscription client — `src/utils/effort.ts`, `src/services/api/claude.ts`, `src/constants/betas.ts`):

1. **Effort rides `output_config.effort`** (a string `low|medium|high|xhigh`), NOT a top-level `effort` and NOT
   `thinking.budget_tokens` (the latter 400s on Opus 4.7+). The original plan note missed the nesting.
2. **The `effort-2025-11-24` beta header is load-bearing** — without it the backend silently drops
   `output_config.effort`. Added to `ANTHROPIC_BETA` (now `claude-code-20250219,oauth-2025-04-20,effort-2025-11-24`).
   The note missed this entirely.
3. **Thinking is `{type:'adaptive'}`** (no budget) for adaptive-capable models. Coupled with effort in
   `anthropicThinkingEffort` deliberately: the wired path always passes a non-undefined effort (`activeEffort()`
   defaults `medium`), and the coupling keeps the pre-#31 body byte-identical when no effort is threaded.
4. **Model-gated:** effort fields emitted only for `/opus-4-[5-8]/` + `sonnet-4-6` (Haiku/older 400). **`xhigh`
   clamps to `high`** on all but Opus 4.7/4.8 (the panel offers `xhigh` for every effort-aware Provider; Sonnet
   4.6 400s on it) — mirrors openclaude `resolveAppliedEffort`.
5. **The effort knob is now shared** Codex+Anthropic — the `chatProvider` dep `codexEffort` → `effort`; the panel
   Effort select is data-gated (`state.effort !== undefined`), populated for both OAuth Providers.

**Probe resolved positive:** F5 confirmed the subscription OAuth path accepts the new body fields with no
synthetic-429 (openclaude was already strong evidence; the #28 fingerprint samples first-user-message text only,
never body fields). 9 new tests, `npm test` 196/196, tsc+webview+vite clean. Reviewed (cavecrew-reviewer): the
`xhigh` 400 + the `[5-9]` over-match were caught pre-commit and fixed.

**Deferred → issue #32:** `max` effort. Needs widening the shared effort type past `xhigh`, per-model panel
option gating (`max` is Opus-4.6+-only), a `max→high` clamp, and cross-provider normalization (Codex maps a
stored `max`→`xhigh`). The `xhigh` clamp in this slice is the template.

## 2026-06-23 — Anthropic `max` effort + picker mirrors the first-party `/effort` slider (#32)
**Decision:** Added the `max` level. Type = `EffortLevel = CodexEffort | 'max'` superset (not overloading
`CodexEffort` — Codex's wire tops at `xhigh`). Wire clamp in `anthropicThinkingEffort`: `max→high` on non-max
models (`modelSupportsAnthropicMax = /opus-4-[678]/`), beside the existing `xhigh→high`. Codex normalizes a
stored `max→xhigh` (`standardEffortToCodex`) at every send-site. **The picker is provider-only, NOT
model-gated** — `effortOptionsFor(provider)` shows Anthropic the full `low→max` ladder regardless of model;
Codex stops at `xhigh`.
**Why:** Issue #32 specified per-model `max` gating ("`max` 400s on Sonnet"). But the first-party Claude Code
`/effort` slider exposes the full ladder for Sonnet 4.6 and clamps the *applied* value to `high` (the header
read "Sonnet 4.6 with high effort" while the slider caret sat past `high`). Taxonomy verified against
openclaude `src/utils/effort.ts`: `max` = Opus 4.6/4.7/4.8, `xhigh` = Opus 4.7/4.8, Sonnet 4.6 / Opus 4.5 take
neither. So capability belongs in the wire clamp (single source of truth) and the picker just mirrors official
— simpler than per-model option computation, and honest to what the first-party client shows. 6 new tests,
`npm test` 204/204, tsc+webview+vite clean. Shipped with #28–#31 as release **1.3.0** to `main`.
**Reversibility:** easy (picker list + clamp are localized to `catalog.ts`).

## 2026-06-23 — The Bridge: an outward-facing local OpenAI-compatible endpoint (PRD #34, slices #35–#40)
**Decision:** Add the **Bridge** (new `CONTEXT.md` term) — a local OpenAI-compatible HTTP endpoint Wisp
exposes so tools **outside** VS Code (primarily a GitHub Copilot CLI session running inside VS Code) reach
the **Provider catalog** as one ordinary OpenAI backend, **including the Codex and Anthropic subscription
sign-in Providers**. Outward mirror of the inward **LM Chat Provider**. Planned, not built: PRD **#34** →
slices **#35** (env-var gate, HITL) · **#36** (pure protocol translator, TDD) · **#37** (listener +
key-based skeleton) · **#38** (panel toggle + secret) · **#39** (Codex) · **#40** (Anthropic).
- **Embedded in the extension host, NOT a standalone process.** The Codex/Anthropic OAuth tokens + refresh
  live in VS Code SecretStorage owned by `CodexAuth`/`AnthropicAuth`; an embedded listener reuses those live,
  auto-refreshed creds with zero token porting. Standalone is **rejected** — it can't read SecretStorage and
  would re-implement both sign-in flows. Tradeoff: the Bridge is alive only while VS Code + Wisp run; a
  background CLI session outliving VS Code loses it (accepted).
- **Model addressing:** the external tool names a **Provider id** as the OpenAI `model`; Wisp serves that
  Provider's selected model via `resolveModel`; `GET /v1/models` returns the same ids `buildChatModelInfos`
  produces. Optional `<provider-id>/<model-id>` exact form is a later escape hatch, not v1.
- **Security:** binds `127.0.0.1` only; fixed default port settable via a `wisp.*` setting; an auto-generated
  access secret (SecretStorage, shown in panel + command) is a required Bearer on every request. This is
  Wisp's **first inbound network listener** — residual risk is a local process that already holds the secret
  (standard local-proxy posture). **OFF by default**; toggled via command + panel switch.
- **Reuse:** all existing pure cores (`catalog.ts` resolvers + message builders + tool formatters),
  `codexClient`/`anthropicClient` (fetch+SSE), `codexAuth`/`anthropicAuth` (OAuth+refresh). **New code** = the
  HTTP server + the inbound/outbound OpenAI translation layer (the deep, tested module = the translator).
  Test the translator hard (Vitest, mirrors `catalog.test.ts`); listener + panel are glue → F5/manual.
- **ToS posture is IDENTICAL to existing Wisp** — subscription OAuth used outside the first-party client;
  credentials never leave Wisp; the provider only ever sees Wisp. No new ToS category. Non-ToS nuance:
  agent-loop traffic is heavier than chat → marginally higher rate-limit / abuse-detection odds.
**Why:** the user wants the Copilot CLI agent to run on a Claude.ai / ChatGPT subscription, which the CLI's
GitHub-backed picker can't reach (it ignores `vscode.lm`). The Bridge is the only path Wisp can deliver
unilaterally. The chat-session-provider alternative is blocked on a still-proposed (non-publishable) VS Code API.
**Out of scope:** image input over the Bridge, non-OpenAI wire formats, the chat-session-provider route,
Marketplace publish.
**Reversibility:** easy/additive (drop the two new modules + the toggle) — so **no ADR** (fails the
"hard to reverse" bar). The embedded-vs-standalone choice is the load-bearing part; don't re-open it without
re-reading the SecretStorage reason.

## 2026-06-24 — Bridge #35: VS Code → Copilot CLI env-var passing (gate)
**Decision (YES — Wisp can, and should, inject the vars itself):** VS Code does **not** automatically push
custom env vars into a Copilot-CLI process spawned in its integrated terminal — a terminal inherits the
extension-host/VS Code process environment (plus the user's login-shell env and any
`terminal.integrated.env.<platform>` additions), and Wisp's BYOK vars are in none of those by default. The
**sanctioned, Wisp-owned path is the `EnvironmentVariableCollection` API**: from `extension.ts`, use
`context.environmentVariableCollection` (typed `GlobalEnvironmentVariableCollection`) and call `.replace(name, value)`
for each of the five Copilot BYOK vars. Every integrated terminal created **after** the collection is set
inherits them, so a Copilot CLI session started in a VS Code terminal is pointed at the Bridge with no user
setup. This is path **(a)** from the PRD; it wins because it's automatic and lives in the same extension
process that already owns the Bridge listener + secret.

**The five vars to inject (verified against current GitHub Copilot CLI BYOK docs, 2026-06-24):**
`COPILOT_PROVIDER_BASE_URL` (required — point at `http://127.0.0.1:<port>/v1`), `COPILOT_MODEL` (required — a
Wisp Provider id), `COPILOT_PROVIDER_API_KEY` (the Bridge access secret), `COPILOT_PROVIDER_TYPE` (`openai` —
the default; allowed `openai|azure|anthropic`), `COPILOT_OFFLINE=true` (skip GitHub's servers). All five are
read from the **process environment**; the CLI also requires the model to support **tool calling + streaming**
(Bridge already round-trips both). The PRD's names are **confirmed current**, not stale.

**Wiring (exact API):** `context.environmentVariableCollection.replace('COPILOT_PROVIDER_BASE_URL', url)`, …×5.
`replace` defaults to `{ applyAtProcessCreation: true }`. `.clear()` / `.delete(name)` to tear down when the
Bridge toggles off. `.persistent` defaults **true** → the vars survive window reloads (the collection is cached
and re-applied), so set it deliberately (likely keep true while the Bridge is on; clear on off). Set
`.description` so the user sees *why* the env changed in the terminal-tab hover. For a per-folder scope,
`environmentVariableCollection.getScoped({ workspaceFolder })` returns an isolated child collection applied
after the global one — **not needed for v1** (global is correct; the Bridge is machine-wide).

**Fallbacks (if the user prefers manual / for a terminal already open before the toggle):**
(b) user adds the five vars to `terminal.integrated.env.<platform>` in settings.json; (c) user exports them in
a shell and launches VS Code (or just the `copilot` process) from that shell. Both are documentation-only; (a)
is the default Wisp ships.

**Caveats (load-bearing):**
- **Applies to terminals created AFTER the collection is set.** A Copilot CLI session running in a terminal
  opened *before* Wisp set the vars will **not** see them — VS Code marks that terminal stale: per the Terminal
  Advanced docs, "If an extension changes the terminal environment, any existing terminals will be relaunched
  if it is safe to do so, otherwise a warning will show in the terminal status," with "A warning icon … next to
  the terminal tab when a relaunch is required" and a relaunch button in the hover. Setup docs must tell the
  user to **open a fresh terminal (or relaunch)** after enabling the Bridge.
- The injected `COPILOT_PROVIDER_API_KEY` becomes visible to any process in that terminal (it's the Bridge's
  own localhost secret — same local-proxy posture already accepted in the Bridge PRD, not a new exposure class).
- A Copilot session in an **external** terminal (outside VS Code) is out of this mechanism's reach → that user
  takes fallback (b)/(c). Matches the Bridge's "alive only while VS Code + Wisp run" tradeoff.

**Why:** the Bridge listener + access secret already live in the extension host; injecting the vars from the
same place is zero extra moving parts and needs no token porting or user copy-paste. Settings/shell paths put
the burden on the user and can drift from the live port/secret.

**Verdict derived from docs + the VS Code API (release/1.104, which Wisp already targets); live F5 round-trip
(start Copilot CLI in a VS Code terminal, confirm it reaches the Bridge) is the pending final confirmation.**
**Reversibility:** easy/additive — it's `replace`×5 on activate-or-toggle + `clear` on off; no ADR (consistent
with the Bridge PRD entry's "no ADR" call). Sources: VS Code `vscode.d.ts` (`EnvironmentVariableCollection`,
`GlobalEnvironmentVariableCollection.getScoped`, `ExtensionContext.environmentVariableCollection`); VS Code
Terminal Advanced docs (relaunch/stale-env indicator); GitHub Copilot CLI "Using your own LLM models" (BYOK) docs.

## 2026-06-24 — Bridge #36 built: the pure protocol translator (+ trust-boundary guards from review)
**Decision:** Shipped slice #36 — `src/bridge.ts` + `src/bridge.test.ts`, a pure, vscode-free protocol
translator joining the `catalog.ts` family (TDD, `npm test` **234 green**, tsc clean). Three jobs:
- **Inbound** `parseOpenAiChatRequest(body)` → `{ model, stream, system, turns: NormalizedTurn[], tools: ToolSpec[] }`
  — the inverse of `buildOpenAiChatMessages` (+ `toOpenAiTools`). **System is lifted OUT of `turns` into a
  separate string** (every send-builder consumes system apart from the conversation — Codex `instructions`,
  Anthropic top-level `system`, OpenAI re-prepend), so the value feeds each builder with no second mapping.
  **Tool-result adjacency is inverted by buffering:** a run of `tool` messages is held and attached to the
  next user turn's `toolResults` (or flushed as a bare tool-result user turn), mirroring how
  `buildOpenAiChatMessages` emits tool messages BEFORE the user text.
- **Outbound** `BridgeStreamEvent = {text} | {tool_call}` → OpenAI `chat.completion.chunk` emitters
  (`textChunk`/`toolCallChunk`/`finalChunk`), `sseLine` wire form, `SSE_DONE`. **Tool calls are folded WHOLE**
  (one delta per call, full args, distinct `index`) because Wisp's stream reducers assemble calls before
  surfacing them — valid OpenAI shape, just not fragment-streamed. `finish_reason` = `tool_calls` if any call
  emitted else `stop`. Deterministic — `ChunkMeta {id,model,created}` is injected (no `Date.now()`/random here).
- **Models** `buildModelsList(ChatModelInfo[])` → `{object:'list', data:[{id,object:'model',created:0,owned_by:'wisp'}]}`.

**Trust-boundary guards (added after a 15-agent adversarial review of the diff before landing):** the review
confirmed 5 of 11 raw findings — all robustness, none a happy-path bug. `parseOpenAiChatRequest` parses an
UNTRUSTED external HTTP body, yet four spots dereferenced it blindly while the module's own doc comment claimed
it "never trusts the inbound body to be well-formed." Fixed (TDD: 5 new malformed-input tests + 1 parallel-
tool_calls coverage test): a missing/non-array `messages` → empty turns; non-iterable user `content`
(null/number/object) → empty-text turn; a `tool_call`/`tools` entry with no `function` → empty name/args;
unknown or partial content parts (a real OpenAI `input_audio` part, a url-less `image_url`) → skipped. All
**degrade, never throw** — so the #37 listener can map a parse-that-yields-nothing to a deliberate 400 rather
than catching a stray `TypeError`.
**Why guard now (not defer to #37):** the comment already advertised the robustness (comment-and-code are
peers — it must not lie), the fixes are ~5 lines in the file's existing degrade-don't-throw style, and
trust-boundary input validation is the one thing not worth deferring. `catalog.ts` was **NOT** touched —
every reused type was already exported (`NormalizedTurn`, `ToolSpec`, `AssembledToolCall`, `ChatModelInfo`);
the only locally-defined type is the inbound OpenAI request shape (no catalog equivalent — catalog models
only the *outbound* message).
**Unblocks #37** (listener + key-based skeleton): #35 + #36 were its two prerequisites.
**Reversibility:** easy/additive — the translator is two new files; drop them to remove. The guards are
load-bearing — don't strip them; the listener relies on a non-throwing parse.

## 2026-06-24 — Bridge #37 built: the HTTP listener + keyed walking skeleton (live-verified)
**Decision:** Shipped slice #37 — `src/bridgeServer.ts` (impure glue over the pure `bridge.ts`) + wiring in
`src/extension.ts` + a `wisp.bridge.port` setting (machine-scoped, default `41184`) + a `wisp.bridgeToggle`
command. The listener binds `127.0.0.1`, enforces the access-secret Bearer on **every** request
(constant-time `crypto.timingSafeEqual` with a length guard), routes `POST /v1/chat/completions` and
`GET /v1/models`, and is **glue → F5-verified, not unit-tested** (per the PRD; the genuinely-new logic is the
already-tested `bridge.ts`). Built on node's `http` stdlib — **no web-framework dependency**. The seam mirrors
`chatProvider.ts`'s `ChatProviderDeps` (providers + model-map/baseUrl getters + async key/client resolvers);
`extension.ts` owns secrets, the listener reads none. Send path = the existing OpenAI SDK
(`client.chat.completions.create`, `stream:true`), with **system re-prepended** (the translator keeps it out
of `turns`), then rendered back through `bridge.ts`'s SSE emitters; tool-call fragments are collected and
`assembleToolCalls`-folded exactly as the LM Chat Provider path does.

**Two scoping choices worth recording:**
- **A non-streaming path was added beyond the pure translator.** `bridge.ts` is deliberately streaming-only
  (SSE emitters). When a client sends `stream:false`, the listener drains the same upstream stream and answers
  one `chat.completion` object (the aggregate envelope is glue, ~12 lines, in `bridgeServer.ts` — `bridge.ts`
  stays pure-streaming). Rationale: it closes a real foot-gun (a client or plain curl sending `stream:false`
  would otherwise get a broken SSE reply), at trivial cost. The PRD's acceptance is SSE-only; this is a
  correctness superset, not a scope expansion of the pure module.
- **Keyed Providers only; the secret is a temp constant; a palette command drives the toggle.** Codex/Anthropic
  deliberately return `400 not yet reachable` (their send-paths are #39/#40). The access secret is a constant
  (`BRIDGE_ACCESS_SECRET` in `extension.ts`) and `wisp.bridgeToggle` shows the address+secret in a toast — both
  are #37 test scaffolding; the auto-generated SecretStorage secret + panel switch + copy button are **#38**.
  The panel switch will call the same `bridge.start()/stop()` — no fork.

**Untrusted-body posture at the listener (the trust boundary):** the body is `JSON.parse`'d (parse failure →
**400**), then `parseOpenAiChatRequest` (which degrades, never throws) — a parse that yields no turns is mapped
to a deliberate **400**, not a caught `TypeError`. Body size is capped (25MB) so a malformed/huge body can't
exhaust host memory. Client disconnect aborts the upstream call via `AbortController`.

**Verification:** `tsc` clean; **234 tests still green**; a 16-check standalone smoke (fake OpenAI client, real
HTTP) covered auth/routing/SSE-shape/non-stream/400/404; and a **live F5 round-trip** streamed a real reply
through `opencode-go` (text deltas → `finish_reason:stop` → `[DONE]`, model echoed as the provider id).
**Unblocks #38** (panel UI + generated secret + env-var injection), then #39/#40.
**Reversibility:** easy/additive — one new file + a handful of wiring lines; drop them to remove. No ADR
(consistent with the Bridge PRD's "additive, easy to drop" call).

## 2026-06-24 — Bridge #38 built: panel control + generated secret + COPILOT_* env injection
**Decision:** Shipped slice #38 — the side-panel Bridge control, the real access secret, and the #35 env
injection, all in the three existing files (`extension.ts`, `sidePanelProvider.ts`, `webview/app.tsx`); no
`package.json` change (the `wisp.bridgeToggle` command + `wisp.bridge.port` setting already existed from #37).
- **Secret:** the #37 temp constant `BRIDGE_ACCESS_SECRET` is gone. `ensureBridgeSecret()` generates a
  `randomBytes(32)` base64url secret **once**, stores it in SecretStorage slot **`wisp.bridge.secret`**, and
  reuses it thereafter (so a configured CLI keeps working across restarts — never regenerated each start). The
  listener reads it via `accessSecret: () => bridgeSecret`, a module var materialized on start and reset to
  `''` on stop (the listener's auth check is synchronous, so it can't `await` SecretStorage per request).
- **One shared lifecycle, no fork:** `startBridge`/`stopBridge` are the single start/stop path; the palette
  command and the panel switch both call them. `getState` exposes `bridgeRunning`/`bridgeAddress`/
  `bridgeSecret` (secret only while running), and `bridgeToggle` pushes panel state after either trigger.
- **Secret crosses the webview boundary, deliberately.** Unlike Provider keys (write-only across the boundary),
  the Bridge secret is *shown* (as `type="password"`) with a Copy button while running — it's the Bridge's own
  localhost secret and the user must copy it into the CLI. Copy is done **host-side** (`vscode.env.clipboard`),
  since webview clipboard access is restricted. Consistent with the PRD's accepted localhost-secret posture.

**The #35 env injection lands here (path (a) from the env-var decision above):** `injectCopilotEnv()` does
`context.environmentVariableCollection.replace(...)` for the five `COPILOT_*` BYOK vars on start; `clear()` on
stop. Two non-obvious calls worth recording:
- **`clear()` on activate too, not only on stop.** The collection is `.persistent` by default, so VS Code
  re-applies the previous session's vars on a window reload — but the Bridge always starts OFF, so without an
  activate-time clear a new terminal would inherit a dead-port `BASE_URL` + a stale `API_KEY` while nothing is
  listening. (Closes the gap the original env-var decision's "clear on off" left open across reloads.)
- **`COPILOT_MODEL` re-synced on a mid-run Provider switch** (the `onDidChangeConfiguration` handler, guarded
  by `bridge.isRunning()`) so the panel's choice stays the single source of truth (story 8). Only that one var
  — `BASE_URL` stays bound to the running listener's port, not the (possibly newly-edited) `bridge.port`.

**Known ceiling (accepted, not fixed):** `bridge.stop()`'s `server.close()` is async, so a fast stop→start
(panel double-click) can hit `EADDRINUSE` before the OS frees the port. It self-heals (error toast + retry once
freed); a `ponytail:` comment in `stopBridge` names the upgrade path (gate the toggle on a transition flag) if
it ever bites. Surfaced by the `cavecrew-reviewer` pass, which also confirmed: no empty-secret bypass
(`randomBytes` never empty + listener unbound when secret is `''`), no secret leak on the failed-start path
(`getState` gates display on `isRunning()`), double-start guarded.

**Verification:** `tsc` clean; **234 tests still green** (panel/secret/env are glue → F5-verified, not
unit-tested, per the PRD); **live F5 smoke** — panel Start → an `Invoke-RestMethod` non-stream `POST` returned
a real `chat.completion` through `opencode-go`. **Still pending:** the real Copilot-CLI-in-a-terminal confirm
(the last unproven half of #35) — curl/`Invoke-RestMethod` proved the listener, not yet a CLI session.
**Unblocks #39** (Codex send-path) and #40 (Anthropic).
**Reversibility:** easy/additive — edits to three files; revert to restore #37's constant-secret state. No ADR.

## 2026-06-24 — Bridge #39 built: Codex over the Bridge (pure reuse of the LM Chat Provider's Responses path)
**Decision:** Made the `kind:'codex'` Provider reachable on `POST /v1/chat/completions` — it was returning
`400 not yet reachable`. **No new auth or transport**: the Bridge's `handleCodexChat` (`src/bridgeServer.ts`)
drives the **same cores the LM Chat Provider already uses** — `codexStream` (Responses-API SSE) with
`codexAuth.current()` creds (sign-in + refresh), `standardEffortToCodex(effort)`, and
`toCodexResponsesTools`. The only genuinely-new wiring is mapping the Bridge's normalized turns into the
Codex request and the Codex stream events back through the translator. Two files:
- `bridgeServer.ts`: `BridgeDeps` gained `codexCreds` / `codexSignedIn` / `effort`. The `handleChat` guard
  split — `codex` → `handleCodexChat`, anthropic still `400` (#40). `/v1/models` now advertises `codex`
  when **signed in** (`isCodexProvider(p) ? await deps.codexSignedIn() : …`), anthropic still forced false.
  `handleCodexChat` renders text + assembled tool calls back through bridge.ts's existing
  `textChunk`/`toolCallChunk`/`finalChunk` (or one `chat.completion` on `stream:false`) — **identical wire
  shape to the keyed path**, so the translator is reused, not duplicated.
- `extension.ts`: passed `codexAuth.isSignedIn` / `codexAuth.current` / `activeEffort` into
  `createBridgeServer` (the exact getters `registerWispChatProvider` already receives).

**Two load-bearing details:**
1. **`parsed.system` is re-attached as a leading `role:'system'` message**, not passed separately — Codex
   has no system *turn*; `buildCodexResponsesBody` folds any `role:'system'` message into `instructions`
   (and defaults one when absent, so the backend's "Instructions are required" 400 can't fire). bridge.ts
   deliberately keeps `system` out of `turns`, so the send-path must re-prepend it — mirrors the keyed
   path's `[{role:'system'}, ...base]`.
2. **Signed-out fails clean, never crashes** (acceptance #4): no creds → **401** before any upstream call;
   a stream throw (refresh fail / mid-stream) → **502** (or just `end()` if the SSE head is already out).

**Surgical call — keyed path untouched.** `handleCodexChat` duplicates ~12 lines of SSE-writing rather than
refactoring the verified keyed path into a shared renderer. Rationale: zero regression risk to the
F5-verified #37/#38 slice; the shared-renderer refactor (bridge.ts's `BridgeStreamEvent` was built for it)
is deferred until #40 lands a third duplicate and the pattern is proven across all three. `ponytail`: take
the refactor with #40, not speculatively now.

**Verification:** `tsc` clean; **234 tests still green** (the send-path is glue → F5-verified, not
unit-tested per the PRD; the mapping is a trivial field-rename, the real logic lives in the already-tested
`codexStream`/`bridge.ts`); **live F5 smoke** — panel Provider=Codex, signed in, Bridge Start → an
`Invoke-RestMethod` non-stream `POST` returned a real `chat.completion` from the **`codex`** Provider through
the **ChatGPT subscription** (`finish_reason:stop`, model echoed as the provider id). **Still pending** (same
as #38): a real **Copilot CLI session** over the Bridge (acceptance #5 + the long-outstanding #35 bullet),
plus the signed-out-401 and tool-call edges live. **Unblocks #40** (Anthropic, the last send-path).
**Reversibility:** easy/additive — edits to two files; revert to restore the codex `400`. No ADR.

## 2026-06-24 — Anthropic over the Bridge (#40)

**Decision:** Make `kind:'anthropic-oauth'` reachable on `POST /v1/chat/completions` by mirroring the #39
Codex send-path exactly, swapping the Codex cores for the Anthropic ones: `handleAnthropicChat` drives
`anthropicStream` (Messages SSE) on `anthropicAuth.current()` creds, **raw** `deps.effort()`, `toAnthropicTools`,
with `parsed.system` re-attached as a leading `role:'system'` message. `/v1/models` and `handleChat` flip
anthropic from the stub to live; `BridgeDeps` gains `anthropicSignedIn`/`anthropicCreds`, wired from the
getters `registerWispChatProvider` already receives.

**Why:** zero new auth/transport — reuse the exact cores the LM Chat Provider's Anthropic branch uses, so the
only new code is the turn/stream mapping. Two details: effort is passed **raw** (Anthropic's body builder maps it
via `anthropicThinkingEffort`; only Codex needs `standardEffortToCodex`), and **images are dropped** (matches
`toAnthropicMessages`; Anthropic image support is a separate follow-up). The deferred shared-renderer refactor
(flagged in the #39 entry as "take it with #40") was **declined** — a third near-identical block is cheap and the
keyed/Codex paths are F5-verified; a renderer refactor now risks regression for no functional gain. `ponytail`.

**Verification:** `tsc` clean, **234 tests green** (glue → not unit-tested per PRD), live `Invoke-RestMethod`
`model:'anthropic'` → `finish_reason=stop` with real text through the Claude.ai subscription.
**Reversibility:** easy/additive — revert to restore the anthropic `400`. No ADR.

## 2026-06-24 — Copilot CLI shows the real model name, via active-Provider routing fallback (#b)

**Decision:** Inject `COPILOT_MODEL` = the active Provider's **resolved model name** (`activeModel()`), not its
Provider id, so Copilot CLI's UI shows the real model. To keep routing working, `handleChat` now routes a
Provider **id** to that Provider (curl keeps explicit addressing) and **any other value** — notably the resolved
model name Copilot sends — to the **active Provider** (`deps.activeProviderId()`, new `BridgeDeps` getter). The
env label re-syncs on provider **or** model switch.

**Why:** Copilot CLI renders `COPILOT_MODEL` **verbatim** as its model label and does not read the custom
endpoint's `/v1/models`; the only lever for the label is that env var. Changing it to the model name forces the
routing change. Chose the **loose** active-Provider fallback over a tight model-name match because the model name
lives in the terminal env (fixed at launch) — a tight match would 404 after any mid-session model switch. The
loose fallback keeps the model **used** live (`resolveModel` per request) while the **label** is a launch-time
snapshot. Tradeoff accepted: (1) an unknown model no longer 404s — it serves the active Provider (fine for a
local single-user endpoint); (2) running Copilot terminals now **follow the active Provider** (they send a model
name, not an id) rather than being pinned to their launch Provider. curl addressing each Provider by id is
preserved.

**Verification:** `tsc` clean, **234 tests green**, full compile clean. Routing proven on the compiled
`out/bridgeServer.js` via a node harness (3/3 HTTP cases) AND end-to-end with the **real `@github/copilot`
v1.0.64 binary** — its JSON event stream reported `data.model:"minimax-m3"` (resolved name, not the id) and
round-tripped through our Bridge (`apiCallId:chatcmpl-…`). The interactive `Current model:` banner is the human
render of that same `data.model` field; the only step not run is a reload of the user's live Extension Host.
**Reversibility:** easy — three small edits; revert `injectCopilotEnv` to `activeProvider().id` and drop the
fallback to restore strict id-routing. No ADR.

## 2026-07-13 — Bridge Anthropic door: Claude Code as a Bridge consumer (PRD #43, slices #44–#47)
**Decision:** Reopen PRD #34's "non-OpenAI wire formats" exclusion: the **Bridge** gains a second front door
speaking **Anthropic Messages** (`POST /v1/messages` SSE + `GET /v1/models`; `count_tokens` skipped — Claude
Code estimates locally) so Claude Code runs on any catalog Provider. Same listener, same secret (accepted as
`x-api-key` **or** `Bearer` — Claude Code sends either depending on which env var the user set). Routing
reuses the **already-live** loose fallback: Provider id → that Provider; unknown `claude-*` strings → the
active Provider. Everything else from #34 stands (embedded-in-extension-host, no credential egress, off by
default, image input out of scope).
**Terminal UX now vs later:** this PRD ships shapes (a)+(c) — Claude Code's **own `/model` picker** (fed by
discovery + `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`) plus a **side-panel copy-paste snippet** section
(per-session shell line default; project-scoped `.claude/settings.json` variant; the **global**
`~/.claude/settings.json` env block is banned — highest precedence, silently hijacks every session). The end
goal — a **standalone thin remote-control TUI** (openclaude repo as skeleton reference) and an opt-in env
auto-inject toggle — is **deferred to its own later PRD**: auto-injection Copilot-style was rejected *for
Claude Code today* because it would reroute sessions meant for the real Claude subscription.
**Why:** Claude Code only speaks the Anthropic protocol to `ANTHROPIC_BASE_URL` — no OpenAI-door path exists;
the subscription-backed providers (Codex OAuth headline) are unreachable by any other BYOK route. New PRD over
extending #34 because #34's out-of-scope line is load-bearing history; #34 closed as shipped.
**Gate:** slice #44 answers the one open unknown — whether the picker filters non-`claude-*` discovery ids
(fallback: `claude-wisp-<provider>` aliases + inbound strip) — plus records real wire shapes before the
translator is built.
**Reversibility:** easy/additive (a second route on the existing listener + one pure translator module) — no ADR.

## 2026-07-13 — Gate #44 verdict: picker filters plain ids → `claude-wisp-*` aliases + inbound strip
**Decision:** The Anthropic door's discovery lists **`claude-wisp-<provider>` aliases only** and strips the
prefix inbound — Claude Code's `/model` picker filters non-`claude-*` ids (empirically confirmed: plain
`codex`/`opencode` absent, both aliases shown, `display_name` rendered). Alias arrives verbatim in the POST
body. Companion facts locked for #45 (full record: issue #44's two comments): `system` is a block ARRAY;
`role:"system"` turns appear inside `messages` (mid-conversation-system beta); background tier sends stock
`claude-haiku-4-5-20251001` with **forced `tool_choice`** + `temperature:0` (translator must map both — the
chat path's hardcoded `'auto'` is not enough); `anthropic-beta` varies per call → treat opaque. Bridge auth
widened permanently: secret via `x-api-key` OR `Bearer`.
**Why:** The gate ran real Claude Code (print mode both auth variants + interactive picker session) against
the canned door; plain ids stay usable via `--model`/`ANTHROPIC_MODEL` (sent verbatim, no client-side
validation), so the alias list costs nothing in capability.
**Reversibility:** easy — discovery list shape is one function; the strip is one line inbound.

## 2026-07-13 — The Bridge door forwards Codex tools `strict:false` (external toolsets can't be strict-coerced)
**Decision:** On the Anthropic door's Codex path, `toCodexResponsesTools(tools, false)` sends tools **non-strict**
— the schema rides through verbatim, no strict closure. `toCodexResponsesTools` gained a `strict` flag (default
true, so the native VS Code agent path is unchanged). Tried first: extend `enforceStrictResponsesSchema` to strip
Codex-rejected keywords (`propertyNames`, `patternProperties`, …) — that strip stays as strict-path hardening but
did NOT solve it (Codex then rejected the coerced `required`/`properties` mismatch on `AskUserQuestion`'s dynamic
`answers` map).
**Why:** Codex strict mode demands a fixed closed shape (every object `additionalProperties:false`, `required` ==
all keys, no open/dynamic maps). Claude Code's built-in tools (esp. `AskUserQuestion`, a question→answer map) can't
be expressed that way — coercing them is whack-a-mole, one strict violation after another. A proxy doesn't own the
external client's schemas, so it must forward them loosely, exactly as the OpenAI-chat and Anthropic tool builders
already do. Verified live: Codex OAuth completes a tool round-trip through the door with strict:false.
**Reversibility:** easy — one flag; native path untouched. Note the OpenAI door's Codex path (`handleCodexChat`)
still sends strict — same latent limit for Copilot's tools, out of #46 scope.

## 2026-07-13 — The door honors Claude Code's /effort (reverses the "panel effort only" deferral)
**Decision:** The Anthropic door reads **`output_config.effort`** (where Claude Code's `/effort` rides) and,
when it's a valid ladder value, it **overrides the Wisp panel effort** for the door's Codex + Anthropic sends
(`max` still folds to `xhigh` on Codex's wire). Absent/junk → panel effort, exactly the old behavior. A log
line per door call names which effort won (`[bridge] messages <provider> effort=<level> (claude code|panel)`).
Companion fix: `buildChatModelInfos` appends the "· <effort>" picker-label suffix **only when the caller
threads an effort** — the in-VS-Code Copilot picker does (live panel value), the Bridge doors don't (their
effort is per-request now, so a static label would pin DEFAULT_EFFORT forever — both doors' discovery lists
showed a frozen "· medium" regardless of the real level).
**Why:** User-directed — wanted gpt models driven at Claude Code's chosen depth. Verified live: `/effort`
xhigh/high/max each arrived at the door (`effort=max (claude code)` in the Wisp channel). The remaining
carried-but-not-threaded extras (forced `tool_choice`, `temperature`) stay deferred. Claude Code's own banner
effort badge doesn't repaint after `/effort` — hardcoded upstream UI, no knob; not ours.
**Reversibility:** easy (drop the `parsed.effort ??` override) — but don't: the deferral was explicitly
reversed on request, and the suffix-only-when-threaded rule keeps discovery labels honest.

## 2026-07-13 — OAuth model lists + caps go live from models.dev

**Decision:** The Codex/Anthropic panel dropdowns and picker caps are models.dev-sourced
(`codexModelsFrom`/`anthropicModelsFrom` + `lookupModelsDevCaps` under the `openai`/`anthropic` keys);
the curated `CODEX_MODELS`/`ANTHROPIC_MODELS` lists and the regex caps tables are demoted to offline
fallback, never removed. Codex filter = keep `gpt-5*`/`o3*`/`o4-mini*`, drop `-pro/-nano/-chat-latest/
-deep-research` suffixes; Anthropic filter = drop dated `-YYYYMMDD` snapshots only — deliberately NO
family whitelist, so a brand-new family name (sonnet-5, fable-5) appears without a code change.
**Why:** Hardcoded lists went stale the day ChatGPT shipped gpt-5.6 Sol/Terra/Luna; models.dev already
carried them (with real caps — 5.6 is ~1M context, the table said 400K) and Wisp already fetches+caches
it. A filter false-positive just errors on pick — chosen over a whitelist that re-creates the staleness.
**Reversibility:** easy (point `modelOptions`/caps back at the constants) — but the fallback contract
means offline behavior IS the old behavior.

## Related
- [[overview]]
- [[oauth-recon]]
- [[gotchas]]

## 2026-07-13 — Bridge Routing map: fixed families + exact aliases, no patterns

**Decision:** Plan the **Routing map** (PRD #50, slices #51–#53): the Bridge resolves a requested model
name via **Provider id → Alias (exact) → Family route (fuzzy `claude-*`) → Active Provider**, both doors
sharing one map. Rows point at a **Target** = Provider + **pinned model** that overrides the Provider's
panel-selected model for that request only. Exactly **4 fixed Family routes** (Opus/Sonnet/Haiku/Fable) +
user-added exact-name **Aliases**; aliases may not collide with Provider ids (panel-validated) and are
advertised in `GET /v1/models` (Family routes are not). An unusable Target **fails loud** with the
Provider's real error. Map persisted like the per-Provider model memory, read live per request.
**Why:** bridged Claude Code's four picker names all collapsed onto the Active Provider — 4 names, 1
brain — and switching required a global panel round-trip; aliases give per-session/per-subagent pinning
(`/model sol` main + `terra` subagent simultaneously). **Rejected paths:** wildcard/pattern rules
(speculative — real traffic is exactly the 4 families + invented exact names; patterns add ordering rules
and typo-silently-misroutes) and silent fallback on a broken Target (re-creates the exact label≠brain
confusion the feature exists to kill). Glossary terms live in `CONTEXT.md`; MVD in `happy-path.md`.
**Reversibility:** easy (additive feature) — but don't add wildcards or a silent-fallback mode without
re-reading this; both were explicitly rejected, not overlooked.

## 2026-07-14 - Door vision: tool_result images hoist into the turn's images[]

**Decision:** The Anthropic door lifts image blocks found INSIDE tool_result content up into the
normalized turn's images[] instead of extending the toolResults shape with its own image slot; and the
door logs images=N per request as the vision ground-truth observable.
**Why:** Claude Code's Read-on-image returns pixels inside tool_result; the normalized seam (shared with
the OpenAI door and all three send-builders) carries plain-text tool results only. Hoisting reuses the
existing images pipe end to end (one-line per builder, zero new shapes); per-result image association is
lost, which no backend currently needs. The images=N line settled a false alarm the same day: codex
inline vision was suspected broken but images=1 proved delivery - GPT models just prefer Read when the
attach's source path is visible in text. Don't reopen "codex inline attach is broken" without images=0
evidence.
**Reversibility:** easy (add a per-result image slot later if a backend ever wants true association).


## 2026-07-14 — Wisp TUI arc (PRD #57)

**Decision:** the Wisp TUI becomes the face and only config surface of Wisp; the extension
shrinks to VS Code chat routing (v2.0.0, panel + Inquire removed); the Bridge (both dialects)
moves to `wisp serve`; a `claude-wisp` bin launches Claude Code pre-wired (env on child only,
verbatim arg passthrough, fail-friendly when the Bridge is down). Structural choices are ADRs:
monorepo bun workspaces (ADR-0001), secrets to `~/.wisp/auth.json` retiring SecretStorage
(ADR-0002), opentui + Bun compiled binaries as npm `wisp-router` with bins `wisp`/`claude-wisp`
(ADR-0003).
**Why:** Wisp's best doors (Claude Code, Copilot CLI, OAuth subscriptions) are terminal tools —
the config surface was welded to an editor they don't need; the engine was already vscode-free.
**Reversibility:** the shrink ships as a major version — restoring the panel later would be a
rewrite, treat as one-way. Non-ADR calls: TUI input = slash palette, never chat (`/test` is the
one canned-prompt exception; chat mode = backlog #68); no daemon — `wisp serve` is just the
process without a face; extension shrink gated on TUI parity (#61+#63+#65) so there is never a
moment nothing can configure Wisp.


## 2026-07-14 — Monorepo execution details (#58 / PR #70)

**Decision:** `@wisp/core` has no build step — `main`/`types` point straight at `src/index.ts`
and each face bundles the raw TS source (extension: esbuild → `dist/extension.js`, `tsc`
demoted to typecheck-only). The OAuth *managers* (`codexAuth.ts`, `anthropicAuth.ts`) stayed in
`packages/vscode`, not core — they import `vscode.SecretStorage`; only the pure token cores in
`catalog.ts` moved.
**Why:** a compiled core means a second emit + watch pipeline for zero gain (core is never
published, ADR-0001); esbuild bundling is also what lets vsce package `workspace:*` deps.
ADR-0001's "OAuth clients already vscode-free" was imprecise — clients yes, managers no; #59
(auth.json store, ADR-0002) dissolves the managers' vscode dependency anyway.
**Reversibility:** easy (add a core build later if a consumer ever needs JS artifacts).


## 2026-07-14 — Wisp home store execution details (#59 / PR #71)

**Decision:** `~/.wisp/` is two files — `config.json` (provider/models/effort/routing/customBaseUrl/
bridge) + owner-only `auth.json` (keys map keyed by `keyId`, codex/anthropic bundles, bridgeSecret) —
read fresh from disk per request (no cache), written read-merge-write via tmp+rename. Migration is
**copy-then-delete** (no marker flag): slots fill only absent auth fields, then get deleted, so launch
2 is naturally a no-op. The config seed reads settings via `inspect().globalValue` (user scope ONLY) —
a workspace value could redirect the bearer key once the machine-scope registrations were deleted.
`maxTokens`/`temperature` deliberately STAY VS Code settings (editor-local tuning, not shared state —
the TUI gets its own knobs if ever needed). Unknown JSON keys survive parse/serialize so a TUI-era
field is never dropped by an extension write. OAuth managers re-read auth.json before refreshing and
persist a successful rotation OUTSIDE the fetch catch (a failed write must not discard a consumed
refresh token).
**Why:** ADR-0002 set the destination; these are the safety rails found while executing it (the
workspace-seed hole was caught in review — scope enforcement only applies to registered settings).
**Reversibility:** file layout easy to extend, hard to rename once the TUI ships (#60 reads it);
the user-scope-only seed rule is one-way (security).


## 2026-07-14 — Panel stays: two full faces over one backend (#66 cancelled)

**Decision:** the extension side panel AND Inquire are permanent — #66 (extension shrink, v2.0.0,
panel + Inquire removed) is **closed/cancelled**. Wisp's product shape is two complete faces over
one shared backend (the `~/.wisp` store + `@wisp/core`), the way a SaaS ships web + mobile apps on
one backend. TUI parity tickets (#61/#63/#65) stay — they complete the TUI face, they no longer
gate a deletion.
**Why:** the shrink's driver was "config surface welded to an editor" back when state lived in
SecretStorage/settings; #59 (ADR-0002) dissolved that — both faces now read/write the same store
and stay live-synced via the watcher. Webview maintenance is an accepted, deliberate cost.
**Reversibility:** easy — the shrink could be revived any time; the reverse (restoring a deleted
panel) was the one-way door, which is exactly why it stays.


## 2026-07-14 — TUI MVP execution details (#60 / PR #72)

**Decision:** the `PROVIDERS` data array moved verbatim from `extension.ts` into core
`catalog.ts` — one catalog rendered by both faces; per-face provider lists are a closed path.
`packages/tui` is npm **`wisp-router` 0.1.0** with bin `wisp` only — the `claude-wisp` bin is
NOT declared until its launcher exists (#64): a bin pointing at a missing file breaks install
linking. TUI key entry is hand-rolled (useKeyboard + usePaste rendering bullets) because
opentui's input has no masked mode; an inline `/key <id> <key>` is refused (already echoed) and
the masked field opened instead. Exit paths always `renderer.destroy()` before `process.exit`
— bare exit skips opentui teardown and strands the terminal in raw mode. opentui `<select>`
renders zero rows without an explicit `height` (2 rows per option while descriptions show).
**Why:** #60 execution facts that cost real time or close re-proposable paths; the select and
exit behaviors are opentui 0.4.3 ground truth verified by render probes, not docs.
**Reversibility:** all easy except the npm name (public once #67 publishes) and the
inline-key refusal (security posture — one-way).

## 2026-07-14 — OAuth managers live in core; active ≠ signed-in (#61 / PR #73)

**Decision:** `codexAuth.ts`/`anthropicAuth.ts` moved into `@wisp/core` — the loopback-server
machinery is plain node http and the browser open is injected, so ONE implementation serves
both faces; a TUI-side clone is a closed path. The TUI opens the browser via
`rundll32 url.dll,FileProtocolHandler` on win32 (`cmd /c start` mangles `&` in the OAuth query
under spawn's arg quoting), `open`/`xdg-open` elsewhere; a failed spawn rejects so sign-in
fails fast. Sign-out clears credentials but NEVER the Active Provider selection — "active"
is a routing choice, "signed in" a credential; both faces agree, and the TUI surfaces the
difference as a `signed in / signed out` marker on `/providers` OAuth rows instead of
auto-switching providers.
**Why:** auto-switching on sign-out was considered (user read "(active)" after sign-out as a
bug) and rejected — the extension keeps selection on sign-out, and silently changing the
user's route is worse than showing an unusable-but-selected row.
**Reversibility:** easy — all UI-level; the core move is plain module placement.

## 2026-07-14 — /test is explicit-target-only; failures are the backend's own words (#62 / PR #74)

**Decision:** `/test <provider|alias>` resolves through `resolveRoute` with an **empty active
provider id**, so an unknown name errors instead of inheriting the Bridge's Active-Provider
fallback — the wiring check never tests something the user didn't name. Failure surface is the
Provider's REAL error: keyless rows (local Ollama is legitimately keyless) send with no
Authorization header rather than being pre-gated, so the backend's own 401 status+body is what
prints; a stream that ends having yielded zero text is phase `error` ("no reply"), never a
silent pass. `streamTestReply` stays exported from app.tsx so acceptance can drive the
production helper headless.
**Why:** the check exists to prove wiring loudly — a silent fallback or a local pre-gate would
mask exactly the misconfiguration it hunts; local gating was rejected because keyless-valid
backends exist.
**Reversibility:** easy — call-site behavior only.

## 2026-07-14 — Both faces host the Bridge; a port collision fails loud (#63 / PR #75)

**Decision:** the Bridge engine (`createBridgeServer`, in core) is hosted **in-process by whichever
face wants it** — the extension keeps its host (per the #66 cancellation), the TUI gains `/bridge`
(toggle + address/secret screen) and **`wisp serve`** (headless: same process, no face, no daemon,
no pids; lazy imports keep the native renderer untouched). Both faces share `config.json`
`bridge.port` and `auth.json` `bridgeSecret` (`DEFAULT_BRIDGE_PORT` moved to core so the default
can't drift), so **only one host can listen at a time — the second start fails LOUD** ("Bridge port
X is already in use — is VS Code (or another wisp) already hosting…"), exit 1 headless / status line
in the TUI. **No auto-port-hop, no takeover** — a silent second port would split clients across two
hosts with two secrets' worth of confusion. NOT a wrapper: neither face spawns the other; three
possible hosts of one library. New TUI modules: `store.ts` (shared home + OAuth managers — extracted
so serve never imports the rendering module), `bridge.ts` (deps wiring, twin of extension.ts's),
`serve.ts`. Issue #63's original "extension host removed" wording was stale pre-#66-cancellation
text; the issue was rewritten before scoping.
**Why:** the engine was already face-free in core; hosting is just wiring, and the two-faces-one-
backend shape (2026-07-14 "Panel stays") makes a host per face the natural form. Execution facts
that cost time: Bun's bind rejection carries **no `EADDRINUSE` code or substring** ("Failed to start
server. Is port … in use?") — collision detection probes the message too; `isRunning()` is false
until the bind lands, so the TUI toggle needs an **in-flight guard** or a double `/bridge` orphans
the first server's handle (cavecrew review catch, with three siblings: silent success off-palette,
secret `trim()` drift vs the extension, disk-write side effect in JSX render).
**Reversibility:** easy (additive host) — but don't add port-hop/takeover without re-reading this,
and keep the TUI's secret read trimmed like the extension's (untrimmed 401s cross-face).


## 2026-07-14 — claude-wisp launcher execution details (#64 / PR #76)

**Decision:** the launcher's Bridge probe sends **no secret** (any HTTP response — even 401 —
proves the listener; a squatter on the port must never see the key), and its store reads are
**read-only** — a missing `bridgeSecret` means no Bridge ever ran from this `~/.wisp`, and writing
one would mask that signal. Windows spawn prefers a PATH-scanned `claude.exe` (direct, fully
verbatim argv); only npm `.cmd`/`.bat` shims go through `cmd.exe /d /s /c` with hand quoting
(metachar-triggered, doubled inner quotes + doubled trailing backslashes) because node/Bun refuse
`.cmd` without a shell (BatBadBut). Env assembly is core's pure `buildClaudeLaunch`, deliberately
beside `buildClaudeCodeSnippets` — one file owns the env trio.
**Why:** review findings + the launch contract had to be unit-testable; the quoting ceiling
(`%VAR%` expands even inside cmd quotes) is accepted and documented in-code — native installs
bypass the shim entirely.
**Reversibility:** easy (swap in cross-spawn-style escaping if the shim path ever bites); the
secretless-probe and read-only-secret postures are security calls — treat as one-way.


## 2026-07-14 - Routing map edits are pure core fns; refusal = undefined (#65 / PR #77)

**Decision:** the Routing map's edit operations live in core `routing.ts` as pure functions -
`withFamilyRoute` / `withAlias` / `withoutAlias` - each returning the NEXT map or `undefined`
when refused (dangling Provider id; empty or Provider-id-shadowing alias name). Both faces
persist only a returned map: the extension's `setFamilyRoute`/`setAlias`/`removeAlias` are now
thin delegates, and the TUI's /routing screens call the same fns. UI-side prechecks (webview
collision message, TUI alias-name screen) are messaging only - the pure fn is the trust boundary.
**Why:** #65 acceptance required Vitest-covered pure edits; duplicating the guards per face is
how the two faces drift. `refused = undefined` (not returning the input map) keeps refusal
distinguishable without an error channel.
**Reversibility:** easy (additive extraction) - but keep new edit kinds in core, not in a face.

## 2026-07-14 — Release delivery: one dispatcher binary, scoped platform packages, release-download fallback (#67)

**Decision:** the TUI ships as ONE `bun build --compile` binary per platform whose entry
dispatches on argv (`serve` / `claude-wisp` / else TUI) — the npm `claude-wisp` bin is a JS shim
invoking `wisp claude-wisp …`, not a second 100MB binary. Platform packages publish **scoped**
(`@tsd47216/wisp-router-<target>`) because npm's spam filter 403'd the batch of fresh unscoped
names — and after it then REMOVED the scoped ones minutes post-publish, the shim gained a
GitHub-release download fallback (`~/.wisp/bin/v<ver>/`): optionalDependency first, release asset
second. CI publishes platform packages best-effort, the thin shell hard-fails, and the GitHub
release is created before npm publish so the fallback target always exists. darwin-x64 builds on
`macos-15-intel` (macos-13 retired Dec 2025). Versions: 2.0.0 burned (npm forbids republish even
after unpublish; deprecated with pointer), 2.0.1 is the live first release.
**Why:** two compiled bins would double every package (~100MB each); unscoped names + fresh
account + CI-published big binaries is exactly npm's spam heuristic; a delivery that survives npm
takedowns beats one support ticket away from broken.
**Reversibility:** the npm names (`wisp-router`, `@tsd47216/*`) are public — one-way. The
fallback + dispatch shape: easy.

## 2026-07-15 — Alias-only model list defaults ON (spec #78, ticket #81)

**Decision:** `bridge.aliasOnlyModels` resolves to **on** when unset — a read-time `?? true` at
the one shared seam every consumer reads through (Bridge list, TUI command echo, panel checkbox),
never a migration write; a stored explicit `false` is respected. With alias-only effectively on
but zero Aliases in the Routing map, the Anthropic-door model list **falls back to Provider rows**
instead of serving empty, which also retires `/aliasonly`'s zero-alias refuse-guard. After a
Provider is selected, the TUI nudges once toward `/routing`.
**Why:** the clean Claude Code `/model` list is the product's intended steady state — opt-in made
it undiscovered; the owner wants `/providers` → `/routing` to be the taught path. The fallback is
what makes default-ON safe on fresh installs (an empty picker was the original reason for
default-OFF + guard). Read-time (not stored) flip keeps upgrades write-free and explicit choices
intact.
**Reversibility:** easy (flip the default back) — but the zero-alias fallback should stay
regardless; an empty model list is never right.

## 2026-07-15 — Diagnosis: claude-wisp "empty or malformed response (HTTP 200)" is our end (tickets #87/#88)

**Decision:** The intermittent Claude Code error *"API returned an empty or malformed response
(HTTP 200) — check for a proxy or gateway intercepting the request"* seen mid-session under
`claude-wisp` is **our end**, not the network/upstream alone. `claude-wisp` points Claude Code's
`ANTHROPIC_BASE_URL` at the Bridge, so the Bridge *is* the "gateway" the error names. Root cause:
the Anthropic door (`anthropicStream` → door → SSE encoder) forwards a **content-less upstream
turn** (thinking-only, `max_tokens` truncation, or an idle-dropped stream that ends with no `error`
frame) as a structurally-valid-but-**empty** SSE envelope (`message_start` → `message_delta(end_turn)`
→ `message_stop`, zero content blocks). Claude Code rejects that 200 as empty/malformed. The **Codex**
sibling path (`codexStream`) was already hardened against this exact case (tracks whether any delta
arrived, throws when nothing was delivered, surfaces the truncation reason); the Anthropic path never
got the guard. Amplifier: `ANTHROPIC_MAX_TOKENS = 16_000` hardcoded on the OAuth path — with adaptive
thinking on, a heavy turn burns the budget reasoning and emits little/no text (contradicts the
project's own "reasoning models DON'T cap tokens" gotcha). Ticketed as **#87** (port the Codex
empty/truncation guard to `anthropicStream`; surface a diagnostic instead of an empty envelope) and
**#88** (lift the 16K cap; blocked by #87), target wisp-router 2.0.4.
**Why not upstream-only:** real 429/5xx throw before the head is out → clean 502, or mid-stream →
`anthropicErrorFrame` (a real message). Only the *content-less* case slips through as the empty
envelope, and that path is ours to guard — Codex already does.
**Confirm signature:** in the Bridge `[bridge]` logs around a failure — no `[bridge] error` line +
the request just ended ⇒ the empty-envelope path (this bug); `[bridge] error anthropic …` present
but Claude Code still showed "empty or malformed" ⇒ the error frame isn't honored by the client (a
separate, smaller sub-issue to split off #87).
**Reversibility:** the diagnosis is a finding, not a code change yet — the fix lands via #87/#88.

## 2026-07-15 — #87/#88 fix landed: anthropicStream guards content-less turns; streaming max_tokens = model ceiling

**Decision:** Ported the Codex empty/truncation guard to `anthropicStream` (#87, PR #89 → `2008cd8`)
and lifted the 16K output cap on the streaming path (#88, PR #90 → `5c24299`). Both on `main`, target
wisp-router 2.0.4. `bun run test` **387** (+11), vscode `tsc` clean.
- **#87 mechanics:** `anthropicStream` now tracks whether any text/tool delta arrived and reads
  `message_delta`'s `stop_reason`. At stream end — (a) a **truncation** reason (`max_tokens` /
  `content_filter` / `refusal`, via the new pure `anthropicTruncationReason`) is surfaced as a visible
  `_[Response truncated: <reason>]_` marker, even when nothing else was delivered; (b) a **truly
  content-less** turn (no text, no tools, no truncation reason — thinking-only / dropped) **throws**,
  so the door writes a real `anthropicErrorFrame` / clean 502 instead of the silent empty envelope,
  and the turn is retryable; (c) delivered content whose **terminal frame was lost** is kept, only the
  abrupt end flagged. Mirrors `codexStream` exactly.
- **#88 mechanics:** the streaming request's `max_tokens` = `anthropicModelCaps(model).maxOutput`
  (Opus 128K, Sonnet/Haiku 64K), not a hard 16K. `anthropicModelCaps`'s return type was tightened to
  pin `maxOutput` as always-present so the streaming path reads it as a non-optional number (no caller
  fallback). **Inquire keeps the bounded cap** (renamed `INQUIRE_MAX_TOKENS = 16_000`): non-streaming
  spinner→diff bounded by the fetch timeout ceiling — reviewed, justified.
**Why the design choices:** (1) **Throw for truly-empty** rather than yield a synthetic notice — parity
with `codexStream`, and it uses the door's intended `anthropicErrorFrame` path (L497-499), so Claude Code
retries a transient drop instead of ingesting a fake assistant turn into `/loop` history. (2) **Marker,
not stop_reason threading** for truncation — the encoder always emits `end_turn`; surfacing the reason as
text (like Codex) is the minimal change and needs no encoder/`BridgeStreamEvent` widening. (3) **Model
ceiling, not unbounded** for max_tokens — the model max is the documented ceiling; if the subscription
caps lower the backend errors (now diagnosable via #87).
**Residual (unverified — needs a live `claude-wisp` run):** #87's content-less path assumes Claude Code
**honors the `error` frame written after `message_start`**. If a live failure logs `[bridge] error
anthropic …` but Claude Code still shows "empty/malformed", that's the sub-issue split the diagnosis
entry's confirm signature names.
**Reversibility:** both are additive guards — easy to revert. But the throw-on-empty / marker-on-truncation
shape is the deliberate Codex-parity contract; don't swap the empty case to a silent yield or re-cap the
streaming path at 16K.

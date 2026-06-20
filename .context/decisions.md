---
type: decisions
project: wisp
updated: 2026-06-21
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

## Related
- [[overview]]
- [[gotchas]]

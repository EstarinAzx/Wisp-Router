---
type: gotchas
project: wisp
updated: 2026-06-17
tags: [context, gotchas]
---

# Gotchas

### No fill-in-middle (FIM) on the Zen endpoint
The provider exposes **only** OpenAI-compatible chat completions — there is no FIM/`suffix` route. Inquire prompts a *chat* model to rewrite a span (whole-file context → return only the replacement code). Don't go looking for a FIM endpoint to "do it properly"; it doesn't exist. This is also why latency is ~0.5–1.5s, not sub-100ms.

### Webview CSP × Tailwind v4
With a Vite **production** build, Tailwind compiles to a static linked stylesheet — no runtime `<style>` injection — so a strict CSP (`script-src 'nonce-…'; style-src ${cspSource}`) is enough. Only add `'unsafe-inline'` to `style-src` if the webview devtools console actually reports a violation. Don't pre-emptively loosen it.

### Two TypeScript configs must stay separate
The extension `tsconfig.json` keeps `include: ["src"]`. The webview's JSX lives under `webview/` with its **own** tsconfig (`jsx: react-jsx`, `jsxImportSource: preact`). If the extension `tsc` ever picks up the webview files it will fail on browser JSX/DOM types. `compile` runs both (`tsc -p ./ && tsc -p webview && vite build`) — Vite's esbuild transform does **not** type-check, so without the `tsc -p webview` step webview type errors ship silently.

### Vite asset names must be deterministic
The extension references the webview bundle by fixed path (`main.js` / `main.css`). The Vite config must disable hashing (`entryFileNames`/`assetFileNames` pinned, `cssCodeSplit:false`, `inlineDynamicImports:true`). Default hashed names will 404 in the webview.

### Config writes must target the defining scope, not always Global
`setModel`/`setProvider`/`setBaseUrl` use `cfg().inspect()` (via `targetFor()`) to write the scope that already defines the value. A blind `ConfigurationTarget.Global` write under a workspace override is silently ineffective and the controlled panel select snaps back. See `targetFor()` in `src/extension.ts`.

### Server error bodies can leak the key — sanitize before posting to the webview
`fetchModelIds` failures must not forward raw `String(err)` to the panel: OpenAI-style 401 bodies echo key fragments (`Incorrect API key provided: sk-…`). `sanitizeError` in `src/sidePanelProvider.ts` maps to a status-code string. The write-only-key rule covers error text too.

### Key is write-only across the webview boundary
Never post the API key value back to the webview — only a `keyIsSet` boolean. Invalidate the cached OpenAI client whenever the key is set or cleared.

### Model ids are BARE on `zen/go/v1` — the `opencode/` prefix is rejected
The chat endpoint returns `401 Model opencode/minimax-m3 is not supported` for a provider-prefixed id. Use the **bare** id exactly as `GET /models` serves it (`minimax-m3`, `glm-5`, `kimi-k2.6`, …). `DEFAULT_MODEL`, the setting default, and `fetchModelIds` must all stay bare. The `opencode/<id>` form (from the reference `llm-provider` and the public docs) does **not** work against this gateway — it had inline completions silently erroring the whole time. See [[decisions]].

### Served models are reasoning models — strip `<think>` and DON'T cap tokens
Most `zen/go` ids (minimax-m3, mimo, qwen3*, glm5*) emit chain-of-thought **inline** as `<think>…</think>`, then the real answer. Two consequences: (1) `stripThink` (in `src/catalog.ts`, composed into `extractEditText`) must drop the block (and treat an unterminated `<think>` as "no answer yet" → return nothing) or the Inquire edit is the model's thinking; (2) a low `max_tokens` cap starves the answer — the model spends the budget thinking and never reaches code. `maxTokens` default is therefore `0` (uncapped); `max_tokens` is omitted from the request unless set `>0`. For snappy edits use a non-reasoning id (`deepseek-v4-flash`, `kimi-k2.6`). See [[decisions]].

### Output-channel logs persist on disk — read them to debug a user's error
`OutputChannel` content is written to `%APPDATA%\Code\logs\<session>\window<n>\exthost\output_logging_<ts>\<n>-Wisp.log`. When the user can't surface the Output panel, glob the newest matching file and grep `[error]` instead of walking them through the UI. This is how the `401 … not supported` cause was found.

### Packaging ships node_modules — bundling is optional (size only)
**Empirically verified:** `vsce package` includes production `dependencies`, so `node_modules/openai` is inside the `.vsix` and the extension runs installed without esbuild/webpack. (The earlier claim that it "won't ship without bundling" was wrong.) Bundling remains worth doing later to shrink the package — the unbundled `.vsix` is ~1402 files / 2.33 MB and vsce warns about it — but it is not a correctness blocker.

### Ollama Cloud base URL is `/v1`, NOT `/api/v1`
Ollama Cloud (`ollama.com`, the **hosted** service — distinct from local `localhost:11434`) is
OpenAI-compatible at `https://ollama.com/v1`. The `/api` prefix (`/api/chat`, `/api/tags`) is Ollama's
**native** protocol and breaks the OpenAI SDK. Use `/v1` for the catalog row; key env var
`OLLAMA_API_KEY` (Bearer). Local Ollama needs no key. Verified 2026-06-15 (multi-provider research).

### The Provider selector is a key-redirect vector — keep `wisp.provider` machine-scoped
`wisp.provider` selects which base URL the bearer API key is sent to, so it carries the exact threat
`wisp.baseUrl` does: a workspace-overridable selector lets a hostile repo redirect the key to an
attacker endpoint. `wisp.provider` MUST stay `"scope": "machine"`, and built-in base URLs MUST live in
code (the `PROVIDERS` catalog), never in settings. Custom's `wisp.baseUrl` is the only user-supplied
URL, also machine-scoped. Don't relax either without re-reading the 2026-06-15 multi-provider ADR.

### Cline ToS, and why Copilot/Cursor were dropped
Cline's ToS §2.2 bars use "to develop competing products… or otherwise to our detriment." Ship the Cline
Provider **user-supplied-key only** (never an embedded/shared/proxied key) + a one-line in-panel note
that the user owns their ToS compliance. **GitHub Copilot** and **Cursor** were dropped entirely —
Copilot's only path is reverse-engineered client impersonation (account-ban risk); Cursor's API is
shape-incompatible (no `/chat/completions`) and "auth-only" use means session-token piggybacking (ToS
violation). Don't re-add them as "OAuth providers" — OAuth doesn't fix *why* they fail. See the
2026-06-15 ADR.

### Unit-testable logic must live vscode-free in `catalog.ts`, not in `extension.ts`
`extension.ts` imports `vscode` (and `openai`) at the top, so a plain Vitest/Node test can't import it —
there's no Extension Development Host outside VS Code, so the import throws. Pure, unit-testable logic
therefore lives in `src/catalog.ts`, which **imports nothing**: `resolveModel`, `resolveBaseUrl`,
`planLegacyMigration` (the migration's decision as a pure plan; `extension.ts` applies it), and the
Inquire helpers `buildEditPrompt` / `extractEditText` (`stripThink` + `stripFences`). The
`extension.ts` wrappers read VS Code state and delegate. Don't fold this logic back inline "to keep it
together" — it becomes untestable. Tests are kept out of the extension build via `tsconfig` `exclude:
["src/**/*.test.ts"]`. Run `npm test`. See [[decisions]].

### Don't make the Inquire edit span the whole file — the model mangles untouched code
Inquire sends the whole file as **context** but the edit replaces only the **target span** (selection /
current-line). A mid-session experiment widened the no-selection span to the whole file so the model
could "edit anywhere" — but a whole-file **re-emit** makes the model drop/reformat unrelated lines; the
B2 diff faithfully renders the damage and **Accept would apply it → data loss**. `diffLines` is correct
(it showed a minimal diff of a mangled reply). Caret-agnostic "edit anywhere" is delivered safely by the
**SEARCH/REPLACE edit-blocks** slice (#8), which emits only changed regions. Don't reintroduce whole-file
re-emit as the edit path. See [[decisions]] 2026-06-17 edit-fidelity entry.

### Edit blocks are flaky with reasoning models — the failure is SAFE, and retry usually works
Inquire's SEARCH/REPLACE matching is **exact** (EOL-agnostic only, no whitespace-fuzz). Reasoning models
don't reliably copy code verbatim, so a given run can: return a SEARCH that isn't byte-present → all
blocks miss → **"could not locate the text to edit"**; or return no blocks at all → **"nothing to
change"**. Re-running the same instruction usually yields a matching block (it's model variance, not a
parser bug — confirmed in F5: one run missed, the reload+retry passed). This is **by design** — a miss
is surfaced and skipped, never force-matched, so the file is never corrupted (no data loss). Don't "fix"
the flakiness by loosening to fuzzy/trimmed matching reflexively — that trades a safe miss for a
wrong-region false match. The fuzzy-matching fork is deferred; take it only if misses prove frequent in
real use. The throwaway `[debug]` reply/`trimmedMatch` instrumentation in `inquire` (used to tell
indent-drift from paraphrase) was removed after diagnosis — re-add it the same way if revisiting. See
[[decisions]] 2026-06-17 edit-blocks-built entry.

## Related
- [[api]]
- [[decisions]]
- [[overview]]

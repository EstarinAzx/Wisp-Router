---
type: gotchas
project: opencode-autocomplete
updated: 2026-06-10
tags: [context, gotchas]
---

# Gotchas

### No fill-in-middle (FIM) on the Zen endpoint
The provider exposes **only** OpenAI-compatible chat completions — there is no FIM/`suffix`/completion route. The extension prompts a *chat* model to act as a completer (`prefix<CURSOR>suffix` → return only the insertion). Don't go looking for a FIM endpoint to "do it properly"; it doesn't exist. This is the root reason latency is ~0.5–1.5s, not sub-100ms.

### Chat models echo the current line → doubled ghost text
A chat model frequently returns the line it's completing (`const x = ` → `const x = 42`), which renders as `const x = const x = 42`. The `stripPrefixOverlap` step in `src/extension.ts` trims the longest prefix-tail the suggestion repeats. The system prompt alone does **not** prevent this — keep the trim.

### Debounce is the cancellation token, not a manual timer
The provider `await delay(debounceMs)` then checks `token.isCancellationRequested`. VS Code cancels the token on the next keystroke, so abandoned requests bail before hitting the network. Don't "fix" this into a standalone debounce timer — it would double-fire.

### (Planned) Webview CSP × Tailwind v4
With a Vite **production** build, Tailwind compiles to a static linked stylesheet — no runtime `<style>` injection — so a strict CSP (`script-src 'nonce-…'; style-src ${cspSource}`) is enough. Only add `'unsafe-inline'` to `style-src` if the webview devtools console actually reports a violation. Don't pre-emptively loosen it.

### (Planned) Two TypeScript configs must stay separate
The extension `tsconfig.json` keeps `include: ["src"]`. The webview's JSX lives under `webview/` with its **own** tsconfig (`jsx: react-jsx`, `jsxImportSource: preact`). If the extension `tsc` ever picks up the webview files it will fail on browser JSX/DOM types.

### (Planned) Vite asset names must be deterministic
The extension references the webview bundle by fixed path (`main.js` / `main.css`). The Vite config must disable hashing (`entryFileNames`/`assetFileNames` pinned, `cssCodeSplit:false`, `inlineDynamicImports:true`). Default hashed names will 404 in the webview.

### Key is write-only across the webview boundary
Never post the API key value back to the webview — only a `keyIsSet` boolean. Invalidate the cached OpenAI client whenever the key is set or cleared.

### Not bundled for packaging
The extension builds with plain `tsc`; `openai` is loaded from `node_modules` at runtime (fine for F5). For `vsce package`, add esbuild/webpack bundling first or the dependency won't ship.

## Related
- [[api]]
- [[decisions]]
- [[overview]]

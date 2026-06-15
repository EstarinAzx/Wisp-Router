# The inline-completion provider — where it lives and how it is wired

**TL;DR:** It is the **`vscode.InlineCompletionItemProvider`** in `src/extension.ts`,
and it runs in the **extension host** (Node, CommonJS, `out/extension.js`).
The side panel is a *different* provider — a `vscode.WebviewViewProvider` living
in `src/sidePanelProvider.ts`. They share the word "provider" only because of
the VS Code interface name.

---

## 1. The provider object itself

In `src/extension.ts`, near the bottom of the file under the
`// ----------------------------- Provider ----------------------------- //`
banner, there is a top-level `const`:

```ts
const provider: vscode.InlineCompletionItemProvider = {
  async provideInlineCompletionItems(document, position, context, token) {
    // ...runs on every keystroke VS Code decides to query...
  },
};
```

That single async method (`provideInlineCompletionItems`) is the hot path —
VS Code calls it whenever it wants ghost text. Inside it:

```
gating (enabled? no IntelliSense open? no selection? non-empty prefix?)
  → buildContext(document, position)            // {prefix, suffix}
  → single-entry cache hit? return lastResult   // (model + prefix + suffix keyed)
  → await delay(debounceMs); token.isCancellationRequested? bail
  → getClient()                                 // cached OpenAI instance
  → enterInFlight()   // bumps inFlight, paints status bar, posts activity to panel
  → client.chat.completions.create({...})       // non-streaming chat completion
  → stripThink → stripFences → stripPrefixOverlap → relocateAfterComment
  → output.appendLine(`${model} ${ms}ms ${chars}c`)   // latency log
  → cache + return [new vscode.InlineCompletionItem(text, range)]
  → exitInFlight()                              // paints status bar, posts activity to panel
```

The order matters:

- **Debounce via the cancellation token.** `await delay(debounceMs)` then
  `token.isCancellationRequested` — VS Code cancels the token on the next
  keystroke, so abandoned requests bail *before* hitting the network. There is
  no standalone debounce timer.
- **`AbortController` bridge.** `token.onCancellationRequested(() => controller.abort())`
  is plumbed into the OpenAI SDK's `signal` option, so a stale request also
  kills the HTTP call in flight.
- **`enterInFlight` / `exitInFlight`** are the only things that touch the
  status bar and the side panel's `activity` ping — see [the cleanup
  pipeline](#3-the-cleanup-pipeline-stripthink--stripprefixoverlap--relocateaftercomment)
  for what they do, and `decisions.md` ("Panel activity indicator via a
  dedicated `activity` message") for why `activity` is its own message and not
  folded into `state`.
- **Single-entry cache** keyed by `model + prefix + suffix`. VS Code re-queries
  on cursor moves and re-renders, not just keystrokes; one entry erases that
  waste cheaply.
- **Logging** to a dedicated `OutputChannel` (`Wisp`) in the
  format `<model> <ms>ms <chars>c` so you can compare models and tune the
  latency budget.

---

## 2. Where it is registered

The provider object is registered in `activate()`, again in
`src/extension.ts`. It's one line in the `context.subscriptions.push(...)`
call:

```ts
context.subscriptions.push(
  output,
  statusBar,
  // Match every file; narrow with a language selector if you want per-language control.
  vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider),
  vscode.window.registerWebviewViewProvider(WispPanelProvider.viewId, panel),
  vscode.commands.registerCommand('wisp.setApiKey', setApiKey),
  vscode.commands.registerCommand('wisp.listModels', listModels),
  vscode.commands.registerCommand('wisp.toggle', toggle),
  // ...the two config/secrets listeners...
);
```

Notes:

- `{ pattern: '**' }` means **every file** is matched. There is no language
  selector — `decisions.md` calls this out as deliberate ("Trigger gating:
  sensible, not aggressive").
- Registration is one-shot. Once `activate()` returns, VS Code holds the
  reference; you never re-register.
- `context.subscriptions.push(...)` means VS Code disposes the provider when
  the extension deactivates, but for a registered provider that is effectively
  a no-op — you can't actually un-register it from VS Code's pool.

---

## 3. Two "providers" — don't conflate them

| Name | Type | File | Purpose |
|---|---|---|---|
| `provider` | `vscode.InlineCompletionItemProvider` | `src/extension.ts` | The thing that returns ghost text on each keystroke. |
| `WispPanelProvider` | `vscode.WebviewViewProvider` | `src/sidePanelProvider.ts` | The side panel: HTML shell, strict CSP, message routing. |

They are wired to **the same shared actions** (`storeApiKey`, `clearApiKey`,
`fetchModelIds`, `setModel`, `setEnabled`, `getState`, `getActivity`) — so the
command palette and the panel cannot drift out of sync. The pattern is **host
injection**: `extension.ts` constructs the panel and passes the helpers in as
the `PanelHost` argument, so the panel file has no `import` of `extension.ts`
and there is no circular import.

---

## 4. Reading order, if you want to follow the request end-to-end

1. `src/extension.ts` — top to bottom: constants → module state → config/key
   resolution → text utilities → comment-line guard → status bar → **provider
   block** → shared actions → commands → `activate()`.
2. `src/sidePanelProvider.ts` — short: types → `sanitizeError` →
   `WispPanelProvider` (`resolveWebviewView` / `postState` / `postActivity`
   / `onMessage` / `renderHtml`).
3. `webview/app.tsx` — the message reducer in `useEffect`, then the JSX:
   activity row → key → model picker + refresh + free-text override → enabled
   checkbox → footer (`baseUrl`).

The cleanup pipeline (`stripThink` → `stripFences` → `stripPrefixOverlap` →
`relocateAfterComment`) is the densest section of `extension.ts` and the one
with the most history — see `decisions.md` ("Comment-line clunk: deterministic
guard, not prompt-only") for the adversarial review and `gotchas.md` for the
load-bearing gate trio (whole-line comment, known language, strict EOL).

---

## Related

- [[overview]] — project shape, where each piece lives.
- [[api]] — the provider's surface: commands, settings, message protocol.
- [[stack]] — `openai` is the only runtime dep; webview is Preact + Tailwind v4.
- [[decisions]] — design-review history, including the bare-id / uncapped-tokens
  corrections and the activity-message split.
- [[gotchas]] — landmines (two tsconfigs, Vite deterministic output, comment
  guard gates, write-only key).

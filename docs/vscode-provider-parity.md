# VS Code provider behavior

## Antigravity

The account controls and command-palette sign-in/out use the same core OAuth manager and shared Wisp
store as the terminal. One flow per manager is allowed; the registered loopback port is fixed at 51121.
A concurrent flow in another process fails on the port bind. A sign-out or account replacement while
sign-in is pending invalidates the result instead of letting it overwrite the newer store state.
Sign-out writes a unique tombstone generation. Legacy empty tombstones are marked before browser
sign-in begins, so repeated sign-outs, including an older client's empty tombstone, invalidate the flow.

The panel consumes the OAuth-discovered model list. Automatic loading, including token refresh and
project preparation, has a four-second fallback to
the shared catalogue. Explicit refresh uses refreshed credentials and surfaces discovery failures;
manual IDs and prior options remain available. Model results are correlated with their provider and
request plus an opaque credential version, and older state snapshots are discarded after a newer request.
Account or nonempty key replacement clears accepted lists and routing caches, even when the signed-in
boolean stays true. A process-local HMAC versions credentials without exposing them to the webview.

Native chat adapts the shared Cloud Code stream: text, supported image inputs, tool definitions,
required tool mode and tool results. Original tool-call IDs survive continuation. A missing ID is an
error, not an invented ID. Cancellation aborts transport; incomplete streams report failure. A truncated
reply is labelled and its tool calls are not executed. The initial supported set is the shared
`ANTIGRAVITY_MODELS` text catalogue; being listed does not establish account entitlement or upstream
availability. New discovered IDs still appear in the side panel, with an explanation if native chat
has not qualified them. Inquire is a separate editor command and remains unavailable for Antigravity.

Argon and image-output models are not advertised or dispatched by native chat. Argon's qualified
Bridge Responses adapter preserves encrypted native parts, thought signatures, original IDs and
conversation/account bindings. The installed VS Code API accepts `LanguageModelDataPart` in both
request and response types, but does not specify that Copilot preserves arbitrary opaque parts across
persistence, regeneration and compaction. Therefore those types alone are insufficient evidence to
enable Argon. Qualification would need an isolated host test of that complete roundtrip and replay
validation; no real-account request was used for this change.

## Codex context

The account catalogue's `context_window` is the default. `max_context_window` is retained separately as
the ceiling for an explicit override, including in the account-scoped cache. Neither a model name nor
public API metadata raises the subscription-route context budget.

Optional VS Code user setting (example, not applied automatically):

```json
"wisp.codexContextWindows": { "gpt-6-astra": 512000 }
```

An override uses the exact selected model ID and must be a safe integer of at least 2. Invalid values
are ignored. It cannot exceed the discovered maximum; a stale cache without a maximum cannot expand
above its known default. Without an override, the default remains active. For example, metadata with
default 272000 and maximum 872000 stays at 272000 by default; requesting 1000000 yields 872000. This
configures Wisp's budget, not service entitlement. The tooltip shows the requested and effective values.

VS Code displays the sum of input and output budgets. Wisp reserves output within the total and never
adds output capacity on top of the selected window. Unknown model metadata uses the existing conservative
fallback and labels that uncertainty. Refresh Codex models to update old account metadata.

Native Codex's configuration is independent and is not read or modified by this extension. OpenAI's
[configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) describes
`model_context_window` for that client. The [Astra API specification](https://developers.openai.com/api/docs/models/gpt-6-astra)
lists 1,050,000 tokens for the API model; it does not establish that total for an OAuth subscription route.

## Synthetic checks

Core Vitest includes `vscodePanel.test.ts`, `vscodeExtension.test.ts` and `vscodeChat.test.ts`: the actual
extension registration and host dispatch, real transport payloads with intercepted fetch, temporary
Wisp stores, and account/context regression tests. The external VS Code API is a test double.

After `bun run compile`, serve `packages/vscode` on loopback and open `tests/webview-harness.html`.
Run `await window.harness.run()` in its browser console. It mounts the built Preact app and checks
account controls/pending/errors, discovery/refresh, provider switching and the unsupported-model hint.
It uses synthetic messages only. No live account, installed extension or running client is modified.

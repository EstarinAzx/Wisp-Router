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

Native chat uses one shared Cloud Code adapter for Antigravity text/chat models, including newly
discovered IDs such as Carbon. There is no per-model native allowlist. Choose the model in Wisp's
dropdown, then reopen the native chat picker. Being listed does not establish account entitlement or
upstream availability. Image-generation models remain refused because the adapter has no image-output
channel. Inquire is a separate editor command and remains unavailable for Antigravity.

The adapter requires VS Code 1.145.3 or newer and supports text, user image inputs, tool definitions,
required tool mode and text tool results. Original tool-call IDs survive continuation; a missing ID is
an error, not an invented ID. Replies are buffered until the complete native response is validated,
before any tools are handed to VS Code. Cancellation aborts transport; incomplete or truncated responses
fail without executing their tool calls. Response structure is validated independently of model names.
The Bridge's existing Argon qualification remains separate from this native chat path.
Native requests retain the same request ID and body when failing over an explicit capacity rejection;
ambiguous transport failures and rate limits are not automatically retried.

Native context, output limits and image-input capability come from the account's
`fetchAvailableModels` metadata (`maxTokens`, `maxOutputTokens`, `supportsImages`). Input and output
budgets sum to the reported context window; output is reserved within it, not added on top. Invalid
limits are ignored. A missing or slow catalogue uses the conservative 128,000-token fallback and says so
in the model tooltip. Discovery, including credential preparation, has a four-second fallback and is
not cached across accounts. Explicit model refresh also refreshes the native descriptor.
The account is checked again after all discovery awaits; signed-out or replaced accounts do not retain
stale native rows. The descriptor's validated output reserve also takes precedence over legacy static
caps in the outgoing request.

Each assistant turn carries an AES-GCM encrypted packet in Copilot's `stateful_marker` data
part. It contains the original model parts, thought signatures and tool IDs, bound to the account,
endpoint, exact model and Copilot conversation identity. The account's refresh token supplies secret key
material with a separate native-chat domain label; no Bridge start or Bridge secret is needed.
Restored assistant text and tool calls must match the authenticated native parts before transport.
System instructions stay system instructions, and positioned mid-conversation system turns are refused
rather than silently moved. Credential changes during generation suppress delivery.

VS Code's **Local** session mode sends a previous-response marker plus incremental input, rather than
the full conversation. Wisp restores that path from an in-memory cache bounded to 32 checkpoints and
16 MiB of serialized history. Markers are authenticated for the account, model and conversation before
cache access; new leading instructions replace the cached ones. Local chats require a new conversation
after extension reload or cache eviction. No conversation files or extra credentials are written.
Classic Copilot history continues to use its self-contained encrypted packets without depending on
that cache. Both paths report the validated upstream prompt, output and reasoning token counts.

The carrier is a pinned Copilot compatibility contract, not a promise about arbitrary custom MIME
parts. Inspected source at VS Code commit `dcd3ad6e368fbe19d03f37054a40dbaf40d676f4`:
[response and request conversion](https://github.com/microsoft/vscode/blob/dcd3ad6e368fbe19d03f37054a40dbaf40d676f4/extensions/copilot/src/platform/endpoint/vscode-node/extChatEndpoint.ts),
[marker encoding](https://github.com/microsoft/vscode/blob/dcd3ad6e368fbe19d03f37054a40dbaf40d676f4/extensions/copilot/src/platform/endpoint/common/statefulMarkerContainer.tsx),
and [persisted tool rounds](https://github.com/microsoft/vscode/blob/dcd3ad6e368fbe19d03f37054a40dbaf40d676f4/extensions/copilot/src/extension/prompt/common/toolCallRound.ts).
The [Local handler](https://github.com/microsoft/vscode/blob/dcd3ad6e368fbe19d03f37054a40dbaf40d676f4/src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostByokLmHandler.ts)
and its [incremental proxy](https://github.com/microsoft/vscode/blob/dcd3ad6e368fbe19d03f37054a40dbaf40d676f4/src/vs/platform/agentHost/node/copilot/byokLmProxyService.ts)
establish the separate reference-only continuation shape.
Those source functions were exercised with synthetic rounds, and an isolated VS Code 1.145.3 host
passed advertisement, actual `vscode.lm` transport, JSON-restored encrypted state, classic and Local-shaped
tool continuation, and rejection of an altered tool-result ID before another transport call.

Copilot deliberately removes old markers when its summary generation changes. A summary-only request
can start a new chain; retained assistant history without its state is refused with a new-chat message.
Changing accounts or models also requires a new chat. Packets are limited to 64 KiB before encryption,
and encrypted bytes count conservatively toward the estimated token budget. Automated generation tests
intercept provider I/O; advertising upstream limits is not a full-window generation qualification.
Live coverage of every model and interactive Copilot compaction remain unverified.

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

Core Vitest includes `vscodePanel.test.ts`, `vscodeExtension.test.ts`, `vscodeChat.test.ts` and
`vscodeArgon.test.ts`: the actual
extension registration and host dispatch, real transport payloads with intercepted fetch, temporary
Wisp stores, and account/context regression tests. The external VS Code API is a test double.

After `bun run compile`, serve `packages/vscode` on loopback and open `tests/webview-harness.html`.
Run `await window.harness.run()` in its browser console. It mounts the built Preact app and checks
account controls/pending/errors, discovery/refresh, provider switching and the unsupported-model hint.
It uses synthetic messages only. No live account, installed extension or running client is modified.

`packages/vscode/tests/argon-host.cjs` is an additional real extension-host check. Launch it through
VS Code's `--extensionTestsPath` with this package as `--extensionDevelopmentPath`, separate empty
`--user-data-dir`/`--extensions-dir` directories, and a temporary `WISP_HOME`. The test refuses to run
without `argon-host-test.txt` containing `synthetic-only` and the exact synthetic credential fixture
declared at its top. Set the temporary config to provider `antigravity` and model
`gemini-4-argon-high`; disable the built-in Copilot extension in that test process. It invokes Wisp's
real registered model through `vscode.lm`, intercepts every provider fetch and writes `receipt.json`.
It tests both full-history and Local marker-only continuation. It never invokes a real tool or changes
an installed Wisp extension.

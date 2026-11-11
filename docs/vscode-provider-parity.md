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
auto tool selection and text tool results. Original tool-call IDs survive continuation; a missing ID is
an error, not an invented ID. Replies are buffered until the complete native response is validated,
before any tools are handed to VS Code. Cancellation aborts transport; incomplete or truncated responses
fail without executing their tool calls. Cloud Code reports Claude tool-use completion as `OTHER`.
Native chat accepts that case only when the returned model version exactly matches the requested
Claude model and the complete response contains well-formed tool calls. Unknown tools, missing IDs,
invalid arguments, missing usage, truncation and safety stops still fail before output is delivered.
The Bridge's Argon validator remains `STOP`-only.
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
part and the SDK's reasoning `encrypted_content`. Both contain the same packet; no plaintext thinking
is emitted. It contains the original model parts, thought signatures and tool IDs, bound to the account,
endpoint, exact model and Copilot conversation identity. The account's refresh token supplies secret key
material with a separate native-chat domain label; no Bridge start or Bridge secret is needed.
Restored assistant text and tool calls must match the authenticated native parts before transport.
System instructions stay system instructions, and positioned mid-conversation system turns are refused
rather than silently moved. Credential changes during generation suppress delivery.

VS Code's **Copilot SDK / Agent Host** sends a previous-response marker plus incremental input during
tool continuation. Wisp restores that path from an in-memory cache bounded to 32 checkpoints and
16 MiB of serialized history. Markers are authenticated for the account, model and conversation before
cache access; new leading instructions replace the cached ones. An incremental continuation requires
a new conversation after extension reload or cache eviction. Between user turns, the SDK sends full
history without response-ID markers; encrypted reasoning packets restore the original parts without
that cache. Classic **Local** history keeps its self-contained marker packets. If a host returns both
carriers, they must match; duplicates or conflicting packets are refused. No conversation files or
extra credentials are written. Both paths report validated upstream usage.

The carrier is a pinned Copilot compatibility contract, not a promise about arbitrary custom MIME
parts. Inspected source at VS Code commit `dcd3ad6e368fbe19d03f37054a40dbaf40d676f4`:
[response and request conversion](https://github.com/microsoft/vscode/blob/dcd3ad6e368fbe19d03f37054a40dbaf40d676f4/extensions/copilot/src/platform/endpoint/vscode-node/extChatEndpoint.ts),
[marker encoding](https://github.com/microsoft/vscode/blob/dcd3ad6e368fbe19d03f37054a40dbaf40d676f4/extensions/copilot/src/platform/endpoint/common/statefulMarkerContainer.tsx),
and [persisted tool rounds](https://github.com/microsoft/vscode/blob/dcd3ad6e368fbe19d03f37054a40dbaf40d676f4/extensions/copilot/src/extension/prompt/common/toolCallRound.ts).
The [Agent Host handler](https://github.com/microsoft/vscode/blob/69047191fc427f2f92828279aae1d90d8eeda7ab/src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostByokLmHandler.ts)
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

On 2026-11-12, the installed VS Code 1.146.0 (`69047191fc`) / Copilot 0.74.0 SDK harness reproduced
both failures in an isolated development host with live Antigravity transport: Claude tool calls ended
with `OTHER`, and a Carbon conversation lost its marker on the next user turn. After correction,
`gemini-4-carbon-high` and `claude-opus-5-5-high` each read a controlled workspace file, returned its test
word, and answered a subsequent user turn. The actual UI and Agent Host requests were observed;
these are distinct from synthetic `vscode.lm` tests. Account entitlement and other model variants are
not established by those probes. A separate direct Claude forced-tool (`ANY`) probe returned HTTP 400;
the qualified harness uses automatic tool selection. Existing conversations whose packets were already
lost need a new chat.
The separate classic Local UI requested GitHub sign-in in the isolated profile, so its live probe
stopped before provider transport. Its real VS Code API path passed with synthetic provider I/O;
that does not establish a signed-in Local UI tool cycle.

## Codex context

Native chat automatically uses the account catalogue's `max_context_window`, falling back to
`context_window` when no maximum is reported. Both values remain separate in the account-scoped cache
and tooltip, so the native client's conservative default is not mistaken for the supported maximum.
Neither a model name nor public API metadata raises the subscription-route context budget.

Optional VS Code user setting (example, not applied automatically):

```json
"wisp.codexContextWindows": { "gpt-6-astra": 512000 }
```

An override uses the exact selected model ID and must be a safe integer of at least 2. Invalid values
are ignored. It cannot exceed the discovered maximum; a stale cache without a maximum cannot expand
above its known default. For example, metadata with default272000 and maximum872000 automatically uses
872000; an override of512000 lowers it, and an override of1000000 remains capped at872000. This
configures Wisp's budget, not service entitlement. The tooltip shows the default, maximum and effective
policy. Native Codex configuration and Bridge status accounting are unchanged.

VS Code displays the sum of input and output budgets. Wisp reserves output within the total and never
adds output capacity on top of the selected window. Unknown model metadata uses the existing conservative
fallback and labels that uncertainty. Refresh Codex models to update old account metadata.

Native Codex's configuration is independent and is not read or modified by this extension. OpenAI's
[configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) describes
`model_context_window` for that client. The [Astra API specification](https://developers.openai.com/api/docs/models/gpt-6-astra)
lists 1,050,000 tokens for the API model; it does not establish that total for an OAuth subscription route.

## Native Responses tool schemas

Codex and Grok preserve the native client's tool schemas with explicit `strict: false`. MCP tools can
have optional fields and open-ended maps, such as Pylance's LSP `params`; forcing those into closed
strict objects can reject the entire request or remove valid tool arguments. Existing Bridge callers
retain their explicit strict/non-strict choice. Callers that explicitly request strict conversion get
defined `properties` even for empty objects. Tool permissions and execution remain with the native host.

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
It tests classic full-history, Agent Host marker-only continuation and persisted SDK encrypted reasoning.
It never invokes a real tool or changes
an installed Wisp extension.

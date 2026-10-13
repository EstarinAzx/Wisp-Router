# Provider cache forwarding and diagnostics

Responses requests preserve an explicit `prompt_cache_key` when routed through Codex, Grok or the common API-key adapter. Wisp does not invent a key or derive conversation identity from it. The destination must support the forwarded OpenAI-compatible field; forwarding does not guarantee cache hits.

Grok proxy requests reuse the caller's validated session UUID from Responses headers or Claude Messages metadata. Calls without valid identity retain a fresh per-request UUID. Public Grok models do not receive the proxy-only conversation header.

## Antigravity records

When a Bridge built with these changes runs, its normal `bridge.log` gains two JSON records per accepted Antigravity request:

- `[bridge] antigravity cache-request`: generated `requestId`, model, `sessionHash`, `systemHash`, `toolsHash`, `configHash`, full `contentsHash`, content count and `contentHashes`.
- `[bridge] antigravity cache-usage`: the same `requestId`, `ended` and the actual normalized `usage`, or `null` when unavailable.

The log is in the Wisp home, normally `~/.wisp/bridge.log`; `WISP_HOME` overrides that directory. Host-attempt lines include the same request ID, so daily/production fallback remains distinguishable. A failure before a response opens has request/host records but no usage record.

Fingerprints describe the final outbound payload. They use a random, process-local HMAC key that is never logged. They compare equal within one process, change after restart, and reveal no raw prompt, tool definition, image, credential, project ID or upstream session ID. Only the first 128 contents have individual fingerprints; `contentsHash` covers the entire history.

## Reading the records

Compare requests with the same model, session fingerprint and upstream host. A changed system/tool/config fingerprint identifies a changed prefix component. For growing conversations, compare the old content fingerprints against the same positions in the next request. A changed full-history hash alone is expected when new turns are appended.

`usage.input_tokens` is uncached input; `cache_read_input_tokens` is the cached part. Add them to obtain the reported prompt total on this wire. Wisp reports cache creation as zero because this upstream mapping does not supply that count; zero is not evidence that the backend made no writes.

A flat cached count alongside growing input makes a plateau visible. Stable component fingerprints help rule out some prompt changes, but do not prove the backend retained a cache entry. Missing usage is `null`, not a synthetic zero.

`ended` means the event iterator was fully consumed. It is false for interrupted consumption and is not a model-completion or cache-health verdict. These diagnostics do not change Antigravity's payload, thinking-signature handling or instruction-hoisting policy.

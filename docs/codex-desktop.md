# Signed-in Codex desktop integration

Terminal/npm **2.2.1** and companion VSIX **1.14.1** provide the native-capability repair with signed desktop **protocol 3**. Update both the setup command and the serving Bridge before enabling or refreshing; protocol-2 hosts are refused even on repeated enable/refresh. Grok desktop text, follow-up and tool execution were verified on the prior release. Other external providers are not individually desktop-verified. Slot is unchanged.

## Enable from native mode

Finish or pause clients sharing CODEX_HOME, including agent sessions. This is shared native configuration: changing it affects independently launched clients and resumed/background requests. Use fresh chats for routed external models; opaque native reasoning/compaction history cannot be replayed through the external adapter.

```sh
wisp serve                         # keep current Bridge running, or use the updated TUI/VS Code host
wisp codex-desktop enable
wisp codex-desktop status --json
wisp codex-desktop refresh          # refresh Alias/route metadata using the saved native view
wisp codex-desktop disable
```

Before initial enable, Codex must be in unmanaged native mode: no model_catalog_json, non-native model_provider, redefined openai provider, or active profile overriding provider/catalog. Existing custom catalog files are preserved and never treated as native authority; restore native configuration yourself before enabling. Wisp never temporarily removes shared settings to perform discovery.

Enable asks the installed native CLI for its ordinary raw catalog (`codex -c model_provider="openai" debug models`) in the requested CODEX_HOME, from a neutral directory. Native Codex owns authentication and any cache/refresh behavior. Wisp never reads/copies native auth, substitutes Wisp credentials, adds bundled-only models, or silently falls back to its own bundled list. The saved full descriptors represent the native client's returned view; they do **not** attest fresh network discovery or current account binding.

Restart Codex after enable/refresh/disable. The command does not restart apps, create a service or globally install anything. The existing `codex-wisp`, Claude, TUI and VS Code interfaces remain available.

## Supported routes and tools

Every native ID from the saved native view retains its complete descriptor and passes only to the fixed native Codex endpoint with its body and desktop sign-in intact. Native identity wins over shared Codex model overrides, including self-routes, and over Alias name collisions. Those shared routes remain saved and continue to apply in other Wisp clients. Enable/refresh/status report suppressed native-name routes; use an Alias with a distinct name to select an external Provider or Wisp's separately signed-in Codex account in desktop.

Distinct Wisp Aliases use their pinned Provider/model. Unknown IDs and override-only names outside the saved native view fail locally; the signed path has no Active Provider or family fallback. A missing native snapshot fails closed before any routing, including aliases. Alias route edits apply on the next request; refresh updates picker labels and capabilities.

Native effort choices (including Max and Ultra where advertised), multi-agent metadata, context limits and future fields are preserved verbatim. Wisp does not rewrite `model_context_window` or `model_auto_compact_token_limit`. The native client's interpretation and model/account limits still apply; retaining a configured value does not establish backend support for a larger window.

The desktop UI can filter effort choices independently of the catalog. In Codex desktop 26.915.3509.0, the default allowed-effort list excludes Max while including Ultra. A missing visible Max option in that version does not mean Wisp removed Max from the native descriptor; the app-server still advertises it. Wisp does not modify hidden desktop UI settings.

**Antigravity Aliases are excluded from signed desktop choices** because their wire cannot preserve the desktop's positioned developer-instruction semantics. Wisp does not consolidate or reorder those instructions. Enable/refresh/status report omitted aliases explicitly. An Antigravity override or Alias colliding with a native name does not remove the native choice: that name still routes natively in desktop. Explicit signed requests to excluded distinct aliases fail before credential lookup or upstream work. Existing Wisp routes and other clients keep their previous behavior.

External routes do not offer provider-hosted web search. Codex may still attach a prospective declaration despite the conservative catalog flag. For absent/automatic tool choice, Wisp may omit only `{type:"web_search"}`, that same declaration with a boolean `external_web_access` (the native client's observed live/cached mode metadata), or bare `{type:"web_search_preview"}`. Filters, location, context size, indexed access, content-type controls, other keys and wrong value types are rejected rather than silently discarded. This metadata exception adds no search execution/capability. Ordinary function/custom/namespace tools named web_search are preserved. Forced hosted choices, executed search history, unsupported hosted options/includes, opaque reasoning/compaction and other unsupported shapes still fail. Global native search settings are unchanged; native passthrough retains native search/tools.

Supported external adapters preserve message role/order and supported client tool/results. Generic keyed aliases advertise no reasoning-effort override: the desktop's neutral none is omitted; other explicit unadvertised effort controls fail. OAuth wires retain their implemented effort validation. Grok's known wire effort choices/default medium remain available even if optional public context-window metadata is unavailable. Images/context limits remain conservative where metadata or adapters cannot establish support. HTTP Responses is supported; WebSockets are not advertised.

On xAI, object tool schemas with root `oneOf`/`anyOf` use an internal argument envelope so nested unions do not reject the entire desktop request. Wisp preserves local schema references and open-object defaults, then restores original tool arguments for the client and rewraps conversation history. Tools are not removed. Schemas with resource-scoped identifiers/dynamic references or `unevaluatedProperties` remain unchanged because this translation cannot preserve their semantics; upstream support is still required for those schemas.

## Refresh, account changes and rollback

`refresh` updates Alias/route metadata using the **saved native-client snapshot**, retaining its timestamp. Repeated `enable` also rebuilds the generated catalog, repairing older reduced native entries after a Bridge/setup upgrade. Neither re-exports the active Wisp overlay or promotes unbound cache rows. For native model/account changes: disable integration, let native Codex discover its catalog (for example `codex debug models`), then enable again. Status explicitly labels the saved view and lack of account-freshness attestation. Missing/invalid/old bundled-only state requires disable and native-mode rediscovery; legacy disable remains usable.

CODEX_HOME and WISP_HOME are respected. One Wisp home manages one Codex home. The full snapshot, generated catalog and owner-only recovery journal live under WISP_HOME/codex-desktop/; catalog paths are absolute. Owned provider/catalog settings are restored on disable while unrelated edits/comments, routes and auth files remain intact. Active profiles overriding provider/catalog and edits to owned fields cause a conflict rather than overwrite. Keep the recovery journal until disable completes.

If the desktop saved a **known Wisp-only Alias** as the top-level default model, disable restores only the original model statement (or its original absence). Removed aliases remain recognized. Valid native choices and native-name collisions are preserved; profile model settings and effort preferences are never rewritten. Inspect `actionRequired` and notices: an original/unverifiable model, profile Alias or retained effort such as none may still need a valid native selection. Disable does not promise every retained preference is native-ready.

Interrupted activation/restore remains recoverable with disable, including unrelated edits during recovery. Existing unowned output files are refused before mutation. If Bridge port/secret changes, disable and enable again. The local Bridge secret lives in the provider table and private journal; treat them as private. Native credentials go only to the fixed native destination; external routes get only their own Provider credentials. Credential-bearing requests refuse redirects, including catalog discovery. Signed rejections expose bounded static structural diagnostics, never request/header/tool content or raw error strings.

Signed Codex, Anthropic and xAI HTTP failures and recognized keyed SDK failures retain their HTTP status with static messages and allowlisted codes. Permanent request/auth failures are not retried because of misleading provider prose. Transient HTTP429/500/502/503/504 use bounded retries before output starts; cancellation stops further attempts. Stream failure, missing completion and empty visible output remain distinct safe gateway errors. A stream already started ends with a failure event rather than replaying its text. These diagnostics identify the failure category; they do not establish why a live provider rejected a particular conversation.

## Verification boundary

`bun packages/tui/tests/nativeDesktop.check.ts` runs actual CLI **0.154.0** against an isolated synthetic keyed/OpenCode Go-shaped backend; `--xai` exercises the xAI Responses adapter with fixed-endpoint transport intercepted by a local test server. Both use saved hosted-search settings, supported/neutral effort and real client tool continuation, plus native passthrough/cancellation despite self-routes and external overrides. They verify unchanged native catalog entries, picker effort choices, shared routes and configured 1000000/900000 context settings. Neither spends live provider quota. The older **0.153.4** native check remains unchanged.

`node packages/tui/tests/packagedDesktop.check.mjs <compiled-wisp> <extracted-npm-shell> 2.2.1` checks copied binary and actual packed npm bytes outside source. Use `-` for the package argument to test the binary alone. A local Node ordinary-catalog fixture removes dependence on installed Codex; it is packaging evidence, not account or UI evidence. Native CI runs signed and unchanged legacy package checks. Builds pin Bun **1.4.2**; `wisp --version` reports the baked terminal version without UI startup.

Windows desktop acceptance on the repaired 2.2.0 candidate includes user-observed Grok picker/text/follow-up and command execution (`echo WISP_DESKTOP_OK`). The user also reported the requested native-model/restart/sign-in checks passed and that earlier lag was gone; those observations are distinct from automated protocol checks. Four-platform native CI and downloaded Windows artifact checks passed. This is not a compatibility claim for every external provider/model, installed VS Code companion behavior, or Traycer GUI Aliases.

# Signed-in Codex desktop routing — September 17, 2026

**Finding:** Wisp can reuse the mechanism behind the supplied codex-router example. The missing pieces are desktop-visible catalog configuration and a signed-in transport mode. Logging out is not inherent to external-model routing.

**Status:** research and an isolated Codex CLI app-server experiment are complete. Wisp desktop integration is not implemented or verified. The desktop UI, real providers, and native OpenAI passthrough were not exercised. No global installation, auth/configuration edit, app restart, or provider request was performed by this investigation.

## What the user wants

External Wisp models should appear beside native models in the desktop picker, with ordinary ChatGPT sign-in still working. The user supplied a creator's screenshot and `duolahypercho/codex-router` for investigation and delegated the work while away. Preserve this intent; a CLI-only alias list does not finish desktop acceptance.

The screenshot does not establish its exact app build. This machine has the Windows Store package `OpenAI.Codex` **26.908.9136.0**, global **codex-cli 0.154.0**, and npm **wisp-router 2.1.5**. Earlier handoff statements that 2.1.5 was not installed are stale. The running Wisp Bridge's owner/version was not established.

## Root causes in the existing Wisp path

1. `packages/tui/src/codex-wisp.ts` passes the provider and temporary `model_catalog_json` through command arguments to its child only. Independently launched desktop processes do not receive them. The live `~/.codex/config.toml` had no catalog, provider, or base-URL overrides at inspection.
2. The launcher chooses `requires_openai_auth=false` and a Wisp Bridge secret. In the experiment below, this made `account/read` report **no account**, despite a ChatGPT auth document being present. This is a client authentication-mode effect; it does not delete that document or require signing out.
3. Picker visibility and request routing are separate. Wisp already merges Alias descriptors in `packages/tui/src/codexCatalog.ts`, but every launcher request goes through the Wisp routing map. Keeping native names in a catalog does not prove those selections preserve their normal OpenAI path.

The live Wisp map currently contains one custom Alias (`custom model`) and several exact native-model routes, including `gpt-5.5` → `xai/grok-4.6`. A future desktop integration must explicitly preserve or distinguish those user-configured overrides; it must not silently reset them to match the creator's demonstration.

## How codex-router does it

Inspected commit: [`63ec1f3602c28f2a28ccb7e9edaf7b4f7d191c6c`](https://github.com/duolahypercho/codex-router/tree/63ec1f3602c28f2a28ccb7e9edaf7b4f7d191c6c), package 0.6.0. Cloned to `D:/codex-router-research-20260917`; its installer, dependencies, and tests were not run.

| Piece | Mechanism |
| --- | --- |
| Picker | Generates a merged catalog retaining native metadata and adding external slugs, labels and capabilities, then writes `model_catalog_json` into Codex configuration. [Catalog construction](https://github.com/duolahypercho/codex-router/blob/63ec1f3602c28f2a28ccb7e9edaf7b4f7d191c6c/src/catalog.mjs#L638-L763), [publication](https://github.com/duolahypercho/codex-router/blob/63ec1f3602c28f2a28ccb7e9edaf7b4f7d191c6c/src/catalog.mjs#L1177-L1254). |
| Sign-in | Explicit signed activation selects `codex-router-signed`, a custom Responses provider with `requires_openai_auth=true`. [Provider definition](https://github.com/duolahypercho/codex-router/blob/63ec1f3602c28f2a28ccb7e9edaf7b4f7d191c6c/src/config-manager.mjs#L671-L715), [activation](https://github.com/duolahypercho/codex-router/blob/63ec1f3602c28f2a28ccb7e9edaf7b4f7d191c6c/src/config-manager.mjs#L1944-L1998). |
| Local authentication | Current fresh configuration uses plain loopback `/v1`. The router accepts its own caller key or validates the incoming bearer against the current local Codex auth document. [URL writer](https://github.com/duolahypercho/codex-router/blob/63ec1f3602c28f2a28ccb7e9edaf7b4f7d191c6c/src/config-manager.mjs#L158-L170), [gate](https://github.com/duolahypercho/codex-router/blob/63ec1f3602c28f2a28ccb7e9edaf7b4f7d191c6c/src/router.mjs#L852-L866), [matcher](https://github.com/duolahypercho/codex-router/blob/63ec1f3602c28f2a28ccb7e9edaf7b4f7d191c6c/src/codex-native-session.mjs#L160-L174). |
| Native traffic | Dispatches native models to the Codex backend, retaining allowlisted incoming OAuth/account headers. This path performs compatibility normalization, so it is not byte-identical passthrough. [Native dispatch](https://github.com/duolahypercho/codex-router/blob/63ec1f3602c28f2a28ccb7e9edaf7b4f7d191c6c/src/router.mjs#L4187-L4239). |
| External traffic | Uses fresh headers and the external provider's own credentials. Unknown external namespaces are rejected locally. [Provider boundary](https://github.com/duolahypercho/codex-router/blob/63ec1f3602c28f2a28ccb7e9edaf7b4f7d191c6c/src/api-forwarder.mjs#L1315-L1364), [dispatch guard](https://github.com/duolahypercho/codex-router/blob/63ec1f3602c28f2a28ccb7e9edaf7b4f7d191c6c/src/router.mjs#L3921-L3960). |

The older secret-in-URL transport remains supported, but some repository prose describing it is stale relative to the current fresh-install writer. The login-free mode also aliases native IDs to external models; signed mode clears that alias map. Neither should be copied on the assumption it is the current signed-in mechanism.

Official documentation confirms the startup catalog setting, custom provider definitions and OpenAI-auth flag. It does not certify this third-party router or prove the desktop UI behavior. [OpenAI configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

## Fresh local experiment

Runnable evidence is retained outside the application checkout:

- Script: `D:/wisp-codex-desktop-investigation-20260917/probe.py`
- Results: `D:/wisp-codex-desktop-investigation-20260917/results.json`
- Raw diagnostics and synthetic homes: sibling `keyed/`, `signed/`, and `export-home/` directories.

Run `python D:/wisp-codex-desktop-investigation-20260917/probe.py`. It is pinned to this machine's global CLI path. It uses Python's standard library, a local Responses fixture, synthetic credentials, isolated Codex homes, and a proxy that refuses external destinations. It reads live config/auth files only to compare hashes; no credential bytes are copied to the fixture or report.

| Observation on CLI 0.154.0 | Wisp-style keyed provider | Signed-in provider |
| --- | --- | --- |
| Same synthetic ChatGPT auth document exists | Yes | Yes |
| `account/read` | `account:null`, `requiresOpenaiAuth:false` | `account.type:chatgpt`, `requiresOpenaiAuth:true` |
| `model/list` | 7 selectable rows, native entries + exact external Alias | Same |
| `thread/start` + `turn/start` | Exact external Alias, visible `LOCAL_FIXTURE_OK` | Same |
| Local request credential | Synthetic Bridge key | Synthetic ChatGPT bearer and account header |
| Live `.codex`/`.wisp` config and auth | SHA256 unchanged | SHA256 unchanged |

This proves the central account/catalog/transport distinction without spending provider quota. It does **not** test Wisp's real Bridge accepting native bearer auth, native OpenAI passthrough, tools, image handling, app restart/persistence, or the desktop renderer. Direct execution of the desktop package's `resources/codex.exe` returned **Access is denied**; no ACL or application-control changes were attempted. The global CLI was used instead and is identified in the results.

## Smallest useful Wisp follow-up — proposed, not settled

Add an opt-in desktop integration over the existing Bridge and Alias catalog. It needs:

1. A durable catalog and narrowly owned Codex configuration with exact restore behavior. Reuse native metadata from the actual client build and truthful Wisp capability limits.
2. A separate signed Responses entry path. Flipping `requires_openai_auth` alone would fail Wisp's current Bridge-secret check. Authenticate the local request while keeping native OAuth out of external-provider requests. File-backed bearer validation and a separate capability are alternatives to evaluate; no choice was made here.
3. Explicit routing policy for native selections and existing exact Wisp overrides. Preserve ordinary native behavior where no override exists, and preserve the user's explicit route choices.
4. Desktop acceptance: native and external rows visible after restart; signed-in account retained; exact selected route observed; text/tool turn succeeds; native route still works; rollback restores prior settings. Also test account/profile changes and catalog refresh against the chosen auth mechanism.

Keep the current CLI launcher available. The reference project's GUI, dependency stack, Task Scheduler service, session-sharing features, login-free aliases and optional concurrency settings are unnecessary to establish this Wisp feature. Wisp need only advertise the transports and tools it actually supports; copying the reference's WebSocket/search flags would overstate current support.

The older Traycer investigation remains separate. Success in the OpenAI desktop app would not by itself establish Traycer catalog/profile integration.

## Source audit record

`D:/codex-router-research-20260917/RESEARCH-NOTES.md` contains the independent source audit, including Windows requirements, credential boundaries, old-vs-current behavior, and tests inspected but not executed. This document owns the combined findings and follow-up scope.

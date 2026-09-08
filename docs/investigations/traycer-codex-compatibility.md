# Traycer Codex compatibility investigation — #217

**Verdict: NOT VERIFIED.** On the inspected Windows Traycer 1.2.0 installation,
no supported, separately isolated Wisp connection was established that supplies
both the GUI discovery catalog and execution transport while preserving the
ordinary Codex subscription connection. This completes the bounded investigation;
it does **not** establish Traycer GUI support for Wisp Aliases.

Traycer has real custom-executable and provider-environment controls, and its
Codex model adapter does not impose a GPT-name allowlist. Consequently, claiming
that custom models are impossible or universally unsupported would overstate the
evidence. The unresolved boundary is how to apply a Wisp catalog and Responses
transport to the same isolated connection across discovery, selection and turns.

Investigated 2026-09-08 for [issue #217](https://github.com/EstarinAzx/Wisp-Router/issues/217),
against Wisp commit `2a5f93619969a6d0b99ebb05c3e6fcbe9dbed087`.
Native `codex-wisp` delivery remains separate; this verdict does not block it.

## Versions and evidence strength

| Component | Observed version / evidence |
| --- | --- |
| Traycer Desktop | `1.2.0` executable file version (`1.2.0.0` product version) |
| Traycer CLI | `traycer --version`: `1.2.0` |
| Traycer host | Installed `version.json`: `1.2.0`; host executable fingerprint below |
| Traycer-managed Codex | `codex-cli 0.153.1`; executable under `host/providers/codex/win32-x64/0.153.1/` |
| Shell Codex | `codex-cli 0.153.4`; resolved through the existing npm shim |
| Platform | Windows 11, x64; no macOS/Linux inference |

Read-only process inspection showed the managed Codex executable parented by
`traycer-host.exe`. It is a separate process from shell Codex and `codex-wisp`.
No live command lines, authentication stores or broad logs were collected.

The live `traycer_list_harness_models({harnessId:"codex"})` response listed
`gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`,
`gpt-5.4-mini`, and `gpt-5.3-codex-spark`. This is a live catalog observation,
not a click test or an immutable native-model roster.

Earlier isolated `model/list` probes accepted a synthetic Alias in Codex 0.153.1
and 0.153.4. Those probes are historical supporting evidence, not newly repeated
GUI acceptance. This investigation instead traced the installed host and renderer
and checked first-party controls. Static source findings below are distinguished
from behavior exercised in a running GUI.

## Supported controls and their scope

[Traycer's Providers documentation](https://docs.traycer.ai/settings/providers)
exposes CLI binary selection, provider-scoped environment variables, provider
credentials and Terminal-interface arguments. The installed host implements
`providers.addCustomPath`, `providers.setSelection`, `providers.setEnvOverride`
and `providers.setTerminalAgentArgs`. Custom paths and environment overrides are
stored against a **provider ID**, not an individual agent or subscription profile.
Terminal arguments are not a GUI app-server configuration control.

[Shell documentation](https://docs.traycer.ai/settings/shell) explicitly directs
coding-agent-specific endpoints to provider variables. Thus an environment or
launcher approach is a plausible integration seam; absence of endpoint fields in
the agent tools alone is not proof that endpoint customization is impossible.

[Agents & Models documentation](https://docs.traycer.ai/agents-and-models/coding-agents)
describes runtime model discovery and profile selection. However, the inspected
Codex discovery request and adapter below do not receive that profile identity.
The general documentation is insufficient to promise a distinct Wisp catalog for
one Codex subscription profile in this build.

The session's first-party `traycer_create_agent` / `traycer_configure_agent`
schemas select a harness, model and ambient/managed profile. They expose no
per-agent catalog path, executable, environment map, Responses base URL or custom
provider registration. Configuring an existing provider globally would affect
ordinary Codex use and falls outside this ticket's boundaries.

## Actual data journey in the inspected build

References H1–H8 identify decoded host symbols; R1–R4 identify shipped renderer
files and literal function anchors. Reproduction and fingerprints follow.

1. **Discover the GUI catalog (R1, H1).** Renderer query `ar` calls
   `agent.gui.listModels` with `{harnessId, workingDirectory}`. Its query has
   infinite stale/GC time, with separate refresh/invalidation paths. The host
   request schema `q4A` has those same two fields. `createAgentGuiListModelsResolver`
   (`y6s`) forwards them plus request context to the harness registry.
   Registry `listModels(Q,q)` caches by harness, working directory, request user
   and optional CLI path; its key contains no profile ID. The Codex adapter
   `listModels` resolves `JA("codex", An)`, connects with a **null environment
   override** plus Traycer approval arguments, requests `model/list`, maps the
   response, and disconnects. The base provider environment still applies.

2. **Map model IDs into rows (H2, R2, R3).** `parseCodexModelsResult` (`sWo`) requires
   `data[]`, moves the default first and maps through `XQI`. The mapper retains a
   nonempty response `model` as `slug`, copies capability/effort metadata, and
   labels GPT names specially. It does not reject names for lacking `gpt-`.
   Renderer `Tv` filters by harness; `wv` matches exact slug or
   `metadata.resolvedModel`. That latter alias mechanism is Traycer metadata,
   not a read of Wisp's Routing map. `F4` / `E4` render catalog rows and select
   the clicked row. There is no demonstrated free-text Alias registration path.

3. **Validate and remember selection (R3, H3).** Renderer `Nae` keeps an unknown
   saved slug while the catalog is loading, but after loading falls back to the
   first model if it cannot resolve the slug. `l7` / `Aae` propagate that healed
   selection. The `T_` preference store records the last model by host/harness
   and the last profile separately. Host explicit agent creation/configuration
   also checks known catalog models (`requireKnownExplicitModel`, `q9t`, and
   the `agent.create` path). Persisting an arbitrary string is therefore not a
   substitute for supplying the discovery catalog. `epic.updateChatRunSettings`
   and `epic.updateChatProfile` provide distinct persistence paths. These are
   static traces; an Alias was not clicked, persisted or reopened in the GUI.

4. **Resolve executable and profile (H4, H5).** Both discovery and chat resolve
   the Codex provider executable through `resolveProviderCli` (`UC`) and its
   wrapper `JA` / `$Q`. `UC` considers the selected custom/PATH executable,
   managed packages and fallback sources. Choosing a custom launcher is a
   provider-wide selection. `buildProviderSpawnEnv` (`oA` / `Deo`) merges the
   shell/host environment and provider overrides. Chat then adds the selected
   profile's environment via `$y` / `OEo`, giving profile values precedence.
   Ambient profiles add no override. Codex overlay profiles set `CODEX_HOME`
   to their managed directory and `CODEX_SQLITE_HOME` to the ambient shared home.
   Their config/auth files are private; session/cache directories and history
   are linked/shared. They are subscription overlays, not fully isolated test
   homes. Discovery's null override does not select that execution profile.

5. **Apply Traycer's launch policy (H6).** Chat builds its app-server arguments
   after resolving the executable source. `TVo` supplies
   `resources/codex/model-catalog-regular-a2a.json` only for the `bundled` policy
   with A2A available. `MVo` preserves `managed`, `custom` and `path` sources;
   the mere presence of the resource does not prove its use by current discovery
   or a managed-source turn. A bundled turn may also create a filtered temporary
   catalog through `GVo`, using cached descriptors/tool restrictions. Editing the
   resource would neither be a supported integration nor establish picker scope.

6. **Start execution (H7, H8).** `CodexJsonRpcClient.connectOnce` spawns the
   resolved executable with argument prefix, Traycer configuration arguments,
   then `app-server --listen stdio://`, using the resolved environment and a
   hidden window. The adapter sends the selected `model` in `thread/start`
   (or resume) and in its `turn/start` builder. These calls do not themselves
   supply a Wisp `modelProvider` or Responses endpoint. Transport still depends
   on the child configuration/environment/launcher. The source retains Traycer's
   tool, approval and session handling, but that is not a runtime regression
   test of those behaviors with Wisp.

## Why this does not pass the integration gate

There is a real route to investigate further through custom executables or
provider variables. In this build those controls address the whole Codex
provider, while GUI discovery lacks the selected execution profile's identity.
An isolated Codex `CODEX_HOME` or `codex-wisp app-server` alone cannot prove that
Traycer uses the same catalog, selected Alias and transport end to end.

No supported control was established for registering a synthetic, separate Wisp
connection used by **both** discovery and execution without changing the live
Codex provider. No host/profile registry was fabricated and no live settings
were repointed to perform that experiment. The conditional positive acceptance
test was therefore not run. This is **NOT VERIFIED**, not a failed mock test and
not proof that a supported configuration cannot exist.

The upstream requirement is a documented connection-scoped contract: select the
custom executable/catalog and Responses transport together; give discovery and
execution the same connection/profile identity; scope model caches and selection
validation to it; preserve the ordinary subscription connection. Its catalog
must retain Alias IDs and truthful capabilities through refresh/reopen/restart.
An officially documented existing mechanism satisfying those properties would
also resolve the gap; a new API is not assumed necessary.

## Acceptance limits

| Required observation | Result |
| --- | --- |
| Exact live versions and native list | Observed as above |
| Discovery, filtering, selection/persistence, profile and execution path | Traced statically through installed host and renderer |
| Supported connection supplying both catalog and Wisp transport | Not established |
| GUI Alias visibility and persisted selection | Not exercised |
| Exact Alias request to Bridge and intended upstream Target | Not exercised in Traycer |
| Picker reopen and test app-server restart | Not exercised in Traycer |
| Native models, tools, approvals and sessions with Wisp | Not regression-tested in Traycer; no settings or ordinary sessions changed |
| Separate Wisp connection preserving ordinary subscription | Not established |

No real Provider request, credential change, installation, managed-file patch,
service restart or maintainer contact was performed. The inspection helper only
reads installed code; it never launches the host or app-server. Existing Wisp
native acceptance evidence remains separate from these unverified GUI behaviors.

## Reproduce the read-only investigation

Use the exact local installation paths for your machine. These PowerShell
commands inspect versions and code; do not change provider settings to reproduce
the negative finding.

```powershell
traycer --version
codex --version
& "$env:USERPROFILE/.traycer/host/providers/codex/win32-x64/0.153.1/codex.exe" --version
Get-Content "$env:USERPROFILE/.traycer/host/install/version.json"
traycer config --help
traycer agent configure --help
traycer agent list-harness-models codex
python docs/investigations/inspect-traycer-codex.py "$env:USERPROFILE/.traycer/host/install/traycer-host.exe"
```

The agent list command requires the normal Traycer agent context. The inspection
helper is standard-library Python and needs no account or running host. It pins
the executable SHA256, decodes constant string references without executing JS,
checks the string-table rotation, and emits bounded excerpts plus decoded
character offsets. It fails on a different build, a missing/empty anchor or an
unreadable file. Its result says `STATIC EVIDENCE ONLY`; it cannot certify GUI
behavior. It is a textual inspection aid, not a general JavaScript parser.

Use `--find 'literal anchor'` to inspect another hop. Read the containing method
and callers before interpreting a match; the bundle contains other harnesses.

| Reference | Host anchors (`--find`) |
| --- | --- |
| H1 | `q4A=d["object"]`, `function y6s(`, `async["listModels"](Q,q)`, `async["listModels"](Q){const iFJ=` |
| H2 | `function sWo(`, `function XQI(` |
| H3 | `function q9t(`, `function Z7s(`, `function $7s(` |
| H4 | `async function UC(`, `async function JA(`, `async function qSo(` |
| H5 | `async function Deo(`, `async function OEo(`, `async function xEo(`, `NEo=` |
| H6 | `function MVo(`, `async function TVo(`, `async function GVo(`, `let G=[...BXe()` |
| H7 | `async["connectOnce"]` |
| H8 | `"thread/start",`, `"turn/start",` |

Renderer files are minified but unobfuscated JavaScript under the Desktop
installation's `resources/renderer/assets/`. Find the literal anchors below;
read bounded slices with Python rather than printing a whole minified line.

| Reference | File | Anchors |
| --- | --- | --- |
| R1 | `use-providers-ensure-pack-mutation-BmBLld8c.js` | `function ar(`, `agent.gui.listModels` |
| R2 | `runtime-CceuA8jl.js` | `function Tv(`, `function wv(` |
| R3 | `use-pointer-drag-commit-DwRIW4D5.js` | `function E4(`, `function F4(`, `function Nae(`, `function l7(`, `function Aae(`, `var T_=` |
| R4 | `providers-settings-panel-CyuFZDuD.js` | `providers.modelProviderAuth`, `createCustom` (generic UI; not Codex support proof) |

SHA256 fingerprints, captured before delivery and checked again after inspection:

```text
host/traycer-host.exe
53c6cbb6035116dda4c8b5f7777c44cedde79584ac61e13580221c9bd398155c
resources/codex/model-catalog-regular-a2a.json
4bcd5cb39b876ea1af22fc0fed8e13673e23230032f9216fadf045c6473a6b34
R1
b180eb06e91bbf74445deaa7ebe7b1fc20cc0f1b8385328624a8e6a083227917
R2
1ec16b01e6126d5f4c98d2023ecc884b669335959cc3db6c246b04f36ecbbb48
R3
c2dbe5b850515fb6a93a33d4d113a8bb219833a177e479a927594f47cb39a81a
R4
972af150c636870ab58ac96e8cf1a426a44cd817c6d6a1b53f4372c117f509e8
```

Verification for this investigation consists of reproducing the source excerpts,
checking helper rejection of an unrelated input, checking renderer anchors and
fingerprints, and independent review of the conclusions. No Wisp application code
changes are required, so application builds and provider-turn tests are not
substitutes for the missing Traycer GUI proof.

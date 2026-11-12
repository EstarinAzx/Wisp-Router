# Claude alias context windows: official documentation investigation

Checked 2026-11-12. Research only; no product implementation or real-provider calls. The documentation pass is followed below by isolated native-client probes using a synthetic loopback server and disposable configuration directories.

## Finding

No **documented public Claude Code mechanism located** supplies an arbitrary numeric context window per discovered gateway model, including switches between differently sized models in one process. This conclusion is about the documented gateway/configuration contract; it does not establish that every internal mechanism lacks that capability.

## Documented mechanisms

### Gateway discovery versus the Models API

Claude Code gateway discovery requests `GET /v1/models?limit=1000` at startup. The documented fields it reads are `id`, `display_name`, and `description`. IDs must contain `claude` or `anthropic`, case-insensitively. Discovery refreshes on startup and caches the list; the documented contract does not mention per-switch model-info requests or consumption of numeric limits. Adding arbitrary fields to Wisp's response therefore has no documented guarantee of changing context sizing. [Gateway compatibility: discovery](https://code.claude.com/docs/en/llm-gateway-protocol#model-discovery)

Separately, Anthropic's **Models API** exposes `max_input_tokens`, `max_tokens`, and `capabilities`; `GET /v1/models/{model_id}` can retrieve a model or resolve an alias. Those API fields exist, but that does not mean Claude Code's gateway discovery consumes them. [Models API reference](https://platform.claude.com/docs/en/api/http/models), [Retrieve a model](https://platform.claude.com/docs/en/api/models/retrieve)

### Context correction

Unrecognized IDs default to 200K. `[1m]` declares 1M. `CLAUDE_CODE_MAX_CONTEXT_TOKENS` supplies an arbitrary window directly for an unrecognized custom/provider spelling without `[1m]`. A bare `claude-` ID, or any ID resolving to a known Claude model, requires `DISABLE_COMPACT`, disabling all compaction. An unrecognized custom spelling with `[1m]` additionally needs `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` for the numeric override while preserving proactive compaction. [Context correction and ID restrictions](https://code.claude.com/docs/en/model-config#correct-the-window-for-a-gateway-or-custom-model-id)

For known underlying Claude models, `modelOverrides` or `modelPicker.behavesAs` can restore known model behavior. They are identity/profile mappings, not arbitrary numeric declarations. Auto-compact windows are capped at the effective model context window. [Model configuration](https://code.claude.com/docs/en/model-config#context-window-and-auto-compaction)

The capability variable accepts `effort`, `xhigh_effort`, `max_effort`, `thinking`, `adaptive_thinking`, and `interleaved_thinking`; no numeric context capability is listed. [Pinned capabilities](https://code.claude.com/docs/en/model-config#customize-pinned-model-display-and-capabilities)

### Per-model settings

`modelPicker` rows accept `model`, `label`, `description`, and `behavesAs`. The latter requires 2.1.257+ and names a Claude model the installed version knows; it applies that model's capabilities and effort defaults without changing the requested ID. The lineup is accepted from user/managed settings and `--settings`, not project/local settings. [Picker fields](https://code.claude.com/docs/en/settings-reference#fields-for-modelpicker)

`modelSettings` lists only `effortLevel`, `maxEffortLevel`, and `autoCompactWindow`. The last requires 2.1.288+, accepts 100000–1000000 or `"auto"`, and is a compaction setting. Entries use canonical model names, so recognized aliases/dated/provider spellings share a profile. No numeric context-capacity field is documented here. [Per-model settings](https://code.claude.com/docs/en/settings-reference#modelsettings)

### Hooks and live environment changes

`PreModelSwitch` receives source/target/requested model IDs and the current context token count. Its outputs allow, deny, or ask; it cannot return `updatedInput`. `PostModelSwitch` runs after requested changes, automatic session fallback, plan-mode changes, and resume, but not a temporary one-turn fallback-chain substitution. Its supported output supplies guidance to the model, not a context limit. [PreModelSwitch](https://code.claude.com/docs/en/hooks#premodelswitch), [PostModelSwitch](https://code.claude.com/docs/en/hooks#postmodelswitch)

`CLAUDE_ENV_FILE` persists environment for later shell commands. It is not documented as modifying Claude Code's own context-sizing environment and is unavailable to model-switch hooks. [Hook environment persistence](https://code.claude.com/docs/en/hooks#persist-environment-variables)

Saved settings `env` changes do update a running session's process environment. Startup-only readers keep old values; removing a variable does not unset it until relaunch. This documents reapplication, not an atomic model-switch/context-limit transaction. [Live environment application](https://code.claude.com/docs/en/env-vars#set-variables-in-settings-files)

**Inference:** A hook that rewrites settings might eventually change the global scalar, but watcher timing, simultaneous sessions/subagents, fallback coverage, and failure recovery need validation. It is not a documented per-model contract and should not be presented as one.

### Launcher alternative

An explicit launcher can supply a child process's environment. The special `CLAUDE_CODE_PROCESS_WRAPPER` self-spawn facility is ignored on Windows, so it is not a Windows-wide launcher solution. [Corporate launcher coverage](https://code.claude.com/docs/en/corporate-launcher#what-the-launcher-covers)

**Inference:** A Wisp PowerShell launcher could choose a non-bare alias such as `wisp-claude-example`, set its exact numeric limit, then start Claude Code. This preserves the discovery substring while avoiding the bare `claude-` case. It works as a proposal for one selected size per process; a different-size `/model` switch still needs a relaunch or an independently validated dynamic mechanism.

## Size coverage and recommendation

- **128K:** launcher/global numeric override is the documented correction route; pick the actual token count from authoritative Wisp metadata, not the ambiguous display suffix.
- **200K:** current fallback already represents this size.
- **400K:** same numeric-override route; `[1m]` would overstate capacity.
- **1M:** `[1m]` is the documented per-ID route, subject to the user's context-disable configuration.
- **Arbitrary mixed sizes in one session:** none of the public contracts above supplies a complete per-model numeric map.

These coverage conclusions are deductions from the documented mechanisms, not runtime tests. Recommend keeping implementation blocked until the internal catalog investigation establishes whether exact per-model numeric profiles are usable, or the user accepts the launcher/relaunch limitation. Do not map unrelated non-Claude models to a Claude `behavesAs` profile solely to obtain a desired context size: that also changes capability assumptions.

## Evidence boundaries

- **Documented:** all linked behavior above, checked against current first-party documentation.
- **Source-observed elsewhere:** the coordinating investigation found `CLAUDE_CODE_MODEL_CATALOG`, `CLAUDE_CODE_MODEL_CATALOG_URL`, and catalog runtime numeric fields in local Claude Code 2.1.322. This report did not independently inspect that binary.
- **Undocumented/unverified:** exact-name official-doc searches and direct reference inspection found no catalog-variable contract. Its accepted schema, signature/trust gates, supported deployment scope, precedence, refresh timing, and durability across updates remain the local investigation's responsibility. Absence from the inspected docs is not proof that the feature cannot work.

## Native-client verification (coordinator, 2026-11-12)

Client: `C:/Users/S.D/.local/bin/claude.exe`, version **2.1.322**, SHA-256 `345996B4BDBAE21D817F750FAE2F34CBF8D81224A5444C78136091D121BEB298`. Repository source at `3358c0f`; existing `.context/flows.md` edit preserved.

Local evidence lives under `.claude/alias-context-research/` (gitignored): `probe.py`, `results.json`, `switch_probe.py`, `switch/result.json`, and per-case stdout/stderr. Both scripts exited 0. All replies came from a synthetic loopback HTTP server; child environments contained a fake bearer, isolated `CLAUDE_CONFIG_DIR`, no enabled tools/MCP servers, and no real credentials. Client and server processes exited. These tests verify the client's reported budget, not model capacity or long-context generation.

Eight fresh-process cases confirmed the reported `modelUsage.*.contextWindow`:

- `claude-wisp-probe`, no override: **200000**.
- `claude-wisp-probe[1m]`, no override: **1000000**.
- `claude-wisp-probe` plus `CLAUDE_CODE_MAX_CONTEXT_TOKENS=400000`: still **200000**.
- `wisp/claude-probe` plus the same variable set to **128000**, **400000**, or **1000000**: exactly that value in all three cases.
- `modelSettings["claude-wisp-probe"].contextWindow=400000`: still **200000**; not a supported capacity setter.
- `claude-wisp-probe[1m]` with per-model `autoCompactWindow=400000`: reported capacity remains **1000000**. This probe does not measure the eventual compaction trigger.

The same-process SDK control probe started at `wisp/claude-128k` with a **128000** environment override, completed a synthetic turn, successfully switched to `wisp/claude-400k`, and completed another. **Both models reported 128000.** A model switch does not automatically replace the scalar with that model's capacity. The model names are test labels, not assertions about any real provider.

**Correction to the earlier workaround:** on this installed client, a selection ending in `[1m]` retains that suffix in `modelUsage` but sends the model ID **without** the suffix to `/v1/messages`. Observed `claude-wisp-probe[1m]` -> wire `claude-wisp-probe`. Therefore, creating only a literal suffixed Wisp alias is not the right fix for this version. The bridge must support the actual IDs sent by each qualified client version. The older July note describes a different installed version and is historical evidence, not this version's wire contract.

### Read-only installed-source findings

Byte offsets refer only to the binary identity above; excerpts were inspected without modifying installed files.

- At **292551453**, gateway row schema `Gw` contains `id`, `display_name`, `description` and calls `.strip()`. At **292552700**, the picker maps those fields. Extra numeric discovery fields cannot supply a window through this path.
- At **289748680**, `modelSettings` schema contains effort, max effort and compaction-window fields. At **300658374**, compaction selection clamps a per-model setting to the already-resolved context window.
- At **292623583**, `pT` restricts numeric context overrides based on spelling/known-model identity; at **292625177**, `mT`/`cT` read the process-wide override. `DISABLE_COMPACT` is a bypass with a different safety effect, not the proposed solution.
- A separate served-catalog path reads `runtime.max_input_tokens`/`context_window` (around **292273958**). It is not ordinary gateway discovery: at **309789770**, served-catalog eligibility rejects non-first-party connections.
- The published-catalog URL path at **308885247–308886200** uses compiled signature trust roots for environment-selected URLs, including file URLs. The managed-key branch requires a managed source and key; in this build the source reader returns both undefined. This is not an unsigned arbitrary-model configuration seam. No trust roots, signatures, catalog caches, or feature flags were changed or bypassed.

## Resulting design boundary

An exact-window launcher is feasible for a **single selected size per process**, using a compatible model-ID spelling and authoritative target metadata. It would need explicit handling of different-size switches, fallback, subagents, and resume; silently carrying the first model's budget is incorrect. This is a proposal, not an implemented or approved product design.

Automatic per-ID 1M hints remain feasible as a narrower bridge change. General exact per-alias sizing across live switches is not established by either the documented gateway contract or these probes. A setting that only changes compaction while the UI still reports a false total is not equivalent to correcting the context window.

CodeRabbit project mode remains **on**, with three launches per future implementation checkpoint and no paid escalation. No review was launched for this research and no completed checkpoint was reopened.

Skipped product implementation, real-provider capacity checks, full-window generation and interactive VS Code verification. Main risk: promising per-model accuracy using a process-wide setting, or mistaking a signed internal catalog for a supported gateway interface.

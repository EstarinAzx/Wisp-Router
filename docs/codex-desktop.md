# Signed-in Codex desktop integration

This opt-in integration keeps Codex in ChatGPT sign-in mode and adds Wisp Aliases to its persistent model catalog. It requires a Wisp Bridge containing signed desktop protocol 1, plus an installed Codex CLI for exporting its native model descriptors. Older Bridges fail the enable check with update/start instructions.

```sh
wisp serve                         # keep this Bridge running, or use the updated TUI/VS Code host
wisp codex-desktop enable
wisp codex-desktop status --json
wisp codex-desktop refresh          # after adding/removing aliases or updating Codex
wisp codex-desktop disable
```

Restart Codex after enable, refresh or disable to reload its configuration/catalog. Wisp does not restart apps, start background services, install Codex or alter login credentials. Existing `codex-wisp`, Claude, TUI and VS Code commands remain available.

The normal picker selects a route. Exact Wisp Aliases and existing exact Codex model overrides use their pinned Provider/model. An Alias wins when it collides with a native name. Other native models pass through to the fixed ChatGPT Codex Responses endpoint; there is no Active Provider or family fallback on this signed path. Unknown IDs fail locally. Route target edits apply on the next request; refresh updates picker labels and capabilities.

Native descriptors are retained in full unless an explicit route replaces that row with the target's conservative capabilities. The installed CLI's bundled native IDs authorize native passthrough. An existing user catalog is merged as metadata, but adding an unknown ID there does not authorize a new native route. Alias capabilities come from existing Wisp metadata: unknown targets advertise text only; unsupported images, hosted search and reasoning options fail explicitly. Native requests retain native tools and wire fields. This integration uses HTTP Responses, not WebSockets. Client tools and tool results use the existing Bridge adapters.

Only `model_provider`, `model_catalog_json` and the reserved `[model_providers.wisp_desktop]` table are owned. Original default model, permissions, unrelated config bytes/comments, routes and auth files remain untouched. Active profiles overriding provider/catalog and existing reserved tables must be resolved before enabling. Other profiles remain intact; selecting one that overrides the provider later bypasses this integration.

`CODEX_HOME` and `WISP_HOME` are respected. One Wisp home manages one Codex home at a time. The generated catalog and owner-only recovery journal live under `WISP_HOME/codex-desktop/`; catalog paths in Codex config are absolute. Enable is idempotent. Refresh uses the original user catalog, never its own generated output. Disable restores owned settings and preserves unrelated edits made since enable. Edits to owned fields cause a conflict instead of being overwritten. Restore those fields to the generated values before disabling. Do not delete the recovery journal while integration is enabled.

Interrupted activation remains recoverable with `wisp codex-desktop disable`, followed by enable, including unrelated config edits made during activation or after an interrupted restore. Existing unowned files at the generated catalog path are refused before mutation; move them and update their original references first. If the Bridge port or secret changes, disable and enable again. Status reports conflicts and Bridge reachability without printing credentials. The provider table contains the local Bridge secret; treat config and the recovery journal as private. Native OAuth is neither read nor copied: Codex supplies Authorization, and a separate `x-api-key` authenticates to the local Bridge. Native credentials go only to the fixed native destination; external routes receive only their own Provider credentials. Credential-bearing signed requests, including Codex catalog discovery, refuse redirects.

For source use: `bun packages/tui/src/index.tsx codex-desktop status --json`. Compiled binaries and npm's `wisp` command expose the same subcommand. No extra dependency or global runtime change is required.

## Verification boundary

`bun packages/tui/tests/nativeDesktop.check.ts` exercises the actual CLI **0.154.0** app-server with isolated synthetic auth, the production Bridge and generated configuration: signed account, mixed model list, alias text/tool round-trip, exact override, native transport and cancellation. Its refusing proxy blocks incidental native account/plugin probes. The older `nativeCodex.check.ts` remains separately pinned to **0.153.4**. Both require Bun **1.4.2** or later; the release build pins 1.4.2.

`node packages/tui/tests/packagedDesktop.check.mjs <compiled-wisp>` checks copied binary/npm lifecycle dispatch outside the source directory.

Actual desktop UI picker, login retention across app restart, exact installed desktop build, and release-package/publication acceptance remain **pending**. CLI protocol verification does not establish those desktop results.

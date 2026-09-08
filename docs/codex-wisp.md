# Native Codex through Wisp

`codex-wisp` is available in terminal 2.1.4. Use its Bridge or the Bridge hosted by VS Code
extension 1.13.7. Older installed packages do not gain the new command or endpoint automatically.

Configure a Wisp Provider and model, then start the updated Bridge (`wisp serve`, `/bridge`
in the TUI, or the extension's Bridge control). Restart older hosts after updating their package.
Run the matching launcher from another terminal:

```sh
codex-wisp exec "Explain this project"          # npm command, once 2.1.4 is installed
wisp codex-wisp exec "Explain this project"     # standalone compiled binary
codex-wisp -m my-alias exec "Explain this project"
```

The standalone binary needs neither Bun nor Node.js. npm shims require Node.js >=16 and use
the existing `wisp.js` resolver: exact-version platform optional dependency first, then the
same release download and versioned `~/.wisp/bin/v<version>` cache. No separate downloader is
introduced. Codex itself must be installed independently; an npm Codex installation also needs Node.

For source development, use Bun from the repository root:

```sh
bun packages/tui/src/codex-wisp.ts
bun packages/tui/src/index.tsx codex-wisp exec "Explain this project"
```

Codex must already be installed. The launcher reads Wisp's existing port and Bridge secret,
checks the numeric loopback listener without sending the secret, and starts Codex with a
child-only Responses provider. It does not start a Bridge or edit either application's
configuration or authentication. Codex still owns tools, approvals, sandbox policy and sessions.

On Windows, the launcher resolves `codex.exe` or Node plus the installed `codex.js` entry and
starts it directly without a shell command string. Spaces, quotes, metacharacters and literal
percent expressions stay arguments. Shell-only Codex shims are unsupported. A missing CLI,
missing Bridge secret or stopped Bridge produces guidance and a nonzero exit; nothing starts
in the background automatically.

Native model selection is retained. Ordinary arguments, including `-m`, pass through. Wisp
resolves that model string as a Provider id, exact Alias, Family route, then the live Active
Provider. An arbitrary backend model string does not pin a Wisp Target; use a configured
Alias when you need a specific Provider and model.

The launcher rejects explicit profiles, provider overrides, remote app-server options and
hosted-search requests. Hosted web search is disabled for this child; local client tool
discovery remains available. Loopback hosts are appended to both proxy bypass variables.
The dedicated `WISP_CODEX_BRIDGE_SECRET` environment variable is overwritten for the child;
the secret is absent from command arguments and the liveness probe.

The Responses endpoint implements the visible-history subset captured from `codex-cli 0.153.4`.
It translates ordinary functions, namespaces, custom tools and client tool search, including
definitions returned in discovery results. Custom tools become upstream functions with one
required string `input`; their original format/grammar is included in the description.
Generic upstreams do not enforce that grammar. Codex executes the returned original tool.

Opaque reasoning/compaction replay, stored responses, structured output and hosted search
fail explicitly. Sessions created elsewhere can resume only if they contain this supported
visible history; an opaque reasoning or compaction item is refused even after changing routes.
Antigravity cannot preserve a developer note positioned
after conversation messages, so that history is refused before upstream execution.

Base64 PNG, JPEG, WebP and GIF user images retain their order among text parts on Chat
Completions, Codex Responses and Anthropic Messages wires. Function/custom tool results
can contain those images on Codex and Anthropic; text-only keyed tool messages reject them.
Remote image URLs, files/documents and image content on assistant/system messages are refused.
Anthropic accepts default/auto image detail; explicit detail levels need a compatible Responses
or Chat Completions wire. Original detail requires Responses. This Responses door refuses
Antigravity image content because its builder cannot preserve interleaved content order.

`reasoning.context` accepts `auto`, `current_turn` and `all_turns`. Visible history stays intact;
this stateless endpoint has no replayable reasoning history. Effort uses the existing Provider
validation: an explicit effort that would be dropped or changed is rejected. Codex effort
requires advertised model support; keyed Providers receive `reasoning_effort` and remain
responsible for their model's acceptance. Antigravity effort is unsupported on this door.
Context is forwarded on a compatible Codex wire; verbosity is an advisory preference.
Cache keys and client metadata are not model instructions. No encrypted reasoning is emitted.
`reasoning.summary: "auto"` is accepted for native unknown-model fallback compatibility:
automatic selection may produce no summary, and this visible-history door emits no reasoning
items. Other summary modes and every explicit `service_tier` are rejected before sampling.
Reported token usage retains totals and cached counts; missing or invalid counts stay absent.
Anthropic's output-only final usage update is combined with its initial input counts. Truncated
output remains incomplete for both streaming and JSON responses. Responses Providers' complete
terminal text supplies any missing suffix; a disagreement with text already streamed fails
explicitly. Disconnects abort sampling.

Run the installed-CLI contract separately from the default unit suites:

```sh
bun packages/tui/tests/nativeCodex.check.ts
```

This check uses isolated homes, synthetic credentials, the actual launcher and source-hosted Bridge,
and a deterministic local Chat Completions upstream. It asserts visible answers, tool results,
and an attached image retained across a native resumed turn (`vision-followup`). The public
HTTP suite also exercises local Codex and Anthropic wire fixtures, including image tool output.
The fake proxy blocks native background connection attempts and must receive no Bridge or
inherited-provider destination requests. Passing this check proves local transport and wiring,
not acceptance by a live Provider. The verified host is Windows; POSIX launch paths are not
claimed as executed by this local check.

The same native cases can run through compiled or unpacked npm artifacts. Set
`WISP_NATIVE_LAUNCH` to a JSON argv prefix, for example `["C:/artifacts/wisp.exe","codex-wisp"]`
or `["C:/Program Files/nodejs/node.exe","C:/artifacts/package/bin/codex-wisp.js"]`.
Set `WISP_NATIVE_PATH` to an isolated path containing the installed native Codex executable
and any required Node/OS executables, with Bun and repository source absent. Case names may
be passed to select a subset. Each run records its exact executable, child PATH, native CLI
version, commands, upstream captures and visible output under `out/codex-native-<timestamp>`.

Run the artifact smoke check separately:

```sh
bun build --compile packages/tui/src/index.tsx --outfile out/wisp.exe
node packages/tui/tests/packagedCodex.check.mjs out/wisp.exe /path/to/unpacked/package
```

The optional npm directory must come from `npm pack`, with the matching unpacked platform
package under `node_modules/@tsd47216/wisp-router-<platform>-<arch>`. Stage copies of the npm
templates, stamp both package versions and every optional dependency to the terminal version,
and put the compiled binary in the platform package's `bin/` before packing. Source templates
remain `0.0.0-dev`, matching release workflow stamping. The check copies artifacts outside
the repository, empties the child PATH, and verifies launcher failures, existing commands,
the compiled Responses route, config/auth preservation and npm optional-dependency/cache resolution.

## Release surfaces and evidence limits

- **Terminal 2.1.4:** compiled TUI/headless Bridge bundles the new shared core; npm exposes
  `wisp`, `claude-wisp` and `codex-wisp` through the same binary resolver.
- **VS Code 1.13.7:** the release VSIX bundles the Responses endpoint and Provider fidelity
  changes for the extension-hosted Bridge. Core tests and extension compilation cover
  regressions; they do not exercise an installed VS Code session. Install the VSIX and reload
  the extension before using the updated hosted Bridge.
- **Slot plugin:** unchanged and unrelated to this Codex launcher.
- **Coverage:** native `codex-cli 0.153.4` on Windows x64 exercises text/resume, image/resume,
  function/custom tools, patch policy rejection, discovery and namespaced follow-up against
  a deterministic keyed upstream. HTTP suites also cover local Codex and Anthropic wire
  fixtures. These are mock Provider tests, not real-provider acceptance.
- **Release matrix:** win32-x64, darwin-arm64, darwin-x64 and linux-x64 retain native builds
  and run compiled smoke checks for dispatch and authentication. These do not establish
  macOS/Linux native Codex behavior or real-provider acceptance. Existing TLS, resolver cache,
  version checks and GitHub-before-npm publication ordering are retained.

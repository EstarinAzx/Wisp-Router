# Native Codex through Wisp (source)

Start the Bridge yourself, then run either source entry from the repository root:

```sh
bun packages/tui/src/codex-wisp.ts
bun packages/tui/src/index.tsx codex-wisp exec "Explain this project"
```

Codex must already be installed. The launcher reads Wisp's existing port and Bridge secret,
checks the numeric loopback listener without sending the secret, and starts Codex with a
child-only Responses provider. It does not start a Bridge or edit either application's
configuration or authentication. Codex still owns tools, approvals, sandbox policy and sessions.

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

This check uses isolated homes, synthetic credentials, the actual source launcher and Bridge,
and a deterministic local Chat Completions upstream. It asserts visible answers, tool results,
and an attached image retained across a native resumed turn (`vision-followup`). The public
HTTP suite also exercises local Codex and Anthropic wire fixtures, including image tool output.
The fake proxy blocks native background connection attempts and must receive no Bridge or
inherited-provider destination requests. Passing this check proves local transport and wiring,
not acceptance by a live Provider. The verified host is Windows; POSIX launch paths are not
claimed as executed. npm exposure and terminal 2.1.4 packaging are tracked in #211.

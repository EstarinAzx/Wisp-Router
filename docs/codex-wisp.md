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
fail explicitly. At this first source slice, images and non-text content also fail explicitly;
content fidelity is tracked in #210. Antigravity cannot preserve a developer note positioned
after conversation messages, so that history is refused before upstream execution.

`reasoning.context` accepts `auto`, `current_turn` and `all_turns`. Visible history stays intact;
this stateless endpoint has no replayable reasoning history. Effort uses the existing Provider
validation. Context is forwarded on a compatible Codex wire; verbosity is an advisory preference.
Cache keys and client metadata are not model instructions. No encrypted reasoning is emitted.

Run the installed-CLI contract separately from the default unit suites:

```sh
bun packages/tui/tests/nativeCodex.check.ts
```

This check uses isolated homes, synthetic credentials, the actual source launcher and Bridge,
and a deterministic local Chat Completions upstream. It asserts visible answers and tool results.
The fake proxy blocks native background connection attempts and must receive no Bridge or
inherited-provider destination requests. Passing this check proves local transport and wiring,
not acceptance by a live Provider. The verified host is Windows; POSIX launch paths are not
claimed as executed. npm exposure and terminal 2.1.4 packaging are tracked in #211.

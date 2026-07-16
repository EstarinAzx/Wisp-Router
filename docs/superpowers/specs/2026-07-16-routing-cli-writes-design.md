# Routing CLI Writes Design

**Issue:** [#109 — Routing CLI: set/unset with validation + credential warning](https://github.com/EstarinAzx/Wisp-Router/issues/109)

**Parent spec:** [#107 — Routing CLI + Slot skill](https://github.com/EstarinAzx/Wisp-Router/issues/107)

## Goal

Add scriptable writes to the existing `wisp routing` command:

```text
wisp routing set <row> <providerId>/<model>
wisp routing unset <row>
```

A family word (`opus`, `sonnet`, `haiku`, or `fable`) edits that Family route. Any other non-empty row name edits an Alias. Valid bindings write even when their Provider lacks credentials, but the command prints a stable `warning:` line. Invalid edits exit non-zero and leave the map unchanged.

This completes only issue #109. Slot-skill orchestration remains issue #110.

## Existing Foundations

Issue #108 already added the seams this work extends:

- `packages/core/src/routingCli.ts` converts routing arguments and a live `RoutingMap` into command output.
- `packages/tui/src/routingCli.ts` owns home-store and console effects.
- `packages/tui/src/index.tsx` dispatches `wisp routing` before loading the renderer.

Existing routing operations remain the only edit authority:

- `withFamilyRoute` sets or clears a Family route and refuses unknown Providers.
- `withAlias` upserts an Alias and refuses empty names, unknown Providers, and names matching Provider IDs.
- `withoutAlias` removes an Alias and treats an unknown name as a no-op.

`WispHome.writeConfig` already writes by temporary file plus same-directory rename. The Bridge already reads `home.readConfig().routing` for every request. No new storage, notification, inter-process communication, or Bridge code is needed.

## Architecture

Extend the existing core command function rather than introduce another command module. It remains responsible for all argument parsing, row-kind dispatch, routing-operation calls, output text, and exit codes.

The command becomes asynchronous because credential readiness can require existing OAuth-manager checks. Its inputs are:

- argument words;
- current `RoutingMap`;
- Provider catalog;
- an injected `hasCredentials(provider)` lookup.

Its result becomes:

```ts
type RoutingCliResult = {
  nextMap?: RoutingMap;
  lines: string[];
  exitCode: number;
};
```

`nextMap` means a real write is required. Its absence means either a read-only command, a no-op, or a refused command. This keeps persistence at the TUI edge and guarantees refused edits cannot write.

The TUI adapter reads the current map, awaits the core decision, persists `nextMap` through `home.writeConfig({ routing: nextMap })`, prints every returned line, and returns the exit code.

## Command Semantics

### Show

Existing behavior stays unchanged:

- `wisp routing` prints four Family rows followed by Aliases in stored order.
- `wisp routing --json` serializes the stored `RoutingMap` directly.
- Missing Family keys are not materialized in JSON, and Aliases are not sorted.

### Set

`wisp routing set <row> <target>` requires exactly two operands.

Target parsing splits on the first `/` only:

```text
openrouter/vendor/model
```

becomes:

```text
providerId = openrouter
model      = vendor/model
```

Both target parts must be non-empty. Missing `/`, an empty Provider ID, or an empty model prints usage and exits non-zero.

If `<row>` is one of the four fixed Family keys, the command calls `withFamilyRoute`. Otherwise it calls `withAlias`.

A returned map becomes `nextMap`. An `undefined` result is refused, prints a direct error, exits non-zero, and returns no `nextMap`. Refusal messages distinguish:

- unknown Provider;
- Alias name shadowing a Provider ID;
- empty row name.

After a successful edit, the command checks only the selected Provider. If usable credentials are absent, it appends one parseable line beginning with `warning:` and still exits zero with `nextMap` present. Credential-ready edits need no success output.

### Unset

`wisp routing unset <row>` requires exactly one operand and a non-empty row.

- A Family word calls `withFamilyRoute` with no target, clearing that Family route.
- Any other row calls `withoutAlias`, removing that Alias.
- An unknown Alias is a successful no-op: exit zero, no output, no `nextMap`.
- Clearing an already-unset Family route is also treated as a no-op, avoiding an unnecessary store write.

### Usage failures

Unknown subcommands, extra operands, missing operands, and malformed targets print the full usage block and exit non-zero:

```text
Usage:
  wisp routing [--json]
  wisp routing set <row> <providerId>/<model>
  wisp routing unset <row>
```

No usage failure returns `nextMap`.

## Credential Readiness

Credential readiness mirrors the Bridge instead of adding a second policy.

For API-key Providers, the TUI adapter checks:

1. the stored key under `resolveKeyId(provider)`;
2. the Provider's environment variable.

For OAuth Providers, it calls the existing manager:

- Codex: `codexAuth.isSignedIn()`;
- Anthropic: `anthropicAuth.isSignedIn()`;
- Grok: `xaiAuth.isSignedIn()`.

This preserves Codex and Grok's existing first-use import behavior for their command-line login files. A warning says either that the Provider has no API key or is not signed in. The warning is advisory only: catalog-valid bindings always write.

Providers without a key or OAuth session are considered not credential-ready because the current Bridge client path cannot send their request. This includes local/keyless rows under current behavior; issue #109 does not change Provider usability rules.

Claude API model availability does not alter this design. Family words are Wisp routing keys used to intercept Claude Code model names; target model strings remain opaque Provider-native identifiers.

## Data Flow

For a successful set:

1. TUI adapter reads the latest map from `~/.wisp/config.json`.
2. Core parses the target and identifies Family versus Alias.
3. Core invokes the existing pure routing operation.
4. Refused operation returns no map and stops.
5. Core checks selected Provider credentials through the injected lookup.
6. TUI adapter atomically writes the returned map.
7. TUI adapter prints any warning.
8. A Bridge process reads the updated map on its next request.

No in-memory cache or watcher must be synchronized for this path.

## Error and Write Guarantees

- Parsing and validation finish before persistence.
- Existing routing operations remain authoritative for map validity.
- Refused commands never return `nextMap`.
- The adapter writes once at most.
- Credential warnings do not change the exit code or suppress the write.
- Store write failures propagate as command failures rather than printing false success.
- No-op unsets avoid rewriting the file.

The store's temporary-file rename protects readers from torn JSON. This is atomic file replacement, not multi-process transaction isolation; issue #109 does not add locking around simultaneous writers.

## Testing

Extend `packages/core/tests/routingCli.test.ts`. Tests inject a small Provider catalog and deterministic credential lookup; they do not access files or process globals.

Required cases:

- existing text and JSON output remain unchanged;
- set Family route;
- set new Alias;
- retarget existing Alias;
- unset Family route;
- unset existing Alias;
- unknown Alias unset is a no-op;
- already-unset Family is a no-op;
- target split uses only the first `/`;
- missing slash, empty Provider ID, and empty model print usage and fail;
- unknown Provider is refused with map unchanged;
- Provider-ID Alias shadow is refused with map unchanged;
- empty row is refused with map unchanged;
- missing credentials writes and emits `warning:`;
- present credentials writes without warning;
- unknown subcommand and wrong argument counts print usage and fail.

Run the complete core Vitest suite plus core and TUI TypeScript checks.

Runtime verification uses an isolated `WISP_HOME` to exercise real `set`, `unset`, warning, JSON, refusal, and no-write behavior through `packages/tui/src/index.tsx`.

One live integration check runs the Bridge in another process, sends a request, changes one safe binding through the CLI, and confirms the next request resolves through the new target without restarting the Bridge. Restore the isolated map after the check.

## Documentation

Add a concise Routing CLI section to `packages/tui/npm/wisp-router/README.md` covering:

- show and `--json`;
- Family and Alias `set` examples;
- `unset` examples;
- first-slash target syntax;
- credential-warning behavior;
- shared live `~/.wisp` state and next-request Bridge pickup.

## Out of Scope

- Slot skill creation or restore orchestration (#110).
- New routing operations or resolver changes.
- Alias rename from the CLI.
- Model-existence validation within a Provider.
- Credential refresh or sign-in from the routing command.
- File locking, transactions across processes, IPC, or Bridge restart signals.
- Interactive command behavior.
- New dependencies or abstractions.

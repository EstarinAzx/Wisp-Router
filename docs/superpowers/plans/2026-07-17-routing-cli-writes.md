# Routing CLI Writes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add validated, atomic `wisp routing set` and `wisp routing unset` commands with advisory credential warnings and next-request Bridge pickup.

**Architecture:** Extend the existing pure-ish core command seam to parse arguments, call the existing routing-map operations, and return an optional next map plus output and exit status. Keep home-store reads/writes, OAuth checks, environment lookup, and printing in the TUI adapter; the Bridge needs no changes because it already reads the map for every request.

**Tech Stack:** TypeScript 7, Bun, Vitest, `WispHome`, Node HTTP Bridge.

**Spec:** `docs/superpowers/specs/2026-07-16-routing-cli-writes-design.md` and GitHub issue #109.

## Global Constraints

- Work on local branch `issue-109-routing-cli-writes`; do not push.
- Extend `packages/core/src/routingCli.ts`; do not add another command module.
- Use `withFamilyRoute`, `withAlias`, and `withoutAlias` as the only map-edit operations.
- Split `<providerId>/<model>` on the first `/`; preserve all later slashes in the model ID.
- Refused edits return no `nextMap`, exit non-zero, and write nothing.
- Missing API key or OAuth sign-in emits one line beginning with `warning:`, still returns `nextMap`, and exits zero.
- Keep `--json` byte-shape behavior: serialize the stored `RoutingMap` directly without filling Family defaults or sorting Aliases.
- Persist only through `WispHome.writeConfig`; add no file I/O, locking, IPC, Bridge reload, or restart code.
- Keep source changes to the five approved files: core command, core tests, TUI adapter, TUI entry, and TUI README.
- Add no dependencies, abstractions for future work, Alias rename, model-existence validation, sign-in flow, or Slot skill.
- Use arrow functions unless arrow semantics fail.
- Keep Elucidate default structure and comments synchronized in edited TypeScript files: title banner, dependency/data-shape block, section banners, construct summaries, and only critical why-comments.
- Run each new core test red before implementation and green afterward.

## File Structure

- `packages/core/src/routingCli.ts` — argument parsing, Family/Alias dispatch, existing pure map-operation calls, warning/error text, optional `nextMap`, and exit status.
- `packages/core/tests/routingCli.test.ts` — all show, set, unset, refusal, parsing, warning, and usage behavior with injected Providers and credential readiness.
- `packages/tui/src/routingCli.ts` — live home/auth reads, OAuth-manager checks, atomic config write, console output.
- `packages/tui/src/index.tsx` — await the now-asynchronous renderer-free routing adapter.
- `packages/tui/npm/wisp-router/README.md` — public command examples and live-state behavior.

---

### Task 1: Set Commands and Credential Warnings

**Files:**
- Modify: `packages/core/tests/routingCli.test.ts:1-60`
- Modify: `packages/core/src/routingCli.ts:1-40`

**Interfaces:**
- Consumes: `Provider`, `RoutingMap`, `Target`, `FamilyKey`, `FAMILY_KEYS`, `withFamilyRoute`, and `withAlias` from core.
- Produces: `RoutingCliResult = { nextMap?: RoutingMap; lines: string[]; exitCode: number }`.
- Produces: `runRoutingCommand(args, map, providers, hasCredentials): Promise<RoutingCliResult>`.
- `hasCredentials` has signature `(provider: Provider) => Promise<boolean>` and performs no work unless a valid `set` reaches the warning step.

- [ ] **Step 1: Replace the core test setup and add failing set tests**

Replace `packages/core/tests/routingCli.test.ts` with this test file. It keeps all #108 behavior while adding set, refusal, target parsing, and warning coverage:

```ts
// -------- routingCli.test.ts — routing CLI snapshots, writes, validation, warnings -------- //

/*
 * Depends on:
 *   - vitest: behavior assertions.
 *   - ../src/routingCli: pure command decisions under test.
 *   - ../src/catalog + ../src/routing: Provider and RoutingMap fixtures.
 * Data shapes: none of its own.
 */

import { describe, expect, it } from 'vitest';
import { runRoutingCommand } from '../src/routingCli';
import type { Provider } from '../src/catalog';
import type { RoutingMap } from '../src/routing';

// ----------------------------- Fixtures ----------------------------- //

const provider = (id: string, over: Partial<Provider> = {}): Provider => ({
  id,
  label: id,
  baseUrl: `https://${id}.example/v1`,
  defaultModel: `default-${id}`,
  apiKeyEnv: `${id.toUpperCase().replaceAll('-', '_')}_API_KEY`,
  ...over,
});

const providers: Provider[] = [
  provider('codex', { apiKeyEnv: '', kind: 'codex' }),
  provider('groq'),
  provider('openrouter'),
  provider('openai'),
];

const map: RoutingMap = {
  families: {
    opus: { providerId: 'codex', model: 'gpt-5.6-sol' },
    haiku: { providerId: 'openrouter', model: 'vendor/old-model' },
  },
  aliases: [
    { name: 'fast', target: { providerId: 'groq', model: 'llama-3.3-70b' } },
    { name: 'slashy', target: { providerId: 'openrouter', model: 'vendor/model' } },
  ],
};

const run = (
  args: string[],
  current: RoutingMap = map,
  hasCredentials: (provider: Provider) => Promise<boolean> = async () => true,
) => runRoutingCommand(args, current, providers, hasCredentials);

const USAGE = [
  'Usage:',
  '  wisp routing [--json]',
  '  wisp routing set <row> <providerId>/<model>',
  '  wisp routing unset <row>',
];

// ----------------------------- Snapshots ----------------------------- //

describe('runRoutingCommand snapshots', () => {
  it('shows all family rows and every alias in stored order', async () => {
    await expect(run([])).resolves.toEqual({
      lines: [
        'Family routes:',
        '  opus: codex/gpt-5.6-sol',
        '  sonnet: Active Provider (fallback)',
        '  haiku: openrouter/vendor/old-model',
        '  fable: Active Provider (fallback)',
        'Aliases:',
        '  fast: groq/llama-3.3-70b',
        '  slashy: openrouter/vendor/model',
      ],
      exitCode: 0,
    });
  });

  it('shows an empty alias section without hiding the four families', async () => {
    const result = await run([], { families: {}, aliases: [] });
    expect(result.lines).toEqual([
      'Family routes:',
      '  opus: Active Provider (fallback)',
      '  sonnet: Active Provider (fallback)',
      '  haiku: Active Provider (fallback)',
      '  fable: Active Provider (fallback)',
      'Aliases:',
      '  (none)',
    ]);
  });

  it('returns the current RoutingMap shape unchanged as JSON', async () => {
    const result = await run(['--json']);
    expect(result).toEqual({ lines: [JSON.stringify(map, null, 2)], exitCode: 0 });
    expect(JSON.parse(result.lines[0])).toEqual(map);
  });
});

// ----------------------------- Set ----------------------------- //

describe('runRoutingCommand set', () => {
  it('sets a Family route and preserves slashes after the Provider separator', async () => {
    const result = await run(['set', 'sonnet', 'openrouter/vendor/new/model']);
    expect(result).toEqual({
      nextMap: {
        ...map,
        families: {
          ...map.families,
          sonnet: { providerId: 'openrouter', model: 'vendor/new/model' },
        },
      },
      lines: [],
      exitCode: 0,
    });
  });

  it('creates an Alias', async () => {
    const result = await run(['set', 'quick', 'groq/llama-fast']);
    expect(result.nextMap?.aliases).toEqual([
      ...map.aliases,
      { name: 'quick', target: { providerId: 'groq', model: 'llama-fast' } },
    ]);
  });

  it('retargets an Alias through withAlias upsert semantics', async () => {
    const result = await run(['set', 'fast', 'openrouter/vendor/replacement']);
    expect(result.nextMap?.aliases).toEqual([
      { name: 'slashy', target: { providerId: 'openrouter', model: 'vendor/model' } },
      { name: 'fast', target: { providerId: 'openrouter', model: 'vendor/replacement' } },
    ]);
  });

  it.each(['groq', '/model', 'groq/'])(
    'rejects malformed target %j with usage',
    async (target) => {
      await expect(run(['set', 'fast', target])).resolves.toEqual({ lines: USAGE, exitCode: 1 });
    },
  );

  it('refuses an unknown Provider without returning a map', async () => {
    await expect(run(['set', 'fast', 'missing/model'])).resolves.toEqual({
      lines: ["error: Unknown Provider 'missing'."],
      exitCode: 1,
    });
  });

  it('refuses an Alias that shadows a Provider id', async () => {
    await expect(run(['set', 'groq', 'openrouter/vendor/model'])).resolves.toEqual({
      lines: ["error: Alias 'groq' would shadow a Provider id."],
      exitCode: 1,
    });
  });

  it('refuses an empty row name', async () => {
    await expect(run(['set', '', 'groq/model'])).resolves.toEqual({
      lines: ['error: Row name cannot be empty.'],
      exitCode: 1,
    });
  });

  it('writes a key-backed binding but warns when no API key is available', async () => {
    const result = await run(['set', 'fast', 'groq/model'], map, async () => false);
    expect(result.nextMap).toBeDefined();
    expect(result.lines).toEqual(["warning: Provider 'groq' has no API key configured."]);
    expect(result.exitCode).toBe(0);
  });

  it('writes an OAuth binding but warns when the Provider is signed out', async () => {
    const result = await run(['set', 'opus', 'codex/gpt-5.6-sol'], map, async () => false);
    expect(result.nextMap).toBeDefined();
    expect(result.lines).toEqual(["warning: Provider 'codex' is not signed in."]);
    expect(result.exitCode).toBe(0);
  });

  it('writes without a warning when credentials are present', async () => {
    await expect(run(['set', 'fast', 'groq/model'])).resolves.toMatchObject({
      lines: [],
      exitCode: 0,
    });
  });
});

// ----------------------------- Usage ----------------------------- //

describe('runRoutingCommand usage', () => {
  it('rejects an unknown subcommand', async () => {
    await expect(run(['wat'])).resolves.toEqual({ lines: USAGE, exitCode: 1 });
  });
});
```

- [ ] **Step 2: Run the set tests and verify red**

Run:

```bash
bunx vitest run packages/core/tests/routingCli.test.ts
```

Expected: FAIL because `runRoutingCommand` is still synchronous, has the old two-argument signature, returns the old one-line usage, and has no `set` behavior.

- [ ] **Step 3: Replace the core command with the minimal async set implementation**

Replace `packages/core/src/routingCli.ts` with:

```ts
// -------- routingCli.ts — pure decisions for `wisp routing` snapshots and writes -------- //

/*
 * Depends on:
 *   - ./catalog: Provider data used for target validation and warning wording.
 *   - ./routing: RoutingMap data, fixed Family keys, and the existing pure edit operations.
 * Data shapes:
 *   - RoutingCliResult: optional next map, printable lines, and process exit code.
 */

import type { Provider } from './catalog';
import {
  FAMILY_KEYS, withAlias, withFamilyRoute,
  type FamilyKey, type RoutingMap, type Target,
} from './routing';

// ----------------------------- Result + usage ----------------------------- //

export type RoutingCliResult = { nextMap?: RoutingMap; lines: string[]; exitCode: number };

const USAGE = [
  'Usage:',
  '  wisp routing [--json]',
  '  wisp routing set <row> <providerId>/<model>',
  '  wisp routing unset <row>',
];

const usage = (): RoutingCliResult => ({ lines: [...USAGE], exitCode: 1 });
const failure = (message: string): RoutingCliResult => ({ lines: [`error: ${message}`], exitCode: 1 });

// ----------------------------- Parse helpers ----------------------------- //

const familyFor = (row: string): FamilyKey | undefined =>
  FAMILY_KEYS.find((family) => family === row);

const parseTarget = (raw: string): Target | undefined => {
  const slash = raw.indexOf('/');
  if (slash <= 0 || slash === raw.length - 1) return undefined;
  return { providerId: raw.slice(0, slash), model: raw.slice(slash + 1) };
};

const missingCredentialWarning = (provider: Provider): string =>
  provider.kind === 'codex' || provider.kind === 'anthropic-oauth' || provider.kind === 'xai-oauth'
    ? `warning: Provider '${provider.id}' is not signed in.`
    : `warning: Provider '${provider.id}' has no API key configured.`;

// ----------------------------- Commands ----------------------------- //

const setCommand = async (
  args: string[],
  map: RoutingMap,
  providers: Provider[],
  hasCredentials: (provider: Provider) => Promise<boolean>,
): Promise<RoutingCliResult> => {
  if (args.length !== 3) return usage();
  const [, row, rawTarget] = args;
  if (!row) return failure('Row name cannot be empty.');

  // Split once: Provider ids cannot contain '/', while Provider-native model ids can.
  const target = parseTarget(rawTarget);
  if (!target) return usage();

  const provider = providers.find((candidate) => candidate.id === target.providerId);
  if (!provider) return failure(`Unknown Provider '${target.providerId}'.`);

  const family = familyFor(row);
  if (!family && providers.some((candidate) => candidate.id === row)) {
    return failure(`Alias '${row}' would shadow a Provider id.`);
  }

  const nextMap = family
    ? withFamilyRoute(map, providers, family, target)
    : withAlias(map, providers, row, target);
  if (!nextMap) return failure('Routing edit was refused.');

  const lines = await hasCredentials(provider) ? [] : [missingCredentialWarning(provider)];
  return { nextMap, lines, exitCode: 0 };
};

// Convert argv and injected live state to output without reading files or touching process globals.
export const runRoutingCommand = async (
  args: string[],
  map: RoutingMap,
  providers: Provider[],
  hasCredentials: (provider: Provider) => Promise<boolean>,
): Promise<RoutingCliResult> => {
  if (args.length === 1 && args[0] === '--json') {
    // Serialize the live map itself so snapshots retain alias order and exact stored fields.
    return { lines: [JSON.stringify(map, null, 2)], exitCode: 0 };
  }
  if (args.length === 0) {
    const lines = [
      'Family routes:',
      ...FAMILY_KEYS.map((family) => {
        const target = map.families[family];
        return `  ${family}: ${target ? `${target.providerId}/${target.model}` : 'Active Provider (fallback)'}`;
      }),
      'Aliases:',
      ...(map.aliases.length > 0
        ? map.aliases.map(({ name, target }) => `  ${name}: ${target.providerId}/${target.model}`)
        : ['  (none)']),
    ];
    return { lines, exitCode: 0 };
  }
  if (args[0] === 'set') return setCommand(args, map, providers, hasCredentials);
  return usage();
};
```

- [ ] **Step 4: Run the focused tests and verify green**

Run:

```bash
bunx vitest run packages/core/tests/routingCli.test.ts
```

Expected: all snapshot, set, warning, refusal, and usage tests PASS.

- [ ] **Step 5: Commit the core set behavior**

```bash
git add packages/core/src/routingCli.ts packages/core/tests/routingCli.test.ts
git commit -m "feat(cli): add routing set"
```

---

### Task 2: Unset Commands and No-Op Writes

**Files:**
- Modify: `packages/core/tests/routingCli.test.ts`
- Modify: `packages/core/src/routingCli.ts`

**Interfaces:**
- Consumes: Task 1's `RoutingCliResult`, `runRoutingCommand`, `familyFor`, and `usage` behavior.
- Produces: `unset <family>` with clear semantics and `unset <alias>` with remove semantics.
- No-op rule: an absent Family target or unknown Alias returns `{ lines: [], exitCode: 0 }` without `nextMap`.

- [ ] **Step 1: Add failing unset and argument-shape tests**

Insert this block before the Usage section in `packages/core/tests/routingCli.test.ts`:

```ts
// ----------------------------- Unset ----------------------------- //

describe('runRoutingCommand unset', () => {
  it('clears a Family route', async () => {
    const result = await run(['unset', 'opus']);
    expect(result).toEqual({
      nextMap: { ...map, families: { ...map.families, opus: undefined } },
      lines: [],
      exitCode: 0,
    });
  });

  it('removes an Alias', async () => {
    const result = await run(['unset', 'fast']);
    expect(result).toEqual({
      nextMap: {
        ...map,
        aliases: [{ name: 'slashy', target: { providerId: 'openrouter', model: 'vendor/model' } }],
      },
      lines: [],
      exitCode: 0,
    });
  });

  it('treats an unknown Alias as a no-op without a write', async () => {
    await expect(run(['unset', 'missing'])).resolves.toEqual({ lines: [], exitCode: 0 });
  });

  it('treats an already-unset Family as a no-op without a write', async () => {
    await expect(run(['unset', 'sonnet'])).resolves.toEqual({ lines: [], exitCode: 0 });
  });

  it('refuses an empty row name', async () => {
    await expect(run(['unset', ''])).resolves.toEqual({
      lines: ['error: Row name cannot be empty.'],
      exitCode: 1,
    });
  });
});
```

Expand the Usage describe block with:

```ts
  it.each([
    ['set'],
    ['set', 'fast'],
    ['set', 'fast', 'groq/model', 'extra'],
    ['unset'],
    ['unset', 'fast', 'extra'],
    ['--json', 'extra'],
  ])('rejects wrong argument shape %j', async (...args) => {
    await expect(run(args)).resolves.toEqual({ lines: USAGE, exitCode: 1 });
  });
```

- [ ] **Step 2: Run the focused tests and verify red**

Run:

```bash
bunx vitest run packages/core/tests/routingCli.test.ts
```

Expected: unset success/no-op tests FAIL because `unset` still falls through to usage. Existing Task 1 tests remain green.

- [ ] **Step 3: Add the minimal unset command**

Update the routing import in `packages/core/src/routingCli.ts` to include `withoutAlias`:

```ts
import {
  FAMILY_KEYS, withAlias, withFamilyRoute, withoutAlias,
  type FamilyKey, type RoutingMap, type Target,
} from './routing';
```

Add this function after `setCommand`:

```ts
const unsetCommand = (
  args: string[],
  map: RoutingMap,
  providers: Provider[],
): RoutingCliResult => {
  if (args.length !== 2) return usage();
  const [, row] = args;
  if (!row) return failure('Row name cannot be empty.');

  const family = familyFor(row);
  if (family) {
    if (!map.families[family]) return { lines: [], exitCode: 0 };
    return {
      nextMap: withFamilyRoute(map, providers, family, undefined)!,
      lines: [],
      exitCode: 0,
    };
  }

  if (!map.aliases.some((alias) => alias.name === row)) return { lines: [], exitCode: 0 };
  return { nextMap: withoutAlias(map, row), lines: [], exitCode: 0 };
};
```

Add the unset branch immediately after the set branch in `runRoutingCommand`:

```ts
  if (args[0] === 'set') return setCommand(args, map, providers, hasCredentials);
  if (args[0] === 'unset') return unsetCommand(args, map, providers);
  return usage();
```

- [ ] **Step 4: Run the focused tests and verify green**

Run:

```bash
bunx vitest run packages/core/tests/routingCli.test.ts
```

Expected: every routing CLI test PASS, including no-op cases with no `nextMap`.

- [ ] **Step 5: Commit unset behavior**

```bash
git add packages/core/src/routingCli.ts packages/core/tests/routingCli.test.ts
git commit -m "feat(cli): add routing unset"
```

---

### Task 3: TUI Credential Lookup and Atomic Persistence

**Files:**
- Modify: `packages/tui/src/routingCli.ts:1-21`
- Modify: `packages/tui/src/index.tsx:18-20`

**Interfaces:**
- Consumes: Task 2's async `runRoutingCommand(args, map, providers, hasCredentials)` and optional `nextMap`.
- Consumes: `PROVIDERS`, `resolveKeyId`, Provider-kind guards, shared `home`, and existing OAuth managers.
- Produces: `runRoutingCli(args: string[]): Promise<number>`.
- Side-effect order: read latest state → decide → atomically persist `nextMap` if present → print lines → return exit code.

- [ ] **Step 1: Update the TUI adapter for live credentials and persistence**

Replace `packages/tui/src/routingCli.ts` with:

```ts
// -------- routingCli.ts — `wisp routing`: live state, credentials, write, print -------- //

/*
 * Depends on:
 *   - @wisp/core: Provider catalog/credential routing, empty-map default, and command decisions.
 *   - ./store: shared ~/.wisp handle and OAuth managers.
 * Data shapes: none of its own.
 */

import {
  EMPTY_ROUTING_MAP, PROVIDERS,
  isAnthropicProvider, isCodexProvider, isXaiProvider,
  resolveKeyId, runRoutingCommand,
  type Provider,
} from '@wisp/core';
import { home, anthropicAuth, codexAuth, xaiAuth } from './store';

// ----------------------------- Credential readiness ----------------------------- //

// Match the Bridge's usable-Provider rule so this command warns without inventing a stricter policy.
const hasCredentials = async (provider: Provider): Promise<boolean> => {
  if (isCodexProvider(provider)) return codexAuth.isSignedIn();
  if (isAnthropicProvider(provider)) return anthropicAuth.isSignedIn();
  if (isXaiProvider(provider)) return xaiAuth.isSignedIn();

  const stored = home.readAuth().keys?.[resolveKeyId(provider)]?.trim();
  const fromEnv = provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : undefined;
  return !!(stored || fromEnv);
};

// ----------------------------- Run ----------------------------- //

// Keep filesystem and console effects at this outer edge; core owns every output decision.
export const runRoutingCli = async (args: string[]): Promise<number> => {
  const map = home.readConfig().routing ?? EMPTY_ROUTING_MAP;
  const result = await runRoutingCommand(args, map, PROVIDERS, hasCredentials);
  if (result.nextMap) home.writeConfig({ routing: result.nextMap });
  for (const line of result.lines) console.log(line);
  return result.exitCode;
};
```

- [ ] **Step 2: Await the renderer-free routing adapter**

Change the routing branch in `packages/tui/src/index.tsx` to:

```ts
} else if (process.argv[2] === 'routing') {
  const { runRoutingCli } = await import('./routingCli');
  process.exitCode = await runRoutingCli(process.argv.slice(3));
```

Update that file's dependency line from “Routing snapshot command” to “Routing snapshot/write command” so comment and code stay synchronized.

- [ ] **Step 3: Run typechecks**

Run:

```bash
bun run --cwd packages/core typecheck
bun run --cwd packages/tui compile
```

Expected: both commands exit 0. Any error about a Promise assigned to `process.exitCode` means the `await` in `index.tsx` is missing.

- [ ] **Step 4: Invoke the scoped TUI verification skill**

Invoke:

```text
/packages/tui:verify
```

Follow its temporary-`WISP_HOME` instructions. Expected: `wisp routing` and `wisp routing --json` still return immediately, emit no renderer ANSI output, and preserve #108 snapshots.

- [ ] **Step 5: Exercise set, unset, warning, and no-write behavior through the real entry point**

Run this from repository root in Git Bash:

```bash
set -e
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
printf '%s\n' '{"routing":{"families":{},"aliases":[]}}' > "$sandbox/config.json"

set_output="$(OPENROUTER_API_KEY=test-key WISP_HOME="$sandbox" bun packages/tui/src/index.tsx routing set haiku openrouter/vendor/model)"
test -z "$set_output"
WISP_HOME="$sandbox" bun packages/tui/src/index.tsx routing --json | grep -Fq '"model": "vendor/model"'

WISP_HOME="$sandbox" bun packages/tui/src/index.tsx routing unset haiku
WISP_HOME="$sandbox" bun packages/tui/src/index.tsx routing --json | grep -Fq '"families": {}'

warning_output="$(WISP_HOME="$sandbox" bun packages/tui/src/index.tsx routing set fast groq/llama-3.3-70b)"
test "$warning_output" = "warning: Provider 'groq' has no API key configured."
WISP_HOME="$sandbox" bun packages/tui/src/index.tsx routing --json | grep -Fq '"name": "fast"'

cp "$sandbox/config.json" "$sandbox/before-refusal.json"
set +e
refusal_output="$(WISP_HOME="$sandbox" bun packages/tui/src/index.tsx routing set fast missing/model 2>&1)"
refusal_code=$?
set -e
test "$refusal_code" -eq 1
test "$refusal_output" = "error: Unknown Provider 'missing'."
cmp "$sandbox/before-refusal.json" "$sandbox/config.json"
```

Expected: script exits 0. Successful keyed set is silent, warning set persists with exit 0, unset removes the Family target, and refused set leaves `config.json` byte-identical.

- [ ] **Step 6: Commit TUI write plumbing**

```bash
git add packages/tui/src/routingCli.ts packages/tui/src/index.tsx
git commit -m "feat(tui): persist routing CLI edits"
```

---

### Task 4: README and End-to-End Verification

**Files:**
- Modify: `packages/tui/npm/wisp-router/README.md:17-27`

**Interfaces:**
- Consumes: completed `wisp routing`, `set`, `unset`, and live Bridge behavior.
- Produces: public command documentation only; no code interface.

- [ ] **Step 1: Add the Routing CLI documentation**

Insert this section after Quick start and before the state-location paragraph in `packages/tui/npm/wisp-router/README.md`:

````markdown
## Routing

```sh
wisp routing                                  # show Family routes and Aliases
wisp routing --json                           # machine-readable snapshot
wisp routing set haiku codex/gpt-5.3-codex   # set a Family route
wisp routing set fast openrouter/openai/gpt-5 # create or retarget an Alias
wisp routing unset haiku                      # clear a Family route
wisp routing unset fast                       # remove an Alias
```

Targets use `<providerId>/<model>` and split on the first `/`, so Provider-native model ids may contain more slashes. A valid target is written even when its Provider lacks an API key or OAuth sign-in; the command exits zero and prints a `warning:` line.

Routing commands edit the shared `~/.wisp/config.json` atomically. A running Bridge reads that file for every request, so the next request uses the new binding without a restart.
````

- [ ] **Step 2: Commit the README**

```bash
git add packages/tui/npm/wisp-router/README.md
git commit -m "docs(tui): document routing commands"
```

- [ ] **Step 3: Run the full automated gate**

Run:

```bash
bun run --cwd packages/core test
bun run --cwd packages/core typecheck
bun run --cwd packages/tui compile
git diff --check
```

Expected: full core suite reports zero failures, both TypeScript commands exit 0, and `git diff --check` prints nothing.

- [ ] **Step 4: Verify live next-request pickup with a real Bridge process and local mock Provider**

This proof uses isolated state, a local mock OpenAI-compatible Provider, and the real `wisp serve` plus `wisp routing set` entry points. It sends the same `claude-haiku-*` request before and after the CLI edit; only the second request may use the pinned Target model.

Run from repository root in Git Bash:

```bash
set -e
sandbox="$(mktemp -d)"
bridge_pid=
mock_pid=
cleanup() {
  test -z "$bridge_pid" || kill "$bridge_pid" 2>/dev/null || true
  test -z "$mock_pid" || kill "$mock_pid" 2>/dev/null || true
  rm -rf "$sandbox"
}
trap cleanup EXIT

free_port() {
  node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"
}
bridge_port="$(free_port)"
mock_port="$(free_port)"

cat > "$sandbox/mock.cjs" <<'JS'
const fs = require('fs');
const http = require('http');
const log = process.argv[2];
const port = Number(process.argv[3]);

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/ready') {
    res.writeHead(200).end('ready');
    return;
  }

  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const model = JSON.parse(body).model;
    fs.appendFileSync(log, `${model}\n`);
    const chunk = (delta, finishReason = null) => `data: ${JSON.stringify({
      id: 'chatcmpl-live',
      object: 'chat.completion.chunk',
      created: 0,
      model,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    })}\n\n`;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(chunk({ content: `reply:${model}` }) + chunk({}, 'stop') + 'data: [DONE]\n\n');
  });
}).listen(port, '127.0.0.1');
JS

cat > "$sandbox/config.json" <<JSON
{
  "provider": "custom",
  "models": { "custom": "before-model" },
  "customBaseUrl": "http://127.0.0.1:$mock_port/v1",
  "bridge": { "port": $bridge_port },
  "routing": { "families": {}, "aliases": [] }
}
JSON
cat > "$sandbox/auth.json" <<'JSON'
{
  "keys": { "custom": "safe-local-test-key" },
  "bridgeSecret": "test-secret"
}
JSON

node "$sandbox/mock.cjs" "$sandbox/models.log" "$mock_port" > "$sandbox/mock.out" 2>&1 &
mock_pid=$!
curl --retry 50 --retry-connrefused --retry-delay 0 --max-time 10 -fsS "http://127.0.0.1:$mock_port/ready" > /dev/null

WISP_HOME="$sandbox" bun packages/tui/src/index.tsx serve > "$sandbox/bridge.out" 2>&1 &
bridge_pid=$!
curl --retry 50 --retry-connrefused --retry-delay 0 --max-time 10 -fsS \
  -H 'Authorization: Bearer test-secret' \
  "http://127.0.0.1:$bridge_port/v1/models" > /dev/null

request='{"model":"claude-haiku-4-5","max_tokens":32,"stream":false,"messages":[{"role":"user","content":"ping"}]}'
before="$(curl -fsS \
  -H 'x-api-key: test-secret' \
  -H 'anthropic-version: 2023-06-01' \
  -H 'content-type: application/json' \
  -d "$request" \
  "http://127.0.0.1:$bridge_port/v1/messages")"
printf '%s' "$before" | grep -Fq '"text":"reply:before-model"'

WISP_HOME="$sandbox" bun packages/tui/src/index.tsx routing set haiku custom/after-model

after="$(curl -fsS \
  -H 'x-api-key: test-secret' \
  -H 'anthropic-version: 2023-06-01' \
  -H 'content-type: application/json' \
  -d "$request" \
  "http://127.0.0.1:$bridge_port/v1/messages")"
printf '%s' "$after" | grep -Fq '"text":"reply:after-model"'

test "$(sed -n '1p' "$sandbox/models.log")" = 'before-model'
test "$(sed -n '2p' "$sandbox/models.log")" = 'after-model'
test "$(wc -l < "$sandbox/models.log" | tr -d ' ')" -eq 2
```

Expected: script exits 0. First request reaches `custom/before-model`; CLI writes `haiku -> custom/after-model` while Bridge keeps running; next identical request reaches `custom/after-model`.

- [ ] **Step 5: Review only the issue #109 diff**

Run:

```bash
git status --short --branch
git diff main...HEAD -- \
  packages/core/src/routingCli.ts \
  packages/core/tests/routingCli.test.ts \
  packages/tui/src/routingCli.ts \
  packages/tui/src/index.tsx \
  packages/tui/npm/wisp-router/README.md
```

Expected: branch is `issue-109-routing-cli-writes`; only the five approved implementation files differ beyond the already-committed spec and this plan. Every changed source line traces to set/unset, warning, persistence, or async dispatch.

- [ ] **Step 6: Run the project review gate**

Invoke `/preset review`. Resolve any confirmed issue with a new commit; do not amend earlier commits. Then rerun Step 3 and the affected runtime proof.

- [ ] **Step 7: Close issue only after all evidence is green**

Confirm:

- core suite has zero failures;
- core and TUI TypeScript checks exit 0;
- scoped TUI verification passes;
- isolated set/unset/refusal script exits 0;
- live Bridge proof exits 0 and records `before-model`, then `after-model`;
- working tree is clean.

Then close #109 through the normal repository workflow. Do not push unless the user asks.

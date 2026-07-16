# Routing CLI Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add renderer-free `wisp routing` text output and a faithful `wisp routing --json` snapshot of the live Routing map.

**Architecture:** A new pure core module converts routing argv plus a `RoutingMap` into output lines and an exit code. Thin TUI glue reads `~/.wisp/config.json`, prints the result, and is reached by a lazy entry-point branch before any OpenTUI import.

**Tech Stack:** TypeScript 7, Bun, Vitest, WispHome.

**Spec:** GitHub issues #107 and #108.

## Global Constraints

- Implement only show and `--json`; set/unset, credential warnings, and README changes belong to #109.
- `--json` must serialize the current `RoutingMap` directly; do not normalize, sort, or rebuild it.
- Human output must always list `opus`, `sonnet`, `haiku`, and `fable`, then every alias in stored order.
- Unset family rows must say `Active Provider (fallback)`.
- Dispatch must happen before renderer imports and must use lazy imports.
- Decision logic stays pure and vscode-free in core; filesystem and printing stay in TUI glue.
- Arrow functions by default.
- Match Elucidate house style in every new or edited logic-bearing source file: title banner, dependency/data-shape block, section banners, construct summaries, sparse why-comments.
- Add no dependencies and touch no routing resolver behavior.

---

### Task 1: Pure Routing Snapshot Output

**Files:**
- Create: `packages/core/src/routingCli.ts`
- Create: `packages/core/tests/routingCli.test.ts`
- Modify: `packages/core/src/index.ts:3-27`

**Interfaces:**
- Consumes: `RoutingMap`, `FAMILY_KEYS`, and `FamilyKey` from `packages/core/src/routing.ts`.
- Produces: `export type RoutingCliResult = { lines: string[]; exitCode: number }`.
- Produces: `export const runRoutingCommand = (args: string[], map: RoutingMap): RoutingCliResult`.

- [ ] **Step 1: Write failing behavior tests**

Create `packages/core/tests/routingCli.test.ts`:

```ts
// ------------ routingCli.test.ts — routing CLI text and JSON snapshot behavior ------------ //

import { describe, expect, it } from 'vitest';
import { runRoutingCommand } from '../src/routingCli';
import type { RoutingMap } from '../src/routing';

const map: RoutingMap = {
  families: {
    opus: { providerId: 'codex', model: 'gpt-5.6-sol' },
    haiku: { providerId: 'opencode-go', model: 'minimax-m2.5' },
  },
  aliases: [
    { name: 'fast', target: { providerId: 'groq', model: 'llama-3.3-70b' } },
    { name: 'slashy', target: { providerId: 'openrouter', model: 'vendor/model' } },
  ],
};

describe('runRoutingCommand', () => {
  it('shows all family rows and every alias in stored order', () => {
    expect(runRoutingCommand([], map)).toEqual({
      lines: [
        'Family routes:',
        '  opus: codex/gpt-5.6-sol',
        '  sonnet: Active Provider (fallback)',
        '  haiku: opencode-go/minimax-m2.5',
        '  fable: Active Provider (fallback)',
        'Aliases:',
        '  fast: groq/llama-3.3-70b',
        '  slashy: openrouter/vendor/model',
      ],
      exitCode: 0,
    });
  });

  it('shows an empty alias section without hiding the four families', () => {
    const result = runRoutingCommand([], { families: {}, aliases: [] });
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

  it('returns the current RoutingMap shape unchanged as JSON', () => {
    const result = runRoutingCommand(['--json'], map);
    expect(result).toEqual({ lines: [JSON.stringify(map, null, 2)], exitCode: 0 });
    expect(JSON.parse(result.lines[0])).toEqual(map);
  });

  it('rejects unknown arguments with usage and a non-zero exit', () => {
    expect(runRoutingCommand(['--wat'], map)).toEqual({
      lines: ['Usage: wisp routing [--json]'],
      exitCode: 1,
    });
  });
});
```

- [ ] **Step 2: Run focused test and confirm red state**

Run:

```bash
bunx vitest run packages/core/tests/routingCli.test.ts
```

Expected: FAIL because `../src/routingCli` does not exist.

- [ ] **Step 3: Implement minimum pure formatter**

Create `packages/core/src/routingCli.ts`:

```ts
// -------- routingCli.ts — pure output decisions for `wisp routing` snapshots -------- //

/*
 * Depends on:
 *   - ./routing: RoutingMap data and fixed Family row order.
 * Data shapes:
 *   - RoutingCliResult: printable lines plus process exit code.
 */

import { FAMILY_KEYS, type RoutingMap } from './routing';

// ----------------------------- Result shape ----------------------------- //

export type RoutingCliResult = { lines: string[]; exitCode: number };

const USAGE = 'Usage: wisp routing [--json]';

// ----------------------------- Command decision ----------------------------- //

// Convert argv and current state to output without reading files or touching process globals.
export const runRoutingCommand = (args: string[], map: RoutingMap): RoutingCliResult => {
  if (args.length === 1 && args[0] === '--json') {
    // Serialize the live map itself so snapshots retain alias order and exact stored fields.
    return { lines: [JSON.stringify(map, null, 2)], exitCode: 0 };
  }
  if (args.length > 0) return { lines: [USAGE], exitCode: 1 };

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
};
```

Modify `packages/core/src/index.ts` dependency list and exports:

```ts
 *   - ./catalog, ./routing, ./routingCli, ./bridge, ./bridgeAnthropic, ./bridgeServer,
```

```ts
export * from './routing';
export * from './routingCli';
```

- [ ] **Step 4: Run focused and full core tests**

Run:

```bash
bunx vitest run packages/core/tests/routingCli.test.ts
bun run test
```

Expected: focused suite PASS; full core suite PASS.

---

### Task 2: Renderer-Free TUI Dispatch

**Files:**
- Create: `packages/tui/src/routingCli.ts`
- Modify: `packages/tui/src/index.tsx:2-27`

**Interfaces:**
- Consumes: `runRoutingCommand`, `EMPTY_ROUTING_MAP` from `@wisp/core`; `home` from `packages/tui/src/store.ts`.
- Produces: `export const runRoutingCli = (args: string[]): number`.

- [ ] **Step 1: Add thin store/print glue**

Create `packages/tui/src/routingCli.ts`:

```ts
// -------- routingCli.ts — `wisp routing`: read live state, print pure core result -------- //

/*
 * Depends on:
 *   - @wisp/core: empty-map default and pure routing command output.
 *   - ./store: shared ~/.wisp handle.
 * Data shapes: none of its own.
 */

import { EMPTY_ROUTING_MAP, runRoutingCommand } from '@wisp/core';
import { home } from './store';

// ----------------------------- Run ----------------------------- //

// Keep filesystem and console effects at this outer edge; core owns every output decision.
export const runRoutingCli = (args: string[]): number => {
  const map = home.readConfig().routing ?? EMPTY_ROUTING_MAP;
  const result = runRoutingCommand(args, map);
  for (const line of result.lines) console.log(line);
  return result.exitCode;
};
```

- [ ] **Step 2: Add routing branch before renderer imports**

Update `packages/tui/src/index.tsx` title/dependency text and dispatch:

```ts
// -------- index.tsx — wisp entry: serve / routing / claude-wisp / TUI dispatch -------- //
```

```ts
 *   - ./routingCli: the renderer-free Routing snapshot command (#108).
```

Insert between `serve` and `claude-wisp`:

```ts
} else if (process.argv[2] === 'routing') {
  const { runRoutingCli } = await import('./routingCli');
  process.exitCode = runRoutingCli(process.argv.slice(3));
```

- [ ] **Step 3: Typecheck TUI and core**

Run:

```bash
bun run --cwd packages/core typecheck
bun run --cwd packages/tui compile
```

Expected: both commands exit 0 with no TypeScript diagnostics.

---

### Task 3: Exercise Shipped Command Boundary

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: completed `wisp routing` entry point and `WISP_HOME` override.
- Produces: observed proof that the command reads sandbox state, preserves JSON, rejects bad args, and exits without OpenTUI.

- [ ] **Step 1: Create isolated home fixture**

Run from repository root:

```bash
sandbox="$(mktemp -d)"
printf '%s\n' '{"routing":{"families":{"opus":{"providerId":"codex","model":"gpt-5.6-sol"}},"aliases":[{"name":"fast","target":{"providerId":"groq","model":"llama-3.3-70b"}}]}}' > "$sandbox/config.json"
```

Expected: temporary directory contains one `config.json`; real `~/.wisp` remains untouched.

- [ ] **Step 2: Exercise text and JSON output**

Run:

```bash
WISP_HOME="$sandbox" bun packages/tui/src/index.tsx routing
WISP_HOME="$sandbox" bun packages/tui/src/index.tsx routing --json
```

Expected text includes all four family names, `sonnet: Active Provider (fallback)`, and alias `fast`. Expected JSON parses to:

```json
{
  "families": {
    "opus": {
      "providerId": "codex",
      "model": "gpt-5.6-sol"
    }
  },
  "aliases": [
    {
      "name": "fast",
      "target": {
        "providerId": "groq",
        "model": "llama-3.3-70b"
      }
    }
  ]
}
```

Neither command initializes or draws OpenTUI.

- [ ] **Step 3: Exercise invalid arguments**

Run:

```bash
WISP_HOME="$sandbox" bun packages/tui/src/index.tsx routing --wat
```

Expected: prints `Usage: wisp routing [--json]` and exits 1.

- [ ] **Step 4: Run final verification**

Run:

```bash
bun run test
bun run --cwd packages/core typecheck
bun run --cwd packages/tui compile
git diff --check
```

Expected: all tests pass, both typechecks exit 0, and `git diff --check` prints nothing.

- [ ] **Step 5: Review diff before commit**

Run:

```bash
git status --short
git diff -- packages/core/src/routingCli.ts packages/core/src/index.ts packages/core/tests/routingCli.test.ts packages/tui/src/routingCli.ts packages/tui/src/index.tsx
```

Expected: only approved implementation files plus this plan are changed; no generated output or sandbox files appear.

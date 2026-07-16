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

// ----------------------------- Usage ----------------------------- //

describe('runRoutingCommand usage', () => {
  it('rejects an unknown subcommand', async () => {
    await expect(run(['wat'])).resolves.toEqual({ lines: USAGE, exitCode: 1 });
  });

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
});

// -------- snapshotCli.test.ts — snapshot/revert decisions: record, refuse-if-held, restore -------- //

/*
 * Depends on:
 *   - vitest: behavior assertions.
 *   - ../src/snapshotCli: the pure command decisions under test.
 *   - ../src/routing: RoutingMap + SnapshotStore fixtures.
 * Data shapes: none of its own.
 */

import { describe, expect, it } from 'vitest';
import { runSnapshotCommand } from '../src/snapshotCli';
import type { RoutingMap, SnapshotStore } from '../src/routing';

// ----------------------------- Fixtures ----------------------------- //

const opusT = { providerId: 'codex', model: 'gpt-5.6-sol' };
const haikuT = { providerId: 'openrouter', model: 'vendor/old-model' };
const fastT = { providerId: 'groq', model: 'llama-3.3-70b' };

// opus + haiku set; sonnet + fable unset; one alias 'fast'.
const map: RoutingMap = {
  families: { opus: opusT, haiku: haikuT },
  aliases: [{ name: 'fast', target: fastT }],
};

const run = (args: string[], store: SnapshotStore = {}, current: RoutingMap = map) =>
  runSnapshotCommand(args, current, store);

const USAGE = ['Usage:', '  wisp snapshot [row]', '  wisp snapshot revert [row]'];

// ----------------------------- Snapshot one row ----------------------------- //

describe('runSnapshotCommand snapshot <row>', () => {
  it('records a set Family route', () => {
    expect(run(['opus'])).toEqual({
      nextStore: { opus: opusT },
      lines: ['snapshot opus = codex/gpt-5.6-sol'],
      exitCode: 0,
    });
  });

  it('records an unset Family route as unset', () => {
    expect(run(['sonnet'])).toEqual({
      nextStore: { sonnet: null },
      lines: ['snapshot sonnet = unset'],
      exitCode: 0,
    });
  });

  it('records an Alias by name', () => {
    expect(run(['fast'])).toEqual({
      nextStore: { fast: fastT },
      lines: ['snapshot fast = groq/llama-3.3-70b'],
      exitCode: 0,
    });
  });

  it('rejects an unknown row with usage', () => {
    expect(run(['nope'])).toEqual({ lines: USAGE, exitCode: 1 });
  });

  it('refuses loudly when the row is already held and prints the held entry', () => {
    expect(run(['opus'], { opus: haikuT })).toEqual({
      lines: ["error: 'opus' already snapshotted (openrouter/vendor/old-model)."],
      exitCode: 1,
    });
  });

  it('merges the new entry into an existing store for a different row', () => {
    expect(run(['fast'], { opus: opusT }).nextStore).toEqual({ opus: opusT, fast: fastT });
  });
});

// ----------------------------- Snapshot all ----------------------------- //

describe('runSnapshotCommand snapshot (no row)', () => {
  it('records every current row — families in fixed order, unset kept, then aliases', () => {
    expect(run([])).toEqual({
      nextStore: { opus: opusT, sonnet: null, haiku: haikuT, fable: null, fast: fastT },
      lines: [
        'snapshot opus = codex/gpt-5.6-sol',
        'snapshot sonnet = unset',
        'snapshot haiku = openrouter/vendor/old-model',
        'snapshot fable = unset',
        'snapshot fast = groq/llama-3.3-70b',
      ],
      exitCode: 0,
    });
  });

  it('refuses when any target row is already held, writing nothing', () => {
    expect(run([], { haiku: haikuT })).toEqual({
      lines: ["error: 'haiku' already snapshotted (openrouter/vendor/old-model)."],
      exitCode: 1,
    });
  });
});

// ----------------------------- Revert one row ----------------------------- //

describe('runSnapshotCommand revert <row>', () => {
  it('restores a Family Target and prints what it overwrote, clearing the entry', () => {
    // held opus recorded as codex/…; current map has opus = openrouter/… → revert writes codex back.
    const current: RoutingMap = { ...map, families: { ...map.families, opus: haikuT } };
    expect(run(['revert', 'opus'], { opus: opusT }, current)).toEqual({
      nextMap: { ...current, families: { ...current.families, opus: opusT } },
      nextStore: {},
      lines: ['revert opus -> codex/gpt-5.6-sol (was openrouter/vendor/old-model)'],
      exitCode: 0,
    });
  });

  it('reverts a row snapshotted as unset back to unset', () => {
    expect(run(['revert', 'opus'], { opus: null })).toEqual({
      nextMap: { ...map, families: { ...map.families, opus: undefined } },
      nextStore: {},
      lines: ['revert opus -> unset (was codex/gpt-5.6-sol)'],
      exitCode: 0,
    });
  });

  it('prints "was unset" when the current row is unset', () => {
    expect(run(['revert', 'sonnet'], { sonnet: opusT }).lines).toEqual([
      'revert sonnet -> codex/gpt-5.6-sol (was unset)',
    ]);
  });

  it('restores an Alias Target by upsert', () => {
    const result = run(['revert', 'fast'], { fast: opusT });
    expect(result.nextMap?.aliases).toEqual([{ name: 'fast', target: opusT }]);
    expect(result.nextStore).toEqual({});
  });

  it('clears only the reverted entry, leaving other rows held', () => {
    expect(run(['revert', 'opus'], { opus: opusT, fast: fastT }).nextStore).toEqual({ fast: fastT });
  });

  it('errors when the row is not snapshotted', () => {
    expect(run(['revert', 'opus'], {})).toEqual({
      lines: ["error: 'opus' is not snapshotted."],
      exitCode: 1,
    });
  });

  it('rejects an unknown unheld row with usage', () => {
    expect(run(['revert', 'nope'], {})).toEqual({ lines: USAGE, exitCode: 1 });
  });
});

// ----------------------------- Revert all ----------------------------- //

describe('runSnapshotCommand revert (no row)', () => {
  it('restores every held row and empties the store', () => {
    const result = run(['revert'], { opus: haikuT, fast: opusT });
    expect(result.nextMap?.families.opus).toEqual(haikuT);
    expect(result.nextMap?.aliases).toEqual([{ name: 'fast', target: opusT }]);
    expect(result.nextStore).toEqual({});
    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual([
      'revert opus -> openrouter/vendor/old-model (was codex/gpt-5.6-sol)',
      'revert fast -> codex/gpt-5.6-sol (was groq/llama-3.3-70b)',
    ]);
  });

  it('is a no-op on an empty store', () => {
    expect(run(['revert'], {})).toEqual({ lines: ['nothing to revert'], exitCode: 0 });
  });
});

// ----------------------------- Usage ----------------------------- //

describe('runSnapshotCommand usage', () => {
  it.each([
    ['opus', 'extra'],
    ['revert', 'opus', 'extra'],
  ])('rejects wrong argument shape %j', (...args) => {
    expect(run(args)).toEqual({ lines: USAGE, exitCode: 1 });
  });
});

// ----------------------------- Prototype-member row names ----------------------------- //

// An Alias may be named after an Object.prototype member ('constructor', 'toString', '__proto__') —
// the resolver matches aliases by array find, so those names route fine and must snapshot the same.
// A raw `name in store` / `store[name]` would read/plant inherited members and corrupt the config.
describe('runSnapshotCommand prototype-member row names', () => {
  const ctorMap: RoutingMap = { families: {}, aliases: [{ name: 'constructor', target: fastT }] };

  it('does not treat an unheld constructor row as snapshotted (empty store)', () => {
    expect(run(['revert', 'constructor'], {})).toEqual({ lines: USAGE, exitCode: 1 });
  });

  it('records a constructor-named Alias as an own store entry', () => {
    const result = run(['constructor'], {}, ctorMap);
    expect(Object.hasOwn(result.nextStore ?? {}, 'constructor')).toBe(true);
    expect(result.nextStore).toEqual({ constructor: fastT });
    expect(result.exitCode).toBe(0);
  });
});

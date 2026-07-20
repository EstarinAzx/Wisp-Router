// -------- snapshotCli.ts — pure decisions for `wisp snapshot` / `revert` row Snapshots (#127) -------- //

/*
 * Depends on:
 *   - ./routing: RoutingMap + SnapshotStore, fixed Family keys, the Target shape.
 * Data shapes:
 *   - SnapshotCliResult: optional next map + next store, printable lines, and process exit code.
 *
 * A row = one fixed Family route or one Alias name. Snapshot records a row's live Target (or unset,
 * for a Family) into the store; revert writes the record back, prints what it overwrote, and clears
 * the entry. Revert is unconditional (no compare-and-set) and edits the map directly — the recorded
 * value was valid when taken, so no Provider re-validation is threaded through this seam.
 */

import {
  FAMILY_KEYS,
  type FamilyKey, type RoutingMap, type SnapshotEntry, type SnapshotStore,
} from './routing';

// ----------------------------- Result + usage ----------------------------- //

export type SnapshotCliResult = { nextMap?: RoutingMap; nextStore?: SnapshotStore; lines: string[]; exitCode: number };

const USAGE = ['Usage:', '  wisp snapshot [row]', '  wisp snapshot revert [row]'];

const usage = (): SnapshotCliResult => ({ lines: [...USAGE], exitCode: 1 });
const failure = (message: string): SnapshotCliResult => ({ lines: [`error: ${message}`], exitCode: 1 });

// ----------------------------- Row helpers ----------------------------- //

// Own-property membership — never the prototype chain, so an Alias named 'constructor' / 'toString' /
// '__proto__' can't read as held (a raw `row in store` would). Lib-agnostic (no Object.hasOwn need).
const heldIn = (store: SnapshotStore, row: string): boolean => Object.prototype.hasOwnProperty.call(store, row);

const familyFor = (row: string): FamilyKey | undefined => FAMILY_KEYS.find((family) => family === row);

const render = (entry: SnapshotEntry): string => (entry ? `${entry.providerId}/${entry.model}` : 'unset');

// A row's live value: its Target, or null when the Family is unset / the Alias is absent.
const currentEntry = (map: RoutingMap, row: string): SnapshotEntry => {
  const family = familyFor(row);
  if (family) return map.families[family] ?? null;
  return map.aliases.find((alias) => alias.name === row)?.target ?? null;
};

// Snapshot-able right now? Families always are; an Alias must exist in the live map.
const isCurrentRow = (map: RoutingMap, row: string): boolean =>
  !!familyFor(row) || map.aliases.some((alias) => alias.name === row);

// Every current row, families first (fixed order) then aliases in stored order — the no-arg iteration.
const allRows = (map: RoutingMap): string[] => [...FAMILY_KEYS, ...map.aliases.map((alias) => alias.name)];

// Write a recorded entry back: set-or-unset for a Family, upsert-or-remove for an Alias.
const restore = (map: RoutingMap, row: string, entry: SnapshotEntry): RoutingMap => {
  const family = familyFor(row);
  if (family) return { ...map, families: { ...map.families, [family]: entry ?? undefined } };
  const aliases = map.aliases.filter((alias) => alias.name !== row);
  return { ...map, aliases: entry ? [...aliases, { name: row, target: entry }] : aliases };
};

// ----------------------------- Snapshot ----------------------------- //

const snapshotRow = (map: RoutingMap, store: SnapshotStore, row: string): SnapshotCliResult => {
  if (!isCurrentRow(map, row)) return usage();
  if (heldIn(store, row)) return failure(`'${row}' already snapshotted (${render(store[row])}).`);
  const entry = currentEntry(map, row);
  return { nextStore: { ...store, [row]: entry }, lines: [`snapshot ${row} = ${render(entry)}`], exitCode: 0 };
};

const snapshotAll = (map: RoutingMap, store: SnapshotStore): SnapshotCliResult => {
  const rows = allRows(map);
  const held = rows.filter((row) => heldIn(store, row));
  if (held.length > 0) {
    return { lines: held.map((row) => `error: '${row}' already snapshotted (${render(store[row])}).`), exitCode: 1 };
  }
  // Object.fromEntries writes own properties even for a __proto__ / constructor alias name; a bare
  // nextStore[row] = … would hit the prototype setter and silently drop that row.
  const entries = rows.map((row) => [row, currentEntry(map, row)] as const);
  const nextStore: SnapshotStore = { ...store, ...Object.fromEntries(entries) };
  const lines = entries.map(([row, entry]) => `snapshot ${row} = ${render(entry)}`);
  return { nextStore, lines, exitCode: 0 };
};

// ----------------------------- Revert ----------------------------- //

const revertRow = (map: RoutingMap, store: SnapshotStore, row: string): SnapshotCliResult => {
  if (!heldIn(store, row)) return isCurrentRow(map, row) ? failure(`'${row}' is not snapshotted.`) : usage();
  const recorded = store[row];
  const was = currentEntry(map, row);
  const nextStore: SnapshotStore = { ...store };
  delete nextStore[row];
  return {
    nextMap: restore(map, row, recorded),
    nextStore,
    lines: [`revert ${row} -> ${render(recorded)} (was ${render(was)})`],
    exitCode: 0,
  };
};

const revertAll = (map: RoutingMap, store: SnapshotStore): SnapshotCliResult => {
  const keys = Object.keys(store);
  if (keys.length === 0) return { lines: ['nothing to revert'], exitCode: 0 };
  // Families first in fixed order, then remaining held rows in store order — deterministic output.
  const ordered = [...FAMILY_KEYS.filter((family) => family in store), ...keys.filter((key) => !familyFor(key))];
  let nextMap = map;
  const lines: string[] = [];
  for (const row of ordered) {
    const was = currentEntry(nextMap, row);
    nextMap = restore(nextMap, row, store[row]);
    lines.push(`revert ${row} -> ${render(store[row])} (was ${render(was)})`);
  }
  return { nextMap, nextStore: {}, lines, exitCode: 0 };
};

// ----------------------------- Dispatch ----------------------------- //

// argv (after the `snapshot` token) + live map + live store → lines, exit code, next state. No I/O.
export const runSnapshotCommand = (args: string[], map: RoutingMap, store: SnapshotStore): SnapshotCliResult => {
  if (args[0] === 'revert') {
    if (args.length === 1) return revertAll(map, store);
    if (args.length === 2) return revertRow(map, store, args[1]);
    return usage();
  }
  if (args.length === 0) return snapshotAll(map, store);
  if (args.length === 1) return snapshotRow(map, store, args[0]);
  return usage();
};

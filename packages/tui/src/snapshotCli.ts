// -------- snapshotCli.ts — `wisp snapshot` / `revert`: read state, run decision, write, print -------- //

/*
 * Depends on:
 *   - @wisp/core: empty-map default, the Snapshot command decisions, the WispConfig shape.
 *   - ./store: shared ~/.wisp handle.
 * Data shapes: none of its own.
 */

import { EMPTY_ROUTING_MAP, runSnapshotCommand, type WispConfig } from '@wisp/core';
import { home } from './store';

// ----------------------------- Run ----------------------------- //

// Filesystem + console effects live at this outer edge; core owns every output and next-state decision.
export const runSnapshotCli = (args: string[]): number => {
  const cfg = home.readConfig();
  const result = runSnapshotCommand(args, cfg.routing ?? EMPTY_ROUTING_MAP, cfg.snapshots ?? {});

  const patch: Partial<WispConfig> = {};
  if (result.nextMap) patch.routing = result.nextMap;
  // An empty store writes `undefined` — the shallow merge drops the field, so a full revert clears it.
  if (result.nextStore) patch.snapshots = Object.keys(result.nextStore).length ? result.nextStore : undefined;
  if ('routing' in patch || 'snapshots' in patch) home.writeConfig(patch);

  for (const line of result.lines) console.log(line);
  return result.exitCode;
};

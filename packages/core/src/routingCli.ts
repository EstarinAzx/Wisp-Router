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

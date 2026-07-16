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

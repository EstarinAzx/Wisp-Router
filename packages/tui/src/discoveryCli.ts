// -------- discoveryCli.ts — `wisp providers` + `wisp models <provider>`: catalog discovery, headless -------- //

/*
 * Depends on:
 *   - @wisp/core: the PROVIDERS catalog + the pure command decisions (#123).
 *   - ./modelFetch: the renderer-free model-list fetch (throws with the backend's words).
 *
 * Data shapes: none of its own.
 */

import { PROVIDERS, runProvidersCommand, runModelsCommand } from '@wisp/core';
import { fetchModelList } from './modelFetch';

// ----------------------------- Run ----------------------------- //

// Console effects stay at this outer edge; core owns every output decision (routing-CLI pattern).
export const runProvidersCli = (): number => {
  const result = runProvidersCommand(PROVIDERS);
  for (const line of result.lines) console.log(line);
  return result.exitCode;
};

export const runModelsCli = async (args: string[]): Promise<number> => {
  const result = await runModelsCommand(args, PROVIDERS, fetchModelList);
  for (const line of result.lines) console.log(line);
  return result.exitCode;
};

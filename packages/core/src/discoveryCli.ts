// -------- discoveryCli.ts — pure decisions for `wisp providers` + `wisp models` (#123) -------- //

/*
 * Depends on:
 *   - ./catalog: the Provider shape — the catalog itself is injected by the caller.
 *
 * Data shapes:
 *   - DiscoveryCliResult: printable lines + process exit code (no map — these commands never write).
 *   - The model fetch is injected: resolves to the model ids, undefined when the Provider has no
 *     list to give, and THROWS with the backend's own words on a failed fetch — the routing CLI's
 *     warn-don't-refuse spirit, failures are the backend's message, never ours.
 */

import type { Provider } from './catalog';

// ----------------------------- Result ----------------------------- //

export type DiscoveryCliResult = { lines: string[]; exitCode: number };

// ----------------------------- wisp providers ----------------------------- //

// The catalog, one Provider per line, id first so scripts can cut the first token.
export const runProvidersCommand = (providers: Provider[]): DiscoveryCliResult => {
  const width = Math.max(...providers.map((p) => p.id.length)) + 2;
  return { lines: providers.map((p) => `${p.id.padEnd(width)}${p.label}`), exitCode: 0 };
};

// ----------------------------- wisp models <provider> ----------------------------- //

export const runModelsCommand = async (
  args: string[],
  providers: Provider[],
  fetchModels: (provider: Provider) => Promise<string[] | undefined>,
): Promise<DiscoveryCliResult> => {
  if (args.length !== 1 || !args[0]) {
    return { lines: ['Usage:', '  wisp models <provider>'], exitCode: 1 };
  }
  // Command-first shape (#120): a typo'd id must fail loud here — it can never fall through
  // the argv dispatch and silently open the TUI.
  const provider = providers.find((p) => p.id === args[0]);
  if (!provider) {
    return { lines: [`unknown provider: ${args[0]} — run \`wisp providers\` to list ids`], exitCode: 1 };
  }
  try {
    const models = await fetchModels(provider);
    if (!models || models.length === 0) {
      return { lines: [`no model list for '${provider.id}' — set a model id manually`], exitCode: 1 };
    }
    return { lines: models, exitCode: 0 };
  } catch (err) {
    return { lines: [`error: ${err instanceof Error ? err.message : String(err)}`], exitCode: 1 };
  }
};

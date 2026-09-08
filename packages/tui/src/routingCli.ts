// -------- routingCli.ts — `wisp routing`: live state, credentials, write, print -------- //

/*
 * Depends on:
 *   - @wisp/core: Provider catalog/credential routing, empty-map default, and command decisions.
 *   - ./store: shared ~/.wisp handle and OAuth managers.
 * Data shapes: none of its own.
 */

import {
  EMPTY_ROUTING_MAP, PROVIDERS,
  isAnthropicProvider, isCodexProvider, isXaiProvider, isKimiProvider, isAntigravityProvider,
  resolveKeyId, runRoutingCommand,
  type Provider,
} from '@wisp/core';
import { home, anthropicAuth, codexAuth, xaiAuth, kimiAuth, antigravityAuth } from './store';
import { codexRoutingRows, loadCodexRoutingCatalog } from './codexRouting';

// ----------------------------- Credential readiness ----------------------------- //

// Match the Bridge's usable-Provider rule so this command warns without inventing a stricter policy.
const hasCredentials = async (provider: Provider): Promise<boolean> => {
  if (isCodexProvider(provider)) return codexAuth.isSignedIn();
  if (isAnthropicProvider(provider)) return anthropicAuth.isSignedIn();
  if (isXaiProvider(provider)) return xaiAuth.isSignedIn();
  // Kimi (#170) is credentialed by sign-in, not a key — its bearer never lands in the keys map below.
  if (isKimiProvider(provider)) return kimiAuth.isSignedIn();
  if (isAntigravityProvider(provider)) return antigravityAuth.isSignedIn();

  const stored = home.readAuth().keys?.[resolveKeyId(provider)]?.trim();
  const fromEnv = provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : undefined;
  return !!(stored || fromEnv);
};

// ----------------------------- Run ----------------------------- //

// Keep filesystem and console effects at this outer edge; core owns every output decision.
export const runRoutingCli = async (args: string[]): Promise<number> => {
  const map = home.readConfig().routing ?? EMPTY_ROUTING_MAP;
  if (args.length === 1 && args[0] === 'codex') {
    const catalog = await loadCodexRoutingCatalog();
    if (catalog.error) console.log(`${catalog.error} Saved routes remain editable.`);
    console.log('Codex model routes:');
    const rows = codexRoutingRows(map, catalog);
    for (const row of rows) console.log(`  ${row.name} (${row.id}): ${row.description}`);
    if (!rows.length) console.log('  (none discovered or saved)');
    return 0;
  }
  const result = await runRoutingCommand(args, map, PROVIDERS, hasCredentials);
  if (result.nextMap) home.writeConfig({ routing: result.nextMap });
  for (const line of result.lines) console.log(line);
  return result.exitCode;
};

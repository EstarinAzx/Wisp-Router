// -------- routingCli.ts — pure decisions for `wisp routing` snapshots and writes -------- //

/*
 * Depends on:
 *   - ./catalog: Provider data used for target validation and warning wording.
 *   - ./routing: RoutingMap data, fixed Family keys, and the existing pure edit operations.
 * Data shapes:
 *   - RoutingCliResult: optional next map, printable lines, and process exit code.
 */

import type { Provider } from './catalog';
import {
  FAMILY_KEYS, withAlias, withFamilyRoute, withoutAlias, withCodexModelRoute,
  type FamilyKey, type RoutingMap, type Target,
} from './routing';

// ----------------------------- Result + usage ----------------------------- //

export type RoutingCliResult = { nextMap?: RoutingMap; lines: string[]; exitCode: number };

const USAGE = [
  'Usage:',
  '  wisp routing [--json]',
  '  wisp routing set <row> <providerId>/<model>',
  '  wisp routing unset <row>',
  '  wisp routing codex [--json]',
  '  wisp routing codex set <model-id> <providerId>/<model>',
  '  wisp routing codex unset <model-id>',
  'Snapshots/revert cover Alias and Claude family rows only, not Codex model routes.',
];

const usage = (): RoutingCliResult => ({ lines: [...USAGE], exitCode: 1 });
const failure = (message: string): RoutingCliResult => ({ lines: [`error: ${message}`], exitCode: 1 });

// ----------------------------- Parse helpers ----------------------------- //

const familyFor = (row: string): FamilyKey | undefined =>
  FAMILY_KEYS.find((family) => family === row);

const parseTarget = (raw: string): Target | undefined => {
  const slash = raw.indexOf('/');
  if (slash <= 0 || slash === raw.length - 1) return undefined;
  return { providerId: raw.slice(0, slash), model: raw.slice(slash + 1) };
};

// Name the credential the user actually has to supply. Kimi (#170) sits with the OAuth rows here even though
// its requests ride the API-key path — what's missing is a sign-in, not a key.
const missingCredentialWarning = (provider: Provider): string =>
  provider.kind === 'codex' || provider.kind === 'anthropic-oauth' || provider.kind === 'xai-oauth'
  || provider.kind === 'kimi-oauth' || provider.kind === 'antigravity-oauth'
    ? `warning: Provider '${provider.id}' is not signed in.`
    : `warning: Provider '${provider.id}' has no API key configured.`;

// ----------------------------- Commands ----------------------------- //

const setCommand = async (
  args: string[],
  map: RoutingMap,
  providers: Provider[],
  hasCredentials: (provider: Provider) => Promise<boolean>,
  codex = false,
): Promise<RoutingCliResult> => {
  if (args.length !== 3) return usage();
  const [, row, rawTarget] = args;
  if (!row) return failure('Row name cannot be empty.');

  // Split once: Provider ids cannot contain '/', while Provider-native model ids can.
  const target = parseTarget(rawTarget);
  if (!target) return usage();

  const provider = providers.find((candidate) => candidate.id === target.providerId);
  if (!provider) return failure(`Unknown Provider '${target.providerId}'.`);

  const family = familyFor(row);
  if (!codex && !family && providers.some((candidate) => candidate.id === row)) {
    return failure(`Alias '${row}' would shadow a Provider id.`);
  }

  const nextMap = codex ? withCodexModelRoute(map, providers, row, target) : family
    ? withFamilyRoute(map, providers, family, target)
    : withAlias(map, providers, row, target);
  if (!nextMap) return failure('Routing edit was refused.');

  const lines = await hasCredentials(provider) ? [] : [missingCredentialWarning(provider)];
  return { nextMap, lines, exitCode: 0 };
};

const unsetCommand = (
  args: string[],
  map: RoutingMap,
  providers: Provider[],
  codex = false,
): RoutingCliResult => {
  if (args.length !== 2) return usage();
  const [, row] = args;
  if (!row) return failure('Row name cannot be empty.');

  if (codex) {
    if (!Object.prototype.hasOwnProperty.call(map.codexModels ?? {}, row)) return { lines: [], exitCode: 0 };
    const nextMap = withCodexModelRoute(map, providers, row, undefined);
    return nextMap ? { nextMap, lines: [], exitCode: 0 } : failure('Routing edit was refused.');
  }

  const family = familyFor(row);
  if (family) {
    if (!map.families[family]) return { lines: [], exitCode: 0 };
    return {
      nextMap: withFamilyRoute(map, providers, family, undefined)!,
      lines: [],
      exitCode: 0,
    };
  }

  if (!map.aliases.some((alias) => alias.name === row)) return { lines: [], exitCode: 0 };
  return { nextMap: withoutAlias(map, row), lines: [], exitCode: 0 };
};

// Convert argv and injected live state to output without reading files or touching process globals.
export const runRoutingCommand = async (
  args: string[],
  map: RoutingMap,
  providers: Provider[],
  hasCredentials: (provider: Provider) => Promise<boolean>,
): Promise<RoutingCliResult> => {
  if (args[0] === 'codex') {
    const rest = args.slice(1);
    if (rest[0] === 'set') return setCommand(rest, map, providers, hasCredentials, true);
    if (rest[0] === 'unset') return unsetCommand(rest, map, providers, true);
    if (rest.length === 1 && rest[0] === '--json') return { lines: [JSON.stringify(map.codexModels ?? {}, null, 2)], exitCode: 0 };
    if (rest.length === 0) return { lines: ['Codex model routes:', ...Object.entries(map.codexModels ?? {}).map(([name, target]) => `  ${name}: ${target.providerId}/${target.model}`)], exitCode: 0 };
    return usage();
  }
  if (args.length === 1 && args[0] === '--json') {
    // Serialize the live map itself so snapshots retain alias order and exact stored fields.
    return { lines: [JSON.stringify(map, null, 2)], exitCode: 0 };
  }
  if (args.length === 0) {
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
  }
  if (args[0] === 'set') return setCommand(args, map, providers, hasCredentials);
  if (args[0] === 'unset') return unsetCommand(args, map, providers);
  return usage();
};

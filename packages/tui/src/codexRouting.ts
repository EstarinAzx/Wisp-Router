// One discovery and row policy for the renderer-free CLI and the Codex routing screen.
import { PROVIDERS, parseCodexModels, type CodexModelInfo, type RoutingMap } from '@wisp/core';
import { readNativeCatalog } from './codexCatalog';
import { resolveCodex } from './codex-wisp';

export type CodexRoutingCatalog = { models: CodexModelInfo[]; error?: string };
export const loadCodexRoutingCatalog = async (env: NodeJS.ProcessEnv = process.env): Promise<CodexRoutingCatalog> => {
  try { return { models: parseCodexModels(await readNativeCatalog(resolveCodex(env), [], env)) }; }
  catch (error) { return { models: [], error: error instanceof Error ? error.message : 'Codex discovery failed.' }; }
};

export const codexRoutingRows = (map: RoutingMap, catalog: CodexRoutingCatalog): { id: string; name: string; description: string }[] => {
  const models = new Map(catalog.models.filter(m => m.visible).map(m => [m.id, m]));
  const ids = new Set([...models.keys(), ...Object.keys(map.codexModels ?? {})]);
  return [...ids].map(id => {
    const target = Object.hasOwn(map.codexModels ?? {}, id) ? map.codexModels![id] : undefined;
    const alias = map.aliases.find(a => a.name === id);
    const direct = PROVIDERS.find(p => p.id === id);
    const binding = target ? `${target.providerId}/${target.model}` : 'Not routed — Active Provider answers';
    return { id, name: models.get(id)?.name ?? id,
      description: `${binding}${direct ? `; overridden by Provider id ${direct.id}` : alias ? `; overridden by Alias → ${alias.target.providerId}/${alias.target.model}` : ''}${models.has(id) ? '' : '; unavailable in catalog'}` };
  });
};

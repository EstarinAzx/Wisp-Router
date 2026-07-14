// ---------------- routing.test.ts — the Routing map resolver's full decision table ---------------- //

import { describe, it, expect } from 'vitest';
import { resolveRoute, EMPTY_ROUTING_MAP, type RoutingMap } from './routing';
import type { Provider } from './catalog';

// Minimal Provider builder — the resolver only reads `id`; the rest is filler.
const p = (id: string): Provider => ({ id, label: id, baseUrl: '', defaultModel: `default-${id}`, apiKeyEnv: '' });

// A small catalog: `active` is the Active Provider in every test; the others are route targets.
const providers = [p('active'), p('codex'), p('go'), p('anthropic')];

// A map with every row kind populated, so precedence tests exercise real competition.
const fullMap: RoutingMap = {
  families: {
    opus: { providerId: 'codex', model: 'gpt-5.6-big' },
    sonnet: { providerId: 'go', model: 'mid-model' },
    haiku: { providerId: 'go', model: 'cheap-model' },
    fable: { providerId: 'anthropic', model: 'claude-fable-5' },
  },
  aliases: [
    { name: 'sol', target: { providerId: 'codex', model: 'gpt-5.6-sol' } },
    // An alias deliberately named like a Provider id — the Provider id must win.
    { name: 'go', target: { providerId: 'codex', model: 'shadowed' } },
    // An alias deliberately named as an exact versioned claude id — it must beat its own family row.
    { name: 'claude-opus-4-8', target: { providerId: 'go', model: 'alias-opus' } },
  ],
};

describe('resolveRoute — lookup order', () => {
  // 1. A requested model naming a Provider id routes to that Provider, unpinned.
  it('resolves a Provider id to that Provider with no pinned model', () => {
    const r = resolveRoute(fullMap, providers, 'active', 'codex');
    expect(r).toEqual({ provider: providers[1], matched: 'provider-id' });
  });

  // 2. Provider id beats an identically-named alias.
  it('Provider id beats an alias of the same name', () => {
    const r = resolveRoute(fullMap, providers, 'active', 'go');
    expect(r).toEqual({ provider: providers[2], matched: 'provider-id' });
  });

  // 3. An exact alias name routes to its Target: Provider + pinned model.
  it('resolves an alias to its Target with the pinned model', () => {
    const r = resolveRoute(fullMap, providers, 'active', 'sol');
    expect(r).toEqual({ provider: providers[1], pinnedModel: 'gpt-5.6-sol', matched: 'alias' });
  });

  // 4. An alias whose name is an exact claude id beats the family row that id would fuzzy-match.
  it('exact-id alias beats its family row', () => {
    const r = resolveRoute(fullMap, providers, 'active', 'claude-opus-4-8');
    expect(r).toEqual({ provider: providers[2], pinnedModel: 'alias-opus', matched: 'alias' });
  });

  // 5. Family fuzzy: any versioned/dated claude-* id of a family hits that family row.
  it.each([
    ['claude-opus-4-9', 'codex', 'gpt-5.6-big'],
    ['claude-haiku-4-5-20251001', 'go', 'cheap-model'],
    ['claude-3-5-sonnet-20241022', 'go', 'mid-model'],
    ['claude-fable-5', 'anthropic', 'claude-fable-5'],
  ])('family fuzzy-matches %s', (requested, providerId, model) => {
    const r = resolveRoute(fullMap, providers, 'active', requested);
    expect(r).toEqual({ provider: providers.find((x) => x.id === providerId), pinnedModel: model, matched: 'family' });
  });

  // 6. An unmapped family row falls back to the Active Provider, unpinned.
  it('unset family row falls back to the Active Provider', () => {
    const map: RoutingMap = { ...fullMap, families: { ...fullMap.families, haiku: undefined } };
    const r = resolveRoute(map, providers, 'active', 'claude-haiku-4-5');
    expect(r).toEqual({ provider: providers[0], matched: 'active' });
  });

  // 7. A non-matching name (Copilot's resolved model name, anything invented) keeps the Active fallback.
  it('unknown model name falls back to the Active Provider', () => {
    const r = resolveRoute(fullMap, providers, 'active', 'gpt-4o');
    expect(r).toEqual({ provider: providers[0], matched: 'active' });
  });

  // 8. Family words only fire on claude-* ids — a bare "opus-magnum" is not a family match.
  it('family match requires the claude- prefix', () => {
    const r = resolveRoute(fullMap, providers, 'active', 'opus-magnum');
    expect(r).toEqual({ provider: providers[0], matched: 'active' });
  });

  // 9. The empty map routes everything to the Active Provider (today's behavior, unchanged).
  it('empty map falls back to the Active Provider for every name', () => {
    const r = resolveRoute(EMPTY_ROUTING_MAP, providers, 'active', 'claude-opus-4-8');
    expect(r).toEqual({ provider: providers[0], matched: 'active' });
  });
});

describe('resolveRoute — fail-loud edges', () => {
  // A Target naming a Provider that is not in the catalog resolves to nothing — the door 404s loud,
  // never silently falls back.
  it('returns undefined for a Target with a dangling providerId', () => {
    const map: RoutingMap = { families: {}, aliases: [{ name: 'ghost', target: { providerId: 'gone', model: 'x' } }] };
    expect(resolveRoute(map, providers, 'active', 'ghost')).toBeUndefined();
  });

  // No Active Provider match either → undefined (the doors' existing 404 handles it).
  it('returns undefined when the Active fallback id is unknown', () => {
    expect(resolveRoute(EMPTY_ROUTING_MAP, providers, 'nope', 'anything')).toBeUndefined();
  });
});

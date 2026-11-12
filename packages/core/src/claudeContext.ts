// Claude Code's numeric window is process-wide. A signed launch profile binds it to one Target.
// Depends on crypto and the existing routing/capability cores; profiles contain no credentials.
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { resolveBaseUrl, resolveModel, anthropicModelCaps, ANTHROPIC_MODELS, xaiModelCaps, XAI_MODELS,
  type Provider, type ModelCaps } from './catalog';
import { resolveRoute, FAMILY_KEYS, type RoutingMap, type Target } from './routing';

export const CLAUDE_CONTEXT_HEADER = 'x-wisp-claude-context';
export const CLAUDE_CONTEXT_PREFIX = 'wisp/claude-ctx-';
export type ClaudeContextWindow = { contextWindow: number; source: 'account' | 'catalogue' | 'curated' | 'fallback' };
export type ClaudeContextState = {
  providers: Provider[]; map: RoutingMap; activeProviderId: string; modelMap: Record<string, string>; customBaseUrl: string;
};
export type ClaudeContextRoute = { route: string; target: Target; baseUrl: string };
export type ClaudeContextProfile = ClaudeContextRoute & ClaudeContextWindow & { protocol: 1; id: string };
const validText = (value: unknown): value is string => typeof value === 'string' && value.length > 0
  && value.length <= 2048 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
const validWindow = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 1 && (value as number) <= 10_000_000;
const refusal = 'Claude context target changed or is unavailable. Exit and relaunch claude-wisp --resume <session> --model <alias> to select a new target and budget.';

export const resolveClaudeContextRoute = (requested: string | undefined, state: ClaudeContextState): ClaudeContextRoute => {
  let route = requested ?? state.activeProviderId;
  if (route.startsWith('claude-wisp-')) route = route.slice('claude-wisp-'.length);
  if (!validText(route)) throw new Error('Choose a nonempty Wisp model alias or Provider.');
  const explicit = state.providers.some(p => p.id === route) || state.map.aliases.some(a => a.name === route)
    || Object.prototype.hasOwnProperty.call(state.map.codexModels ?? {}, route);
  if (!explicit) {
    const family = FAMILY_KEYS.find(key => route === key || (route.startsWith('claude-') && route.toLowerCase().includes(key)));
    if (!family || !state.map.families[family]) throw new Error(`Unknown Wisp route '${route}'. Choose an Alias, Provider or configured Claude family.`);
    if (route === family) route = `claude-${family}`;
  }
  const matched = resolveRoute(state.map, state.providers, state.activeProviderId, route);
  if (!matched || matched.matched === 'active') throw new Error(refusal);
  if (matched.provider.kind === 'gemini-interactions') throw new Error('This Target requires Responses and cannot be used by Claude Code.');
  const model = matched.pinnedModel ?? resolveModel(state.modelMap, matched.provider);
  const baseUrl = resolveBaseUrl(matched.provider, state.customBaseUrl);
  if (!validText(model) || !validText(baseUrl)) throw new Error(refusal);
  return { route, target: { providerId: matched.provider.id, model }, baseUrl };
};

export const createClaudeContextProfile = (route: string, resolved: ClaudeContextRoute, window: ClaudeContextWindow): ClaudeContextProfile => {
  if (!validWindow(window.contextWindow)) throw new Error('Invalid Claude context window.');
  const id = CLAUDE_CONTEXT_PREFIX + createHash('sha256').update(JSON.stringify([resolved.route, resolved.target, resolved.baseUrl, window.contextWindow])).digest('hex').slice(0, 24);
  return { protocol: 1, ...resolved, route: resolved.route || route, ...window, id };
};

export const signClaudeContext = (profile: ClaudeContextProfile, secret: string): string => {
  const payload = Buffer.from(JSON.stringify(profile)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(`claude-context-v1:${payload}`).digest('hex')}`;
};

export const readClaudeContext = (token: unknown, secret: string): ClaudeContextProfile => {
  const fail = () => new Error('Invalid Claude context profile; relaunch claude-wisp.');
  if (typeof token !== 'string' || token.length > 16000) throw fail();
  const match = /^([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/.exec(token);
  if (!match) throw fail();
  const expected = createHmac('sha256', secret).update(`claude-context-v1:${match[1]}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(match[2], 'hex'))) throw fail();
  let p: ClaudeContextProfile;
  try { p = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')); } catch { throw fail(); }
  if (!p || p.protocol !== 1 || !validText(p.route) || !validText(p.target?.providerId) || !validText(p.target?.model)
    || !validText(p.baseUrl) || !validWindow(p.contextWindow) || !['account', 'catalogue', 'curated', 'fallback'].includes(p.source)
    || p.id !== createClaudeContextProfile(p.route, p, p).id) throw fail();
  return p;
};

export const validateClaudeContextTarget = (profile: ClaudeContextProfile, model: string, state: ClaudeContextState): ClaudeContextRoute => {
  if (model !== profile.id) throw new Error(refusal);
  let current: ClaudeContextRoute;
  try { current = resolveClaudeContextRoute(profile.route, state); } catch { throw new Error(refusal); }
  if (current.target.providerId !== profile.target.providerId || current.target.model !== profile.target.model || current.baseUrl !== profile.baseUrl) throw new Error(refusal);
  return current;
};

export const readClaudeContextWindow = async (provider: Provider, model: string, readers: {
  codex?: () => Promise<{ id: string; contextWindow?: number; maxContextWindow?: number } | undefined>;
  antigravity?: () => Promise<{ id: string; contextWindow?: number } | undefined>;
  catalogue?: () => Promise<ModelCaps | undefined>;
}): Promise<ClaudeContextWindow> => {
  let value: number | undefined, source: ClaudeContextWindow['source'] = 'account';
  try {
    if (provider.kind === 'codex') {
      const info = await readers.codex?.();
      if (info?.id === model) value = info.maxContextWindow ?? info.contextWindow;
    } else if (provider.kind === 'antigravity-oauth') {
      const info = await readers.antigravity?.();
      if (info?.id === model) value = info.contextWindow;
    } else {
      try { value = (await readers.catalogue?.())?.contextInput; } catch { value = undefined; }
      source = 'catalogue';
      if (!validWindow(value)) {
        if (provider.kind === 'anthropic-oauth' && ANTHROPIC_MODELS.includes(model)) value = anthropicModelCaps(model).contextInput;
        if (provider.kind === 'xai-oauth' && XAI_MODELS.includes(model)) value = xaiModelCaps(model).contextInput;
        source = 'curated';
      }
    }
  } catch { /* An unavailable catalogue cannot establish a larger window. */ }
  return validWindow(value) ? { contextWindow: value, source } : { contextWindow: 128000, source: 'fallback' };
};

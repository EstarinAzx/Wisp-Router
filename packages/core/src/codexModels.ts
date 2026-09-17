// ---------------- codexModels.ts — Codex discovery, capabilities, and account-scoped cache ---------------- //

/*
 * Depends on: node fs/path/crypto for a regenerable cache; fetch for OpenAI's package metadata and
 *   the signed-in Codex catalogue; ./codex and ./shared for types only; ./homeStore for WISP_HOME.
 * Data shapes: CodexModelInfo contains only model metadata, never credentials or upstream instructions.
 * A successful catalogue (including an empty one) replaces the old snapshot. Failed refreshes retain
 * the last successful snapshot for this account and endpoint; signed-out callers receive no catalogue.
 */

import { createHash, randomUUID } from 'crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CodexCreds } from './codex';
import { wispHomeDir } from './homeStore';

export type CodexModelInfo = {
  id: string;
  name: string;
  visible: boolean;
  reasoningEfforts?: string[];
  defaultEffort?: string;
  reasoningSummary?: string;
  inputModalities?: string[];
  contextWindow?: number;
};

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

// Validate the envelope and every id before replacing a working cache. No name/suffix whitelist:
// visibility is the upstream picker policy; supported_in_api describes API-key access, not OAuth.
export const parseCodexModels = (body: unknown): CodexModelInfo[] => {
  if (!record(body) || !Array.isArray(body.models)) throw new Error('Invalid Codex model catalogue.');
  const seen = new Set<string>();
  return body.models.map((m): CodexModelInfo => {
    if (!record(m) || typeof m.slug !== 'string' || !m.slug.trim() || seen.has(m.slug)) {
      throw new Error('Invalid Codex model catalogue.');
    }
    seen.add(m.slug);
    const efforts = Array.isArray(m.supported_reasoning_levels)
      && m.supported_reasoning_levels.every((e) => record(e) && typeof e.effort === 'string' && e.effort.length > 0)
      ? [...new Set(m.supported_reasoning_levels.map((e) => (e as { effort: string }).effort))] : undefined;
    return {
      id: m.slug, name: typeof m.display_name === 'string' ? m.display_name : m.slug,
      visible: m.visibility === 'list',
      ...(efforts ? { reasoningEfforts: efforts } : {}),
      ...(typeof m.default_reasoning_level === 'string' ? { defaultEffort: m.default_reasoning_level } : {}),
      ...(typeof m.default_reasoning_summary === 'string' ? { reasoningSummary: m.default_reasoning_summary } : {}),
      ...(strings(m.input_modalities) ? { inputModalities: m.input_modalities } : {}),
      // context_window is the configured Codex window; max_context_window is a possible larger tier.
      ...(positive(m.context_window) ? { contextWindow: m.context_window } : {}),
    };
  });
};

export const codexModelIds = (models: CodexModelInfo[]): string[] => models.filter((m) => m.visible).map((m) => m.id);

type Snapshot = { schema: 1; fetchedAt: number; clientVersion: string; models: CodexModelInfo[] };
export type CodexCatalogResult = { models: CodexModelInfo[]; source: 'live' | 'cache' | 'unavailable'; error?: string };
type Args = { creds?: CodexCreds; baseUrl: string; refresh?: boolean };
const TTL_MS = 15 * 60_000;
const RETRY_MS = 60_000;
const PACKAGE_URL = 'https://registry.npmjs.org/@openai/codex/latest';
const versionString = (v: unknown): v is string => typeof v === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(v);

// One instance per process. Injected IO/clock/root make account separation, outages and refresh races
// testable without signing in, changing the real home directory, or running a model turn.
export class CodexModelCatalog {
  private inflight = new Map<string, Promise<CodexCatalogResult>>();
  private retryAt = new Map<string, number>();
  private failures = new Map<string, string>();
  constructor(
    private readonly dir: () => string = () => join(wispHomeDir(), 'cache'),
    private readonly request: typeof fetch = (...args) => fetch(...args),
    private readonly now: () => number = Date.now,
  ) {}

  private read = (file: string): Snapshot | undefined => {
    try {
      const s = JSON.parse(readFileSync(file, 'utf8'));
      if (s.schema !== 1 || !Number.isFinite(s.fetchedAt) || !versionString(s.clientVersion) || !Array.isArray(s.models)) return undefined;
      if (!s.models.every((m: unknown) => record(m) && typeof m.id === 'string' && typeof m.name === 'string'
        && typeof m.visible === 'boolean' && (m.reasoningEfforts === undefined || strings(m.reasoningEfforts))
        && (m.inputModalities === undefined || strings(m.inputModalities))
        && (m.defaultEffort === undefined || typeof m.defaultEffort === 'string')
        && (m.reasoningSummary === undefined || typeof m.reasoningSummary === 'string')
        && (m.contextWindow === undefined || positive(m.contextWindow)))) return undefined;
      return s;
    } catch { return undefined; }
  };

  private write = (file: string, snapshot: Snapshot): void => {
    mkdirSync(this.dir(), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${randomUUID()}.tmp`;
    try { writeFileSync(tmp, JSON.stringify(snapshot), { mode: 0o600 }); renameSync(tmp, file); }
    finally { try { unlinkSync(tmp); } catch { /* already renamed */ } }
  };

  get = async ({ creds, baseUrl, refresh = false }: Args): Promise<CodexCatalogResult> => {
    const bearer = creds?.accessToken || creds?.apiKey;
    if (!bearer || !creds?.accountId) return { models: [], source: 'unavailable', error: 'Sign in to Codex to discover models.' };
    const base = baseUrl.replace(/\/+$/, '');
    const scope = createHash('sha256').update(`${base}\n${creds.accountId}`).digest('hex');
    const file = join(this.dir(), `codex-${scope}.json`);
    const saved = this.read(file);
    if (!refresh && saved && this.now() - saved.fetchedAt < TTL_MS) return { models: saved.models, source: 'cache' };
    if (this.inflight.has(file)) return this.inflight.get(file)!;
    if (!refresh && this.now() < (this.retryAt.get(file) ?? 0)) {
      return { models: saved?.models ?? [], source: saved ? 'cache' : 'unavailable', error: this.failures.get(file) };
    }
    const work = (async (): Promise<CodexCatalogResult> => {
      try {
        // Codex gates discovery on client_version. Refresh the published version as data (never
        // install/execute it), rather than pinning a version that would hide future releases again.
        let clientVersion = saved?.clientVersion;
        try {
          const res = await this.request(PACKAGE_URL, { signal: AbortSignal.timeout(4000) });
          const body: unknown = await res.json();
          if (res.ok && record(body) && versionString(body.version)) clientVersion = body.version;
        } catch { /* the last successful protocol version can still discover models */ }
        if (!clientVersion) throw new Error('Could not discover the Codex client version.');
        const url = new URL(`${base}/models`);
        url.searchParams.set('client_version', clientVersion);
        const res = await this.request(url, {
          headers: { Authorization: `Bearer ${bearer}`, 'chatgpt-account-id': creds.accountId!, originator: 'codex_cli_rs' },
          redirect: 'error',
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) { await res.arrayBuffer(); throw new Error(`Codex model discovery failed (HTTP ${res.status}).`); }
        const models = parseCodexModels(await res.json());
        try { this.write(file, { schema: 1, fetchedAt: this.now(), clientVersion, models }); } catch { /* cache failure cannot discard a live answer */ }
        this.retryAt.delete(file); this.failures.delete(file);
        return { models, source: 'live' };
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Codex model discovery failed.';
        this.retryAt.set(file, this.now() + RETRY_MS); this.failures.set(file, error);
        return { models: saved?.models ?? [], source: saved ? 'cache' : 'unavailable', error };
      } finally { this.inflight.delete(file); }
    })();
    this.inflight.set(file, work);
    return work;
  };
}

export const codexCatalog = new CodexModelCatalog();

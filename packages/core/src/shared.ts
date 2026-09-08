// ---------------- shared.ts — Wisp: the provider kernel (models.dev caps, effort ladder, SSE, tool shapes) ---------------- //

/*
 * Depends on: nothing — the kernel is pure, dependency-free. Every provider file (codex/anthropic/xai) and
 *   the slimmed catalog import FROM here; this imports from none of them, so the dependency graph flows one
 *   way (providers -> shared) and can never cycle.
 *
 * Data shapes:
 *   - ModelCaps: a model's real per-model limits + vision flag, from models.dev (else a table/default fallback).
 *   - ModelsDevCatalog: the slice of models.dev's api.json we read — provider id -> its models map.
 *   - EffortLevel / CodexEffort / CodexReasoning: the shared reasoning-depth knob + its Codex wire form.
 *   - SseEvent: one parsed event:/data: SSE block — shared by the Codex (Responses) + Anthropic (Messages) reducers.
 *   - ToolSpec / AssembledToolCall: the provider-agnostic tool-def input and the folded streamed-tool-call output.
 */

// ----------------------------- models.dev capability source ----------------------------- //

// The REAL per-model capabilities — the primary (dynamic) source that demotes the hardcoded table to a
// fallback. All optional; the builder fills each gap from the table, then the default.
export type ModelCaps = { contextInput?: number; maxOutput?: number; vision?: boolean };

// The slices we read from models.dev's api.json (it carries more we ignore). Keyed by provider id
// (e.g. "opencode-go", "groq"), each with a models map.
type ModelsDevEntry = { limit?: { context?: number; output?: number }; modalities?: { input?: string[] }; release_date?: string };
export type ModelsDevCatalog = Record<string, { models?: Record<string, ModelsDevEntry> }>;

// Map one models.dev entry to ModelCaps. Vision = its input modalities include "image" (the reliable
// signal — NOT the unrelated "attachment" flag). Absent fields stay undefined.
export const parseModelsDevEntry = (entry: ModelsDevEntry): ModelCaps => ({
  contextInput: entry.limit?.context,
  maxOutput: entry.limit?.output,
  vision: entry.modalities?.input?.includes('image') ?? false,
});

// Look up a model's caps by provider key + model id; undefined when the catalog/provider/model is absent
// (the builder then falls back to the table/default).
export const lookupModelsDevCaps = (catalog: ModelsDevCatalog | undefined, key: string, modelId: string): ModelCaps | undefined => {
  const entry = catalog?.[key]?.models?.[modelId];
  return entry ? parseModelsDevEntry(entry) : undefined;
};

// Order dropdown ids newest-first by models.dev release_date (ISO dates compare lexicographically);
// undated ids trail alphabetically, so missing metadata can never bury a fresh release.
export const sortByReleaseDesc = (models: Record<string, ModelsDevEntry>, ids: string[]): string[] =>
  [...ids].sort((a, b) => {
    const da = models[a]?.release_date ?? '';
    const db = models[b]?.release_date ?? '';
    return da !== db ? (db < da ? -1 : 1) : a.localeCompare(b);
  });

// ----------------------------- Effort ladder ----------------------------- //

// Codex effort values are supplied by its catalogue, so a new provider-defined level can survive
// storage and the UI without a release. Each other provider validates against its own wire vocabulary.
export type CodexEffort = string;
export type CodexReasoning = { effort: CodexEffort; summary?: string };
export const validTokenCounts = (...counts: unknown[]): boolean => counts.every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0);
export type EffortLevel = string;

// Grok's legacy four-level Responses wire. Codex itself resolves effort through model metadata.
export const standardEffortToXai = (effort: EffortLevel): CodexEffort =>
  effort === 'max' ? 'xhigh' : ['low', 'medium', 'high', 'xhigh'].includes(effort) ? effort : DEFAULT_EFFORT;

// Antigravity's tier vocabulary. Its own client offers exactly three stops — low / medium / high — so the
// two rungs above them fold onto 'high' rather than putting an unattested value on the wire. The fold is
// what makes an unknown level UNREACHABLE by construction, which is the only reason this is safe to ship
// without having probed every rung: we never send one we haven't seen the first-party client send.
export type AntigravityThinkingLevel = 'low' | 'medium' | 'high';
export const standardEffortToAntigravity = (effort: EffortLevel): AntigravityThinkingLevel =>
  effort === 'xhigh' || effort === 'max' ? 'high' : effort === 'low' || effort === 'high' ? effort : 'medium';

// Default reasoning depth — 'medium' preserves the pre-Effort behavior for callers that don't thread one.
export const DEFAULT_EFFORT: CodexEffort = 'medium';

// ----------------------------- SSE (event:/data: streams) ----------------------------- //

// One parsed SSE off the Codex Responses stream: the `event:` name and its `data:` JSON.
export type CodexResponsesEvent = { event: string; data: any };

// The provider-agnostic shape parseSseBlock returns — both Codex (Responses) and Anthropic (Messages)
// stream event:/data: SSE, so the same parser feeds both reducers. Aliased so the Anthropic code reads in
// its own vocabulary.
export type SseEvent = CodexResponsesEvent;

// The real token counts the backend reports — input, the two cache tiers, and output. The Bridge forwards
// this end-to-end (stream event → door encoder) so the wisped client's token meter matches native Claude
// Code instead of reading the zeros the re-encode used to synthesize.
export type BridgeUsage = {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
};

// Parse ONE SSE block (blank-line-separated event:/data: lines) into an event. data: lines are joined
// before JSON parsing (SSE splits long payloads across lines). undefined for a block with no event/data,
// the [DONE] sentinel, or unparseable JSON. Shared by the non-streaming reader and the streaming path.
export const parseSseBlock = (block: string): CodexResponsesEvent | undefined => {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const eventLine = lines.find((l) => l.startsWith('event:'));
  const dataLines = lines.filter((l) => l.startsWith('data:'));
  if (!eventLine || dataLines.length === 0) return undefined;
  const raw = dataLines.map((l) => l.slice('data:'.length).trim()).join('\n');
  if (raw === '[DONE]') return undefined;
  try { return { event: eventLine.slice('event:'.length).trim(), data: JSON.parse(raw) }; } catch { return undefined; }
};

// ----------------------------- Tool-calling kernel shapes ----------------------------- //

// A tool the model may call: name + description + JSON-schema input. The provider-agnostic tool-def the
// vscode/bridge layers hand to each backend's tool builder (OpenAI / Codex / Anthropic).
export type ToolSpec = { name: string; description: string; inputSchema?: object };

// The folded form of a streamed tool call once the stream completes — id, name, and the accumulated
// argument JSON. Returned by all three reducers (chat assembleToolCalls / Codex / Anthropic).
export type AssembledToolCall = { id: string; name: string; argsJson: string };

// ----------------------------- Parsing helpers ----------------------------- //

// A trimmed non-empty string, else undefined — so blank/null/non-string fields don't become "present".
// Shared by the Codex + Grok auth.json importers (parseCodexAuthJson / parseGrokAuthJson).
export const trimmedString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

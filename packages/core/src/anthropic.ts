// ---------------- anthropic.ts — Wisp: Anthropic Provider pure cores (creds, attestation, Messages request/reply) ---------------- //

/*
 * Depends on:
 *   - node crypto (createHash) — the per-request client attestation fingerprint only.
 *   - ./shared — the provider kernel: ModelCaps, ModelsDevCatalog + sortByReleaseDesc, EffortLevel, the SSE
 *     event shape (SseEvent), and the tool shapes (ToolSpec/AssembledToolCall).
 *   - ./catalog — the Provider row type ONLY (import type, erased at runtime), so catalog -> anthropic is
 *     the sole runtime edge and the graph stays acyclic.
 *
 * Data shapes:
 *   - AnthropicCreds: the Claude.ai-OAuth credential bundle (access/refresh token + absolute expiresAt).
 *   - AnthropicMessage / AnthropicTool: the Messages-API request conversation + tool defs.
 */

import { createHash } from 'crypto';
import type { Provider } from './catalog';
import {
  sortByReleaseDesc,
  type ModelCaps, type ModelsDevCatalog, type EffortLevel,
  type SseEvent, type ToolSpec, type AssembledToolCall,
} from './shared';

// ----------------------------- Anthropic OAuth Provider (pure cores) ----------------------------- //

// The Anthropic credential bundle. Like Codex it is OAuth-backed (no API key), but the token carries no
// JWT exp — Anthropic returns expires_in, so the deadline is computed at exchange time and stored as an
// absolute epoch-ms expiresAt. The impure anthropicAuth.ts owns the OAuth/IO.
export type AnthropicCreds = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms; absent when the token response carried no expires_in
};

// Whether a catalog row is the Anthropic backend. Absent kind == 'openai-chat'.
export const isAnthropicProvider = (provider: Provider): boolean => provider.kind === 'anthropic-oauth';

// Anthropic is "usable when signed in" — no API key, so usability is a bearer access token. The `{}`
// sign-out tombstone and a refresh-only blob both read as signed-out.
export const isAnthropicSignedIn = (creds: AnthropicCreds | undefined): boolean =>
  !!creds && !!creds.accessToken;

// Turn an Anthropic OAuth token response into AnthropicCreds. expires_in (seconds, relative) becomes an
// absolute expiresAt against the injected clock — `now` is a parameter so this stays pure.
export const tokensToAnthropicCreds = (
  payload: { access_token?: string; refresh_token?: string; expires_in?: number },
  now: number,
): AnthropicCreds => ({
  ...(payload.access_token ? { accessToken: payload.access_token } : {}),
  ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
  ...(typeof payload.expires_in === 'number' ? { expiresAt: now + payload.expires_in * 1000 } : {}),
});

// Refresh 5 minutes BEFORE expiry (Anthropic's larger skew than Codex's 60s, per openclaude). No
// expiresAt → false: can't prove staleness, so don't force a refresh that might block a working token.
const ANTHROPIC_TOKEN_REFRESH_SKEW_MS = 5 * 60_000;
export const shouldRefreshAnthropicToken = (creds: { expiresAt?: number }, now: number): boolean =>
  creds.expiresAt !== undefined && creds.expiresAt <= now + ANTHROPIC_TOKEN_REFRESH_SKEW_MS;

// Parse a stored slot into AnthropicCreds. An absent/empty/corrupt slot reads as undefined rather than
// throwing; the `{}` tombstone parses to an empty object (isAnthropicSignedIn then reads signed-out).
export const parseAnthropicCreds = (raw: string | undefined): AnthropicCreds | undefined => {
  if (!raw) return undefined;
  try { return JSON.parse(raw) as AnthropicCreds; } catch { return undefined; }
};

// Curated Claude model ids — the OFFLINE FALLBACK for anthropicModelsFrom. The anthropic row's
// defaultModel must stay a member.
export const ANTHROPIC_MODELS: string[] = ['claude-fable-5', 'claude-opus-4-8', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

// Live Claude dropdown ids from models.dev — undated aliases only (dated -YYYYMMDD snapshots duplicate
// them). Deliberately NO family whitelist: a brand-new family name must appear, never be filtered out.
export const anthropicModelsFrom = (catalog?: ModelsDevCatalog): string[] => {
  const models = catalog?.anthropic?.models;
  if (!models) return ANTHROPIC_MODELS;
  const ids = Object.keys(models).filter((id) => !/-\d{8}$/.test(id));
  return ids.length ? sortByReleaseDesc(models, ids) : ANTHROPIC_MODELS;
};

// ----------------------------- Anthropic client attestation ----------------------------- //

// The subscription Messages backend recomputes + validates a per-request fingerprint and rejects an
// unrecognized client with a synthetic 429. The recipe (openclaude-verified): sha256(salt + chars sampled
// from the first user message at indices 4/7/20 + version), first 3 hex. Missing indices substitute '0'.
// Salt/indices are load-bearing — the server checks them, so this MUST be derived from the exact
// first-user-message text that is sent.
const ANTHROPIC_FP_SALT = '59cf53e54c78';
export const anthropicFingerprint = (firstUserMessage: string, version: string): string => {
  const sampled = [4, 7, 20].map((i) => firstUserMessage[i] ?? '0').join('');
  return createHash('sha256').update(ANTHROPIC_FP_SALT + sampled + version).digest('hex').slice(0, 3);
};

// The attribution string Claude Code sends as the FIRST system block — the recognition signal carrying the
// validated fingerprint. No cch (native attestation is unenforced), no cc_workload (interactive run).
// version must match the User-Agent's claude-cli/<version>.
export const anthropicAttribution = (firstUserMessage: string, version: string): string =>
  `x-anthropic-billing-header: cc_version=${version}.${anthropicFingerprint(firstUserMessage, version)}; cc_entrypoint=cli;`;

// ----------------------------- Anthropic Messages request + reply (pure cores) ----------------------------- //

// The Messages message_delta stop_reason that means the reply was CUT SHORT — budget spent (max_tokens),
// blocked (content_filter), or declined (refusal). The Anthropic analogue of Codex's responsesIncompleteReason,
// but it rides a live terminal frame, not a payload field. A clean close / unknown / undefined → undefined.
export const anthropicTruncationReason = (stopReason: string | undefined): string | undefined =>
  stopReason === 'max_tokens' || stopReason === 'content_filter' || stopReason === 'refusal' ? stopReason : undefined;

// One conversation message for the Messages backend. Inquire sends system+user; native chat sends
// user/assistant. The Messages API carries the system prompt top-level (not as a role), so a 'system'
// entry here is lifted out by the body builder. Agent mode also carries a turn's tool round-trip:
// toolCalls on an assistant turn, toolResults on a user turn — expanded to content blocks below.
export type AnthropicMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  toolCalls?: { id: string; name: string; argsJson: string }[];
  toolResults?: { callId: string; content: string; isError?: boolean }[];
  images?: { mimeType: string; dataBase64: string }[];
};

// An Anthropic Messages tool definition. Unlike Codex's strict Responses tools, Anthropic accepts a plain
// JSON schema as `input_schema` — no additionalProperties:false / required-all-keys closure.
export type AnthropicTool = { name: string; description: string; input_schema: Record<string, unknown> };

// Map VS Code tool defs to Anthropic tools. The schema rides through verbatim (no strict closure), so far
// simpler than toCodexResponsesTools; a tool with no schema gets an empty object schema.
export const toAnthropicTools = (tools: ToolSpec[]): AnthropicTool[] =>
  tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
  }));

// Parse a tool call's accumulated argument JSON into the object Anthropic's tool_use block expects (Codex
// sends the raw string; Anthropic wants it parsed). Bad/partial JSON degrades to {}.
const parseToolInput = (argsJson: string): Record<string, unknown> => {
  try { return argsJson ? JSON.parse(argsJson) : {}; } catch { return {}; }
};

// ----------------------------- Thinking / effort (slice #31) ----------------------------- //

// Which Claude models accept the thinking+effort body fields. Mirrors openclaude's modelSupportsEffort —
// Opus 4.5-4.8 and Sonnet 4.6 take them; Haiku and older 400, so omit there.
const modelSupportsAnthropicEffort = (model: string): boolean => {
  const m = model.toLowerCase();
  return /opus-4-[5-8]/.test(m) || m.includes('sonnet-4-6');
};

// xhigh is the one effort level not universally accepted — only Opus 4.7/4.8 take it. Other effort-capable
// models (Sonnet 4.6, Opus 4.5/4.6) 400 on it.
const modelSupportsAnthropicXHigh = (model: string): boolean => /opus-4-[78]/.test(model.toLowerCase());

// max is Opus-4.6+-only. Note this set differs from xhigh's: Opus 4.6 takes max but NOT xhigh — the
// capabilities are independent, so the clamps below are separate.
export const modelSupportsAnthropicMax = (model: string): boolean => /opus-4-[678]/.test(model.toLowerCase());

// The thinking/effort fragment to spread into a Messages body, or {} when omitted. Effort rides
// output_config.effort (NOT top-level, NOT thinking.budget_tokens — both 400 on Opus 4.7+) behind the
// effort-2025-11-24 beta header; adaptive thinking carries no budget. Omitted when no effort is threaded
// or the model can't take it. xhigh/max each clamp to high on models that reject them — the panel offers a
// level for every effort-aware Provider, so a cross-model pick must degrade rather than 400.
export const anthropicThinkingEffort = (model: string, effort?: EffortLevel): { thinking?: { type: 'adaptive' }; output_config?: { effort: EffortLevel } } => {
  if (!effort || !modelSupportsAnthropicEffort(model)) return {};
  let level: EffortLevel = effort;
  if (level === 'xhigh' && !modelSupportsAnthropicXHigh(model)) level = 'high';
  if (level === 'max' && !modelSupportsAnthropicMax(model)) level = 'high';
  return { thinking: { type: 'adaptive' }, output_config: { effort: level } };
};

// ----------------------------- Anthropic Messages body + reply reducers ----------------------------- //

// Translate a conversation into an Anthropic Messages request body. The system text moves to the top-level
// `system` block array, led by the Claude Code attribution block (its fingerprint derived from the first
// user turn's TEXT — so it MUST stay sourced from `content`). A turn with tool calls/results expands to a
// content BLOCK array (assistant: text then tool_use; user: tool_result FIRST then text); a plain turn
// stays a bare string — EXCEPT the final turn, which converts to one text block so it can carry the cache
// breakpoint (#111). An empty text block is never emitted. tools ride only when non-empty.
export const buildAnthropicMessagesBody = (args: {
  model: string; messages: AnthropicMessage[]; maxTokens: number; version: string; stream?: boolean;
  tools?: AnthropicTool[]; toolChoice?: 'auto' | 'any'; effort?: EffortLevel;
}) => {
  const wispSystem = args.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const convo = args.messages.filter((m) => m.role !== 'system');
  const firstUserMessage = convo[0]?.content ?? '';
  const system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl: '1h' } }> = [
    { type: 'text' as const, text: anthropicAttribution(firstUserMessage, args.version) },
    ...(wispSystem ? [{ type: 'text' as const, text: wispSystem }] : []),
  ];
  type BuiltTurn = { role: 'user' | 'assistant'; content: string | unknown[] };
  const messages: BuiltTurn[] = convo.map((m) => {
    if (m.role === 'assistant') {
      // A plain text turn stays a bare string (the #29 shape); only a tool-call turn expands to blocks.
      if (!m.toolCalls?.length) return { role: 'assistant' as const, content: m.content };
      const blocks: unknown[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls) blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: parseToolInput(tc.argsJson) });
      return { role: 'assistant' as const, content: blocks };
    }
    const images = m.images ?? [];
    // A plain text turn (no tool results, no images) stays a bare string (the #29 shape).
    if (!m.toolResults?.length && !images.length) return { role: 'user' as const, content: m.content };
    const blocks: unknown[] = [];
    // tool_result blocks lead so the assistant(tool_use) → tool_result order the API wants holds.
    for (const tr of m.toolResults ?? []) blocks.push({ type: 'tool_result', tool_use_id: tr.callId, content: tr.content, ...(tr.isError ? { is_error: true } : {}) });
    // Images before the text — Anthropic's recommended ordering for vision turns.
    for (const img of images) blocks.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.dataBase64 } });
    if (m.content) blocks.push({ type: 'text', text: m.content });
    return { role: 'user' as const, content: blocks };
  });
  // #111: cache_control breakpoints. Render order is tools → system → messages, so the last-system-block
  // marker caches the tool definitions AND the system prompt together (the big stable prefix). Without a
  // marker a bridged Claude Code session re-bills its whole history uncached every turn (~10x usage) — the
  // Bridge flattens away the markers Claude Code sent, so we reconstruct our own here.
  // ttl:'1h' matches native Claude Code: the prefix survives idle gaps (a user stepping away mid-session)
  // instead of expiring after the 5-minute default and re-writing on return. 1h writes cost 2x vs 1.25x,
  // but an interactive session reads the prefix many times over, so the extra write pays for itself.
  const CACHE = { cache_control: { type: 'ephemeral' as const, ttl: '1h' as const } };
  system[system.length - 1] = { ...system[system.length - 1], ...CACHE };

  // A bare-string final turn can't carry a marker — expand it to a single text block (earlier plain turns
  // keep the #29 bare-string shape).
  const last = messages[messages.length - 1];
  if (last && typeof last.content === 'string' && last.content) {
    messages[messages.length - 1] = { role: last.role, content: [{ type: 'text', text: last.content }] };
  }

  // ponytail: Anthropic's automatic cache lookback only reaches ~20 content blocks back from an explicit
  // marker, so a single turn that appends more than that — heavy parallel tool calls collapse into one
  // message of many blocks — overshoots the window and silently re-bills the conversation prefix. Spend the
  // breakpoints left after system (4 per request, max) walking backward from the end, one every STEP blocks,
  // so no gap between consecutive markers exceeds the window. A short conversation never reaches STEP, so
  // this places exactly the one end-of-history marker — identical to the original two-breakpoint body.
  const STEP = 15;
  const MSG_BREAKPOINTS = 3; // 4 per-request max − 1 spent on the system block
  // Every content block in message order; a bare-string turn is one block for distance but carries no
  // object to annotate (null). A marker due at a bare-string position slides FORWARD (toward the end) to
  // the nearest markable block passed since the last marker — sliding backward would widen the gap past
  // the lookback window when several plain chat turns straddle a step boundary.
  const anchors: ({ msg: number; blk: number } | null)[] = [];
  messages.forEach((m, mi) => {
    if (Array.isArray(m.content)) m.content.forEach((_, bi) => anchors.push({ msg: mi, blk: bi }));
    else anchors.push(null);
  });
  const mark = (a: { msg: number; blk: number }): void => {
    const blocks = messages[a.msg].content as Record<string, unknown>[];
    blocks[a.blk] = { ...blocks[a.blk], ...CACHE };
  };
  for (let i = anchors.length - 1, since = STEP, placed = 0, passed = -1; i >= 0 && placed < MSG_BREAKPOINTS; i--, since++) {
    if (since < STEP) {
      if (anchors[i]) passed = i; // remember the markable block nearest the next boundary, end-side
      continue;
    }
    const target = anchors[i] ? i : passed;
    if (target < 0) continue; // nothing markable since the last marker — keep scanning back
    mark(anchors[target] as { msg: number; blk: number });
    placed++;
    since = target - i; // distance from the placed marker back to the current position
    passed = -1;
  }
  return {
    model: args.model,
    max_tokens: args.maxTokens,
    system,
    messages,
    ...(args.stream ? { stream: true as const } : {}),
    ...(args.tools && args.tools.length ? { tools: args.tools, tool_choice: { type: args.toolChoice ?? 'auto' } } : {}),
    ...anthropicThinkingEffort(args.model, args.effort),
  };
};

// One Anthropic Messages SSE event → its answer-text fragment, else ''. Answer text rides only on a
// content_block_delta whose delta is a text_delta; a tool_use block's input_json_delta and every lifecycle
// event carry no answer text. A non-string text is skipped rather than coerced.
export const anthropicTextDelta = (ev: SseEvent): string =>
  ev.event === 'content_block_delta' && ev.data?.delta?.type === 'text_delta' && typeof ev.data.delta.text === 'string'
    ? ev.data.delta.text
    : '';

// Reduce a whole Messages SSE run to its answer text — concatenate the text_delta fragments in order. An
// `error` event is a backend failure (throw its message). anthropicStream yields the same per-event
// fragments live; this is the testable spec of that streaming semantics.
export const reduceAnthropicTextEvents = (events: SseEvent[]): string => {
  let text = '';
  for (const ev of events) {
    if (ev.event === 'error') throw new Error(ev.data?.error?.message ?? 'Anthropic response failed');
    text += anthropicTextDelta(ev);
  }
  return text;
};

// Reassemble streamed Messages tool_use blocks into whole tool calls — the Anthropic analogue of
// reduceResponsesToolCalls. A tool_use block is announced by content_block_start (carrying the toolu_ id +
// name); its arguments stream as content_block_delta(input_json_delta) partial_json fragments. Keyed by
// the content-block `index`. The toolu_ id becomes the matching tool_result's tool_use_id. First-seen
// order; a block that never announced a name is dropped. A no-argument tool leaves argsJson '' (→ {}).
export const reduceAnthropicToolCalls = (events: SseEvent[]): AssembledToolCall[] => {
  const byIndex = new Map<number, AssembledToolCall>();
  for (const ev of events) {
    if (ev.event === 'content_block_start' && ev.data?.content_block?.type === 'tool_use') {
      const cb = ev.data.content_block;
      const call = byIndex.get(ev.data.index) ?? { id: '', name: '', argsJson: '' };
      if (typeof cb.id === 'string') call.id = cb.id;
      if (typeof cb.name === 'string') call.name = cb.name;
      byIndex.set(ev.data.index, call);
    } else if (ev.event === 'content_block_delta' && ev.data?.delta?.type === 'input_json_delta') {
      const call = byIndex.get(ev.data.index) ?? { id: '', name: '', argsJson: '' };
      if (typeof ev.data.delta.partial_json === 'string') call.argsJson += ev.data.delta.partial_json;
      byIndex.set(ev.data.index, call);
    }
  }
  return [...byIndex.values()].filter((c) => c.name);
};

// Real Claude model windows — the OAuth Messages path has no models.dev catalogKey, so without this the
// picker shows the neutral default. Opus/Sonnet 4.x = 1M context, Haiku 4.5 = 200K; Opus tops 128K output,
// the rest 64K. vision:true. ⚠️ These are *model* maxes — the Claude.ai subscription path may cap lower;
// advertised as a picker budgeting hint, so an oversized pack surfaces as a backend error (already
// handled). Return type pins maxOutput as ALWAYS present (every branch sets it) — the streaming path reads
// it as the request's max_tokens, a non-optional number.
export const anthropicModelCaps = (model: string): ModelCaps & { maxOutput: number } => {
  const m = model.toLowerCase();
  if (m.includes('haiku')) return { contextInput: 200_000, maxOutput: 64_000, vision: true };
  if (m.includes('opus')) return { contextInput: 1_000_000, maxOutput: 128_000, vision: true };
  return { contextInput: 1_000_000, maxOutput: 64_000, vision: true }; // sonnet + default
};

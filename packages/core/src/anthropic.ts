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

import { createHash, randomBytes } from 'crypto';
import type { Provider } from './catalog';
import {
  sortByReleaseDesc,
  type ModelCaps, type ModelsDevCatalog, type EffortLevel,
  type SseEvent, type ToolSpec, type AssembledToolCall, type BridgeUsage,
} from './shared';

// ----------------------------- Anthropic OAuth Provider (pure cores) ----------------------------- //

// The Anthropic credential bundle. Like Codex it is OAuth-backed (no API key), but the token carries no
// JWT exp — Anthropic returns expires_in, so the deadline is computed at exchange time and stored as an
// absolute epoch-ms expiresAt. The impure anthropicAuth.ts owns the OAuth/IO.
export type AnthropicCreds = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms; absent when the token response carried no expires_in
  // #150 — account identity, alongside the tokens in the same slice. deviceId is minted once per install
  // (survives sign-out); the rest come from the claude_cli bootstrap endpoint at sign-in (best-effort,
  // so all optional) and feed metadata.user_id + the "signed in as …" display.
  deviceId?: string;        // 64-hex, OmniRoute's cliUserID shape
  accountUuid?: string;
  accountEmail?: string;
  organizationName?: string;
  rateLimitTier?: string;   // organization_rate_limit_tier, e.g. default_claude_max_20x
};

// The identity slice of a creds bundle (#150) — what the bootstrap fetch fills and what a token refresh
// must carry over when it rebuilds the bundle from a token payload.
export type AnthropicAccount = Pick<AnthropicCreds, 'accountUuid' | 'accountEmail' | 'organizationName' | 'rateLimitTier'>;

// Map the claude_cli bootstrap payload's oauth_account block to the creds identity fields. account_uuid
// is the field metadata.user_id needs — without it the payload is useless, so it gates the whole result;
// the display-only fields drop entry-by-entry when wrong-typed (hand-edited or drifted payloads).
export const parseAnthropicBootstrap = (payload: unknown): AnthropicAccount | undefined => {
  const acct = (payload as { oauth_account?: Record<string, unknown> } | undefined)?.oauth_account;
  if (!acct || typeof acct.account_uuid !== 'string') return undefined;
  return {
    accountUuid: acct.account_uuid,
    ...(typeof acct.account_email === 'string' ? { accountEmail: acct.account_email } : {}),
    ...(typeof acct.organization_name === 'string' ? { organizationName: acct.organization_name } : {}),
    ...(typeof acct.organization_rate_limit_tier === 'string' ? { rateLimitTier: acct.organization_rate_limit_tier } : {}),
  };
};

// Mint the per-install device id — 32 random bytes as 64 hex chars (OmniRoute's cliUserID shape).
export const mintAnthropicDeviceId = (): string => randomBytes(32).toString('hex');

// The metadata.user_id blob the real client sends on every Messages request — a JSON string with exactly
// these keys in this order. No stored account_uuid (bootstrap failed or never ran) → a shape-correct uuid
// DERIVED from the device id, so the same install always claims the same account rather than churning.
export const anthropicUserId = (args: { deviceId: string; accountUuid?: string; sessionId: string }): string => {
  const derived = (): string => {
    const h = createHash('sha256').update(args.deviceId).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  };
  return JSON.stringify({ device_id: args.deviceId, account_uuid: args.accountUuid ?? derived(), session_id: args.sessionId });
};

// The "signed in as …" line: email + a plan name read off the rate-limit tier. Unknown tier → bare
// email; no email → undefined (the caller falls back to its bare "signed in" state).
const ANTHROPIC_PLAN_NAMES: [RegExp, string][] = [
  [/max_20x/, 'Max 20x'], [/max_5x/, 'Max 5x'], [/max/, 'Max'],
  [/enterprise/, 'Enterprise'], [/team/, 'Team'], [/pro/, 'Pro'], [/free/, 'Free'],
];
export const anthropicAccountLabel = (creds: AnthropicCreds | undefined): string | undefined => {
  if (!creds?.accountEmail) return undefined;
  const tier = creds.rateLimitTier?.toLowerCase() ?? '';
  const plan = ANTHROPIC_PLAN_NAMES.find(([re]) => re.test(tier))?.[1];
  return plan ? `${creds.accountEmail} · ${plan}` : creds.accountEmail;
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
// user/assistant. The Messages API carries the system prompt top-level (not as a role), so a LEADING
// 'system' entry here is lifted out by the body builder; a system entry after any non-system stays
// positioned in messages (#145 — the mid-conversation-system beta). Agent mode also carries a turn's tool
// round-trip: toolCalls on an assistant turn, toolResults on a user turn — expanded to content blocks below.
export type AnthropicMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  toolCalls?: { id: string; name: string; argsJson: string }[];
  toolResults?: { callId: string; content: string; isError?: boolean }[];
  images?: { mimeType: string; dataBase64: string }[];
  documents?: { mimeType: string; dataBase64: string }[];
  // #141: pre-split text blocks (the advisor reviewer's per-turn transcript). When present on a user turn,
  // the body builder emits one text block per entry instead of a single joined block — a byte-stable prefix
  // the cache can reuse across reviewer calls. content stays the full join for every other consumer.
  textBlocks?: string[];
  // The Anthropic door's byte-for-byte sidecar (see NormalizedTurn.rawContent): the original content block
  // array of a thinking-bearing assistant turn, replayed verbatim by the body builder when thinking is on.
  rawContent?: unknown[];
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

// Which Claude models accept the thinking+effort body fields. Opus 4.5-4.8 and Sonnet 4.6 mirror
// openclaude's modelSupportsEffort; the Claude 5 family (fable-5 / sonnet-5) was live-probed 2026-07-18 —
// the OAuth endpoint accepts adaptive + output_config.effort on both. Haiku and older 400, so omit there.
const isClaude5 = (m: string): boolean => m.includes('fable-5') || m.includes('sonnet-5');
const modelSupportsAnthropicEffort = (model: string): boolean => {
  const m = model.toLowerCase();
  return /opus-4-[5-8]/.test(m) || m.includes('sonnet-4-6') || isClaude5(m);
};

// xhigh is not universally accepted — Opus 4.7/4.8 and Claude 5 take it (5 live-probed); other
// effort-capable models (Sonnet 4.6, Opus 4.5/4.6) 400 on it.
const modelSupportsAnthropicXHigh = (model: string): boolean => {
  const m = model.toLowerCase();
  return /opus-4-[78]/.test(m) || isClaude5(m);
};

// max is Opus-4.6+ and Claude 5 (5 live-probed). Note this set differs from xhigh's: Opus 4.6 takes max
// but NOT xhigh — the capabilities are independent, so the clamps below are separate.
export const modelSupportsAnthropicMax = (model: string): boolean => {
  const m = model.toLowerCase();
  return /opus-4-[678]/.test(m) || isClaude5(m);
};

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

// Translate a conversation into an Anthropic Messages request body. The LEADING system text moves to the
// top-level `system` block array, led by the Claude Code attribution block (its fingerprint derived from
// the first user turn's TEXT — so it MUST stay sourced from `content`); mid-conversation system stays
// positioned (#145). A turn with tool calls/results expands to a
// content BLOCK array (assistant: text then tool_use; user: tool_result FIRST then text); a plain turn
// stays a bare string — EXCEPT the final turn, which converts to one text block so it can carry the cache
// breakpoint (#111). An empty text block is never emitted. tools ride only when non-empty.
export const buildAnthropicMessagesBody = (args: {
  model: string; messages: AnthropicMessage[]; maxTokens: number; version: string; stream?: boolean;
  tools?: AnthropicTool[]; toolChoice?: 'auto' | 'any'; effort?: EffortLevel; cacheTtl?: '5m' | '1h';
  // #139: volatile system tail (mid-session <system-reminder> appends) — emitted as a final UNMARKED
  // system block, after the breakpoint, so its churn never busts the stable tools+system prefix.
  systemSuffix?: string;
  // #150: the metadata.user_id blob (anthropicUserId), passed whole by the client.
  userId?: string;
}) => {
  // #145: at most ONE leading system message lifts into the top-level system array — every caller
  // (Inquire, native chat, the bridge arms, the reviewer) prepends exactly one. Any other system message
  // stays POSITIONED in `messages` as a role:"system" turn (the mid-conversation-system beta — Claude
  // Code's hook reminders), so its churn re-bills only the tail behind it instead of the whole history.
  // That includes a SECOND leading one: only the Anthropic door produces it (a positioned turn ahead of
  // the first user turn), and hoisting it into the marked stable block would resurrect the amplifier.
  const lead = args.messages[0]?.role === 'system' ? 1 : 0;
  const wispSystem = args.messages.slice(0, lead).map((m) => m.content).join('\n\n');
  const convo = args.messages.slice(lead).filter((m) => m.role !== 'system' || m.content);
  // First USER turn, not convo[0]: a positioned system turn can now sit ahead of it, and the server
  // validates the fingerprint against the first user message's text.
  const firstUserMessage = convo.find((m) => m.role === 'user')?.content ?? '';
  const system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl?: '1h' } }> = [
    { type: 'text' as const, text: anthropicAttribution(firstUserMessage, args.version) },
    ...(wispSystem ? [{ type: 'text' as const, text: wispSystem }] : []),
  ];
  type BuiltTurn = { role: 'user' | 'assistant' | 'system'; content: string | unknown[] };
  // Computed once, up front: the replay decision below and the body spread at the bottom must agree —
  // replaying thinking blocks into a thinking-off request is a 400, same as dropping them from a
  // thinking-on tool continuation.
  const thinkingEffort = anthropicThinkingEffort(args.model, args.effort);
  const messages: BuiltTurn[] = convo.map((m) => {
    // #145: a positioned system turn is a single text block — a markable anchor for the walk below
    // (native Claude Code marks these blocks too), never a bare string.
    if (m.role === 'system') return { role: 'system' as const, content: [{ type: 'text', text: m.content }] };
    if (m.role === 'assistant') {
      // Thinking passthrough: a turn with the door's byte-for-byte sidecar replays it VERBATIM when this
      // body enables thinking — signatures + interleaved order intact. Thinking off → sidecar skipped,
      // normalized rebuild below (thinking dropped, matching the pre-passthrough behavior).
      // Replay a COPY with any cache_control stripped, never the caller's array: mark() below writes markers
      // through by reference, and the advisor flow builds twice from the SAME parsed.turns (base pass +
      // continuation). A marker placed on the first build leaked back into rawContent and stacked on the
      // second, tripping Anthropic's "max 4 blocks with cache_control … Found 5". Anthropic also rejects
      // cache_control on thinking blocks outright, so stripping is correct regardless.
      if (m.rawContent?.length && thinkingEffort.thinking) {
        const replay = m.rawContent.map((b) => (b && typeof b === 'object' && 'cache_control' in b) ? (({ cache_control, ...rest }) => rest)(b as Record<string, unknown>) : b);
        return { role: 'assistant' as const, content: replay };
      }
      // A plain text turn stays a bare string (the #29 shape); only a tool-call turn expands to blocks.
      if (!m.toolCalls?.length) return { role: 'assistant' as const, content: m.content };
      const blocks: unknown[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls) blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: parseToolInput(tc.argsJson) });
      return { role: 'assistant' as const, content: blocks };
    }
    const images = m.images ?? [];
    const documents = m.documents ?? [];
    // #141: a textBlocks turn (the advisor reviewer transcript) expands to one text block per entry, so
    // the marker walk below gives it intermediate breakpoints and a byte-stable cacheable prefix. Only the
    // reviewer builds these turns; they carry no tool results or media.
    if (m.textBlocks?.length) return { role: 'user' as const, content: m.textBlocks.filter(Boolean).map((text) => ({ type: 'text' as const, text })) };
    // A plain text turn (no tool results, no images, no documents) stays a bare string (the #29 shape).
    if (!m.toolResults?.length && !images.length && !documents.length) return { role: 'user' as const, content: m.content };
    const blocks: unknown[] = [];
    // tool_result blocks lead so the assistant(tool_use) → tool_result order the API wants holds.
    for (const tr of m.toolResults ?? []) blocks.push({ type: 'tool_result', tool_use_id: tr.callId, content: tr.content, ...(tr.isError ? { is_error: true } : {}) });
    // Documents, then images, before the text — media leads the prose, matching Anthropic's vision ordering.
    for (const doc of documents) blocks.push({ type: 'document', source: { type: 'base64', media_type: doc.mimeType, data: doc.dataBase64 } });
    for (const img of images) blocks.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.dataBase64 } });
    if (m.content) blocks.push({ type: 'text', text: m.content });
    return { role: 'user' as const, content: blocks };
  });
  // #111: cache_control breakpoints. Render order is tools → system → messages, so the last-system-block
  // marker caches the tool definitions AND the system prompt together (the big stable prefix). Without a
  // marker a bridged Claude Code session re-bills its whole history uncached every turn (~10x usage) — the
  // Bridge flattens away the markers Claude Code sent, so we reconstruct our own here.
  // ttl policy: FIXED per request PATH, never derived from this request's turn count. A turn-count proxy
  // flips 5m→1h between turn 1 and turn 2 of the SAME session, and a TTL change rewrites the cache_control
  // and busts the server-side prompt cache — re-billing the whole system+tools prefix at the 2× write on
  // turn 2 of every session (openclaude latches 1h-eligibility session-stable for exactly this reason).
  // So the caller fixes it once: session paths (Bridge / native chat, via anthropicStream) pass '1h'; a
  // genuinely one-shot path (Inquire / TUI test, via anthropicInquire) passes '5m' — the cheaper 1.25×
  // write with no later turn to amortize a longer TTL. Default '1h' (the dominant bridged-session path).
  // Haiku is excluded from 1h: its caching behaves differently and Claude Code carves it out too, so a
  // haiku turn always takes the bare 5m marker regardless of the requested TTL.
  const useOneHour = (args.cacheTtl ?? '1h') === '1h' && !args.model.includes('haiku');
  const CACHE = {
    cache_control: useOneHour
      ? { type: 'ephemeral' as const, ttl: '1h' as const }
      : { type: 'ephemeral' as const },
  };
  system[system.length - 1] = { ...system[system.length - 1], ...CACHE };
  // #139: the volatile tail goes AFTER the marker — appended last, never marked, so a changed reminder
  // re-bills only itself (plus the messages behind it), exactly like native Claude Code's block layout.
  if (args.systemSuffix) system.push({ type: 'text' as const, text: args.systemSuffix });

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
  // A thinking/redacted_thinking block (replayed rawContent) is unmarkable — Anthropic rejects
  // cache_control on it — so it anchors null, exactly like a bare-string turn: the marker slides forward.
  const unmarkable = (b: unknown): boolean => {
    const t = (b as { type?: string } | null)?.type;
    return t === 'thinking' || t === 'redacted_thinking';
  };
  messages.forEach((m, mi) => {
    if (Array.isArray(m.content)) m.content.forEach((b, bi) => anchors.push(unmarkable(b) ? null : { msg: mi, blk: bi }));
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
    ...(args.userId ? { metadata: { user_id: args.userId } } : {}),
    ...thinkingEffort,
  };
};

// One Anthropic Messages SSE event → its answer-text fragment, else ''. Answer text rides only on a
// content_block_delta whose delta is a text_delta; a tool_use block's input_json_delta and every lifecycle
// event carry no answer text. A non-string text is skipped rather than coerced.
export const anthropicTextDelta = (ev: SseEvent): string =>
  ev.event === 'content_block_delta' && ev.data?.delta?.type === 'text_delta' && typeof ev.data.delta.text === 'string'
    ? ev.data.delta.text
    : '';

// The token usage the Bridge otherwise throws away: message_start.message.usage carries the initial
// input/cache snapshot, message_delta.usage the final cumulative counts (output included). Forwarded through
// the stream so the door re-emits real numbers instead of the synthesized zeros — the wisped client's token
// meter then matches native. Cache/output fields default to 0 (a message_start can predate any cache read);
// a bare input_tokens still yields usage. Any other event carries none.
export const anthropicUsage = (ev: SseEvent): BridgeUsage | undefined => {
  const u = ev.event === 'message_start' ? ev.data?.message?.usage
    : ev.event === 'message_delta' ? ev.data?.usage
    : undefined;
  if (!u || typeof u.input_tokens !== 'number') return undefined;
  return {
    input_tokens: u.input_tokens,
    cache_creation_input_tokens: typeof u.cache_creation_input_tokens === 'number' ? u.cache_creation_input_tokens : 0,
    cache_read_input_tokens: typeof u.cache_read_input_tokens === 'number' ? u.cache_read_input_tokens : 0,
    output_tokens: typeof u.output_tokens === 'number' ? u.output_tokens : 0,
  };
};

// Cache-health read on a completed Anthropic request, from the token usage the wire already reports. Wisp's
// whole value on the OAuth path is NOT re-billing the conversation prefix as uncached input every turn
// (#111) — this is the signal that prompt caching is working, or that it silently regressed. Pure, so it's
// testable without a live backend; the Bridge calls it to surface a probable miss in its log.
//   - hit:   the request read a cached prefix (cache_read > 0) with only a small write behind it — the
//            healthy steady state.
//   - partial: something was read but a LARGE re-write happened behind it (#146) — the #145 amplifier's
//            signature: the read stalled at the stable prefix and the history re-billed behind it.
//            Advisory, not an error: post-compaction rebuilds, mid-session TTL expiry, and a genuinely
//            long new turn all look the same.
//   - fresh: nothing read but something written (a first turn, or a legitimately changed prefix) — normal.
//   - miss:  a multi-turn request read NOTHING from cache while billing a large uncached input — the stable
//            prefix was not reused. This is the #111 regression shape.
//   - none:  no cache activity at all (tiny prompt, or a provider that doesn't cache) — nothing to say.
// Turn count is this request's conversation turns (system stripped): turn 1 legitimately has no prior write
// to read, so a miss/partial is only inferred once the body is past the first exchange (≥3 turns).
export type AnthropicCacheOutcome = { kind: 'hit' | 'partial' | 'fresh' | 'miss' | 'none'; readTokens: number; creationTokens: number; uncachedInput: number };
export const anthropicCacheOutcome = (usage: BridgeUsage, turnCount: number): AnthropicCacheOutcome => {
  const readTokens = usage.cache_read_input_tokens;
  const creationTokens = usage.cache_creation_input_tokens;
  const uncachedInput = usage.input_tokens;
  const base = { readTokens, creationTokens, uncachedInput };
  const MISS_UNCACHED_FLOOR = 4_000;
  if (readTokens > 0 && turnCount >= 3 && creationTokens >= MISS_UNCACHED_FLOOR) return { kind: 'partial', ...base };
  if (readTokens > 0) return { kind: 'hit', ...base };
  // A big uncached input on a request that should have had a cached prefix — but only past the first
  // exchange, and only when the uncached input is large enough that a real prefix must have existed.
  if (turnCount >= 3 && uncachedInput >= MISS_UNCACHED_FLOOR) return { kind: 'miss', ...base };
  // #139: the system-fold bust re-billed the prefix through cache_CREATION (input stayed ~2), invisible
  // to the input check above. Nothing read + a large re-WRITE past the first exchange is the same
  // regression shape. Benign triggers (1h-TTL expiry, post-compaction) cost one advisory line.
  if (turnCount >= 3 && creationTokens >= MISS_UNCACHED_FLOOR) return { kind: 'miss', ...base };
  if (creationTokens > 0) return { kind: 'fresh', ...base };
  return { kind: 'none', ...base };
};

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

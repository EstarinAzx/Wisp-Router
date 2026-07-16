// ---------------- codex.ts — Wisp: Codex Provider pure cores (Responses request/reply, OAuth, auth.json) ---------------- //

/*
 * Depends on:
 *   - ./shared — the provider kernel: ModelCaps, ModelsDevCatalog + sortByReleaseDesc, the effort ladder
 *     (CodexEffort/CodexReasoning/DEFAULT_EFFORT), the SSE event shape (CodexResponsesEvent), the tool
 *     shapes (ToolSpec/AssembledToolCall), and trimmedString.
 *   - ./catalog — the Provider row type ONLY (import type, erased at runtime), so catalog -> codex is the
 *     sole runtime edge and the graph stays acyclic.
 *
 * Data shapes:
 *   - CodexCreds: the ChatGPT-OAuth credential bundle (access/refresh/id token triple + account id + apiKey).
 *   - CodexResponsesBody / CodexInputItem / CodexContentPart / CodexResponsesTool: the Responses-API request.
 */

import type { Provider } from './catalog';
import {
  sortByReleaseDesc, DEFAULT_EFFORT, trimmedString,
  type ModelCaps, type ModelsDevCatalog,
  type CodexEffort, type CodexReasoning,
  type CodexResponsesEvent, type ToolSpec, type AssembledToolCall,
} from './shared';

// ----------------------------- Codex Provider (pure cores) ----------------------------- //

// The Codex credential bundle. Unlike every other row (a bearer API key), Codex is reached via ChatGPT
// OAuth: an access/refresh/id token triple plus the ChatGPT account id. `apiKey` is the optional
// id-token→API-key exchange result. The impure codexAuth.ts owns the OAuth/IO.
export type CodexCreds = {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  accountId?: string;
  apiKey?: string;
};

// Whether a catalog row is the Codex backend. Absent kind == 'openai-chat', so false for the API-key rows.
export const isCodexProvider = (provider: Provider): boolean => provider.kind === 'codex';

// Codex is "usable when signed in" — no API key, so usability is simply the presence of a bearer
// credential (the OAuth access token, or the exchanged apiKey). Fed to the picker as the row's `keyed`.
export const isCodexSignedIn = (creds: CodexCreds | undefined): boolean =>
  !!creds && !!(creds.accessToken || creds.apiKey);

// ----------------------------- Codex Responses request ----------------------------- //

// The Codex backend speaks the OpenAI *Responses* API, not chat completions: the system prompt is a
// top-level `instructions` string, the conversation is `input` message items. User/system text parts are
// `input_text`; assistant (replayed) are `output_text` — the API rejects the wrong type.

// One content part of a Responses input message: text (input_text for user/system, output_text for a
// replayed assistant turn) or an image (input_image as a base64 data-URI / url).
export type CodexContentPart = { type: 'input_text' | 'output_text'; text: string } | { type: 'input_image'; image_url: string };

// One Responses `input` item. A message turn, OR — for an agent round-trip — a function_call (a prior
// assistant tool call, replayed) / function_call_output (its result), top-level items NOT message
// content. call_id ties the call to its output.
export type CodexInputItem =
  | { type: 'message'; role: string; content: CodexContentPart[] }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string };

// A Responses-API function tool. FLAT (name/description/parameters at top level), unlike chat completions'
// nested `function`. strict:true makes Codex honour the schema exactly — every object must close
// (additionalProperties:false) with all keys required.
export type CodexResponsesTool = { type: 'function'; name: string; description: string; parameters: Record<string, unknown>; strict: boolean };

export type CodexResponsesBody = {
  model: string;
  instructions: string;
  input: CodexInputItem[];
  reasoning?: CodexReasoning;
  store: false;
  stream: true;
  tools?: CodexResponsesTool[];
  tool_choice?: 'auto' | 'required';
  parallel_tool_calls?: boolean;
};

// Recursively coerce a JSON schema into Codex strict mode: every object closes (additionalProperties:false)
// and lists ALL its property keys in `required` — Codex strict tools reject any object that doesn't.
// Recurses through properties, array items, and anyOf/oneOf/allOf. A leaf schema is returned untouched; a
// non-schema value degrades to {} rather than throwing.
const enforceStrictResponsesSchema = (schema: unknown): Record<string, unknown> => {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return {};
  const record: Record<string, unknown> = { ...(schema as Record<string, unknown>) };
  // Codex strict mode accepts only a fixed closed shape; the dynamic-/open-object keywords 400 it (seen:
  // Claude Code's AskUserQuestion carries `propertyNames`). Strip them at every level — inert anyway.
  for (const k of ['propertyNames', 'patternProperties', 'unevaluatedProperties', 'minProperties', 'maxProperties', 'dependencies', 'dependentSchemas']) delete record[k];
  if (record.type === 'object') {
    record.additionalProperties = false;
    const props = record.properties && typeof record.properties === 'object' && !Array.isArray(record.properties)
      ? (record.properties as Record<string, unknown>) : undefined;
    if (props) {
      const enforced: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(props)) enforced[key] = enforceStrictResponsesSchema(value);
      record.properties = enforced;
      record.required = Object.keys(enforced);
    } else {
      record.required = [];
    }
  }
  if ('items' in record) {
    record.items = Array.isArray(record.items)
      ? (record.items as unknown[]).map(enforceStrictResponsesSchema)
      : enforceStrictResponsesSchema(record.items);
  }
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    if (Array.isArray(record[key])) record[key] = (record[key] as unknown[]).map(enforceStrictResponsesSchema);
  }
  return record;
};

// Map tool defs to Responses function tools. `strict` (default true) drives Codex's exact-schema mode for
// native VS Code tools. The Bridge door forwarding an EXTERNAL client's toolset (Claude Code) passes
// strict:false — Codex strict rejects rich schemas (dynamic maps, propertyNames, partial `required`), so
// the schema rides through verbatim instead. A tool with no schema gets an empty object either way.
export const toCodexResponsesTools = (tools: ToolSpec[], strict = true): CodexResponsesTool[] =>
  tools.map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: strict
      ? enforceStrictResponsesSchema(t.inputSchema ?? { type: 'object', properties: {} })
      : ((t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} }),
    strict,
  }));

// The Codex backend REQUIRES a non-empty instructions field (400 "Instructions are required" otherwise).
// The native-chat path has no system turn, so fall back to this.
const CODEX_DEFAULT_INSTRUCTIONS = 'You are a helpful coding assistant.';

// Translate a conversation into a Codex Responses request body. System content becomes `instructions`
// (defaulting when absent). Each non-system turn expands to its items in API-required order: an assistant
// turn's text (output_text) then its function_call items; a user turn's function_call_output items then
// its text (input_text) + image (input_image) message. A content-less turn yields no message item.
// reasoning rides only when supplied (reasoning models REQUIRE it, others REJECT it). tools ride only when
// non-empty, with tool_choice (default 'auto') + parallel_tool_calls — a tool_choice with no tools 400s.
export const buildCodexResponsesBody = (args: {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string; images?: { mimeType: string; dataBase64: string }[]; toolCalls?: { id: string; name: string; argsJson: string }[]; toolResults?: { callId: string; content: string }[] }[];
  reasoning?: CodexReasoning;
  tools?: CodexResponsesTool[];
  toolChoice?: 'auto' | 'required';
}): CodexResponsesBody => {
  const instructions = args.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n') || CODEX_DEFAULT_INSTRUCTIONS;
  const input: CodexInputItem[] = [];
  for (const m of args.messages) {
    if (m.role === 'system') continue;
    if (m.role === 'assistant') {
      if (m.content) input.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: m.content }] });
      for (const tc of m.toolCalls ?? []) input.push({ type: 'function_call', call_id: tc.id, name: tc.name, arguments: tc.argsJson });
    } else {
      // A tool result is its own top-level item and must precede the user's text so the
      // assistant(function_call) → function_call_output ordering the API requires is preserved.
      for (const tr of m.toolResults ?? []) input.push({ type: 'function_call_output', call_id: tr.callId, output: tr.content });
      const content: CodexContentPart[] = [];
      if (m.content) content.push({ type: 'input_text', text: m.content });
      for (const img of m.images ?? []) content.push({ type: 'input_image', image_url: `data:${img.mimeType};base64,${img.dataBase64}` });
      if (content.length) input.push({ type: 'message', role: 'user', content });
    }
  }
  // NOTE: no max_output_tokens, by design. gpt-5.x / o-series reasoning models REJECT it on the Responses
  // API (400), and the real Codex CLI omits it too — omitting grants the model-max output budget.
  // codexModelCaps.maxOutput is picker-display metadata ONLY. Length is governed by reasoning.effort.
  return {
    model: args.model, instructions, input,
    ...(args.reasoning ? { reasoning: args.reasoning } : {}),
    store: false, stream: true,
    ...(args.tools && args.tools.length ? { tools: args.tools, tool_choice: args.toolChoice ?? 'auto', parallel_tool_calls: true } : {}),
  };
};

// The reasoning object to send for a Codex model, or undefined when it must be omitted. gpt-5 / o-series
// need it; the gpt-4.x and *-spark (fast-loop) variants reject it. The Effort knob supplies the depth.
export const codexReasoning = (model: string, effort: CodexEffort = DEFAULT_EFFORT): CodexReasoning | undefined => {
  const m = model.toLowerCase();
  if (m.includes('spark')) return undefined;
  return /^(gpt-5|o3|o4)/.test(m) ? { effort, summary: 'auto' } : undefined;
};

// Real Codex model windows — the backend has no /models route and these ids aren't in models.dev, so
// without this the picker shows the neutral default. From models.dev/api.json: gpt-5.x Codex = 400K/32K,
// o-series = 200K/100K. vision:true (gpt-5/o are multimodal; the Responses backend accepts input_image).
export const codexModelCaps = (model: string): ModelCaps => {
  if (/^o[0-9]/.test(model.toLowerCase())) return { contextInput: 200_000, maxOutput: 100_000, vision: true };
  return { contextInput: 400_000, maxOutput: 32_768, vision: true };
};

// Curated Codex model ids — the OFFLINE FALLBACK for codexModelsFrom. The codex row's defaultModel must
// stay a member of this list.
export const CODEX_MODELS: string[] = [
  'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex',
  'gpt-5.3-codex-spark', 'gpt-5.2-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini',
  'gpt-5.4-mini', 'o3', 'o4-mini',
];

// Live Codex dropdown ids from models.dev's openai lineup — keep the ChatGPT-subscription families
// (gpt-5*, o3*, o4-mini*), drop the API-only variants it rejects (-pro, -nano, -chat-latest,
// -deep-research). Catalog absent or filter empty → curated fallback.
export const codexModelsFrom = (catalog?: ModelsDevCatalog): string[] => {
  const models = catalog?.openai?.models;
  if (!models) return CODEX_MODELS;
  const ids = Object.keys(models).filter(
    (id) => /^(gpt-5|o3|o4-mini)/.test(id) && !/-(pro|nano|chat-latest|deep-research)$/.test(id),
  );
  return ids.length ? sortByReleaseDesc(models, ids) : CODEX_MODELS;
};

// ----------------------------- Codex Responses reply ----------------------------- //

// Pull the answer text out of a *final* Responses object (the `response.completed` payload, or a
// non-streamed reply). Concatenates every output_text part across output[] message items — reasoning
// parts and function_call items are skipped. Tolerant of missing fields → ''.
export const extractResponsesText = (response: any): string => {
  const output = Array.isArray(response?.output) ? response.output : [];
  let text = '';
  for (const item of output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === 'output_text' && typeof part.text === 'string') text += part.text;
    }
  }
  return text;
};

// The truncation reason off a *terminal* Responses object, or undefined when it completed normally. The
// backend stamps incomplete_details.reason (e.g. 'max_output_tokens') on a cut-short reply — for a
// reasoning model the budget can be spent before any output_text, so the deltas alone can't reveal it.
export const responsesIncompleteReason = (response: any): string | undefined => {
  const reason = response?.incomplete_details?.reason;
  return typeof reason === 'string' ? reason : undefined;
};

// Reassemble streamed Responses function-call events into whole tool calls — the Responses analogue of
// assembleToolCalls. A call is announced by response.output_item.added (carrying id/call_id/name + maybe
// an initial args fragment); its arguments then stream as response.function_call_arguments.delta events
// keyed by item_id. Accumulate by item id but surface call_id as the id (it round-trips to the output).
// Returned in first-seen order; a call that never announced a name is dropped.
export const reduceResponsesToolCalls = (events: CodexResponsesEvent[]): AssembledToolCall[] => {
  const byItemId = new Map<string, AssembledToolCall>();
  for (const ev of events) {
    if (ev.event === 'response.output_item.added' && ev.data?.item?.type === 'function_call') {
      const item = ev.data.item;
      const itemId = String(item.id ?? item.call_id ?? '');
      const call = byItemId.get(itemId) ?? { id: '', name: '', argsJson: '' };
      call.id = item.call_id ?? item.id ?? call.id;
      if (typeof item.name === 'string') call.name = item.name;
      if (typeof item.arguments === 'string') call.argsJson += item.arguments;
      byItemId.set(itemId, call);
    } else if (ev.event === 'response.function_call_arguments.delta') {
      const itemId = String(ev.data?.item_id ?? '');
      const call = byItemId.get(itemId) ?? { id: '', name: '', argsJson: '' };
      if (typeof ev.data?.delta === 'string') call.argsJson += ev.data.delta;
      byItemId.set(itemId, call);
    }
  }
  return [...byItemId.values()].filter((c) => c.name);
};

// Reduce the Codex Responses SSE stream to plain answer text. Text streams as response.output_text.delta
// fragments; the terminal response.completed/incomplete event carries the authoritative full text. Prefer
// that when non-empty (guards a dropped/duplicated delta), else the joined deltas. response.failed throws.
export const reduceResponsesTextEvents = (events: CodexResponsesEvent[]): string => {
  let deltas = '';
  let completedText = '';
  for (const ev of events) {
    if (ev.event === 'response.failed') {
      throw new Error(ev.data?.response?.error?.message ?? ev.data?.error?.message ?? 'Codex response failed');
    }
    // Skip a non-string delta — coercing it (5 -> '5', {} -> '[object Object]') would corrupt the answer.
    if (ev.event === 'response.output_text.delta') { if (typeof ev.data?.delta === 'string') deltas += ev.data.delta; }
    // Only a non-empty terminal payload overwrites — so a later empty terminal can't blank a captured answer.
    else if (ev.event === 'response.completed' || ev.event === 'response.incomplete') {
      const text = extractResponsesText(ev.data?.response);
      if (text) completedText = text;
    }
  }
  return completedText || deltas;
};

// ----------------------------- Codex OAuth token introspection ----------------------------- //

// Decode a JWT's payload (the middle base64url segment) to its claims; undefined for a non-JWT or an
// unparseable payload. The signature is never verified — we only read claims (exp, account id) the backend
// already issued to us, so this is introspection, not auth.
export const decodeJwtPayload = (token: string): Record<string, unknown> | undefined => {
  const parts = token.split('.');
  if (parts.length < 2) return undefined;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

// Extract the ChatGPT account id from an id/access token. Codex nests it under the namespaced auth claim
// `https://api.openai.com/auth`.chatgpt_account_id (flatter fallbacks seen across token versions).
export const parseChatgptAccountId = (token: string | undefined): string | undefined => {
  if (!token) return undefined;
  const payload = decodeJwtPayload(token);
  const nested = payload?.['https://api.openai.com/auth'];
  const fromNested = nested && typeof nested === 'object' ? (nested as Record<string, unknown>).chatgpt_account_id : undefined;
  // Fallbacks for token-version variance: a flat dotted key, then a bare claim.
  const id = fromNested ?? payload?.['https://api.openai.com/auth.chatgpt_account_id'] ?? payload?.['chatgpt_account_id'];
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
};

// Refresh the access token 60s BEFORE it expires, so an in-flight request can't have it die under it.
const CODEX_TOKEN_REFRESH_SKEW_MS = 60_000;

// The JWT `exp` claim (seconds) as epoch ms; undefined when the token carries no parseable expiry.
const jwtExpiryMs = (token: string | undefined): number | undefined => {
  if (!token) return undefined;
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : undefined;
};

// Refresh when the access token (else the id token) expires within the skew window. No parseable expiry →
// false: we can't prove it's stale, and a failed refresh would just block a working token. `now` injected.
export const shouldRefreshCodexToken = (creds: { accessToken?: string; idToken?: string }, now: number): boolean => {
  const expiresAt = jwtExpiryMs(creds.accessToken) ?? jwtExpiryMs(creds.idToken);
  return expiresAt !== undefined && expiresAt <= now + CODEX_TOKEN_REFRESH_SKEW_MS;
};

// ----------------------------- Codex auth.json import ----------------------------- //

// Parse a ~/.codex/auth.json (written by the Codex CLI) into CodexCreds so an existing CLI login is
// imported instead of forcing a fresh sign-in. The real shape nests the OAuth triple under `tokens`
// (snake_case) alongside a possibly-null OPENAI_API_KEY; flatter fallbacks tolerated. account id from
// tokens.account_id, else derived from the id/access token. undefined when no usable bearer is present.
export const parseCodexAuthJson = (json: unknown): CodexCreds | undefined => {
  if (!json || typeof json !== 'object') return undefined;
  const root = json as Record<string, any>;
  const tokens = (root.tokens && typeof root.tokens === 'object' ? root.tokens : {}) as Record<string, any>;

  const accessToken = trimmedString(tokens.access_token ?? root.access_token);
  const refreshToken = trimmedString(tokens.refresh_token ?? root.refresh_token);
  const idToken = trimmedString(tokens.id_token ?? root.id_token);
  const apiKey = trimmedString(root.OPENAI_API_KEY ?? root.openai_api_key);
  const accountId =
    trimmedString(tokens.account_id ?? root.account_id) ??
    parseChatgptAccountId(idToken) ??
    parseChatgptAccountId(accessToken);

  if (!accessToken && !apiKey) return undefined;
  return {
    ...(accessToken ? { accessToken } : {}),
    ...(refreshToken ? { refreshToken } : {}),
    ...(idToken ? { idToken } : {}),
    ...(accountId ? { accountId } : {}),
    ...(apiKey ? { apiKey } : {}),
  };
};

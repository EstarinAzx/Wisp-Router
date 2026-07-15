// ---------------- catalog.ts — Wisp: pure Provider-catalog data + resolvers ---------------- //

/*
 * Depends on: node crypto (PKCE/state generation only) — but deliberately vscode-free, so its logic
 *   is unit-testable without the Extension Development Host. extension.ts imports these and feeds them
 *   the values it reads from the VS Code config/state; the thin wrappers there stay behaviour-identical.
 *
 * Data shapes:
 *   - Provider: one OpenAI-chat-compatible backend = { id, label, baseUrl, defaultModel, apiKeyEnv }.
 *     id doubles as the SecretStorage key-slot and the per-Provider model-map suffix.
 *   - EditMessage: one chat message ({ role: 'system' | 'user', content }) in an Inquire edit request.
 */

import { randomBytes, webcrypto, createHash } from 'crypto';

// ----------------------------- Types ----------------------------- //

export type Provider = {
  id: string;            // stable id; also the key-slot + globalState model-map suffix
  label: string;         // canonical vendor name (panel/UI, never the status bar)
  baseUrl: string;       // hardcoded OpenAI-compatible base URL ('' for Custom — comes from settings)
  defaultModel: string;  // native-format model id used when the Provider has none remembered
  apiKeyEnv: string;     // env-var fallback for the key ('' = none, e.g. local Ollama)
  // models.dev provider key for live context/vision (e.g. opencode-zen -> 'opencode', kilocode ->
  // 'kilo'). Omitted (local Ollama, Cline, Custom) -> no dynamic lookup; falls back to table/default.
  catalogKey?: string;
  // Optional: the id whose key slot + env var this row borrows when it shares a credential with a
  // sibling. Defaults to the row's own id. OpenCode Zen sets keyId='opencode-go' — both are the same
  // OpenCode account (one key, two endpoints), so Zen reuses Go's stored key rather than asking twice.
  keyId?: string;
  // Provider kind: 'openai-chat' (the default — every OpenAI-compatible chat row), 'codex' (the
  // subscription-backed Codex Responses backend, reached by ChatGPT OAuth), or 'anthropic-oauth' (the
  // subscription-backed Claude Messages backend, reached by Claude.ai OAuth). Absent == 'openai-chat',
  // so the ten existing rows need no edit; the Inquire/key/usability paths branch on it.
  kind?: 'openai-chat' | 'codex' | 'anthropic-oauth' | 'xai-oauth';
  // Note: context/vision carry no per-row hints — both come from the ACTIVE model via models.dev
  // (catalogKey), else context = neutral default and vision = the modelSupportsVision heuristic.
};

// ----------------------------- Constants ----------------------------- //

// The Custom Provider's id — the one Provider whose base URL is user-supplied (machine-scoped
// wisp.baseUrl) rather than hardcoded in the catalog.
export const CUSTOM_ID = 'custom';

// ----------------------------- Provider catalog data ----------------------------- //

// A Provider is one OpenAI-chat-compatible backend, reached by swapping {baseUrl, key, model} on the
// same `openai` SDK. Base URLs are HARDCODED here, never read from settings: choosing a Provider
// chooses where the bearer key is sent, so a workspace-overridable URL would be a key-redirect vector.
// The catalog is the ten built-ins below (OpenCode Go default) plus a user-defined Custom row whose
// base URL alone comes from settings (machine-scoped wisp.baseUrl). No model-id transform — each
// defaultModel is in the Provider's native form (re-adding Zen's `opencode/` prefix 401s the /go
// endpoint, which wants the bare id /models serves). GitHub Copilot and Cursor are deliberately
// absent (ban risk / shape-incompatible — see the 2026-06-15 multi-provider ADR + gotchas).
// defaultModel for the first five is doc-verified and ollama-cloud is user-verified (2026-06-16); the
// three still marked ⚠ are BEST-EFFORT presets — no key was available to verify them against each GET
// /models, so the panel's model picker / type-field is the correction path. ⚠ Ollama Cloud is `/v1`,
// NOT `/api/v1` (the `/api` prefix is Ollama's native protocol and breaks the OpenAI SDK — see gotchas.md).
// Chat-surface context windows and vision are read LIVE for the active model from models.dev (via each
// row's catalogKey). Fallback when a model isn't in models.dev or the fetch fails: context = a neutral
// default (no guess table); vision = the conservative modelSupportsVision id heuristic.
// Shared data since #60 — both faces (extension + TUI) render the same catalog.
export const PROVIDERS: Provider[] = [
  { id: 'opencode-go', label: 'OpenCode Go', baseUrl: 'https://opencode.ai/zen/go/v1', defaultModel: 'minimax-m3', apiKeyEnv: 'OPENCODE_API_KEY', catalogKey: 'opencode-go' },
  // OpenCode Zen = the premium /zen/v1 catalog (Claude/GPT/Gemini), distinct from Go's budget /zen/go/v1.
  // Shares the OPENCODE_API_KEY env fallback. Model ids are BARE (verified via GET /zen/v1/models,
  // 2026-06-18) — no `opencode/` prefix. defaultModel is ⚠ best-effort: claude-haiku-4-5 is the cheapest
  // verified-present model; the panel's model picker is the correction path. catalogKey 'opencode' for
  // models.dev context/vision (absent there -> neutral default + the modelSupportsVision id heuristic).
  // keyId 'opencode-go': same OpenCode account as Go (one key, two endpoints), so it borrows Go's stored
  // key instead of demanding a second entry — otherwise it stays hidden from the picker until re-keyed.
  { id: 'opencode-zen', label: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1', defaultModel: 'claude-haiku-4-5', apiKeyEnv: 'OPENCODE_API_KEY', catalogKey: 'opencode', keyId: 'opencode-go' },
  // Codex = the subscription-backed ChatGPT Codex backend (Responses API, reached by OAuth, not an API
  // key). kind:'codex' switches the Inquire/usability paths off the OpenAI-chat code. No apiKeyEnv — it
  // is "usable when signed in". Base URL is the Codex backend; defaultModel is the Codex-tuned default.
  // No catalogKey (not in models.dev) and it is intentionally absent from the native chat picker until
  // the Responses tool-mapper lands (#15) — keyless rows are hidden there, which is correct for now.
  { id: 'codex', label: 'Codex', baseUrl: 'https://chatgpt.com/backend-api/codex', defaultModel: 'gpt-5.3-codex', apiKeyEnv: '', kind: 'codex' },
  // Anthropic = the subscription-backed Claude backend (Messages API, reached by Claude.ai OAuth, not an
  // API key). kind:'anthropic-oauth' switches the Inquire/usability paths off the OpenAI-chat code, like
  // Codex. No apiKeyEnv — "usable when signed in". Base URL is api.anthropic.com (the client appends
  // /v1/messages); defaultModel is the latest Opus. No catalogKey (not in models.dev) and absent from the
  // native chat picker until the Messages adapter lands (slice #29) — keyless rows are hidden there.
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-opus-4-8', apiKeyEnv: '', kind: 'anthropic-oauth' },
  // Grok = the subscription-backed xAI backend (Responses API, reached by xAI OAuth, not an API key) — a
  // Codex-twin. kind:'xai-oauth' switches the Inquire/usability paths off the OpenAI-chat code, like
  // Codex/Anthropic. No apiKeyEnv — "usable when signed in". ⚠️ NOT the existing Groq row (Llama, API-key):
  // distinct id 'xai'. Base URL is the subscription proxy — the default grok-build routes there; grok-4.5
  // overrides to api.x.ai in the client (slice #94). No catalogKey; keyless rows stay hidden from the chat
  // picker until the Responses adapter lands.
  { id: 'xai', label: 'Grok', baseUrl: 'https://cli-chat-proxy.grok.com/v1', defaultModel: 'grok-build', apiKeyEnv: '', kind: 'xai-oauth' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', apiKeyEnv: 'OPENAI_API_KEY', catalogKey: 'openai' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', apiKeyEnv: 'GROQ_API_KEY', catalogKey: 'groq' },
  { id: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'codestral-latest', apiKeyEnv: 'MISTRAL_API_KEY', catalogKey: 'mistral' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini', apiKeyEnv: 'OPENROUTER_API_KEY', catalogKey: 'openrouter' },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', defaultModel: 'qwen2.5-coder' /* ⚠ best-effort: user must have pulled it */, apiKeyEnv: '' /* local models aren't in models.dev → table/default */ },
  { id: 'ollama-cloud', label: 'Ollama Cloud', baseUrl: 'https://ollama.com/v1', defaultModel: 'gpt-oss:120b' /* verified working 2026-06-16 */, apiKeyEnv: 'OLLAMA_API_KEY', catalogKey: 'ollama-cloud' },
  { id: 'kilocode', label: 'KiloCode', baseUrl: 'https://api.kilo.ai/api/gateway', defaultModel: 'anthropic/claude-3.5-sonnet' /* ⚠ best-effort: verify namespace via /models */, apiKeyEnv: 'KILOCODE_API_KEY', catalogKey: 'kilo' },
  { id: 'cline', label: 'Cline', baseUrl: 'https://api.cline.bot/api/v1', defaultModel: 'anthropic/claude-3.5-sonnet' /* ⚠ best-effort: verify via /models */, apiKeyEnv: 'CLINE_API_KEY' /* not in models.dev → table/default */ },
  // Custom: the always-works escape hatch and the only Provider whose base URL + model are
  // user-supplied (machine-scoped wisp.baseUrl + a typed model, resolved at runtime by
  // activeBaseUrl()). No env fallback — its key lives only in the wisp.apiKey.custom slot.
  { id: 'custom', label: 'Custom', baseUrl: '', defaultModel: '', apiKeyEnv: '' },
];

// ----------------------------- Resolvers ----------------------------- //

// Active model for a Provider: its remembered model (from the per-Provider map) else its native
// default. `||` not `??` on purpose — an empty-string memory degrades to the default, never wins.
export const resolveModel = (modelMap: Record<string, string>, provider: Provider): string =>
  modelMap[provider.id] || provider.defaultModel;

// Base URL for a Provider. Built-ins use their hardcoded catalog URL and ignore the user-supplied
// value entirely; only Custom resolves from it. That asymmetry is the key-redirect defense — a
// workspace cannot redirect a built-in's bearer key to another endpoint.
export const resolveBaseUrl = (provider: Provider, customBaseUrl: string): string =>
  provider.id === CUSTOM_ID ? customBaseUrl : provider.baseUrl;

// The id whose key slot + env a Provider's key resolves from — its own id unless it borrows a sibling's
// via keyId (OpenCode Zen → opencode-go). The caller builds the SecretStorage slot from this id, so a
// shared credential is read/written/listed in one place and never asked for twice.
export const resolveKeyId = (provider: Provider): string => provider.keyId ?? provider.id;

// ----------------------------- Reply cleaners ----------------------------- //

// Reasoning models (e.g. minimax-m3) emit their chain-of-thought inline as a <think>…</think>
// block before the real answer — strip it so only the answer survives. An unterminated <think>
// means the token budget ran out mid-thought (no answer yet) → return nothing.
export const stripThink = (text: string): string => {
  if (/<think>/i.test(text) && !/<\/think>/i.test(text)) return '';
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '');
};

// ----------------------------- Inline-edit prompt ----------------------------- //

// One chat message of an Inquire edit request. A union of two single-role object types (not one
// object with a `'system' | 'user'` role) so the array stays assignable to the OpenAI SDK's
// ChatCompletionMessageParam[] without a cast.
export type EditMessage = { role: 'system'; content: string } | { role: 'user'; content: string };

// Inquire's edit instructions: emit only SEARCH/REPLACE edit blocks. The model edits *anywhere* in the
// file by quoting the exact lines to change (SEARCH) and their replacement (REPLACE) — never re-emitting
// untouched code, which is the whole-file-rewrite mangling/data-loss vector this format avoids.
const EDIT_SYSTEM_PROMPT =
  'You are a code-editing assistant inside a code editor. ' +
  'You are given the full file for context and a natural-language instruction. ' +
  'Reply with ONE OR MORE edit blocks and nothing else — no explanation, no prose, no markdown fences. ' +
  'Each edit block has this exact format:\n' +
  '<<<<<<< SEARCH\n' +
  '(the exact existing lines to replace, copied verbatim from the file)\n' +
  '=======\n' +
  '(the new lines that replace them)\n' +
  '>>>>>>> REPLACE\n' +
  'Rules: SEARCH must be an exact, contiguous copy of lines already in the file, with enough lines to be ' +
  'unique. To delete code, leave the REPLACE body empty. Keep each SEARCH region as small as possible. ' +
  'Match the file’s existing indentation and style. If no change is needed, reply with no blocks at all.';

// Build the messages array for an Inquire edit: the fixed block-format rules plus the work (language,
// whole-file context, and the instruction). Pure — the caller reads these values off the VS Code editor
// and feeds them in, so this stays vscode-free and unit-testable. No target span: the model edits
// anywhere via the blocks, which is what makes Inquire caret-agnostic without re-emitting the file.
export const buildEditPrompt = (args: {
  instruction: string;
  languageId: string;
  context: string;
}): EditMessage[] => [
  { role: 'system', content: EDIT_SYSTEM_PROMPT },
  {
    role: 'user',
    content:
      `Language: ${args.languageId}\n\n` +
      `Full file for context:\n${args.context}\n\n` +
      `Instruction:\n${args.instruction}`,
  },
];

// ----------------------------- SEARCH/REPLACE edit blocks ----------------------------- //

// One targeted edit: the exact existing lines to find (search) and what to put in their place
// (replace; '' = a pure deletion). The model emits these instead of re-emitting the whole span/file.
export type EditBlock = { search: string; replace: string };

// The result of applying blocks to a document: the new text (LF-normalized — the caller rejoins with
// the document's own EOL, like diffLines) and the blocks whose search text was not located (surfaced
// to the user, never silently dropped).
export type EditPlan = { text: string; notFound: EditBlock[] };

// Aider-style block markers. Trailing newline before >>>>>>> is optional so an empty REPLACE body
// (a deletion) — where ======= is immediately followed by the closing marker — still parses.
const EDIT_BLOCK_RE = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n?>>>>>>> REPLACE/g;

// Parse a model reply into its edit blocks. Strips any <think> reasoning first (an unterminated one
// yields no answer → no blocks) and normalizes CRLF→LF so the markers match regardless of the reply's
// line endings. Surrounding prose or a ``` fence is ignored — only text between markers is captured.
export const parseEditBlocks = (raw: string): EditBlock[] => {
  const text = stripThink(raw).replace(/\r\n/g, '\n');
  const blocks: EditBlock[] = [];
  for (const m of text.matchAll(EDIT_BLOCK_RE)) blocks.push({ search: m[1], replace: m[2] });
  return blocks;
};

// Apply blocks to the document text, in order, each against the running result. Matching is
// EOL-agnostic (both sides normalized to LF — the same CRLF-vs-LF trap diffLines guards) and locates
// the first occurrence of each search. A search that is empty or not present is recorded in notFound
// and skipped, so a bad block can never corrupt the file — the user reviews the rest via the diff.
export const applyEditBlocks = (documentText: string, blocks: EditBlock[]): EditPlan => {
  let text = documentText.replace(/\r\n/g, '\n');
  const notFound: EditBlock[] = [];
  for (const block of blocks) {
    const search = block.search.replace(/\r\n/g, '\n');
    const idx = search ? text.indexOf(search) : -1;
    if (idx === -1) { notFound.push(block); continue; }
    text = text.slice(0, idx) + block.replace.replace(/\r\n/g, '\n') + text.slice(idx + search.length);
  }
  return { text, notFound };
};

// ----------------------------- Line diff (B2 inline diff) ----------------------------- //

// One line of B2's in-editor diff: kept (unchanged context), added (new), or removed (old). The
// renderer walks an ordered op list to paint decorations and to rebuild the buffer on accept/reject.
export type DiffOp =
  | { type: 'keep'; text: string }
  | { type: 'add'; text: string }
  | { type: 'remove'; text: string };

// Line-level diff between the original span and the model's rewrite, as an ordered keep/add/remove
// list. LCS-backtracked so unchanged lines stay 'keep' and each changed hunk emits its removes before
// its adds (unified-diff order). vscode-free: extension.ts feeds it the span text and renders the ops.
// O(n·m) — spans are a selection or a single line, so the table is tiny.
export const diffLines = (before: string, after: string): DiffOp[] => {
  // Split EOL-agnostically: a CRLF buffer vs an LF model reply must compare equal line-for-line,
  // else every line mismatches on a trailing \r. Op text is therefore \r-free; the caller rejoins
  // with the document's own EOL.
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const n = a.length;
  const m = b.length;

  // dp[i][j] = LCS length of a[i:] and b[j:]; built bottom-up so the forward walk can pick the move
  // (keep / remove / add) that preserves the longest common subsequence.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: 'keep', text: a[i] }); i++; j++; }
    // Tie goes to remove first, so a replaced line reads as remove-then-add.
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'remove', text: a[i] }); i++; }
    else { ops.push({ type: 'add', text: b[j] }); j++; }
  }
  while (i < n) { ops.push({ type: 'remove', text: a[i] }); i++; }
  while (j < m) { ops.push({ type: 'add', text: b[j] }); j++; }
  return ops;
};

// ----------------------------- LM chat-provider descriptors ----------------------------- //

// A vscode-free mirror of vscode.LanguageModelChatInformation — the descriptor the native chat picker
// renders one row from. Kept structural (not the vscode type) so this stays unit-testable; the
// chat-provider glue assigns the array straight to LanguageModelChatInformation[] (shapes match).
export type ChatModelInfo = {
  id: string;
  name: string;
  family: string;
  version: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  capabilities: { toolCalling?: boolean; imageInput?: boolean };
};

// Arbitrary OpenAI-compatible backends don't report their own limits, so advertise conservative caps.
const DEFAULT_MAX_INPUT_TOKENS = 128_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4_096;

// Substrings of known multimodal model families. Vision is really a per-MODEL trait, but a Provider
// (Zen, OpenRouter, …) serves many models, so detect it from the active model id rather than the row —
// that way Zen-serving-Claude or OpenRouter-serving-Gemini light up vision too. Conservative on purpose:
// only families that broadly accept image input, so we never over-declare and send images a backend 400s.
const VISION_FAMILIES = [
  'claude-3', 'claude-opus', 'claude-sonnet', 'claude-haiku', // Claude 3.x / 4.x are multimodal
  'gpt-4o', 'gpt-4.1', 'gpt-4-turbo', 'gpt-5',
  'gemini', 'pixtral', 'llava', 'vision',                     // 'vision' catches *-vision ids
  'qwen-vl', 'qwen2-vl', 'qwen2.5-vl',
];

// Whether a model id looks like a known vision-capable family (case-insensitive substring match).
export const modelSupportsVision = (modelId: string): boolean => {
  const id = modelId.toLowerCase();
  return VISION_FAMILIES.some((family) => id.includes(family));
};

// Note: there is deliberately NO context-window guess table. Context comes from models.dev or the
// neutral DEFAULT_MAX_* constants — an unknown/offline model shows the neutral default rather than a
// per-model guess that could be wrong (vision keeps a fallback heuristic; a wrong window is just a
// wrong budget, a guessed vision flag would send images a backend rejects). See VISION_FAMILIES above.

// ----------------------------- models.dev capability source ----------------------------- //

// The REAL per-model capabilities, the primary (dynamic) source that demotes the hardcoded table above
// to a fallback. All optional — a source may know some fields and not others; the builder fills each
// gap from the table, then the default.
export type ModelCaps = { contextInput?: number; maxOutput?: number; vision?: boolean };

// The slices we read from models.dev's api.json (it carries far more we ignore). The catalog is the
// whole document keyed by provider id (e.g. "opencode-go", "groq"), each with a models map.
type ModelsDevEntry = { limit?: { context?: number; output?: number }; modalities?: { input?: string[] }; release_date?: string };
export type ModelsDevCatalog = Record<string, { models?: Record<string, ModelsDevEntry> }>;

// Map one models.dev model entry to ModelCaps. Vision = its input modalities include "image" (the
// verified reliable signal — NOT the unrelated "attachment" flag). Absent fields stay undefined.
export const parseModelsDevEntry = (entry: ModelsDevEntry): ModelCaps => ({
  contextInput: entry.limit?.context,
  maxOutput: entry.limit?.output,
  vision: entry.modalities?.input?.includes('image') ?? false,
});

// Look up a model's caps in a fetched models.dev catalog by provider key + model id; undefined when the
// catalog/provider/model is absent (the builder then falls back to the table/default).
export const lookupModelsDevCaps = (catalog: ModelsDevCatalog | undefined, key: string, modelId: string): ModelCaps | undefined => {
  const entry = catalog?.[key]?.models?.[modelId];
  return entry ? parseModelsDevEntry(entry) : undefined;
};

// Order dropdown ids newest-first by models.dev release_date (ISO dates compare lexicographically);
// undated ids trail, alphabetically, so an entry missing metadata can never bury a fresh release.
const sortByReleaseDesc = (models: Record<string, ModelsDevEntry>, ids: string[]): string[] =>
  [...ids].sort((a, b) => {
    const da = models[a]?.release_date ?? '';
    const db = models[b]?.release_date ?? '';
    return da !== db ? (db < da ? -1 : 1) : a.localeCompare(b);
  });

// Build the descriptors Wisp advertises into VS Code's native model picker: one row per Provider that
// is actually usable. Usable = has a key AND a resolvable model AND (for Custom only) a base URL — a
// keyless / URL-less / model-less Provider can't serve a request, so it stays hidden rather than
// appearing as a dead pick. id is the Provider id (the response glue maps it back to {baseUrl,key}).
// `caps` (optional, injected) is the dynamic models.dev lookup; each field resolves dynamic -> table ->
// default, so a missing/slow/failed fetch silently degrades to the hardcoded behaviour.
export const buildChatModelInfos = (
  providers: Provider[],
  state: {
    keyed: Record<string, boolean>;
    modelMap: Record<string, string>;
    customBaseUrl: string;
    caps?: (provider: Provider, model: string) => ModelCaps | undefined;
    effort?: CodexEffort;
  },
): ChatModelInfo[] =>
  providers.flatMap((p) => {
    const model = resolveModel(state.modelMap, p);
    // Custom has no hardcoded URL — without wisp.baseUrl there is nowhere to send the request.
    const reachable = p.id !== CUSTOM_ID || state.customBaseUrl.trim() !== '';
    if (!state.keyed[p.id] || !model || !reachable) return [];
    // Context: dynamic models.dev caps else the neutral default (no guess table). contextInput is the
    // TOTAL window (models.dev limit.context). VS Code's "Context Size" column SUMS maxInput+maxOutput,
    // so decompose: reserve the output budget, leave the rest for input (output capped at half the
    // window so an anomalous "output == context" can't zero the input).
    const dyn = state.caps?.(p, model);
    const totalContext = dyn?.contextInput ?? DEFAULT_MAX_INPUT_TOKENS;
    const outputBudget = dyn?.maxOutput ?? DEFAULT_MAX_OUTPUT_TOKENS;
    const maxOutputTokens = Math.min(outputBudget, Math.max(1, Math.floor(totalContext / 2)));
    const maxInputTokens = Math.max(totalContext - maxOutputTokens, 1);
    // Codex reasoning rows mirror the active Effort in the picker label (· medium) — but only when the
    // caller threads one (the in-VS-Code picker does). The Bridge doors don't: their effort is per-request
    // (Claude Code's /effort), so a static label would show DEFAULT_EFFORT forever — noise, and a lie.
    // codexReasoning still gates so an inert spark/gpt-4.x row never claims a depth.
    const depth = isCodexProvider(p) && state.effort && codexReasoning(model) ? ` · ${state.effort}` : '';
    return [{
      id: p.id,
      name: `${p.label} — ${model}${depth}`,
      family: p.id,
      version: '1',
      maxInputTokens,
      maxOutputTokens,
      // Tool calling advertised for EVERY row — VS Code hides non-tool models from the chat/Ctrl+I picker
      // entirely. Honest for all: the OpenAI rows forward tools via the chat client, Codex via strict
      // Responses tools (its round-trip is wired). imageInput from models.dev's modalities (Codex: from
      // codexModelCaps), else the id heuristic — Codex forwards images as input_image parts, so vision is honest too.
      capabilities: { toolCalling: true, ...((dyn?.vision ?? modelSupportsVision(model)) ? { imageInput: true } : {}) },
    }];
  });

// ----------------------------- Tool calling (chat surface) ----------------------------- //

// vscode-free mirrors of the tool-calling shapes, so the message/tool/stream plumbing stays unit-
// testable. chatProvider.ts extracts the vscode parts into these plain forms and feeds them here.

// A tool the model may call (name + description + JSON-schema input), and its OpenAI function-tool form.
export type ToolSpec = { name: string; description: string; inputSchema?: object };
export type OAToolDef = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };

// Map VS Code tool defs to OpenAI function tools — inputSchema becomes the function parameters.
// A no-arg tool gets a valid object schema, not bare {}: strict backends (DeepSeek via opencode-go)
// 400 on a typeless schema ("must be type object, got type null"). Mirrors the Codex/Anthropic builders.
export const toOpenAiTools = (tools: ToolSpec[]): OAToolDef[] =>
  tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} } },
  }));

// One chat turn flattened to plain data: its text, any tool calls it made (assistant turns), any tool
// results it carries (user turns), and any attached images (user turns). chatProvider.ts builds these
// from the vscode message parts; images is optional (most turns have none).
export type NormalizedTurn = {
  role: 'user' | 'assistant';
  text: string;
  toolCalls: { id: string; name: string; argsJson: string }[];
  toolResults: { callId: string; content: string }[];
  images?: { mimeType: string; dataBase64: string }[];
};

// One OpenAI message-content part for a multimodal (vision) user message.
type OAContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

// One OpenAI chat message. A user message is a plain string unless it has images, then it is the
// multimodal content array. Assistant turns may carry tool_calls; a tool result is its own 'tool'
// message keyed by the call id. Hand-rolled (catalog imports nothing) — structurally the SDK's param.
export type OAChatMessage =
  | { role: 'user'; content: string | OAContentPart[] }
  | { role: 'assistant'; content: string; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };

// Flatten the normalized turns into the OpenAI message sequence. A user turn's tool results expand into
// standalone 'tool' messages (emitted before any user text so the assistant(tool_calls)→tool ordering
// the API requires is preserved); a user turn with only tool results yields no empty user message. An
// image-bearing user turn becomes a multimodal content array (text part + image_url data URIs).
export const buildOpenAiChatMessages = (turns: NormalizedTurn[]): OAChatMessage[] =>
  turns.flatMap((turn) => {
    if (turn.role === 'assistant') {
      const calls = turn.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.argsJson } }));
      return [calls.length
        ? { role: 'assistant' as const, content: turn.text, tool_calls: calls }
        : { role: 'assistant' as const, content: turn.text }];
    }
    const toolMsgs: OAChatMessage[] = turn.toolResults.map((r) => ({ role: 'tool', tool_call_id: r.callId, content: r.content }));
    const images = turn.images ?? [];
    // A bare tool-result turn carries no user prose or image, so don't emit an empty user message.
    if (turn.toolResults.length && !turn.text && !images.length) return toolMsgs;
    const content: string | OAContentPart[] = images.length
      ? [
          ...(turn.text ? [{ type: 'text' as const, text: turn.text }] : []),
          ...images.map((img) => ({ type: 'image_url' as const, image_url: { url: `data:${img.mimeType};base64,${img.dataBase64}` } })),
        ]
      : turn.text;
    return [...toolMsgs, { role: 'user' as const, content }];
  });

// OpenAI streams a tool call across chunks: id + name land on the first delta for an index, the
// arguments arrive as fragments on later deltas. Folded form once the stream completes.
export type ToolCallDelta = { index: number; id?: string; name?: string; args?: string };
export type AssembledToolCall = { id: string; name: string; argsJson: string };

// Reassemble streamed tool-call deltas into whole calls. Keyed by the stream index so parallel calls
// stay separate; id/name are taken from whichever fragment carries them and argument fragments are
// concatenated in arrival order. Returned in first-seen index order.
export const assembleToolCalls = (deltas: ToolCallDelta[]): AssembledToolCall[] => {
  const byIndex = new Map<number, AssembledToolCall>();
  for (const d of deltas) {
    const call = byIndex.get(d.index) ?? { id: '', name: '', argsJson: '' };
    if (d.id) call.id = d.id;
    if (d.name) call.name = d.name;
    if (d.args) call.argsJson += d.args;
    byIndex.set(d.index, call);
  }
  return [...byIndex.values()];
};

// One OpenAI chat-completions SSE block → its answer text. Chat streams are data-only SSE (no
// event: line, so parseSseBlock can't read them): normally one JSON chunk per block with the text
// under choices[0].delta.content (message.content covers a pseudo-streamed whole completion).
// '' for anything else — role chunks (content:null), keep-alives, the [DONE] sentinel, malformed
// JSON. The TUI's /test wiring check consumes this per block.
// ponytail: mid-stream `data: {"error":…}` frames on a 200 read as '' — surface them if a real
// compat backend is seen emitting one.
export const chatCompletionTextDelta = (block: string): string => {
  const dataLines = block.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('data:'));
  if (dataLines.length === 0) return '';
  const parseOne = (raw: string): string => {
    if (raw === '[DONE]') return '';
    try {
      const parsed = JSON.parse(raw) as { choices?: { delta?: { content?: string | null }; message?: { content?: string | null } }[] };
      return parsed?.choices?.[0]?.delta?.content ?? parsed?.choices?.[0]?.message?.content ?? '';
    } catch { return ''; }
  };
  const payloads = dataLines.map((l) => l.slice('data:'.length).trim());
  // SSE allows one payload split across data: lines — try the joined parse first. A CRLF-framed
  // backend (\r\n\r\n) never splits in sseBlocks (\n\n only), so its whole stream lands here as ONE
  // block of many complete chunks: the joined parse fails, and the per-line fallback recovers every
  // delta in order.
  const joined = parseOne(payloads.join('\n'));
  return joined || payloads.map(parseOne).join('');
};

// ----------------------------- Migration ----------------------------- //

// Decide what the one-time pre-catalog migration should do, given the current storage state. Returns
// null = no-op. The go-slot-present check is the idempotency guard: once migrated the go slot exists,
// so every later activate plans nothing and the legacy key can never be lost or double-copied. The
// target is the go slot (not zen): the pre-catalog key predates the split, when the sole Provider was
// the /zen/go/v1 endpoint, so it is provably a Go key. The caller performs the plan (store the go key,
// optionally record the model, delete the legacy slot).
export const planLegacyMigration = (
  state: { goKeyPresent: boolean; legacyKey?: string; legacyModel?: string },
): { storeGoKey: string; setModel?: string } | null => {
  if (state.goKeyPresent || !state.legacyKey) return null;
  return { storeGoKey: state.legacyKey, ...(state.legacyModel ? { setModel: state.legacyModel } : {}) };
};

// Decide the one-time Zen→Go slot migration when the misnamed `opencode-zen` row is renamed to
// `opencode-go`. The old `opencode-zen` slot held a GO key (that row pointed at /zen/go/v1), so the key
// is provably a Go key, not a guess. Move it to the go slot, carry the remembered model, and CLEAR the
// zen slot — otherwise the genuinely-new `opencode-zen` row (/zen/v1) would inherit the Go key and 401.
// goKeyPresent is the idempotency guard (mirrors planLegacyMigration): once go is populated, plan null.
export const planZenToGoMigration = (
  state: { goKeyPresent: boolean; zenSlotKey?: string; zenSlotModel?: string },
): { storeGoKey: string; setModel?: string; clearZenSlot: true } | null => {
  if (state.goKeyPresent || !state.zenSlotKey) return null;
  return { storeGoKey: state.zenSlotKey, ...(state.zenSlotModel ? { setModel: state.zenSlotModel } : {}), clearZenSlot: true };
};

// ----------------------------- Codex Provider (pure cores) ----------------------------- //

// The credential bundle for the Codex Provider. Unlike every other row (a bearer API key), Codex is
// reached via ChatGPT OAuth: an access/refresh/id token triple plus the ChatGPT account id. `apiKey` is
// the optional id-token→API-key exchange result. The impure codexAuth.ts owns the OAuth/IO; this module
// only reasons about an already-parsed blob.
export type CodexCreds = {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  accountId?: string;
  apiKey?: string;
};

// Whether a catalog row is the Codex backend. Absent kind == 'openai-chat', so this is false for the
// ten OpenAI-compatible rows — they keep the API-key path untouched.
export const isCodexProvider = (provider: Provider): boolean => provider.kind === 'codex';

// Codex is "usable when signed in" — it has no API key, so usability is simply the presence of a bearer
// credential (the OAuth access token, or the exchanged apiKey). The chat picker feeds this in as the
// row's `keyed` flag so a not-signed-in Codex stays hidden, exactly like a keyless OpenAI-chat row.
export const isCodexSignedIn = (creds: CodexCreds | undefined): boolean =>
  !!creds && !!(creds.accessToken || creds.apiKey);

// ----------------------------- Codex Responses request ----------------------------- //

// The Codex backend speaks the OpenAI *Responses* API, not chat completions: the system prompt is a
// top-level `instructions` string and the conversation is `input` message items. User/system text parts
// are typed `input_text`; assistant (replayed prior turns) are `output_text` — the API rejects the wrong
// type. store:false (don't persist server-side); stream:true (we reduce the SSE to text).
export type CodexEffort = 'low' | 'medium' | 'high' | 'xhigh';
export type CodexReasoning = { effort: CodexEffort; summary: 'auto' };

// The shared wisp.effort knob's type (slice #32). Superset of CodexEffort with 'max' on top — 'max' is an
// Anthropic-only level (Codex's wire tops out at xhigh), so it lives here, NOT in CodexEffort. The stored
// value is one global, normalized per-Provider at send time (standardEffortToCodex below; the Anthropic
// clamp in anthropicThinkingEffort).
export type EffortLevel = CodexEffort | 'max';

// Map a stored EffortLevel onto Codex's wire type: 'max' has no Codex equivalent, so fold it to xhigh (its
// ceiling) — mirrors openclaude standardEffortToOpenAI. Without this a knob left on 'max' after a Provider
// switch would 400 the Responses call.
export const standardEffortToCodex = (effort: EffortLevel): CodexEffort => (effort === 'max' ? 'xhigh' : effort);

// One content part of a Responses input message: text (input_text for user/system, output_text for a
// replayed assistant turn) or an image (input_image as a base64 data-URI / url).
export type CodexContentPart = { type: 'input_text' | 'output_text'; text: string } | { type: 'input_image'; image_url: string };

// One Responses `input` item. A message turn, OR — for an agent round-trip — a function_call (a prior
// assistant tool call, replayed) / function_call_output (its result), which are top-level items, NOT
// message content. call_id ties the call to its output (the API matches them by it).
export type CodexInputItem =
  | { type: 'message'; role: string; content: CodexContentPart[] }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string };

// A Responses-API function tool. FLAT (name/description/parameters at top level), unlike chat completions'
// nested `function` object. strict:true makes Codex honour the schema exactly — which is why every object
// in `parameters` must be closed (additionalProperties:false) with all its keys required.
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
// and lists ALL its property keys in `required` — Codex strict tools reject any object that doesn't. Recurses
// through properties, array items, and the anyOf/oneOf/allOf combinators. A non-object schema (a leaf like
// {type:'string'}) is returned untouched; a non-schema value degrades to {} rather than throwing.
const enforceStrictResponsesSchema = (schema: unknown): Record<string, unknown> => {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return {};
  const record: Record<string, unknown> = { ...(schema as Record<string, unknown>) };
  // Codex strict mode accepts only a fixed closed shape; the dynamic-/open-object keywords 400 it
  // (observed: Claude Code's AskUserQuestion carries `propertyNames`). Strip them at every level — Codex
  // already forces additionalProperties:false + required-all, so these map-keywords are inert anyway.
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
// native VS Code tools — every object closed, all keys required. The Bridge door forwarding an EXTERNAL
// client's toolset (Claude Code) passes strict:false: Codex strict rejects rich schemas an external toolset
// carries (dynamic keyed maps, propertyNames, partial `required`), so the schema rides through verbatim
// instead — the same leniency the OpenAI-chat and Anthropic tool builders already give. A tool with no
// schema gets an empty object either way, so the parameters field is always valid.
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
// The native-chat path has no system turn — VS Code's chat API has no System role — so fall back to this.
const CODEX_DEFAULT_INSTRUCTIONS = 'You are a helpful coding assistant.';

// Translate a conversation into a Codex Responses request body. Inquire passes its EditMessage[] (a system
// + a user message); the native-chat path passes user/assistant turns, optionally with images and — in
// agent mode — tool calls and results. System content becomes `instructions`, defaulting when there is none
// so the backend never sees it absent. Each non-system turn expands to its items in API-required order:
// an assistant turn's text (output_text) message then its function_call items; a user turn's
// function_call_output items then its text (input_text) + image (input_image) message. A turn with no
// content/images yields no message item (a tool-only turn is just its call/result items). reasoning rides
// only when supplied (reasoning models REQUIRE it, others REJECT it). tools (already strict-converted) ride
// only when non-empty, with tool_choice (default 'auto') + parallel_tool_calls — a tool_choice with no tools 400s.
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
  // API (400 'not permitted'), and the real Codex CLI omits it too — omitting already grants the model-max
  // output budget. codexModelCaps.maxOutput is picker-display metadata ONLY; do not thread it into the body
  // (the Anthropic sibling's max_tokens is a false-analogy trap). Length is governed by reasoning.effort.
  return {
    model: args.model, instructions, input,
    ...(args.reasoning ? { reasoning: args.reasoning } : {}),
    store: false, stream: true,
    ...(args.tools && args.tools.length ? { tools: args.tools, tool_choice: args.toolChoice ?? 'auto', parallel_tool_calls: true } : {}),
  };
};

// Default reasoning depth — 'medium' preserves the pre-Effort behavior for callers that don't thread one.
export const DEFAULT_EFFORT: CodexEffort = 'medium';

// The reasoning object to send for a Codex model, or undefined when it must be omitted. gpt-5 / o-series
// are reasoning models and need it; the gpt-4.x and *-spark (fast-loop) variants reject it. The panel's
// Effort knob supplies the depth (low/medium/high); it is inert for the non-reasoning variants.
export const codexReasoning = (model: string, effort: CodexEffort = DEFAULT_EFFORT): CodexReasoning | undefined => {
  const m = model.toLowerCase();
  if (m.includes('spark')) return undefined;
  return /^(gpt-5|o3|o4)/.test(m) ? { effort, summary: 'auto' } : undefined;
};

// Real Codex model windows, since the backend has no /models route and these ids aren't keyed to
// models.dev — without this the chat picker would show the neutral default window. Numbers are from
// models.dev/api.json: the gpt-5.x Codex family is a 400K context / 32K output; the o-series reasoning
// models are 200K / 100K. vision is true: the gpt-5/o families are multimodal and the Codex Responses
// backend accepts input_image (as the Codex CLI / XETH-7's codexShim send it).
export const codexModelCaps = (model: string): ModelCaps => {
  if (/^o[0-9]/.test(model.toLowerCase())) return { contextInput: 200_000, maxOutput: 100_000, vision: true };
  return { contextInput: 400_000, maxOutput: 32_768, vision: true };
};

// Curated Codex model ids — the OFFLINE FALLBACK for codexModelsFrom (the live models.dev list is the
// primary source). The codex row's defaultModel must stay a member of this list.
export const CODEX_MODELS: string[] = [
  'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex',
  'gpt-5.3-codex-spark', 'gpt-5.2-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini',
  'gpt-5.4-mini', 'o3', 'o4-mini',
];

// Live Codex dropdown ids from models.dev's openai lineup — keep the families the ChatGPT-subscription
// Codex backend serves (gpt-5*, o3*, o4-mini*), drop the API-only variants it rejects (-pro, -nano,
// -chat-latest, -deep-research). Catalog absent or filter empty → curated fallback, the old behaviour.
export const codexModelsFrom = (catalog?: ModelsDevCatalog): string[] => {
  const models = catalog?.openai?.models;
  if (!models) return CODEX_MODELS;
  const ids = Object.keys(models).filter(
    (id) => /^(gpt-5|o3|o4-mini)/.test(id) && !/-(pro|nano|chat-latest|deep-research)$/.test(id),
  );
  return ids.length ? sortByReleaseDesc(models, ids) : CODEX_MODELS;
};

// ----------------------------- Codex Responses reply ----------------------------- //

// One parsed Server-Sent Event off the Codex Responses stream: the SSE `event:` name and its `data:` JSON.
export type CodexResponsesEvent = { event: string; data: any };

// The provider-agnostic shape parseSseBlock returns — both Codex (Responses) and Anthropic (Messages)
// stream `event:`/`data:` SSE, so the same parser feeds both reducers; the event names differ, the shape
// does not. Aliased so the Anthropic code reads in its own vocabulary rather than "CodexResponsesEvent".
export type SseEvent = CodexResponsesEvent;

// Parse ONE SSE block (a blank-line-separated run of `event:`/`data:` lines) into an event. The data:
// lines are joined before JSON parsing (SSE splits long payloads across lines). undefined for a block
// with no event/data, the [DONE] sentinel, or unparseable JSON. Shared by the non-streaming reader (it
// splits the whole body into blocks) and the streaming path (it parses each completed block as it arrives)
// so there is one SSE parser, not two.
export const parseSseBlock = (block: string): CodexResponsesEvent | undefined => {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const eventLine = lines.find((l) => l.startsWith('event:'));
  const dataLines = lines.filter((l) => l.startsWith('data:'));
  if (!eventLine || dataLines.length === 0) return undefined;
  const raw = dataLines.map((l) => l.slice('data:'.length).trim()).join('\n');
  if (raw === '[DONE]') return undefined;
  try { return { event: eventLine.slice('event:'.length).trim(), data: JSON.parse(raw) }; } catch { return undefined; }
};

// Pull the answer text out of a *final* Responses object (the `response.completed` payload, or a
// non-streamed reply). Walks output[] message items and concatenates every output_text part — reasoning
// parts and function_call items are not answer text and are skipped. Tolerant of missing fields → ''.
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

// The truncation reason off a *terminal* Responses object, or undefined when the reply completed normally.
// The backend stamps incomplete_details.reason (e.g. 'max_output_tokens', 'content_filter') on a cut-short
// reply — and for a reasoning model the budget can be spent before any visible output_text, so the streamed
// deltas alone can't reveal that the answer was truncated. undefined for a clean completion or a non-string.
export const responsesIncompleteReason = (response: any): string | undefined => {
  const reason = response?.incomplete_details?.reason;
  return typeof reason === 'string' ? reason : undefined;
};

// The Messages message_delta stop_reason that means the reply was CUT SHORT — budget spent (max_tokens),
// blocked (content_filter), or declined (refusal). The Anthropic analogue of responsesIncompleteReason:
// unlike Codex it rides a live terminal frame, not a payload field. A clean close (end_turn / tool_use /
// stop_sequence / pause_turn), an unknown string, or undefined all yield undefined — no truncation, no marker.
// #87 surfaces the returned reason so a cut-short turn is diagnosable instead of relabeled a silent end_turn.
export const anthropicTruncationReason = (stopReason: string | undefined): string | undefined =>
  stopReason === 'max_tokens' || stopReason === 'content_filter' || stopReason === 'refusal' ? stopReason : undefined;

// Reassemble streamed Responses function-call events into whole tool calls — the Responses analogue of
// assembleToolCalls. A call is announced by response.output_item.added (its item carries id/call_id/name and
// maybe an initial arguments fragment); its arguments then stream as response.function_call_arguments.delta
// events keyed by item_id. Accumulate by the item id (what the deltas reference) but surface call_id as the
// id — that is what round-trips to the function_call_output. Returned in first-seen order; a call that never
// announced a name is dropped (it can't be invoked).
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
// that completed text when non-empty (guards a dropped/duplicated delta), else fall back to the joined
// deltas. A response.failed event is a backend error — throw its message rather than return empty text.
export const reduceResponsesTextEvents = (events: CodexResponsesEvent[]): string => {
  let deltas = '';
  let completedText = '';
  for (const ev of events) {
    if (ev.event === 'response.failed') {
      throw new Error(ev.data?.response?.error?.message ?? ev.data?.error?.message ?? 'Codex response failed');
    }
    // Skip a non-string delta — coercing it (5 -> '5', {} -> '[object Object]') would corrupt the answer.
    if (ev.event === 'response.output_text.delta') { if (typeof ev.data?.delta === 'string') deltas += ev.data.delta; }
    // Only a non-empty terminal payload overwrites — so a later empty terminal (incomplete after
    // completed, or a duplicate) can't blank an answer already captured.
    else if (ev.event === 'response.completed' || ev.event === 'response.incomplete') {
      const text = extractResponsesText(ev.data?.response);
      if (text) completedText = text;
    }
  }
  return completedText || deltas;
};

// ----------------------------- Codex OAuth token introspection ----------------------------- //

// Decode a JWT's payload (the middle base64url segment) to its claims object; undefined for a non-JWT or
// an unparseable payload. The token's signature is never verified — we only read claims (exp, account id)
// the backend already issued to us, so this is introspection, not auth.
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
// `https://api.openai.com/auth`.chatgpt_account_id (with flatter fallbacks seen across token versions).
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

// Decide whether to refresh: true when the access token (else the id token) expires within the skew
// window. No parseable expiry → false: we can't prove it's stale, so don't force a refresh (and a failed
// refresh would just block a working token). `now` is injected so the decision stays pure and testable.
export const shouldRefreshCodexToken = (creds: { accessToken?: string; idToken?: string }, now: number): boolean => {
  const expiresAt = jwtExpiryMs(creds.accessToken) ?? jwtExpiryMs(creds.idToken);
  return expiresAt !== undefined && expiresAt <= now + CODEX_TOKEN_REFRESH_SKEW_MS;
};

// ----------------------------- Codex auth.json import ----------------------------- //

// A trimmed non-empty string, else undefined — so blank/null/non-string fields don't become "present".
const trimmedString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

// Parse a ~/.codex/auth.json (written by the Codex CLI) into CodexCreds so an existing CLI login is
// imported instead of forcing a fresh sign-in. The real shape nests the OAuth triple under `tokens`
// (snake_case) alongside a possibly-null OPENAI_API_KEY; flatter fallbacks are tolerated. The account id
// comes from tokens.account_id, else is derived from the id/access token. Returns undefined when no
// usable bearer credential (neither a token nor an apiKey) is present — there is nothing to import.
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

// ----------------------------- Anthropic OAuth Provider (pure cores) ----------------------------- //

// The credential bundle for the Anthropic Provider. Like Codex it is OAuth-backed (no API key), but the
// token carries no JWT exp — Anthropic returns expires_in, so the deadline is computed at exchange time
// and stored as an absolute epoch-ms expiresAt. The impure anthropicAuth.ts owns the OAuth/IO; this
// module only reasons about an already-parsed blob.
export type AnthropicCreds = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms; absent when the token response carried no expires_in
};

// Whether a catalog row is the Anthropic backend. Absent kind == 'openai-chat', so this is false for the
// ten OpenAI-compatible rows and the Codex row.
export const isAnthropicProvider = (provider: Provider): boolean => provider.kind === 'anthropic-oauth';

// Anthropic is "usable when signed in" — no API key, so usability is the presence of a bearer access
// token. The `{}` sign-out tombstone and a refresh-only blob both read as signed-out.
export const isAnthropicSignedIn = (creds: AnthropicCreds | undefined): boolean =>
  !!creds && !!creds.accessToken;

// Turn an Anthropic OAuth token response into AnthropicCreds. expires_in (seconds, relative) becomes an
// absolute expiresAt against the injected clock — `now` is a parameter so this stays pure and testable.
export const tokensToAnthropicCreds = (
  payload: { access_token?: string; refresh_token?: string; expires_in?: number },
  now: number,
): AnthropicCreds => ({
  ...(payload.access_token ? { accessToken: payload.access_token } : {}),
  ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
  ...(typeof payload.expires_in === 'number' ? { expiresAt: now + payload.expires_in * 1000 } : {}),
});

// Refresh the access token 5 minutes BEFORE it expires, so an in-flight request can't have it die under
// it (Anthropic's larger skew than Codex's 60s, per openclaude's isOAuthTokenExpired). No expiresAt →
// false: we can't prove staleness, so don't force a refresh that might block a working token.
const ANTHROPIC_TOKEN_REFRESH_SKEW_MS = 5 * 60_000;
export const shouldRefreshAnthropicToken = (creds: { expiresAt?: number }, now: number): boolean =>
  creds.expiresAt !== undefined && creds.expiresAt <= now + ANTHROPIC_TOKEN_REFRESH_SKEW_MS;

// Parse a stored SecretStorage slot into AnthropicCreds. An absent/empty slot, or a corrupt one (bad
// JSON), reads as undefined rather than throwing; the `{}` tombstone parses to an empty object (which
// isAnthropicSignedIn then reads as signed-out).
export const parseAnthropicCreds = (raw: string | undefined): AnthropicCreds | undefined => {
  if (!raw) return undefined;
  try { return JSON.parse(raw) as AnthropicCreds; } catch { return undefined; }
};

// Curated Claude model ids — the OFFLINE FALLBACK for anthropicModelsFrom (the live models.dev list is
// the primary source). The anthropic row's defaultModel must stay a member.
export const ANTHROPIC_MODELS: string[] = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

// Live Claude dropdown ids from models.dev — undated aliases only (dated -YYYYMMDD snapshots duplicate
// them). Deliberately NO family whitelist: a brand-new family name must appear, never be filtered out.
export const anthropicModelsFrom = (catalog?: ModelsDevCatalog): string[] => {
  const models = catalog?.anthropic?.models;
  if (!models) return ANTHROPIC_MODELS;
  const ids = Object.keys(models).filter((id) => !/-\d{8}$/.test(id));
  return ids.length ? sortByReleaseDesc(models, ids) : ANTHROPIC_MODELS;
};

// ----------------------------- Grok (xAI OAuth) Provider (pure cores) ----------------------------- //

// Grok's credential bundle — a Codex-twin reached by xAI OAuth (no API key). Like Anthropic the token
// carries no JWT exp (xAI returns expires_in), so the deadline is computed at exchange time and stored as an
// absolute epoch-ms expiresAt. tokenEndpoint caches the once-discovered OIDC token endpoint (D7) so a
// refresh needn't re-run discovery. The impure xaiAuth.ts (slice #93) owns the OAuth/IO; this module only
// reasons about an already-parsed blob.
export type XaiCreds = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;     // epoch ms; absent when the token response carried no expires_in
  tokenEndpoint?: string; // discovered OIDC token endpoint, cached across refreshes (D7)
};

// Whether a catalog row is the Grok backend. Absent kind == 'openai-chat', so this is false for the
// OpenAI-compatible rows — including the API-key Groq row Grok must never be confused with — and Codex/Anthropic.
export const isXaiProvider = (provider: Provider): boolean => provider.kind === 'xai-oauth';

// Grok is "usable when signed in" — no API key, so usability is the presence of a bearer access token. The
// `{}` sign-out tombstone and a refresh-only blob both read as signed-out.
export const isXaiSignedIn = (creds: XaiCreds | undefined): boolean =>
  !!creds && !!creds.accessToken;

// Turn an xAI OAuth token response into XaiCreds. expires_in (seconds, relative) becomes an absolute
// expiresAt against the injected clock — `now` is a parameter so this stays pure and testable.
export const tokensToXaiCreds = (
  payload: { access_token?: string; refresh_token?: string; expires_in?: number },
  now: number,
): XaiCreds => ({
  ...(payload.access_token ? { accessToken: payload.access_token } : {}),
  ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
  ...(typeof payload.expires_in === 'number' ? { expiresAt: now + payload.expires_in * 1000 } : {}),
});

// Refresh the access token 2 minutes BEFORE it expires (xAI's skew — tighter than Anthropic's 5min), so an
// in-flight request can't have it die under it. No expiresAt → false: can't prove staleness, so don't force
// a refresh that might block a working token. The skew lives HERE at the check (the twin pattern), not baked
// into expiresAt — so it is applied exactly once.
const XAI_TOKEN_REFRESH_SKEW_MS = 2 * 60_000;
export const shouldRefreshXaiToken = (creds: { expiresAt?: number }, now: number): boolean =>
  creds.expiresAt !== undefined && creds.expiresAt <= now + XAI_TOKEN_REFRESH_SKEW_MS;

// Parse a stored auth.json slice into XaiCreds. An absent/empty/corrupt slot reads as undefined rather than
// throwing; the `{}` tombstone parses to an empty object (isXaiSignedIn then reads signed-out).
export const parseXaiCreds = (raw: string | undefined): XaiCreds | undefined => {
  if (!raw) return undefined;
  try { return JSON.parse(raw) as XaiCreds; } catch { return undefined; }
};

// Curated Grok model ids — the OFFLINE FALLBACK for xaiModelsFrom and the OAuth-only lineup. The xai row's
// defaultModel (grok-build) must stay a member.
export const XAI_MODELS: string[] = ['grok-build', 'grok-composer-2.5-fast', 'grok-4.5'];

// Live Grok dropdown ids from models.dev — undated aliases only (dated -YYYYMMDD snapshots duplicate them).
// No family whitelist: a brand-new Grok id must appear, never be filtered out. Catalog absent/filter-empty →
// curated fallback.
export const xaiModelsFrom = (catalog?: ModelsDevCatalog): string[] => {
  const models = catalog?.xai?.models;
  if (!models) return XAI_MODELS;
  const ids = Object.keys(models).filter((id) => !/-\d{8}$/.test(id));
  return ids.length ? sortByReleaseDesc(models, ids) : XAI_MODELS;
};

// Real Grok model windows — the OAuth path has no models.dev catalogKey, so without this the picker would
// show the neutral default. grok-build (512K/30K) + grok-composer (200K/30K) route the subscription proxy;
// grok-4.5 is 500K/131K reasoning on api.x.ai. maxOutput is pinned present (every branch sets it) so the
// client slice (#94) reads it as the request's max_tokens without a fallback — mirrors anthropicModelCaps.
export const xaiModelCaps = (model: string): ModelCaps & { maxOutput: number } => {
  const m = model.toLowerCase();
  if (m.includes('composer')) return { contextInput: 200_000, maxOutput: 30_000 };
  if (/grok-[4-9]/.test(m)) return { contextInput: 500_000, maxOutput: 131_000 }; // grok-4.5+ reasoning family
  return { contextInput: 512_000, maxOutput: 30_000 }; // grok-build (default)
};

// Grok CLI's expires_at is an absolute deadline — epoch SECONDS in some builds, MS in others. Normalize to
// ms by magnitude (~1e9 seconds vs ~1e12 ms); a wrong guess only forces one self-healing refresh.
const grokExpiresAtMs = (raw: unknown): number | undefined =>
  typeof raw === 'number' && isFinite(raw) ? (raw < 1e12 ? raw * 1000 : raw) : undefined;

// Import an existing Grok CLI login (~/.grok/auth.json) so a CLI user isn't forced to sign in again (D6 —
// parity with parseCodexAuthJson). The CLI nests the bundle under an "https://auth.x.ai::<client_id>" key
// ({ key, refresh_token, expires_at }); a flatter legacy shape stores it at the root. `key` is the bearer.
// Returns undefined when there is no usable bearer (nothing to import) — never throws.
export const parseGrokAuthJson = (json: unknown): XaiCreds | undefined => {
  if (!json || typeof json !== 'object') return undefined;
  const root = json as Record<string, any>;
  const nestedKey = Object.keys(root).find((k) => k.startsWith('https://auth.x.ai::'));
  const slot = (nestedKey ? root[nestedKey] : root) as Record<string, any>;
  if (!slot || typeof slot !== 'object') return undefined;
  const accessToken = trimmedString(slot.key ?? slot.access_token);
  const refreshToken = trimmedString(slot.refresh_token);
  const expiresAt = grokExpiresAtMs(slot.expires_at);
  if (!accessToken) return undefined;
  return {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  };
};

// A discovered OIDC endpoint is trusted only when its host is x.ai (or a subdomain) — the leading-dot guard
// blocks look-alikes (evilx.ai, x.ai.evil.com); anything unparseable is rejected. Both endpoints from the
// well-known doc pass through this before the bearer is ever sent (D7 security check, slice #93).
export const isXaiEndpoint = (url: string): boolean => {
  try { const h = new URL(url).hostname.toLowerCase(); return h === 'x.ai' || h.endsWith('.x.ai'); }
  catch { return false; }
};

// ----------------------------- Grok (xAI) Responses request (pure cores) ----------------------------- //

// The public direct endpoint (grok-4.5+); proxy models use the catalog row's baseUrl instead.
const XAI_PUBLIC_RESPONSES_URL = 'https://api.x.ai/v1/responses';
// Grok-CLI client identity the subscription proxy expects. ⚠️ Best-effort values — structurally required
// but the exact identifier/version await a live check (#97/#98).
const XAI_CLIENT_IDENTIFIER = 'grok-cli';
const XAI_CLIENT_VERSION = '1.0.0';

// grok-build + grok-composer are the subscription models served by the Grok-CLI proxy; grok-4.5+ go direct
// to api.x.ai. Drives both the endpoint and whether the x-grok-* proxy headers ride.
export const isGrokCliProxyModel = (model: string): boolean => {
  const m = model.toLowerCase();
  return m.startsWith('grok-build') || m.includes('composer');
};

// The Responses endpoint for a model: the row's proxy base + /responses for subscription models, else the
// public api.x.ai. baseUrl is the xai row's proxy base (only proxy models use it).
export const xaiResponsesUrl = (baseUrl: string, model: string): string =>
  isGrokCliProxyModel(model) ? `${baseUrl}/responses` : XAI_PUBLIC_RESPONSES_URL;

// Request headers. Bearer (the OAuth access token) always; proxy models add the x-grok-* CLI-identifying set
// the subscription proxy validates. x-grok-conv-id keys the proxy's cache — one per stream.
export const xaiRequestHeaders = (model: string, bearer: string, sessionId: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Authorization': `Bearer ${bearer}`,
  };
  if (isGrokCliProxyModel(model)) {
    headers['x-grok-client-identifier'] = XAI_CLIENT_IDENTIFIER;
    headers['x-grok-client-version'] = XAI_CLIENT_VERSION;
    headers['x-xai-token-auth'] = 'xai-grok-cli';
    headers['x-grok-model-override'] = model;
    headers['x-grok-conv-id'] = sessionId;
  }
  return headers;
};

// Per-model reasoning gate: grok-4.5+ are reasoning models (take a reasoning block, same shape as Codex);
// grok-build/composer reject it. Effort folds 'max'→'xhigh' (xAI's wire tops there, like Codex).
export const xaiReasoning = (model: string, effort?: EffortLevel): CodexReasoning | undefined =>
  /grok-[4-9]/.test(model.toLowerCase())
    ? { effort: standardEffortToCodex(effort ?? DEFAULT_EFFORT), summary: 'auto' }
    : undefined;

// Sanitize a RAW external Responses payload for xAI — the path where the Bridge forwards a client's payload
// verbatim (slice #95), NOT our own clean buildCodexResponsesBody output. xAI 400s on three OpenAI-Responses
// quirks: prompt_cache_retention (unsupported — keep prompt_cache_key), the reasoning.encrypted_content
// `include` entry on the proxy, and the 'minimal' effort level (fold to 'low'). Pure; returns a new object.
export const rewriteXaiResponsesPayload = (payload: Record<string, unknown>, opts: { proxy: boolean }): Record<string, unknown> => {
  const body = { ...payload };
  delete body.prompt_cache_retention;
  if (opts.proxy && Array.isArray(body.include)) {
    const include = (body.include as unknown[]).filter((x) => x !== 'reasoning.encrypted_content');
    if (include.length) body.include = include; else delete body.include;
  }
  const reasoning = body.reasoning;
  if (reasoning && typeof reasoning === 'object' && !Array.isArray(reasoning) && (reasoning as Record<string, unknown>).effort === 'minimal') {
    body.reasoning = { ...(reasoning as Record<string, unknown>), effort: 'low' };
  }
  return body;
};

// One rule for "which curated list backs an OAuth Provider" — shared by the Active-Provider panel
// state and the per-row Routing-map lists (#53). Keyed kinds answer undefined: they have a live
// /models route instead of a curated list.
export const oauthModelOptions = (p: Provider, catalog?: ModelsDevCatalog): string[] | undefined =>
  isCodexProvider(p) ? codexModelsFrom(catalog)
    : isAnthropicProvider(p) ? anthropicModelsFrom(catalog)
    : isXaiProvider(p) ? xaiModelsFrom(catalog)
    : undefined;

// ----------------------------- Anthropic client attestation ----------------------------- //

// The subscription Messages backend recomputes + validates a per-request fingerprint and rejects an
// unrecognized client with a synthetic 429 (no rate-limit headers). The recipe (openclaude-verified):
// sha256(salt + chars sampled from the first user message at indices 4/7/20 + version), first 3 hex.
// Missing indices substitute '0'. Salt/indices are load-bearing — the server checks them, so this MUST
// be derived from the exact first-user-message text that is sent.
const ANTHROPIC_FP_SALT = '59cf53e54c78';
export const anthropicFingerprint = (firstUserMessage: string, version: string): string => {
  const sampled = [4, 7, 20].map((i) => firstUserMessage[i] ?? '0').join('');
  return createHash('sha256').update(ANTHROPIC_FP_SALT + sampled + version).digest('hex').slice(0, 3);
};

// The attribution string Claude Code sends as the FIRST system block — the recognition signal that carries
// the validated fingerprint. No cch (native attestation can't be reproduced from Node and is unenforced),
// no cc_workload (interactive run). version must match the User-Agent's claude-cli/<version>.
export const anthropicAttribution = (firstUserMessage: string, version: string): string =>
  `x-anthropic-billing-header: cc_version=${version}.${anthropicFingerprint(firstUserMessage, version)}; cc_entrypoint=cli;`;

// ----------------------------- Anthropic Messages request + reply (pure cores) ----------------------------- //

// One conversation message for the Messages backend. Inquire sends system+user; native chat sends
// user/assistant. The Messages API carries the system prompt top-level (not as a role), so a 'system'
// entry here is lifted out by the body builder rather than placed among `messages`. Agent mode (#30) also
// carries a turn's tool round-trip: toolCalls on an assistant turn, toolResults on a user turn — kept
// alongside `content` (the text), mirroring the Codex message shape, and expanded to content blocks below.
export type AnthropicMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  toolCalls?: { id: string; name: string; argsJson: string }[];
  toolResults?: { callId: string; content: string }[];
  images?: { mimeType: string; dataBase64: string }[];
};

// An Anthropic Messages tool definition. Unlike Codex's strict Responses tools, Anthropic accepts a plain
// JSON schema as `input_schema` — no additionalProperties:false / required-all-keys closure.
export type AnthropicTool = { name: string; description: string; input_schema: Record<string, unknown> };

// Map VS Code tool defs to Anthropic tools. The schema rides through verbatim (Anthropic doesn't require
// strict closure), so this is far simpler than toCodexResponsesTools; a tool with no schema gets an empty
// object schema so input_schema is always present and valid.
export const toAnthropicTools = (tools: ToolSpec[]): AnthropicTool[] =>
  tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
  }));

// Parse a tool call's accumulated argument JSON into the object Anthropic's tool_use block expects (Codex's
// Responses round-trip sends the raw string; Anthropic wants it parsed). Bad/partial JSON degrades to {}.
const parseToolInput = (argsJson: string): Record<string, unknown> => {
  try { return argsJson ? JSON.parse(argsJson) : {}; } catch { return {}; }
};

// Translate a conversation into an Anthropic Messages request body. The system text moves to the top-level
// `system` block array — Anthropic does NOT take a system role in `messages` — led by the Claude Code
// attribution block (its fingerprint derived from the first user turn's TEXT, the #28 contract — so it MUST
// stay sourced from `content`, never from a tool block). A turn with tool calls/results expands to a content
// BLOCK array (assistant: text then tool_use; user: tool_result FIRST then text — Anthropic requires that
// order); a plain turn stays a bare string (the #29 shape). An empty text block is never emitted (Anthropic
// rejects it), so a tool-only turn is just its tool block. tools ride only when non-empty — a bare
// tool_choice with no tools is rejected. Shared by anthropicInquire and anthropicStream: one tested shape.
// ----------------------------- Thinking / effort (slice #31) ----------------------------- //

// Which Claude models accept the thinking+effort body fields. Mirrors openclaude's modelSupportsEffort
// substring set — Opus 4.5-4.8 and Sonnet 4.6 take them; Haiku and older variants 400, so omit there.
const modelSupportsAnthropicEffort = (model: string): boolean => {
  const m = model.toLowerCase();
  return /opus-4-[5-8]/.test(m) || m.includes('sonnet-4-6');
};

// xhigh is the one effort level not universally accepted — only Opus 4.7/4.8 take it (openclaude
// modelSupportsXHighEffort). Other effort-capable models (Sonnet 4.6, Opus 4.5/4.6) 400 on it.
const modelSupportsAnthropicXHigh = (model: string): boolean => /opus-4-[78]/.test(model.toLowerCase());

// max (slice #32) is Opus-4.6+-only (openclaude modelSupportsMaxEffort). Note this set differs from xhigh's:
// Opus 4.6 takes max but NOT xhigh — the capabilities are independent, so the clamps below are separate.
export const modelSupportsAnthropicMax = (model: string): boolean => /opus-4-[678]/.test(model.toLowerCase());

// The thinking/effort fragment to spread into a Messages body, or {} when it must be omitted. Effort rides
// output_config.effort (NOT a top-level field, NOT thinking.budget_tokens — both 400 on Opus 4.7+) behind
// the effort-2025-11-24 beta header; adaptive thinking carries no budget. Omitted when no effort is threaded
// (keeps the pre-#31 body byte-identical) or the model can't take it. xhigh/max each clamp to high on models
// that reject them — the panel offers a level for every effort-aware Provider, so a cross-model pick must
// degrade rather than 400 (e.g. xhigh on Sonnet, max on Opus 4.5).
export const anthropicThinkingEffort = (model: string, effort?: EffortLevel): { thinking?: { type: 'adaptive' }; output_config?: { effort: EffortLevel } } => {
  if (!effort || !modelSupportsAnthropicEffort(model)) return {};
  let level: EffortLevel = effort;
  if (level === 'xhigh' && !modelSupportsAnthropicXHigh(model)) level = 'high';
  if (level === 'max' && !modelSupportsAnthropicMax(model)) level = 'high';
  return { thinking: { type: 'adaptive' }, output_config: { effort: level } };
};

// The effort levels the panel offers for a Provider. Mirrors the first-party Claude Code /effort slider:
// every effort-capable Claude shows the FULL low→max ladder regardless of model — the wire clamps to the
// model's ceiling (anthropicThinkingEffort), so an offered xhigh/max degrades, never 400s. Codex omits 'max'
// (its wire tops at xhigh; standardEffortToCodex folds a stray 'max'→xhigh). Grok is a Codex-twin on the
// Responses wire → same low→xhigh ladder (its per-model reasoning gate — build/composer none, 4.5 reasoning —
// lands in the client slice #94, not here). Only Codex, Anthropic, and Grok call this — every other Provider
// hides the select. Not model-gated: capability lives in the clamp, not here.
export const effortOptionsFor = (provider: Provider): EffortLevel[] =>
  isAnthropicProvider(provider)
    ? ['low', 'medium', 'high', 'xhigh', 'max']
    : isXaiProvider(provider)
      ? ['low', 'medium', 'high', 'xhigh']
      : ['low', 'medium', 'high', 'xhigh'];

export const buildAnthropicMessagesBody = (args: {
  model: string; messages: AnthropicMessage[]; maxTokens: number; version: string; stream?: boolean;
  tools?: AnthropicTool[]; toolChoice?: 'auto' | 'any'; effort?: EffortLevel;
}) => {
  const wispSystem = args.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const convo = args.messages.filter((m) => m.role !== 'system');
  const firstUserMessage = convo[0]?.content ?? '';
  const system = [
    { type: 'text' as const, text: anthropicAttribution(firstUserMessage, args.version) },
    ...(wispSystem ? [{ type: 'text' as const, text: wispSystem }] : []),
  ];
  const messages = convo.map((m) => {
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
    for (const tr of m.toolResults ?? []) blocks.push({ type: 'tool_result', tool_use_id: tr.callId, content: tr.content });
    // Images before the text — Anthropic's recommended ordering for vision turns.
    for (const img of images) blocks.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.dataBase64 } });
    if (m.content) blocks.push({ type: 'text', text: m.content });
    return { role: 'user' as const, content: blocks };
  });
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
// event (message_start, content_block_start/stop, ping, message_delta/stop) carry no answer text. A
// non-string text is skipped rather than coerced into the answer.
export const anthropicTextDelta = (ev: SseEvent): string =>
  ev.event === 'content_block_delta' && ev.data?.delta?.type === 'text_delta' && typeof ev.data.delta.text === 'string'
    ? ev.data.delta.text
    : '';

// Reduce a whole Messages SSE event run to its answer text — concatenate the text_delta fragments in order.
// An `error` event is a backend failure (throw its message) rather than partial text. anthropicStream
// yields the same per-event fragments live; this is the testable spec of that streaming semantics.
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
// name) and its arguments stream as content_block_delta(input_json_delta) partial_json fragments. Keyed by
// the content-block `index` (Anthropic's per-block key — Codex keys by item id instead). The toolu_ id is the
// round-trip id that becomes the matching tool_result's tool_use_id. Returned in first-seen order; a block
// that never announced a name is dropped (it can't be invoked). Reuses AssembledToolCall (id/name/argsJson)
// — a no-argument tool simply leaves argsJson '' (the consumer maps '' → {}).
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
// chat picker would show the neutral default. Windows are the model spec: the Opus and Sonnet 4.x family
// is a 1M context (standard, no beta), Haiku 4.5 is 200K; Opus tops 128K output, the rest 64K. vision is
// true (Claude is multimodal). ⚠️ These are the *model* maxes — the Claude.ai subscription Messages path
// the OAuth token rides may cap lower than 1M; advertised as a picker budgeting hint, so an oversized
// pack surfaces as a backend error (already handled) rather than being silently wrong.
// Return type pins maxOutput as ALWAYS present (every branch sets it) — #88's streaming path reads it as the
// request's max_tokens, a non-optional number, so the guarantee lives in the type rather than a caller fallback.
export const anthropicModelCaps = (model: string): ModelCaps & { maxOutput: number } => {
  const m = model.toLowerCase();
  if (m.includes('haiku')) return { contextInput: 200_000, maxOutput: 64_000, vision: true };
  if (m.includes('opus')) return { contextInput: 1_000_000, maxOutput: 128_000, vision: true };
  return { contextInput: 1_000_000, maxOutput: 64_000, vision: true }; // sonnet + default
};

// ----------------------------- PKCE + state (OAuth) ----------------------------- //

// base64url without padding — the form OAuth PKCE + the authorize URL expect.
export const base64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

// 32 random bytes as base64url (43 chars): the PKCE code_verifier and the CSRF state share this shape.
export const codeVerifier = (): string => base64url(randomBytes(32));
export const oauthState = (): string => base64url(randomBytes(32));

// The PKCE S256 code_challenge for a verifier: base64url(SHA-256(verifier)).
export const codeChallenge = async (verifier: string): Promise<string> =>
  base64url(Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

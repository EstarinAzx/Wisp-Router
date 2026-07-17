// ---------------- catalog.ts — Wisp: pure Provider-catalog data + resolvers ---------------- //

/*
 * Depends on: node crypto (PKCE/state generation only) — deliberately vscode-free, so the logic is
 *   unit-testable without the Extension Development Host. extension.ts feeds these the config/state values.
 *
 * Data shapes:
 *   - Provider: one OpenAI-chat-compatible backend = { id, label, baseUrl, defaultModel, apiKeyEnv }.
 *   - EditMessage: one chat message ({ role: 'system' | 'user', content }) in an Inquire edit request.
 */

import { randomBytes, webcrypto } from 'crypto';
import {
  type ModelCaps, type ModelsDevCatalog,
  type CodexEffort, type EffortLevel,
  type ToolSpec, type AssembledToolCall,
} from './shared';
import { isCodexProvider, codexReasoning, codexModelsFrom } from './codex';
import { isAnthropicProvider, anthropicModelsFrom } from './anthropic';
import { isXaiProvider, xaiModelsFrom } from './xai';

// Re-export the peeled modules so `./catalog`'s surface stays complete — sibling modules and the @wisp/core
// barrel keep importing these from here unchanged while the code now lives in the per-provider files
// shared.ts / codex.ts / anthropic.ts / xai.ts (the green-to-green peel).
export * from './shared';
export * from './codex';
export * from './anthropic';
export * from './xai';

// ----------------------------- Types ----------------------------- //

export type Provider = {
  id: string;            // stable id; also the key-slot + model-map suffix
  label: string;         // canonical vendor name (panel/UI, never the status bar)
  baseUrl: string;       // hardcoded OpenAI-compatible base URL ('' for Custom — comes from settings)
  defaultModel: string;  // native-format model id used when the Provider has none remembered
  apiKeyEnv: string;     // env-var fallback for the key ('' = none, e.g. local Ollama)
  catalogKey?: string;   // models.dev key for live context/vision; omitted -> table/default fallback
  // The id whose key slot + env this row borrows when it shares a credential with a sibling. Defaults to
  // the row's own id. Zen sets keyId='opencode-go' — same OpenCode account, one key, two endpoints.
  keyId?: string;
  // Provider kind. Absent == 'openai-chat' (every OpenAI-compatible row). 'codex'/'anthropic-oauth'/
  // 'xai-oauth' are the OAuth-backed subscription rows — the Inquire/key/usability paths branch on it.
  kind?: 'openai-chat' | 'codex' | 'anthropic-oauth' | 'xai-oauth';
  // Context/vision carry no per-row hints — both come from the ACTIVE model via models.dev (catalogKey).
};

// ----------------------------- Constants ----------------------------- //

// The one Provider whose base URL is user-supplied (machine-scoped wisp.baseUrl), not hardcoded.
export const CUSTOM_ID = 'custom';

// ----------------------------- Provider catalog data ----------------------------- //

// One Provider = one OpenAI-chat-compatible backend, reached by swapping {baseUrl, key, model} on the
// same `openai` SDK. Base URLs are HARDCODED here, never read from settings: choosing a Provider chooses
// where the bearer key is sent, so a workspace-overridable URL would be a key-redirect vector. Only
// Custom's URL comes from settings. Model ids are native form (no transform — re-adding Zen's `opencode/`
// prefix 401s the /go endpoint). Context/vision are read LIVE for the active model from models.dev (via
// catalogKey); fallback is a neutral default + the modelSupportsVision heuristic. ⚠ Rows marked
// best-effort had no key to verify — the panel's model picker is the correction path. Copilot/Cursor
// deliberately absent (ban risk / shape-incompatible — see the 2026-06-15 ADR + gotchas). Shared by both
// faces since #60.
export const PROVIDERS: Provider[] = [
  { id: 'opencode-go', label: 'OpenCode Go', baseUrl: 'https://opencode.ai/zen/go/v1', defaultModel: 'minimax-m3', apiKeyEnv: 'OPENCODE_API_KEY', catalogKey: 'opencode-go' },
  // OpenCode Zen = the premium /zen/v1 catalog (Claude/GPT/Gemini), distinct from Go's budget /zen/go/v1.
  // Bare model ids (no `opencode/` prefix). defaultModel ⚠ best-effort. catalogKey 'opencode'. keyId
  // 'opencode-go' borrows Go's stored key (same account) — else it stays hidden from the picker.
  { id: 'opencode-zen', label: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1', defaultModel: 'claude-haiku-4-5', apiKeyEnv: 'OPENCODE_API_KEY', catalogKey: 'opencode', keyId: 'opencode-go' },
  // Codex = subscription ChatGPT Codex backend (Responses API via OAuth, no key). kind:'codex' switches
  // off the OpenAI-chat path. No catalogKey; hidden from the native chat picker (keyless rows are).
  { id: 'codex', label: 'Codex', baseUrl: 'https://chatgpt.com/backend-api/codex', defaultModel: 'gpt-5.3-codex', apiKeyEnv: '', kind: 'codex' },
  // Anthropic = subscription Claude backend (Messages API via Claude.ai OAuth, no key). kind:'anthropic-
  // oauth' switches off the OpenAI-chat path, like Codex. baseUrl is api.anthropic.com (client appends
  // /v1/messages). No catalogKey; hidden from the chat picker until keyed.
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-opus-4-8', apiKeyEnv: '', kind: 'anthropic-oauth' },
  // Grok = subscription xAI backend (Responses API via xAI OAuth, no key) — a Codex-twin. kind:'xai-oauth'.
  // ⚠️ NOT the API-key Groq row (Llama): distinct id 'xai'. baseUrl is the subscription proxy (grok-build);
  // grok-4.5 overrides to api.x.ai in the client. No catalogKey; hidden from the chat picker until keyed.
  { id: 'xai', label: 'Grok', baseUrl: 'https://cli-chat-proxy.grok.com/v1', defaultModel: 'grok-build', apiKeyEnv: '', kind: 'xai-oauth' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', apiKeyEnv: 'OPENAI_API_KEY', catalogKey: 'openai' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', apiKeyEnv: 'GROQ_API_KEY', catalogKey: 'groq' },
  { id: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'codestral-latest', apiKeyEnv: 'MISTRAL_API_KEY', catalogKey: 'mistral' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini', apiKeyEnv: 'OPENROUTER_API_KEY', catalogKey: 'openrouter' },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', defaultModel: 'qwen2.5-coder' /* ⚠ best-effort: user must have pulled it */, apiKeyEnv: '' /* local → table/default */ },
  // ⚠ Ollama Cloud is `/v1`, NOT `/api/v1` (the `/api` prefix is Ollama's native protocol and breaks the OpenAI SDK — see gotchas.md).
  { id: 'ollama-cloud', label: 'Ollama Cloud', baseUrl: 'https://ollama.com/v1', defaultModel: 'gpt-oss:120b' /* verified 2026-06-16 */, apiKeyEnv: 'OLLAMA_API_KEY', catalogKey: 'ollama-cloud' },
  { id: 'kilocode', label: 'KiloCode', baseUrl: 'https://api.kilo.ai/api/gateway', defaultModel: 'anthropic/claude-3.5-sonnet' /* ⚠ best-effort: verify namespace via /models */, apiKeyEnv: 'KILOCODE_API_KEY', catalogKey: 'kilo' },
  { id: 'cline', label: 'Cline', baseUrl: 'https://api.cline.bot/api/v1', defaultModel: 'anthropic/claude-3.5-sonnet' /* ⚠ best-effort: verify via /models */, apiKeyEnv: 'CLINE_API_KEY' /* not in models.dev → table/default */ },
  // Custom: the always-works escape hatch — base URL + model are user-supplied (wisp.baseUrl + a typed
  // model, resolved at runtime by activeBaseUrl()). No env fallback; its key lives in wisp.apiKey.custom.
  { id: 'custom', label: 'Custom', baseUrl: '', defaultModel: '', apiKeyEnv: '' },
];

// ----------------------------- Resolvers ----------------------------- //

// Active model for a Provider: its remembered model else its native default. `||` not `??` on purpose —
// an empty-string memory degrades to the default, never wins.
export const resolveModel = (modelMap: Record<string, string>, provider: Provider): string =>
  modelMap[provider.id] || provider.defaultModel;

// Base URL for a Provider. Built-ins use their hardcoded catalog URL; only Custom resolves from the
// user-supplied value. That asymmetry is the key-redirect defense — a workspace can't redirect a built-in.
export const resolveBaseUrl = (provider: Provider, customBaseUrl: string): string =>
  provider.id === CUSTOM_ID ? customBaseUrl : provider.baseUrl;

// The id whose key slot + env a Provider's key resolves from — its own id unless it borrows a sibling's
// via keyId (Zen → opencode-go), so a shared credential is read/written in one place.
export const resolveKeyId = (provider: Provider): string => provider.keyId ?? provider.id;

// ----------------------------- Reply cleaners ----------------------------- //

// Reasoning models (e.g. minimax-m3) emit their chain-of-thought inline as a <think>…</think> block
// before the answer — strip it. An unterminated <think> means the budget ran out mid-thought → nothing.
export const stripThink = (text: string): string => {
  if (/<think>/i.test(text) && !/<\/think>/i.test(text)) return '';
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '');
};

// ----------------------------- Inline-edit prompt ----------------------------- //

// One chat message of an Inquire edit request. A union of two single-role object types (not one object
// with a `'system' | 'user'` role) so the array stays assignable to the OpenAI SDK's param type sans cast.
export type EditMessage = { role: 'system'; content: string } | { role: 'user'; content: string };

// Inquire's edit instructions: emit only SEARCH/REPLACE edit blocks. The model quotes the exact lines to
// change (SEARCH) + their replacement (REPLACE), never re-emitting untouched code — the whole-file-rewrite
// mangling/data-loss vector this format avoids.
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

// Build the messages array for an Inquire edit: fixed block-format rules + the work (language, whole-file
// context, instruction). Pure — the caller reads these off the editor, so this stays vscode-free.
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

// One targeted edit: the exact existing lines to find (search) and what to put in their place (replace;
// '' = a pure deletion).
export type EditBlock = { search: string; replace: string };

// The result of applying blocks: the new text (LF-normalized; caller rejoins with the document's own EOL)
// and the blocks whose search text was not located (surfaced to the user, never silently dropped).
export type EditPlan = { text: string; notFound: EditBlock[] };

// Aider-style block markers. Trailing newline before >>>>>>> is optional so an empty REPLACE body (a
// deletion) still parses.
const EDIT_BLOCK_RE = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n?>>>>>>> REPLACE/g;

// Parse a model reply into its edit blocks. Strips <think> first and normalizes CRLF→LF so markers match
// regardless of line endings. Surrounding prose or a ``` fence is ignored.
export const parseEditBlocks = (raw: string): EditBlock[] => {
  const text = stripThink(raw).replace(/\r\n/g, '\n');
  const blocks: EditBlock[] = [];
  for (const m of text.matchAll(EDIT_BLOCK_RE)) blocks.push({ search: m[1], replace: m[2] });
  return blocks;
};

// Apply blocks in order, each against the running result. Matching is EOL-agnostic (both sides LF) and
// locates the first occurrence. An empty or not-present search is recorded in notFound and skipped, so a
// bad block can never corrupt the file — the user reviews the rest via the diff.
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

// One line of B2's in-editor diff: kept (unchanged), added (new), or removed (old). The renderer walks an
// ordered op list to paint decorations and rebuild the buffer on accept/reject.
export type DiffOp =
  | { type: 'keep'; text: string }
  | { type: 'add'; text: string }
  | { type: 'remove'; text: string };

// Line-level diff between the original span and the model's rewrite, as an ordered keep/add/remove list.
// LCS-backtracked; each changed hunk emits its removes before its adds (unified-diff order). vscode-free.
// O(n·m) — spans are a selection or a single line, so the table is tiny.
export const diffLines = (before: string, after: string): DiffOp[] => {
  // Split EOL-agnostically: a CRLF buffer vs an LF model reply must compare equal line-for-line, else
  // every line mismatches on a trailing \r. Op text is \r-free; the caller rejoins with the doc's EOL.
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
// renders one row from. Structural (not the vscode type) so this stays unit-testable; shapes match.
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

// Substrings of known multimodal model families. Vision is a per-MODEL trait, but a Provider serves many
// models, so detect it from the active model id, not the row (Zen-serving-Claude lights up vision too).
// Conservative — only families that broadly accept image input, so we never send images a backend 400s.
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

// Deliberately NO context-window guess table: context comes from models.dev or the neutral DEFAULT_MAX_*
// constants. A wrong window is just a wrong budget; a guessed vision flag would send images a backend
// rejects, so vision keeps its fallback heuristic but context does not.

// Build the descriptors Wisp advertises into VS Code's native model picker: one row per USABLE Provider.
// Usable = has a key AND a resolvable model AND (Custom only) a base URL — else it stays hidden rather
// than appearing as a dead pick. `caps` (optional) is the dynamic models.dev lookup; each field resolves
// dynamic -> table -> default, so a missing/slow/failed fetch silently degrades to the hardcoded behaviour.
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
    // Context: dynamic caps else the neutral default. contextInput is the TOTAL window; VS Code's
    // "Context Size" column SUMS maxInput+maxOutput, so decompose — reserve output (capped at half the
    // window so an anomalous "output == context" can't zero the input), leave the rest for input.
    const dyn = state.caps?.(p, model);
    const totalContext = dyn?.contextInput ?? DEFAULT_MAX_INPUT_TOKENS;
    const outputBudget = dyn?.maxOutput ?? DEFAULT_MAX_OUTPUT_TOKENS;
    const maxOutputTokens = Math.min(outputBudget, Math.max(1, Math.floor(totalContext / 2)));
    const maxInputTokens = Math.max(totalContext - maxOutputTokens, 1);
    // Codex rows mirror the active Effort in the label (· medium) — but only when the caller threads one
    // (the in-VS-Code picker does; the Bridge doors don't — their effort is per-request, so a static
    // label would show DEFAULT_EFFORT forever). codexReasoning gates so an inert row never claims a depth.
    const depth = isCodexProvider(p) && state.effort && codexReasoning(model) ? ` · ${state.effort}` : '';
    return [{
      id: p.id,
      name: `${p.label} — ${model}${depth}`,
      family: p.id,
      version: '1',
      maxInputTokens,
      maxOutputTokens,
      // Tool calling advertised for EVERY row — VS Code hides non-tool models from the picker entirely,
      // and it's honest (OpenAI rows forward tools via the chat client, Codex via strict Responses tools).
      // imageInput from models.dev's modalities (Codex: codexModelCaps), else the id heuristic.
      capabilities: { toolCalling: true, ...((dyn?.vision ?? modelSupportsVision(model)) ? { imageInput: true } : {}) },
    }];
  });

// ----------------------------- Tool calling (chat surface) ----------------------------- //

// vscode-free mirrors of the tool-calling shapes, so the message/tool/stream plumbing stays unit-
// testable. chatProvider.ts extracts the vscode parts into these plain forms and feeds them here.

// The OpenAI function-tool form a ToolSpec (see shared.ts) maps to.
export type OAToolDef = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };

// Map VS Code tool defs to OpenAI function tools. A no-arg tool gets a valid object schema, not bare {}:
// strict backends (DeepSeek via opencode-go) 400 on a typeless schema. Mirrors the Codex/Anthropic builders.
export const toOpenAiTools = (tools: ToolSpec[]): OAToolDef[] =>
  tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} } },
  }));

// One chat turn flattened to plain data: text, tool calls (assistant turns), tool results (user turns),
// attached images (user turns). chatProvider.ts builds these from the vscode parts; images is optional.
export type NormalizedTurn = {
  role: 'user' | 'assistant';
  text: string;
  toolCalls: { id: string; name: string; argsJson: string }[];
  // isError carries Anthropic's tool_result.is_error flag (a failed tool call) through the Anthropic door;
  // the OpenAI door has no equivalent field and leaves it unread.
  toolResults: { callId: string; content: string; isError?: boolean }[];
  images?: { mimeType: string; dataBase64: string }[];
};

// One OpenAI message-content part for a multimodal (vision) user message.
type OAContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

// One OpenAI chat message. A user message is a plain string unless it has images, then a multimodal
// content array. Assistant turns may carry tool_calls; a tool result is its own 'tool' message keyed by
// the call id. Hand-rolled — structurally the SDK's param.
export type OAChatMessage =
  | { role: 'user'; content: string | OAContentPart[] }
  | { role: 'assistant'; content: string; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };

// Flatten normalized turns into the OpenAI message sequence. A user turn's tool results expand into
// standalone 'tool' messages (before any user text, so the assistant(tool_calls)→tool order holds); a
// user turn with only tool results yields no empty user message. An image-bearing turn becomes a
// multimodal content array (text part + image_url data URIs).
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

// OpenAI streams a tool call across chunks: id + name on the first delta for an index, arguments as
// fragments on later deltas. Folds into the shared AssembledToolCall once the stream completes.
export type ToolCallDelta = { index: number; id?: string; name?: string; args?: string };

// Reassemble streamed tool-call deltas into whole calls. Keyed by stream index so parallel calls stay
// separate; id/name from whichever fragment carries them, argument fragments concatenated in arrival
// order. Returned in first-seen index order.
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

// One OpenAI chat-completions SSE block → its answer text. Chat streams are data-only SSE (no event:
// line): normally one JSON chunk per block with the text under choices[0].delta.content (message.content
// covers a pseudo-streamed whole completion). '' for role chunks, keep-alives, [DONE], malformed JSON.
// ponytail: mid-stream `data: {"error":…}` frames on a 200 read as '' — surface them if a real compat
// backend is seen emitting one.
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
  // SSE allows one payload split across data: lines — try the joined parse first. A CRLF-framed backend
  // never splits in sseBlocks (\n\n only), so its whole stream lands here as ONE block of many complete
  // chunks: the joined parse fails, and the per-line fallback recovers every delta in order.
  const joined = parseOne(payloads.join('\n'));
  return joined || payloads.map(parseOne).join('');
};

// ----------------------------- Migration ----------------------------- //

// What the one-time pre-catalog migration should do, given storage state. null = no-op. goKeyPresent is
// the idempotency guard: once migrated the go slot exists, so every later activate plans nothing. The
// target is the go slot (not zen): the pre-catalog key predates the split, when the sole Provider was the
// /zen/go/v1 endpoint, so it is provably a Go key. The caller performs the plan.
export const planLegacyMigration = (
  state: { goKeyPresent: boolean; legacyKey?: string; legacyModel?: string },
): { storeGoKey: string; setModel?: string } | null => {
  if (state.goKeyPresent || !state.legacyKey) return null;
  return { storeGoKey: state.legacyKey, ...(state.legacyModel ? { setModel: state.legacyModel } : {}) };
};

// The one-time Zen→Go slot migration when the misnamed `opencode-zen` row is renamed to `opencode-go`.
// The old `opencode-zen` slot held a GO key (that row pointed at /zen/go/v1). Move it to the go slot,
// carry the model, and CLEAR the zen slot — else the genuinely-new `opencode-zen` row (/zen/v1) inherits
// the Go key and 401s. goKeyPresent is the idempotency guard (mirrors planLegacyMigration).
export const planZenToGoMigration = (
  state: { goKeyPresent: boolean; zenSlotKey?: string; zenSlotModel?: string },
): { storeGoKey: string; setModel?: string; clearZenSlot: true } | null => {
  if (state.goKeyPresent || !state.zenSlotKey) return null;
  return { storeGoKey: state.zenSlotKey, ...(state.zenSlotModel ? { setModel: state.zenSlotModel } : {}), clearZenSlot: true };
};

// ----------------------------- Provider dispatchers ----------------------------- //

// One rule for "which curated list backs an OAuth Provider" — shared by the Active-Provider panel state
// and the per-row Routing-map lists. Keyed kinds answer undefined: they have a live /models route instead.
export const oauthModelOptions = (p: Provider, catalog?: ModelsDevCatalog): string[] | undefined =>
  isCodexProvider(p) ? codexModelsFrom(catalog)
    : isAnthropicProvider(p) ? anthropicModelsFrom(catalog)
    : isXaiProvider(p) ? xaiModelsFrom(catalog)
    : undefined;

// The effort levels the panel offers for a Provider. Mirrors the first-party /effort slider: every
// effort-capable Claude shows the FULL low→max ladder — the wire clamps to the model's ceiling
// (anthropicThinkingEffort), so an offered xhigh/max degrades, never 400s. Codex omits 'max' (its wire
// tops at xhigh). Grok is a Codex-twin → same low→xhigh ladder. Only Codex/Anthropic/Grok call this.
// A dispatcher (sits above the providers, like oauthModelOptions) — stays in catalog through the peel.
export const effortOptionsFor = (provider: Provider): EffortLevel[] =>
  isAnthropicProvider(provider)
    ? ['low', 'medium', 'high', 'xhigh', 'max']
    : isXaiProvider(provider)
      ? ['low', 'medium', 'high', 'xhigh']
      : ['low', 'medium', 'high', 'xhigh'];

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

// ---------------- catalog.ts — Wisp: pure Provider-catalog data + resolvers ---------------- //

/*
 * Depends on: node crypto (PKCE/state generation only) — deliberately vscode-free, so the logic is
 *   unit-testable without the Extension Development Host. extension.ts feeds these the config/state values.
 *
 * Data shapes:
 *   - Provider: one OpenAI-chat-compatible backend = { id, label, baseUrl, defaultModel, apiKeyEnv }.
 *   - EditMessage: one chat message ({ role: 'system' | 'user', content }) in an Inquire edit request.
 */

import { randomBytes, webcrypto, createHash } from 'crypto';
import {
  standardEffortToCodex, DEFAULT_EFFORT, sortByReleaseDesc,
  type ModelCaps, type ModelsDevCatalog,
  type CodexEffort, type CodexReasoning, type EffortLevel,
  type CodexResponsesEvent, type SseEvent, type ToolSpec, type AssembledToolCall,
} from './shared';

// Re-export the kernel so `./catalog`'s surface stays complete — sibling modules and the @wisp/core barrel
// keep importing these from here unchanged while the code now lives in shared.ts (the green-to-green peel).
export * from './shared';

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
  toolResults: { callId: string; content: string }[];
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

// The Messages message_delta stop_reason that means the reply was CUT SHORT — budget spent (max_tokens),
// blocked (content_filter), or declined (refusal). The Anthropic analogue of responsesIncompleteReason,
// but it rides a live terminal frame, not a payload field. A clean close / unknown / undefined → undefined.
export const anthropicTruncationReason = (stopReason: string | undefined): string | undefined =>
  stopReason === 'max_tokens' || stopReason === 'content_filter' || stopReason === 'refusal' ? stopReason : undefined;

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

// A trimmed non-empty string, else undefined — so blank/null/non-string fields don't become "present".
const trimmedString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

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
// carries no JWT exp (xAI returns expires_in), so the deadline is stored as an absolute epoch-ms
// expiresAt. tokenEndpoint caches the once-discovered OIDC token endpoint (D7) so a refresh needn't
// re-run discovery. The impure xaiAuth.ts owns the OAuth/IO.
export type XaiCreds = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;     // epoch ms; absent when the token response carried no expires_in
  tokenEndpoint?: string; // discovered OIDC token endpoint, cached across refreshes (D7)
};

// Whether a catalog row is the Grok backend. Absent kind == 'openai-chat', so false for the API-key rows —
// including the Groq row Grok must never be confused with — and Codex/Anthropic.
export const isXaiProvider = (provider: Provider): boolean => provider.kind === 'xai-oauth';

// Grok is "usable when signed in" — no API key, so usability is a bearer access token. The `{}` sign-out
// tombstone and a refresh-only blob both read as signed-out.
export const isXaiSignedIn = (creds: XaiCreds | undefined): boolean =>
  !!creds && !!creds.accessToken;

// Turn an xAI OAuth token response into XaiCreds. expires_in (seconds, relative) becomes an absolute
// expiresAt against the injected clock — `now` is a parameter so this stays pure.
export const tokensToXaiCreds = (
  payload: { access_token?: string; refresh_token?: string; expires_in?: number },
  now: number,
): XaiCreds => ({
  ...(payload.access_token ? { accessToken: payload.access_token } : {}),
  ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
  ...(typeof payload.expires_in === 'number' ? { expiresAt: now + payload.expires_in * 1000 } : {}),
});

// Refresh 2 minutes BEFORE expiry (xAI's skew — tighter than Anthropic's 5min). No expiresAt → false:
// can't prove staleness. The skew lives HERE at the check (the twin pattern), not baked into expiresAt —
// so it is applied exactly once.
const XAI_TOKEN_REFRESH_SKEW_MS = 2 * 60_000;
export const shouldRefreshXaiToken = (creds: { expiresAt?: number }, now: number): boolean =>
  creds.expiresAt !== undefined && creds.expiresAt <= now + XAI_TOKEN_REFRESH_SKEW_MS;

// Parse a stored auth.json slice into XaiCreds. An absent/empty/corrupt slot reads as undefined; the `{}`
// tombstone parses to an empty object (isXaiSignedIn then reads signed-out).
export const parseXaiCreds = (raw: string | undefined): XaiCreds | undefined => {
  if (!raw) return undefined;
  try { return JSON.parse(raw) as XaiCreds; } catch { return undefined; }
};

// Curated Grok model ids — the OFFLINE FALLBACK for xaiModelsFrom and the OAuth-only lineup. The xai row's
// defaultModel (grok-build) must stay a member.
export const XAI_MODELS: string[] = ['grok-build', 'grok-composer-2.5-fast', 'grok-4.5'];

// Live Grok dropdown ids from models.dev — undated aliases only. No family whitelist: a brand-new Grok id
// must appear, never be filtered out. Catalog absent/filter-empty → curated fallback.
export const xaiModelsFrom = (catalog?: ModelsDevCatalog): string[] => {
  const models = catalog?.xai?.models;
  if (!models) return XAI_MODELS;
  const ids = Object.keys(models).filter((id) => !/-\d{8}$/.test(id));
  return ids.length ? sortByReleaseDesc(models, ids) : XAI_MODELS;
};

// Real Grok model windows — the OAuth path has no models.dev catalogKey, so without this the picker shows
// the neutral default. grok-build (512K/30K) + grok-composer (200K/30K) route the proxy; grok-4.5 is
// 500K/131K reasoning on api.x.ai. maxOutput is pinned present so the client slice reads it as max_tokens
// without a fallback — mirrors anthropicModelCaps.
export const xaiModelCaps = (model: string): ModelCaps & { maxOutput: number } => {
  const m = model.toLowerCase();
  if (m.includes('composer')) return { contextInput: 200_000, maxOutput: 30_000 };
  if (/grok-[4-9]/.test(m)) return { contextInput: 500_000, maxOutput: 131_000 }; // grok-4.5+ reasoning family
  return { contextInput: 512_000, maxOutput: 30_000 }; // grok-build (default)
};

// Grok CLI's expires_at is an absolute deadline — epoch SECONDS in some builds, MS in others. Normalize to
// ms by magnitude (~1e9 s vs ~1e12 ms); a wrong guess only forces one self-healing refresh.
const grokExpiresAtMs = (raw: unknown): number | undefined =>
  typeof raw === 'number' && isFinite(raw) ? (raw < 1e12 ? raw * 1000 : raw) : undefined;

// Import an existing Grok CLI login (~/.grok/auth.json) so a CLI user isn't forced to sign in again (D6 —
// parity with parseCodexAuthJson). The CLI nests the bundle under an "https://auth.x.ai::<client_id>" key
// ({ key, refresh_token, expires_at }); a flatter legacy shape stores it at the root. `key` is the bearer.
// undefined when there is no usable bearer — never throws.
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

// A discovered OIDC endpoint is trusted only when its host is x.ai (or a subdomain) — the leading-dot
// guard blocks look-alikes (evilx.ai, x.ai.evil.com); anything unparseable is rejected. Both endpoints
// from the well-known doc pass through this before the bearer is ever sent (D7 security check).
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
// public api.x.ai.
export const xaiResponsesUrl = (baseUrl: string, model: string): string =>
  isGrokCliProxyModel(model) ? `${baseUrl}/responses` : XAI_PUBLIC_RESPONSES_URL;

// Request headers. Bearer always; proxy models add the x-grok-* CLI-identifying set the subscription proxy
// validates. x-grok-conv-id keys the proxy's cache — one per stream.
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

// Sanitize a RAW external Responses payload for xAI — the path where the Bridge forwards a client's
// payload verbatim, NOT our own buildCodexResponsesBody output. xAI 400s on three OpenAI-Responses quirks:
// prompt_cache_retention (unsupported), the reasoning.encrypted_content `include` entry on the proxy, and
// the 'minimal' effort level (fold to 'low'). Pure; returns a new object.
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

// One rule for "which curated list backs an OAuth Provider" — shared by the Active-Provider panel state
// and the per-row Routing-map lists. Keyed kinds answer undefined: they have a live /models route instead.
export const oauthModelOptions = (p: Provider, catalog?: ModelsDevCatalog): string[] | undefined =>
  isCodexProvider(p) ? codexModelsFrom(catalog)
    : isAnthropicProvider(p) ? anthropicModelsFrom(catalog)
    : isXaiProvider(p) ? xaiModelsFrom(catalog)
    : undefined;

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

// One conversation message for the Messages backend. Inquire sends system+user; native chat sends
// user/assistant. The Messages API carries the system prompt top-level (not as a role), so a 'system'
// entry here is lifted out by the body builder. Agent mode also carries a turn's tool round-trip:
// toolCalls on an assistant turn, toolResults on a user turn — expanded to content blocks below.
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

// Translate a conversation into an Anthropic Messages request body. The system text moves to the top-level
// `system` block array, led by the Claude Code attribution block (its fingerprint derived from the first
// user turn's TEXT — so it MUST stay sourced from `content`). A turn with tool calls/results expands to a
// content BLOCK array (assistant: text then tool_use; user: tool_result FIRST then text); a plain turn
// stays a bare string. An empty text block is never emitted. tools ride only when non-empty.
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

// The effort levels the panel offers for a Provider. Mirrors the first-party /effort slider: every
// effort-capable Claude shows the FULL low→max ladder — the wire clamps to the model's ceiling
// (anthropicThinkingEffort), so an offered xhigh/max degrades, never 400s. Codex omits 'max' (its wire
// tops at xhigh). Grok is a Codex-twin → same low→xhigh ladder. Only Codex/Anthropic/Grok call this.
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

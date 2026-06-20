// ---------------- catalog.ts — Wisp: pure Provider-catalog data + resolvers ---------------- //

/*
 * Depends on: nothing — this module is deliberately vscode-free so its logic is unit-testable
 *   without the Extension Development Host. extension.ts imports these and feeds them the values it
 *   reads from the VS Code config/state; the thin wrappers there stay behaviour-identical.
 *
 * Data shapes:
 *   - Provider: one OpenAI-chat-compatible backend = { id, label, baseUrl, defaultModel, apiKeyEnv }.
 *     id doubles as the SecretStorage key-slot and the per-Provider model-map suffix.
 *   - EditMessage: one chat message ({ role: 'system' | 'user', content }) in an Inquire edit request.
 */

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
  // Provider kind: 'openai-chat' (the default — every OpenAI-compatible chat row) or 'codex' (the
  // subscription-backed Codex Responses backend, reached by ChatGPT OAuth, not an API key). Absent ==
  // 'openai-chat', so the ten existing rows need no edit; the Inquire/key/usability paths branch on it.
  kind?: 'openai-chat' | 'codex';
  // Note: context/vision carry no per-row hints — both come from the ACTIVE model via models.dev
  // (catalogKey), else context = neutral default and vision = the modelSupportsVision heuristic.
};

// ----------------------------- Constants ----------------------------- //

// The Custom Provider's id — the one Provider whose base URL is user-supplied (machine-scoped
// wisp.baseUrl) rather than hardcoded in the catalog.
export const CUSTOM_ID = 'custom';

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
type ModelsDevEntry = { limit?: { context?: number; output?: number }; modalities?: { input?: string[] } };
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
    // Codex reasoning rows mirror the active Effort in the picker label (· medium). Reuse codexReasoning's
    // gate so an inert spark/gpt-4.x row never claims a depth; non-Codex rows never get a suffix.
    const depth = isCodexProvider(p) && codexReasoning(model) ? ` · ${state.effort ?? DEFAULT_EFFORT}` : '';
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

// Map VS Code tool defs to OpenAI function tools — inputSchema becomes the function parameters
// (empty object when a tool takes no input, which the OpenAI API still requires as a present field).
export const toOpenAiTools = (tools: ToolSpec[]): OAToolDef[] =>
  tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: (t.inputSchema as Record<string, unknown>) ?? {} },
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
export type CodexResponsesTool = { type: 'function'; name: string; description: string; parameters: Record<string, unknown>; strict: true };

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

// Map VS Code tool defs to strict Responses function tools. A tool with no schema gets an empty closed
// object ({} forced to a strict object), so the API still sees a valid (and strict) parameters field.
export const toCodexResponsesTools = (tools: ToolSpec[]): CodexResponsesTool[] =>
  tools.map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: enforceStrictResponsesSchema(t.inputSchema ?? { type: 'object', properties: {} }),
    strict: true,
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

// Curated Codex model ids for the panel dropdown — the Codex backend has no /models route, so this
// mirrors the Codex CLI's known lineup. The codex row's defaultModel must stay a member of this list.
export const CODEX_MODELS: string[] = [
  'gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-5.3-codex-spark',
  'gpt-5.2-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini', 'gpt-5.4-mini', 'o3', 'o4-mini',
];

// ----------------------------- Codex Responses reply ----------------------------- //

// One parsed Server-Sent Event off the Codex Responses stream: the SSE `event:` name and its `data:` JSON.
export type CodexResponsesEvent = { event: string; data: any };

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

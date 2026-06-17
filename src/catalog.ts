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

// Build the descriptors Wisp advertises into VS Code's native model picker: one row per Provider that
// is actually usable. Usable = has a key AND a resolvable model AND (for Custom only) a base URL — a
// keyless / URL-less / model-less Provider can't serve a request, so it stays hidden rather than
// appearing as a dead pick. id is the Provider id (the response glue maps it back to {baseUrl,key}).
export const buildChatModelInfos = (
  providers: Provider[],
  state: { keyed: Record<string, boolean>; modelMap: Record<string, string>; customBaseUrl: string },
): ChatModelInfo[] =>
  providers.flatMap((p) => {
    const model = resolveModel(state.modelMap, p);
    // Custom has no hardcoded URL — without wisp.baseUrl there is nowhere to send the request.
    const reachable = p.id !== CUSTOM_ID || state.customBaseUrl.trim() !== '';
    if (!state.keyed[p.id] || !model || !reachable) return [];
    return [{
      id: p.id,
      name: `${p.label} — ${model}`,
      family: p.id,
      version: '1',
      maxInputTokens: DEFAULT_MAX_INPUT_TOKENS,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      // Advertise tool calling so the model is selectable in agent/edit/Ctrl+I — those pickers hide
      // models that don't declare it. The response glue forwards the tools and emits tool-call parts.
      capabilities: { toolCalling: true },
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

// One chat turn flattened to plain data: its text, any tool calls it made (assistant turns), and any
// tool results it carries (user turns). chatProvider.ts builds these from the vscode message parts.
export type NormalizedTurn = {
  role: 'user' | 'assistant';
  text: string;
  toolCalls: { id: string; name: string; argsJson: string }[];
  toolResults: { callId: string; content: string }[];
};

// One OpenAI chat message. Assistant turns may carry tool_calls; a tool result is its own 'tool'
// message keyed by the call id. Hand-rolled (catalog imports nothing) — structurally the SDK's param.
export type OAChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };

// Flatten the normalized turns into the OpenAI message sequence. A user turn's tool results expand into
// standalone 'tool' messages (emitted before any user text so the assistant(tool_calls)→tool ordering
// the API requires is preserved); a user turn with only tool results yields no empty user message.
export const buildOpenAiChatMessages = (turns: NormalizedTurn[]): OAChatMessage[] =>
  turns.flatMap((turn) => {
    if (turn.role === 'assistant') {
      const calls = turn.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.argsJson } }));
      return [calls.length
        ? { role: 'assistant' as const, content: turn.text, tool_calls: calls }
        : { role: 'assistant' as const, content: turn.text }];
    }
    const toolMsgs: OAChatMessage[] = turn.toolResults.map((r) => ({ role: 'tool', tool_call_id: r.callId, content: r.content }));
    // A bare tool-result turn carries no user prose, so don't emit an empty user message for it.
    if (turn.toolResults.length && !turn.text) return toolMsgs;
    return [...toolMsgs, { role: 'user' as const, content: turn.text }];
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
// null = no-op. The zen-slot-present check is the idempotency guard: once migrated the zen slot
// exists, so every later activate plans nothing and the legacy key can never be lost or double-copied.
// The caller performs the plan (store the zen key, optionally record the model, delete the legacy slot).
export const planLegacyMigration = (
  state: { zenKeyPresent: boolean; legacyKey?: string; legacyModel?: string },
): { storeZenKey: string; setModel?: string } | null => {
  if (state.zenKeyPresent || !state.legacyKey) return null;
  return { storeZenKey: state.legacyKey, ...(state.legacyModel ? { setModel: state.legacyModel } : {}) };
};

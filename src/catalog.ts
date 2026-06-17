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

// Strip a wrapping ``` fence if the model added one despite instructions.
export const stripFences = (text: string): string => {
  const m = text.match(/^```[\w-]*\r?\n([\s\S]*?)\r?\n?```$/);
  return m ? m[1] : text;
};

// An Inquire edit reply cleaned down to the bare replacement code: drop the reasoning block, then
// unwrap any markdown fence. The order matters — a fenced answer can sit after a <think> block.
export const extractEditText = (raw: string): string => stripFences(stripThink(raw));

// ----------------------------- Inline-edit prompt ----------------------------- //

// One chat message of an Inquire edit request. A union of two single-role object types (not one
// object with a `'system' | 'user'` role) so the array stays assignable to the OpenAI SDK's
// ChatCompletionMessageParam[] without a cast.
export type EditMessage = { role: 'system'; content: string } | { role: 'user'; content: string };

// Inquire's edit instructions: rewrite the targeted span and return ONLY the replacement code.
// Replace-the-whole-span (not insert) is what lets one edit both add and delete lines.
const EDIT_SYSTEM_PROMPT =
  'You are a code-editing assistant inside a code editor. ' +
  'You are given the full file for context, a target span the user wants changed, and a ' +
  'natural-language instruction. Rewrite the target span to satisfy the instruction. ' +
  'Return ONLY the rewritten code for that span — it replaces the span entirely, so you may add ' +
  'or remove lines. No explanation, no prose, no markdown fences. ' +
  'Match the file’s existing indentation and style. If no change is needed, return the span unchanged.';

// Build the messages array for an Inquire edit: the fixed edit rules plus the work (language,
// whole-file context, the span to rewrite, and the instruction). Pure — the caller reads these
// values off the VS Code editor and feeds them in, so this stays vscode-free and unit-testable.
export const buildEditPrompt = (args: {
  selectionText: string;
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
      `Target span to rewrite:\n${args.selectionText}\n\n` +
      `Instruction:\n${args.instruction}`,
  },
];

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

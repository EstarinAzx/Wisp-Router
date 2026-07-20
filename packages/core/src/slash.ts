// ------------- slash.ts — TUI slash palette: command parsing + suggestion pures ------------- //

/*
 * Depends on: nothing — pure string logic (#60).
 *
 * Data shapes:
 *   - SlashCommandDef: one palette entry — name (no leading slash), optional args hint,
 *     one-line description shown in the autocomplete list.
 *   - ParsedSlash: a submitted input line split into command + whitespace-separated args.
 */

// ----------------------------- Types ----------------------------- //

export type SlashCommandDef = { name: string; args?: string; description: string };

export type ParsedSlash = { command: string; args: string[] };

// ----------------------------- The palette ----------------------------- //

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { name: 'providers', description: 'List the Provider catalog and set the Active Provider' },
  { name: 'key', args: '[provider]', description: "Set an API-key Provider's key" },
  { name: 'model', args: '[provider]', description: "Pick a Provider's model" },
  { name: 'routing', description: 'Edit the Routing map (Family routes + Aliases)' },
  { name: 'signin', args: '[codex|anthropic|xai]', description: 'Sign in to Codex (ChatGPT), Anthropic (Claude.ai), or Grok (xAI) via the browser' },
  { name: 'signout', args: '[codex|anthropic|xai]', description: 'Sign out of Codex, Anthropic, or Grok' },
  { name: 'effort', args: '[level]', description: 'Set the shared reasoning Effort (Codex + Anthropic)' },
  { name: 'test', args: '<provider|alias>', description: 'Fire one canned prompt through a Provider or Alias' },
  { name: 'bridge', args: '[off]', description: 'Show the Bridge (starts it if stopped) — /bridge off is the only stop' },
  { name: 'show-log', description: "Show the Bridge's log (collects while the Bridge runs, even closed)" },
  { name: 'aliasonly', args: '[on|off]', description: "Claude Code's /model list shows only Aliases (hides Provider rows)" },
  { name: 'modelids', args: '[on|off]', description: "Alias rows in Claude Code's /model list carry their pinned model id" },
  { name: 'help', description: 'List every command with its arguments' },
  { name: 'quit', description: 'Exit the TUI' },
];

// ----------------------------- Parse + suggest ----------------------------- //

// Submitted line → command + args, or undefined when it isn't a slash command at all.
// Command lowercased (palette names are canonical); args untouched — keys are case-sensitive.
export const parseSlash = (input: string): ParsedSlash | undefined => {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return undefined;
  const [head, ...args] = trimmed.slice(1).split(/\s+/);
  if (!head) return undefined;
  return { command: head.toLowerCase(), args };
};

// Live input → palette entries to offer. Open only while the command word is still being
// typed — any whitespace after it means args have begun and the palette closes.
export const suggestSlash = (input: string, commands: SlashCommandDef[] = SLASH_COMMANDS): SlashCommandDef[] => {
  if (!input.startsWith('/') || /\s/.test(input.trim())) return [];
  const prefix = input.slice(1).toLowerCase();
  return commands.filter((c) => c.name.startsWith(prefix));
};

// Tab fill of the highlighted suggestion (#128). Returns the string to put in the input, or
// undefined when there is nothing to complete (empty list → Tab is inert). Trailing space only
// when the command declares args, so the cursor lands in the args position. Never runs anything.
export const completeSlash = (
  input: string,
  highlight: number,
  commands: SlashCommandDef[] = SLASH_COMMANDS,
): string | undefined => {
  const open = suggestSlash(input, commands);
  if (open.length === 0) return undefined;
  const pick = open[Math.min(Math.max(highlight, 0), open.length - 1)];
  return `/${pick.name}${pick.args ? ' ' : ''}`;
};

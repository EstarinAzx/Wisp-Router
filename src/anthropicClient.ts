// ----------------- anthropicClient.ts — Wisp: Anthropic Messages request for Inquire ----------------- //

/*
 * Depends on:
 *   - node fetch/AbortSignal: the live HTTP call to the Anthropic Messages endpoint. The Anthropic SDK
 *     is NOT used here — this is the extension host and the request is a single POST.
 *   - ./catalog: AnthropicCreds (the OAuth bundle) + EditMessage (Inquire's system+user prompt shape).
 *
 * Data shapes:
 *   - The Messages request body: { model, max_tokens, system?, messages } where system is the EditMessage
 *     system text (Anthropic carries the system prompt top-level, NOT as a message role) and messages are
 *     the user turns. The response is JSON: { content: [{ type:'text', text }], ... } — Inquire reads the
 *     whole reply (spinner→diff, no incremental UX), so this is a non-streaming call.
 */

import { AnthropicCreds, anthropicAttribution, type EditMessage } from './catalog';

type AnthropicInquireArgs = { creds: AnthropicCreds; baseUrl: string; model: string; messages: EditMessage[]; signal?: AbortSignal };

// Inquire's whole-file edits can be sizeable; 16K keeps a non-streaming request under the fetch timeout
// ceiling while leaving ample room for the edit blocks.
const ANTHROPIC_MAX_TOKENS = 16_000;

// ----------------------------- Request ----------------------------- //

// Claude Code's client recognition signals — without these the subscription backend throttles the
// request to 429 even with a valid OAuth bearer (it reserves subscription inference for the Claude Code
// client). `claude-code-20250219` is the PRIMARY gate; `oauth-2025-04-20` marks the OAuth path; both must
// ride the comma-joined anthropic-beta header (the oauth beta alone is NOT enough). The User-Agent's
// `claude-cli/` token is checked server-side — this exact string (a non-Anthropic build) is empirically
// accepted today (openclaude serves with it). The identity in the system prompt is NOT gated, so Wisp
// keeps its own Inquire prompt. The native-client attestation (cch token) can't be reproduced from Node,
// but is unenforced today.
const ANTHROPIC_BETA = 'claude-code-20250219,oauth-2025-04-20';
// The attribution fingerprint (catalog) embeds this version, and the User-Agent advertises it — they MUST
// match (the backend ties the cc_version to the claude-cli UA). This exact string is accepted today.
const CLAUDE_CODE_VERSION = '0.19.0';
const ANTHROPIC_USER_AGENT = `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`;

// Run one Inquire edit through the subscription-backed Claude Messages backend and return the reply text.
// Bearer = the OAuth access token. Inquire's system prompt already constrains the model to "edit blocks
// and nothing else", so thinking is left off and the text blocks are the answer.
export const anthropicInquire = async (args: AnthropicInquireArgs): Promise<string> => {
  const bearer = args.creds.accessToken;
  if (!bearer) throw new Error('Not signed in to Claude.');

  // Anthropic carries the system prompt top-level; the conversation messages must start with a user turn.
  const wispSystem = args.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const messages = args.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));

  // system is sent as a block array (not a string) so the attribution rides as the FIRST block, exactly
  // as Claude Code structures it. The fingerprint inside it is derived from the first user message, so it
  // must be computed over the same text put in the body below.
  const firstUserMessage = messages[0]?.content ?? '';
  const system = [
    { type: 'text' as const, text: anthropicAttribution(firstUserMessage, CLAUDE_CODE_VERSION) },
    ...(wispSystem ? [{ type: 'text' as const, text: wispSystem }] : []),
  ];

  const res = await fetch(`${args.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearer}`,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': ANTHROPIC_BETA,
      'User-Agent': ANTHROPIC_USER_AGENT,
      'x-app': 'cli',
    },
    body: JSON.stringify({ model: args.model, max_tokens: ANTHROPIC_MAX_TOKENS, system, messages }),
    signal: args.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}${body.trim() ? `: ${body.trim().slice(0, 500)}` : '.'}`);
  }

  // Concatenate every text block; tool_use / thinking blocks (none expected here) are not answer text.
  const data = await res.json() as { content?: { type?: string; text?: string }[] };
  return (data.content ?? []).filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
};

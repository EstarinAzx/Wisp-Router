// ---------------- testScreen.tsx — the /test flow: the canned wiring check + its streaming Screen ---------------- //

/*
 * Depends on:
 *   - @wisp/core: base-url/key resolvers, the three OAuth stream clients, and the SSE helpers
 *     the keyed-Provider path parses with.
 *   - ./store: the shared ~/.wisp handle + OAuth managers — each stream kind's credentials.
 *   - ./theme: PANEL/DIM — the shared look.
 *
 * Data shapes:
 *   - TestScreen is a pure function of the 'test' Mode payload fields — the shell keeps the
 *     starter (startTest's seq guard + abort) and feeds text/phase/error as deltas land.
 *
 * Extracted from app.tsx with #119: the test Screen plus streamTestReply, colocated per the
 * flow-module rule (#114). app.tsx re-exports streamTestReply so headless imports keep working.
 */

import {
  resolveBaseUrl, resolveKeyId, isCodexProvider, isAnthropicProvider, isXaiProvider,
  DEFAULT_EFFORT, codexStream, anthropicStream, xaiStream, sseBlocks,
  chatCompletionTextDelta, standardEffortToCodex,
  type Provider,
} from '@wisp/core';
import { home, codexAuth, anthropicAuth, xaiAuth } from './store';
import { PANEL, DIM } from './theme';

// ----------------------------------------- Wiring check ----------------------------------------- //

// The wiring check's canned prompt — proves the round trip, nothing more (#62: not a chat).
const TEST_PROMPT = 'Reply with one short sentence confirming you can hear me.';

// Fire the canned prompt through one Provider and yield raw answer-text deltas. Dispatch mirrors the
// Bridge's three kinds (bridgeServer.startProviderStream): Codex → Responses stream, Anthropic →
// Messages stream, keyed → plain fetch on <base>/chat/completions. Failures throw with the Provider's
// real message — the caller renders them loud, never falls back. Exported so the wiring check itself
// can be exercised headless (no TTY) — the screen around it is plain state rendering.
export async function* streamTestReply(p: Provider, model: string, signal: AbortSignal): AsyncGenerator<string> {
  const cfg = home.readConfig();
  const baseUrl = resolveBaseUrl(p, cfg.customBaseUrl ?? '');
  const message = { role: 'user' as const, content: TEST_PROMPT };
  if (isCodexProvider(p)) {
    const creds = await codexAuth.current();
    if (!creds) throw new Error(`${p.label} is not signed in — /signin codex.`);
    for await (const ev of codexStream({ creds, baseUrl, model, messages: [message], effort: standardEffortToCodex(cfg.effort ?? DEFAULT_EFFORT), signal }))
      if (ev.type === 'text') yield ev.value;
    return;
  }
  if (isAnthropicProvider(p)) {
    const creds = await anthropicAuth.current();
    if (!creds) throw new Error(`${p.label} is not signed in — /signin anthropic.`);
    for await (const ev of anthropicStream({ creds, baseUrl, model, messages: [message], effort: cfg.effort ?? DEFAULT_EFFORT, signal }))
      if (ev.type === 'text') yield ev.value;
    return;
  }
  if (isXaiProvider(p)) {
    const creds = await xaiAuth.current();
    if (!creds) throw new Error(`${p.label} is not signed in — /signin xai.`);
    // baseUrl is the row's proxy base; xaiStream routes grok-4.5 to api.x.ai itself. effort stays the
    // shared EffortLevel — xaiReasoning gates per model.
    for await (const ev of xaiStream({ creds, baseUrl, model, messages: [message], effort: cfg.effort ?? DEFAULT_EFFORT, signal }))
      if (ev.type === 'text') yield ev.value;
    return;
  }
  if (!baseUrl) throw new Error('Custom has no base URL configured.');
  // Keyless rows (local Ollama) send bare on purpose — a backend that wanted a key answers 401, and
  // that status+body IS the loud error this check exists to surface. No local key gate.
  const key = home.readAuth().keys?.[resolveKeyId(p)] || (p.apiKeyEnv ? process.env[p.apiKeyEnv] : undefined);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model, messages: [message], stream: true }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${p.label} API error ${res.status}${body.trim() ? `: ${body.trim().slice(0, 500)}` : '.'}`);
  }
  if (!res.body) return;
  for await (const block of sseBlocks(res.body)) {
    const delta = chatCompletionTextDelta(block);
    if (delta) yield delta;
  }
}

// ----------------------------------------- Screen ----------------------------------------- //

// The /test panel — reply text plus a phase footer; the shell mounts it while mode.kind === 'test'.
export const TestScreen = ({ provider, model, text, phase, error }: {
  provider: Provider;
  model: string;
  text: string;
  phase: 'streaming' | 'done' | 'error';
  error?: string;
}) => (
  // plain-ASCII title on purpose — opentui border titles drop non-ASCII (em-dash/·), see gotchas
  <box {...PANEL} title={`/test: ${provider.label} (${model})`} marginTop={1} flexDirection="column">
    {/* raw reply text, streamed as-is — deliberately no markdown, no history (#62) */}
    {text !== '' && <text>{text}</text>}
    {phase === 'streaming' && <text wrapMode="none" fg={DIM}>{text === '' ? 'Waiting for the first token… ' : ''}Esc to cancel.</text>}
    {phase === 'done' && <text wrapMode="none" fg={DIM}>Done — Esc to close.</text>}
    {phase === 'error' && <text fg="#f87171">{error}</text>}
  </box>
);

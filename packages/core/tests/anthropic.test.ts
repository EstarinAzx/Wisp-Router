// ---------------- anthropic.test.ts — pure Anthropic OAuth Provider helpers ---------------- //

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isAnthropicProvider, isAnthropicSignedIn,
  tokensToAnthropicCreds, shouldRefreshAnthropicToken, parseAnthropicCreds,
  base64url, codeVerifier, codeChallenge, oauthState,
  anthropicFingerprint, anthropicAttribution,
  buildAnthropicMessagesBody, reduceAnthropicTextEvents, anthropicModelCaps, anthropicModelsFrom, ANTHROPIC_MODELS,
  toAnthropicTools, reduceAnthropicToolCalls, anthropicThinkingEffort, effortOptionsFor, anthropicTruncationReason,
  anthropicUsage, anthropicCacheOutcome,
  type Provider, type SseEvent, type BridgeUsage,
} from '../src/catalog';
import { anthropicMessagesHeaders, anthropicStream } from '../src/anthropicClient';

const provider = (over: Partial<Provider> = {}): Provider => ({
  id: 'anthropic', label: 'Claude', baseUrl: 'https://api.anthropic.com',
  defaultModel: 'claude-opus-4-8', apiKeyEnv: '', ...over,
});

describe('isAnthropicProvider', () => {
  it('is true for a row whose kind is anthropic-oauth', () => {
    expect(isAnthropicProvider(provider({ kind: 'anthropic-oauth' }))).toBe(true);
  });

  // Absent kind defaults to openai-chat; the Codex row stays distinct — both must read non-anthropic.
  it('is false for absent kind, openai-chat, and codex', () => {
    expect(isAnthropicProvider(provider({ kind: undefined }))).toBe(false);
    expect(isAnthropicProvider(provider({ kind: 'openai-chat' }))).toBe(false);
    expect(isAnthropicProvider(provider({ kind: 'codex' }))).toBe(false);
  });
});

describe('effortOptionsFor', () => {
  // Matches the official Claude Code /effort slider: every effort-capable Claude shows the FULL low→max
  // ladder, regardless of model. The wire clamps to each model's ceiling (anthropicThinkingEffort), so an
  // offered xhigh/max degrades rather than 400s — exactly what the first-party client does (#32).
  it('offers the full low→max ladder for Anthropic, even a non-max model like Sonnet', () => {
    expect(effortOptionsFor(provider({ kind: 'anthropic-oauth', defaultModel: 'claude-sonnet-4-6' })))
      .toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(effortOptionsFor(provider({ kind: 'anthropic-oauth', defaultModel: 'claude-opus-4-8' })))
      .toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  // Codex's wire tops at xhigh (no 'max' level) — the picker must not offer a level it can't send.
  it('omits max for Codex', () => {
    expect(effortOptionsFor(provider({ kind: 'codex', defaultModel: 'gpt-5.3-codex' })))
      .toEqual(['low', 'medium', 'high', 'xhigh']);
  });
});

describe('isAnthropicSignedIn', () => {
  // Anthropic has no API key — usable == a bearer access token is present.
  it('is true when an access token is present', () => {
    expect(isAnthropicSignedIn({ accessToken: 'at', refreshToken: 'rt' })).toBe(true);
  });

  // A `{}` tombstone (written on sign-out) and a refresh-only blob both read as signed-out.
  it('is false for undefined, the tombstone, and a bearer-less blob', () => {
    expect(isAnthropicSignedIn(undefined)).toBe(false);
    expect(isAnthropicSignedIn({})).toBe(false);
    expect(isAnthropicSignedIn({ refreshToken: 'rt' })).toBe(false);
  });
});

describe('tokensToAnthropicCreds', () => {
  // expires_in (seconds, relative) becomes an absolute expiresAt (epoch ms) against the injected clock —
  // Anthropic tokens carry no JWT exp, so the deadline must be computed at exchange time and stored.
  it('computes expiresAt from expires_in against the supplied clock', () => {
    expect(tokensToAnthropicCreds({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }, 1000))
      .toEqual({ accessToken: 'at', refreshToken: 'rt', expiresAt: 1000 + 3_600_000 });
  });

  // No expires_in → no expiresAt key (time-based refresh simply never fires; a live 401 still recovers).
  it('omits expiresAt when expires_in is absent', () => {
    expect(tokensToAnthropicCreds({ access_token: 'at', refresh_token: 'rt' }, 1000))
      .toEqual({ accessToken: 'at', refreshToken: 'rt' });
  });
});

describe('shouldRefreshAnthropicToken', () => {
  const now = 1_000_000_000_000; // fixed clock so the 5-minute skew window is deterministic

  // Refresh once the token is within 5 minutes of expiry, so it can't die mid-request.
  it('is true when expiry is inside the 5-minute skew window', () => {
    expect(shouldRefreshAnthropicToken({ expiresAt: now + 200_000 }, now)).toBe(true);
  });

  // The boundary is inclusive — exactly 5 minutes out still refreshes.
  it('is true exactly at the 5-minute boundary', () => {
    expect(shouldRefreshAnthropicToken({ expiresAt: now + 5 * 60_000 }, now)).toBe(true);
  });

  it('is false when expiry is well past the skew window', () => {
    expect(shouldRefreshAnthropicToken({ expiresAt: now + 3_600_000 }, now)).toBe(false);
  });

  // No deadline → can't prove staleness, so don't force a refresh that might block a working token.
  it('is false when there is no expiresAt', () => {
    expect(shouldRefreshAnthropicToken({}, now)).toBe(false);
  });
});

describe('parseAnthropicCreds', () => {
  // A corrupt slot reads as "no creds" rather than throwing — the read path must never crash sign-in state.
  it('returns undefined for absent, empty, and non-JSON slots', () => {
    expect(parseAnthropicCreds(undefined)).toBeUndefined();
    expect(parseAnthropicCreds('')).toBeUndefined();
    expect(parseAnthropicCreds('not-json')).toBeUndefined();
  });

  // The `{}` tombstone parses to an empty object (which isAnthropicSignedIn reads as signed-out).
  it('parses a tombstone to an empty object and a real bundle to its creds', () => {
    expect(parseAnthropicCreds('{}')).toEqual({});
    expect(parseAnthropicCreds('{"accessToken":"at","refreshToken":"rt"}'))
      .toEqual({ accessToken: 'at', refreshToken: 'rt' });
  });
});

describe('base64url', () => {
  // No '+'/'/' and no '=' padding — the form PKCE and the authorize URL require.
  it('encodes URL-safe with padding stripped', () => {
    expect(base64url(Buffer.from([0xff, 0xff, 0xff]))).toBe('____');
    expect(base64url(Buffer.from([0xff]))).toBe('_w');
  });
});

describe('codeChallenge', () => {
  // RFC 7636 Appendix B test vector: the S256 challenge of this verifier is deterministic.
  it('derives the S256 base64url challenge (RFC 7636 vector)', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
      .toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('codeVerifier / oauthState', () => {
  // Both are 32 random bytes as base64url → 43 url-safe chars, no padding.
  it('produce 43-char URL-safe strings', () => {
    expect(codeVerifier()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(oauthState()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('anthropicFingerprint', () => {
  // The Claude Code client fingerprint the backend recomputes + validates: 3 hex chars of
  // sha256(salt + msg[4] + msg[7] + msg[20] + version). Vectors computed independently from the spec.
  it('samples chars 4/7/20 and hashes with the salt + version', () => {
    expect(anthropicFingerprint('hello world', '0.19.0')).toBe('ad2');
  });

  // Missing indices substitute '0' — an empty message samples '000'.
  it('substitutes 0 for out-of-range indices', () => {
    expect(anthropicFingerprint('', '0.19.0')).toBe('784');
  });
});

describe('anthropicAttribution', () => {
  // The first system block openclaude sends — carries the validated fingerprint. No cch (native
  // attestation unreproducible/unenforced), no cc_workload for an interactive run.
  it('builds the x-anthropic-billing-header attribution string', () => {
    expect(anthropicAttribution('hello world', '0.19.0'))
      .toBe('x-anthropic-billing-header: cc_version=0.19.0.ad2; cc_entrypoint=cli;');
  });
});

describe('buildAnthropicMessagesBody', () => {
  // Inquire sends system+user: Anthropic carries the system prompt top-level (a block array), NOT as a
  // message role, so the system text moves to `system` and only the user turn stays in `messages`. The
  // attribution rides as the FIRST system block, its fingerprint derived from the first user message.
  it('moves the system turn to a top-level block after the attribution', () => {
    const body = buildAnthropicMessagesBody({
      model: 'claude-opus-4-8', maxTokens: 16_000, version: '0.19.0', cacheTtl: '5m',
      messages: [{ role: 'system', content: 'rules' }, { role: 'user', content: 'edit this' }],
    });
    expect(body).toEqual({
      model: 'claude-opus-4-8',
      max_tokens: 16_000,
      system: [
        { type: 'text', text: anthropicAttribution('edit this', '0.19.0') },
        { type: 'text', text: 'rules', cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'edit this', cache_control: { type: 'ephemeral' } }] }],
    });
  });

  // Native chat carries no system turn (VS Code's chat API has no System role) — the system block is then
  // the attribution alone, and assistant turns ride through in order for a multi-turn conversation.
  it('keeps user/assistant turns and emits an attribution-only system when there is no system turn', () => {
    const body = buildAnthropicMessagesBody({
      model: 'claude-sonnet-4-6', maxTokens: 8_000, version: '0.19.0',
      messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }, { role: 'user', content: 'more' }],
    });
    expect(body.system).toEqual([{ type: 'text', text: anthropicAttribution('hi', '0.19.0'), cache_control: { type: 'ephemeral', ttl: '1h' } }]);
    expect(body.messages).toEqual([
      { role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' },
      { role: 'user', content: [{ type: 'text', text: 'more', cache_control: { type: 'ephemeral', ttl: '1h' } }] },
    ]);
  });

  // #111: the Bridge re-sends the whole conversation every turn — without cache breakpoints the
  // OAuth path re-bills it all as uncached input (~10x plan-usage weight). The last system block
  // (render order is tools → system, so it covers the tool definitions too) plus up to three message
  // markers walking back from the end — one every ~15 blocks so no gap exceeds Anthropic's ~20-block
  // cache lookback, which a single heavy parallel-tool turn would otherwise overshoot.
  describe('prompt-caching breakpoints (#111)', () => {
    it('marks the last system block and leaves tools unannotated (system breakpoint covers them)', () => {
      const tools = [{ name: 'readFile', description: 'd', input_schema: { type: 'object' as const, properties: {} } }];
      const body = buildAnthropicMessagesBody({
        model: 'm', maxTokens: 1, version: 'v', tools, cacheTtl: '5m',
        messages: [{ role: 'system', content: 'rules' }, { role: 'user', content: 'hi' }],
      }) as any;
      expect(body.system[body.system.length - 1].cache_control).toEqual({ type: 'ephemeral' }); // one-shot → bare 5m
      expect(body.system[0].cache_control).toBeUndefined();
      expect(body.tools).toEqual(tools); // no cache_control on tools — the system breakpoint caches them
    });

    // #139: the volatile system tail (mid-session <system-reminder> appends) rides AFTER the breakpoint —
    // the marker stays on the stable block, so a reminder append no longer mutates the marked block and
    // the whole tools+system prefix keeps reading from cache.
    it('emits systemSuffix as an unmarked block after the marked stable block', () => {
      const body = buildAnthropicMessagesBody({
        model: 'm', maxTokens: 1, version: 'v', cacheTtl: '1h', systemSuffix: '<system-reminder>new skills</system-reminder>',
        messages: [{ role: 'system', content: 'rules' }, { role: 'user', content: 'hi' }],
      }) as any;
      expect(body.system.length).toBe(3);
      expect(body.system[1]).toEqual({ type: 'text', text: 'rules', cache_control: { type: 'ephemeral', ttl: '1h' } });
      expect(body.system[2]).toEqual({ type: 'text', text: '<system-reminder>new skills</system-reminder>' });
      expect(body.system.filter((b: any) => b.cache_control).length).toBe(1); // marker count unchanged
    });

    // No system turn at all: the suffix still lands after the marked attribution block.
    it('marks the attribution when a suffix rides with no system turn', () => {
      const body = buildAnthropicMessagesBody({
        model: 'm', maxTokens: 1, version: 'v', cacheTtl: '1h', systemSuffix: 'note',
        messages: [{ role: 'user', content: 'hi' }],
      }) as any;
      expect(body.system.length).toBe(2);
      expect(body.system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
      expect(body.system[1]).toEqual({ type: 'text', text: 'note' });
    });

    // #145: a mid-conversation system message (after the leading run) stays POSITIONED in messages as a
    // single text block — role:"system" passthrough on the wire (mid-conversation-system beta). Only the
    // LEADING system run lifts into the top-level system array; the attribution still samples the first
    // user turn.
    it('keeps a mid-conversation system message positioned as a role:system text block', () => {
      const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', cacheTtl: '1h', messages: [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'hi' },
        { role: 'system', content: 'hook note' },
        { role: 'user', content: 'go' },
      ] }) as any;
      expect(body.system.map((b: any) => b.text)).toEqual([anthropicAttribution('hi', 'v'), 'rules']);
      expect(body.messages[0]).toEqual({ role: 'user', content: 'hi' });
      expect(body.messages[1]).toEqual({ role: 'system', content: [{ type: 'text', text: 'hook note' }] });
      expect(body.messages[2].role).toBe('user');
    });

    // A SECOND leading system message is a positioned turn ahead of the first user turn (only the
    // Anthropic door produces it) — hoisting it into the marked stable block would put its churn back in
    // front of the whole history. The attribution still samples the first USER turn.
    it('hoists at most one leading system message — a second stays positioned', () => {
      const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', cacheTtl: '1h', messages: [
        { role: 'system', content: 'rules' },
        { role: 'system', content: 'early note' },
        { role: 'user', content: 'hi' },
      ] }) as any;
      expect(body.system.map((b: any) => b.text)).toEqual([anthropicAttribution('hi', 'v'), 'rules']);
      expect(body.messages[0]).toEqual({ role: 'system', content: [{ type: 'text', text: 'early note' }] });
    });

    // A positioned system turn's text block is markable (native Claude Code marks these too) — as the
    // final message it takes the end-of-history breakpoint.
    it('marks the final block when the last message is a positioned system turn', () => {
      const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', cacheTtl: '1h', messages: [
        { role: 'user', content: 'hi' },
        { role: 'system', content: 'hook note' },
      ] }) as any;
      expect(body.messages[1].content[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    });

    // #145 churn regression: appending a new reminder near the tail must leave the top-level system array
    // and every message before the previous final turn byte-identical — the old hoisting rendered
    // reminders ahead of the whole history, re-billing everything behind them on each change. (The
    // previous final turn itself legitimately re-renders: it carried the end marker.)
    it('keeps the prefix byte-stable when a new positioned system turn is appended', () => {
      const before = [
        { role: 'system' as const, content: 'rules' },
        { role: 'user' as const, content: 'hi' },
        { role: 'assistant' as const, content: 'yo' },
        { role: 'system' as const, content: 'reminder-1' },
        { role: 'user' as const, content: 'go' },
      ];
      const after = [...before,
        { role: 'assistant' as const, content: 'done' },
        { role: 'system' as const, content: 'reminder-2' },
        { role: 'user' as const, content: 'next' },
      ];
      const b1 = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', messages: before }) as any;
      const b2 = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', messages: after }) as any;
      expect(JSON.stringify(b2.system)).toBe(JSON.stringify(b1.system));
      expect(JSON.stringify(b2.messages.slice(0, 3))).toBe(JSON.stringify(b1.messages.slice(0, 3)));
    });

    // An absent or empty suffix must leave the body byte-identical to today's shape.
    it('builds an identical body when systemSuffix is absent or empty', () => {
      const args = { model: 'm', maxTokens: 1, version: 'v', cacheTtl: '5m' as const, messages: [{ role: 'system' as const, content: 'rules' }, { role: 'user' as const, content: 'hi' }] };
      expect(JSON.stringify(buildAnthropicMessagesBody({ ...args, systemSuffix: '' }))).toBe(JSON.stringify(buildAnthropicMessagesBody(args)));
    });

    it('keeps earlier plain turns as bare strings — only the final turn converts to a block', () => {
      const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', messages: [
        { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' },
      ] }) as any;
      expect(body.messages[0].content).toBe('a');
      expect(body.messages[1].content).toBe('b');
      expect(body.messages[2].content).toEqual([{ type: 'text', text: 'c', cache_control: { type: 'ephemeral', ttl: '1h' } }]);
    });

    it('annotates the last block of an already-block-shaped final turn', () => {
      const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', cacheTtl: '5m', messages: [
        { role: 'user', content: 'thanks', toolResults: [{ callId: 'toolu_1', content: 'file body' }] },
      ] }) as any;
      const blocks = body.messages[0].content;
      expect(blocks[0].cache_control).toBeUndefined();
      expect(blocks[blocks.length - 1]).toEqual({ type: 'text', text: 'thanks', cache_control: { type: 'ephemeral' } });
    });

    // #141: a turn carrying textBlocks (the advisor reviewer transcript) expands to one text block per
    // entry — the existing marker walk then gives it intermediate breakpoints, so successive reviewer
    // calls share a byte-stable cached prefix instead of re-billing one giant grown block.
    it('expands a textBlocks turn to one block per entry and keeps markers within the cap', () => {
      const entries = Array.from({ length: 40 }, (_, i) => `turn ${i}`);
      const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', cacheTtl: '1h', messages: [
        { role: 'user', content: entries.join('\n\n'), textBlocks: entries },
      ] }) as any;
      const blocks = body.messages[0].content as any[];
      expect(blocks.length).toBe(40);
      expect(blocks[0]).toEqual(expect.objectContaining({ type: 'text', text: 'turn 0' }));
      const marked = blocks.flatMap((b, i) => (b.cache_control ? [i] : []));
      expect(blocks[blocks.length - 1].cache_control).toBeDefined();
      for (let i = 1; i < marked.length; i++) expect(marked[i] - marked[i - 1]).toBeLessThanOrEqual(20);
      const systemMarks = body.system.filter((b: any) => b.cache_control).length;
      expect(systemMarks + marked.length).toBeLessThanOrEqual(4);
    });

    // A single heavy parallel-tool turn collapses into one message of many blocks. With only the final
    // block marked, the next turn's lookback overshoots the ~20-block window and re-bills the prefix.
    // Intermediate markers keep every gap ≤ the window, and total breakpoints stay within the 4/request cap.
    it('spreads intermediate breakpoints so no gap exceeds the 20-block lookback on a fat turn', () => {
      const toolResults = Array.from({ length: 40 }, (_, i) => ({ callId: `toolu_${i}`, content: `r${i}` }));
      const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', cacheTtl: '5m', messages: [
        { role: 'user', content: '', toolResults },
      ] }) as any;
      const blocks = body.messages[0].content as any[];
      const marked = blocks.flatMap((b, i) => (b.cache_control ? [i] : []));
      expect(blocks[blocks.length - 1].cache_control).toEqual({ type: 'ephemeral' }); // one-shot → bare 5m; growing edge still marked
      expect(marked.length).toBeLessThanOrEqual(3); // 4/request cap − 1 for the system block
      // Every gap between consecutive markers — and from the first marker back to the covered tail — is
      // within the lookback window.
      for (let i = 1; i < marked.length; i++) expect(marked[i] - marked[i - 1]).toBeLessThanOrEqual(20);
      const systemMarks = body.system.filter((b: any) => b.cache_control).length;
      expect(systemMarks + marked.length).toBeLessThanOrEqual(4); // never exceed the per-request breakpoint cap
    });

    // TTL is fixed by the CALLER's request path, not by this body's turn count — so the SAME session can't
    // flip 5m→1h between turn 1 and turn 2 (a TTL flip busts the server-side cache, #111). The single-turn
    // body below carries ttl:'1h' when the caller asked for '1h', proving the turn count no longer decides it.
    it('takes the TTL from the caller and does not derive it from turn count', () => {
      const args = { model: 'm', maxTokens: 1, version: 'v', messages: [{ role: 'user' as const, content: 'hi' }] };
      const oneShot = buildAnthropicMessagesBody({ ...args, cacheTtl: '5m' }) as any;
      expect(oneShot.system[oneShot.system.length - 1].cache_control).toEqual({ type: 'ephemeral' });
      expect(oneShot.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });

      // Same single-turn body, session path — 1h even though it's "turn 1", so turn 2 won't be a flip.
      const session = buildAnthropicMessagesBody({ ...args, cacheTtl: '1h' }) as any;
      expect(session.system[session.system.length - 1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
      expect(session.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });

      // Default (no cacheTtl) is the dominant session path → 1h.
      const dflt = buildAnthropicMessagesBody(args) as any;
      expect(dflt.system[dflt.system.length - 1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    });

    // Haiku is carved out of 1h (its caching behaves differently; Claude Code excludes it too): a haiku turn
    // always takes the bare 5m marker even when the caller asks for '1h'.
    it('never gives haiku the 1h TTL, even on a session path', () => {
      const body = buildAnthropicMessagesBody({
        model: 'claude-haiku-4-5', maxTokens: 1, version: 'v', cacheTtl: '1h',
        messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }, { role: 'user', content: 'more' }],
      }) as any;
      expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(body.messages[2].content[0].cache_control).toEqual({ type: 'ephemeral' });
    });

    // Plain chat turns are bare strings and can't carry a marker. When a run of them straddles a step
    // boundary, the marker must slide FORWARD (toward the end) to the nearest markable block — sliding
    // backward widens the gap past the ~20-block lookback and silently re-bills the prefix.
    it('keeps every gap within the lookback window when plain turns straddle a step boundary', () => {
      const fat = (n: number, p: string) => Array.from({ length: n }, (_, i) => ({ callId: `${p}${i}`, content: 'x' }));
      const messages: any[] = [{ role: 'user', content: '', toolResults: fat(12, 'a') }];
      // Six plain turns land the walk-back's step boundary inside an unmarkable stretch.
      for (let i = 0; i < 6; i++) messages.push({ role: i % 2 ? 'user' : 'assistant', content: `chat${i}` });
      messages.push({ role: 'user', content: '', toolResults: fat(15, 'b') });
      const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', messages }) as any;
      // Flatten to block positions, counting each bare-string turn as one (unmarkable) block.
      const marked: number[] = [];
      let pos = 0;
      for (const m of body.messages) {
        if (Array.isArray(m.content)) for (const b of m.content) { if (b.cache_control) marked.push(pos); pos++; }
        else pos++;
      }
      expect(marked[marked.length - 1]).toBe(pos - 1); // the growing edge is always marked
      for (let i = 1; i < marked.length; i++) expect(marked[i] - marked[i - 1]).toBeLessThanOrEqual(20);
    });
  });

  // The streaming path needs stream:true on the body; the non-streaming (Inquire) path must omit it.
  it('adds stream:true only when asked', () => {
    const streamed = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', stream: true, messages: [{ role: 'user', content: 'x' }] });
    expect(streamed.stream).toBe(true);
    const plain = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', messages: [{ role: 'user', content: 'x' }] });
    expect('stream' in plain).toBe(false);
  });
});

describe('anthropicThinkingEffort', () => {
  // Effort-capable models (Opus 4.x / Sonnet 4.6) get adaptive thinking + the level on output_config.effort
  // (NOT a top-level field, NOT budget_tokens — both 400 on Opus 4.7+). Mirrors openclaude's wire contract.
  it('emits adaptive thinking + output_config.effort for an effort-capable model', () => {
    expect(anthropicThinkingEffort('claude-opus-4-8', 'high')).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
    });
  });

  // Haiku / older variants reject thinking+effort (400 on the wire) — send neither.
  it('emits neither field for a model that does not support effort', () => {
    expect(anthropicThinkingEffort('claude-haiku-4-5', 'high')).toEqual({});
  });

  // No effort selected → backward-compatible empty: keeps the pre-#31 body byte-identical.
  it('emits neither field when no effort is given', () => {
    expect(anthropicThinkingEffort('claude-opus-4-8', undefined)).toEqual({});
  });

  // xhigh is opus-4-7/4-8 only; the panel offers it for every effort-aware Provider, so a Sonnet pick must
  // clamp to high (mirrors openclaude) — sending xhigh to sonnet-4-6 is a wire 400.
  it('clamps xhigh to high on a model that does not support it', () => {
    expect(anthropicThinkingEffort('claude-sonnet-4-6', 'xhigh')).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
    });
  });

  it('keeps xhigh on a model that supports it', () => {
    expect(anthropicThinkingEffort('claude-opus-4-8', 'xhigh')).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'xhigh' },
    });
  });

  // max (slice #32) rides output_config.effort on the max-capable Opus family (4.6-4.8, /opus-4-[678]/).
  it('keeps max on a max-capable model', () => {
    expect(anthropicThinkingEffort('claude-opus-4-8', 'max')).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'max' },
    });
  });

  // Opus 4.6 takes max even though it does NOT take xhigh — the two capability sets differ (openclaude).
  it('keeps max on opus-4-6 (max-capable but not xhigh-capable)', () => {
    expect(anthropicThinkingEffort('claude-opus-4-6', 'max')).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'max' },
    });
  });

  // Sonnet 4.6 is effort-capable but not max-capable — max clamps to high (mirrors the xhigh clamp).
  it('clamps max to high on a model that does not support it', () => {
    expect(anthropicThinkingEffort('claude-sonnet-4-6', 'max')).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
    });
  });

  // Opus 4.5 is effort-capable but predates max → clamp to high, not a wire 400.
  it('clamps max to high on opus-4-5', () => {
    expect(anthropicThinkingEffort('claude-opus-4-5', 'max')).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
    });
  });
});

describe('buildAnthropicMessagesBody — thinking/effort', () => {
  // The threaded effort rides into the body as adaptive thinking + output_config.effort for a capable model.
  it('spreads adaptive thinking + output_config.effort for an effort-capable model', () => {
    const body = buildAnthropicMessagesBody({ model: 'claude-opus-4-8', maxTokens: 1, version: 'v', effort: 'low', messages: [{ role: 'user', content: 'hi' }] }) as any;
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config).toEqual({ effort: 'low' });
  });

  // A non-effort model drops both fields even when an effort is threaded — avoids the 400.
  it('omits thinking/output_config for a non-effort model', () => {
    const body = buildAnthropicMessagesBody({ model: 'claude-haiku-4-5', maxTokens: 1, version: 'v', effort: 'high', messages: [{ role: 'user', content: 'hi' }] }) as any;
    expect('thinking' in body).toBe(false);
    expect('output_config' in body).toBe(false);
  });

  // No effort threaded → body stays the pre-#31 shape (no thinking, no output_config).
  it('omits thinking/output_config when no effort is threaded', () => {
    const body = buildAnthropicMessagesBody({ model: 'claude-opus-4-8', maxTokens: 1, version: 'v', messages: [{ role: 'user', content: 'hi' }] }) as any;
    expect('thinking' in body).toBe(false);
    expect('output_config' in body).toBe(false);
  });

  // Claude 5 (fable-5 / sonnet-5) is effort-capable — live-probed 2026-07-18: the OAuth endpoint accepts
  // adaptive + output_config.effort at every level including xhigh and max on both. Without this the
  // user's /effort was silently dropped on the DEFAULT model and the thinking replay gate never opened.
  it('spreads adaptive thinking + effort for Claude 5 models, unclamped through max', () => {
    const fable = buildAnthropicMessagesBody({ model: 'claude-fable-5', maxTokens: 1, version: 'v', effort: 'xhigh', messages: [{ role: 'user', content: 'hi' }] }) as any;
    expect(fable.thinking).toEqual({ type: 'adaptive' });
    expect(fable.output_config).toEqual({ effort: 'xhigh' });
    const fableMax = buildAnthropicMessagesBody({ model: 'claude-fable-5', maxTokens: 1, version: 'v', effort: 'max', messages: [{ role: 'user', content: 'hi' }] }) as any;
    expect(fableMax.output_config).toEqual({ effort: 'max' });
    const sonnet5 = buildAnthropicMessagesBody({ model: 'claude-sonnet-5', maxTokens: 1, version: 'v', effort: 'max', messages: [{ role: 'user', content: 'hi' }] }) as any;
    expect(sonnet5.thinking).toEqual({ type: 'adaptive' });
    expect(sonnet5.output_config).toEqual({ effort: 'max' });
  });
});

describe('buildAnthropicMessagesBody — thinking passthrough (rawContent)', () => {
  const raw = [
    { type: 'thinking', thinking: 'hmm', signature: 'sig-1' },
    { type: 'text', text: 'answer' },
    { type: 'tool_use', id: 'toolu_1', name: 'read', input: { path: 'a.ts' } },
  ];
  const convo = (model: string, effort?: 'high') => buildAnthropicMessagesBody({
    model, maxTokens: 1, version: 'v', ...(effort ? { effort } : {}),
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'answer', toolCalls: [{ id: 'toolu_1', name: 'read', argsJson: '{"path":"a.ts"}' }], rawContent: raw },
      { role: 'user', content: 'result', toolResults: [{ callId: 'toolu_1', content: 'ok' }] },
    ],
  }) as any;

  // A thinking-bearing assistant turn replays its ORIGINAL block array when the outbound body enables
  // thinking — signatures and interleaved order ride back byte-for-byte, exactly as Anthropic requires.
  it('replays rawContent verbatim when thinking is enabled', () => {
    expect(convo('claude-opus-4-8', 'high').messages[1].content).toEqual(raw);
  });

  // Thinking disabled outbound (non-effort model, or no effort threaded) → the sidecar is ignored and the
  // turn rebuilds from the normalized fields — thinking blocks in a thinking-off request are a 400.
  it('strips thinking when the outbound body does not enable thinking', () => {
    expect(convo('claude-haiku-4-5', 'high').messages[1].content).toEqual([
      { type: 'text', text: 'answer' },
      { type: 'tool_use', id: 'toolu_1', name: 'read', input: { path: 'a.ts' } },
    ]);
    expect(convo('claude-opus-4-8').messages[1].content).toEqual([
      { type: 'text', text: 'answer' },
      { type: 'tool_use', id: 'toolu_1', name: 'read', input: { path: 'a.ts' } },
    ]);
  });

  // Anthropic rejects cache_control on thinking blocks, so the breakpoint walk must treat them as
  // unmarkable (slide to a neighbor). The thinking block below sits exactly one STEP behind the final
  // block, where the second marker would land without the guard.
  it('never attaches cache_control to a thinking block', () => {
    const manyTools = Array.from({ length: 14 }, (_, i) => ({ type: 'tool_use', id: `toolu_${i}`, name: 'read', input: {} }));
    const body = buildAnthropicMessagesBody({
      model: 'claude-opus-4-8', maxTokens: 1, version: 'v', effort: 'high',
      messages: [
        { role: 'assistant', content: '', toolCalls: [], rawContent: [{ type: 'thinking', thinking: 'hmm', signature: 's' }, ...manyTools] },
        { role: 'user', content: 'result' },
      ],
    }) as any;
    const blocks = body.messages.flatMap((m: any) => (Array.isArray(m.content) ? m.content : []));
    expect(blocks.filter((b: any) => b.cache_control).length).toBeGreaterThanOrEqual(2);
    expect(blocks.filter((b: any) => b.type === 'thinking' && b.cache_control)).toEqual([]);
  });

  // Regression (#111 advisor leak): the marker walk must NOT write cache_control back into the caller's
  // rawContent array. The advisor flow builds twice from the SAME parsed.turns (base pass → reviewer →
  // continuation); a marker leaked on an early build stacked on a later one and tripped Anthropic's
  // "A maximum of 4 blocks with cache_control … Found 5". Building must leave the input untouched.
  it('does not mutate the caller rawContent, so repeated builds stay under the cap', () => {
    const raw2 = [
      { type: 'thinking', thinking: 'hmm', signature: 's' },
      ...Array.from({ length: 20 }, (_, i) => ({ type: 'text', text: `t${i}` })),
    ];
    const opts = {
      model: 'claude-opus-4-8', maxTokens: 1, version: 'v', effort: 'high' as const,
      messages: [
        { role: 'assistant' as const, content: '', toolCalls: [], rawContent: raw2 },
        { role: 'user' as const, content: 'go' },
      ],
    };
    const countCC = (body: any) => body.system.filter((b: any) => b.cache_control).length
      + body.messages.flatMap((m: any) => (Array.isArray(m.content) ? m.content : [])).filter((b: any) => b.cache_control).length;
    const first = countCC(buildAnthropicMessagesBody(opts) as any);
    const second = countCC(buildAnthropicMessagesBody(opts) as any); // same input object again — mimics the reused turns
    expect(raw2.some((b: any) => b.cache_control)).toBe(false); // the smoking gun: input left clean
    expect(first).toBeLessThanOrEqual(4);
    expect(second).toBe(first);                                   // no accumulation across builds
  });
});

describe('reduceAnthropicTextEvents', () => {
  // The streaming shape: answer text arrives as a run of content_block_delta events whose delta is a
  // text_delta — concatenate them in order. anthropicStream yields the same fragments live.
  it('concatenates text_delta fragments in order', () => {
    expect(reduceAnthropicTextEvents([
      { event: 'content_block_delta', data: { delta: { type: 'text_delta', text: 'Hel' } } },
      { event: 'content_block_delta', data: { delta: { type: 'text_delta', text: 'lo' } } },
    ])).toBe('Hello');
  });

  // Lifecycle events (message_start, content_block_start/stop, ping, message_delta/stop) and a tool_use's
  // input_json_delta are not answer text — ignored by the text reducer.
  it('ignores lifecycle events and non-text deltas', () => {
    expect(reduceAnthropicTextEvents([
      { event: 'message_start', data: { message: {} } },
      { event: 'content_block_start', data: { content_block: { type: 'text' } } },
      { event: 'ping', data: { type: 'ping' } },
      { event: 'content_block_delta', data: { delta: { type: 'input_json_delta', partial_json: '{"a":' } } },
      { event: 'content_block_delta', data: { delta: { type: 'text_delta', text: 'real' } } },
      { event: 'content_block_stop', data: { index: 0 } },
      { event: 'message_delta', data: { delta: { stop_reason: 'end_turn' } } },
      { event: 'message_stop', data: {} },
    ])).toBe('real');
  });

  // An `error` SSE event is a backend failure — surface its message rather than returning partial text.
  it('throws with the backend message on an error event', () => {
    expect(() => reduceAnthropicTextEvents([
      { event: 'error', data: { error: { type: 'overloaded_error', message: 'boom' } } },
    ])).toThrow('boom');
  });

  // A malformed non-string text must be skipped, not coerced ('[object Object]' / '5').
  it('ignores a non-string text', () => {
    expect(reduceAnthropicTextEvents([
      { event: 'content_block_delta', data: { delta: { type: 'text_delta', text: 5 } } },
      { event: 'content_block_delta', data: { delta: { type: 'text_delta', text: 'real' } } },
    ] as SseEvent[])).toBe('real');
  });

  it('returns empty string for no events', () => {
    expect(reduceAnthropicTextEvents([])).toBe('');
  });
});

describe('anthropicModelCaps', () => {
  // The OAuth Messages path has no models.dev catalogKey, so without this the chat picker would show the
  // neutral default window. Per the model spec: Opus/Sonnet 4.x are 1M context (Opus 128K output, Sonnet
  // 64K), Haiku 4.5 is 200K/64K; all multimodal (vision).
  it('returns the 1M window for Opus/Sonnet and 200K for Haiku, vision capable', () => {
    expect(anthropicModelCaps('claude-opus-4-8')).toEqual({ contextInput: 1_000_000, maxOutput: 128_000, vision: true });
    expect(anthropicModelCaps('claude-sonnet-4-6')).toEqual({ contextInput: 1_000_000, maxOutput: 64_000, vision: true });
    expect(anthropicModelCaps('claude-haiku-4-5')).toEqual({ contextInput: 200_000, maxOutput: 64_000, vision: true });
  });
});

describe('anthropicModelsFrom', () => {
  const catalog = {
    anthropic: {
      models: {
        'claude-opus-4-8': { release_date: '2026-05-28' },
        'claude-sonnet-5': { release_date: '2026-06-29' },
        'claude-haiku-4-5': { release_date: '2025-10-01' },
        'claude-haiku-4-5-20251001': { release_date: '2025-10-01' }, // dated snapshot → dropped
        'claude-fable-5': { release_date: '2026-07-01' }, // unknown family → kept (no whitelist)
      },
    },
  };

  it('drops dated snapshots, keeps every undated id newest-first — no family whitelist', () => {
    expect(anthropicModelsFrom(catalog)).toEqual(['claude-fable-5', 'claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5']);
  });

  it('falls back to the curated list when the catalog is absent or empty', () => {
    expect(anthropicModelsFrom(undefined)).toEqual(ANTHROPIC_MODELS);
    expect(anthropicModelsFrom({ anthropic: { models: {} } })).toEqual(ANTHROPIC_MODELS);
  });
});

describe('anthropicMessagesHeaders', () => {
  // The client recognition signals: the comma-joined anthropic-beta MUST carry both claude-code-20250219
  // (the primary gate) and oauth-2025-04-20 (the OAuth path), plus the claude-cli User-Agent and the
  // Bearer — without these the subscription backend throttles a valid token to a synthetic 429.
  it('carries the oauth beta, the claude-code gate, and the bearer', () => {
    const h = anthropicMessagesHeaders('tok');
    expect(h['anthropic-beta']).toContain('oauth-2025-04-20');
    expect(h['anthropic-beta']).toContain('claude-code-20250219');
    expect(h['anthropic-version']).toBe('2023-06-01');
    expect(h['User-Agent']).toMatch(/^claude-cli\//);
    expect(h['Authorization']).toBe('Bearer tok');
  });

  // The effort-2025-11-24 beta gates the API's parsing of output_config.effort — without it the level is
  // silently dropped. Advertised on every request (harmless when the body omits output_config).
  it('advertises the effort beta so output_config.effort is honored', () => {
    expect(anthropicMessagesHeaders('tok')['anthropic-beta']).toContain('effort-2025-11-24');
  });

  // #145 rides the mid-conversation-system beta: positioned role:"system" turns in messages[] are gated
  // on it (claude CLI advertises the same token natively).
  it('advertises the mid-conversation-system beta so positioned system turns are accepted', () => {
    expect(anthropicMessagesHeaders('tok')['anthropic-beta']).toContain('mid-conversation-system-2026-04-07');
  });

  // The streaming request must accept an event stream; the non-streaming (Inquire) request must not.
  it('adds the event-stream Accept only when streaming', () => {
    expect(anthropicMessagesHeaders('tok', true)['Accept']).toBe('text/event-stream');
    expect('Accept' in anthropicMessagesHeaders('tok')).toBe(false);
  });

  // #149: fingerprint parity with real claude-cli 2.1.216 — the UA advertises the captured version
  // (the cc_version hash is unvalidated, see #148, so the bump cannot break an accepted request).
  it('advertises the claude-cli 2.1.216 User-Agent', () => {
    expect(anthropicMessagesHeaders('tok')['User-Agent']).toBe('claude-cli/2.1.216 (external, cli)');
  });

  // #149: the Stainless SDK header set real claude emits (its bundled @anthropic-ai/sdk is a Stainless
  // build) — fixed values match the 2.1.216 capture; arch/os/runtime-version derive from the host.
  it('emits the Stainless SDK header set', () => {
    const h = anthropicMessagesHeaders('tok');
    expect(h['x-stainless-lang']).toBe('js');
    expect(h['x-stainless-package-version']).toBe('0.94.0');
    expect(h['x-stainless-runtime']).toBe('node');
    expect(h['x-stainless-retry-count']).toBe('0');
    expect(h['x-stainless-timeout']).toBe('600');
    expect(h['x-stainless-arch']).toBeTruthy();
    expect(['Windows', 'MacOS', 'Linux']).toContain(h['x-stainless-os']);
    expect(h['x-stainless-runtime-version']).toMatch(/^v\d/);
  });

  // #149: real claude generates one session UUID at startup and repeats it on every request; #150 must
  // reuse the SAME value inside metadata.user_id.session_id, so it is stable across calls.
  it('carries one stable per-session claude-code session id', () => {
    const a = anthropicMessagesHeaders('tok')['x-claude-code-session-id'];
    const b = anthropicMessagesHeaders('other')['x-claude-code-session-id'];
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(b).toBe(a);
  });

  // #149: real claude sends the direct-browser-access flag on every Messages request.
  it('flags anthropic-dangerous-direct-browser-access', () => {
    expect(anthropicMessagesHeaders('tok')['anthropic-dangerous-direct-browser-access']).toBe('true');
  });
});

describe('toAnthropicTools', () => {
  // VS Code tool defs → Anthropic Messages tools: name/description/input_schema, the schema passed
  // through verbatim. Unlike Codex's strict Responses tools, Anthropic does NOT require closed objects —
  // no additionalProperties:false, no required-all-keys enforcement; the schema rides as-is.
  it('maps a tool to an Anthropic tool, schema passed through unchanged', () => {
    expect(toAnthropicTools([{ name: 'readFile', description: 'read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }]))
      .toEqual([{
        name: 'readFile', description: 'read a file',
        input_schema: { type: 'object', properties: { path: { type: 'string' } } },
      }]);
  });

  // A tool with no schema still maps — input_schema becomes a (non-strict) empty object schema.
  it('defaults missing inputSchema to an empty object schema', () => {
    expect(toAnthropicTools([{ name: 'noArgs', description: 'd' }]))
      .toEqual([{ name: 'noArgs', description: 'd', input_schema: { type: 'object', properties: {} } }]);
  });
});

describe('reduceAnthropicToolCalls', () => {
  // The Messages streaming shape: a tool_use block is announced by content_block_start (carrying the
  // toolu_ id + name) and its arguments arrive as content_block_delta(input_json_delta) partial_json
  // fragments — both keyed by the content-block `index` (unlike Codex, which keys by item id).
  it('reassembles a tool call from content_block_start + input_json_delta fragments', () => {
    const events: SseEvent[] = [
      { event: 'content_block_start', data: { index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'readFile' } } },
      { event: 'content_block_delta', data: { index: 0, delta: { type: 'input_json_delta', partial_json: '{"pa' } } },
      { event: 'content_block_delta', data: { index: 0, delta: { type: 'input_json_delta', partial_json: 'th":"a.ts"}' } } },
      { event: 'content_block_stop', data: { index: 0 } },
    ];
    expect(reduceAnthropicToolCalls(events)).toEqual([{ id: 'toolu_1', name: 'readFile', argsJson: '{"path":"a.ts"}' }]);
  });

  // Parallel tool_use blocks are distinguished by their content-block index; returned in first-seen order.
  it('keeps parallel calls separate by index', () => {
    const events: SseEvent[] = [
      { event: 'content_block_start', data: { index: 0, content_block: { type: 'tool_use', id: 'toolu_a', name: 'a' } } },
      { event: 'content_block_start', data: { index: 1, content_block: { type: 'tool_use', id: 'toolu_b', name: 'b' } } },
      { event: 'content_block_delta', data: { index: 1, delta: { type: 'input_json_delta', partial_json: '{"y":2}' } } },
      { event: 'content_block_delta', data: { index: 0, delta: { type: 'input_json_delta', partial_json: '{"x":1}' } } },
    ];
    expect(reduceAnthropicToolCalls(events)).toEqual([
      { id: 'toolu_a', name: 'a', argsJson: '{"x":1}' },
      { id: 'toolu_b', name: 'b', argsJson: '{"y":2}' },
    ]);
  });

  // A no-argument tool sends no input_json_delta — argsJson stays empty (the consumer maps '' → {}).
  it('leaves argsJson empty for a tool with no argument deltas', () => {
    const events: SseEvent[] = [
      { event: 'content_block_start', data: { index: 0, content_block: { type: 'tool_use', id: 'toolu_9', name: 'noArgs' } } },
    ];
    expect(reduceAnthropicToolCalls(events)).toEqual([{ id: 'toolu_9', name: 'noArgs', argsJson: '' }]);
  });

  // A text block (content_block_start type:text + its text_delta) is not a tool call — ignored.
  it('ignores text content blocks and text deltas', () => {
    const events: SseEvent[] = [
      { event: 'content_block_start', data: { index: 0, content_block: { type: 'text', text: '' } } },
      { event: 'content_block_delta', data: { index: 0, delta: { type: 'text_delta', text: 'hi' } } },
    ];
    expect(reduceAnthropicToolCalls(events)).toEqual([]);
  });

  it('returns [] for no events', () => {
    expect(reduceAnthropicToolCalls([])).toEqual([]);
  });
});

describe('buildAnthropicMessagesBody — tools', () => {
  // Agent mode: the converted tools ride on the body and tool_choice defaults to the {type:'auto'} object
  // (Anthropic's tool_choice is an object, not a string).
  it('forwards tools with tool_choice {type:auto} by default', () => {
    const tools = toAnthropicTools([{ name: 'readFile', description: 'd', inputSchema: { type: 'object', properties: {} } }]);
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', tools, messages: [{ role: 'user', content: 'hi' }] }) as any;
    expect(body.tools).toEqual(tools);
    expect(body.tool_choice).toEqual({ type: 'auto' });
  });

  // VS Code's Required tool mode maps to Anthropic's {type:'any'} (must use a tool).
  it('uses {type:any} when toolChoice is any', () => {
    const tools = toAnthropicTools([{ name: 'x', description: 'd' }]);
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', tools, toolChoice: 'any', messages: [{ role: 'user', content: 'hi' }] }) as any;
    expect(body.tool_choice).toEqual({ type: 'any' });
  });

  // No tools → no tools/tool_choice keys at all (a bare tool_choice with no tools is rejected).
  it('omits tool fields when there are no tools', () => {
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', tools: [], messages: [{ role: 'user', content: 'hi' }] }) as any;
    expect('tools' in body).toBe(false);
    expect('tool_choice' in body).toBe(false);
  });

  // An assistant turn that called a tool becomes a content block array: its text (if any) then a tool_use
  // block whose `input` is the PARSED argument object (not the JSON string Codex round-trips).
  it('serializes an assistant tool-call turn to text + tool_use blocks', () => {
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', messages: [
      { role: 'user', content: 'read a.ts' },
      { role: 'assistant', content: 'sure', toolCalls: [{ id: 'toolu_1', name: 'readFile', argsJson: '{"path":"a.ts"}' }] },
    ] }) as any;
    expect(body.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'sure' },
        { type: 'tool_use', id: 'toolu_1', name: 'readFile', input: { path: 'a.ts' }, cache_control: { type: 'ephemeral', ttl: '1h' } },
      ],
    });
  });

  // A tool-only assistant turn (no text) emits just the tool_use block — Anthropic rejects an empty text block.
  it('omits the text block for a tool-only assistant turn', () => {
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'toolu_1', name: 'x', argsJson: '{}' }] },
    ] }) as any;
    expect(body.messages[1]).toEqual({ role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'x', input: {}, cache_control: { type: 'ephemeral', ttl: '1h' } }] });
  });

  // A tool result rides on a user turn as a tool_result block, which must come FIRST (before any text).
  it('serializes a tool-result user turn with the tool_result block first', () => {
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', cacheTtl: '5m', messages: [
      { role: 'user', content: 'thanks', toolResults: [{ callId: 'toolu_1', content: 'file body' }] },
    ] }) as any;
    expect(body.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_1', content: 'file body' },
        { type: 'text', text: 'thanks', cache_control: { type: 'ephemeral' } },
      ],
    });
  });

  // A failed tool result re-emits is_error:true on its tool_result block; a successful one omits the flag.
  it('re-emits tool_result is_error only for a failed tool call', () => {
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', messages: [
      { role: 'user', content: '', toolResults: [
        { callId: 'toolu_ok', content: 'done' },
        { callId: 'toolu_bad', content: 'boom', isError: true },
      ] },
    ] }) as any;
    const blocks = body.messages[0].content;
    expect(blocks[0]).toEqual({ type: 'tool_result', tool_use_id: 'toolu_ok', content: 'done' });
    expect(blocks[1].is_error).toBe(true);
    expect(blocks[1].tool_use_id).toBe('toolu_bad');
  });

  // Malformed argument JSON degrades to {} rather than throwing (a backend can stream partial/bad JSON).
  it('degrades unparseable tool-call arguments to an empty object', () => {
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', messages: [
      { role: 'assistant', content: '', toolCalls: [{ id: 'toolu_1', name: 'x', argsJson: '{bad' }] },
    ] }) as any;
    expect(body.messages[0].content[0].input).toEqual({});
  });

  // A plain text turn (no tools) still serializes as a bare string — the #29 shape is unchanged, and the
  // attribution fingerprint still derives from the first user turn's TEXT (the #28 contract).
  it('keeps plain turns as strings and preserves the fingerprint source', () => {
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: '0.19.0', messages: [
      { role: 'user', content: 'first text' },
      { role: 'assistant', content: 'ok', toolCalls: [{ id: 'toolu_1', name: 'x', argsJson: '{}' }] },
    ] }) as any;
    expect(body.messages[0]).toEqual({ role: 'user', content: 'first text' });
    expect(body.system[0].text).toBe(anthropicAttribution('first text', '0.19.0'));
  });

  // A full agent round-trip locks the load-bearing Messages-API adjacency the turns are mapped to preserve:
  // a plain user turn, then an assistant turn ending in a tool_use block, IMMEDIATELY followed by a user turn
  // whose content STARTS with the matching tool_result(tool_use_id). Mirrors Codex #15's round-trip test.
  it('preserves order across a full tool round-trip', () => {
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', messages: [
      { role: 'user', content: 'read a.ts' },
      { role: 'assistant', content: 'sure', toolCalls: [{ id: 'toolu_1', name: 'readFile', argsJson: '{}' }] },
      { role: 'user', content: 'thanks', toolResults: [{ callId: 'toolu_1', content: 'file body' }] },
    ] }) as any;
    expect(body.messages).toEqual([
      { role: 'user', content: 'read a.ts' },
      { role: 'assistant', content: [{ type: 'text', text: 'sure' }, { type: 'tool_use', id: 'toolu_1', name: 'readFile', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'file body' }, { type: 'text', text: 'thanks', cache_control: { type: 'ephemeral', ttl: '1h' } }] },
    ]);
  });

  // Anthropic's native parallel shape: several tool_use blocks are SIBLINGS inside one assistant turn's
  // content array (after the optional leading text), not separate turns. (Codex differs — flat function_call
  // items.) Locks that all calls survive, in order, after the text block.
  it('serializes multiple parallel tool calls as sibling tool_use blocks in one assistant turn', () => {
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'x', toolCalls: [
        { id: 'toolu_a', name: 'a', argsJson: '{"p":1}' },
        { id: 'toolu_b', name: 'b', argsJson: '{"q":2}' },
      ] },
    ] }) as any;
    expect(body.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'x' },
        { type: 'tool_use', id: 'toolu_a', name: 'a', input: { p: 1 } },
        { type: 'tool_use', id: 'toolu_b', name: 'b', input: { q: 2 }, cache_control: { type: 'ephemeral', ttl: '1h' } },
      ],
    });
  });
});

describe('buildAnthropicMessagesBody — images', () => {
  // An image-bearing user turn becomes a content-block array: the image block (base64 source) before the
  // text block (Anthropic's recommended vision ordering). Was silently dropped before — the screenshot bug.
  it('serializes an image user turn as image-then-text blocks', () => {
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', cacheTtl: '5m', messages: [
      { role: 'user', content: 'do u see this image?', images: [{ mimeType: 'image/png', dataBase64: 'AAAA' }] },
    ] }) as any;
    expect(body.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
        { type: 'text', text: 'do u see this image?', cache_control: { type: 'ephemeral' } },
      ],
    });
  });

  // An image with no accompanying prose emits just the image block — no empty text block (Anthropic rejects it).
  it('omits the text block for an image-only user turn', () => {
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', cacheTtl: '5m', messages: [
      { role: 'user', content: '', images: [{ mimeType: 'image/jpeg', dataBase64: 'BBBB' }] },
    ] }) as any;
    expect(body.messages[0]).toEqual({
      role: 'user',
      content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BBBB' }, cache_control: { type: 'ephemeral' } }],
    });
  });

  // tool_result must still lead; images and text follow it on the same user turn.
  it('orders tool_result before image before text on one user turn', () => {
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', cacheTtl: '5m', messages: [
      { role: 'user', content: 'and this?', toolResults: [{ callId: 'toolu_1', content: 'done' }], images: [{ mimeType: 'image/png', dataBase64: 'CCCC' }] },
    ] }) as any;
    expect(body.messages[0].content).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_1', content: 'done' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'CCCC' } },
      { type: 'text', text: 'and this?', cache_control: { type: 'ephemeral' } },
    ]);
  });
});

describe('buildAnthropicMessagesBody — documents', () => {
  // A document-bearing user turn becomes a content-block array: the document block (base64 source) before
  // the text block, mirroring the image ordering. Was silently dropped before — the vanishing-PDF bug.
  it('serializes a document user turn as document-then-text blocks', () => {
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', cacheTtl: '5m', messages: [
      { role: 'user', content: 'summarize this', documents: [{ mimeType: 'application/pdf', dataBase64: 'JVBERI' }] },
    ] }) as any;
    expect(body.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERI' } },
        { type: 'text', text: 'summarize this', cache_control: { type: 'ephemeral' } },
      ],
    });
  });

  // Full ordering on one turn: tool_result leads (API pairing rule), then documents, then images, then text.
  it('orders tool_result before document before image before text on one user turn', () => {
    const body = buildAnthropicMessagesBody({ model: 'm', maxTokens: 1, version: 'v', cacheTtl: '5m', messages: [
      { role: 'user', content: 'and this?', toolResults: [{ callId: 'toolu_1', content: 'done' }],
        images: [{ mimeType: 'image/png', dataBase64: 'CCCC' }],
        documents: [{ mimeType: 'application/pdf', dataBase64: 'JVBERI' }] },
    ] }) as any;
    expect(body.messages[0].content).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_1', content: 'done' },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERI' } },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'CCCC' } },
      { type: 'text', text: 'and this?', cache_control: { type: 'ephemeral' } },
    ]);
  });
});

describe('anthropicTruncationReason', () => {
  // The message_delta stop_reason that means the reply was CUT SHORT (budget / filter / refusal) — the only
  // signal the streamed text deltas can't carry, so #87 surfaces it as a visible marker. The Anthropic analogue
  // of responsesIncompleteReason.
  it('returns the reason for a truncating stop_reason', () => {
    expect(anthropicTruncationReason('max_tokens')).toBe('max_tokens');
    expect(anthropicTruncationReason('content_filter')).toBe('content_filter');
    expect(anthropicTruncationReason('refusal')).toBe('refusal');
  });

  // A clean close (end_turn/tool_use/stop_sequence/pause_turn), an unknown string, or undefined all mean
  // "not truncated" → undefined (no marker, no false alarm on a good turn).
  it('returns undefined for a clean or unknown stop_reason', () => {
    expect(anthropicTruncationReason('end_turn')).toBeUndefined();
    expect(anthropicTruncationReason('tool_use')).toBeUndefined();
    expect(anthropicTruncationReason('stop_sequence')).toBeUndefined();
    expect(anthropicTruncationReason('pause_turn')).toBeUndefined();
    expect(anthropicTruncationReason(undefined)).toBeUndefined();
  });
});

// #87: stub global.fetch to hand back a Response streaming Messages SSE bytes, so anthropicStream's END-state
// handling (clean, content-less, truncated, or dropped) is exercised without a live Anthropic backend. The
// sibling of codex.test.ts's `codexStream (streaming IO)` block — same harness, Messages wire.
describe('anthropicStream (streaming IO)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const sseResponse = (blocks: string[]): Response => {
    const text = blocks.map((b) => `${b}\n\n`).join('');
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } });
    return new Response(body, { status: 200 });
  };
  const stub = (blocks: string[]) => vi.stubGlobal('fetch', async () => sseResponse(blocks));
  const args = { creds: { accessToken: 'at' }, baseUrl: 'https://x', model: 'claude-opus-4-8', messages: [{ role: 'user' as const, content: 'hi' }] };
  const collect = async (gen: AsyncGenerator<any>): Promise<any[]> => { const out: any[] = []; for await (const ev of gen) out.push(ev); return out; };

  // Happy path: text_delta fragments render live; a clean end_turn terminal adds no marker.
  it('yields text deltas live and adds no marker on a clean end_turn', async () => {
    stub([
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"Hel"}}',
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"lo"}}',
      'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"}}',
      'event: message_stop\ndata: {"type":"message_stop"}',
    ]);
    expect(await collect(anthropicStream(args))).toEqual([
      { type: 'text', value: 'Hel' },
      { type: 'text', value: 'lo' },
    ]);
  });

  // #88: the streaming path requests the model's OUTPUT CEILING as max_tokens (Opus 128K), not the bounded 16K
  // Inquire cap — a hard 16K starves a high-effort reasoning turn before its answer lands.
  it('requests the model output ceiling as max_tokens on the streaming path', async () => {
    let sentBody: any;
    vi.stubGlobal('fetch', async (_url: string, init: any) => {
      sentBody = JSON.parse(init.body);
      return sseResponse([
        'event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"hi"}}',
        'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"}}',
        'event: message_stop\ndata: {"type":"message_stop"}',
      ]);
    });
    await collect(anthropicStream({ ...args, model: 'claude-opus-4-8' }));
    expect(sentBody.max_tokens).toBe(anthropicModelCaps('claude-opus-4-8').maxOutput);
    expect(sentBody.max_tokens).toBeGreaterThan(16_000);
  });

  // #149: real claude posts to /v1/messages?beta=true — the query flag rides every Messages request.
  it('posts to /v1/messages?beta=true', async () => {
    let sentUrl = '';
    vi.stubGlobal('fetch', async (url: string, _init: any) => {
      sentUrl = String(url);
      return sseResponse([
        'event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"hi"}}',
        'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"}}',
        'event: message_stop\ndata: {"type":"message_stop"}',
      ]);
    });
    await collect(anthropicStream(args));
    expect(sentUrl).toBe('https://x/v1/messages?beta=true');
  });

  // #149: the version bump must reach the WIRE BODY's cc_version billing block, not only the UA — the
  // client feeds CLAUDE_CODE_VERSION into the attribution fingerprint the backend ties to the UA.
  it('embeds cc_version=2.1.216 in the request body attribution block', async () => {
    let sentBody: any;
    vi.stubGlobal('fetch', async (_url: string, init: any) => {
      sentBody = JSON.parse(init.body);
      return sseResponse([
        'event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"hi"}}',
        'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"}}',
        'event: message_stop\ndata: {"type":"message_stop"}',
      ]);
    });
    await collect(anthropicStream(args));
    expect(sentBody.system[0].text).toContain('cc_version=2.1.216.');
  });

  // #139: the Bridge threads the volatile system tail through to the body builder — the wire body must
  // carry it as the last (unmarked) system block.
  it('threads systemSuffix through to the request body', async () => {
    let sentBody: any;
    vi.stubGlobal('fetch', async (_url: string, init: any) => {
      sentBody = JSON.parse(init.body);
      return sseResponse([
        'event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"hi"}}',
        'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"}}',
        'event: message_stop\ndata: {"type":"message_stop"}',
      ]);
    });
    await collect(anthropicStream({ ...args, systemSuffix: '<system-reminder>note</system-reminder>' }));
    const last = sentBody.system[sentBody.system.length - 1];
    expect(last).toEqual({ type: 'text', text: '<system-reminder>note</system-reminder>' });
    expect(sentBody.system[sentBody.system.length - 2].cache_control).toBeDefined();
  });

  // A clean tool_use turn (no answer text) is delivered content — must not throw or add any marker.
  it('yields a tool call on a clean tool_use turn with no text', async () => {
    stub([
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"readFile"}}',
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"a.ts\\"}"}}',
      'event: content_block_stop\ndata: {"index":0}',
      'event: message_delta\ndata: {"delta":{"stop_reason":"tool_use"}}',
      'event: message_stop\ndata: {"type":"message_stop"}',
    ]);
    expect(await collect(anthropicStream(args))).toEqual([
      { type: 'toolCall', call: { id: 'toolu_1', name: 'readFile', argsJson: '{"path":"a.ts"}' } },
    ]);
  });

  // THE bug: a content-less turn — message_start → message_delta(end_turn) → message_stop, zero content blocks —
  // was forwarded as a valid-but-empty envelope Claude Code rejects as "empty or malformed". Now it throws, so
  // the door writes a real error frame / 502 instead of the silent empty SSE.
  it('throws on a content-less end_turn envelope instead of yielding nothing', async () => {
    stub([
      'event: message_start\ndata: {"message":{"content":[]}}',
      'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"}}',
      'event: message_stop\ndata: {"type":"message_stop"}',
    ]);
    await expect(collect(anthropicStream(args))).rejects.toThrow(/empty response/);
  });

  // Thinking passthrough: the block start, thinking deltas, and the closing signature all yield LIVE, in
  // stream order, so the door can forward them — a thinking-only turn is delivered content, not the
  // empty-envelope throw.
  it('yields thinking start, deltas, and signature live on a thinking-only turn', async () => {
    stub([
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"thinking","thinking":""}}',
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}',
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"signature_delta","signature":"sig-1"}}',
      'event: content_block_stop\ndata: {"index":0}',
      'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"}}',
      'event: message_stop\ndata: {"type":"message_stop"}',
    ]);
    expect(await collect(anthropicStream(args))).toEqual([
      { type: 'thinkingStart' },
      { type: 'thinking', value: 'hmm' },
      { type: 'thinkingSignature', value: 'sig-1' },
    ]);
  });

  // Interleaved thinking: tool calls yield at their STREAM POSITION (assembled per block on its
  // content_block_stop), not folded at stream end — otherwise [thinking₁, tool₁, thinking₂, tool₂]
  // reaches the client as [thinking₁, thinking₂, tool₁, tool₂] and the replayed turn is shuffled.
  it('yields tool calls in stream position between thinking segments', async () => {
    stub([
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"thinking","thinking":""}}',
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"signature_delta","signature":"s1"}}',
      'event: content_block_stop\ndata: {"index":0}',
      'event: content_block_start\ndata: {"index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"read"}}',
      'event: content_block_delta\ndata: {"index":1,"delta":{"type":"input_json_delta","partial_json":"{}"}}',
      'event: content_block_stop\ndata: {"index":1}',
      'event: content_block_start\ndata: {"index":2,"content_block":{"type":"thinking","thinking":""}}',
      'event: content_block_delta\ndata: {"index":2,"delta":{"type":"signature_delta","signature":"s2"}}',
      'event: content_block_stop\ndata: {"index":2}',
      'event: content_block_start\ndata: {"index":3,"content_block":{"type":"tool_use","id":"toolu_2","name":"write"}}',
      'event: content_block_delta\ndata: {"index":3,"delta":{"type":"input_json_delta","partial_json":"{\\"a\\":1}"}}',
      'event: content_block_stop\ndata: {"index":3}',
      'event: message_delta\ndata: {"delta":{"stop_reason":"tool_use"}}',
      'event: message_stop\ndata: {"type":"message_stop"}',
    ]);
    expect(await collect(anthropicStream(args))).toEqual([
      { type: 'thinkingStart' },
      { type: 'thinkingSignature', value: 's1' },
      { type: 'toolCall', call: { id: 'toolu_1', name: 'read', argsJson: '{}' } },
      { type: 'thinkingStart' },
      { type: 'thinkingSignature', value: 's2' },
      { type: 'toolCall', call: { id: 'toolu_2', name: 'write', argsJson: '{"a":1}' } },
    ]);
  });

  // A tool block whose content_block_stop never arrives (dropped socket) still folds at stream end —
  // the old assemble-at-end resilience is the fallback, not the main path.
  it('folds an unterminated tool block at stream end', async () => {
    stub([
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"read"}}',
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"p\\":1}"}}',
      'event: message_delta\ndata: {"delta":{"stop_reason":"tool_use"}}',
      'event: message_stop\ndata: {"type":"message_stop"}',
    ]);
    expect(await collect(anthropicStream(args))).toEqual([
      { type: 'toolCall', call: { id: 'toolu_1', name: 'read', argsJson: '{"p":1}' } },
    ]);
  });

  // THE live wire shape (verified against the OAuth endpoint): the subscription backend emits thinking
  // blocks with EMPTY thinking text — content_block_start straight to signature_delta, no thinking_delta
  // at all. The start event alone must open the block or the signed block is lost entirely.
  it('yields an empty thinking block (start straight to signature) with the text', async () => {
    stub([
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}',
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"signature_delta","signature":"sig-live"}}',
      'event: content_block_stop\ndata: {"index":0}',
      'event: content_block_delta\ndata: {"index":1,"delta":{"type":"text_delta","text":"Hi"}}',
      'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"}}',
      'event: message_stop\ndata: {"type":"message_stop"}',
    ]);
    expect(await collect(anthropicStream(args))).toEqual([
      { type: 'thinkingStart' },
      { type: 'thinkingSignature', value: 'sig-live' },
      { type: 'text', value: 'Hi' },
    ]);
  });

  // Thinking rides BEFORE the answer in stream order, and a redacted_thinking block (arriving whole on its
  // content_block_start) passes through as one opaque event.
  it('yields thinking, redacted_thinking, and text in stream order', async () => {
    stub([
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"thinking_delta","thinking":"let me see"}}',
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"signature_delta","signature":"sig-a"}}',
      'event: content_block_start\ndata: {"index":1,"content_block":{"type":"redacted_thinking","data":"opaque"}}',
      'event: content_block_delta\ndata: {"index":2,"delta":{"type":"text_delta","text":"Hi"}}',
      'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"}}',
      'event: message_stop\ndata: {"type":"message_stop"}',
    ]);
    expect(await collect(anthropicStream(args))).toEqual([
      { type: 'thinking', value: 'let me see' },
      { type: 'thinkingSignature', value: 'sig-a' },
      { type: 'redactedThinking', data: 'opaque' },
      { type: 'text', value: 'Hi' },
    ]);
  });

  // max_tokens truncation WITH partial text: keep the text, append a visible truncation marker carrying the
  // reason (no longer relabeled a clean end_turn).
  it('appends a truncation marker with the stop_reason after partial text', async () => {
    stub([
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"cut here"}}',
      'event: message_delta\ndata: {"delta":{"stop_reason":"max_tokens"}}',
      'event: message_stop\ndata: {"type":"message_stop"}',
    ]);
    const out = await collect(anthropicStream(args));
    expect(out[0]).toEqual({ type: 'text', value: 'cut here' });
    expect(out.at(-1)).toEqual({ type: 'text', value: '\n\n_[Response truncated: max_tokens]_' });
  });

  // max_tokens truncation with NO visible text (a thinking turn that spent the budget — the #88 amplifier):
  // surface the reason as a marker rather than throwing, so the user sees WHY it was empty.
  it('surfaces the truncation reason even when nothing visible was delivered', async () => {
    stub([
      'event: message_delta\ndata: {"delta":{"stop_reason":"max_tokens"}}',
      'event: message_stop\ndata: {"type":"message_stop"}',
    ]);
    expect(await collect(anthropicStream(args))).toEqual([
      { type: 'text', value: '\n\n_[Response truncated: max_tokens]_' },
    ]);
  });

  // Partial text but the terminal frame was lost (idle socket/proxy drop): keep the text, only flag the abrupt
  // end — never discard delivered content, never false-alarm a good turn whose tail frame was merely dropped.
  it('keeps streamed text and appends a soft marker when the terminal frame is missing', async () => {
    stub(['event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"partial answer"}}']);
    const out = await collect(anthropicStream(args));
    expect(out[0]).toEqual({ type: 'text', value: 'partial answer' });
    expect(out.at(-1).value).toMatch(/ended before completion/);
  });

  // A bare `error` frame emitted after the 200 with nothing delivered surfaces its message (not the generic empty).
  it('throws the backend error message on a content-less error frame', async () => {
    stub(['event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"boom"}}']);
    await expect(collect(anthropicStream(args))).rejects.toThrow('boom');
  });
});

// The real token usage the Bridge otherwise discards — forwarding it makes the wisped client's token meter
// match native Claude Code. Samples are the exact shapes captured off the live Messages wire.
describe('anthropicUsage', () => {
  const ev = (event: string, data: unknown): SseEvent => ({ event, data });

  it('reads the initial input/cache snapshot off message_start', () => {
    const u = anthropicUsage(ev('message_start', { message: { usage: { input_tokens: 2, cache_creation_input_tokens: 1755, cache_read_input_tokens: 0, output_tokens: 7 } } }));
    expect(u).toEqual({ input_tokens: 2, cache_creation_input_tokens: 1755, cache_read_input_tokens: 0, output_tokens: 7 });
  });

  it('reads the final cumulative counts off message_delta', () => {
    const u = anthropicUsage(ev('message_delta', { usage: { input_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: 1755, output_tokens: 20 } }));
    expect(u).toEqual({ input_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: 1755, output_tokens: 20 });
  });

  it('defaults absent cache/output fields to 0 (a bare input_tokens still yields usage)', () => {
    expect(anthropicUsage(ev('message_start', { message: { usage: { input_tokens: 5 } } }))).toEqual({ input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 });
  });

  it('is undefined for events without usage (content deltas, tool blocks, ping)', () => {
    expect(anthropicUsage(ev('content_block_delta', { delta: { type: 'text_delta', text: 'hi' } }))).toBeUndefined();
    expect(anthropicUsage(ev('ping', {}))).toBeUndefined();
    expect(anthropicUsage(ev('message_delta', { delta: { stop_reason: 'end_turn' } }))).toBeUndefined();
  });
});

// The Bridge's #111 regression guard: classify a completed request's cache economics from its usage so a
// silently-broken prefix (everything re-billed uncached) shows up in the log instead of only on the bill.
describe('anthropicCacheOutcome', () => {
  const usage = (over: Partial<BridgeUsage>): BridgeUsage => ({ input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0, ...over });

  it('reads a cached prefix as a hit', () => {
    expect(anthropicCacheOutcome(usage({ cache_read_input_tokens: 12_000, input_tokens: 40 }), 5).kind).toBe('hit');
  });

  it('reads a first write (no read, some creation) as fresh — not a miss', () => {
    expect(anthropicCacheOutcome(usage({ cache_creation_input_tokens: 9_000, input_tokens: 40 }), 1).kind).toBe('fresh');
  });

  it('flags a multi-turn request that read nothing while billing a large uncached input as a miss', () => {
    const out = anthropicCacheOutcome(usage({ cache_read_input_tokens: 0, input_tokens: 18_000 }), 5);
    expect(out).toEqual({ kind: 'miss', readTokens: 0, creationTokens: 0, uncachedInput: 18_000 });
  });

  it('does not flag turn 1 as a miss — there is no prior write to read yet', () => {
    expect(anthropicCacheOutcome(usage({ cache_read_input_tokens: 0, input_tokens: 18_000 }), 1).kind).not.toBe('miss');
  });

  it('does not flag a small uncached input as a miss (no real prefix to have cached)', () => {
    expect(anthropicCacheOutcome(usage({ cache_read_input_tokens: 0, input_tokens: 200 }), 5).kind).toBe('none');
  });

  // #139: the system-fold bust re-bills the prefix through cache_CREATION (input stays ~2), so the
  // input-keyed guard above never fired. A multi-turn request that read nothing while re-WRITING a large
  // prefix is the same regression shape.
  it('flags a multi-turn request that read nothing while re-writing a large prefix as a miss', () => {
    const out = anthropicCacheOutcome(usage({ cache_read_input_tokens: 0, cache_creation_input_tokens: 77_762, input_tokens: 2 }), 5);
    expect(out).toEqual({ kind: 'miss', readTokens: 0, creationTokens: 77_762, uncachedInput: 2 });
  });

  it('keeps a small mid-session write fresh, not a miss', () => {
    expect(anthropicCacheOutcome(usage({ cache_creation_input_tokens: 276, input_tokens: 2 }), 5).kind).toBe('fresh');
  });

  it('does not flag a large first-turn write as a miss', () => {
    expect(anthropicCacheOutcome(usage({ cache_creation_input_tokens: 77_000, input_tokens: 2 }), 1).kind).toBe('fresh');
  });

  // #146 (#145's signature): something WAS read (the stable prefix) but a large re-write happened behind
  // it — the whole-history re-bill hoisted reminders caused. Classifying it as a plain hit kept the log
  // silent through 8-11 such events per session.
  it('flags a read with a large re-write behind it as partial', () => {
    const out = anthropicCacheOutcome(usage({ cache_read_input_tokens: 58_171, cache_creation_input_tokens: 34_000, input_tokens: 4 }), 9);
    expect(out).toEqual({ kind: 'partial', readTokens: 58_171, creationTokens: 34_000, uncachedInput: 4 });
  });

  it('keeps a read with a small write behind it a healthy hit', () => {
    expect(anthropicCacheOutcome(usage({ cache_read_input_tokens: 58_171, cache_creation_input_tokens: 3_999, input_tokens: 4 }), 9).kind).toBe('hit');
  });

  it('flags partial exactly at the creation floor', () => {
    expect(anthropicCacheOutcome(usage({ cache_read_input_tokens: 10_000, cache_creation_input_tokens: 4_000 }), 3).kind).toBe('partial');
  });

  // The first exchange legitimately writes the whole history behind whatever prefix a warm server had.
  it('exempts the first exchange from partial', () => {
    expect(anthropicCacheOutcome(usage({ cache_read_input_tokens: 10_000, cache_creation_input_tokens: 30_000 }), 1).kind).toBe('hit');
  });
});

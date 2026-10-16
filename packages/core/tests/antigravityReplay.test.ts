import { describe, it, expect } from 'vitest';
import { buildAntigravityRequestBody, createAntigravityReplayContext } from '../src/antigravity';
import { preflightAntigravityResponses, prepareAntigravityReplay, finishAntigravityResponses } from '../src/antigravityResponses';

describe('Antigravity replay credential context', () => {
  const creds = { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', projectId: 'synthetic-project' };
  const secret = 'synthetic-local-bridge-secret-with-enough-entropy-for-a-fixture';
  it('survives access-token renewal without exposing the token or requiring another key', () => {
    const initial = createAntigravityReplayContext(creds, secret);
    expect(initial).toBeDefined();
    expect(Buffer.from(initial!.key, 'base64url')).toHaveLength(32);
    const renewed = createAntigravityReplayContext({ ...creds, accessToken: 'renewed-access' }, secret)!;
    expect(renewed).toMatchObject({ key: initial!.key, lifetime: initial!.lifetime, credentialBinding: initial!.credentialBinding });
    expect(renewed.snapshot).not.toBe(initial!.snapshot);
    expect(JSON.stringify(initial)).not.toContain('synthetic-');
  });
  it('changes with the refresh identity, project or local Bridge secret', () => {
    const initial = createAntigravityReplayContext(creds, secret);
    for (const changed of [{ ...creds, refreshToken: 'different-refresh' }, { ...creds, projectId: 'different-project' }]) {
      expect(createAntigravityReplayContext(changed, secret)).not.toEqual(initial);
    }
    expect(createAntigravityReplayContext(creds, secret + '-changed')).not.toEqual(initial);
  });
  it('is unavailable when signed out or missing a stable refresh identity', () => {
    expect(createAntigravityReplayContext(undefined, secret)).toBeUndefined();
    expect(createAntigravityReplayContext({ ...creds, refreshToken: undefined }, secret)).toBeUndefined();
    expect(createAntigravityReplayContext(creds, '')).toBeUndefined();
    expect(createAntigravityReplayContext({ ...creds, accessToken: '' }, secret)).toBeUndefined();
  });
});

describe('Argon Responses opaque-state round trip', () => {
  const headers = ['session_id', '11111111-1111-4111-8111-111111111111'];
  const provider = { id: 'antigravity', kind: 'antigravity-oauth', baseUrl: 'https://daily-cloudcode-pa.googleapis.com' };
  const model = 'gemini-4-argon-low';
  const context = createAntigravityReplayContext({ accessToken: 'access', refreshToken: 'refresh', projectId: 'project' }, 'bridge-secret')!;
  const body = () => ({ model: 'my-argon-alias', instructions: 'ROOT', input: [{ role: 'user', content: 'Read both numbers.' }],
    tools: [{ type: 'function', name: 'get_number', parameters: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] } }],
    reasoning: { effort: 'low' }, max_output_tokens: 2048, stream: true, store: false });
  const first = () => {
    const raw = body(), prepared = prepareAntigravityReplay(preflightAntigravityResponses(raw, headers, provider, model), context);
    const name = prepared.parsed.tools[0].name;
    const native = { response: { modelVersion: 'gemini-4-argon', candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [
      { thought: true, text: 'synthetic private state', thoughtSignature: 'hidden-thought-state' },
      { functionCall: { id: 'original-left', name, args: { label: 'LEFT' } }, thoughtSignature: 'hidden-call-state' },
      { functionCall: { id: 'original-right', name, args: { label: 'RIGHT' } }, futureState: { bytes: 'opaque' } },
    ] } }], usageMetadata: { promptTokenCount: 108, candidatesTokenCount: 40, thoughtsTokenCount: 3 } } };
    const output = finishAntigravityResponses(prepared, native, 'resp_fixture');
    const followup: any = { ...raw, input: [...raw.input, ...output.response.output,
      { type: 'function_call_output', call_id: 'original-right', output: '25' },
      { type: 'function_call_output', call_id: 'original-left', output: '17' }] };
    return { raw, prepared, native, output, followup };
  };
  it('carries complete model parts through standard encrypted reasoning and preserves original call identities', () => {
    const f = first();
    expect(f.output.response.output.map((item: any) => item.type)).toEqual(['reasoning', 'function_call', 'function_call']);
    expect(f.output.response.output.slice(1).map((item: any) => [item.call_id, item.name])).toEqual([['original-left', 'get_number'], ['original-right', 'get_number']]);
    expect(f.output.frames).toContain('response.completed');
    expect(f.output.frames).not.toContain('hidden-call-state');
    expect(f.output.frames).not.toContain('synthetic private state');
    const replay = prepareAntigravityReplay(preflightAntigravityResponses(f.followup, headers, provider, model), context);
    const wire = buildAntigravityRequestBody({ ...replay.request, requestId: 'continuation' });
    expect(wire.request.contents[1].parts).toEqual(f.native.response.candidates[0].content.parts);
    expect(wire.request.contents[2].parts.map((p: any) => [p.functionResponse.id, p.functionResponse.response.result])).toEqual([['original-left', '17'], ['original-right', '25']]);
    expect(wire.request.generationConfig.maxOutputTokens).toBe(2048);
    expect(f.output.response.usage.output_tokens).toBe(43);
  });
  it.each(['ciphertext', 'prefix', 'arguments', 'removed-call', 'missing-result', 'tools', 'alias'])('refuses %s tampering or incomplete replay', kind => {
    const { followup } = first();
    if (kind === 'ciphertext') { const carrier = followup.input[1]; const i = 40; carrier.encrypted_content = carrier.encrypted_content.slice(0, i) + (carrier.encrypted_content[i] === 'A' ? 'B' : 'A') + carrier.encrypted_content.slice(i + 1); }
    if (kind === 'prefix') followup.input[0].content = 'Changed earlier instruction';
    if (kind === 'arguments') followup.input[2].arguments = '{"label":"CHANGED"}';
    if (kind === 'removed-call') followup.input.splice(2, 1);
    if (kind === 'missing-result') followup.input.pop();
    if (kind === 'tools') followup.tools[0].description = 'Changed definition';
    if (kind === 'alias') followup.model = 'other-alias';
    expect(() => prepareAntigravityReplay(preflightAntigravityResponses(followup, headers, provider, model), context)).toThrow();
  });
  it('refuses cross-session, route, instruction-policy and credential replay', () => {
    const { followup } = first();
    for (const [h, p, m, hoisting, c] of [
      [['session_id', '22222222-2222-4222-8222-222222222222'], provider, model, false, context],
      [headers, { ...provider, baseUrl: 'https://example.test' }, model, false, context],
      [headers, provider, 'gemini-4-argon-medium', false, context],
      [headers, provider, model, true, context],
      [headers, provider, model, false, { ...context, lifetime: 'replaced' }],
    ] as const) expect(() => prepareAntigravityReplay(preflightAntigravityResponses({ ...followup, reasoning: undefined }, [...h], p, m, hoisting), c)).toThrow();
  });
  it('requires original state for assistant history and exact fixed-tier effort', () => {
    expect(() => prepareAntigravityReplay(preflightAntigravityResponses({ ...body(), input: [{ role: 'assistant', content: 'unproven' }] }, headers, provider, model), context)).toThrow();
    expect(() => preflightAntigravityResponses({ ...body(), reasoning: { effort: 'high' } }, headers, provider, model)).toThrow();
  });
  it('rejects an unusable replay key before a first provider turn', () => {
    expect(() => prepareAntigravityReplay(preflightAntigravityResponses(body(), headers, provider, model), { ...context, key: 'bad' })).toThrow();
  });
  it.each(['cipher-format', 'verbosity'])('rejects unsupported %s during preflight', kind => {
    const raw: any = body();
    if (kind === 'cipher-format') raw.input.push({ type: 'reasoning', summary: [], encrypted_content: 'wisp.antigravity.v1.!!!' });
    else raw.text = { verbosity: 'high' };
    expect(() => preflightAntigravityResponses(raw, headers, provider, model)).toThrow();
  });
  it('only hoists positioned developer instructions under the explicit Desktop policy', () => {
    const raw = { ...body(), input: [{ role: 'user', content: 'Read.' }, { role: 'developer', content: 'EXPLICIT POLICY' }] };
    expect(() => prepareAntigravityReplay(preflightAntigravityResponses(raw, headers, provider, model), context)).toThrow();
    const prepared = prepareAntigravityReplay(preflightAntigravityResponses(raw, headers, provider, model, true), context);
    const wire = buildAntigravityRequestBody({ ...prepared.request, requestId: 'policy' });
    expect(wire.request.systemInstruction.parts.map((part: any) => part.text)).toEqual(['ROOT', 'EXPLICIT POLICY']);
  });
  it('refuses truncated output, unknown tools and missing usage before emitting executable output', () => {
    for (const mutate of [
      (x: any) => { x.response.candidates[0].finishReason = 'MAX_TOKENS'; },
      (x: any) => { x.response.candidates[0].content.parts[1].functionCall.name = 'unknown_tool'; },
      (x: any) => { delete x.response.usageMetadata; },
      (x: any) => { x.response.usageMetadata.candidatesTokenCount = 2049; },
    ]) { const f = first(); mutate(f.native); expect(() => finishAntigravityResponses(f.prepared, f.native, 'bad')).toThrow(); }
  });
});

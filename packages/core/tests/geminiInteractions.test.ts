import { describe, expect, it } from 'vitest';
import {
  buildGeminiInteractionRequest, parseGeminiInteraction, GeminiInteractionError,
  type GeminiInteractionArgs, type GeminiStep,
} from '../src/geminiInteractions';

// Independent full-step fixture, matching the pinned beta schema and A2a's interleaved calls.
const modelSteps: GeminiStep[] = [
  { type: 'thought', signature: 'c2lnbmF0dXJlLUE=', summary: [{ type: 'text', text: 'Summary A.' }] },
  { type: 'model_output', content: [{ type: 'text', text: 'Before tools α\n' }] },
  { type: 'function_call', id: 'call_argon_A-7', name: 'lookup', arguments: { value: 'left', nested: { n: 7 } } },
  { type: 'thought', signature: 'c2lnbmF0dXJlLUI=', summary: [{ type: 'text', text: 'Summary B.' }] },
  { type: 'function_call', id: 'call_argon_B-9', name: 'lookup', arguments: { value: 'right', nested: { n: 9 } } },
];
const user: GeminiStep = { type: 'user_input', content: [{ type: 'text', text: 'Find both.' }] };
const results: GeminiStep[] = [
  { type: 'function_result', call_id: 'call_argon_B-9', result: [{ type: 'text', text: 'right result' }], is_error: false },
  { type: 'function_result', call_id: 'call_argon_A-7', name: 'lookup', result: { answer: 'left result' } },
];
const history = [user, ...modelSteps, ...results, { type: 'model_output', content: [{ type: 'text', text: 'Done.' }] }, user] as const;
const base: GeminiInteractionArgs = { model: 'gemini-4-argon', input: [user] };
const build = (extra: Record<string, unknown>) => buildGeminiInteractionRequest({ ...base, ...extra } as GeminiInteractionArgs);

describe('stateless Gemini request', () => {
  it.each(['low', 'medium', 'high', undefined])('maps effort %s and retains every step without mutation', effort => {
    const source = structuredClone(history);
    const original = structuredClone(source);
    const request = build({ input: source, effort, systemInstruction: 'Exact\npolicy α', maxOutputTokens: 65536,
      tools: [{ name: 'lookup', description: 'Find a value', inputSchema: { type: 'object', properties: { value: { type: 'string' } } } }] });
    expect(request).toEqual({ model: 'gemini-4-argon', input: original, system_instruction: 'Exact\npolicy α',
      generation_config: { thinking_level: effort ?? 'medium', max_output_tokens: 65536 },
      tools: [{ type: 'function', name: 'lookup', description: 'Find a value', parameters: { type: 'object', properties: { value: { type: 'string' } } } }],
      stream: false, store: false, background: false });
    expect(source).toEqual(original);
    expect(request.input).toBe(source);
  });

  it('keeps absent options absent and does not synthesize content, signatures or schemas', () => {
    expect(build({ input: [{ type: 'user_input' }, { type: 'thought' }, { type: 'model_output' }],
      tools: [{ name: 'nothing', description: '' }] })).toEqual({ model: 'gemini-4-argon',
      input: [{ type: 'user_input' }, { type: 'thought' }, { type: 'model_output' }],
      generation_config: { thinking_level: 'medium' }, tools: [{ type: 'function', name: 'nothing', description: '' }],
      stream: false, store: false, background: false });
    expect(build({})).not.toHaveProperty('tools');
    expect(build({ systemInstruction: '' }).system_instruction).toBe('');
  });

  it.each([
    { model: 'gemini-4-argon-high' }, { model: 'models/gemini-4-argon' }, { model: 'gemini-3.6-flash' },
    ...['minimal', 'xhigh', 'max', '', null].map(effort => ({ effort })),
    ...[0, -1, 1.5, 65537, NaN, Infinity, null].map(maxOutputTokens => ({ maxOutputTokens })),
    { systemInstruction: [] }, { temperature: 0.5 }, { top_p: 0.9 }, { top_k: 3 },
    { previous_interaction_id: 'old' }, { background: true }, { tools: null }, { input: 'text' },
    { tools: [{ name: '', description: 'bad' }] }, { tools: [{ name: 'x', description: 'x', inputSchema: [] }] },
    { tools: [{ name: 'x', description: 'x', strict: true }] },
    { tools: [{ name: 'x', description: 'x' }, { name: 'x', description: 'again' }] },
  ])('rejects unsupported or malformed options: %j', options => {
    expect(() => build(options)).toThrow(GeminiInteractionError);
  });

  it.each([
    [user, ...modelSteps], // incomplete parallel batch
    [user, ...modelSteps, results[0], user, results[1]],
    [user, ...modelSteps, results[0], { type: 'thought' }, results[1]],
    [user, ...modelSteps, results[0], modelSteps[2], results[1]],
    [user, ...modelSteps, results[0], results[0], results[1]],
    [user, ...modelSteps, ...results, results[1]],
    [user, ...modelSteps, ...results, modelSteps[2], results[1]],
    [user, { type: 'function_result', call_id: 'invented', result: 'orphan' }],
    [user, ...modelSteps, results[0], { ...results[1], name: 'wrong' }],
  ])('rejects missing, duplicate, orphan or interrupted result batches: %j', input => {
    expect(() => build({ input })).toThrow(GeminiInteractionError);
  });

  it('accepts multiple complete tool rounds and string results under original IDs', () => {
    const input = [...history, { type: 'function_call', id: 'next', name: 'lookup', arguments: {} },
      { type: 'function_result', call_id: 'next', result: 'ok' }];
    expect(build({ input }).input).toEqual(input);
  });

  it.each([
    { type: 'unknown' }, { type: 'google_search_call', id: 'builtin' },
    { type: 'user_input', content: [{ type: 'image', data: 'abc' }] },
    { type: 'model_output', content: [{ type: 'text' }] },
    { type: 'model_output', error: { code: 500 } },
    { type: 'thought', signature: 12 }, { type: 'thought', summary: [{ type: 'image', data: 'abc' }] },
    { type: 'thought', future: 'opaque' },
    { type: 'model_output', content: [{ type: 'text', text: 'x', annotations: [{ type: 'unknown' }] }] },
    { type: 'function_call', id: '', name: 'lookup', arguments: {} },
    { type: 'function_call', id: 'x', name: 'lookup', arguments: [] },
    { type: 'function_call', id: 'x', name: 'lookup', arguments: { lost: undefined } },
  ])('rejects unsupported steps without filtering: %j', step => {
    expect(() => build({ input: [step] })).toThrow(GeminiInteractionError);
  });

  it('rejects data JSON would change or execute rather than silently serializing it', () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    for (const data of [cycle, { n: NaN }, { n: Infinity }, { n: 1n }, { n: () => 1 }, new Date(),
      { toJSON: () => ({ changed: true }) }]) {
      expect(() => build({ tools: [{ name: 'x', description: '', inputSchema: data }] })).toThrow(GeminiInteractionError);
    }
  });

  it('rejects sparse arrays with extra properties that JSON would replace with null', () => {
    const array = Object.assign(new Array(1), { lost: 'must not disappear' });
    expect(() => build({ tools: [{ name: 'x', description: '', inputSchema: { enum: array } }] })).toThrow(GeminiInteractionError);
  });

  it.each([null, 7, true, [{ type: 'image', data: 'abc' }], [{ type: 'text' }]])('rejects malformed result content: %j', result => {
    expect(() => build({ input: [user, ...modelSteps, results[0], { type: 'function_result', call_id: 'call_argon_A-7', result }] }))
      .toThrow(GeminiInteractionError);
  });
});

describe('complete Gemini result', () => {
  it('preserves the exact complete mixed steps and original parallel call IDs', () => {
    const steps = structuredClone(modelSteps);
    const result = parseGeminiInteraction({ id: 'interaction_1', model: 'gemini-4-argon', status: 'requires_action', steps,
      created: '2026-10-14T00:00:00Z', updated: '2026-10-14T00:00:01Z' });
    expect(result).toEqual({ status: 'requires_action', steps: modelSteps });
    expect(result.steps).toBe(steps);
    expect(result).not.toHaveProperty('usage');
  });

  it('allows completed text and reasoning-only results without inventing text or tokens', () => {
    for (const steps of [[], [{ type: 'thought' }], [{ type: 'model_output', content: [{ type: 'text', text: 'Done.' }] }]]) {
      expect(parseGeminiInteraction({ status: 'completed', steps })).toEqual({ status: 'completed', steps });
    }
  });

  it.each(['failed', 'cancelled', 'incomplete', 'budget_exceeded', 'in_progress', 'queued', 'future', undefined])(
    'refuses status %s even when a complete-looking function call exists', status => {
      expect(() => parseGeminiInteraction({ status, steps: modelSteps })).toThrow(GeminiInteractionError);
    });

  it.each([
    null, {}, { status: 'completed' }, { status: 'completed', steps: null },
    { status: 'completed', steps: modelSteps }, { status: 'requires_action', steps: [] },
    { status: 'requires_action', steps: [...modelSteps, modelSteps[2]] },
    { status: 'requires_action', steps: [...modelSteps, { type: 'future' }] },
    { status: 'requires_action', steps: [...modelSteps, { type: 'model_output', content: [{ type: 'audio' }] }] },
    { status: 'completed', steps: [user] }, { status: 'completed', steps: results },
    { status: 'completed', steps: [], outputs: [] }, { status: 'completed', steps: [], model: 'other' },
    { status: 'completed', steps: [], errors: [{ message: 'PRIVATE_ERROR' }] },
  ])('rejects ambiguous, unknown or malformed successful output: %j', response => {
    expect(() => parseGeminiInteraction(response)).toThrow(GeminiInteractionError);
  });

  it('retains optional usage fields verbatim without summing cached or thought counts', () => {
    const usage = { total_input_tokens: 100, total_cached_tokens: 40, total_output_tokens: 30,
      total_thought_tokens: 20, total_tool_use_tokens: 5, total_tokens: 155,
      input_tokens_by_modality: [{ modality: 'text', tokens: 100 }],
      output_tokens_by_modality: [{ modality: 'text', tokens: 30 }],
      cached_tokens_by_modality: [{ modality: 'text', tokens: 40 }], tool_use_tokens_by_modality: [], grounding_tool_count: [] };
    expect(parseGeminiInteraction({ status: 'completed', steps: [], usage }).usage).toEqual(usage);
    for (const partial of [{}, { total_input_tokens: 0 }, { total_tokens: 155 }]) {
      expect(parseGeminiInteraction({ status: 'completed', steps: [], usage: partial }).usage).toEqual(partial);
    }
  });

  it.each([null, { total_tokens: -1 }, { total_tokens: 1.5 }, { total_tokens: '3' }, { total_tokens: 2147483648 },
    { total_tokens: Infinity }, { other: 1 }, { input_tokens_by_modality: [{ modality: 'future', tokens: 2 }] },
    { grounding_tool_count: [{ type: 'google_search', count: -1 }] }])('rejects invalid usage: %j', usage => {
    expect(() => parseGeminiInteraction({ status: 'completed', steps: [], usage })).toThrow(GeminiInteractionError);
  });

  it('does not expose invalid content or signatures in errors', () => {
    try { parseGeminiInteraction({ status: 'incomplete', steps: [{ type: 'thought', signature: 'PRIVATE_SIGNATURE' }] }); }
    catch (error) {
      expect(error).toBeInstanceOf(GeminiInteractionError);
      expect(`${error}${JSON.stringify(error)}`).not.toContain('PRIVATE_');
      expect(error).toMatchObject({ code: 'incomplete' });
    }
  });
});

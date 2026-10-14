import { describe, expect, test } from 'vitest';
import { preflightGeminiResponses, prepareGeminiReplay, finishGeminiResponses } from '../src/geminiResponses';

const session = '11111111-1111-4111-8111-111111111111';
const headers = ['session-id', session];
const provider = { id: 'gemini-api', kind: 'gemini-interactions', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKeyEnv: '' };
const context = { lifetime: Buffer.alloc(16, 1).toString('base64url'), key: Buffer.alloc(32, 2).toString('base64url'), credentialBinding: 'bound-key' };
const user = { type: 'message', role: 'user', content: 'find both' };
const body = () => ({ model: 'argon', input: [user], instructions: 'root', tools: [{ type: 'function', name: 'lookup', parameters: { type: 'object' } }], store: false });
const preflight = (value: any, policy = 'strict', raw = headers) => preflightGeminiResponses(value, raw, provider, 'gemini-4-argon', policy);
const prepare = (value: any, policy = 'strict', raw = headers) => prepareGeminiReplay(preflight(value, policy, raw), context);
const first = (value = body(), policy = 'strict') => {
  const p = prepare(value, policy);
  const result = { status: 'requires_action', steps: [
    { type: 'thought', signature: 'original-signature' },
    { type: 'model_output', content: [{ type: 'text', text: 'before' }] },
    { type: 'function_call', id: 'original-a', name: p.parsed.tools[0].name, arguments: { q: 'a' } },
    { type: 'model_output', content: [{ type: 'text', text: 'between' }] },
    { type: 'function_call', id: 'original-b', name: p.parsed.tools[0].name, arguments: { q: 'b' } },
  ] };
  return { p, result, out: finishGeminiResponses(p, result, 'resp_test') };
};
const results = [{ type: 'function_call_output', call_id: 'original-b', output: 'B' }, { type: 'function_call_output', call_id: 'original-a', output: 'A' }];

describe('Gemini Responses replay', () => {
  test('preserves complete ordered steps, original IDs, multiple text items and results', () => {
    const { result, out } = first();
    expect(out.response.output.map((i: any) => i.type)).toEqual(['reasoning', 'message', 'function_call', 'message', 'function_call']);
    expect(out.response.output[2]).toMatchObject({ call_id: 'original-a', name: 'lookup', arguments: '{"q":"a"}' });
    expect(out.response.usage).toBeUndefined();
    const next = prepare({ ...body(), input: [user, ...out.response.output, ...results] });
    expect(next.request.input).toEqual([{ type: 'user_input', content: [{ type: 'text', text: 'find both' }] }, ...result.steps,
      { type: 'function_result', call_id: 'original-b', result: 'B' }, { type: 'function_result', call_id: 'original-a', result: 'A' }]);
    expect(out.frames.indexOf('encrypted_content')).toBeLessThan(out.frames.indexOf('response.function_call_arguments.delta'));
    const frames = out.frames.split('\n\n').filter(Boolean).map((s: string) => JSON.parse(s.split('\ndata: ')[1]));
    expect(frames.filter((f: any) => f.type === 'response.output_item.done').map((f: any) => f.output_index)).toEqual([0, 1, 2, 3, 4]);
    expect(frames.at(-1).response).toEqual(out.response);
  });

  test('supports repeated authenticated turns and later user text', () => {
    const { out } = first();
    const secondBody = { ...body(), input: [user, ...out.response.output, ...results] };
    const p = prepare(secondBody);
    const out2 = finishGeminiResponses(p, { status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'done' }] }] }, 'resp_second');
    const next = prepare({ ...secondBody, input: [...secondBody.input, ...out2.response.output, { role: 'user', content: 'again' }] });
    expect(next.request.input.at(-1)).toEqual({ type: 'user_input', content: [{ type: 'text', text: 'again' }] });
  });

  test('actual native echo permits null reasoning content and result transport IDs only', () => {
    const { out } = first();
    const input = [user, ...out.response.output, ...results.map((r, i) => ({ ...r, id: `result-${i}` }))];
    input[1] = { ...input[1], content: null };
    expect(prepare({ ...body(), input }).request.input.at(-1)).toEqual({ type: 'function_result', call_id: 'original-a', result: 'A' });
    input[1].content = [{ type: 'reasoning_text', text: 'not empty metadata' }];
    expect(() => preflight({ ...body(), input })).toThrow();
  });

  test.each(['altered', 'missing', 'duplicate', 'unmatched', 'interrupted'])('refuses %s replay', kind => {
    const { out } = first();
    const input: any[] = structuredClone([user, ...out.response.output, ...results]);
    if (kind === 'altered') input[2].content[0].text = 'changed';
    if (kind === 'missing') input.splice(1, 1);
    if (kind === 'duplicate') input.push(results[0]);
    if (kind === 'unmatched') input.at(-1).call_id = 'foreign';
    if (kind === 'interrupted') input.splice(-1, 1);
    expect(() => prepare({ ...body(), input })).toThrow();
  });

  test('refuses tampered, cross-session, changed tools and rotated context', () => {
    const { out } = first();
    const value = { ...body(), input: [user, ...out.response.output, ...results] };
    expect(() => prepare(value, 'strict', ['session_id', '22222222-2222-4222-8222-222222222222'])).toThrow();
    expect(() => prepare({ ...value, tools: [] })).toThrow();
    expect(() => prepareGeminiReplay(preflight(value), { ...context, lifetime: Buffer.alloc(16, 9).toString('base64url') })).toThrow();
    const changed = structuredClone(value);
    changed.input[1].encrypted_content = changed.input[1].encrypted_content.slice(0, -10) + 'abcdefghij';
    expect(() => prepare(changed)).toThrow();
  });

  test('strict default refuses developer text; opt-in binds original instruction boundaries', () => {
    const value: any = { ...body(), input: [{ id: 'dev-1', role: 'developer', content: [{ type: 'input_text', text: 'd1' }, { type: 'input_text', text: 'd2' }] }, user] };
    expect(() => preflight(value)).toThrow();
    const { p, out } = first(value, 'prepend-leading-developer-v1');
    expect(p.request.systemInstruction).toBe('root\n\nd1\n\nd2');
    const changed = { ...value, instructions: 'root\n\nd1', input: [{ id: 'dev-1', role: 'developer', content: 'd2' }, user, ...out.response.output, ...results] };
    expect(() => prepare(changed, 'prepend-leading-developer-v1')).toThrow();
    for (const input of [[user, value.input[0]], [{ role: 'system', content: 'system' }, user]]) {
      expect(() => preflight({ ...body(), input }, 'prepend-leading-developer-v1')).toThrow();
    }
  });

  test.each([[], ['thread-id', session], ['session-id', session, 'Session-ID', session], ['session-id', session + ', ' + session], ['session-id', session, 'session_id', '22222222-2222-4222-8222-222222222222']].map(raw => ({ raw })))('refuses ambiguous/missing session $raw before metadata', ({ raw }) => {
    expect(() => preflight({ ...body(), prompt_cache_key: session }, 'strict', raw)).toThrow();
  });

  test('accepts deliberate agreeing aliases and normalizes only UUID case', () => {
    expect(preflight(body(), 'strict', [...headers, 'session_id', session, 'thread-id', session]).session).toBe(session);
  });

  test.each([
    { tools: [{ type: 'function', name: 'lookup', strict: true }] },
    { tools: [{ type: 'function', name: 'lookup', strict: 'false' }] },
    { tools: [{ type: 'custom', name: 'lookup' }] },
    { input: [{ type: 'reasoning', encrypted_content: 'native-state', summary: [] }] },
    { parallel_tool_calls: false }, { reasoning: { effort: 'xhigh' } }, { text: { verbosity: 'low' } },
  ])('refuses unsupported controls before replay context: %j', change => expect(() => preflight({ ...body(), ...change })).toThrow());

  test('validates every output before frames, including bounds and unknown tools', () => {
    const { p, result } = first();
    expect(() => finishGeminiResponses(p, { ...result, steps: [...result.steps, { type: 'function_call', id: 'x', name: 'foreign', arguments: {} }] }, 'bad')).toThrow();
    expect(() => finishGeminiResponses(p, { status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'a'.repeat(65536) }] }] }, 'bad')).toThrow();
    expect(() => finishGeminiResponses(p, { status: 'completed', steps: Array.from({ length: 65 }, () => ({ type: 'model_output', content: [{ type: 'text', text: 'a' }] })) }, 'bad')).toThrow();
  });

  test('a reused model call ID cannot become executable on a later turn', () => {
    const { out } = first();
    const p = prepare({ ...body(), input: [user, ...out.response.output, ...results] });
    expect(() => finishGeminiResponses(p, { status: 'requires_action', steps: [{ type: 'function_call', id: 'original-a', name: p.parsed.tools[0].name, arguments: {} }] }, 'duplicate')).toThrow();
  });
});

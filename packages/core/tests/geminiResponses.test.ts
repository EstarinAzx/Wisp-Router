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

// Codex ff6aec9 apply_patch.lark, LF form. Native Windows also emits this with CRLF.
const patchGrammar = String.raw`start: begin_patch hunk+ end_patch
begin_patch: "*** Begin Patch" LF
end_patch: "*** End Patch" LF?

hunk: add_hunk | delete_hunk | update_hunk
add_hunk: "*** Add File: " filename LF add_line+
delete_hunk: "*** Delete File: " filename LF
update_hunk: "*** Update File: " filename LF change_move? change?

filename: /(.+)/
add_line: "+" /(.*)/ LF -> line

change_move: "*** Move to: " filename LF
change: (change_context | change_line)+ eof_line?
change_context: ("@@" | "@@ " /(.+)/) LF
change_line: ("+" | "-" | " ") /(.*)/ LF
eof_line: "*** End of File" LF

%import common.LF
`;
const patchTool = (definition = patchGrammar) => ({ type: 'custom', name: 'apply_patch', description: 'Apply a patch.',
  format: { type: 'grammar', syntax: 'lark', definition } });
const patchBody = () => ({ ...body(), tools: [{ ...body().tools[0], name: 'apply_patch' }, patchTool()] });
const patchText = '*** Begin Patch\r\n*** Add File: fixture.txt\r\n+quote " slash \\ unicode λ\r\n*** End Patch';
const patchResults = [{ type: 'custom_tool_call_output', call_id: 'original-patch', output: 'patched' },
  { type: 'function_call_output', call_id: 'original-a', output: 'A' }];
const firstPatch = (input = patchText, maxOutputTokens?: number) => {
  const value = { ...patchBody(), ...(maxOutputTokens === undefined ? {} : { max_output_tokens: maxOutputTokens }) }, p = prepare(value);
  const result = { status: 'requires_action', steps: [
    { type: 'thought', signature: 'patch-signature' },
    { type: 'function_call', id: 'original-a', name: p.parsed.tools[0].name, arguments: { q: 'a' } },
    { type: 'function_call', id: 'original-patch', name: p.parsed.tools[1].name, arguments: { input } },
  ] };
  return { value, p, result, out: finishGeminiResponses(p, result, 'resp_patch') };
};

describe('Gemini native custom patch replay', () => {
  test.each(['\n', '\r\n'])('qualifies the exact %j grammar and explicit leading-developer policy', newline => {
    const value = { ...patchBody(), tools: [patchTool(patchGrammar.replaceAll('\n', newline))],
      input: [{ role: 'developer', content: [{ type: 'input_text', text: 'native developer' }] }, user] };
    expect(() => preflight(value)).toThrow();
    const p = prepare(value, 'prepend-leading-developer-v1', [...headers, 'thread-id', session]);
    expect(p.request.systemInstruction).toBe('root\n\nnative developer');
    expect(p.request.tools?.[0].inputSchema).toEqual({ type: 'object', properties: { input: { type: 'string' } }, required: ['input'], additionalProperties: false });
    expect(p.request.tools?.[0].description).toContain('Generic upstreams do not enforce this grammar.');
  });

  test.each([patchText, '', 'invalid patch'])('preserves exact custom bytes %j and distinct same-name function identity', input => {
    const { value, p, result, out } = firstPatch(input);
    expect(p.parsed.tools[0].name).not.toBe(p.parsed.tools[1].name);
    expect(out.response.output.map((item: any) => item.type)).toEqual(['reasoning', 'function_call', 'custom_tool_call']);
    expect(out.response.output[1]).toMatchObject({ call_id: 'original-a', name: 'apply_patch', arguments: '{"q":"a"}' });
    expect(out.response.output[2]).toMatchObject({ call_id: 'original-patch', name: 'apply_patch', input });
    const next = prepare({ ...value, input: [user, ...out.response.output, ...patchResults] });
    expect(next.request.input).toEqual([{ type: 'user_input', content: [{ type: 'text', text: 'find both' }] }, ...result.steps,
      { type: 'function_result', call_id: 'original-patch', result: 'patched' }, { type: 'function_result', call_id: 'original-a', result: 'A' }]);
    const frames = out.frames.split('\n\n').filter(Boolean).map((s: string) => JSON.parse(s.split('\ndata: ')[1]));
    expect(frames.find((f: any) => f.type === 'response.output_item.added' && f.item.type === 'custom_tool_call').item)
      .toMatchObject({ input: '', status: 'in_progress', call_id: 'original-patch' });
    expect(frames.find((f: any) => f.type === 'response.custom_tool_call_input.delta')).toMatchObject({ output_index: 2, delta: input });
    expect(frames.find((f: any) => f.type === 'response.custom_tool_call_input.done')).toMatchObject({ output_index: 2, input });
    expect(frames.at(-1).response).toEqual(out.response);
  });

  test.each([{}, { input: 1 }, { input: null }, { input: 'patch', extra: true }, { Input: 'patch' }])('refuses late malformed custom arguments %j before frames', args => {
    const { p, result } = firstPatch();
    result.steps[2].arguments = args as any;
    let returned: unknown;
    expect(() => { returned = finishGeminiResponses(p, result, 'bad'); }).toThrow();
    expect(returned).toBeUndefined();
  });

  test.each([
    { ...patchTool(), name: 'other' }, { ...patchTool(), strict: false }, { ...patchTool(), extra: true },
    { ...patchTool(), format: { type: 'text' } }, patchTool(patchGrammar + '\n'),
    { ...patchTool(), format: { ...patchTool().format, extra: true } },
    { ...patchTool(), format: { ...patchTool().format, syntax: 'regex' } },
    { type: 'namespace', name: 'env', tools: [patchTool()] },
  ])('refuses unqualified custom declarations %j', tool => {
    expect(() => preflight({ ...body(), tools: [tool] })).toThrow();
  });

  test.each(['wrong-kind', 'duplicate-result', 'missing-result', 'duplicate-id', 'unknown-call', 'extra-call-field', 'non-string-input'])('refuses %s custom history', kind => {
    const { value, out } = firstPatch();
    const input: any[] = structuredClone([user, ...out.response.output, ...patchResults]);
    if (kind === 'wrong-kind') input[4].type = 'function_call_output';
    if (kind === 'duplicate-result') input.push(input[4]);
    if (kind === 'missing-result') input.pop();
    if (kind === 'duplicate-id') input[3].call_id = 'original-a';
    if (kind === 'unknown-call') input[3].name = 'foreign';
    if (kind === 'extra-call-field') input[3].extra = 'ignored';
    if (kind === 'non-string-input') input[3].input = 123;
    expect(() => prepare({ ...value, input })).toThrow();
  });

  test('changing caps preserves full function/custom replay and all authenticated bindings', () => {
    const { value, result, out } = firstPatch(patchText, 1);
    const continued = { ...value, max_output_tokens: 65536, input: [user, ...out.response.output, ...patchResults] };
    const p = prepare(continued);
    expect(p.request.maxOutputTokens).toBe(65536);
    expect(p.request.input).toEqual([{ type: 'user_input', content: [{ type: 'text', text: 'find both' }] }, ...result.steps,
      { type: 'function_result', call_id: 'original-patch', result: 'patched' }, { type: 'function_result', call_id: 'original-a', result: 'A' }]);
    const out2 = finishGeminiResponses(p, { status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'done' }] }] }, 'resp_after_patch');
    const later = { ...continued, max_output_tokens: 2048, input: [...continued.input, ...out2.response.output, { role: 'user', content: 'again' }] };
    const next = prepare(later);
    expect(next.request.maxOutputTokens).toBe(2048);
    expect(next.request.input).toEqual([...p.request.input, { type: 'model_output', content: [{ type: 'text', text: 'done' }] },
      { type: 'user_input', content: [{ type: 'text', text: 'again' }] }]);
    for (const kind of ['grammar', 'patch', 'root', 'result', 'missing', 'tampered', 'interrupted']) {
      const changed = structuredClone(later);
      if (kind === 'grammar') changed.tools[1] = patchTool(patchGrammar.replaceAll('\n', '\r\n'));
      if (kind === 'patch') changed.input[3].input = patchText.replaceAll('\r\n', '\n');
      if (kind === 'root') changed.instructions = 'different root';
      if (kind === 'result') changed.input[4].output = 'different result';
      if (kind === 'missing') changed.input.splice(1, 1);
      if (kind === 'tampered') changed.input[1].encrypted_content = changed.input[1].encrypted_content.slice(0, -10) + 'abcdefghij';
      if (kind === 'interrupted') changed.input.splice(3, 1);
      expect(() => prepare(changed), kind).toThrow();
    }
    expect(() => prepare(later, 'strict', ['session-id', '22222222-2222-4222-8222-222222222222'])).toThrow();
    expect(() => prepareGeminiReplay(preflight(later), { ...context, lifetime: 'rotated' })).toThrow();
  });

  test('rejects duplicate or reused custom call IDs before executable output', () => {
    const { value, p, result, out } = firstPatch();
    expect(() => finishGeminiResponses(p, { ...result, steps: [...result.steps, result.steps[2]] }, 'duplicate')).toThrow();
    const next = prepare({ ...value, input: [user, ...out.response.output, ...patchResults] });
    expect(() => finishGeminiResponses(next, { status: 'requires_action', steps: [result.steps[2]] }, 'reused')).toThrow();
  });
});

describe('Gemini Responses replay', () => {
  test.each([1, 2048, 65536])('forwards explicit output cap %i without changing the caller body', max_output_tokens => {
    const value = { ...body(), max_output_tokens }, before = structuredClone(value);
    expect(prepare(value).request.maxOutputTokens).toBe(max_output_tokens);
    expect(value).toEqual(before);
  });

  test('omitted output caps stay absent', () => {
    expect(prepare(body()).request).not.toHaveProperty('maxOutputTokens');
  });

  test.each([0, -1, 1.5, 65537, null, '2048', '', true, false, {}, [], NaN, Infinity, -Infinity].map(cap => ({ cap })))
    ('rejects invalid output cap $cap in preflight', ({ cap }) => {
      expect(() => preflight({ ...body(), max_output_tokens: cap })).toThrow();
    });

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

import { describe, expect, it } from 'vitest';
import { antigravityStreamEvents, buildAntigravityRequestBody, hoistAntigravityDesktopInstructions, validateAntigravityFunctionCallPairing } from '../src/antigravity';
import { createResponsesEncoder, parseDesktopResponsesRequest, parseResponsesRequest } from '../src/bridgeResponses';

it('projects the retained Desktop declaration topology onto the Antigravity wire', () => {
  // Reuse codexDesktop.test.ts's sanitized captured topology, not a new capture or upstream acceptance.
  const input = ['developer', 'user', 'developer', 'developer', 'user', 'developer']
    .map((role, index) => ({ type: 'message', role, content: `content-${index}` }));
  const tools = [
    ...Array.from({ length: 11 }, (_, n) => ({ type: 'function', name: `function_${n}`, parameters: { type: 'object', properties: {} } })),
    { type: 'custom', name: 'custom_tool', format: { type: 'text' } },
    ...Array.from({ length: 12 }, (_, n) => ({ type: 'namespace', name: `namespace_${n}`, tools: [{ type: 'function', name: 'read', parameters: { type: 'object', properties: {} } }] })),
    { type: 'web_search', external_web_access: true },
  ];
  const parsed = parseDesktopResponsesRequest({ model: 'alias', input, tools, instructions: 'root instructions', tool_choice: 'auto', reasoning: { effort: 'none' } });
  const messages = hoistAntigravityDesktopInstructions([
    { role: 'system', content: parsed.system },
    ...parsed.turns.map(turn => ({ role: turn.role, content: turn.text, toolCalls: turn.toolCalls, toolResults: turn.toolResults })),
  ]);
  const body = buildAntigravityRequestBody({ model: 'gemini-3.8-flash-tiered', requestId: 'synthetic-declarations',
    messages, tools: parsed.tools, preserveSystemText: true });
  expect(parsed.omittedHostedSearch).toBe(1);
  expect(body.request.systemInstruction.parts).toEqual([
    { text: 'root instructions' }, { text: 'content-0' }, { text: 'content-2' }, { text: 'content-3' }, { text: 'content-5' },
  ]);
  expect(body.request.contents).toEqual([
    { role: 'user', parts: [{ text: 'content-1' }] }, { role: 'user', parts: [{ text: 'content-4' }] },
  ]);
  const declarations = body.request.tools[0].functionDeclarations;
  expect(declarations).toHaveLength(24);
  expect(new Set(declarations.map((tool: any) => tool.name)).size).toBe(24);
  expect(declarations.map((tool: any) => tool.description.split('. ')[0])).toEqual([
    ...Array.from({ length: 11 }, (_, n) => `function_${n} (function)`), 'custom_tool (custom)',
    ...Array.from({ length: 12 }, (_, n) => `namespace_${n}.read (function)`),
  ]);
  expect(declarations[11].parameters).toMatchObject({ type: 'object', properties: { input: { type: 'string' } }, required: ['input'] });
});

describe('Antigravity visible Responses tool round trip', () => {
  const model = 'gemini-3.6-flash-tiered';
  const tools = [
    { type: 'function', name: 'read', parameters: { type: 'object', properties: {} } },
    { type: 'namespace', name: 'fs', tools: [{ type: 'function', name: 'read', parameters: { type: 'object', properties: {} } }] },
    { type: 'custom', name: 'apply_patch' },
  ];
  const first = { role: 'user', content: 'Read both files and apply the patch.' };

  it('preserves real IDs, namespace identity and exact custom input through parallel results', async () => {
    const parsed = parseResponsesRequest({ model, input: [first], tools });
    const patch = '*** Begin Patch\n*** End Patch';
    const source = async function* () {
      yield { candidates: [{ content: { parts: parsed.tools.map((tool, index) => ({ functionCall: {
        id: `upstream-${index}`, name: tool.name, args: index === 2 ? { input: patch } : {},
      } })) }, finishReason: 'STOP' }] };
    };
    const encoder = createResponsesEncoder(parsed, 'fixture-response');
    for await (const event of antigravityStreamEvents(source(), true)) encoder.push(event);
    const output = encoder.finish().response.output;
    expect(output.map((item: any) => [item.type, item.namespace ?? null, item.name, item.call_id])).toEqual([
      ['function_call', null, 'read', 'upstream-0'], ['function_call', 'fs', 'read', 'upstream-1'],
      ['custom_tool_call', null, 'apply_patch', 'upstream-2'],
    ]);
    expect(output[2].input).toBe(patch);
    const followup = parseResponsesRequest({ model, instructions: 'ROOT', tools, input: [first, ...output,
      { type: 'custom_tool_call_output', call_id: 'upstream-2', output: 'patched' },
      { type: 'function_call_output', call_id: 'upstream-1', output: 'second file' },
      { type: 'function_call_output', call_id: 'upstream-0', output: 'first file' },
      { role: 'user', content: 'Continue.' },
    ] });
    const body = buildAntigravityRequestBody({ model, requestId: 'fixture-followup',
      messages: [{ role: 'system', content: followup.system }, ...followup.turns.map(t => ({ role: t.role, content: t.text, toolCalls: t.toolCalls, toolResults: t.toolResults }))], tools: followup.tools });
    expect(validateAntigravityFunctionCallPairing(body)).toBeUndefined();
    expect(body.request.contents[1].parts[2].functionCall.args).toEqual({ input: patch });
    expect(body.request.contents[2].parts.map((p: any) => [p.functionResponse.id, p.functionResponse.response.result])).toEqual([
      ['upstream-0', 'first file'], ['upstream-1', 'second file'], ['upstream-2', 'patched'],
    ]);
    expect(body.request.contents[3]).toEqual({ role: 'user', parts: [{ text: 'Continue.' }] });
  });

  it('fails closed on an absent upstream ID without inventing a provider replay ID', async () => {
    const parsed = parseResponsesRequest({ model, input: [first], tools });
    const source = async function* () {
      yield { candidates: [{ content: { parts: [{ functionCall: { name: parsed.tools[0].name, args: {} } }] }, finishReason: 'STOP' }] };
    };
    const encoder = createResponsesEncoder(parsed, 'fixture-missing-id');
    for await (const event of antigravityStreamEvents(source(), true)) {
      if (event.type === 'tool_call') expect(event.call.id).toBe('');
      encoder.push(event);
    }
    expect(() => encoder.finish()).toThrow('upstream call_id must not be empty');
  });
});

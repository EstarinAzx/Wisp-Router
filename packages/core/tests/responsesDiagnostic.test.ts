import { describe, it, expect } from 'vitest';
import { parseResponsesRequest, responsesRejectionDiagnostic } from '../src/bridgeResponses';

const failure = (body: unknown) => { try { parseResponsesRequest(body); } catch (error) { return responsesRejectionDiagnostic(error, body); } throw new Error('Expected parser rejection'); };
describe('content-free signed Responses rejection diagnostics', () => {
  it('identifies known schema fields and saved reasoning settings without accepting them', () => {
    const body = { model: 'alias', input: [{ role: 'user', content: 'private prompt' }, { role: 'developer', content: 'private note' }], service_tier: 'default', reasoning: { effort: 'medium', summary: 'none' } };
    expect(() => parseResponsesRequest(body)).toThrow('Unsupported Responses field');
    const diagnostic = failure(body);
    expect(diagnostic.reason).toEqual({ code: 'unsupported_field', scope: 'request', field: 'service_tier' });
    expect(diagnostic.shape).toMatchObject({ serviceTier: 'default', reasoningEffort: 'medium', reasoningSummary: 'none', inputCount: 2, developerAfterConversation: 1 });
  });
  it.each(['web_search', 'image_generation', 'computer'])('classifies known unsupported tool kind %s without tool content', type => {
    expect(failure({ model: 'alias', input: 'private', tools: [{ type, name: 'private name', description: 'private description' }] }).reason).toEqual({ code: 'unsupported_tool_type', scope: 'tools', type });
  });
  it('never emits arbitrary keys, types, names, instructions, arguments or raw errors', () => {
    const secret = 'CANARY_PROMPT_HEADER_CREDENTIAL_ARGUMENT_83ab';
    const bodies = [
      { model: secret, input: secret, instructions: secret, [secret]: secret },
      { model: secret, input: secret, tools: [{ type: secret, name: secret, description: secret }] },
      { model: secret, input: [{ type: secret, content: secret }] },
      { model: secret, tools: [{ type: 'function', name: secret }], input: [{ type: 'function_call', call_id: secret, name: secret, arguments: secret }] },
      { model: secret, input: secret, tools: [{ type: 'function', name: secret, description: 'one' }, { type: 'function', name: secret, description: 'two' }] },
    ];
    for (const body of bodies) expect(JSON.stringify(failure(body))).not.toContain(secret);
    expect(responsesRejectionDiagnostic(new SyntaxError(secret), undefined).reason.code).toBe('invalid_json');
    expect(JSON.stringify(responsesRejectionDiagnostic(new Error(secret), { input: secret, reasoning: { effort: secret } }))).not.toContain(secret);
    expect(failure(bodies[0]).reason.field).toBe('unrecognized');
  });
  it('bounds the output using type counts rather than recording input items', () => {
    const body = { model: 'alias', input: Array.from({ length: 5000 }, () => ({ type: 'reasoning', encrypted_content: 'secret' })), tools: Array.from({ length: 5000 }, () => ({ type: 'unknown-secret', name: 'secret' })) };
    const diagnostic = failure(body); expect(diagnostic.shape.inputCount).toBe(5000); expect(diagnostic.shape.toolCount).toBe(5000);
    expect(JSON.stringify(diagnostic).length).toBeLessThan(4096); expect(JSON.stringify(diagnostic)).not.toContain('secret');
  });
});

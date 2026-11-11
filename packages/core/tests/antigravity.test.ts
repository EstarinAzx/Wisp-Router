// ---------------- antigravity.test.ts — the pure Antigravity (Cloud Code / Gemini) layer ---------------- //

/*
 * Transcribed from the reference's own corpus (CLIProxyAPI): antigravity_executor_buildrequest_test.go,
 * antigravity_schema_sanitize_test.go and antigravity_executor_signature_test.go carry the expected shapes,
 * so these assertions are the reference's, not invented ones. #187 needs no credentials and no spike: every
 * case below is pure input -> pure output.
 */

import { describe, it, expect } from 'vitest';
import {
  ANTIGRAVITY_USER_AGENT_FIELD, ANTIGRAVITY_SYNTHETIC_SIGNATURE,
  ANTIGRAVITY_INSTANT_RETRY_MS, ANTIGRAVITY_SHORT_QUOTA_COOLDOWN_MS,
  buildAntigravityEnvelope, antigravityStableSessionId, antigravityRequestId, antigravityImageRequestId,
  isAntigravityClaudeModel, usesAntigravitySchema, applyAntigravityFamilyForks,
  antigravityAcceptsThinkingLevel, applyAntigravityThinkingLevel, standardEffortToAntigravity,
  cleanJsonSchemaForGemini, cleanJsonSchemaForAntigravity,
  antigravityNeedsSchemaSanitization, sanitizeAntigravityRequestSchemas,
  buildAntigravityTools,
  sanitizeAntigravityThoughtSignatures, normalizeAntigravityFunctionResponses,
  validateAntigravityFunctionCallPairing,
  parseAntigravityRetryDelayMs, decideAntigravity429, antigravity429Error,
  antigravityStreamEvents,
  isAntigravityProvider, isAntigravitySignedIn, tokensToAntigravityCreds,
  shouldRefreshAntigravityToken, parseAntigravityProject,
  type Provider,
} from '../src/catalog';

// A fake upstream — the SSE mapper is asserted against this, never a socket.
const feed = async function* (chunks: unknown[]) { for (const c of chunks) yield c; };
const collect = async (it: AsyncIterable<any>) => { const out: any[] = []; for await (const e of it) out.push(e); return out; };

// ----------------------------- The request envelope ----------------------------- //

describe('buildAntigravityEnvelope', () => {
  const payload = () => ({ request: { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] } });

  it('carries model, the literal userAgent field, request type, project and request id', () => {
    const env = buildAntigravityEnvelope('gemini-3-pro', payload(), { projectId: 'proj-1', requestId: 'agent-abc' });
    expect(env.model).toBe('gemini-3-pro');
    expect(env.userAgent).toBe(ANTIGRAVITY_USER_AGENT_FIELD);
    expect(env.userAgent).toBe('antigravity');
    expect(env.requestType).toBe('agent');
    expect(env.project).toBe('proj-1');
    expect(env.requestId).toBe('agent-abc');
  });

  it('drops project entirely when there is no project id', () => {
    const env = buildAntigravityEnvelope('gemini-3-pro', { ...payload(), project: 'stale' }, { requestId: 'agent-abc' });
    expect('project' in env).toBe(false);
  });

  it('uses the image request type for an image model', () => {
    const env = buildAntigravityEnvelope('gemini-3-pro-image', payload(), { requestId: 'r' });
    expect(env.requestType).toBe('image_gen');
  });

  it('keeps a request type the caller already set', () => {
    const env = buildAntigravityEnvelope('gemini-3-pro', { ...payload(), requestType: 'web_search' }, { requestId: 'r' });
    expect(env.requestType).toBe('web_search');
  });

  it('strips safety settings', () => {
    const src: any = payload();
    src.request.safetySettings = [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }];
    const env = buildAntigravityEnvelope('gemini-3-pro', src, { requestId: 'r' });
    expect(env.request.safetySettings).toBeUndefined();
  });

  it('relocates a top-level toolConfig inside the envelope', () => {
    const src: any = payload();
    src.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
    const env = buildAntigravityEnvelope('gemini-3-pro', src, { requestId: 'r' });
    expect(env.toolConfig).toBeUndefined();
    expect(env.request.toolConfig).toEqual({ functionCallingConfig: { mode: 'AUTO' } });
  });

  it('leaves an existing request.toolConfig alone', () => {
    const src: any = payload();
    src.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
    src.request.toolConfig = { functionCallingConfig: { mode: 'ANY' } };
    const env = buildAntigravityEnvelope('gemini-3-pro', src, { requestId: 'r' });
    expect(env.request.toolConfig).toEqual({ functionCallingConfig: { mode: 'ANY' } });
  });

  it('does not mutate the caller payload', () => {
    const src: any = payload();
    src.request.safetySettings = [{}];
    buildAntigravityEnvelope('gemini-3-pro', src, { requestId: 'r' });
    expect(src.request.safetySettings).toEqual([{}]);
  });

  it('mints request ids in the upstream formats, from an injected uuid/clock', () => {
    expect(antigravityRequestId('abc-123')).toBe('agent-abc-123');
    expect(antigravityImageRequestId(1_700_000_000_000, 'abc-123')).toBe('image_gen/1700000000000/abc-123/12');
  });
});

// ----------------------------- The content-derived session id ----------------------------- //

describe('antigravityStableSessionId', () => {
  const withText = (text: string) => ({ request: { contents: [{ role: 'user', parts: [{ text }] }] } });

  it('is stable for identical leading input', () => {
    expect(antigravityStableSessionId(withText('same prompt'))).toBe(antigravityStableSessionId(withText('same prompt')));
  });

  it('is distinct across different input', () => {
    expect(antigravityStableSessionId(withText('one'))).not.toBe(antigravityStableSessionId(withText('two')));
  });

  it('is content-derived, not a nonce — a fresh call on the same input repeats it', () => {
    const p = withText('cache me');
    const ids = new Set([0, 1, 2, 3, 4].map(() => antigravityStableSessionId(p)));
    expect(ids.size).toBe(1);
  });

  it('reads the first USER turn, skipping a leading model turn', () => {
    const leadingModel = { request: { contents: [{ role: 'model', parts: [{ text: 'ignored' }] }, { role: 'user', parts: [{ text: 'anchor' }] }] } };
    expect(antigravityStableSessionId(leadingModel)).toBe(antigravityStableSessionId(withText('anchor')));
  });

  it('is a negative-prefixed decimal string', () => {
    expect(antigravityStableSessionId(withText('shape'))).toMatch(/^-\d+$/);
  });

  it('the envelope derives one when the caller supplied none, and keeps a supplied one', () => {
    const derived = buildAntigravityEnvelope('gemini-3-pro', withText('hi'), { requestId: 'r' });
    expect(derived.request.sessionId).toBe(antigravityStableSessionId(withText('hi')));
    const supplied = buildAntigravityEnvelope('gemini-3-pro', withText('hi'), { requestId: 'r', sessionId: '-42' });
    expect(supplied.request.sessionId).toBe('-42');
  });

  it('no session id rides a web_search request', () => {
    const env = buildAntigravityEnvelope('gemini-3-pro', { ...withText('hi'), requestType: 'web_search' }, { requestId: 'r' });
    expect(env.request.sessionId).toBeUndefined();
  });
});

// ----------------------------- The reasoning tier ('-tiered' rows only) ----------------------------- //

describe('antigravityAcceptsThinkingLevel', () => {
  // The '-tiered' rows defer their depth to the request; every other id pins it in the name. Verified on
  // the live wire 2026-08-14: -tiered honours thinkingLevel (low 264 output tokens, high 758 + thinking),
  // and every row below answers 200 whether or not one is sent.
  it('accepts the tiered rows', () => {
    expect(antigravityAcceptsThinkingLevel('gemini-3.7-flash-tiered')).toBe(true);
    expect(antigravityAcceptsThinkingLevel('gemini-3.6-flash-tiered')).toBe(true);
  });

  it('refuses every row whose id already pins a tier', () => {
    for (const model of ['gemini-3.6-flash-low', 'gemini-3.6-flash-medium', 'gemini-3.6-flash-high',
      'gemini-3.1-pro-low', 'gemini-3.1-pro-high', 'gemini-3.5-flash-extra-low',
      'gpt-oss-120b-medium', 'claude-opus-4-6-thinking', 'claude-sonnet-4-6']) {
      expect(antigravityAcceptsThinkingLevel(model)).toBe(false);
    }
  });

  // A SHAPE test, not a pinned list — the live model list grows between releases, and an unreleased
  // -tiered row must work without a cut.
  it('matches on shape, so an unknown tiered row still qualifies', () => {
    expect(antigravityAcceptsThinkingLevel('gemini-9.9-nova-tiered')).toBe(true);
  });
});

describe('applyAntigravityThinkingLevel', () => {
  const env = () => ({ model: 'm', request: { contents: [] } });

  it('sets the level and asks for thoughts on a tiered row', () => {
    const out: any = applyAntigravityThinkingLevel(env(), 'gemini-3.7-flash-tiered', 'high');
    expect(out.request.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'high', includeThoughts: true });
  });

  // The user already chose the tier by choosing the row — overriding it would silently send -high to
  // someone who picked -low.
  it('leaves a pinned row untouched', () => {
    const before = env();
    expect(applyAntigravityThinkingLevel(before, 'gemini-3.6-flash-low', 'high')).toEqual(before);
    expect(applyAntigravityThinkingLevel(before, 'claude-sonnet-4-6', 'high')).toEqual(before);
  });

  it('is a no-op without a level, so the pre-effort body is unchanged', () => {
    const before = env();
    expect(applyAntigravityThinkingLevel(before, 'gemini-3.7-flash-tiered', undefined)).toEqual(before);
  });

  it('does not mutate its input', () => {
    const before: any = env();
    applyAntigravityThinkingLevel(before, 'gemini-3.7-flash-tiered', 'low');
    expect(before.request.generationConfig).toBeUndefined();
  });
});

describe('standardEffortToAntigravity', () => {
  // This wire's own client offers exactly three stops, so the fold is what makes an unattested level
  // unreachable rather than something we hope the upstream tolerates.
  it('passes the three stops through', () => {
    expect(standardEffortToAntigravity('low')).toBe('low');
    expect(standardEffortToAntigravity('medium')).toBe('medium');
    expect(standardEffortToAntigravity('high')).toBe('high');
  });

  it('folds the two rungs above onto high', () => {
    expect(standardEffortToAntigravity('xhigh')).toBe('high');
    expect(standardEffortToAntigravity('max')).toBe('high');
  });
});

// ----------------------------- The model-family fork table ----------------------------- //

describe('applyAntigravityFamilyForks', () => {
  const env = (maxOutputTokens?: number) => ({
    model: 'm', request: { generationConfig: maxOutputTokens === undefined ? {} : { maxOutputTokens } },
  });

  it('forces tool mode for Claude models', () => {
    const out: any = applyAntigravityFamilyForks(env(100), 'claude-sonnet-4.5');
    expect(out.request.toolConfig.functionCallingConfig.mode).toBe('VALIDATED');
  });

  it('deletes the output-token cap for non-Claude models', () => {
    const out: any = applyAntigravityFamilyForks(env(100), 'gemini-3-pro');
    expect(out.request.generationConfig.maxOutputTokens).toBeUndefined();
    expect(out.request.toolConfig).toBeUndefined();
  });

  it('clamps the output-token cap BEFORE deleting it, so Claude keeps the clamped value', () => {
    const out: any = applyAntigravityFamilyForks(env(999_999), 'claude-sonnet-4.5', 64_000);
    expect(out.request.generationConfig.maxOutputTokens).toBe(64_000);
  });

  it('leaves a cap already under the model ceiling untouched', () => {
    const out: any = applyAntigravityFamilyForks(env(1_000), 'claude-sonnet-4.5', 64_000);
    expect(out.request.generationConfig.maxOutputTokens).toBe(1_000);
  });

  it('leaves the thinkingConfig of a tiered row alone', () => {
    const withThinking = { model: 'm', request: { generationConfig: { thinkingConfig: { thinkingLevel: 'high' } } } };
    const out: any = applyAntigravityFamilyForks(withThinking, 'gemini-3.7-flash-tiered');
    expect(out.request.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'high' });
  });

  it('selects the schema cleaner per family', () => {
    expect(usesAntigravitySchema('claude-sonnet-4.5')).toBe(true);
    expect(usesAntigravitySchema('gemini-3-pro')).toBe(true);
    expect(usesAntigravitySchema('gemini-3.1-pro')).toBe(true);
    expect(usesAntigravitySchema('gemini-3.6-flash')).toBe(false);
    expect(isAntigravityClaudeModel('claude-sonnet-4.5')).toBe(true);
    expect(isAntigravityClaudeModel('gemini-3-pro')).toBe(false);
  });
});

// ----------------------------- Schema cleaning, at schema paths ONLY ----------------------------- //

// The reference's own sanitize payload: tool schemas alongside conversation history whose functionCall
// arguments use the very keys the cleaner rewrites.
const sanitizePayload = () => ({
  request: {
    contents: [
      { role: 'model', parts: [{ functionCall: { name: 'manage_todo_list', args: {
        operation: 'write',
        todoList: [
          { id: 1, title: 'output 1', description: 'd1', status: 'not-started' },
          { id: 2, title: 'output 2', description: 'd2', status: 'not-started' },
        ] } } }] },
      { role: 'model', parts: [{ functionCall: { name: 'write_file', args: {
        path: 'a.md', format: 'markdown', default: 'x', pattern: 'p',
        const: 'c', deprecated: false, nullable: 'n', examples: 'e',
        additionalProperties: 'ap', 'x-custom': 'keepme',
      } } }] },
    ],
    tools: [{ functionDeclarations: [{
      name: 'manage_todo_list',
      parametersJsonSchema: {
        type: 'object',
        required: ['todoList'],
        properties: { todoList: { type: 'array', items: {
          type: 'object',
          required: ['id', 'title'],
          title: 'TodoItem',
          properties: { id: { type: 'number' }, title: { type: 'string', minLength: 3 } },
        } } },
      },
    }] }],
  },
});

describe('sanitizeAntigravityRequestSchemas', () => {
  for (const useAntigravitySchema of [false, true]) {
    it(`preserves replayed history verbatim (antigravity=${useAntigravitySchema})`, () => {
      const src = sanitizePayload();
      const before = JSON.stringify(src.request.contents);
      const got: any = sanitizeAntigravityRequestSchemas(src, useAntigravitySchema);

      // The headline: whole-document cleaning silently corrupted history. Nothing here may move.
      expect(JSON.stringify(got.request.contents)).toBe(before);

      const todo = got.request.contents[0].parts[0].functionCall.args.todoList;
      for (const item of todo) expect(item.title).toBeDefined();

      const args = got.request.contents[1].parts[0].functionCall.args;
      for (const key of ['format', 'default', 'pattern', 'const', 'deprecated', 'examples', 'additionalProperties', 'x-custom']) {
        expect(args[key], `argument key ${key} was stripped from history`).toBeDefined();
      }
      // The cleaner turns const into enum at SCHEMA paths — it must not fabricate one in history args.
      expect(args.enum).toBeUndefined();
    });
  }

  it('still renames and cleans the schema itself', () => {
    const got: any = sanitizeAntigravityRequestSchemas(sanitizePayload(), false);
    const decl = got.request.tools[0].functionDeclarations[0];

    expect(decl.parametersJsonSchema).toBeUndefined();
    expect(decl.parameters).toBeDefined();

    const items = decl.parameters.properties.todoList.items;
    expect(items.title).toBeUndefined();                    // schema keyword removed
    expect(items.properties.title).toBeDefined();           // a property NAMED title survives
    expect(items.properties.title.minLength).toBeUndefined();
    expect(items.required).toEqual(['id', 'title']);
  });

  it('cleans every schema a declaration can carry, not just parameters', () => {
    const payload = { request: { tools: [{ functionDeclarations: [{
      name: 't',
      parameters: { type: 'object', $id: 'drop-a', properties: { a: { type: 'string' } } },
      response: { type: 'object', $comment: 'drop-b', properties: { b: { type: 'string' } } },
      responseJsonSchema: { type: 'object', $id: 'drop-c', properties: { c: { type: 'string' } } },
    }] }] } };
    const decl: any = (sanitizeAntigravityRequestSchemas(payload, false) as any).request.tools[0].functionDeclarations[0];

    expect(decl.parameters.$id).toBeUndefined();
    expect(decl.response.$comment).toBeUndefined();
    expect(decl.responseJsonSchema.$id).toBeUndefined();
    expect(decl.parameters.properties.a).toBeDefined();
    expect(decl.response.properties.b).toBeDefined();
    expect(decl.responseJsonSchema.properties.c).toBeDefined();
  });

  it('cleans both declaration spellings and generation-config schemas in place', () => {
    for (const declKey of ['functionDeclarations', 'function_declarations']) {
      for (const genKey of ['generationConfig', 'generation_config']) {
        const schema = () => ({ type: 'object', $id: 'drop', properties: { a: { type: 'string' } } });
        const payload: any = { request: { tools: [{ [declKey]: [{ name: 't', parameters: schema(), response: schema() }] }], [genKey]: { responseSchema: schema(), response_schema: schema() } } };

        expect(antigravityNeedsSchemaSanitization(payload)).toBe(true);
        const got: any = sanitizeAntigravityRequestSchemas(payload, false);

        const decl = got.request.tools[0][declKey][0];
        expect(decl.parameters.$id, `${declKey}.parameters uncleaned`).toBeUndefined();
        expect(decl.response.$id, `${declKey}.response uncleaned`).toBeUndefined();
        // The upstream accepts either spelling, so each stays where the client put it.
        expect(got.request[genKey].responseSchema.$id).toBeUndefined();
        expect(got.request[genKey].response_schema.$id).toBeUndefined();
        expect(got.request[genKey].responseSchema.properties.a).toBeDefined();
        expect(got.request[genKey].response_schema.properties.a).toBeDefined();
      }
    }
  });

  it('does not trigger for a payload carrying no schemas', () => {
    expect(antigravityNeedsSchemaSanitization({ request: { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] } })).toBe(false);
  });

  it('is idempotent — a second pass must not duplicate hints', () => {
    const payload = { request: { tools: [{ functionDeclarations: [{
      name: 'manage_todo_list',
      parameters: { type: 'object', properties: {
        withDesc: { type: 'string', enum: ['write', 'read'], description: 'pick one' },
        bare: { type: 'string', enum: ['not-started', 'in-progress', 'completed'] },
        compound: { type: 'string', enum: ['a', 'b'], minLength: 1 },
      } },
    }] }] } };

    const once: any = sanitizeAntigravityRequestSchemas(payload, false);
    const twice: any = sanitizeAntigravityRequestSchemas(once, false);
    const props = (doc: any) => doc.request.tools[0].functionDeclarations[0].parameters.properties;

    for (const prop of ['withDesc', 'bare', 'compound']) {
      expect(props(twice)[prop].description).toBe(props(once)[prop].description);
      expect(props(twice)[prop].description.match(/Allowed:/g)?.length ?? 0).toBe(1);
    }
  });

  it('adds the Claude VALIDATED placeholder for an optional-only schema, and only in antigravity mode', () => {
    const doc = () => ({ request: { tools: [{ functionDeclarations: [{ name: 't', parameters: { type: 'object', properties: { flag: { type: 'string' } } } }] }] } });
    const anti: any = sanitizeAntigravityRequestSchemas(doc(), true);
    expect(anti.request.tools[0].functionDeclarations[0].parameters.required).toEqual(['_']);

    const gem: any = sanitizeAntigravityRequestSchemas(doc(), false);
    expect(gem.request.tools[0].functionDeclarations[0].parameters.required).toBeUndefined();
    expect(gem.request.tools[0].functionDeclarations[0].parameters.properties._).toBeUndefined();
  });
});

describe('the two schema cleaners', () => {
  it('gemini mode strips nullable and title; antigravity mode keeps the placeholder machinery', () => {
    const schema = () => ({ type: 'object', title: 'X', nullable: true, properties: { a: { type: 'string' } } });
    const gem: any = cleanJsonSchemaForGemini(schema());
    expect(gem.title).toBeUndefined();
    expect(gem.nullable).toBeUndefined();

    const anti: any = cleanJsonSchemaForAntigravity({ type: 'object' });
    expect(anti.properties.reason.type).toBe('string');
    expect(anti.required).toEqual(['reason']);
  });

  it('moves unsupported constraints into the description and drops unsupported keywords', () => {
    const got: any = cleanJsonSchemaForGemini({ type: 'object', $schema: 'x', $id: 'y', properties: { a: { type: 'string', minLength: 3, pattern: 'p' } } });
    expect(got.$schema).toBeUndefined();
    expect(got.$id).toBeUndefined();
    expect(got.properties.a.minLength).toBeUndefined();
    expect(got.properties.a.pattern).toBeUndefined();
    expect(got.properties.a.description).toContain('minLength: 3');
  });

  it('converts const to enum, stringifies enum values and pins the type', () => {
    const got: any = cleanJsonSchemaForGemini({ type: 'object', properties: { n: { type: 'number', enum: [1, 2] }, c: { const: 'fixed' } } });
    expect(got.properties.n.enum).toEqual(['1', '2']);
    expect(got.properties.n.type).toBe('string');
    expect(got.properties.c.enum).toEqual(['fixed']);
    expect(got.properties.c.const).toBeUndefined();
  });

  it('flattens a type array and drops the nullable member from required', () => {
    const got: any = cleanJsonSchemaForGemini({ type: 'object', required: ['a'], properties: { a: { type: ['string', 'null'] } } });
    expect(got.properties.a.type).toBe('string');
    expect(got.required).toBeUndefined();
  });

  it('flattens anyOf onto its richest member', () => {
    const got: any = cleanJsonSchemaForGemini({ type: 'object', properties: { a: { anyOf: [{ type: 'string' }, { type: 'object', properties: { deep: { type: 'string' } } }] } } });
    expect(got.properties.a.type).toBe('object');
    expect(got.properties.a.properties.deep).toBeDefined();
    expect(got.properties.a.description).toContain('Accepts:');
  });

  it('merges allOf members into the parent', () => {
    const got: any = cleanJsonSchemaForGemini({ type: 'object', allOf: [{ properties: { a: { type: 'string' } }, required: ['a'] }] });
    expect(got.allOf).toBeUndefined();
    expect(got.properties.a).toBeDefined();
    expect(got.required).toEqual(['a']);
  });

  it('drops required entries that name no property', () => {
    const got: any = cleanJsonSchemaForGemini({ type: 'object', required: ['a', 'ghost'], properties: { a: { type: 'string' } } });
    expect(got.required).toEqual(['a']);
  });

  it('never rewrites a property NAMED like a keyword', () => {
    const got: any = cleanJsonSchemaForGemini({ type: 'object', properties: { title: { type: 'string' }, format: { type: 'string' }, const: { type: 'string' } } });
    expect(got.properties.title).toBeDefined();
    expect(got.properties.format).toBeDefined();
    expect(got.properties.const).toBeDefined();
  });

  // An itemless array is the ONE shape this wire rejects outright (`…items: missing field`), at any depth.
  it('gives every itemless array an items, and leaves a typeless node alone', () => {
    const got: any = cleanJsonSchemaForGemini({ type: 'object', properties: {
      where: { type: 'array', items: { type: 'array' } },
      bare: { type: 'array' },
      any: { description: 'verbatim JSON' },
    } });
    expect(got.properties.where.items.items).toEqual({ type: 'string' });
    expect(got.properties.bare.items).toEqual({ type: 'string' });
    expect(got.properties.bare.description).toContain('array of any JSON value');
    // The wire accepts a typeless node, so nothing is invented for it.
    expect(got.properties.any.type).toBeUndefined();
  });

  // A 2020-12 tuple carries prefixItems and no items; the wire ignores the keyword and rejects the array.
  it('repairs an array left itemless by a tuple schema or by an earlier pass', () => {
    const tuple: any = cleanJsonSchemaForGemini({ type: 'object', properties: { pair: { type: 'array', prefixItems: [{ type: 'string' }] } } });
    expect(tuple.properties.pair.items).toEqual({ type: 'string' });

    // flattenTypeArrays mints `type:'array'` from a type list, and flattenAnyOfOneOf can select an
    // itemless array member — both land in this pass rather than on the wire.
    const nullable: any = cleanJsonSchemaForGemini({ type: 'object', properties: { a: { type: ['array', 'null'] } } });
    expect(nullable.properties.a.items).toEqual({ type: 'string' });
    const picked: any = cleanJsonSchemaForGemini({ type: 'object', properties: { a: { anyOf: [{ type: 'array' }, { type: 'string' }] } } });
    expect(picked.properties.a.items).toEqual({ type: 'string' });
  });
});

// ----------------------------- The fourth tool builder ----------------------------- //

describe('buildAntigravityTools', () => {
  it('produces the upstream functionDeclaration shape', () => {
    const got: any = buildAntigravityTools([{ name: 'read', description: 'read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }]);
    expect(got).toHaveLength(1);
    const decl = got[0].functionDeclarations[0];
    expect(decl.name).toBe('read');
    expect(decl.description).toBe('read a file');
    expect(decl.parametersJsonSchema.properties.path).toBeDefined();
  });

  it('emits nothing for an empty tool list, so no empty tools array rides the wire', () => {
    expect(buildAntigravityTools([])).toEqual([]);
  });

  it('carries only the keys a declaration may hold', () => {
    const decl: any = (buildAntigravityTools([{ name: 't', description: 'd', inputSchema: { type: 'object', properties: {} } }]) as any)[0].functionDeclarations[0];
    for (const key of Object.keys(decl)) {
      expect(['name', 'description', 'behavior', 'parameters', 'parametersJsonSchema', 'response', 'responseJsonSchema']).toContain(key);
    }
  });

  it('cleans the declared schema', () => {
    const decl: any = (buildAntigravityTools([{ name: 't', description: 'd', inputSchema: { type: 'object', $id: 'drop', properties: { a: { type: 'string', minLength: 2 } } } }]) as any)[0].functionDeclarations[0];
    expect(decl.parametersJsonSchema.$id).toBeUndefined();
    expect(decl.parametersJsonSchema.properties.a.minLength).toBeUndefined();
  });
});

// ----------------------------- Signatures and pairing ----------------------------- //

describe('sanitizeAntigravityThoughtSignatures', () => {
  const parallelCalls = (first?: string, second?: string) => ({
    request: { contents: [
      { role: 'model', parts: [
        { functionCall: { name: 'first', args: {} }, ...(first ? { thoughtSignature: first } : {}) },
        { functionCall: { name: 'second', args: {} }, ...(second ? { thoughtSignature: second } : {}) },
      ] },
      { role: 'user', parts: [
        { functionResponse: { name: 'first', response: { result: 'ok' } } },
        { functionResponse: { name: 'second', response: { result: 'ok' } } },
      ] },
    ] },
  });

  it('repairs an UNSIGNED leading function call rather than rejecting it', () => {
    const got: any = sanitizeAntigravityThoughtSignatures(parallelCalls());
    expect(got.request.contents[0].parts[0].thoughtSignature).toBe(ANTIGRAVITY_SYNTHETIC_SIGNATURE);
  });

  it('keeps a native leading signature untouched', () => {
    const native = 'CtIBAbc123==';
    const got: any = sanitizeAntigravityThoughtSignatures(parallelCalls(native, ANTIGRAVITY_SYNTHETIC_SIGNATURE));
    expect(got.request.contents[0].parts[0].thoughtSignature).toBe(native);
  });

  it('leaves every PARALLEL call after the first unsigned', () => {
    for (const second of [undefined, ANTIGRAVITY_SYNTHETIC_SIGNATURE, 'CtIBAbc123==']) {
      const got: any = sanitizeAntigravityThoughtSignatures(parallelCalls('CtIBAbc123==', second));
      expect(got.request.contents[0].parts[1].thoughtSignature).toBeUndefined();
    }
  });

  it('strips a signature from a functionResponse part — responses cannot replay one', () => {
    const src: any = parallelCalls();
    src.request.contents[1].parts[0].thoughtSignature = 'CtIBAbc123==';
    const got: any = sanitizeAntigravityThoughtSignatures(src);
    expect(got.request.contents[1].parts[0].thoughtSignature).toBeUndefined();
  });

  it('never signs a part in a USER turn', () => {
    const src = { request: { contents: [{ role: 'user', parts: [{ functionCall: { name: 'x', args: {} } }] }] } };
    const got: any = sanitizeAntigravityThoughtSignatures(src);
    expect(got.request.contents[0].parts[0].thoughtSignature).toBeUndefined();
  });
});

describe('normalizeAntigravityFunctionResponses', () => {
  it('orders parallel responses to match their calls and forces the native model role', () => {
    const payload = { request: { contents: [
      { role: 'model', parts: [
        { functionCall: { id: 'call-1', name: 'read', args: { file: 'one' } } },
        { functionCall: { id: 'call-2', name: 'read', args: { file: 'two' } } },
      ] },
      { role: ' Model ', parts: [
        { functionResponse: { id: 'call-2', name: 'read', response: { result: 'two' } } },
        { functionResponse: { id: 'call-1', name: 'read', response: { result: 'one' } } },
      ] },
    ] } };

    const got: any = normalizeAntigravityFunctionResponses(payload);
    expect(got.request.contents[1].role).toBe('model');
    expect(got.request.contents[1].parts[0].functionResponse.id).toBe('call-1');
    expect(got.request.contents[1].parts[1].functionResponse.id).toBe('call-2');
    expect(validateAntigravityFunctionCallPairing(got)).toBeUndefined();
  });

  it('leaves mixed functionResponse/user content as a user turn', () => {
    const payload = { request: { contents: [{ role: 'user', parts: [
      { functionResponse: { name: 'run', response: { result: 'ok' } } },
      { text: 'user follow-up' },
    ] }] } };
    const got: any = normalizeAntigravityFunctionResponses(payload);
    expect(got.request.contents[0].role).toBe('user');
  });

  it('does not reorder across an empty-content boundary', () => {
    for (const boundary of [{ role: 'user', parts: [] }, { role: 'user' }, { role: 'user', parts: null }]) {
      const payload = { request: { contents: [
        { role: 'model', parts: [
          { functionCall: { id: 'call-1', name: 'read', args: {} } },
          { functionCall: { id: 'call-2', name: 'read', args: {} } },
        ] },
        boundary,
        { role: 'user', parts: [
          { functionResponse: { id: 'call-2', name: 'read', response: { result: 'two' } } },
          { functionResponse: { id: 'call-1', name: 'read', response: { result: 'one' } } },
        ] },
      ] } };

      const got: any = normalizeAntigravityFunctionResponses(payload);
      expect(got.request.contents[2].role).toBe('model');
      expect(got.request.contents[2].parts[0].functionResponse.id).toBe('call-2');
      // Crossing the boundary is exactly what pairing validation must refuse.
      expect(validateAntigravityFunctionCallPairing(got)).toBeDefined();
    }
  });

  it('matches by name when the call carried no id', () => {
    const payload = { request: { contents: [
      { role: 'model', parts: [{ functionCall: { name: 'alpha', args: {} } }, { functionCall: { name: 'beta', args: {} } }] },
      { role: 'user', parts: [
        { functionResponse: { name: 'beta', response: { result: 'b' } } },
        { functionResponse: { name: 'alpha', response: { result: 'a' } } },
      ] },
    ] } };
    const got: any = normalizeAntigravityFunctionResponses(payload);
    expect(got.request.contents[1].parts[0].functionResponse.name).toBe('alpha');
  });

  it('repairs a response whose name was lost, using the call id', () => {
    const payload = { request: { contents: [
      { role: 'model', parts: [{ functionCall: { id: 'call-9', name: 'read', args: {} } }] },
      { role: 'user', parts: [{ functionResponse: { id: 'call-9', name: 'unknown', response: { result: 'ok' } } }] },
    ] } };
    const got: any = normalizeAntigravityFunctionResponses(payload);
    expect(got.request.contents[1].parts[0].functionResponse.name).toBe('read');
  });
});

describe('validateAntigravityFunctionCallPairing', () => {
  it.each([['unknown-a', 'unknown-b'], ['a', 'a'], ['a ', 'b']])('rejects equal counts with mismatched or duplicate result ids %s / %s', (a, b) => {
    const payload = { request: { contents: [
      { role: 'model', parts: ['a', 'b'].map(id => ({ functionCall: { id, name: 'read', args: {} } })) },
      { role: 'model', parts: [a, b].map(id => ({ functionResponse: { id, name: 'read', response: {} } })) },
    ] } };
    expect(validateAntigravityFunctionCallPairing(payload)).toBeDefined();
  });
  it('retains name matching for legacy calls without original ids', () => {
    const payload = { request: { contents: [
      { role: 'model', parts: [{ functionCall: { name: 'read', args: {} } }, { functionCall: { name: 'list', args: {} } }] },
      { role: 'model', parts: [{ functionResponse: { name: 'list', response: {} } }, { functionResponse: { name: 'read', response: {} } }] },
    ] } };
    expect(validateAntigravityFunctionCallPairing(payload)).toBeUndefined();
    payload.request.contents[1].parts[1].functionResponse!.name = 'list';
    expect(validateAntigravityFunctionCallPairing(payload)).toBeDefined();
  });
  it('accepts a clean call/response turn pair', () => {
    const payload = { request: { contents: [
      { role: 'model', parts: [{ functionCall: { id: 'c1', name: 'read', args: {} } }] },
      { role: 'model', parts: [{ functionResponse: { id: 'c1', name: 'read', response: {} } }] },
    ] } };
    expect(validateAntigravityFunctionCallPairing(payload)).toBeUndefined();
  });

  it('refuses a call with no name', () => {
    const payload = { request: { contents: [{ role: 'model', parts: [{ functionCall: { args: {} } }] }] } };
    expect(validateAntigravityFunctionCallPairing(payload)).toMatch(/name/);
  });

  it('refuses calls and responses interleaved in one content', () => {
    const payload = { request: { contents: [{ role: 'model', parts: [
      { functionCall: { name: 'a', args: {} } },
      { functionResponse: { name: 'a', response: {} } },
    ] }] } };
    expect(validateAntigravityFunctionCallPairing(payload)).toMatch(/interleaved/);
  });

  it('refuses a call left unanswered before other content', () => {
    const payload = { request: { contents: [
      { role: 'model', parts: [{ functionCall: { name: 'a', args: {} } }] },
      { role: 'user', parts: [{ text: 'unrelated' }] },
    ] } };
    expect(validateAntigravityFunctionCallPairing(payload)).toMatch(/pending/);
  });
});

// ----------------------------- The BINDING RULE ----------------------------- //

/*
 * The port never mints opaque provider-side tool ids. Two-thirds of the reference's reasoning-replay
 * subsystem exists to service ids that are content-hash lookup keys into a replay ledger; minting them
 * without that ledger makes every one a dangling pointer. Omitting the subsystem is safe ONLY under this
 * rule, and a violation fails nothing at compile time — so it is pinned here.
 */
describe('the binding rule: no opaque provider-side tool ids are ever minted', () => {
  it('passes the upstream functionCall.id through untouched', async () => {
    const events = await collect(antigravityStreamEvents(feed([
      { response: { candidates: [{ content: { parts: [{ functionCall: { id: 'upstream-abc', name: 'read', args: { p: 1 } } }] } }] } },
    ])));
    const call = events.find((e) => e.type === 'tool_call');
    expect(call.call.id).toBe('upstream-abc');
  });

  it('leaves the id EMPTY when upstream sent none — it does not invent a stable synthetic one', async () => {
    const events = await collect(antigravityStreamEvents(feed([
      { response: { candidates: [{ content: { parts: [{ functionCall: { name: 'read', args: {} } }] } }] } },
    ])));
    const call = events.find((e) => e.type === 'tool_call');
    expect(call.call.id).toBe('');
  });

  it('is deterministic-free: identical content yields no id, twice, with nothing hash-shaped', async () => {
    const chunk = () => ({ response: { candidates: [{ content: { parts: [{ functionCall: { name: 'read', args: { same: 'input' } } }] } }] } });
    const ids = [] as string[];
    for (const _ of [0, 1]) {
      const events = await collect(antigravityStreamEvents(feed([chunk()])));
      ids.push(events.find((e) => e.type === 'tool_call').call.id);
    }
    expect(ids).toEqual(['', '']);
    // A content-hash id would be a long opaque token; assert nothing of the sort appeared.
    for (const id of ids) expect(id).not.toMatch(/[0-9a-f]{8,}/i);
  });

  it('does not mint ids while normalizing history either', () => {
    const payload = { request: { contents: [
      { role: 'model', parts: [{ functionCall: { name: 'read', args: {} } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'read', response: {} } }] },
    ] } };
    const got: any = normalizeAntigravityFunctionResponses(sanitizeAntigravityThoughtSignatures(payload));
    expect(got.request.contents[0].parts[0].functionCall.id).toBeUndefined();
    expect(got.request.contents[1].parts[0].functionResponse.id).toBeUndefined();
  });
});

// ----------------------------- The 429 body classifier (parsing only, no state) ----------------------------- //

const resourceExhausted = (reason: string, retryDelay?: string) => ({
  error: {
    code: 429, status: 'RESOURCE_EXHAUSTED', message: 'rate limited',
    details: [
      { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason },
      ...(retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : []),
    ],
  },
});

describe('decideAntigravity429', () => {
  it('parses the retry delay off RetryInfo', () => {
    expect(parseAntigravityRetryDelayMs(resourceExhausted('RATE_LIMIT_EXCEEDED', '2s'))).toBe(2_000);
    expect(parseAntigravityRetryDelayMs(resourceExhausted('RATE_LIMIT_EXCEEDED', '1m30s'))).toBe(90_000);
  });

  it('falls back to the quota reset delay, then to the message text', () => {
    const viaMetadata = { error: { status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'RATE_LIMIT_EXCEEDED', metadata: { quotaResetDelay: '45s' } }] } };
    expect(parseAntigravityRetryDelayMs(viaMetadata)).toBe(45_000);
    expect(parseAntigravityRetryDelayMs({ error: { message: 'try again after 12s.' } })).toBe(12_000);
  });

  it('BELOW the instant-retry threshold it declines to classify', () => {
    const decision = decideAntigravity429(resourceExhausted('RATE_LIMIT_EXCEEDED', '1s'));
    expect(decision.kind).toBe('instant_retry_same_auth');
    expect(decision.retryAfterMs).toBe(1_000);
    expect(antigravity429Error(resourceExhausted('RATE_LIMIT_EXCEEDED', '1s'))).toBeUndefined();
  });

  it('AT or above the threshold it yields a classified 429', () => {
    const at = decideAntigravity429(resourceExhausted('RATE_LIMIT_EXCEEDED', '3s'));
    expect(at.kind).toBe('short_cooldown_switch_auth');
    expect(antigravity429Error(resourceExhausted('RATE_LIMIT_EXCEEDED', '3s'))?.status).toBe(429);

    const long = decideAntigravity429(resourceExhausted('RATE_LIMIT_EXCEEDED', '10m'));
    expect(long.kind).toBe('full_quota_exhausted');
    expect(antigravity429Error(resourceExhausted('RATE_LIMIT_EXCEEDED', '10m'))?.status).toBe(429);
  });

  it('explicit quota exhaustion yields a classified 429, with or without a delay', () => {
    expect(decideAntigravity429(resourceExhausted('QUOTA_EXHAUSTED')).kind).toBe('full_quota_exhausted');
    expect(antigravity429Error(resourceExhausted('QUOTA_EXHAUSTED'))?.status).toBe(429);
    // The keyword fallback, for a body that carries no ErrorInfo detail at all.
    expect(decideAntigravity429({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota exhausted for this model' } }).kind).toBe('full_quota_exhausted');
  });

  it('a NON-quota 429 falls through without being classified', () => {
    expect(decideAntigravity429({ error: { code: 429, status: 'UNAVAILABLE', message: 'busy' } }).kind).toBe('soft_retry');
    expect(antigravity429Error({ error: { code: 429, status: 'UNAVAILABLE', message: 'busy' } })).toBeUndefined();
    expect(decideAntigravity429(undefined).kind).toBe('soft_retry');
    expect(decideAntigravity429({}).kind).toBe('soft_retry');
  });

  it('rate limiting with no delay at all stays a soft retry', () => {
    expect(decideAntigravity429(resourceExhausted('RATE_LIMIT_EXCEEDED')).kind).toBe('soft_retry');
  });

  it('the classified error message matches the retryability contract shape', () => {
    // isTransientProviderError regexes String(err) for "API error (429|500|502|503|504)". A client that
    // throws any other shape silently receives ZERO retries.
    const err = antigravity429Error(resourceExhausted('QUOTA_EXHAUSTED'));
    expect(err!.message).toMatch(/API error 429/);
  });

  it('the thresholds are the reference values', () => {
    expect(ANTIGRAVITY_INSTANT_RETRY_MS).toBe(3_000);
    expect(ANTIGRAVITY_SHORT_QUOTA_COOLDOWN_MS).toBe(5 * 60_000);
  });
});

// ----------------------------- The SSE mapper ----------------------------- //

describe('antigravityStreamEvents', () => {
  it('unwraps the response key on every event', async () => {
    const events = await collect(antigravityStreamEvents(feed([
      { response: { candidates: [{ content: { parts: [{ text: 'hello ' }] } }] } },
      { response: { candidates: [{ content: { parts: [{ text: 'world' }] } }] } },
    ])));
    expect(events).toEqual([{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }]);
  });

  it('tolerates a chunk that is already unwrapped', async () => {
    const events = await collect(antigravityStreamEvents(feed([{ candidates: [{ content: { parts: [{ text: 'bare' }] } }] }])));
    expect(events).toEqual([{ type: 'text', text: 'bare' }]);
  });

  /*
   * #191: a thought part is NOT answer text — but it is not nothing either. It rides the thinking channel,
   * which the Anthropic door renders and the OpenAI door drops (that door reads only text/tool_call). #189
   * dropped it here because no door consumed it yet; the door's arm is what makes it observable.
   */
  it('sends thought parts down the thinking channel, never the answer channel', async () => {
    const events = await collect(antigravityStreamEvents(feed([
      { response: { candidates: [{ content: { parts: [{ text: 'thinking aloud', thought: true }, { text: 'answer' }] } }] } },
    ])));
    expect(events).toEqual([{ type: 'thinking', text: 'thinking aloud' }, { type: 'text', text: 'answer' }]);
  });

  // An empty thought part carries nothing to render — emitting it would open a thinking block for no text.
  it('ignores an empty thought part', async () => {
    const events = await collect(antigravityStreamEvents(feed([
      { response: { candidates: [{ content: { parts: [{ text: '', thought: true }, { text: 'answer' }] } }] } },
    ])));
    expect(events).toEqual([{ type: 'text', text: 'answer' }]);
  });

  /*
   * The signature is deliberately NOT forwarded. `thoughtSignature` is this wire's REPLAY token, and an
   * Anthropic `thinking.signature` means a different thing on a different wire; the only consumer would be a
   * replay path that does not exist (AntigravityTurn has no rawContent channel, so a replayed block is
   * dropped before it reaches the payload builder). An empty signature is what the Anthropic OAuth wire
   * already sends through this same encoder, so the door is on proven ground.
   */
  it('does not forward a thought signature as an Anthropic thinking signature', async () => {
    const events = await collect(antigravityStreamEvents(feed([
      { response: { candidates: [{ content: { parts: [{ text: 'reasoning', thought: true, thoughtSignature: 'CtIBAbc123==' }] } }] } },
    ])));
    expect(events).toEqual([{ type: 'thinking', text: 'reasoning' }]);
  });

  it('retains usage metadata ONLY on the terminal chunk', async () => {
    const usage = { promptTokenCount: 10, candidatesTokenCount: 4, cachedContentTokenCount: 2 };
    const events = await collect(antigravityStreamEvents(feed([
      { response: { candidates: [{ content: { parts: [{ text: 'a' }] } }], usageMetadata: usage } },
      { response: { candidates: [{ content: { parts: [{ text: 'b' }] }, finishReason: 'STOP' }], usageMetadata: usage } },
    ])));
    const usageEvents = events.filter((e) => e.type === 'usage');
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0].usage).toEqual({ input_tokens: 8, cache_creation_input_tokens: 0, cache_read_input_tokens: 2, output_tokens: 4 });
  });

  // Live captures from the #186 spike. Thinking tokens are billed OUTPUT and ride their own field, so
  // reading candidatesTokenCount alone under-reports a reasoning turn by ~100x. The upstream's own
  // totalTokenCount is the check: prompt + candidates + thoughts.
  it('counts thinking tokens as output — the real wire reports them separately', async () => {
    const events = await collect(antigravityStreamEvents(feed([
      { response: {
        candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 10, totalTokenCount: 228, thoughtsTokenCount: 215 },
      } },
    ])));
    const usage = events.find((e) => e.type === 'usage').usage;
    expect(usage.output_tokens).toBe(225);            // 10 + 215, NOT 10
    expect(usage.input_tokens).toBe(3);
    expect(usage.input_tokens + usage.output_tokens).toBe(228); // == the upstream's own total
  });

  it('counts thinking tokens as output on a vision turn too (candidates 1, thoughts 1123)', async () => {
    const events = await collect(antigravityStreamEvents(feed([
      { response: {
        candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1092, candidatesTokenCount: 1, totalTokenCount: 2216, thoughtsTokenCount: 1123 },
      } },
    ])));
    const usage = events.find((e) => e.type === 'usage').usage;
    expect(usage.output_tokens).toBe(1124);
    expect(usage.input_tokens + usage.output_tokens).toBe(2216);
  });

  it('emits no usage event at all when the terminal chunk carries none — a synthesized zero is the bug', async () => {
    const events = await collect(antigravityStreamEvents(feed([
      { response: { candidates: [{ content: { parts: [{ text: 'a' }] }, finishReason: 'STOP' }] } },
    ])));
    expect(events.some((e) => e.type === 'usage')).toBe(false);
  });

  it('synthesises the terminating sentinel — the upstream sends none', async () => {
    // The stream simply ends. The mapper must flush and complete rather than wait for a [DONE] that
    // this wire never sends.
    const events = await collect(antigravityStreamEvents(feed([
      { response: { candidates: [{ content: { parts: [{ text: 'x' }, { functionCall: { id: 'c1', name: 'read', args: { a: 1 } } }] } }] } },
    ])));
    expect(events.at(-1)).toEqual({ type: 'tool_call', call: { id: 'c1', name: 'read', argsJson: '{"a":1}' } });
  });

  it('reports a cut-short turn as a truncation', async () => {
    const events = await collect(antigravityStreamEvents(feed([
      { response: { candidates: [{ content: { parts: [{ text: 'a' }] }, finishReason: 'MAX_TOKENS' }] } },
    ])));
    expect(events).toContainEqual({ type: 'truncation', reason: 'max_tokens' });
  });

  it('does not report a normal stop as a truncation', async () => {
    const events = await collect(antigravityStreamEvents(feed([
      { response: { candidates: [{ content: { parts: [{ text: 'a' }] }, finishReason: 'STOP' }] } },
    ])));
    expect(events.some((e) => e.type === 'truncation')).toBe(false);
  });

  it('skips empty text fragments and malformed chunks without throwing', async () => {
    const events = await collect(antigravityStreamEvents(feed([
      { response: { candidates: [{ content: { parts: [{ text: '' }] } }] } },
      { response: {} }, {}, null, 'not-json',
      { response: { candidates: [{ content: { parts: [{ text: 'survivor' }] } }] } },
    ])));
    expect(events).toEqual([{ type: 'text', text: 'survivor' }]);
  });

  it('serialises tool-call arguments as JSON text', async () => {
    const events = await collect(antigravityStreamEvents(feed([
      { response: { candidates: [{ content: { parts: [{ functionCall: { id: 'c', name: 'write', args: { path: 'a.md', deep: { n: 1 } } } }] } }] } },
    ])));
    expect(events[0].call.argsJson).toBe('{"path":"a.md","deep":{"n":1}}');
  });
});

// ----------------------------- The credential bundle (#188) ----------------------------- //

describe('isAntigravityProvider', () => {
  const provider = (over: Partial<Provider> = {}): Provider => ({
    id: 'antigravity', label: 'Antigravity', baseUrl: 'https://daily-cloudcode-pa.googleapis.com',
    defaultModel: 'gemini-3.1-pro-low', apiKeyEnv: '', kind: 'antigravity-oauth', ...over,
  });

  it('is true for a row whose kind is antigravity-oauth', () => {
    expect(isAntigravityProvider(provider())).toBe(true);
  });

  it('is false for absent kind and for every other kind', () => {
    expect(isAntigravityProvider(provider({ kind: undefined }))).toBe(false);
    expect(isAntigravityProvider(provider({ kind: 'openai-chat' }))).toBe(false);
    expect(isAntigravityProvider(provider({ kind: 'codex' }))).toBe(false);
    expect(isAntigravityProvider(provider({ kind: 'anthropic-oauth' }))).toBe(false);
    expect(isAntigravityProvider(provider({ kind: 'xai-oauth' }))).toBe(false);
    expect(isAntigravityProvider(provider({ kind: 'kimi-oauth' }))).toBe(false);
  });
});

describe('isAntigravitySignedIn', () => {
  it('is true only when an access token is present', () => {
    expect(isAntigravitySignedIn({ accessToken: 'ya29.x' })).toBe(true);
  });

  it('reads the {} sign-out tombstone and a refresh-only blob as signed out', () => {
    expect(isAntigravitySignedIn({})).toBe(false);
    expect(isAntigravitySignedIn({ refreshToken: 'r', projectId: 'example-project-1' })).toBe(false);
  });

  it('reads an unwritten slice as signed out', () => {
    expect(isAntigravitySignedIn(undefined)).toBe(false);
  });
});

describe('tokensToAntigravityCreds', () => {
  it('stamps expires_in onto the injected clock as an absolute deadline', () => {
    expect(tokensToAntigravityCreds({ access_token: 'a', refresh_token: 'r', expires_in: 3599 }, 1_000_000))
      .toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: 1_000_000 + 3599 * 1000 });
  });

  it('omits absent fields rather than writing undefined', () => {
    expect(tokensToAntigravityCreds({ access_token: 'a' }, 5)).toEqual({ accessToken: 'a' });
  });

  it('drops a non-numeric expires_in instead of stamping NaN', () => {
    expect(tokensToAntigravityCreds({ access_token: 'a', expires_in: '3599' as any }, 5)).toEqual({ accessToken: 'a' });
  });
});

describe('shouldRefreshAntigravityToken', () => {
  it('refreshes inside the 5-minute skew window and not before it', () => {
    const now = 10_000_000;
    expect(shouldRefreshAntigravityToken({ expiresAt: now + 4 * 60_000 }, now)).toBe(true);
    expect(shouldRefreshAntigravityToken({ expiresAt: now + 6 * 60_000 }, now)).toBe(false);
  });

  it('refreshes an already-expired token', () => {
    expect(shouldRefreshAntigravityToken({ expiresAt: 1 }, 10_000_000)).toBe(true);
  });

  it('cannot prove staleness without an expiresAt', () => {
    expect(shouldRefreshAntigravityToken({}, 10_000_000)).toBe(false);
  });
});

describe('parseAntigravityProject', () => {
  it('reads cloudaicompanionProject out of a loadCodeAssist response', () => {
    expect(parseAntigravityProject({ cloudaicompanionProject: 'example-project-1' })).toBe('example-project-1');
  });

  it('trims, and answers undefined for blank, wrong-typed, or absent values', () => {
    expect(parseAntigravityProject({ cloudaicompanionProject: '  p1  ' })).toBe('p1');
    expect(parseAntigravityProject({ cloudaicompanionProject: '   ' })).toBeUndefined();
    expect(parseAntigravityProject({ cloudaicompanionProject: 42 })).toBeUndefined();
    expect(parseAntigravityProject({})).toBeUndefined();
    expect(parseAntigravityProject(null)).toBeUndefined();
    expect(parseAntigravityProject('nope')).toBeUndefined();
  });
});

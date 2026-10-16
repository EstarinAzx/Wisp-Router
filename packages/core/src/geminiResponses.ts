import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { parseResponsesRequest, encodeResponsesToolCall } from './bridgeResponses';
import { buildGeminiInteractionRequest, parseGeminiInteraction, type GeminiInteractionArgs, type GeminiInteractionResult, type GeminiStep } from './geminiInteractions';
import type { GeminiInstructionPolicy, GeminiReplayContext } from './home';

type Item = Record<string, any>;
const PREFIX = 'wisp.gemini.v1.';
const fail = (): never => { throw new Error('Unsupported or invalid Gemini Responses request/replay.'); };
const check: (condition: unknown) => asserts condition = condition => { if (!condition) fail(); };
const fields = (v: unknown, allowed: string[]): Item => {
  check(v && typeof v === 'object' && !Array.isArray(v));
  check(Object.keys(v).every(k => allowed.includes(k)));
  return v as Item;
};
export const canonical = (v: unknown): string => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const textParts = (v: unknown, type: string): string[] => {
  if (typeof v === 'string') return [v];
  check(Array.isArray(v));
  return v.map(value => {
    const p = fields(value, type === 'output_text' ? ['type', 'text', 'annotations'] : ['type', 'text']);
    check(p.type === type && typeof p.text === 'string');
    check(p.annotations === undefined || (Array.isArray(p.annotations) && !p.annotations.length));
    return p.text;
  });
};
export const metadata = (item: Item): Item => {
  check(item.id === undefined || typeof item.id === 'string');
  check(item.status === undefined || item.status === 'completed');
  const { id, status, ...rest } = item;
  if (rest.type === 'function_call') rest.arguments = JSON.parse(rest.arguments);
  if (rest.type === 'message') rest.content = textParts(rest.content, 'output_text');
  return rest;
};

// rawHeaders retains duplicates that the normalized HTTP map would conceal.
export const sessionFrom = (raw: string[]): string => {
  check(Array.isArray(raw) && raw.length % 2 === 0);
  const aliases = new Map<string, string>();
  for (let i = 0; i < raw.length; i += 2) {
    check(typeof raw[i] === 'string' && typeof raw[i + 1] === 'string');
    const name = raw[i].toLowerCase();
    if (!['session-id', 'session_id', 'thread-id', 'thread_id'].includes(name)) continue;
    check(!aliases.has(name) && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(raw[i + 1]));
    aliases.set(name, raw[i + 1].toLowerCase());
  }
  const session = aliases.get('session-id') ?? aliases.get('session_id');
  check(session && [...aliases.values()].every(v => v === session));
  return session;
};

export const preflightGeminiResponses = (value: unknown, rawHeaders: string[], provider: {
  id: string; kind?: string; keyId?: string; baseUrl: string; apiKeyEnv: string;
}, model: string, policy: string = 'strict', defaultEffort = 'medium') => {
  check(provider.id === 'gemini-api' && provider.kind === 'gemini-interactions' && !provider.keyId && !provider.apiKeyEnv &&
    provider.baseUrl === 'https://generativelanguage.googleapis.com/v1beta' && model === 'gemini-4-argon');
  const session = sessionFrom(rawHeaders);
  check(policy === 'strict' || policy === 'prepend-leading-developer-v1');
  const body = fields(value, ['model', 'input', 'instructions', 'tools', 'tool_choice', 'parallel_tool_calls', 'reasoning', 'max_output_tokens', 'store', 'stream', 'include', 'prompt_cache_key', 'client_metadata', 'metadata', 'safety_identifier']);
  check(body.instructions === undefined || typeof body.instructions === 'string');
  check(body.parallel_tool_calls !== false && body.reasoning?.context === undefined);
  check(body.reasoning?.effort === undefined || ['low', 'medium', 'high'].includes(body.reasoning.effort));
  const input: Item[] = typeof body.input === 'string' ? [{ type: 'message', role: 'user', content: body.input }] : body.input;
  check(Array.isArray(input) && input.length > 0);
  const fragments = body.instructions === undefined ? [] : [body.instructions as string];
  let leading = 0;
  for (let i = 0; i < input.length; i++) {
    const item = input[i];
    check(item && typeof item === 'object');
    if (item.role === 'developer') {
      fields(item, ['type', 'id', 'role', 'content']);
      check(policy === 'prepend-leading-developer-v1' && i === leading && (item.type === undefined || item.type === 'message'));
      check(item.id === undefined || typeof item.id === 'string');
      fragments.push(...textParts(item.content, 'input_text')); leading++;
    } else if (item.type === 'reasoning') {
      fields(item, ['id', 'type', 'summary', 'content', 'encrypted_content']);
      check(item.id === undefined || typeof item.id === 'string');
      check(item.content === undefined || item.content === null);
      check(Array.isArray(item.summary) && !item.summary.length && typeof item.encrypted_content === 'string' && item.encrypted_content.startsWith(PREFIX));
    } else if (item.type === 'message' || (!item.type && item.role)) {
      fields(item, ['id', 'status', 'type', 'role', 'content']);
      check(item.role === 'user' || item.role === 'assistant');
      check(item.id === undefined || typeof item.id === 'string');
      check(item.status === undefined || item.status === 'completed');
      textParts(item.content, item.role === 'user' ? 'input_text' : 'output_text');
    } else if (item.type === 'function_call') {
      fields(item, ['id', 'status', 'type', 'call_id', 'name', 'namespace', 'arguments']); metadata(item);
    } else if (item.type === 'custom_tool_call') {
      fields(item, ['id', 'status', 'type', 'call_id', 'name', 'namespace', 'input']); metadata(item);
      check(typeof item.input === 'string');
    } else if (item.type === 'function_call_output' || item.type === 'custom_tool_call_output') {
      fields(item, ['id', 'type', 'call_id', 'output']); check(typeof item.output === 'string');
      check(item.id === undefined || typeof item.id === 'string');
    } else fail();
  }
  const validateTools = (values: unknown, nested = false): void => {
    check(Array.isArray(values));
    for (const value of values) {
      const tool = fields(value, ['type', 'name', 'description', 'parameters', 'strict', 'tools', 'format']);
      if (tool.type === 'namespace') {
        fields(tool, ['type', 'name', 'description', 'tools']); check(!nested); validateTools(tool.tools, true);
      } else if (tool.type === 'custom') {
        fields(tool, ['type', 'name', 'description', 'format']);
        check(!nested && tool.name === 'apply_patch');
        const format = fields(tool.format, ['type', 'syntax', 'definition']);
        check(format.type === 'grammar' && format.syntax === 'lark' && typeof format.definition === 'string');
        // ponytail: qualify only these observed LF/CRLF grammars; native parsing/policy still owns validation.
        check(['d6367f4826ed608c424b0a308f3d6163527df63c22513d089b91863552f8bfeb',
          'ce2574fac05867f519a0ce3bdae50ce7d68b6d2e5f68d3c0c7e75518142d89b3']
          .includes(createHash('sha256').update(format.definition).digest('hex')));
      } else { fields(tool, ['type', 'name', 'description', 'parameters', 'strict']); check(tool.type === 'function' && (tool.strict === undefined || tool.strict === false)); }
    }
  };
  validateTools(body.tools ?? []);
  // Reuse the existing tool registry/shape validator only after inspecting the original roles.
  const { max_output_tokens: maxOutputTokens, ...parserBody } = body;
  const parsed = parseResponsesRequest({ ...parserBody, input: input.filter(item => item.type !== 'reasoning') });
  const effort = parsed.responses?.effort ?? defaultEffort;
  buildGeminiInteractionRequest({ model, input: [], tools: parsed.tools, effort, maxOutputTokens });
  return { body, input, leading, parsed, session, model, effort, maxOutputTokens, policy: policy as GeminiInstructionPolicy,
    ...(fragments.length ? { systemInstruction: fragments.join('\n\n') } : {}) };
};
type Preflight = ReturnType<typeof preflightGeminiResponses>;
const binding = (p: Preflight, input: Item[]): string => createHash('sha256').update(canonical({
  root: Object.prototype.hasOwnProperty.call(p.body, 'instructions') ? [p.body.instructions] : [], input, tools: p.body.tools ?? [], policy: p.policy,
})).digest('hex');
const scope = (p: Preflight, c: GeminiReplayContext): Buffer => Buffer.from(canonical({
  version: 1, provider: 'gemini-api', keyOwner: 'gemini-api', model: p.model, session: p.session,
  lifetime: c.lifetime, credentialBinding: c.credentialBinding, policy: p.policy,
}));
export const replayKey = (context: GeminiReplayContext): Buffer => {
  check(context && typeof context.key === 'string' && typeof context.lifetime === 'string' && typeof context.credentialBinding === 'string');
  const key = Buffer.from(context.key, 'base64url');
  check(key.length === 32 && key.toString('base64url') === context.key);
  return key;
};
// Shared by the API and subscription transports; each supplies its own prefix and authenticated scope.
export const sealGeminiReplay = (value: unknown, context: GeminiReplayContext, associatedData: Buffer): string => {
  const plain = Buffer.from(JSON.stringify(value));
  // ponytail: 64 KiB per model-state packet; qualify a larger client round trip before increasing this limit.
  check(plain.length <= 65536);
  const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', replayKey(context), nonce);
  cipher.setAAD(associatedData);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url');
};
export const openGeminiReplay = (encoded: string, context: GeminiReplayContext, associatedData: Buffer): unknown => {
  check(typeof encoded === 'string' && encoded.length <= 90000 && /^[A-Za-z0-9_-]+$/.test(encoded));
  const bytes = Buffer.from(encoded, 'base64url');
  check(bytes.length > 28 && bytes.toString('base64url') === encoded);
  const cipher = createDecipheriv('aes-256-gcm', replayKey(context), bytes.subarray(0, 12));
  cipher.setAAD(associatedData); cipher.setAuthTag(bytes.subarray(12, 28));
  const plain = Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]);
  check(plain.length <= 65536);
  return JSON.parse(plain.toString('utf8'));
};
const visible = (result: GeminiInteractionResult, p: Preflight): Item[] => {
  check(result.steps.length <= 64);
  const items: Item[] = [];
  for (const step of result.steps) {
    if (step.type === 'model_output' && step.content?.length) {
      items.push({ type: 'message', role: 'assistant', content: step.content.map(part => ({ type: 'output_text', text: part.text, annotations: [] })) });
    } else if (step.type === 'function_call') {
      items.push(encodeResponsesToolCall({ id: step.id, name: step.name, argsJson: JSON.stringify(step.arguments) }, p.parsed.registry));
    }
  }
  check(items.length);
  return items;
};

export const prepareGeminiReplay = (p: Preflight, context: GeminiReplayContext) => {
  replayKey(context);
  const steps: GeminiStep[] = [];
  for (let i = p.leading; i < p.input.length; i++) {
    const item = p.input[i];
    if (item.role === 'user') {
      steps.push({ type: 'user_input', content: textParts(item.content, 'input_text').map(text => ({ type: 'text', text })) });
      continue;
    }
    check(item.type === 'reasoning');
    const encoded = item.encrypted_content.slice(PREFIX.length);
    let payload: Item;
    try {
      payload = fields(openGeminiReplay(encoded, context, scope(p, context)), ['v', 'binding', 'result']);
    } catch { return fail(); }
    check(payload.v === 1 && payload.binding === binding(p, p.input.slice(0, i)));
    const result = parseGeminiInteraction(payload.result);
    const expected = visible(result, p);
    check(canonical(p.input.slice(i + 1, i + 1 + expected.length).map(metadata)) === canonical(expected.map(metadata)));
    steps.push(...result.steps); i += expected.length;
    const pending = new Map(expected.filter(item => item.type === 'function_call' || item.type === 'custom_tool_call')
      .map(item => [item.call_id, `${item.type}_output`]));
    while (pending.size) {
      const output = p.input[++i];
      check(output && pending.get(output.call_id) === output.type && pending.delete(output.call_id));
      steps.push({ type: 'function_result', call_id: output.call_id, result: output.output });
    }
  }
  const request: GeminiInteractionArgs = { model: p.model, input: steps, tools: p.parsed.tools,
    ...(p.systemInstruction === undefined ? {} : { systemInstruction: p.systemInstruction }),
    ...(p.maxOutputTokens === undefined ? {} : { maxOutputTokens: p.maxOutputTokens }),
    effort: p.effort };
  buildGeminiInteractionRequest(request);
  return { ...p, context, request };
};

export const finishGeminiResponses = (p: ReturnType<typeof prepareGeminiReplay>, value: unknown, id: string) => {
  const result = parseGeminiInteraction(value);
  const used = new Set(p.request.input.filter(step => step.type === 'function_call').map(step => step.id));
  check(result.steps.every(step => step.type !== 'function_call' || !used.has(step.id)));
  const items = visible(result, p);
  const carrier = { type: 'reasoning', summary: [], encrypted_content: PREFIX + sealGeminiReplay({ v: 1, binding: binding(p, p.input), result }, p.context, scope(p, p.context)) };
  const output: Item[] = [carrier, ...items].map((item, index) => ({ ...item, id: `${id}_${index}`, ...(index ? { status: 'completed' } : {}) }));
  const usage = result.usage && {
    ...(result.usage.total_input_tokens === undefined ? {} : { input_tokens: result.usage.total_input_tokens }),
    ...(result.usage.total_output_tokens === undefined ? {} : { output_tokens: result.usage.total_output_tokens }),
    ...(result.usage.total_tokens === undefined ? {} : { total_tokens: result.usage.total_tokens }),
    ...(result.usage.total_cached_tokens === undefined ? {} : { input_tokens_details: { cached_tokens: result.usage.total_cached_tokens } }),
  };
  const response: Item = { id, object: 'response', created_at: Math.floor(Date.now() / 1000), model: p.parsed.model, status: 'completed', output,
    ...(usage && Object.keys(usage).length ? { usage } : {}) };
  return { response, frames: completedResponseFrames(response) };
};

export const completedResponseFrames = (response: Item): string => {
  const output: Item[] = response.output;
  let sequence = 0;
  const frame = (type: string, fields: Item): string => `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...fields })}\n\n`;
  let frames = frame('response.created', { response: { ...response, status: 'in_progress', output: [] } });
  for (const [output_index, item] of output.entries()) {
    const field = item.type === 'function_call' ? 'arguments' : item.type === 'custom_tool_call' ? 'input' : undefined;
    frames += frame('response.output_item.added', { output_index, item: field ? { ...item, status: 'in_progress', [field]: '' }
      : item.type === 'message' ? { ...item, status: 'in_progress', content: [] } : item });
    if (item.type === 'message') for (const [content_index, part] of item.content.entries()) {
      const position = { item_id: item.id, output_index, content_index };
      frames += frame('response.content_part.added', { ...position, part: { ...part, text: '' } });
      frames += frame('response.output_text.delta', { ...position, delta: part.text });
      frames += frame('response.output_text.done', { ...position, text: part.text });
      frames += frame('response.content_part.done', { ...position, part });
    }
    if (field) {
      const prefix = item.type === 'custom_tool_call' ? 'response.custom_tool_call_input' : 'response.function_call_arguments';
      frames += frame(`${prefix}.delta`, { item_id: item.id, output_index, delta: item[field] });
      frames += frame(`${prefix}.done`, { item_id: item.id, output_index, [field]: item[field] });
    }
    frames += frame('response.output_item.done', { output_index, item });
  }
  frames += frame('response.completed', { response });
  return frames;
};

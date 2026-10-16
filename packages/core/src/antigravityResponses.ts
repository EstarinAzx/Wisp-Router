import { createHash } from 'crypto';
import { buildAntigravityRequestBody, hoistAntigravityDesktopInstructions, isAntigravityArgonModel,
  validateAntigravityFunctionCallPairing, type AntigravityTurn } from './antigravity';
import { createResponsesEncoder, parseDesktopResponsesRequest, parseResponsesRequest } from './bridgeResponses';
import { canonical, completedResponseFrames, metadata, openGeminiReplay, replayKey, sealGeminiReplay, sessionFrom } from './geminiResponses';
import type { GeminiReplayContext } from './home';

type Item = Record<string, any>;
const PREFIX = 'wisp.antigravity.v1.';
export class ArgonReplayError extends Error {
  constructor(readonly status = 400, readonly retryAfterMs?: number) {
    super('Argon request could not be completed with the current sign-in and conversation state.');
  }
}
const fail = (): never => { throw new ArgonReplayError(); };
const check: (value: unknown) => asserts value = value => { if (!value) fail(); };
const object = (value: unknown): Item => { check(value && typeof value === 'object' && !Array.isArray(value)); return value as Item; };

export const preflightAntigravityResponses = (value: unknown, rawHeaders: string[], provider: { id: string; kind?: string; baseUrl: string }, model: string, hoisting = false) => {
  check(provider.kind === 'antigravity-oauth' && isAntigravityArgonModel(model));
  const body = object(structuredClone(value));
  const input: Item[] = typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : body.input;
  check(Array.isArray(input) && input.length);
  for (const raw of input) {
    const item = object(raw);
    if (item.type !== 'reasoning') continue;
    check(Object.keys(item).every(key => ['id', 'type', 'summary', 'content', 'encrypted_content'].includes(key)));
    check(item.id === undefined || typeof item.id === 'string');
    check(item.content === undefined || item.content === null);
    check(Array.isArray(item.summary) && !item.summary.length && typeof item.encrypted_content === 'string' && item.encrypted_content.startsWith(PREFIX));
    const encoded = item.encrypted_content.slice(PREFIX.length);
    check(encoded.length <= 90000 && /^[A-Za-z0-9_-]+$/.test(encoded));
  }
  const { max_output_tokens: maxOutputTokens, ...parserBody } = body;
  check(maxOutputTokens === undefined || (Number.isSafeInteger(maxOutputTokens) && maxOutputTokens > 0));
  check(body.reasoning?.context === undefined);
  check(body.text?.verbosity === undefined);
  const effort = model.slice(model.lastIndexOf('-') + 1);
  check(body.reasoning?.effort === undefined || body.reasoning.effort === effort || (hoisting && body.reasoning.effort === 'none'));
  if (hoisting) check(!input.some(item => item.role === 'system'));
  const parsed = (hoisting ? parseDesktopResponsesRequest : parseResponsesRequest)({ ...parserBody, input: input.filter(item => item.type !== 'reasoning') });
  check(!parsed.turns.some(turn => turn.contentParts?.length || turn.toolResults.some(result => result.contentParts?.length)));
  if (!hoisting) {
    const first = parsed.turns.findIndex(turn => turn.role !== 'system');
    check(first < 0 || !parsed.turns.slice(first).some(turn => turn.role === 'system'));
  }
  return { body, input, parsed, model, providerId: provider.id, baseUrl: provider.baseUrl,
    session: sessionFrom(rawHeaders), hoisting, maxOutputTokens };
};
type Preflight = ReturnType<typeof preflightAntigravityResponses>;
const binding = (p: Preflight, input: Item[]): string => createHash('sha256').update(canonical({
  root: Object.prototype.hasOwnProperty.call(p.body, 'instructions') ? [p.body.instructions] : [], input, tools: p.body.tools ?? [], hoisting: p.hoisting,
})).digest('hex');
const scope = (p: Preflight, context: GeminiReplayContext): Buffer => Buffer.from(canonical({
  version: 1, provider: p.providerId, endpoint: p.baseUrl, model: p.model, alias: p.parsed.model, session: p.session,
  lifetime: context.lifetime, credentialBinding: context.credentialBinding, hoisting: p.hoisting,
}));
const resultOf = (value: unknown) => {
  const outer = object(value), result = object(outer.response ?? outer);
  check(result.modelVersion === 'gemini-4-argon' && Array.isArray(result.candidates) && result.candidates.length === 1);
  const candidate = object(result.candidates[0]), content = object(candidate.content), usage = object(result.usageMetadata);
  check(candidate.finishReason === 'STOP' && content.role === 'model' && Array.isArray(content.parts) && content.parts.length);
  check(content.parts.every((part: unknown) => {
    const p = object(part);
    return p.functionResponse === undefined && p.inlineData === undefined && p.fileData === undefined
      && (p.thought === undefined || typeof p.thought === 'boolean')
      && (p.thoughtSignature === undefined || typeof p.thoughtSignature === 'string');
  }));
  const prompt = usage.promptTokenCount, candidateTokens = usage.candidatesTokenCount,
    thoughts = usage.thoughtsTokenCount ?? 0, cached = usage.cachedContentTokenCount ?? 0;
  check([prompt, candidateTokens, thoughts, cached, prompt + candidateTokens + thoughts].every(n => Number.isSafeInteger(n) && n >= 0));
  check(cached <= prompt && prompt + candidateTokens + thoughts > 0);
  return { modelVersion: result.modelVersion as string,
    candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: structuredClone(content.parts) as Item[] } }],
    usageMetadata: { promptTokenCount: prompt as number, candidatesTokenCount: candidateTokens as number,
      thoughtsTokenCount: thoughts as number, cachedContentTokenCount: cached as number } };
};
type NativeResult = ReturnType<typeof resultOf>;
const visible = (result: NativeResult, p: Preflight, id: string) => {
  const encoder = createResponsesEncoder(p.parsed, id);
  for (const part of result.candidates[0].content.parts) {
    if (part.thought) continue;
    if (typeof part.text === 'string' && part.text) encoder.push({ type: 'text', text: part.text });
    if (part.functionCall !== undefined) {
      const call = object(part.functionCall);
      check(typeof call.id === 'string' && !!call.id && typeof call.name === 'string');
      encoder.push({ type: 'tool_call', call: { id: call.id, name: call.name, argsJson: JSON.stringify(call.args ?? {}) } });
    }
  }
  const u = result.usageMetadata;
  encoder.push({ type: 'usage', usage: { input_tokens: u.promptTokenCount - u.cachedContentTokenCount,
    cache_read_input_tokens: u.cachedContentTokenCount, cache_creation_input_tokens: 0, output_tokens: u.candidatesTokenCount + u.thoughtsTokenCount } });
  return encoder.finish().response;
};

export const prepareAntigravityReplay = (p: Preflight, context: GeminiReplayContext) => {
  check(typeof context?.key === 'string' && typeof context.lifetime === 'string' && typeof context.credentialBinding === 'string');
  replayKey(context);
  const states: NativeResult[] = [];
  for (let i = 0; i < p.input.length; i++) {
    const item = p.input[i];
    if (item.type === 'reasoning') {
      let payload: Item;
      try { payload = object(openGeminiReplay(item.encrypted_content.slice(PREFIX.length), context, scope(p, context))); }
      catch { return fail(); }
      check(Object.keys(payload).every(key => ['v', 'binding', 'result'].includes(key)) && payload.v === 1 && payload.binding === binding(p, p.input.slice(0, i)));
      const native = resultOf(payload.result), expected = visible(native, p, 'replay').output;
      check(canonical(p.input.slice(i + 1, i + 1 + expected.length).map(metadata)) === canonical(expected.map(metadata)));
      states.push(native); i += expected.length;
    } else check(item.role !== 'assistant' && !['function_call', 'custom_tool_call', 'tool_search_call'].includes(item.type));
  }
  let stateIndex = 0;
  const turns: AntigravityTurn[] = p.parsed.turns.map(turn => {
    const out: AntigravityTurn = { role: turn.role, content: turn.text, toolCalls: turn.toolCalls, toolResults: turn.toolResults };
    if (turn.role === 'assistant') {
      const native = states[stateIndex++]; check(native);
      out.nativeParts = native.candidates[0].content.parts;
    }
    return out;
  });
  check(stateIndex === states.length);
  const messages: AntigravityTurn[] = p.parsed.system ? [{ role: 'system', content: p.parsed.system }, ...turns] : turns;
  const request = { model: p.model, messages: p.hoisting ? hoistAntigravityDesktopInstructions(messages) : messages,
    tools: p.parsed.tools, maxOutputTokens: p.maxOutputTokens as number | undefined, preserveSystemText: true };
  check(!validateAntigravityFunctionCallPairing(buildAntigravityRequestBody({ ...request, requestId: 'preflight' })));
  return { ...p, context: { ...context }, request };
};

export const finishAntigravityResponses = (p: ReturnType<typeof prepareAntigravityReplay>, value: unknown, id: string) => {
  const result = resultOf(value), response = visible(result, p, id);
  check(p.request.maxOutputTokens === undefined || response.usage.output_tokens <= p.request.maxOutputTokens);
  const used = new Set(p.request.messages.flatMap(turn => turn.toolCalls ?? []).map(call => call.id));
  check(response.output.every((item: Item) => !item.call_id || !used.has(item.call_id)));
  let encrypted: string;
  try { encrypted = sealGeminiReplay({ v: 1, binding: binding(p, p.input), result }, p.context, scope(p, p.context)); }
  catch { return fail(); }
  response.output.unshift({ id: `${id}_state`, type: 'reasoning', summary: [], encrypted_content: PREFIX + encrypted });
  return { response, frames: completedResponseFrames(response) };
};

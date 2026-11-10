import { validTokenCounts, type ToolSpec } from './shared';

export type GeminiEffort = 'low' | 'medium' | 'high';
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };
export type GeminiText = { type: 'text'; text: string };
export type GeminiFunctionCall = { type: 'function_call'; id: string; name: string; arguments: JsonObject };
export type GeminiStep =
  | { type: 'user_input' | 'model_output'; content?: readonly GeminiText[] }
  | { type: 'thought'; signature?: string; summary?: readonly GeminiText[] }
  | GeminiFunctionCall
  | { type: 'function_result'; call_id: string; result: JsonObject | string | readonly GeminiText[]; name?: string; is_error?: boolean };

type ModalityTokens = { modality?: 'text' | 'image' | 'audio' | 'video' | 'document'; tokens?: number };
export type GeminiUsage = {
  // Provider fields, not BridgeUsage: cached/thought counts must not be added to other totals here.
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_thought_tokens?: number;
  total_cached_tokens?: number;
  total_tool_use_tokens?: number;
  total_tokens?: number;
  input_tokens_by_modality?: readonly ModalityTokens[];
  output_tokens_by_modality?: readonly ModalityTokens[];
  cached_tokens_by_modality?: readonly ModalityTokens[];
  tool_use_tokens_by_modality?: readonly ModalityTokens[];
  grounding_tool_count?: readonly { type?: 'google_search' | 'google_maps' | 'retrieval'; count?: number }[];
};
export type GeminiInteractionArgs = {
  model: string;
  input: readonly GeminiStep[];
  // Already resolved by the caller's instruction policy; this module performs no role translation.
  systemInstruction?: string;
  effort?: string;
  tools?: readonly ToolSpec[];
  maxOutputTokens?: number;
};
export type GeminiInteractionRequest = {
  model: 'gemini-4-argon';
  input: readonly GeminiStep[];
  system_instruction?: string;
  generation_config: { thinking_level: GeminiEffort; max_output_tokens?: number };
  tools?: { type: 'function'; name: string; description: string; parameters?: object }[];
  store: false;
  stream: false;
  background: false;
};
export type GeminiInteractionResult = {
  status: 'completed' | 'requires_action';
  steps: readonly GeminiStep[];
  usage?: GeminiUsage;
};
type ErrorCode = 'invalid_request' | 'invalid_response' | 'failed' | 'cancelled' | 'incomplete' | 'auth' | 'http' | 'network' | 'aborted';
export class GeminiInteractionError extends Error {
  constructor(readonly code: ErrorCode, readonly status?: number, readonly retryAfterMs?: number) {
    super(`Gemini interaction ${code}${status === undefined ? '' : ` (HTTP ${status})`}`);
    this.name = 'GeminiInteractionError';
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const nonblank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const keys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.includes(key));
const check: (condition: unknown, code: ErrorCode) => asserts condition = (condition, code) => {
  if (!condition) throw new GeminiInteractionError(code);
};

// Reject values JSON would silently drop/change, including cycles and executable accessors/toJSON.
const json = (value: unknown, ancestors = new Set<object>()): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if ((!Array.isArray(value) && !record(value)) || ancestors.has(value)) return false;
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const fields = Reflect.ownKeys(descriptors).filter(key => !(Array.isArray(value) && key === 'length'));
  const valid = (!Array.isArray(value) || (fields.length === value.length && fields.every((key, index) => key === String(index)))) && fields.every(key => {
    if (typeof key !== 'string') return false;
    const field = descriptors[key];
    return field.enumerable && 'value' in field && json(field.value, ancestors);
  });
  ancestors.delete(value);
  return valid;
};
const checkJson = (value: unknown, code: ErrorCode): void => {
  try { check(json(value), code); }
  catch { throw new GeminiInteractionError(code); }
};
const textList = (value: unknown, code: ErrorCode): void => {
  check(Array.isArray(value), code);
  for (const part of value) check(record(part) && keys(part, ['type', 'text']) && part.type === 'text' && typeof part.text === 'string', code);
};

const steps = (value: unknown, output: boolean): readonly GeminiStep[] => {
  const code = output ? 'invalid_response' : 'invalid_request';
  check(Array.isArray(value), code);
  checkJson(value, code);
  const seen = new Set<string>();
  const pending = new Map<string, string>();
  let receivingResults = false;
  for (const step of value) {
    check(record(step), code);
    if (receivingResults && pending.size) check(step.type === 'function_result', code);
    switch (step.type) {
      case 'user_input':
        check(!output && !pending.size, code);
        // Same content shape as model_output; optional content stays absent.
      case 'model_output':
        check(keys(step, ['type', 'content']), code);
        if ('content' in step) textList(step.content, code);
        break;
      case 'thought':
        check(keys(step, ['type', 'signature', 'summary']), code);
        if ('signature' in step) check(typeof step.signature === 'string', code);
        if ('summary' in step) textList(step.summary, code);
        break;
      case 'function_call':
        check(keys(step, ['type', 'id', 'name', 'arguments']) && nonblank(step.id) && nonblank(step.name) && record(step.arguments), code);
        check(!seen.has(step.id), code);
        seen.add(step.id);
        pending.set(step.id, step.name);
        receivingResults = false;
        break;
      case 'function_result':
        check(!output && keys(step, ['type', 'call_id', 'result', 'name', 'is_error']) && nonblank(step.call_id) && pending.has(step.call_id), code);
        if ('name' in step) check(step.name === pending.get(step.call_id), code);
        if ('is_error' in step) check(typeof step.is_error === 'boolean', code);
        if (Array.isArray(step.result)) textList(step.result, code);
        else check(typeof step.result === 'string' || record(step.result), code);
        pending.delete(step.call_id);
        receivingResults = true;
        break;
      default: throw new GeminiInteractionError(code);
    }
  }
  check(output || !pending.size, code);
  return value as GeminiStep[];
};

export const buildGeminiInteractionRequest = (args: GeminiInteractionArgs): GeminiInteractionRequest => {
  const code = 'invalid_request';
  check(record(args) && keys(args, ['model', 'input', 'systemInstruction', 'effort', 'tools', 'maxOutputTokens']), code);
  check(args.model === 'gemini-4-argon', code);
  const effort = args.effort === undefined ? 'medium' : args.effort;
  check(effort === 'low' || effort === 'medium' || effort === 'high', code);
  check(args.systemInstruction === undefined || typeof args.systemInstruction === 'string', code);
  check(args.maxOutputTokens === undefined || (validTokenCounts(args.maxOutputTokens) && args.maxOutputTokens > 0 && args.maxOutputTokens <= 65536), code);
  const input = steps(args.input, false);
  const names = new Set<string>();
  let tools: GeminiInteractionRequest['tools'];
  if (args.tools !== undefined) {
    check(Array.isArray(args.tools), code);
    tools = args.tools.map(tool => {
      check(record(tool) && keys(tool, ['name', 'description', 'inputSchema']) && nonblank(tool.name) && typeof tool.description === 'string', code);
      check(!names.has(tool.name), code);
      names.add(tool.name);
      if (tool.inputSchema !== undefined) {
        check(record(tool.inputSchema), code);
        checkJson(tool.inputSchema, code);
      }
      return { type: 'function', name: tool.name, description: tool.description,
        ...(tool.inputSchema === undefined ? {} : { parameters: tool.inputSchema }) };
    });
  }
  return { model: 'gemini-4-argon', input,
    ...(args.systemInstruction === undefined ? {} : { system_instruction: args.systemInstruction }),
    generation_config: { thinking_level: effort, ...(args.maxOutputTokens === undefined ? {} : { max_output_tokens: args.maxOutputTokens }) },
    ...(tools === undefined ? {} : { tools }), store: false, stream: false, background: false };
};

const tokenFields = ['total_input_tokens', 'total_output_tokens', 'total_thought_tokens', 'total_cached_tokens', 'total_tool_use_tokens', 'total_tokens'];
const modalityFields = ['input_tokens_by_modality', 'output_tokens_by_modality', 'cached_tokens_by_modality', 'tool_use_tokens_by_modality'];
const count = (value: unknown): boolean => validTokenCounts(value) && (value as number) <= 2147483647;
const usage = (value: unknown): GeminiUsage => {
  const code = 'invalid_response';
  check(record(value) && keys(value, [...tokenFields, ...modalityFields, 'grounding_tool_count']), code);
  for (const [key, field] of Object.entries(value)) {
    if (tokenFields.includes(key)) { check(count(field), code); continue; }
    check(Array.isArray(field), code);
    for (const item of field) {
      if (key === 'grounding_tool_count') {
        check(record(item) && keys(item, ['type', 'count']), code);
        if ('type' in item) check(['google_search', 'google_maps', 'retrieval'].includes(item.type as string), code);
        if ('count' in item) check(count(item.count), code);
      } else {
        check(record(item) && keys(item, ['modality', 'tokens']), code);
        if ('modality' in item) check(['text', 'image', 'audio', 'video', 'document'].includes(item.modality as string), code);
        if ('tokens' in item) check(count(item.tokens), code);
      }
    }
  }
  return value as GeminiUsage;
};

export const parseGeminiInteraction = (value: unknown): GeminiInteractionResult => {
  const code = 'invalid_response';
  check(record(value), code);
  if (value.status === 'failed' || value.status === 'cancelled' || value.status === 'incomplete') throw new GeminiInteractionError(value.status);
  check(value.status === 'completed' || value.status === 'requires_action', code);
  check(keys(value, ['id', 'model', 'created', 'updated', 'status', 'steps', 'usage', 'errors']), code);
  checkJson(value, code);
  for (const field of ['id', 'created', 'updated']) if (field in value) check(typeof value[field] === 'string', code);
  if ('model' in value) check(value.model === 'gemini-4-argon', code);
  if ('errors' in value) check(Array.isArray(value.errors) && value.errors.length === 0, code);
  const output = steps(value.steps, true);
  const calls = output.filter(step => step.type === 'function_call');
  check(value.status === 'requires_action' ? calls.length > 0 : calls.length === 0, code);
  return { status: value.status, steps: output, ...('usage' in value ? { usage: usage(value.usage) } : {}) };
};

// Native Codex's visible Responses subset. Tool execution and policy remain in the client.
import { createHash } from 'node:crypto';
import type { AssembledToolCall, BridgeUsage, NormalizedTurn, NormalizedContentPart } from './catalog';
import type { BridgeChatRequest, BridgeStreamEvent } from './bridge';

type RecordValue = Record<string, any>;
const object = (v: unknown, label: string): RecordValue => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${label} must be an object`);
  return v as RecordValue;
};
const string = (v: unknown, label: string): string => {
  if (typeof v !== 'string') throw new Error(`${label} must be a string`);
  return v;
};
const nonempty = (v: unknown, label: string): string => {
  const s = string(v, label); if (!s) throw new Error(`${label} must not be empty`); return s;
};
const array = (v: unknown, label: string): unknown[] => {
  if (!Array.isArray(v)) throw new Error(`${label} must be an array`); return v;
};
const jsonArgs = (v: unknown): RecordValue => object(JSON.parse(string(v, 'tool arguments')), 'tool arguments');
const canonical = (v: any): string => JSON.stringify(v, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
const fields = (value: RecordValue, allowed: string[], label: string) => {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unsupported ${label}: ${key}`);
};
type Tool = { namespace?: string; name: string; kind: 'function' | 'custom' | 'tool_search'; upstream: string; definition: string };
export type BridgeResponsesRequest = BridgeChatRequest & { registry: Map<string, Tool>; omittedHostedSearch?: number };

// Native desktop attaches this prospective declaration even to routes advertising no search.
// Only signed external callers use this shim. Strict parsing still rejects forced choices,
// unsupported options/includes and opaque/executed history; ordinary named tools are untouched.
export const parseDesktopResponsesRequest = (value: unknown): BridgeResponsesRequest => {
  const body = object(value, 'request');
  if (Array.isArray(body.input) && body.input.some(item => item?.type === 'web_search_call' || item?.type === 'web_search_result')) throw new Error('Hosted search history is unsupported');
  const hosted = (tool: any) => tool?.type === 'web_search' || tool?.type === 'web_search_preview';
  if (!Array.isArray(body.tools) || !body.tools.some(hosted)) return parseResponsesRequest(body);
  if (body.tool_choice !== undefined && body.tool_choice !== 'auto') throw new Error('Hosted search choice is unsupported');
  const tools = body.tools.filter((tool: unknown) => !hosted(tool));
  return { ...parseResponsesRequest({ ...body, tools }), omittedHostedSearch: body.tools.length - tools.length };
};

// Rejection messages can contain arbitrary keys, tool names or malformed argument contents.
// Only fixed schema vocabulary and counts may cross this diagnostic boundary.
export const responsesRejectionDiagnostic = (error: unknown, value: unknown) => {
  const knownFields = ['model', 'input', 'instructions', 'tools', 'tool_choice', 'parallel_tool_calls', 'reasoning', 'text', 'store', 'stream', 'include', 'prompt_cache_key', 'client_metadata', 'metadata', 'safety_identifier',
    'service_tier', 'temperature', 'top_p', 'max_output_tokens', 'truncation', 'previous_response_id', 'background', 'conversation', 'stream_options', 'prompt_cache_retention', 'effort', 'context', 'summary', 'verbosity', 'format', 'type', 'image_url', 'detail'];
  const toolTypes = ['function', 'custom', 'namespace', 'tool_search', 'web_search', 'web_search_preview', 'image_generation', 'computer', 'computer_use_preview', 'code_interpreter', 'file_search', 'mcp', 'shell', 'local_shell'];
  const inputTypes = ['message', 'additional_tools', 'reasoning', 'compaction', 'function_call', 'function_call_output', 'custom_tool_call', 'custom_tool_call_output', 'tool_search_call', 'tool_search_output'];
  const record = (v: unknown): RecordValue => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const tag = (v: unknown, allowed: string[]): string => v === undefined ? 'absent' : v === null ? 'null' : typeof v === 'string' && allowed.includes(v) ? v : 'unrecognized';
  const counts = (items: unknown[], allowed: string[]) => {
    const result: Record<string, number> = {};
    for (const item of items) { const type = tag(record(item).type, allowed); result[type] = (result[type] ?? 0) + 1; }
    return result;
  };
  const reason: { code: string; scope: string; field?: string; type?: string } = { code: error instanceof SyntaxError ? 'invalid_json' : 'validation_failed', scope: 'request' };
  const message = error instanceof Error ? error.message : '';
  const field = /^Unsupported (Responses|reasoning|text|image) field: ([\s\S]*)$/.exec(message);
  if (field) { reason.code = 'unsupported_field'; reason.scope = field[1] === 'Responses' ? 'request' : field[1]; reason.field = tag(field[2], knownFields); }
  else if (message.startsWith('Unsupported tool type: ')) { reason.code = 'unsupported_tool_type'; reason.scope = 'tools'; reason.type = tag(message.slice('Unsupported tool type: '.length), toolTypes); }
  else if (message.startsWith('Unsupported input item: ')) { reason.code = 'unsupported_input_type'; reason.scope = 'input'; reason.type = tag(message.slice('Unsupported input item: '.length).split(';')[0], inputTypes); }
  else if (message.startsWith('Unsupported content type: ')) { reason.code = 'unsupported_content_type'; reason.scope = 'input'; reason.type = tag(message.slice('Unsupported content type: '.length), ['input_text', 'output_text', 'input_image', 'input_file', 'refusal']); }
  else if (message.startsWith('Conflicting tool definition: ')) { reason.code = 'conflicting_tool_definition'; reason.scope = 'tools'; }
  else if (message.startsWith('Only automatic reasoning summaries')) { reason.code = 'unsupported_reasoning_summary'; reason.scope = 'reasoning'; }
  else if (message.startsWith('Unsupported reasoning effort')) { reason.code = 'unsupported_reasoning_effort'; reason.scope = 'reasoning'; }
  else if (message === 'Hosted search history is unsupported') { reason.code = 'hosted_search_history_unsupported'; reason.scope = 'input'; }
  else if (message === 'Hosted search choice is unsupported') { reason.code = 'hosted_search_choice_unsupported'; reason.scope = 'tools'; }
  else if (message === 'Stored responses are unsupported') { reason.code = 'stored_responses_unsupported'; }
  else if (message === 'Only automatic tool choice is supported') { reason.code = 'unsupported_tool_choice'; reason.scope = 'tools'; }
  const body = record(value), reasoning = record(body.reasoning), input = Array.isArray(body.input) ? body.input : [], tools = Array.isArray(body.tools) ? body.tools : [];
  let conversation = false, developerAfterConversation = 0;
  for (const raw of input) { const item = record(raw); if (item.role === 'developer' && conversation) developerAfterConversation++;
    if (item.role === 'user' || item.role === 'assistant' || ['function_call', 'function_call_output', 'custom_tool_call', 'custom_tool_call_output'].includes(item.type)) conversation = true; }
  return { reason, shape: {
    fields: Object.keys(body).filter(key => knownFields.includes(key)), unknownFieldCount: Object.keys(body).filter(key => !knownFields.includes(key)).length,
    serviceTier: tag(body.service_tier, ['default', 'auto', 'priority', 'flex']), reasoningEffort: tag(reasoning.effort, ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']),
    reasoningSummary: tag(reasoning.summary, ['auto', 'none', 'concise', 'detailed']),
    inputCount: typeof body.input === 'string' ? 1 : input.length, inputTypes: counts(input, inputTypes), toolCount: tools.length, toolTypes: counts(tools, toolTypes), developerAfterConversation,
  } };
};

export const parseResponsesRequest = (value: unknown): BridgeResponsesRequest => {
  const body = object(value, 'request');
  fields(body, ['model', 'input', 'instructions', 'tools', 'tool_choice', 'parallel_tool_calls', 'reasoning', 'text', 'store', 'stream', 'include', 'prompt_cache_key', 'client_metadata', 'metadata', 'safety_identifier'], 'Responses field');
  const model = nonempty(body.model, 'model');
  if (body.store !== undefined && body.store !== false) throw new Error('Stored responses are unsupported');
  if (body.stream !== undefined && typeof body.stream !== 'boolean') throw new Error('stream must be boolean');
  if (body.parallel_tool_calls !== undefined && typeof body.parallel_tool_calls !== 'boolean') throw new Error('parallel_tool_calls must be boolean');
  if (body.tool_choice !== undefined && body.tool_choice !== 'auto') throw new Error('Only automatic tool choice is supported');
  if (body.include !== undefined && array(body.include, 'include').some(v => v !== 'reasoning.encrypted_content')) throw new Error('Unsupported include');
  const reasoning = body.reasoning === undefined ? {} : object(body.reasoning, 'reasoning');
  fields(reasoning, ['effort', 'context', 'summary'], 'reasoning field');
  // Native unknown-model metadata requests auto. It allows no summary on this visible-history door.
  if (reasoning.summary !== undefined && reasoning.summary !== 'auto') throw new Error('Only automatic reasoning summaries are supported; this door emits no reasoning items');
  if (reasoning.context !== undefined && !['auto', 'current_turn', 'all_turns'].includes(reasoning.context)) throw new Error('Unsupported reasoning.context');
  if (reasoning.effort !== undefined) nonempty(reasoning.effort, 'reasoning.effort');
  const text = body.text === undefined ? {} : object(body.text, 'text');
  fields(text, ['verbosity', 'format'], 'text field');
  if (text.format !== undefined && (object(text.format, 'text.format').type !== 'text' || Object.keys(text.format).length !== 1)) throw new Error('Structured output is unsupported');
  if (text.verbosity !== undefined && !['low', 'medium', 'high'].includes(text.verbosity)) throw new Error('Unsupported text.verbosity');

  const registry = new Map<string, Tool>();
  const identities = new Map<string, Tool>();
  const tools: BridgeChatRequest['tools'] = [];
  const key = (namespace: string | undefined, name: string, kind: string) => JSON.stringify([namespace ?? null, name, kind]);
  const register = (definitions: unknown, namespace?: string): void => {
    for (const v of array(definitions, 'tools')) {
      const tool = object(v, 'tool');
      if (tool.type === 'namespace') {
        if (namespace) throw new Error('Nested tool namespaces are unsupported');
        register(tool.tools, nonempty(tool.name, 'namespace')); continue;
      }
      if (!['function', 'custom', 'tool_search'].includes(tool.type)) throw new Error(`Unsupported tool type: ${tool.type}`);
      const kind = tool.type as Tool['kind'];
      if (kind === 'tool_search' && tool.execution !== 'client') throw new Error('Only client tool search is supported');
      const name = kind === 'tool_search' ? 'tool_search' : nonempty(tool.name, 'tool name');
      const description = tool.description === undefined ? '' : string(tool.description, 'tool description');
      const schema = kind === 'custom'
        ? { type: 'object', properties: { input: { type: 'string' } }, required: ['input'], additionalProperties: false }
        : object(tool.parameters ?? { type: 'object', properties: {} }, 'tool parameters');
      const definition = canonical({ description, schema, format: tool.format });
      const identity = key(namespace, name, kind);
      const previous = identities.get(identity);
      if (previous) { if (previous.definition !== definition) throw new Error(`Conflicting tool definition: ${name}`); continue; }
      const upstream = `w_${createHash('sha256').update(identity).digest('hex').slice(0, 60)}`;
      if (registry.has(upstream)) throw new Error('Tool identifier collision');
      const entry = { namespace, name, kind, upstream, definition };
      identities.set(identity, entry); registry.set(upstream, entry);
      tools.push({ name: upstream, inputSchema: schema, description: `${namespace ? `${namespace}.` : ''}${name} (${kind}). ${description}${kind === 'custom' ? `\nPass the exact freeform string in input. Original format: ${JSON.stringify(tool.format ?? { type: 'text' })}. Generic upstreams do not enforce this grammar.` : ''}` });
    }
  };
  const input = typeof body.input === 'string' ? [{ type: 'message', role: 'user', content: body.input }] : array(body.input, 'input');
  register(body.tools ?? []);
  for (const v of input) {
    const item = object(v, 'input item');
    if (item.type === 'additional_tools' || item.type === 'tool_search_output') register(item.tools);
  }
  const turns: NormalizedTurn[] = [];
  const turn = (role: NormalizedTurn['role'], text = ''): NormalizedTurn => ({ role, text, toolCalls: [], toolResults: [] });
  const content = (v: unknown, allowImages = false): { text: string; contentParts?: NormalizedContentPart[] } => {
    if (typeof v === 'string') return { text: v };
    const parts: NormalizedContentPart[] = array(v, 'content').map(part => {
    const p = object(part, 'content part');
    if (p.type === 'input_image' && allowImages) {
      fields(p, ['type', 'image_url', 'detail'], 'image field');
      const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(string(p.image_url, 'image_url'));
      if (!match || Buffer.from(match[2], 'base64').toString('base64') !== match[2]) throw new Error('Only valid base64 PNG, JPEG, WebP and GIF images are supported');
      if (p.detail !== undefined && !['auto', 'low', 'high', 'original'].includes(p.detail)) throw new Error('Unsupported image detail');
      return { type: 'image', mimeType: match[1], dataBase64: match[2], ...(p.detail ? { detail: p.detail } : {}) };
    }
    if (!['input_text', 'output_text'].includes(p.type)) throw new Error(`Unsupported content type: ${p.type}`);
    return { type: 'text', text: string(p.text, 'content text') };
    });
    return { text: parts.filter(p => p.type === 'text').map(p => p.text).join(''), ...(parts.some(p => p.type === 'image') ? { contentParts: parts } : {}) };
  };
  const calls = new Map<string, Tool>();
  const outputs = new Set<string>();
  for (const v of input) {
    const item = object(v, 'input item');
    if (item.type === 'additional_tools') {
      if (item.role !== 'developer') throw new Error('additional_tools must have developer role');
      if (item.content !== undefined) turns.push({ ...turn('system'), ...content(item.content) });
    } else if (item.type === 'message' || (!item.type && item.role)) {
      if (!['system', 'developer', 'user', 'assistant'].includes(item.role)) throw new Error('Unsupported message role');
      turns.push({ ...turn(item.role === 'developer' ? 'system' : item.role), ...content(item.content, item.role === 'user') });
    } else if (['function_call', 'custom_tool_call', 'tool_search_call'].includes(item.type)) {
      const kind = item.type === 'function_call' ? 'function' : item.type === 'custom_tool_call' ? 'custom' : 'tool_search';
      const entry = identities.get(key(item.namespace, kind === 'tool_search' ? 'tool_search' : item.name, kind));
      if (!entry) throw new Error('Unknown tool identity in history');
      const id = nonempty(item.call_id, 'call_id');
      if (calls.has(id)) throw new Error('Duplicate call_id');
      calls.set(id, entry);
      if (kind === 'tool_search' && item.execution !== 'client') throw new Error('Only client tool search is supported');
      const argsJson = kind === 'custom' ? JSON.stringify({ input: string(item.input, 'custom input') })
        : kind === 'tool_search' ? JSON.stringify(object(item.arguments, 'search arguments')) : (jsonArgs(item.arguments), item.arguments);
      const previous = turns[turns.length - 1];
      const t = previous?.role === 'assistant' ? previous : turn('assistant');
      t.toolCalls.push({ id, name: entry.upstream, argsJson });
      if (t !== previous) turns.push(t);
    } else if (['function_call_output', 'custom_tool_call_output', 'tool_search_output'].includes(item.type)) {
      const id = nonempty(item.call_id, 'call_id'); const entry = calls.get(id);
      const kind = item.type === 'function_call_output' ? 'function' : item.type === 'custom_tool_call_output' ? 'custom' : 'tool_search';
      if (!entry || entry.kind !== kind || outputs.has(id)) throw new Error('Unmatched or duplicate tool result');
      outputs.add(id);
      if (kind === 'tool_search' && item.execution !== 'client') throw new Error('Only client tool search is supported');
      const result = kind === 'tool_search' ? { text: JSON.stringify(item) } : content(item.output, true);
      const t = turn('user'); t.toolResults.push({ callId: id, content: result.text, ...(result.contentParts ? { contentParts: result.contentParts } : {}) }); turns.push(t);
    } else throw new Error(`Unsupported input item: ${item.type}; opaque reasoning and compaction history cannot be replayed`);
  }
  if (!turns.length) throw new Error('No messages to send');
  return { model, stream: body.stream ?? false, system: body.instructions === undefined ? '' : string(body.instructions, 'instructions'), turns, tools, registry,
    responses: { parallelToolCalls: body.parallel_tool_calls, effort: reasoning.effort, context: reasoning.context, verbosity: text.verbosity } };
};

const outputCall = (call: AssembledToolCall, registry: Map<string, Tool>, id: string): RecordValue => {
  const tool = registry.get(call.name); if (!tool) throw new Error(`Unknown upstream tool: ${call.name}`);
  nonempty(call.id, 'upstream call_id');
  const args = jsonArgs(call.argsJson);
  const common = { id, call_id: call.id, status: 'completed', ...(tool.namespace ? { namespace: tool.namespace } : {}) };
  if (tool.kind === 'custom') {
    if (Object.keys(args).length !== 1 || typeof args.input !== 'string') throw new Error('Custom tool arguments must contain exactly one string input');
    return { ...common, type: 'custom_tool_call', name: tool.name, input: args.input };
  }
  if (tool.kind === 'tool_search') {
    if (typeof args.query !== 'string' || Object.keys(args).some(k => !['query', 'limit'].includes(k)) || (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1))) throw new Error('Invalid client tool search arguments');
    return { ...common, type: 'tool_search_call', execution: 'client', arguments: args };
  }
  return { ...common, type: 'function_call', name: tool.name, arguments: call.argsJson };
};

export const createResponsesEncoder = (parsed: BridgeResponsesRequest, id: string) => {
  let sequence = 0, text = '', textStarted = false;
  let usage: BridgeUsage | undefined, incomplete: string | undefined;
  const calls: AssembledToolCall[] = [], output: RecordValue[] = [];
  const created_at = Math.floor(Date.now() / 1000);
  const frame = (type: string, fields: RecordValue = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...fields })}\n\n`;
  const response = (status: string) => ({ id, object: 'response', created_at, model: parsed.model, status, output,
    ...(incomplete ? { incomplete_details: { reason: incomplete } } : {}),
    ...(usage ? { usage: { input_tokens: usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens, output_tokens: usage.output_tokens,
      total_tokens: usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens + usage.output_tokens, input_tokens_details: { cached_tokens: usage.cache_read_input_tokens } } } : {}) });
  const textItem = (status: string) => ({ id: `${id}_msg`, type: 'message', role: 'assistant', status, content: [{ type: 'output_text', text, annotations: [] }] });
  const position = { item_id: `${id}_msg`, output_index: 0, content_index: 0 };
  return {
    start: () => frame('response.created', { response: response('in_progress') }),
    push: (event: BridgeStreamEvent): string => {
      if (event.type === 'tool_call') { calls.push(event.call); return ''; }
      if (event.type === 'usage') { usage = event.usage; return ''; }
      if (event.type === 'truncation') { incomplete = event.reason; return ''; }
      if (event.type !== 'text') return ''; // Never emit opaque reasoning items.
      let frames = '';
      if (!textStarted) {
        textStarted = true;
        frames += frame('response.output_item.added', { output_index: 0, item: { ...textItem('in_progress'), content: [] } });
        frames += frame('response.content_part.added', { ...position, part: { type: 'output_text', text: '', annotations: [] } });
      }
      text += event.text;
      return frames + frame('response.output_text.delta', { ...position, delta: event.text });
    },
    finish: (): { frames: string; response: RecordValue } => {
      if (!text && !calls.length && !incomplete) throw new Error('Provider returned no visible output');
      if (parsed.responses?.parallelToolCalls === false && calls.length > 1) throw new Error('Provider returned multiple tools with parallel_tool_calls=false');
      if (new Set(calls.map(c => c.id)).size !== calls.length) throw new Error('Duplicate upstream call_id');
      // Validate every call before exposing any executable item, even when parallel calls are allowed.
      const items = incomplete ? [] : calls.map((call, i) => outputCall(call, parsed.registry, `${id}_call_${i}`));
      let frames = '';
      if (textStarted) {
        const item = textItem(incomplete ? 'incomplete' : 'completed'); output.push(item);
        frames += frame('response.output_text.done', { ...position, text });
        frames += frame('response.content_part.done', { ...position, part: item.content[0] });
        frames += frame('response.output_item.done', { output_index: 0, item });
      }
      for (const item of items) {
        const output_index = output.length; output.push(item);
        const field = item.type === 'custom_tool_call' ? 'input' : 'arguments';
        frames += frame('response.output_item.added', { output_index, item: { ...item, status: 'in_progress', [field]: item.type === 'tool_search_call' ? {} : '' } });
        if (item.type !== 'tool_search_call') {
          const prefix = item.type === 'custom_tool_call' ? 'response.custom_tool_call_input' : 'response.function_call_arguments';
          frames += frame(`${prefix}.delta`, { item_id: item.id, output_index, delta: item[field] });
          frames += frame(`${prefix}.done`, { item_id: item.id, output_index, [field]: item[field] });
        }
        frames += frame('response.output_item.done', { output_index, item });
      }
      const final = response(incomplete ? 'incomplete' : 'completed');
      return { frames: frames + frame(`response.${final.status}`, { response: final }), response: final };
    },
    fail: (message: string) => frame('response.failed', { response: { ...response('failed'), error: { code: 'provider_error', message } } }),
  };
};

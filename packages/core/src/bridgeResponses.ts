// Native Codex's visible Responses subset. Tool execution and policy remain in the client.
import { createHash } from 'node:crypto';
import type { AssembledToolCall, BridgeUsage, NormalizedTurn } from './catalog';
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
export type BridgeResponsesRequest = BridgeChatRequest & { registry: Map<string, Tool> };

export const parseResponsesRequest = (value: unknown): BridgeResponsesRequest => {
  const body = object(value, 'request');
  fields(body, ['model', 'input', 'instructions', 'tools', 'tool_choice', 'parallel_tool_calls', 'reasoning', 'text', 'store', 'stream', 'include', 'prompt_cache_key', 'client_metadata', 'metadata', 'service_tier', 'safety_identifier'], 'Responses field');
  const model = nonempty(body.model, 'model');
  if (body.store !== undefined && body.store !== false) throw new Error('Stored responses are unsupported');
  if (body.stream !== undefined && typeof body.stream !== 'boolean') throw new Error('stream must be boolean');
  if (body.parallel_tool_calls !== undefined && typeof body.parallel_tool_calls !== 'boolean') throw new Error('parallel_tool_calls must be boolean');
  if (body.tool_choice !== undefined && body.tool_choice !== 'auto') throw new Error('Only automatic tool choice is supported');
  if (body.include !== undefined && array(body.include, 'include').some(v => v !== 'reasoning.encrypted_content')) throw new Error('Unsupported include');
  const reasoning = body.reasoning === undefined ? {} : object(body.reasoning, 'reasoning');
  fields(reasoning, ['effort', 'context', 'summary'], 'reasoning field');
  if (reasoning.context !== undefined && !['auto', 'current_turn', 'all_turns'].includes(reasoning.context)) throw new Error('Unsupported reasoning.context');
  if (reasoning.effort !== undefined) nonempty(reasoning.effort, 'reasoning.effort');
  if (reasoning.summary !== undefined && !['auto', 'concise', 'detailed', 'none'].includes(reasoning.summary)) throw new Error('Unsupported reasoning.summary');
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
  // #210 extends supported image content. Reject it here instead of flattening or silently dropping it.
  const content = (v: unknown): string => typeof v === 'string' ? v : array(v, 'content').map(part => {
    const p = object(part, 'content part');
    if (!['input_text', 'output_text'].includes(p.type)) throw new Error(`Unsupported content type: ${p.type}`);
    return string(p.text, 'content text');
  }).join('');
  const calls = new Map<string, Tool>();
  const outputs = new Set<string>();
  for (const v of input) {
    const item = object(v, 'input item');
    if (item.type === 'additional_tools') {
      if (item.role !== 'developer') throw new Error('additional_tools must have developer role');
      if (item.content !== undefined) turns.push(turn('system', content(item.content)));
    } else if (item.type === 'message' || (!item.type && item.role)) {
      if (!['system', 'developer', 'user', 'assistant'].includes(item.role)) throw new Error('Unsupported message role');
      turns.push(turn(item.role === 'developer' ? 'system' : item.role, content(item.content)));
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
      const t = turn('user'); t.toolResults.push({ callId: id, content: kind === 'tool_search' ? JSON.stringify(item) : content(item.output) }); turns.push(t);
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

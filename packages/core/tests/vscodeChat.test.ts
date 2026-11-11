import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('vscode', () => import('./fixtures/vscode'));
import * as vscode from './fixtures/vscode';
import { registerWispChatProvider, type ChatProviderDeps } from '../../vscode/src/chatProvider';
import { PROVIDERS } from '../src/catalog';
import { codexCatalog } from '../src/codexModels';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createSessionLogger, listLogSessions, readSessionLog } from '../src/sessionLog';

const antigravity = PROVIDERS.find(p => p.id === 'antigravity')!;
const token = (cancelled = false) => {
  let cancel = () => {};
  const dispose = vi.fn();
  return { isCancellationRequested: cancelled, onCancellationRequested: (fn: () => void) => { cancel = fn; return { dispose }; }, cancel: () => cancel(), dispose };
};
const message = (role: number, ...content: unknown[]) => ({ role, content, name: undefined });
const user = (...parts: unknown[]) => message(1, ...parts);
const assistant = (...parts: unknown[]) => message(2, ...parts);
const text = (value: string) => new vscode.LanguageModelTextPart(value);
const requests: any[] = [];
const frame = (parts: any[], finishReason = 'STOP') => JSON.stringify({ response: { candidates: [{ content: { role: 'model', parts }, finishReason }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } } });
let response: () => Response;
const setup = (model = 'gemini-3-flash', overrides: Partial<ChatProviderDeps> = {}) => {
  const creds = { accessToken: 'test-token', refreshToken: 'test-refresh', projectId: 'test-project' };
  const deps = { providers: [antigravity], modelMap: () => ({ antigravity: model }), customBaseUrl: () => '',
    keyFor: async () => '', clientFor: async () => undefined,
    codexSignedIn: async () => false, codexCreds: async () => undefined,
    anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
    xaiSignedIn: async () => false, xaiCreds: async () => undefined,
    antigravitySignedIn: async () => true,
    antigravityCreds: async () => creds, antigravityStoredCreds: () => creds,
    effort: () => 'medium', log: () => {}, ...overrides } as ChatProviderDeps;
  registerWispChatProvider(deps);
  const provider = vscode.testing.chat;
  const send = async (messages = [user(text('hello'))], opts: any = {}, cancellation = token()) => {
    const output: any[] = [];
    await provider.provideLanguageModelChatResponse({ id: 'antigravity' }, messages, { toolMode: 1, modelOptions: { _conversationId: 'test-conversation' }, ...opts },
      { report: (part: any) => output.push(part) }, cancellation);
    return { output, cancellation };
  };
  return { provider, send };
};
beforeEach(() => {
  requests.length = 0;
  response = () => new Response(frame([{ text: 'answer' }]));
  vi.stubGlobal('fetch', async (url: any, init: any) => {
    if (String(url).includes(':generateContent')) { requests.push({ url: String(url), init, body: JSON.parse(init.body) }); return response(); }
    return Response.json({});
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('native provider usage reporting', () => {
  const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  const cases = [
    ['codex', 'gpt-6-astra', 20], ['anthropic', 'claude-sonnet-4-6', 10], ['xai', 'grok-4.5', 20],
  ] as const;
  const sendUsage = async (id: string, model: string, usage: 'valid' | 'missing' | 'invalid' | 'zero', toolOnly = false) => {
    vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [] });
    const creds = { accessToken: 'synthetic-token', accountId: 'synthetic-account' };
    const { provider } = setup('', { providers: [PROVIDERS.find(p => p.id === id)!], modelMap: () => ({ [id]: model }),
      codexCreds: async () => creds, anthropicCreds: async () => creds, xaiCreds: async () => creds });
    const count = usage === 'invalid' ? -1 : usage === 'zero' ? 0 : 10;
    const wireUsage = usage === 'missing' ? undefined : { input_tokens: usage === 'zero' ? 0 : 100, output_tokens: count,
      input_tokens_details: { cached_tokens: usage === 'zero' ? 0 : 20 } };
    const openingUsage = usage === 'missing' ? undefined : { input_tokens: usage === 'zero' ? 0 : 70,
      cache_creation_input_tokens: usage === 'zero' ? 0 : 20, cache_read_input_tokens: usage === 'zero' ? 0 : 10,
      output_tokens: 0 };
    const output = toolOnly ? [{ type: 'function_call', call_id: 'usage-call', name: 'read_file', arguments: '{}' }]
      : [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }];
    const stream = id === 'anthropic'
      ? event('message_start', { message: { usage: openingUsage } })
        + (toolOnly ? event('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'usage-call', name: 'read_file' } })
          + event('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } })
          + event('content_block_stop', { index: 0 })
          : event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'OK' } }))
        + event('message_delta', { delta: { stop_reason: toolOnly ? 'tool_use' : 'end_turn' },
          usage: usage === 'missing' ? undefined : { output_tokens: count } }) + event('message_stop', {})
      : (toolOnly ? event('response.output_item.added', { item: output[0] }) : '')
        + event('response.completed', { response: { output, usage: wireUsage } });
    vi.stubGlobal('fetch', async (url: unknown) => /\/(responses|messages)(\?|$)/.test(String(url))
      ? new Response(stream) : Response.json({}));
    const parts: any[] = [];
    await provider.provideLanguageModelChatResponse({ id }, [user(text('hello'))], { toolMode: 1 },
      { report: (part: any) => parts.push(part) }, token());
    return { parts, usages: parts.filter(p => p instanceof vscode.LanguageModelDataPart && p.mimeType === 'usage')
      .map(p => JSON.parse(Buffer.from(p.data).toString())) };
  };
  it.each(cases)('%s reports full prompt usage including cache without double-counting', async (id, model, cached) => {
    const { parts, usages } = await sendUsage(id, model, 'valid');
    expect(parts.some(p => p instanceof vscode.LanguageModelTextPart && p.value === 'OK')).toBe(true);
    expect(usages.at(-1)).toEqual({ prompt_tokens: 100, completion_tokens: 10, total_tokens: 110,
      prompt_tokens_details: { cached_tokens: cached } });
  });
  it.each(cases)('%s reports usage for a tool-only reply', async (id, model) => {
    const { parts, usages } = await sendUsage(id, model, 'valid', true);
    expect(parts.some(p => p instanceof vscode.LanguageModelToolCallPart && p.callId === 'usage-call')).toBe(true);
    expect(usages.at(-1)).toMatchObject({ prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 });
  });
  it.each(cases)('%s does not fabricate usage when the provider omits it', async (id, model) => {
    expect((await sendUsage(id, model, 'missing')).usages).toEqual([]);
  });
  it.each(cases)('%s preserves a real zero usage report', async (id, model) => {
    expect((await sendUsage(id, model, 'zero')).usages.at(-1)).toEqual({ prompt_tokens: 0, completion_tokens: 0,
      total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } });
  });
  it.each(cases)('%s never emits malformed negative usage', async (id, model) => {
    const { parts, usages } = await sendUsage(id, model, 'invalid');
    expect(parts.some(p => p instanceof vscode.LanguageModelTextPart)).toBe(true);
    expect(usages.every(u => u.prompt_tokens >= 0 && u.completion_tokens >= 0 && u.total_tokens >= 0)).toBe(true);
  });
});

it('shares native conversation diagnostics with external readers without storing chat content', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wisp-native-logs-'));
  try {
    const { send } = setup('gemini-3-flash', { sessionLog: createSessionLogger('vscode-chat', home) });
    await send([user(text('PRIVATE-PROMPT'))], { modelOptions: { _conversationId: 'PRIVATE-A' } });
    response = () => new Response(frame([], 'MAX_TOKENS'));
    await expect(send([user(text('PRIVATE-PROMPT'))], { modelOptions: { _conversationId: 'PRIVATE-B' } })).rejects.toThrow();
    const sessions = listLogSessions(home);
    expect(sessions).toHaveLength(2);
    const entries = sessions.flatMap(s => readSessionLog(s.id, home));
    expect(entries.some(e => e.event === 'error')).toBe(true);
    expect(entries.some(e => e.event === 'complete')).toBe(true);
    expect(sessions.every(s => s.inFlight === 0 && s.source === 'vscode-chat')).toBe(true);
    expect(JSON.stringify(entries)).not.toMatch(/PRIVATE|test-token|answer/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

it('records refused native models and revoked credentials as failures, never successful turns', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wisp-refused-logs-'));
  const sessionLog = createSessionLogger('vscode-chat', home);
  try {
    await expect(setup('gemini-3.1-flash-image', { sessionLog }).send()).rejects.toThrow();
    const codex = PROVIDERS.find(p => p.id === 'codex')!;
    const { provider } = setup('', { providers: [codex], sessionLog });
    await provider.provideLanguageModelChatResponse({ id: 'codex' }, [user(text('PRIVATE'))],
      { modelOptions: { _conversationId: 'revoked-conversation' } }, { report: () => {} }, token());
    expect(listLogSessions(home)).toHaveLength(2);
    expect(listLogSessions(home).map(s => s.event), JSON.stringify(listLogSessions(home).flatMap(s => readSessionLog(s.id, home)))).toEqual(['error', 'error']);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

describe('native Codex context descriptor', () => {
  it('forwards optional MCP maps unchanged through the registered native Codex request', async () => {
    vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [] });
    const codex = PROVIDERS.find(p => p.id === 'codex')!;
    const { provider } = setup('unused', { providers: [codex], modelMap: () => ({ codex: 'gpt-6-astra' }),
      codexSignedIn: async () => true, codexCreds: async () => ({ accessToken: 'fake', accountId: 'fake' }),
    });
    const inputSchema = { type: 'object', properties: {
      workspaceRoot: { type: 'string' }, method: { type: 'string' }, params: { type: 'object', additionalProperties: {} },
    }, required: ['workspaceRoot', 'method'] };
    const original = structuredClone(inputSchema), sent: any[] = [], output: any[] = [];
    vi.stubGlobal('fetch', async (url: any, init: any) => {
      if (!String(url).endsWith('/responses')) throw new Error('Unexpected test destination');
      const body = JSON.parse(init.body); sent.push(body);
      if (body.tools[0].strict) return Response.json({ error: { message: 'Invalid schema: params object must define properties' } }, { status: 400 });
      return new Response('event: response.completed\ndata: {"response":{"output":[{"type":"message","content":[{"type":"output_text","text":"OK"}]}]}}\n\n');
    });
    await provider.provideLanguageModelChatResponse({ id: 'codex' }, [user(text('test message'))],
      { tools: [{ name: 'mcp_pylance_mcp_s_pylanceLSP', description: 'LSP', inputSchema }], toolMode: 1 },
      { report: (part: any) => output.push(part) }, token());
    expect(sent).toHaveLength(1);
    expect(sent[0].tools[0]).toMatchObject({ strict: false, parameters: original });
    expect(output).toEqual([text('OK')]);
    expect(inputSchema).toEqual(original);
  });
  it.each([
    ['gpt-6-astra', 272000, 872000],
    ['gpt-6.1-sol', 500000, 872000],
    ['future-gpt', 345000, 999000],
  ])('advertises the account maximum automatically for %s', async (model, defaultWindow, maximumWindow) => {
    vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'live', models: [
      { id: model, name: model, visible: true, contextWindow: defaultWindow, maxContextWindow: maximumWindow },
    ] } as any);
    const codex = PROVIDERS.find(p => p.id === 'codex')!;
    const { provider } = setup('unused', { providers: [codex], modelMap: () => ({ codex: model }),
      codexSignedIn: async () => true, codexCreds: async () => ({ accessToken: 'fake', accountId: 'fake' }),
    } as any);
    const [info] = await provider.provideLanguageModelChatInformation();
    expect(info.maxInputTokens + info.maxOutputTokens).toBe(maximumWindow);
    expect(info.tooltip).toContain(String(defaultWindow));
    expect(info.tooltip).toContain(String(maximumWindow));
  });
  it('uses only the selected model override and keeps input plus output within account limits', async () => {
    vi.spyOn(codexCatalog, 'get').mockResolvedValue({ source: 'cache', models: [
      { id: 'gpt-6-astra', name: 'Astra', visible: true, contextWindow: 272000, maxContextWindow: 872000 },
    ] } as any);
    const codex = PROVIDERS.find(p => p.id === 'codex')!;
    const { provider } = setup('unused', { providers: [codex], modelMap: () => ({ codex: 'gpt-6-astra' }),
      codexSignedIn: async () => true, codexCreds: async () => ({ accessToken: 'fake', accountId: 'fake' }),
      codexContextWindows: () => ({ 'gpt-6-astra': 1000000, 'another-model': 4096 }),
    } as any);
    const [info] = await provider.provideLanguageModelChatInformation();
    expect(info.maxInputTokens + info.maxOutputTokens).toBe(872000);
    expect(info.tooltip).toContain('272000'); expect(info.tooltip).toContain('872000');
    expect(info.tooltip).toContain('1000000');
  });
});

describe('native VS Code Antigravity chat', () => {
  it('keeps signed-out Antigravity hidden', async () => {
    expect(await setup('gemini-3-flash', { antigravitySignedIn: async () => false } as any).provider.provideLanguageModelChatInformation()).toEqual([]);
  });
  it('preserves ordinary OpenAI-compatible chat delivery', async () => {
    const provider = { id: 'antigravity', label: 'Test', baseUrl: 'https://test.invalid', defaultModel: 'test', apiKeyEnv: '' };
    const client = { chat: { completions: { create: async function* () { yield { choices: [{ delta: { content: 'ordinary answer' } }] }; } } } };
    const { output } = await setup('test', { providers: [provider], clientFor: async () => client as any }).send();
    expect(output).toEqual([text('ordinary answer')]);
  });
  it('advertises a signed-in supported model without an API key', async () => {
    const { provider } = setup();
    const infos = await provider.provideLanguageModelChatInformation();
    expect(infos).toHaveLength(1); expect(infos[0].capabilities.toolCalling).toBe(true);
  });
  it('delivers the Cloud Code reply with state and disposes cancellation', async () => {
    const { output, cancellation } = await setup().send();
    expect(output.filter(p => p instanceof vscode.LanguageModelTextPart)).toEqual([text('answer')]);
    expect(output.some(p => p instanceof vscode.LanguageModelDataPart && p.mimeType === 'stateful_marker')).toBe(true);
    expect(requests[0].init.headers.Authorization).toBe('Bearer test-token');
    expect(requests[0].body.request.contents[0].parts[0].text).toBe('hello');
    expect(cancellation.dispose).toHaveBeenCalledOnce();
  });
  it('forwards required tools, images, original call ids and tool-result continuation', async () => {
    response = () => new Response(frame([{ functionCall: { id: 'native-call-1', name: 'read_file', args: { path: 'a.ts' } } }]));
    const { send } = setup();
    const tools = [{ name: 'read_file', description: 'Read', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }];
    const first = await send([user(text('read it'), new vscode.LanguageModelDataPart(new Uint8Array([1,2]), 'image/png'))], { tools, toolMode: 2 });
    expect(first.output.filter(p => p instanceof vscode.LanguageModelToolCallPart)).toEqual([new vscode.LanguageModelToolCallPart('native-call-1', 'read_file', { path: 'a.ts' })]);
    expect(requests[0].body.request.toolConfig.functionCallingConfig.mode).toBe('ANY');
    expect(requests[0].body.request.contents[0].parts).toContainEqual({ inlineData: { mimeType: 'image/png', data: 'AQI=' } });
    response = () => new Response(frame([{ text: 'done' }]));
    await send([user(text('read it')), assistant(...first.output.filter(p => !(p instanceof vscode.LanguageModelDataPart) || p.mimeType === 'stateful_marker')),
      user(new vscode.LanguageModelToolResultPart('native-call-1', [text('file contents')]))], { tools });
    const contents = requests[1].body.request.contents;
    expect(contents[1].parts[0].functionCall).toMatchObject({ id: 'native-call-1', name: 'read_file', args: { path: 'a.ts' } });
    expect(contents[2].parts[0].functionResponse).toMatchObject({ id: 'native-call-1', name: 'read_file' });
  });
  it.each(['gemini-3.1-flash-image'])('hides and refuses image-generation %s before network', async model => {
    const { provider, send } = setup(model);
    expect(await provider.provideLanguageModelChatInformation()).toEqual([]);
    await expect(send()).rejects.toThrow(/native chat/i); expect(requests).toHaveLength(0);
  });
  it('reports a sign-out race instead of silently returning an empty answer', async () => {
    await expect(setup('gemini-3-flash', { antigravityCreds: async () => undefined } as any).send()).rejects.toThrow(/sign in/i);
    expect(requests).toHaveLength(0);
  });
  it('never starts a pre-cancelled request', async () => {
    const cancellation = token(true);
    const result = await setup().send(undefined, {}, cancellation);
    expect(result.output).toEqual([]); expect(requests).toHaveLength(0);
  });
  it('aborts in-flight transport without trying a fallback host', async () => {
    const cancellation = token(); let started!: () => void;
    const start = new Promise<void>(resolve => { started = resolve; });
    const { send } = setup();
    vi.stubGlobal('fetch', async (url: any, init: any) => {
      requests.push({ url: String(url) }); started();
      return new Promise<Response>((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    });
    const work = send(undefined, {}, cancellation); await start; cancellation.cancel();
    expect((await work).output).toEqual([]); expect(requests).toHaveLength(1); expect(cancellation.dispose).toHaveBeenCalledOnce();
  });
  it('rejects a reply cut off before completion', async () => {
    response = () => new Response(frame([{ text: 'partial' }], ''));
    await expect(setup().send()).rejects.toThrow(/incomplete/);
  });
  it('refuses tool calls without original upstream ids', async () => {
    response = () => new Response(frame([{ functionCall: { name: 'read_file', args: {} } }]));
    await expect(setup().send()).rejects.toThrow(/unsupported response/i);
  });
});

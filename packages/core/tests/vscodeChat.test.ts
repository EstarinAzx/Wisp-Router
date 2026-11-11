import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('vscode', () => import('./fixtures/vscode'));
import * as vscode from './fixtures/vscode';
import { registerWispChatProvider, type ChatProviderDeps } from '../../vscode/src/chatProvider';
import { PROVIDERS } from '../src/catalog';
import { codexCatalog } from '../src/codexModels';

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
const frame = (parts: any[], finishReason = 'STOP') => `data: ${JSON.stringify({ response: { candidates: [{ content: { role: 'model', parts }, finishReason }] } })}\n\n`;
let response: () => Response;
const setup = (model = 'gemini-3-flash', overrides: Partial<ChatProviderDeps> = {}) => {
  const deps = { providers: [antigravity], modelMap: () => ({ antigravity: model }), customBaseUrl: () => '',
    keyFor: async () => '', clientFor: async () => undefined,
    codexSignedIn: async () => false, codexCreds: async () => undefined,
    anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
    xaiSignedIn: async () => false, xaiCreds: async () => undefined,
    antigravitySignedIn: async () => true,
    antigravityCreds: async () => ({ accessToken: 'test-token', projectId: 'test-project' }),
    effort: () => 'medium', log: () => {}, ...overrides } as ChatProviderDeps;
  registerWispChatProvider(deps);
  const provider = vscode.testing.chat;
  const send = async (messages = [user(text('hello'))], opts: any = {}, cancellation = token()) => {
    const output: any[] = [];
    await provider.provideLanguageModelChatResponse({ id: 'antigravity' }, messages, { toolMode: 1, ...opts },
      { report: (part: any) => output.push(part) }, cancellation);
    return { output, cancellation };
  };
  return { provider, send };
};
beforeEach(() => {
  requests.length = 0;
  response = () => new Response(frame([{ text: 'answer' }]));
  vi.stubGlobal('fetch', async (url: any, init: any) => {
    if (String(url).includes(':streamGenerateContent')) { requests.push({ url: String(url), init, body: JSON.parse(init.body) }); return response(); }
    return Response.json({});
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('native Codex context descriptor', () => {
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
  it('delivers the actual Cloud Code text stream and disposes cancellation', async () => {
    const { output, cancellation } = await setup().send();
    expect(output).toEqual([text('answer')]);
    expect(requests[0].init.headers.Authorization).toBe('Bearer test-token');
    expect(requests[0].body.request.contents[0].parts[0].text).toBe('hello');
    expect(cancellation.dispose).toHaveBeenCalledOnce();
  });
  it('forwards required tools, images, original call ids and tool-result continuation', async () => {
    response = () => new Response(frame([{ functionCall: { id: 'native-call-1', name: 'read_file', args: { path: 'a.ts' } } }]));
    const { send } = setup();
    const tools = [{ name: 'read_file', description: 'Read', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }];
    const first = await send([user(text('read it'), new vscode.LanguageModelDataPart(new Uint8Array([1,2]), 'image/png'))], { tools, toolMode: 2 });
    expect(first.output).toEqual([new vscode.LanguageModelToolCallPart('native-call-1', 'read_file', { path: 'a.ts' })]);
    expect(requests[0].body.request.toolConfig.functionCallingConfig.mode).toBe('ANY');
    expect(requests[0].body.request.contents[0].parts).toContainEqual({ inlineData: { mimeType: 'image/png', data: 'AQI=' } });
    response = () => new Response(frame([{ text: 'done' }]));
    await send([user(text('read it')), assistant(...first.output), user(new vscode.LanguageModelToolResultPart('native-call-1', [text('file contents')]))], { tools });
    const contents = requests[1].body.request.contents;
    expect(contents[1].parts[0].functionCall).toMatchObject({ id: 'native-call-1', name: 'read_file', args: { path: 'a.ts' } });
    expect(contents[2].parts[0].functionResponse).toMatchObject({ id: 'native-call-1', name: 'read_file' });
  });
  it.each(['gemini-4-argon', 'gemini-3.1-flash-image', 'unqualified-model'])('hides and refuses unsupported %s before network', async model => {
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
  it('rejects a stream cut off before completion', async () => {
    response = () => new Response(frame([{ text: 'partial' }], ''));
    await expect(setup().send()).rejects.toThrow(/before completion/);
  });
  it('refuses tool calls without original upstream ids', async () => {
    response = () => new Response(frame([{ functionCall: { name: 'read_file', args: {} } }]));
    await expect(setup().send()).rejects.toThrow(/tool call/i);
  });
});

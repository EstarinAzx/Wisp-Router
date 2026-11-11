import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('vscode', () => import('./fixtures/vscode'));
import * as vscode from './fixtures/vscode';
import { registerWispChatProvider } from '../../vscode/src/chatProvider';
import { antigravityNativeChatError } from '../../vscode/src/nativeChatSupport';
import { PROVIDERS } from '../src/catalog';
import * as modelsDev from '../src/modelsDev';

const provider = PROVIDERS.find(p => p.id === 'antigravity')!;
const text = (value: string) => new vscode.LanguageModelTextPart(value);
const message = (role: number, ...content: unknown[]) => ({ role, content, name: undefined });
const firstMessages = () => [message(3, text('Keep system instructions.')), message(1, text('Hello'))];
const tools = [{ name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }];
const result = (parts: any[]) => ({ response: { modelVersion: 'gemini-4-argon',
  candidates: [{ finishReason: 'STOP', content: { role: 'model', parts } }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 10 } } });
const callParts = () => [
  { thought: true, text: 'private reasoning', thoughtSignature: 'private-thought-signature' },
  { text: 'Reading.' },
  { functionCall: { id: 'original-a', name: 'read_file', args: { path: 'a.ts' } }, thoughtSignature: 'private-call-signature' },
  { functionCall: { id: 'original-b', name: 'read_file', args: { path: 'b.ts' } }, futureState: { opaque: 'retain me' } },
];
const requests: { body: any; signal: AbortSignal }[] = [];
let next: any, onRequest: (() => void) | undefined, modelRows: Record<string, unknown>;
beforeEach(() => {
  next = result([{ text: 'Hello back', thoughtSignature: 'private-signature' }]); requests.length = 0; onRequest = undefined;
  modelRows = Object.fromEntries(['low', 'medium', 'high'].map(tier => [`gemini-4-argon-${tier}`,
    { maxTokens: 1_048_576, maxOutputTokens: 65_536, supportsImages: true }]));
  vi.stubGlobal('fetch', async (url: any, init: any) => {
    if (String(url).includes(':fetchAvailableModels')) return Response.json({ models: modelRows });
    if (String(url).includes(':generateContent')) {
      requests.push({ body: JSON.parse(init.body), signal: init.signal }); onRequest?.();
      return Response.json(next);
    }
    return Response.json({});
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const setup = (model = 'gemini-4-argon-high') => {
  let creds: any = { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', projectId: 'synthetic-project', expiresAt: 9000000000000 };
  const refreshed = vi.fn(async () => creds);
  registerWispChatProvider({ providers: [provider], modelMap: () => ({ antigravity: model }), customBaseUrl: () => '',
    keyFor: async () => '', clientFor: async () => undefined, codexSignedIn: async () => false, codexCreds: async () => undefined,
    anthropicSignedIn: async () => false, anthropicCreds: async () => undefined, xaiSignedIn: async () => false, xaiCreds: async () => undefined,
    antigravitySignedIn: async () => !!creds?.accessToken, antigravityCreds: refreshed,
    antigravityStoredCreds: () => creds, effort: () => 'medium', log: () => {},
  } as any);
  const chat = vscode.testing.chat;
  let output: any[] = [];
  const send = async (messages = firstMessages(), options: any = {}, cancellation?: any) => {
    const parts: any[] = []; output = parts;
    await chat.provideLanguageModelChatResponse({ id: 'antigravity', maxOutputTokens: 4096 }, messages,
      { toolMode: 1, tools, modelOptions: { _conversationId: 'native-session-a' }, ...options },
      { report: (part: unknown) => parts.push(part) }, cancellation ?? { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) });
    return parts;
  };
  return { chat, send, refreshed, get output() { return output; }, changeAccount: () => { creds = { ...creds, refreshToken: 'replacement-refresh' }; },
    signOut: () => { creds = {}; }, renew: () => { creds = { ...creds, accessToken: 'renewed-access' }; } };
};
// Copilot stores the marker string separately, then reconstructs modelId + backslash + marker on input.
const persistedAssistant = (parts: any[]) => message(2, ...parts.filter(p => !(p instanceof vscode.LanguageModelDataPart) || p.mimeType === 'stateful_marker').map(p => {
  if (p instanceof vscode.LanguageModelDataPart) {
    const marker = Buffer.from(p.data).toString('utf8').split('\\')[1];
    return new vscode.LanguageModelDataPart(Buffer.from('wisp/antigravity\\' + JSON.parse(JSON.stringify(marker))), p.mimeType);
  }
  if (p instanceof vscode.LanguageModelToolCallPart) return new vscode.LanguageModelToolCallPart(p.callId, p.name, JSON.parse(JSON.stringify(p.input)));
  return text(p.value);
}));
const followup = (parts: any[]) => [...firstMessages(), persistedAssistant(parts), message(1, text('Continue'))];
const localHeader = (parts: any[]) => message(2, ...persistedAssistant(parts).content.filter(p => p instanceof vscode.LanguageModelDataPart));

describe('Argon native VS Code chat', () => {
  it.each(['low', 'medium', 'high'])('advertises the signed-in Argon %s tier with truthful capabilities', async tier => {
    const rows = await setup(`gemini-4-argon-${tier}`).chat.provideLanguageModelChatInformation();
    expect(rows).toHaveLength(1); expect(rows[0].capabilities.toolCalling).toBe(true);
    expect(rows[0].maxInputTokens + rows[0].maxOutputTokens).toBe(1_048_576);
    expect(rows[0].maxOutputTokens).toBe(65_536);
    expect(rows[0].capabilities.imageInput).toBe(true);
  });
  it.each([
    ['gemini-4-carbon-high', 1_048_576, 262_144],
    ['claude-sonnet-5-5-high', 1_000_000, 128_000],
    ['future-chat-model', 345_000, 12_000],
  ])('uses discovered limits for %s without a name allowlist', async (model, context, output) => {
    modelRows[model] = { maxTokens: context, maxOutputTokens: output, supportsImages: false };
    const rows = await setup(model).chat.provideLanguageModelChatInformation();
    expect(rows).toHaveLength(1);
    expect(rows[0].maxInputTokens + rows[0].maxOutputTokens).toBe(context);
    expect(rows[0].maxOutputTokens).toBe(output);
    expect(rows[0].capabilities.imageInput).not.toBe(true);
  });
  it('labels unavailable limits rather than presenting the fallback as account metadata', async () => {
    modelRows = {};
    const [row] = await setup().chat.provideLanguageModelChatInformation();
    expect(row.maxInputTokens + row.maxOutputTokens).toBe(128_000);
    expect(row.tooltip).toMatch(/fallback/i);
  });
  it('uses the discovered output reserve on the wire even when the static table is older', async () => {
    modelRows['gemini-3-flash'] = { maxTokens: 1_048_576, maxOutputTokens: 131_072 };
    const h = setup('gemini-3-flash'), [descriptor] = await h.chat.provideLanguageModelChatInformation();
    expect(descriptor.maxOutputTokens).toBe(131_072);
    await h.chat.provideLanguageModelChatResponse(descriptor, firstMessages(),
      { toolMode: 1, tools, modelOptions: { _conversationId: 'dynamic-limit-session' } }, { report() {} },
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) });
    expect(requests[0].body.request.generationConfig.maxOutputTokens).toBe(131_072);
  });
  it.each(['signOut', 'changeAccount'] as const)('hides stale account limits after %s while another catalogue is pending', async change => {
    let release!: (value: any) => void, fetched = false;
    const delayed = new Promise<any>(resolve => { release = resolve; });
    vi.spyOn(modelsDev, 'getModelsDevCatalog').mockReturnValue(delayed);
    vi.stubGlobal('fetch', async (url: any) => {
      if (String(url).includes(':fetchAvailableModels')) fetched = true;
      return Response.json({ models: modelRows });
    });
    const h = setup(), pending = h.chat.provideLanguageModelChatInformation();
    await vi.waitFor(() => expect(fetched).toBe(true));
    h[change](); release(undefined);
    expect(await pending).toEqual([]);
  });
  it('fails over a confirmed capacity rejection with the identical request and conversation state', async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal('fetch', async (url: any, init: any) => {
      if (!String(url).includes(':generateContent')) return Response.json({});
      calls.push({ url: String(url), body: init.body });
      return calls.length === 1 ? new Response('no capacity available', { status: 503 }) : Response.json(next);
    });
    const output = await setup('gemini-3-flash').send();
    expect(output.filter(p => p instanceof vscode.LanguageModelTextPart)).toEqual([text('Hello back')]);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain('daily-cloudcode-pa');
    expect(calls[1].url).toContain('//cloudcode-pa');
    expect(calls[0].body).toBe(calls[1].body);
  });
  it.each([400, 429, 500])('does not fail over an ambiguous or non-capacity HTTP %s failure', async status => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: any) => {
      if (!String(url).includes(':generateContent')) return Response.json({});
      calls.push(String(url)); return new Response('rejected', { status });
    });
    await expect(setup().send()).rejects.toThrow(/request failed/);
    expect(calls).toHaveLength(1);
  });
  it.each(['gemini-4-carbon-high', 'claude-sonnet-5-5-high', 'gpt-oss-120b-medium', 'future-chat-model'])
  ('retains exact model state and Local tool continuation for %s', async model => {
    const h = setup(model), original = callParts();
    original[3].thoughtSignature = 'second-original-signature';
    next = result(original); next.response.modelVersion = `${model}-upstream-version`;
    const first = await h.send(undefined, { toolMode: 2 });
    expect(first.filter(p => p instanceof vscode.LanguageModelToolCallPart)).toHaveLength(2);
    next = result([{ text: 'Done' }]); next.response.modelVersion = `${model}-upstream-version`;
    await h.send([localHeader(first), message(1,
      new vscode.LanguageModelToolResultPart('original-a', [text('A')]),
      new vscode.LanguageModelToolResultPart('original-b', [text('B')]))]);
    expect(requests[0].body.model).toBe(model);
    expect(requests[1].body.request.contents[1].parts).toEqual(original);
    await h.send(followup(first).slice(0, -1).concat(message(1,
      new vscode.LanguageModelToolResultPart('original-a', [text('A')]),
      new vscode.LanguageModelToolResultPart('original-b', [text('B')]))));
    expect(requests[2].body.request.contents[1].parts).toEqual(original);
  });
  it('forwards image input and retains it through Local continuation', async () => {
    const h = setup();
    const first = await h.send([message(1, text('Look'), new vscode.LanguageModelDataPart(new Uint8Array([1, 2]), 'image/png'))]);
    expect(requests[0].body.request.contents[0].parts).toContainEqual({ inlineData: { mimeType: 'image/png', data: 'AQI=' } });
    await h.send([localHeader(first), message(1, text('Continue'))]);
    expect(requests[1].body.request.contents[0].parts).toContainEqual({ inlineData: { mimeType: 'image/png', data: 'AQI=' } });
  });
  it('accepts a structurally valid native reply without an optional modelVersion', async () => {
    delete next.response.modelVersion;
    const h = setup('future-chat-model'), first = await h.send();
    await h.send(followup(first));
    expect(requests).toHaveLength(2);
  });
  it('emits an encrypted host marker and restores exact native parts after persistence', async () => {
    const h = setup(), original = structuredClone(next.response.candidates[0].content.parts);
    const parts = await h.send();
    expect(parts.filter(p => p instanceof vscode.LanguageModelTextPart)).toEqual([text('Hello back')]);
    const marker = parts.find(p => p instanceof vscode.LanguageModelDataPart);
    expect(marker?.mimeType).toBe('stateful_marker');
    expect(Buffer.from(marker.data).toString()).not.toMatch(/private-signature|synthetic-refresh/);
    await h.send(followup(parts));
    expect(requests[1].body.request.contents[1].parts).toEqual(original);
    expect(requests[0].body.request.systemInstruction.parts).toEqual([{ text: 'Keep system instructions.' }]);
    expect(requests[0].body.request.generationConfig.maxOutputTokens).toBe(4096);
  });
  it('preserves parallel tool IDs/signatures, required mode and reverse-ordered tool results', async () => {
    const h = setup(); next = result(callParts());
    const parts = await h.send(undefined, { toolMode: 2 });
    expect(parts.filter(p => p instanceof vscode.LanguageModelToolCallPart).map(p => p.callId)).toEqual(['original-a', 'original-b']);
    expect(requests[0].body.request.toolConfig.functionCallingConfig.mode).toBe('ANY');
    next = result([{ text: 'Done' }]);
    await h.send([...firstMessages(), persistedAssistant(parts),
      message(1, new vscode.LanguageModelToolResultPart('original-b', [text('B')])),
      message(1, new vscode.LanguageModelToolResultPart('original-a', [text('A')]))], { tools: [] });
    expect(requests[1].body.request.contents[1].parts).toEqual(callParts());
    expect(requests[1].body.request.contents[2].parts.map((p: any) => [p.functionResponse.id, p.functionResponse.response.result])).toEqual([['original-a', 'A'], ['original-b', 'B']]);
  });
  it('allows changed instructions/tools and pruning complete turns without rebuilding assistant state', async () => {
    const h = setup(), parts = await h.send(); h.renew();
    await h.send([message(3, text('Updated system instructions.')), persistedAssistant(parts), message(1, text('Next'))], { tools: [] });
    expect(requests[1].body.request.systemInstruction.parts[0].text).toBe('Updated system instructions.');
    expect(requests[1].body.request.contents[0].parts).toEqual(next.response.candidates[0].content.parts);
  });
  it('allows a summary-only new chain without replaying removed assistant turns', async () => {
    const h = setup(); await h.send();
    await h.send([message(3, text('System')), message(1, text('<conversation-summary>Earlier work</conversation-summary>')), message(1, text('Continue'))]);
    expect(requests).toHaveLength(2);
  });
  it('restores Local-mode incremental tool continuation from its marker-only header', async () => {
    const h = setup(); next = result(callParts()); const parts = await h.send();
    next = result([{ text: 'Local done' }]);
    const second = await h.send([localHeader(parts), message(3, text('Updated Local instructions')),
      message(1, new vscode.LanguageModelToolResultPart('original-b', [text('B')]), new vscode.LanguageModelToolResultPart('original-a', [text('A')]))]);
    expect(requests[1].body.request.systemInstruction.parts).toEqual([{ text: 'Updated Local instructions' }]);
    expect(requests[1].body.request.contents[0].parts[0].text).toBe('Hello');
    expect(requests[1].body.request.contents[1].parts).toEqual(callParts());
    expect(second.filter(p => p instanceof vscode.LanguageModelTextPart)).toEqual([text('Local done')]);
    const usage = second.find(p => p instanceof vscode.LanguageModelDataPart && p.mimeType === 'usage');
    expect(JSON.parse(Buffer.from(usage.data).toString())).toMatchObject({ prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 });
    await h.send([localHeader(second), message(1, text('Another user turn'))]);
    expect(requests[2].body.request.contents.map((c: any) => c.parts.find((p: any) => p.text && !p.thought)?.text).filter(Boolean)).toEqual(['Hello', 'Reading.', 'Local done', 'Another user turn']);
  });
  it('fails safely for a Local marker after a provider restart, while classic history remains usable', async () => {
    const first = setup(); const parts = await first.send();
    const restarted = setup();
    await expect(restarted.send([localHeader(parts), message(1, text('Continue'))])).rejects.toThrow(/Antigravity/i);
    expect(requests).toHaveLength(1);
    await restarted.send(followup(parts)); expect(requests).toHaveLength(2);
  });
  it('does not let a Local continuation cross conversation or account boundaries', async () => {
    const h = setup(); const parts = await h.send();
    await expect(h.send([localHeader(parts), message(1, text('Continue'))], { modelOptions: { _conversationId: 'other-session' } })).rejects.toThrow(/Antigravity/i);
    h.changeAccount(); await expect(h.send([localHeader(parts), message(1, text('Continue'))])).rejects.toThrow(/Antigravity/i);
    expect(requests).toHaveLength(1);
  });
  it('keeps Local continuation storage bounded and preserves the newest checkpoint', async () => {
    const h = setup(); let oldest: any[] = [], newest: any[] = [];
    for (let i = 0; i < 33; i++) { newest = await h.send(); if (!i) oldest = newest; }
    await expect(h.send([localHeader(oldest), message(1, text('Old branch'))])).rejects.toThrow(/Antigravity/i);
    await h.send([localHeader(newest), message(1, text('Current branch'))]);
    expect(requests).toHaveLength(34);
  });
  it('refuses oversized continuation history before making a provider request', async () => {
    const h = setup();
    await expect(h.send([message(1, text('x'.repeat(16 * 1024 * 1024 + 1)))])).rejects.toThrow(/Antigravity.*large/i);
    expect(requests).toHaveLength(0);
  });
  it('evicts Local checkpoints by aggregate bytes before the entry-count limit', async () => {
    const h = setup(); let oldest: any[] = [], newest: any[] = [];
    for (let i = 0; i < 17; i++) {
      newest = await h.send([message(1, text('x'.repeat(1024 * 1024)))]); if (!i) oldest = newest;
    }
    await expect(h.send([localHeader(oldest), message(1, text('Old branch'))])).rejects.toThrow(/Antigravity/i);
    await h.send([localHeader(newest), message(1, text('Current branch'))]);
    expect(requests).toHaveLength(18);
  });
  it('refuses positioned system instructions instead of silently hoisting them', async () => {
    const h = setup(), parts = await h.send();
    await expect(h.send([...firstMessages(), persistedAssistant(parts), message(3, text('Late system instruction')), message(1, text('Next'))])).rejects.toThrow(/Antigravity/i);
    expect(requests).toHaveLength(1);
  });
  it('rejects a duplicated replay packet within one conversation history', async () => {
    const h = setup(), parts = await h.send();
    await expect(h.send([...followup(parts), persistedAssistant(parts), message(1, text('Next again'))])).rejects.toThrow(/Antigravity/i);
    expect(requests).toHaveLength(1);
  });
  it('budgets opaque model state rather than treating a replay packet as zero tokens', async () => {
    const h = setup(), parts = await h.send();
    const marker = parts.find(p => p instanceof vscode.LanguageModelDataPart);
    expect(await h.chat.provideTokenCount({ id: 'antigravity' }, persistedAssistant(parts))).toBeGreaterThanOrEqual(marker.data.byteLength);
  });
  it.each(['missing', 'ciphertext', 'text', 'session', 'tier', 'account'])('refuses %s replay before another request or credential refresh', async kind => {
    const h = setup(), parts = await h.send(), messages = followup(parts);
    if (kind === 'missing') messages[2].content = messages[2].content.filter(p => !(p instanceof vscode.LanguageModelDataPart));
    if (kind === 'ciphertext') (messages[2].content.find(p => p instanceof vscode.LanguageModelDataPart) as any).data[55] ^= 1;
    if (kind === 'text') (messages[2].content.find(p => p instanceof vscode.LanguageModelTextPart) as any).value = 'altered';
    if (kind === 'account') h.changeAccount();
    const active = kind === 'tier' ? setup('gemini-4-argon-low') : h;
    const before = active.refreshed.mock.calls.length;
    await expect(active.send(messages, kind === 'session' ? { modelOptions: { _conversationId: 'another-session' } } : {})).rejects.toThrow(/Antigravity/i);
    expect(requests).toHaveLength(1); expect(active.refreshed.mock.calls.length).toBe(before);
  });
  it('rejects unmatched results and altered tool arguments before transport', async () => {
    const h = setup(); next = result(callParts()); const parts = await h.send();
    const assistant = persistedAssistant(parts);
    (assistant.content.find(p => p instanceof vscode.LanguageModelToolCallPart) as any).input.path = 'tampered';
    await expect(h.send([...firstMessages(), assistant, message(1, new vscode.LanguageModelToolResultPart('unknown', [text('A')]))])).rejects.toThrow(/Antigravity/i);
    expect(requests).toHaveLength(1);
  });
  it('refuses missing parallel tool results without another transport call', async () => {
    const h = setup(); next = result(callParts()); const parts = await h.send();
    await expect(h.send([...firstMessages(), persistedAssistant(parts), message(1,
      new vscode.LanguageModelToolResultPart('original-a', [text('A')]))])).rejects.toThrow(/Antigravity/i);
    expect(requests).toHaveLength(1); expect(h.output).toEqual([]);
  });
  it.each([['unknown-a', 'unknown-b'], ['original-a', 'original-a'], ['original-a ', 'original-b']])('refuses same-count results with mismatched ids %s / %s before transport', async (a, b) => {
    const h = setup(); next = result(callParts()); const parts = await h.send();
    const refreshed = h.refreshed.mock.calls.length;
    await expect(h.send([...firstMessages(), persistedAssistant(parts), message(1,
      new vscode.LanguageModelToolResultPart(a, [text('A')]), new vscode.LanguageModelToolResultPart(b, [text('B')]))])).rejects.toThrow(/Antigravity/i);
    expect(requests).toHaveLength(1); expect(h.output).toEqual([]); expect(h.refreshed.mock.calls.length).toBe(refreshed);
  });
  it.each(['truncation', 'unknown tool', 'missing id', 'duplicate id', 'missing usage', 'oversized state'])('refuses %s before exposing executable output', async kind => {
    const h = setup(); next = result(callParts());
    if (kind === 'truncation') next.response.candidates[0].finishReason = 'MAX_TOKENS';
    if (kind === 'unknown tool') next.response.candidates[0].content.parts[2].functionCall.name = 'not_offered';
    if (kind === 'missing id') delete next.response.candidates[0].content.parts[2].functionCall.id;
    if (kind === 'duplicate id') next.response.candidates[0].content.parts[3].functionCall.id = 'original-a';
    if (kind === 'missing usage') delete next.response.usageMetadata;
    if (kind === 'oversized state') next.response.candidates[0].content.parts[0].text = 'x'.repeat(70000);
    await expect(h.send()).rejects.toThrow(/Antigravity/i);
    expect(h.output).toEqual([]);
  });
  it('suppresses delivery if the account is signed out during generation', async () => {
    const h = setup(); onRequest = h.signOut;
    await expect(h.send()).rejects.toThrow(/Antigravity/i);
    expect(h.output).toEqual([]);
  });
  it('requires a conversation identity and refuses unsupported data input before transport', async () => {
    const h = setup();
    await expect(h.send(undefined, { modelOptions: {} })).rejects.toThrow(/conversation/i);
    await expect(h.send([message(1, new vscode.LanguageModelDataPart(new Uint8Array([1]), 'application/octet-stream'))])).rejects.toThrow(/data|part/i);
    expect(requests).toHaveLength(0);
  });
  it('does not start a pre-cancelled request', async () => {
    const h = setup();
    expect(await h.send(undefined, {}, { isCancellationRequested: true, onCancellationRequested: () => ({ dispose() {} }) })).toEqual([]);
    expect(requests).toHaveLength(0);
  });
  it('cancels a stalled response body, releases its listener and emits no replay or tools', async () => {
    const h = setup(); let cancel = () => {}; const disposed = vi.fn(), bodyCancelled = vi.fn();
    vi.stubGlobal('fetch', async (_url: any, init: any) => {
      requests.push({ body: JSON.parse(init.body), signal: init.signal });
      return new Response(new ReadableStream({ pull: () => new Promise(() => {}), cancel: bodyCancelled }));
    });
    const pending = h.send(undefined, {}, { isCancellationRequested: false,
      onCancellationRequested: (fn: () => void) => { cancel = fn; return { dispose: disposed }; } });
    await vi.waitFor(() => expect(requests).toHaveLength(1)); cancel();
    expect(await pending).toEqual([]); expect(requests[0].signal.aborted).toBe(true);
    expect(disposed).toHaveBeenCalledOnce(); expect(bodyCancelled).toHaveBeenCalledOnce();
  });
  it('requires a host with the qualified carrier contract', () => {
    expect(antigravityNativeChatError('gemini-4-argon-high', '1.104.0')).toMatch(/1\.145\.3/);
    expect(antigravityNativeChatError('gemini-4-argon-high', '1.145.3')).toBeUndefined();
  });
});

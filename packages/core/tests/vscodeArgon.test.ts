import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('vscode', () => import('./fixtures/vscode'));
import * as vscode from './fixtures/vscode';
import { registerWispChatProvider } from '../../vscode/src/chatProvider';
import { antigravityNativeChatError } from '../../vscode/src/nativeChatSupport';
import { PROVIDERS } from '../src/catalog';

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
let next: any, onRequest: (() => void) | undefined;
beforeEach(() => {
  next = result([{ text: 'Hello back', thoughtSignature: 'private-signature' }]); requests.length = 0; onRequest = undefined;
  vi.stubGlobal('fetch', async (url: any, init: any) => {
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
const persistedAssistant = (parts: any[]) => message(2, ...parts.map(p => {
  if (p instanceof vscode.LanguageModelDataPart) {
    const marker = Buffer.from(p.data).toString('utf8').split('\\')[1];
    return new vscode.LanguageModelDataPart(Buffer.from('wisp/antigravity\\' + JSON.parse(JSON.stringify(marker))), p.mimeType);
  }
  if (p instanceof vscode.LanguageModelToolCallPart) return new vscode.LanguageModelToolCallPart(p.callId, p.name, JSON.parse(JSON.stringify(p.input)));
  return text(p.value);
}));
const followup = (parts: any[]) => [...firstMessages(), persistedAssistant(parts), message(1, text('Continue'))];

describe('Argon native VS Code chat', () => {
  it.each(['low', 'medium', 'high'])('advertises the signed-in Argon %s tier with truthful capabilities', async tier => {
    const rows = await setup(`gemini-4-argon-${tier}`).chat.provideLanguageModelChatInformation();
    expect(rows).toHaveLength(1); expect(rows[0].capabilities.toolCalling).toBe(true);
    expect(rows[0].capabilities.imageInput).not.toBe(true);
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
  it('refuses positioned system instructions instead of silently hoisting them', async () => {
    const h = setup(), parts = await h.send();
    await expect(h.send([...firstMessages(), persistedAssistant(parts), message(3, text('Late system instruction')), message(1, text('Next'))])).rejects.toThrow(/Argon/i);
    expect(requests).toHaveLength(1);
  });
  it('rejects a duplicated replay packet within one conversation history', async () => {
    const h = setup(), parts = await h.send();
    await expect(h.send([...followup(parts), persistedAssistant(parts), message(1, text('Next again'))])).rejects.toThrow(/Argon/i);
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
    await expect(active.send(messages, kind === 'session' ? { modelOptions: { _conversationId: 'another-session' } } : {})).rejects.toThrow(/Argon/i);
    expect(requests).toHaveLength(1); expect(active.refreshed.mock.calls.length).toBe(before);
  });
  it('rejects unmatched results and altered tool arguments before transport', async () => {
    const h = setup(); next = result(callParts()); const parts = await h.send();
    const assistant = persistedAssistant(parts);
    (assistant.content.find(p => p instanceof vscode.LanguageModelToolCallPart) as any).input.path = 'tampered';
    await expect(h.send([...firstMessages(), assistant, message(1, new vscode.LanguageModelToolResultPart('unknown', [text('A')]))])).rejects.toThrow(/Argon/i);
    expect(requests).toHaveLength(1);
  });
  it('refuses missing parallel tool results without another transport call', async () => {
    const h = setup(); next = result(callParts()); const parts = await h.send();
    await expect(h.send([...firstMessages(), persistedAssistant(parts), message(1,
      new vscode.LanguageModelToolResultPart('original-a', [text('A')]))])).rejects.toThrow(/Argon/i);
    expect(requests).toHaveLength(1); expect(h.output).toEqual([]);
  });
  it.each([['unknown-a', 'unknown-b'], ['original-a', 'original-a'], ['original-a ', 'original-b']])('refuses same-count results with mismatched ids %s / %s before transport', async (a, b) => {
    const h = setup(); next = result(callParts()); const parts = await h.send();
    const refreshed = h.refreshed.mock.calls.length;
    await expect(h.send([...firstMessages(), persistedAssistant(parts), message(1,
      new vscode.LanguageModelToolResultPart(a, [text('A')]), new vscode.LanguageModelToolResultPart(b, [text('B')]))])).rejects.toThrow(/Argon/i);
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
    await expect(h.send()).rejects.toThrow(/Argon/i);
    expect(h.output).toEqual([]);
  });
  it('suppresses delivery if the account is signed out during generation', async () => {
    const h = setup(); onRequest = h.signOut;
    await expect(h.send()).rejects.toThrow(/Argon/i);
    expect(h.output).toEqual([]);
  });
  it('requires a conversation identity and refuses unqualified image input before transport', async () => {
    const h = setup();
    await expect(h.send(undefined, { modelOptions: {} })).rejects.toThrow(/conversation/i);
    await expect(h.send([message(1, new vscode.LanguageModelDataPart(new Uint8Array([1]), 'image/png'))])).rejects.toThrow(/image|part/i);
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

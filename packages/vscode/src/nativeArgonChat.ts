// Argon native chat: Copilot's persisted stateful_marker carries authenticated original model parts.
// Depends on the shared bounded transport, native-result validator, AES-GCM and request pairing checks.
import * as vscode from 'vscode';
import {
  antigravityNativeResponse, antigravityFailureOf, parseAntigravityNativeResult,
  buildAntigravityRequestBody, validateAntigravityFunctionCallPairing,
  createAntigravityReplayContext, sealGeminiReplay, openGeminiReplay,
  type AntigravityCreds, type AntigravityTurn, type AntigravityReplayContext,
} from '@wisp/core';

const MIME = 'stateful_marker';
const PREFIX = 'wisp.argon.native.v1.';
// The account refresh token supplies secret key material; this label separates native and Bridge replay.
const contextFor = (creds: AntigravityCreds | undefined) => createAntigravityReplayContext(creds, 'wisp.vscode.argon.v1');
const historyError = (): never => { throw new Error('Argon conversation state is missing or invalid. Start a new chat if history was compacted, edited or switched from another model.'); };
const accountError = (): never => { throw new Error('Argon sign-in changed or is incomplete. Sign in to Antigravity and start a new chat.'); };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

const scope = (baseUrl: string, model: string, conversation: string, context: AntigravityReplayContext) => Buffer.from(JSON.stringify([
  'wisp.argon.native.v1', baseUrl, model, conversation, context.lifetime, context.credentialBinding,
]));

const turnsFrom = (messages: readonly vscode.LanguageModelChatRequestMessage[], context: AntigravityReplayContext, binding: Buffer): AntigravityTurn[] => {
  const seen = new Set<string>();
  let conversationStarted = false;
  return messages.map(message => {
  // Copilot supplies System=3 through the provider boundary; older stable typings only name 1/2.
  const role = Number(message.role);
  if (![1, 2, 3].includes(role)) return historyError();
  if (role === 3 && conversationStarted) return historyError();
  if (role !== 3) conversationStarted = true;
  const turn: AntigravityTurn = { role: role === 3 ? 'system' : role === 2 ? 'assistant' : 'user', content: '', toolCalls: [], toolResults: [] };
  for (const part of message.content) {
    if (part instanceof vscode.LanguageModelTextPart) turn.content += part.value;
    else if (part instanceof vscode.LanguageModelToolCallPart) {
      if (turn.role !== 'assistant' || !object(part.input)) return historyError();
      turn.toolCalls!.push({ id: part.callId, name: part.name, argsJson: JSON.stringify(part.input) });
    } else if (part instanceof vscode.LanguageModelToolResultPart) {
      if (turn.role !== 'user' || part.content.some(p => !(p instanceof vscode.LanguageModelTextPart))) return historyError();
      turn.toolResults!.push({ callId: part.callId, content: part.content.map(p => (p as vscode.LanguageModelTextPart).value).join('') });
    } else if (part instanceof vscode.LanguageModelDataPart && part.mimeType === MIME) {
      if (turn.role !== 'assistant' || turn.nativeParts || part.data.byteLength > 91024) return historyError();
      const encoded = Buffer.from(part.data).toString('utf8'), separator = encoded.indexOf('\\');
      const marker = encoded.slice(separator + 1);
      if (separator < 1 || !marker.startsWith(PREFIX) || seen.has(marker)) return historyError();
      seen.add(marker);
      try {
        const packet = openGeminiReplay(marker.slice(PREFIX.length), context, binding);
        if (!object(packet) || packet.v !== 1) return historyError();
        turn.nativeParts = parseAntigravityNativeResult(packet.result).candidates[0].content.parts;
      } catch { return historyError(); }
    } else {
      throw new Error('Argon native chat currently accepts text and tool results only; this message contains an unsupported image or data part.');
    }
  }
  if (turn.role === 'assistant' && !turn.nativeParts) return historyError();
  return turn;
  });
};

export const provideArgonChatResponse = async (args: {
  model: string; baseUrl: string; maxOutputTokens?: number;
  messages: readonly vscode.LanguageModelChatRequestMessage[];
  options: vscode.ProvideLanguageModelChatResponseOptions;
  progress: vscode.Progress<vscode.LanguageModelResponsePart>;
  signal: AbortSignal;
  current: () => Promise<AntigravityCreds | undefined>;
  stored: () => AntigravityCreds | undefined;
}): Promise<void> => {
  const conversation = args.options.modelOptions?._conversationId;
  if (typeof conversation !== 'string' || !conversation.trim() || conversation.length > 2048) {
    throw new Error('Argon native chat needs a VS Code Copilot conversation identity. Start a new Copilot chat.');
  }
  args.signal.throwIfAborted();
  let context = contextFor(args.stored()), creds: AntigravityCreds | undefined;
  if (!context) {
    if (args.messages.some(m => Number(m.role) === 2)) return accountError();
    creds = await args.current(); args.signal.throwIfAborted();
    context = contextFor(args.stored());
    if (!context) return accountError();
  }
  const binding = scope(args.baseUrl, args.model, conversation, context);
  const messages = turnsFrom(args.messages, context, binding);
  const tools = (args.options.tools ?? []).map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
  // Validate visible history, signatures and result pairing before even refreshing credentials.
  try {
    const request = buildAntigravityRequestBody({ model: args.model, messages, tools, requestId: 'native-preflight', preserveSystemText: true });
    if (validateAntigravityFunctionCallPairing(request)) return historyError();
  } catch { return historyError(); }
  creds ??= await args.current(); args.signal.throwIfAborted();
  const current = contextFor(args.stored()), resolved = contextFor(creds);
  if (!current || !resolved || current.key !== context.key || current.snapshot !== resolved.snapshot) return accountError();
  let raw: unknown;
  try {
    raw = await antigravityNativeResponse({ creds: creds!, baseUrl: args.baseUrl, model: args.model, messages, tools,
      toolChoice: args.options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto',
      maxOutputTokens: args.maxOutputTokens, preserveSystemText: true, strictCompletion: true, signal: args.signal });
  } catch (error) {
    args.signal.throwIfAborted();
    const status = antigravityFailureOf(error)?.status;
    throw new Error(`Argon request failed${status ? ` (HTTP ${status})` : ''}. Retry the turn.`);
  }
  args.signal.throwIfAborted();
  if (contextFor(args.stored())?.snapshot !== current.snapshot) return accountError();
  const output: vscode.LanguageModelResponsePart[] = [];
  try {
    const result = parseAntigravityNativeResult(raw), parts = result.candidates[0].content.parts;
    const used = new Set(messages.flatMap(m => m.toolCalls ?? []).map(call => call.id));
    const calls: vscode.LanguageModelToolCallPart[] = [];
    let text = '';
    for (const part of parts) {
      if (part.thought) continue;
      if (typeof part.text === 'string') text += part.text;
      if (part.functionCall !== undefined) {
        const call = part.functionCall;
        if (!object(call) || typeof call.id !== 'string' || !call.id || used.has(call.id)
          || !tools.some(t => t.name === call.name) || !object(call.args ?? {})) throw new Error();
        used.add(call.id);
        calls.push(new vscode.LanguageModelToolCallPart(call.id, call.name as string, call.args ?? {}));
      }
    }
    const usage = result.usageMetadata;
    if ((!text && !calls.length) || (args.maxOutputTokens !== undefined && usage.candidatesTokenCount + usage.thoughtsTokenCount > args.maxOutputTokens)
      || (tools.length && args.options.toolMode === vscode.LanguageModelChatToolMode.Required && !calls.length)) throw new Error();
    const marker = PREFIX + sealGeminiReplay({ v: 1, result }, context, binding);
    output.push(new vscode.LanguageModelDataPart(Buffer.from(`antigravity\\${marker}`), MIME));
    if (text) output.push(new vscode.LanguageModelTextPart(text));
    output.push(...calls);
  } catch {
    throw new Error('Argon returned an incomplete or unsupported response. No tools were executed; retry the turn.');
  }
  args.signal.throwIfAborted();
  for (const part of output) args.progress.report(part);
};

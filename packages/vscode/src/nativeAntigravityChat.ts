// Antigravity native chat: Copilot's persisted stateful_marker carries authenticated original model parts.
// Depends on the shared bounded transport, native-result validator, AES-GCM and request pairing checks.
import * as vscode from 'vscode';
import {
  antigravityNativeResponse, antigravityFailureOf, parseAntigravityNativeResult,
  buildAntigravityRequestBody, validateAntigravityFunctionCallPairing,
  createAntigravityReplayContext, sealGeminiReplay, openGeminiReplay,
  type AntigravityCreds, type AntigravityTurn, type AntigravityReplayContext, type AntigravityThinkingLevel,
} from '@wisp/core';

const MIME = 'stateful_marker';
// Keep the original carrier/key labels so existing Argon conversations remain readable.
const PREFIX = 'wisp.argon.native.v1.';
// The account refresh token supplies secret key material; this label separates native and Bridge replay.
const contextFor = (creds: AntigravityCreds | undefined) => createAntigravityReplayContext(creds, 'wisp.vscode.argon.v1');
const historyError = (): never => { throw new Error('Antigravity conversation state is missing or invalid. Start a new chat if history was compacted, edited or switched from another model.'); };
const accountError = (): never => { throw new Error('Antigravity sign-in changed or is incomplete. Sign in to Antigravity and start a new chat.'); };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const HISTORY_BYTES = 16 * 1024 * 1024;
const tooLarge = (): never => { throw new Error('Antigravity conversation is too large to retain safely. Start a new chat with less context.'); };

// shortcut: Local mode sends reference-only continuations; reload/eviction requires a new chat.
// Classic Copilot retains its encrypted per-turn packets and does not depend on this cache.
export class NativeAntigravityHistory {
  private entries = new Map<string, string>();
  private bytes = 0;
  get = (marker: string): AntigravityTurn[] | undefined => {
    const value = this.entries.get(marker);
    return value === undefined ? undefined : JSON.parse(value);
  };
  remember = (marker: string, messages: AntigravityTurn[]): boolean => {
    const value = JSON.stringify(messages), bytes = Buffer.byteLength(value);
    if (bytes > HISTORY_BYTES) return false;
    const previous = this.entries.get(marker);
    if (previous !== undefined) this.bytes -= Buffer.byteLength(previous);
    this.entries.delete(marker); this.entries.set(marker, value); this.bytes += bytes;
    while (this.entries.size > 32 || this.bytes > HISTORY_BYTES) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= Buffer.byteLength(this.entries.get(oldest)!); this.entries.delete(oldest);
    }
    return true;
  };
}

const scope = (baseUrl: string, model: string, conversation: string, context: AntigravityReplayContext) => Buffer.from(JSON.stringify([
  'wisp.argon.native.v1', baseUrl, model, conversation, context.lifetime, context.credentialBinding,
]));

const readMarker = (part: vscode.LanguageModelDataPart, context: AntigravityReplayContext, binding: Buffer) => {
  if (part.data.byteLength > 91024) return historyError();
  const encoded = Buffer.from(part.data).toString('utf8'), separator = encoded.indexOf('\\');
  const marker = encoded.slice(separator + 1);
  if (separator < 1 || !marker.startsWith(PREFIX)) return historyError();
  try {
    const packet = openGeminiReplay(marker.slice(PREFIX.length), context, binding);
    if (!object(packet) || packet.v !== 1) return historyError();
    return { marker, parts: parseAntigravityNativeResult(packet.result).candidates[0].content.parts };
  } catch { return historyError(); }
};

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
      if (turn.role !== 'assistant' || turn.nativeParts) return historyError();
      const original = readMarker(part, context, binding);
      if (seen.has(original.marker)) return historyError();
      seen.add(original.marker); turn.nativeParts = original.parts;
    } else if (part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith('image/') && turn.role === 'user') {
      (turn.images ??= []).push({ mimeType: part.mimeType, dataBase64: Buffer.from(part.data).toString('base64') });
    } else {
      throw new Error('Antigravity native chat received an unsupported data part. Use text, images or text tool results.');
    }
  }
  if (turn.role === 'assistant' && !turn.nativeParts) return historyError();
  return turn;
  });
};

export const provideAntigravityChatResponse = async (args: {
  model: string; baseUrl: string; maxOutputTokens?: number; thinkingLevel?: AntigravityThinkingLevel;
  messages: readonly vscode.LanguageModelChatRequestMessage[];
  options: vscode.ProvideLanguageModelChatResponseOptions;
  progress: vscode.Progress<vscode.LanguageModelResponsePart>;
  signal: AbortSignal;
  current: () => Promise<AntigravityCreds | undefined>;
  stored: () => AntigravityCreds | undefined;
  history: NativeAntigravityHistory;
}): Promise<void> => {
  const conversation = args.options.modelOptions?._conversationId;
  if (typeof conversation !== 'string' || !conversation.trim() || conversation.length > 2048) {
    throw new Error('Antigravity native chat needs a VS Code Copilot conversation identity. Start a new Copilot chat.');
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
  const header = args.messages[0], first = header?.content[0];
  const referenceOnly = Number(header?.role) === 2 && header.content.length === 1
    && first instanceof vscode.LanguageModelDataPart && first.mimeType === MIME;
  let messages: AntigravityTurn[];
  if (referenceOnly) {
    // Local prepends previous_response_id, then new instructions and incremental tool/user input.
    const original = readMarker(first, context, binding), saved = args.history.get(original.marker);
    if (!saved) throw new Error('Antigravity Local chat state is no longer available after reload or cache eviction. Start a new chat.');
    const tail = turnsFrom(args.messages.slice(1), context, binding);
    if (tail.some(t => t.role === 'assistant')) return historyError();
    const instructions = tail.filter(t => t.role === 'system');
    messages = [...(instructions.length ? instructions : saved.filter(t => t.role === 'system')),
      ...saved.filter(t => t.role !== 'system'), ...tail.filter(t => t.role !== 'system')];
  } else messages = turnsFrom(args.messages, context, binding);
  if (Buffer.byteLength(JSON.stringify(messages)) > HISTORY_BYTES) return tooLarge();
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
      // The native descriptor already bounds this reserve using the account catalogue or its fallback.
      modelMaxOutputTokens: args.maxOutputTokens, allowCapacityFallback: true,
      maxOutputTokens: args.maxOutputTokens, thinkingLevel: args.thinkingLevel, preserveSystemText: true, strictCompletion: true, signal: args.signal });
  } catch (error) {
    args.signal.throwIfAborted();
    const status = antigravityFailureOf(error)?.status;
    throw new Error(`Antigravity request failed${status ? ` (HTTP ${status})` : ''}. Retry the turn.`);
  }
  args.signal.throwIfAborted();
  if (contextFor(args.stored())?.snapshot !== current.snapshot) return accountError();
  const output: vscode.LanguageModelResponsePart[] = [];
  let checkpoint: { marker: string; turn: AntigravityTurn } | undefined;
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
    checkpoint = { marker, turn: { role: 'assistant', content: text, nativeParts: parts,
      toolCalls: calls.map(call => ({ id: call.callId, name: call.name, argsJson: JSON.stringify(call.input) })) } };
    output.push(new vscode.LanguageModelDataPart(Buffer.from(`antigravity\\${marker}`), MIME));
    if (text) output.push(new vscode.LanguageModelTextPart(text));
    output.push(...calls);
    output.push(new vscode.LanguageModelDataPart(Buffer.from(JSON.stringify({ prompt_tokens: usage.promptTokenCount,
      completion_tokens: usage.candidatesTokenCount + usage.thoughtsTokenCount,
      total_tokens: usage.promptTokenCount + usage.candidatesTokenCount + usage.thoughtsTokenCount,
      prompt_tokens_details: { cached_tokens: usage.cachedContentTokenCount },
      completion_tokens_details: { reasoning_tokens: usage.thoughtsTokenCount } })), 'usage'));
  } catch {
    throw new Error('Antigravity returned an incomplete or unsupported response. No tools were executed; retry the turn.');
  }
  args.signal.throwIfAborted();
  if (!checkpoint || !args.history.remember(checkpoint.marker, [...messages, checkpoint.turn])) return tooLarge();
  for (const part of output) args.progress.report(part);
};

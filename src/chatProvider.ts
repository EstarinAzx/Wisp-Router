// ----------------- chatProvider.ts — Wisp as a VS Code Language Model Chat Provider ----------------- //

/*
 * Depends on:
 *   - vscode: the finalized (1.104+) Language Model Chat Provider API — registers Wisp's keyed
 *     Providers as selectable models in the native chat / Ctrl+I picker and streams their replies.
 *   - openai: the streamed chat client, built per-Provider by the injected clientFor (same
 *     OpenAI-compatible pattern Inquire uses, with stream: true).
 *   - ./catalog: Provider type + resolveModel + buildChatModelInfos (the vscode-free descriptor
 *     builder, unit-tested) — this file is only the vscode/openai glue around it.
 *
 * Design: an ADDITIONAL surface only. Inquire stays the primary feature and is untouched; this just
 * exposes the same {baseUrl, key, model} backends through VS Code's native chat. extension.ts owns the
 * key handling (SecretStorage) and injects per-Provider resolvers, so this module reads no secrets and
 * adds no key-redirect surface — built-in base URLs stay hardcoded in the catalog.
 *
 * Data shapes:
 *   - ChatProviderDeps: the seam to extension.ts — the catalog, the current model-map/baseUrl getters,
 *     and async per-Provider key/client resolvers.
 *   - NormalizedTurn (from ./catalog): a vscode-free flattening of each chat turn (text + tool calls +
 *     tool results) that the pure builder turns into OpenAI messages — this file does the vscode-part
 *     extraction, catalog does the shaping. Tool calling is supported: agent tools are forwarded and
 *     streamed tool-call fragments are emitted back as LanguageModelToolCallParts.
 */

import * as vscode from 'vscode';
import OpenAI from 'openai';
import {
  Provider, resolveModel, buildChatModelInfos,
  buildOpenAiChatMessages, assembleToolCalls, toOpenAiTools,
  type NormalizedTurn, type ToolCallDelta,
} from './catalog';

// ----------------------------- Dependencies ----------------------------- //

// The seam to extension.ts. Key/client resolution lives there (it reads SecretStorage); this module is
// handed the catalog plus pure getters so it never touches secrets or config directly.
export type ChatProviderDeps = {
  providers: Provider[];
  modelMap: () => Record<string, string>;          // current per-Provider model memory
  customBaseUrl: () => string;                      // wisp.baseUrl (only Custom resolves from it)
  keyFor: (provider: Provider) => Promise<string>;  // resolved key, '' when none
  clientFor: (provider: Provider) => Promise<OpenAI | undefined>; // built {baseUrl, key} client
  log: (message: string) => void;
};

// ----------------------------- Message mapping ----------------------------- //

// Pull the text out of a tool result's content parts — only text parts are forwarded to the backend.
const toolResultText = (parts: readonly unknown[]): string =>
  parts.filter((p): p is vscode.LanguageModelTextPart => p instanceof vscode.LanguageModelTextPart)
    .map((p) => p.value).join('');

// Flatten one native chat turn to the catalog's vscode-free NormalizedTurn: its text, the tool calls it
// made (assistant turns) and the tool results it carries (user turns). The pure builder turns the
// sequence into OpenAI messages; doing the vscode-part extraction here keeps that logic testable.
const normalizeTurn = (m: vscode.LanguageModelChatRequestMessage): NormalizedTurn => {
  const turn: NormalizedTurn = {
    role: m.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' : 'user',
    text: '', toolCalls: [], toolResults: [],
  };
  for (const part of m.content) {
    if (part instanceof vscode.LanguageModelTextPart) turn.text += part.value;
    else if (part instanceof vscode.LanguageModelToolCallPart) turn.toolCalls.push({ id: part.callId, name: part.name, argsJson: JSON.stringify(part.input) });
    else if (part instanceof vscode.LanguageModelToolResultPart) turn.toolResults.push({ callId: part.callId, content: toolResultText(part.content) });
  }
  return turn;
};

const toOpenAiMessages = (messages: readonly vscode.LanguageModelChatRequestMessage[]) =>
  buildOpenAiChatMessages(messages.map(normalizeTurn));

// ----------------------------- Provider ----------------------------- //

// Implements the three LanguageModelChatProvider methods over Wisp's catalog. The model `id` we
// advertise IS the Provider id, so the response/token methods map it straight back to a Provider.
const makeProvider = (deps: ChatProviderDeps): vscode.LanguageModelChatProvider => ({
  // Advertise one model per usable Provider. Key presence is async (SecretStorage) so resolve it for
  // every Provider first, then hand the plain facts to the pure builder, which owns the usability rules.
  provideLanguageModelChatInformation: async () => {
    const keyedPairs = await Promise.all(
      deps.providers.map(async (p) => [p.id, !!(await deps.keyFor(p))] as const),
    );
    const keyed = Object.fromEntries(keyedPairs);
    return buildChatModelInfos(deps.providers, {
      keyed,
      modelMap: deps.modelMap(),
      customBaseUrl: deps.customBaseUrl(),
    });
  },

  // Stream the reply: resolve the picked Provider's client + model, forward any agent tools, then relay
  // text deltas as text parts and reassemble streamed tool-call fragments into tool-call parts at the
  // end. Cancellation is bridged to an AbortController so the HTTP stream dies with the request.
  provideLanguageModelChatResponse: async (model, messages, options, progress, token) => {
    const provider = deps.providers.find((p) => p.id === model.id);
    if (!provider) return;
    const client = await deps.clientFor(provider);
    if (!client) return; // only usable models are advertised, so this is the rare key-revoked race
    const modelId = resolveModel(deps.modelMap(), provider);

    // Forward the agent's tools so the model can call them; tool_choice mirrors VS Code's tool mode.
    const tools = toOpenAiTools((options.tools ?? []).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })));
    const toolChoice = options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto';

    const controller = new AbortController();
    token.onCancellationRequested(() => controller.abort());

    try {
      const stream = await client.chat.completions.create(
        {
          model: modelId,
          messages: toOpenAiMessages(messages),
          stream: true,
          ...(tools.length ? { tools, tool_choice: toolChoice } : {}),
        },
        { signal: controller.signal },
      );
      // Tool calls stream in fragments across chunks; collect them and assemble once the stream ends.
      const toolDeltas: ToolCallDelta[] = [];
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        const delta = choice?.delta?.content ?? '';
        if (delta) progress.report(new vscode.LanguageModelTextPart(delta));
        for (const tc of choice?.delta?.tool_calls ?? []) {
          toolDeltas.push({ index: tc.index, id: tc.id, name: tc.function?.name, args: tc.function?.arguments });
        }
      }
      for (const call of assembleToolCalls(toolDeltas)) {
        // A backend can emit malformed argument JSON — degrade to {} rather than abort the whole turn.
        let input: object = {};
        try { input = call.argsJson ? JSON.parse(call.argsJson) : {}; } catch { /* keep {} */ }
        progress.report(new vscode.LanguageModelToolCallPart(call.id, call.name, input));
      }
    } catch (err) {
      if (controller.signal.aborted) return; // user cancelled — normal, not a failure
      deps.log(`[error] chat ${provider.id} ${String(err)}`);
      throw err; // surface real failures to VS Code's chat UI
    }
  },

  // No tokenizer dependency: a ~4-chars-per-token heuristic is enough for the picker's budgeting.
  provideTokenCount: async (_model, text) => {
    const str = typeof text === 'string' ? text : normalizeTurn(text).text;
    return Math.ceil(str.length / 4);
  },
});

// Register Wisp as the 'wisp' chat-model vendor (matches contributes.languageModelChatProviders in
// package.json). Returns the Disposable for the caller to push onto context.subscriptions.
export const registerWispChatProvider = (deps: ChatProviderDeps): vscode.Disposable =>
  vscode.lm.registerLanguageModelChatProvider('wisp', makeProvider(deps));

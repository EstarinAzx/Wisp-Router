// ----------------- chatProvider.ts — Wisp as a VS Code Language Model Chat Provider ----------------- //

/*
 * Depends on:
 *   - vscode: the finalized (1.104+) Language Model Chat Provider API — registers Wisp's keyed
 *     Providers as selectable models in the native chat / Ctrl+I picker and streams their replies.
 *   - openai: the streamed chat client, built per-Provider by the injected clientFor (same
 *     OpenAI-compatible pattern Inquire uses, with stream: true).
 *   - @wisp/core: Provider type + resolveModel + buildChatModelInfos (the vscode-free descriptor
 *     builder, unit-tested) — this file is only the vscode/openai glue around it.
 *
 * Design: an ADDITIONAL surface only. Inquire stays the primary feature and is untouched; this just
 * exposes the same {baseUrl, key, model} backends through VS Code's native chat. extension.ts owns the
 * key handling (~/.wisp/auth.json) and injects per-Provider resolvers, so this module reads no secrets
 * and adds no key-redirect surface — built-in base URLs stay hardcoded in the catalog.
 *
 * Data shapes:
 *   - ChatProviderDeps: the seam to extension.ts — the catalog, the current model-map/baseUrl getters,
 *     and async per-Provider key/client resolvers.
 *   - NormalizedTurn (from @wisp/core): a vscode-free flattening of each chat turn (text + tool calls +
 *     tool results) that the pure builder turns into OpenAI messages — this file does the vscode-part
 *     extraction, catalog does the shaping. Tool calling is supported: agent tools are forwarded and
 *     streamed tool-call fragments are emitted back as LanguageModelToolCallParts.
 */

import * as vscode from 'vscode';
import OpenAI from 'openai';
import {
  Provider, resolveModel, resolveBaseUrl, buildChatModelInfos, lookupModelsDevCaps,
  buildOpenAiChatMessages, assembleToolCalls, toOpenAiTools, toCodexResponsesTools, isCodexProvider, codexModelCaps,
  isAnthropicProvider, anthropicModelCaps, toAnthropicTools, standardEffortToCodex,
  isXaiProvider, xaiModelCaps,
  type NormalizedTurn, type ToolCallDelta, type CodexCreds, type EffortLevel, type AnthropicCreds, type XaiCreds,
} from '@wisp/core';
import { codexStream } from '@wisp/core';
import { anthropicStream } from '@wisp/core';
import { xaiStream } from '@wisp/core';
import { getModelsDevCatalog } from '@wisp/core';

// ----------------------------- Dependencies ----------------------------- //

// The seam to extension.ts. Key/client resolution lives there (it reads the ~/.wisp store); this module
// is handed the catalog plus pure getters so it never touches secrets or config directly.
export type ChatProviderDeps = {
  providers: Provider[];
  modelMap: () => Record<string, string>;          // current per-Provider model memory
  customBaseUrl: () => string;                      // wisp.baseUrl (only Custom resolves from it)
  keyFor: (provider: Provider) => Promise<string>;  // resolved key, '' when none
  clientFor: (provider: Provider) => Promise<OpenAI | undefined>; // built {baseUrl, key} client
  // Codex has no API key — it is "usable when signed in". These two feed the codex row: its keyed flag
  // (so a not-signed-in Codex stays hidden) and its refreshed OAuth creds for the streaming Responses call.
  codexSignedIn: () => Promise<boolean>;
  codexCreds: () => Promise<CodexCreds | undefined>;
  effort: () => EffortLevel;                        // the panel's reasoning Effort — shared by Codex + Anthropic (same value Inquire uses)
  // Anthropic is the same "usable when signed in" shape as Codex (no API key): the signed-in flag gates
  // the row, current() returns the refreshed OAuth bundle for the streaming Messages call.
  anthropicSignedIn: () => Promise<boolean>;
  anthropicCreds: () => Promise<AnthropicCreds | undefined>;
  // Grok (xAI) is the same "usable when signed in" shape — signed-in flag gates the row, current() returns
  // the refreshed OAuth bundle for the streaming Responses call.
  xaiSignedIn: () => Promise<boolean>;
  xaiCreds: () => Promise<XaiCreds | undefined>;
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
    text: '', toolCalls: [], toolResults: [], images: [],
  };
  for (const part of m.content) {
    if (part instanceof vscode.LanguageModelTextPart) turn.text += part.value;
    else if (part instanceof vscode.LanguageModelToolCallPart) turn.toolCalls.push({ id: part.callId, name: part.name, argsJson: JSON.stringify(part.input) });
    else if (part instanceof vscode.LanguageModelToolResultPart) turn.toolResults.push({ callId: part.callId, content: toolResultText(part.content) });
    // Image attachments → base64 for the OpenAI data-URI; only image mime types are forwarded.
    else if (part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith('image/')) turn.images!.push({ mimeType: part.mimeType, dataBase64: Buffer.from(part.data).toString('base64') });
  }
  return turn;
};

const toOpenAiMessages = (messages: readonly vscode.LanguageModelChatRequestMessage[]) =>
  buildOpenAiChatMessages(messages.map(normalizeTurn));

// Native chat turns → Codex Responses messages: role, text, any attached images (forwarded as input_image),
// and the agent round-trip — the tool calls a turn made and the tool results it carries. Empty turns are
// kept as-is; buildCodexResponsesBody emits items only for the parts that are present (a tool-only turn
// yields just its function_call / function_call_output items, no message item).
const toCodexMessages = (messages: readonly vscode.LanguageModelChatRequestMessage[]) =>
  messages.map(normalizeTurn)
    .map((t) => ({ role: t.role, content: t.text, images: t.images, toolCalls: t.toolCalls, toolResults: t.toolResults }));

// Native chat turns → Anthropic Messages turns: role, text, any attached images (expanded into `image`
// content blocks), and the agent round-trip — the tool calls a turn made and the tool results it carries
// (#30). buildAnthropicMessagesBody expands those into tool_use / tool_result / image content blocks.
const toAnthropicMessages = (messages: readonly vscode.LanguageModelChatRequestMessage[]) =>
  messages.map(normalizeTurn).map((t) => ({ role: t.role, content: t.text, images: t.images, toolCalls: t.toolCalls, toolResults: t.toolResults }));

// ----------------------------- Provider ----------------------------- //

// Implements the three LanguageModelChatProvider methods over Wisp's catalog. The model `id` we
// advertise IS the Provider id, so the response/token methods map it straight back to a Provider.
const makeProvider = (deps: ChatProviderDeps): vscode.LanguageModelChatProvider => ({
  // Advertise one model per usable Provider. Key presence is async (the injected resolver) so resolve it for
  // every Provider first, then hand the plain facts to the pure builder, which owns the usability rules.
  provideLanguageModelChatInformation: async () => {
    const keyedPairs = await Promise.all(
      // The OAuth rows (Codex, Anthropic) are usable when "signed in" (no API key); every other row is
      // "has a key".
      deps.providers.map(async (p) => [p.id,
        isCodexProvider(p) ? await deps.codexSignedIn()
          : isAnthropicProvider(p) ? await deps.anthropicSignedIn()
            : isXaiProvider(p) ? await deps.xaiSignedIn()
              : !!(await deps.keyFor(p))] as const),
    );
    const keyed = Object.fromEntries(keyedPairs);
    // Pull the real context/output/vision from models.dev. Race a timeout so a cold/slow fetch never
    // stalls the picker — it keeps caching in the background, so the next open is accurate; missing
    // data just falls back to the table/default inside buildChatModelInfos.
    const catalog = await Promise.race([
      getModelsDevCatalog(),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 4000)),
    ]);
    // Codex and Anthropic have no catalogKey, but models.dev's openai/anthropic entries DO carry their
    // real windows — look the id up there first so new releases (gpt-5.6's 1M window) are honest, and
    // fall back to each kind's hardcoded table offline; every other row pulls caps via its catalogKey.
    const caps = (provider: Provider, model: string) =>
      isCodexProvider(provider) ? (lookupModelsDevCaps(catalog, 'openai', model) ?? codexModelCaps(model))
        : isAnthropicProvider(provider) ? (lookupModelsDevCaps(catalog, 'anthropic', model) ?? anthropicModelCaps(model))
          : isXaiProvider(provider) ? (lookupModelsDevCaps(catalog, 'xai', model) ?? xaiModelCaps(model))
            : provider.catalogKey ? lookupModelsDevCaps(catalog, provider.catalogKey, model) : undefined;
    return buildChatModelInfos(deps.providers, {
      keyed,
      modelMap: deps.modelMap(),
      customBaseUrl: deps.customBaseUrl(),
      caps,
      // Only feeds the Codex row's picker-label suffix — normalize so a knob left on 'max' reads as its
      // Codex-honest 'xhigh', never a level Codex can't send (#32).
      effort: standardEffortToCodex(deps.effort()),
    });
  },

  // Stream the reply: resolve the picked Provider's client + model, forward any agent tools, then relay
  // text deltas as text parts and reassemble streamed tool-call fragments into tool-call parts at the
  // end. Cancellation is bridged to an AbortController so the HTTP stream dies with the request.
  provideLanguageModelChatResponse: async (model, messages, options, progress, token) => {
    const provider = deps.providers.find((p) => p.id === model.id);
    if (!provider) return;
    const modelId = resolveModel(deps.modelMap(), provider);

    const controller = new AbortController();
    token.onCancellationRequested(() => controller.abort());

    // Codex speaks the Responses API, not chat completions — stream it through the dedicated client. Agent
    // tools are forwarded as strict Responses tools; codexStream yields text fragments live and the
    // assembled tool calls at the end, which map to text / tool-call parts exactly like the OpenAI path.
    if (isCodexProvider(provider)) {
      const creds = await deps.codexCreds();
      if (!creds) return; // only signed-in Codex is advertised — rare sign-out race
      const baseUrl = resolveBaseUrl(provider, deps.customBaseUrl());
      const tools = toCodexResponsesTools((options.tools ?? []).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })));
      const toolChoice = options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto';
      try {
        for await (const ev of codexStream({ creds, baseUrl, model: modelId, messages: toCodexMessages(messages), effort: standardEffortToCodex(deps.effort()), tools, toolChoice, signal: controller.signal })) {
          if (ev.type === 'text') { progress.report(new vscode.LanguageModelTextPart(ev.value)); continue; }
          // A backend can emit malformed argument JSON — degrade to {} rather than abort the whole turn.
          let input: object = {};
          try { input = ev.call.argsJson ? JSON.parse(ev.call.argsJson) : {}; } catch { /* keep {} */ }
          progress.report(new vscode.LanguageModelToolCallPart(ev.call.id, ev.call.name, input));
        }
      } catch (err) {
        // Log the cancel too: a superseded/regenerated agent turn aborts mid-stream and otherwise vanishes,
        // making an intermittent "cut off" report impossible to distinguish from a real drop in the logs.
        if (controller.signal.aborted) { deps.log(`[cancel] chat ${provider.id} aborted mid-stream`); return; }
        deps.log(`[error] chat ${provider.id} ${String(err)}`);
        throw err;
      }
      return;
    }

    // Anthropic speaks the Messages API, not chat completions — stream it through the dedicated client.
    // Agent tools are forwarded as Anthropic tools (#30); anthropicStream yields text fragments live and the
    // assembled tool calls at stream end, mapped to text / tool-call parts exactly like the Codex path.
    if (isAnthropicProvider(provider)) {
      const creds = await deps.anthropicCreds();
      if (!creds) return; // only signed-in Anthropic is advertised — rare sign-out race
      const baseUrl = resolveBaseUrl(provider, deps.customBaseUrl());
      const tools = toAnthropicTools((options.tools ?? []).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })));
      const toolChoice = options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'any' : 'auto';
      try {
        for await (const ev of anthropicStream({ creds, baseUrl, model: modelId, messages: toAnthropicMessages(messages), effort: deps.effort(), tools, toolChoice, signal: controller.signal })) {
          if (ev.type === 'text') { progress.report(new vscode.LanguageModelTextPart(ev.value)); continue; }
          // Thinking passthrough events have no vscode chat part — dropped here (Anthropic-door-only fidelity).
          if (ev.type !== 'toolCall') continue;
          // A backend can emit malformed argument JSON — degrade to {} rather than abort the whole turn.
          let input: object = {};
          try { input = ev.call.argsJson ? JSON.parse(ev.call.argsJson) : {}; } catch { /* keep {} */ }
          progress.report(new vscode.LanguageModelToolCallPart(ev.call.id, ev.call.name, input));
        }
      } catch (err) {
        if (controller.signal.aborted) return; // user cancelled — normal, not a failure
        deps.log(`[error] chat ${provider.id} ${String(err)}`);
        throw err;
      }
      return;
    }

    // Grok (xAI) is a Codex twin on the Responses wire — stream it through xaiStream, reusing the Codex
    // message shape + Responses tools. effort stays the shared EffortLevel (xaiReasoning gates per model).
    if (isXaiProvider(provider)) {
      const creds = await deps.xaiCreds();
      if (!creds) return; // only signed-in Grok is advertised — rare sign-out race
      const baseUrl = resolveBaseUrl(provider, deps.customBaseUrl());
      const tools = toCodexResponsesTools((options.tools ?? []).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })));
      const toolChoice = options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto';
      try {
        for await (const ev of xaiStream({ creds, baseUrl, model: modelId, messages: toCodexMessages(messages), effort: deps.effort(), tools, toolChoice, signal: controller.signal })) {
          if (ev.type === 'text') { progress.report(new vscode.LanguageModelTextPart(ev.value)); continue; }
          // A backend can emit malformed argument JSON — degrade to {} rather than abort the whole turn.
          let input: object = {};
          try { input = ev.call.argsJson ? JSON.parse(ev.call.argsJson) : {}; } catch { /* keep {} */ }
          progress.report(new vscode.LanguageModelToolCallPart(ev.call.id, ev.call.name, input));
        }
      } catch (err) {
        if (controller.signal.aborted) return; // user cancelled — normal, not a failure
        deps.log(`[error] chat ${provider.id} ${String(err)}`);
        throw err;
      }
      return;
    }

    const client = await deps.clientFor(provider);
    if (!client) return; // only usable models are advertised, so this is the rare key-revoked race

    // Forward the agent's tools so the model can call them; tool_choice mirrors VS Code's tool mode.
    const tools = toOpenAiTools((options.tools ?? []).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })));
    const toolChoice = options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto';

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
export const registerWispChatProvider = (deps: ChatProviderDeps): vscode.Disposable => {
  void getModelsDevCatalog(); // warm the capability cache so the first picker open is already accurate
  return vscode.lm.registerLanguageModelChatProvider('wisp', makeProvider(deps));
};

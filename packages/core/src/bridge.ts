// ---------------- bridge.ts — Wisp: pure OpenAI <-> Wisp protocol translator ---------------- //

/*
 * The Bridge (PRD #34) exposes the whole Provider catalog to an external tool (the Copilot CLI) as one
 * ordinary OpenAI backend. This module is the PURE protocol translator — the inverse of catalog.ts's
 * send-builders on the way in, and an OpenAI-SSE emitter on the way out. It is deliberately vscode-free
 * and opens no socket: the HTTP listener, the side-panel toggle, and all wiring are later slices (#37+).
 *
 * Reuses catalog.ts's normalized vocabulary (NormalizedTurn, ToolSpec, AssembledToolCall, ChatModelInfo)
 * so the values this produces feed straight into buildOpenAiChatMessages / buildCodexResponsesBody /
 * buildAnthropicMessagesBody without a second mapping.
 */

import type { NormalizedTurn, ToolSpec, AssembledToolCall, ChatModelInfo, BridgeUsage, AnthropicCacheMissReason } from './catalog';

// ----------------------------- Inbound: OpenAI request -> Wisp ----------------------------- //

// The OpenAI request shapes we read. Structural (no SDK import) — only the fields the translator needs.
type OAContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
type OAToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type OARequestMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | OAContentPart[] }
  | { role: 'assistant'; content?: string | null; tool_calls?: OAToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
type OARequestTool = { type: 'function'; function: { name: string; description?: string; parameters?: object } };
export type OAChatRequest = { model: string; stream?: boolean; messages: OARequestMessage[]; tools?: OARequestTool[] };

// What the translator hands the downstream send-builders. `system` is kept SEPARATE from `turns` (not a
// turn) because every send-builder consumes system apart from the conversation — Codex as `instructions`,
// Anthropic as the top-level `system` block, OpenAI re-prepended. turns/tools reuse the catalog types so
// no second mapping is needed. system is '' when the request carried none (downstream reads '' as "none").
export type BridgeChatRequest = {
  model: string;
  stream: boolean;
  system: string;
  turns: NormalizedTurn[];
  tools: ToolSpec[];
};

// Split a data URI ("data:<mime>;base64,<payload>") into the mimeType + base64 payload the normalized
// image shape wants. A non-data URL degrades to an empty mime + the raw url as the payload (the backend
// then rejects it) rather than throwing — the translator never trusts the inbound body to be well-formed.
const parseDataUri = (url: string): { mimeType: string; dataBase64: string } => {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(url);
  return m ? { mimeType: m[1], dataBase64: m[2] } : { mimeType: '', dataBase64: url };
};

// Split a user message's multimodal content array into its joined text and its images[] — the inverse of
// buildOpenAiChatMessages' image_url assembly. text parts concatenate; image_url parts become images.
const splitUserContent = (content: string | OAContentPart[]): { text: string; images: { mimeType: string; dataBase64: string }[] } => {
  if (typeof content === 'string') return { text: content, images: [] };
  // Untrusted body — non-array content (null / number / object) carries no parts; degrade to empty.
  if (!Array.isArray(content)) return { text: '', images: [] };
  let text = '';
  const images: { mimeType: string; dataBase64: string }[] = [];
  for (const part of content) {
    // Only well-formed text / image_url parts contribute; unknown or partial parts (a real OpenAI
    // input_audio part, a url-less image_url) are skipped, never dereferenced blindly.
    if (part?.type === 'text' && typeof part.text === 'string') text += part.text;
    else if (part?.type === 'image_url' && part.image_url?.url) images.push(parseDataUri(part.image_url.url));
  }
  return { text, images };
};

// Parse an OpenAI /v1/chat/completions body into Wisp's normalized shape — the inverse of
// buildOpenAiChatMessages (+ toOpenAiTools). System content is lifted into a separate `system` string
// (joined with a blank line when there are several). A `tool` message attaches to the OWNING user turn's
// toolResults: buildOpenAiChatMessages emits tool messages BEFORE the user text, so on the way back the
// run of tool results is buffered and lands on the next user turn (or, if none follows, folds into a bare
// tool-result user turn) — preserving the assistant(tool_calls) -> tool adjacency that round-trips.
export const parseOpenAiChatRequest = (body: OAChatRequest): BridgeChatRequest => {
  // Untrusted body — a missing/non-array messages field degrades to no turns rather than throwing.
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = messages.filter((m) => m.role === 'system').map((m) => (m as { content: string }).content).join('\n\n');
  const turns: NormalizedTurn[] = [];
  let pendingResults: { callId: string; content: string }[] = [];

  // Flush buffered tool results as a bare tool-result user turn (used when no user-text turn claims them).
  const flushPendingResults = () => {
    if (pendingResults.length) {
      turns.push({ role: 'user', text: '', toolCalls: [], toolResults: pendingResults });
      pendingResults = [];
    }
  };

  for (const msg of messages) {
    if (msg.role === 'system') continue;
    if (msg.role === 'tool') {
      pendingResults.push({ callId: msg.tool_call_id, content: msg.content });
    } else if (msg.role === 'assistant') {
      flushPendingResults();
      const toolCalls = (msg.tool_calls ?? []).map((tc) => ({ id: tc.id, name: tc.function?.name ?? '', argsJson: tc.function?.arguments ?? '' }));
      turns.push({ role: 'assistant', text: msg.content ?? '', toolCalls, toolResults: [] });
    } else {
      // A user turn claims any buffered tool results (the result of the prior assistant turn's calls).
      const { text, images } = splitUserContent(msg.content);
      const toolResults = pendingResults;
      pendingResults = [];
      turns.push({ role: 'user', text, toolCalls: [], toolResults, ...(images.length ? { images } : {}) });
    }
  }
  flushPendingResults();

  const tools: ToolSpec[] = (body.tools ?? []).map((t) => ({
    name: t.function?.name ?? '',
    description: t.function?.description ?? '',
    ...(t.function?.parameters !== undefined ? { inputSchema: t.function.parameters } : {}),
  }));

  return { model: body.model, stream: body.stream ?? false, system, turns, tools };
};

// ----------------------------- Outbound: Wisp stream -> OpenAI SSE ----------------------------- //

// A provider-agnostic stream event the Bridge renders — the lowest common denominator across the OpenAI/
// Codex/Anthropic stream reducers: either a text delta or one COMPLETED tool call (Wisp assembles tool
// calls whole before surfacing them, so the Bridge never sees argument fragments). The HTTP slice (#37)
// maps each Provider's stream onto this union, then this module turns it into OpenAI wire chunks.
export type BridgeStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; call: AssembledToolCall }
  // Thinking passthrough: only the Anthropic upstream produces these, and only the Anthropic door renders
  // them (its SSE encoder + non-streaming reply). The OpenAI door has no thinking vocabulary — its paths
  // never receive them (the Anthropic provider on that door drops thinking before mapping to chunks).
  | { type: 'thinking_start' }
  | { type: 'thinking'; text: string }
  | { type: 'thinking_signature'; signature: string }
  | { type: 'redacted_thinking'; data: string }
  // Real token usage from the backend (Anthropic upstream only). Carries no wire content — the Anthropic
  // door's encoder folds it into message_start/message_delta usage; other doors/reducers ignore it.
  | { type: 'usage'; usage: BridgeUsage }
  // #156: server cache diagnosis (Anthropic upstream only). Carries no wire content — the Anthropic door
  // reads the miss reason for its cache-health log; reducers and other doors ignore it. The message id is
  // recorded upstream (the diagnosis chain) before this event is ever yielded.
  | { type: 'diagnosis'; messageId: string; missReason?: AnthropicCacheMissReason }
  // Advisor (server tool, Anthropic door only): the door itself PRODUCES these while playing the server
  // role — the backend never emits them. server_tool_use announces the advisor call to Claude Code;
  // advisor_result/advisor_error carry the reviewer's verdict back. None of them are client tool calls,
  // so no door's finish/stop_reason logic may count them as one.
  | { type: 'server_tool_use'; call: AssembledToolCall }
  | { type: 'advisor_result'; toolUseId: string; text: string }
  | { type: 'advisor_error'; toolUseId: string; errorCode: string }
  // The reviewer sub-call's real token usage + resolved Target model (#143). Carries no wire content — the
  // Anthropic door folds it into usage.iterations on its closing frames; it never joins the 'usage' channel
  // (top-level usage stays the base pass only, which is what the #111 cache-health guard reads).
  | { type: 'advisor_usage'; usage: BridgeUsage; model: string };

// The terminal finish_reason: 'tool_calls' when the turn emitted any tool call (the client must run them),
// else 'stop'. Mid-stream chunks carry finish_reason null until the terminal chunk.
export type FinishReason = 'stop' | 'tool_calls';

// The chunk identity OpenAI clients expect on every chunk of one response — injected so this module stays
// deterministic (no Date.now() / no random id here; the HTTP slice supplies a stable id + created clock).
export type ChunkMeta = { id: string; model: string; created: number };

// One OpenAI chat.completion.chunk. delta carries content (text) OR tool_calls (one entry per call, each a
// whole call with a distinct array index); the terminal chunk's delta is empty and finish_reason is set.
type OAToolCallDelta = { index: number; id: string; type: 'function'; function: { name: string; arguments: string } };
export type OAChatChunk = {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: [{ index: 0; delta: { content?: string; tool_calls?: OAToolCallDelta[] }; finish_reason: FinishReason | null }];
};

// Wrap a delta in the chunk envelope shared by every chunk of a response. finish_reason defaults to null —
// only the terminal chunk overrides it.
const chunk = (meta: ChunkMeta, delta: OAChatChunk['choices'][0]['delta'], finishReason: FinishReason | null = null): OAChatChunk => ({
  id: meta.id, object: 'chat.completion.chunk', created: meta.created, model: meta.model,
  choices: [{ index: 0, delta, finish_reason: finishReason }],
});

// A text delta -> a content chunk.
export const textChunk = (text: string, meta: ChunkMeta): OAChatChunk => chunk(meta, { content: text });

// A completed tool call -> a tool_calls delta chunk. Wisp folds tool calls WHOLE, so one delta carries the
// full arguments string; `index` is the tool_calls ARRAY slot (distinguishes parallel calls), not the
// choice index — a valid OpenAI shape that simply isn't fragment-streamed.
export const toolCallChunk = (call: AssembledToolCall, index: number, meta: ChunkMeta): OAChatChunk =>
  chunk(meta, { tool_calls: [{ index, id: call.id, type: 'function', function: { name: call.name, arguments: call.argsJson } }] });

// The terminal chunk: an empty delta carrying the finish_reason that closes the choice.
export const finalChunk = (finishReason: FinishReason, meta: ChunkMeta): OAChatChunk => chunk(meta, {}, finishReason);

// Serialize a chunk to its SSE wire line: `data: <json>\n\n` (one data line, blank-line terminated).
export const sseLine = (event: OAChatChunk): string => `data: ${JSON.stringify(event)}\n\n`;

// The literal end-of-stream sentinel OpenAI clients wait for, already `data:`-framed.
export const SSE_DONE = 'data: [DONE]\n\n';

// ----------------------------- Models: ChatModelInfo[] -> GET /v1/models ----------------------------- //

// One entry of the OpenAI models list. created is fixed (the catalog has no per-Provider creation time and
// Date.now() is forbidden in this pure module); owned_by is the constant 'wisp' — every model is a Wisp Provider.
type OAModel = { id: string; object: 'model'; created: number; owned_by: 'wisp' };
export type OAModelsList = { object: 'list'; data: OAModel[] };

// Build the GET /v1/models response from the ChatModelInfo[] buildChatModelInfos already produces (one
// entry per usable Provider). The Provider id (ChatModelInfo.id) is the model id the inbound `model` field
// then names. Alias names (#52) ride after the ids so pickers offer them; Family routes stay unlisted —
// they shadow claude-* names rather than adding new ones. Pure — created is a fixed 0, not a clock read.
export const buildModelsList = (infos: ChatModelInfo[], aliasNames: string[] = []): OAModelsList => ({
  object: 'list',
  data: [...infos.map((info) => info.id), ...aliasNames]
    .map((id) => ({ id, object: 'model' as const, created: 0, owned_by: 'wisp' as const })),
});

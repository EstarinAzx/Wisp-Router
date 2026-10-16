import {
  buildGeminiInteractionRequest, parseGeminiInteraction, GeminiInteractionError,
  type GeminiInteractionArgs, type GeminiInteractionResult,
} from './geminiInteractions';

// Same Retry-After units as quotaClient; no automatic POST retry is safe here.
const retryAfter = (raw: string | null): number | undefined => {
  if (!raw?.trim()) return undefined;
  const value = raw.trim();
  const ms = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000
    : /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(value) ? Date.parse(value) - Date.now() : NaN;
  return Number.isFinite(ms) ? Math.max(0, ms) : undefined;
};

export const requestGeminiInteraction = async (args: {
  request: GeminiInteractionArgs;
  apiKey: string;
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
}): Promise<GeminiInteractionResult> => {
  if (!args || typeof args !== 'object' || Reflect.ownKeys(args).some(key =>
    typeof key !== 'string' || !['request', 'apiKey', 'signal', 'fetch'].includes(key))) throw new GeminiInteractionError('invalid_request');
  const aborted = (): void => {
    if (args.signal?.aborted) throw new GeminiInteractionError('aborted');
  };
  aborted();
  let body: string;
  try { body = JSON.stringify(buildGeminiInteractionRequest(args.request)); }
  catch { throw new GeminiInteractionError('invalid_request'); }
  // Do not trim or send header delimiters, control bytes or non-ASCII secrets.
  if (typeof args.apiKey !== 'string' || !args.apiKey || /[^\x21-\x7e]/.test(args.apiKey)) throw new GeminiInteractionError('auth');
  let response: Response | undefined;
  let result: GeminiInteractionResult;
  try {
    aborted();
    response = await (args.fetch ?? globalThis.fetch)('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', headers: { 'x-goog-api-key': args.apiKey, 'content-type': 'application/json' },
      body, signal: args.signal, redirect: 'manual',
    });
    // Keep a received retry deadline even if cancellation raced the response headers.
    if (!response.ok || response.redirected) throw new GeminiInteractionError('http', response.status, retryAfter(response.headers.get('retry-after')));
    aborted();
    let value: unknown;
    try { value = await response.json(); }
    catch {
      aborted();
      throw new GeminiInteractionError('invalid_response');
    }
    aborted();
    // ponytail: buffer the whole result; incremental SSE needs lossless assembly before any tools execute.
    result = parseGeminiInteraction(value);
  } catch (error) {
    if (error instanceof GeminiInteractionError) throw error;
    aborted();
    // The upstream exception/body can contain credentials, prompts or thought signatures.
    throw new GeminiInteractionError('network');
  } finally {
    await response?.body?.cancel().catch(() => {});
  }
  aborted();
  return result;
};

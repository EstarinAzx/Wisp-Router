import OpenAI from 'openai';
import { EmptyResponsesOutputError } from './bridgeResponses';

// Only adapters holding a Response create this; provider prose is never status metadata.
export class DesktopUpstreamError extends Error {
  constructor(readonly status: number | undefined, readonly code: unknown = 'upstream_error') {
    super('Desktop provider request failed');
  }
}

export const desktopUpstreamFailure = (error: unknown) => {
  const trusted = error instanceof DesktopUpstreamError || error instanceof OpenAI.APIError;
  const candidate = trusted ? error.status : undefined;
  const status = typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : undefined;
  const known = ['invalid_request_error', 'invalid_api_key', 'authentication_error', 'permission_denied', 'model_not_found', 'context_length_exceeded', 'rate_limit_exceeded', 'insufficient_quota', 'server_error', 'stream_failed', 'stream_incomplete', 'stream_invalid', 'empty_output'];
  const code = error instanceof EmptyResponsesOutputError ? 'empty_output' : trusted && typeof error.code === 'string' && known.includes(error.code) ? error.code : 'upstream_error';
  const network = error instanceof OpenAI.APIConnectionError || (error instanceof TypeError && error.message === 'fetch failed');
  return {
    status: status ?? 502, code,
    message: status ? `Desktop provider rejected the request (HTTP ${status}; ${code})` : `Desktop provider request failed (${code})`,
    retryable: status !== undefined ? [429, 500, 502, 503, 504].includes(status) && code !== 'insufficient_quota' : network,
  };
};

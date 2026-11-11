// The panel can configure Bridge-only models; this policy gates native advertisement and delivery.
import { ANTIGRAVITY_MODELS, isAntigravityImageModel } from '@wisp/core';

export const antigravityNativeChatError = (model: string): string | undefined => {
  if (model.toLowerCase().includes('argon')) return 'Argon is not supported in native chat: its original encrypted conversation state requires Bridge Responses.';
  if (isAntigravityImageModel(model)) return 'This Antigravity model returns images, which Wisp native chat does not support. Choose a text model.';
  if (!ANTIGRAVITY_MODELS.includes(model)) return 'This Antigravity model is not yet qualified for native chat. Choose a supported text model or use its qualified Bridge route.';
  return undefined;
};

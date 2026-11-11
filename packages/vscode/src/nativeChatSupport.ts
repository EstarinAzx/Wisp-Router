// The panel can configure Bridge-only models; this policy gates native advertisement and delivery.
import { ANTIGRAVITY_MODELS, isAntigravityImageModel, isAntigravityArgonModel } from '@wisp/core';

export const antigravityNativeChatError = (model: string, hostVersion = ''): string | undefined => {
  if (isAntigravityArgonModel(model)) {
    const [major, minor, patch] = hostVersion.split('.').map(Number);
    return major > 1 || (major === 1 && (minor > 145 || (minor === 145 && patch >= 3)))
      ? undefined : 'Argon native chat requires VS Code 1.145.3 or newer to preserve its conversation state.';
  }
  if (model.toLowerCase().includes('argon')) return 'For Argon native chat, select gemini-4-argon-low, gemini-4-argon-medium or gemini-4-argon-high.';
  if (isAntigravityImageModel(model)) return 'This Antigravity model returns images, which Wisp native chat does not support. Choose a text model.';
  if (!ANTIGRAVITY_MODELS.includes(model)) return 'This Antigravity model is not yet qualified for native chat. Choose a supported text model or use its qualified Bridge route.';
  return undefined;
};

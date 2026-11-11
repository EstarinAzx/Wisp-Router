// The panel can configure Bridge-only models; this policy gates native advertisement and delivery.
import { isAntigravityImageModel } from '@wisp/core';

export const antigravityNativeChatError = (model: string, hostVersion = ''): string | undefined => {
  if (isAntigravityImageModel(model)) return 'This Antigravity model returns images, which Wisp native chat does not support. Choose a text model.';
  const [major, minor, patch] = hostVersion.split('.').map(Number);
  return major > 1 || (major === 1 && (minor > 145 || (minor === 145 && patch >= 3)))
    ? undefined : 'Antigravity native chat requires VS Code 1.145.3 or newer to preserve its conversation state.';
};

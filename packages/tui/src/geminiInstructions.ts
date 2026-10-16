import type { WispHome, GeminiInstructionPolicy } from '@wisp/core';
import { home } from './store';

export const geminiInstructionsResult = (args: string[], store: Pick<WispHome, 'readConfig' | 'writeConfig'> = home): { exitCode: number; lines: string[] } => {
  const mode = args[0] ?? 'status';
  if (args.length > 1 || !['strict', 'prepend-leading-developer-v1', 'status'].includes(mode)) return {
    exitCode: 1, lines: ['Usage: wisp gemini-instructions [strict|prepend-leading-developer-v1|status]'],
  };
  try {
    const cfg = store.readConfig();
    const policy = mode === 'status' ? cfg.bridge?.geminiApiInstructions ?? 'strict' : mode as GeminiInstructionPolicy;
    if (!['strict', 'prepend-leading-developer-v1'].includes(policy)) throw Error('Invalid Gemini instruction policy. Select strict or prepend-leading-developer-v1 explicitly.');
    if (mode !== 'status') store.writeConfig({ bridge: { ...cfg.bridge, geminiApiInstructions: policy } });
    return { exitCode: 0, lines: [`Gemini instructions: ${policy}`,
      'Gemini compatibility combines root and leading developer instructions into one system instruction. Their separate priority levels are not preserved. Positioned instructions remain unsupported.',
      'Strict mode refuses developer input. Start a new conversation after changing this setting. Gemini API uses separate API credentials and billing.'] };
  } catch (error) { return { exitCode: 1, lines: [`Could not update Gemini instructions: ${error instanceof Error ? error.message : String(error)}`] }; }
};

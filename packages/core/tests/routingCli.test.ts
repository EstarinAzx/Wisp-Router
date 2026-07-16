// ------------ routingCli.test.ts — routing CLI text and JSON snapshot behavior ------------ //

import { describe, expect, it } from 'vitest';
import { runRoutingCommand } from '../src/routingCli';
import type { RoutingMap } from '../src/routing';

const map: RoutingMap = {
  families: {
    opus: { providerId: 'codex', model: 'gpt-5.6-sol' },
    haiku: { providerId: 'opencode-go', model: 'minimax-m2.5' },
  },
  aliases: [
    { name: 'fast', target: { providerId: 'groq', model: 'llama-3.3-70b' } },
    { name: 'slashy', target: { providerId: 'openrouter', model: 'vendor/model' } },
  ],
};

describe('runRoutingCommand', () => {
  it('shows all family rows and every alias in stored order', () => {
    expect(runRoutingCommand([], map)).toEqual({
      lines: [
        'Family routes:',
        '  opus: codex/gpt-5.6-sol',
        '  sonnet: Active Provider (fallback)',
        '  haiku: opencode-go/minimax-m2.5',
        '  fable: Active Provider (fallback)',
        'Aliases:',
        '  fast: groq/llama-3.3-70b',
        '  slashy: openrouter/vendor/model',
      ],
      exitCode: 0,
    });
  });

  it('shows an empty alias section without hiding the four families', () => {
    const result = runRoutingCommand([], { families: {}, aliases: [] });
    expect(result.lines).toEqual([
      'Family routes:',
      '  opus: Active Provider (fallback)',
      '  sonnet: Active Provider (fallback)',
      '  haiku: Active Provider (fallback)',
      '  fable: Active Provider (fallback)',
      'Aliases:',
      '  (none)',
    ]);
  });

  it('returns the current RoutingMap shape unchanged as JSON', () => {
    const result = runRoutingCommand(['--json'], map);
    expect(result).toEqual({ lines: [JSON.stringify(map, null, 2)], exitCode: 0 });
    expect(JSON.parse(result.lines[0])).toEqual(map);
  });

  it('rejects unknown arguments with usage and a non-zero exit', () => {
    expect(runRoutingCommand(['--wat'], map)).toEqual({
      lines: ['Usage: wisp routing [--json]'],
      exitCode: 1,
    });
  });
});

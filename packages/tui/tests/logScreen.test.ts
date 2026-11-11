import { test, expect } from 'bun:test';
import { wrapWords } from '../src/widgets';

test('wrapWords keeps a long route line fully readable across rows', () => {
  const line = "[bridge] route family 'claude-opus-4-8' -> anthropic model=claude-opus-4-8[1m]";
  const rows = wrapWords(line, 40);
  expect(rows.length).toBeGreaterThan(1);
  expect(rows.every((r) => r.length <= 40)).toBe(true);
  // Word-wrap only splits on spaces, so rejoining with a space rebuilds the original line.
  expect(rows.join(' ')).toBe(line);
  expect(rows.join(' ')).toContain('model=claude-opus-4-8[1m]');
});

// ---------------- logScreen.test.ts — /show-log wrap + route-line colour classifier ---------------- //

/*
 * Depends on:
 *   - bun:test: the runner (outside the tsc include on purpose).
 *   - ../src/infoScreens: isRouteLogLine — pure prefix check for model-swap colour.
 *   - ../src/widgets: wrapWords — the same hand-wrap LogScreen uses so long route lines
 *     don't clip at the panel edge (the 2.0.23 screenshot failure mode).
 * Data shapes: none.
 */

import { test, expect } from 'bun:test';
import { isRouteLogLine } from '../src/infoScreens';
import { wrapWords } from '../src/widgets';

// ----------------------------------------- Route classifier ----------------------------------------- //

test('isRouteLogLine matches only bridge route lines', () => {
  expect(isRouteLogLine("[bridge] route family 'claude-opus-4-8' -> anthropic model=claude-opus-4-8")).toBe(true);
  expect(isRouteLogLine("[bridge] messages anthropic effort=xhigh (claude code) images=0")).toBe(false);
  expect(isRouteLogLine('[bridge] listening on 127.0.0.1:41184')).toBe(false);
  expect(isRouteLogLine('[bridge] error anthropic boom')).toBe(false);
  expect(isRouteLogLine('route family sneaky')).toBe(false);
});

// ----------------------------------------- Hand-wrap keeps the model id -------------------------- //

test('wrapWords keeps a long route line fully readable across rows', () => {
  const line = "[bridge] route family 'claude-opus-4-8' -> anthropic model=claude-opus-4-8[1m]";
  const rows = wrapWords(line, 40);
  expect(rows.length).toBeGreaterThan(1);
  expect(rows.every((r) => r.length <= 40)).toBe(true);
  // Word-wrap only splits on spaces, so rejoining with a space rebuilds the original line.
  expect(rows.join(' ')).toBe(line);
  expect(rows.join(' ')).toContain('model=claude-opus-4-8[1m]');
});

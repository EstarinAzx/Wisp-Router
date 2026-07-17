// ---------------- selectScrollDrag.test.ts — scrollbar drag on native selects (SELECT_MOUSE) ---------------- //

/*
 * Depends on:
 *   - bun:test: the runner (outside tsconfig include on purpose — no bun-types in the tsc gate).
 *   - @opentui/core + /testing: a real SelectRenderable driven through the real mouse pipeline.
 *   - ../src/widgets: SELECT_MOUSE — the spreadable handlers under test.
 * Data shapes: none.
 */

import { test, expect } from 'bun:test';
import { SelectRenderable } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import { SELECT_MOUSE } from '../src/widgets';

const ITEMS = Array.from({ length: 40 }, (_, i) => ({ name: `item ${i}`, description: '', value: i }));

// Build a renderer + an overflowing select with SELECT_MOUSE attached the same way the react
// reconciler does it: plain property assignment onto the renderable.
const setup = async () => {
  const { renderer, mockMouse, renderOnce } = await createTestRenderer({ width: 30, height: 10 });
  const sel = new SelectRenderable(renderer, {
    width: 30,
    height: 10,
    options: ITEMS,
    showScrollIndicator: true,
  });
  Object.assign(sel, SELECT_MOUSE);
  renderer.root.add(sel);
  await renderOnce();
  return { sel, mockMouse, renderer };
};

test('dragging the scrollbar column moves the selection', async () => {
  const { sel, mockMouse, renderer } = await setup();
  // Track spans rows 1..height-1 at the last column; drag top → bottom must land on the last item.
  await mockMouse.drag(29, 1, 29, 9);
  expect(sel.getSelectedIndex()).toBe(ITEMS.length - 1);
  renderer.destroy();
});

test('dragging over the list body (not the scrollbar) leaves the selection alone', async () => {
  const { sel, mockMouse, renderer } = await setup();
  await mockMouse.drag(5, 2, 5, 8);
  expect(sel.getSelectedIndex()).toBe(0);
  renderer.destroy();
});

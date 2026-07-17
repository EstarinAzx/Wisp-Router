// ---------------- selectScrollDrag.test.ts — scrollbar drag on native selects (SELECT_MOUSE) ---------------- //

/*
 * Depends on:
 *   - bun:test: the runner (outside tsconfig include on purpose — no bun-types in the tsc gate).
 *   - @opentui/core + /testing: a real SelectRenderable driven through the real mouse pipeline.
 *   - ../src/widgets: SELECT_MOUSE — the spreadable handlers under test.
 * Data shapes: none.
 */

import { test, expect } from 'bun:test';
import { SelectRenderable, BoxRenderable } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import { SELECT_MOUSE } from '../src/widgets';

const ITEMS = Array.from({ length: 40 }, (_, i) => ({ name: `item ${i}`, description: '', value: i }));

// Build a renderer + an overflowing select with SELECT_MOUSE attached the same way the react
// reconciler does it: plain property assignment onto the renderable. A sibling box sits below
// the select so off-widget drags land on a real renderable (like the app's panel chrome).
const setup = async () => {
  const { renderer, mockMouse, renderOnce } = await createTestRenderer({ width: 40, height: 14 });
  const sel = new SelectRenderable(renderer, {
    width: 30,
    height: 10,
    options: ITEMS,
    showScrollIndicator: true,
  });
  Object.assign(sel, SELECT_MOUSE);
  renderer.root.add(sel);
  renderer.root.add(new BoxRenderable(renderer, { width: 40, height: 4 }));
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

test('pressing a row selects it; body drags do not scrub like the scrollbar', async () => {
  const { sel, mockMouse, renderer } = await setup();
  // down on item 1's row (2 rows per item) selects it; the drag away must not keep scrubbing
  await mockMouse.drag(5, 2, 5, 8);
  expect(sel.getSelectedIndex()).toBe(1);
  renderer.destroy();
});

test('a drag that leaves the select keeps tracking until release', async () => {
  const { sel, mockMouse, renderer } = await setup();
  // Fast flick: press on the thumb column, first drag event already over the sibling box below.
  // Without renderer capture at mousedown, that event binds the drag to the box and the whole
  // gesture goes dead.
  await mockMouse.pressDown(29, 1);
  await mockMouse.emitMouseEvent('drag', 20, 12);
  await mockMouse.release(20, 12);
  expect(sel.getSelectedIndex()).toBe(ITEMS.length - 1);
  renderer.destroy();
});

test('the column left of the thumb also starts a drag (2-cell grab zone)', async () => {
  const { sel, mockMouse, renderer } = await setup();
  await mockMouse.drag(28, 1, 28, 9);
  expect(sel.getSelectedIndex()).toBe(ITEMS.length - 1);
  renderer.destroy();
});

test('mouse wheel over the list steps the selection', async () => {
  const { sel, mockMouse, renderer } = await setup();
  await mockMouse.scroll(15, 5, 'down');
  await mockMouse.scroll(15, 5, 'down');
  expect(sel.getSelectedIndex()).toBe(2);
  await mockMouse.scroll(15, 5, 'up');
  expect(sel.getSelectedIndex()).toBe(1);
  renderer.destroy();
});

test('clicking a row selects it', async () => {
  const { sel, mockMouse, renderer } = await setup();
  // descriptions on → 2 rows per item; y=4 is item 2's name row
  await mockMouse.click(5, 4);
  expect(sel.getSelectedIndex()).toBe(2);
  renderer.destroy();
});

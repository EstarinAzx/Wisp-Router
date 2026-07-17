// ---------------- logBuffer.test.ts — Bridge log ring buffer + Log Screen follow/pause (#122) ---------------- //

/*
 * Depends on:
 *   - bun:test: the runner (outside the tsc include on purpose — no bun-types in the tsc gate).
 *   - ../src/logBuffer: the ring buffer under test.
 *   - @opentui/core + /testing: a real ScrollBoxRenderable driven through the real mouse
 *     pipeline — the Log Screen's follow/pause is scrollbox stickyScroll, so the behavior is
 *     asserted on the same renderable the Screen mounts.
 * Data shapes: none.
 */

import { test, expect } from 'bun:test';
import { ScrollBoxRenderable, TextRenderable } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import { createRingLog, LOG_CAP } from '../src/logBuffer';

// ----------------------------------------- Ring buffer ----------------------------------------- //

test('collects lines in order', () => {
  const log = createRingLog();
  log.push('a'); log.push('b'); log.push('c');
  expect([...log.lines()]).toEqual(['a', 'b', 'c']);
});

test('caps at the limit, trimming from the front', () => {
  const log = createRingLog(4);
  for (const l of ['1', '2', '3', '4', '5', '6']) log.push(l);
  expect([...log.lines()]).toEqual(['3', '4', '5', '6']);
});

test('default cap is ~500', () => {
  expect(LOG_CAP).toBe(500);
  const log = createRingLog();
  for (let i = 0; i < 600; i++) log.push(`line ${i}`);
  expect(log.lines().length).toBe(500);
  expect(log.lines()[0]).toBe('line 100');
});

test('subscribers fire per push; unsubscribe stops them', () => {
  const log = createRingLog();
  let calls = 0;
  const off = log.subscribe(() => calls++);
  log.push('a'); log.push('b');
  expect(calls).toBe(2);
  off();
  log.push('c');
  expect(calls).toBe(2);
});

// ----------------------------------------- Follow / pause ----------------------------------------- //

// The Log Screen's auto-follow is scrollbox stickyScroll+stickyStart:bottom — assert that
// contract on a real renderer so an @opentui bump that breaks it fails here, not in the field.
const setup = async () => {
  const { renderer, mockMouse, renderOnce } = await createTestRenderer({ width: 40, height: 14 });
  const sb = new ScrollBoxRenderable(renderer, {
    width: 30, height: 8, stickyScroll: true, stickyStart: 'bottom', scrollY: true,
  });
  renderer.root.add(sb);
  let n = 0;
  const addLines = (count: number) => {
    for (let i = 0; i < count; i++) sb.add(new TextRenderable(renderer, { content: `line ${n++}` }));
  };
  const atBottom = () => sb.scrollTop >= sb.scrollHeight - sb.viewport.height;
  return { sb, mockMouse, renderOnce, renderer, addLines, atBottom };
};

test('auto-follows: new lines keep the bottom visible', async () => {
  const { sb, renderOnce, renderer, addLines, atBottom } = await setup();
  addLines(20); await renderOnce();
  expect(sb.scrollTop).toBeGreaterThan(0);
  expect(atBottom()).toBe(true);
  const before = sb.scrollTop;
  addLines(5); await renderOnce();
  expect(sb.scrollTop).toBeGreaterThan(before); // followed the new lines down
  expect(atBottom()).toBe(true);
  renderer.destroy();
});

test('scrolling up pauses following', async () => {
  const { sb, mockMouse, renderOnce, renderer, addLines, atBottom } = await setup();
  addLines(20); await renderOnce();
  await mockMouse.scroll(10, 4, 'up');
  await mockMouse.scroll(10, 4, 'up');
  const paused = sb.scrollTop;
  expect(atBottom()).toBe(false);
  addLines(5); await renderOnce();
  expect(sb.scrollTop).toBe(paused); // new lines must NOT drag the view down
  renderer.destroy();
});

test('returning to the bottom resumes following', async () => {
  const { sb, mockMouse, renderOnce, renderer, addLines, atBottom } = await setup();
  addLines(20); await renderOnce();
  await mockMouse.scroll(10, 4, 'up');
  // wheel back down until the bottom re-engages sticky
  for (let i = 0; i < 10 && !atBottom(); i++) await mockMouse.scroll(10, 4, 'down');
  expect(atBottom()).toBe(true);
  addLines(5); await renderOnce();
  expect(atBottom()).toBe(true); // following again
  renderer.destroy();
});

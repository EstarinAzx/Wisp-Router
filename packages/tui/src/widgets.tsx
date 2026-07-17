// ---------------- widgets.tsx — cross-flow UI building blocks: word-wrap + the wrapping select ---------------- //

/*
 * Depends on:
 *   - react: WrapSelect's selection/window state.
 *   - @opentui/react: text/box intrinsics + useKeyboard for the select's Up/Down/Enter.
 *   - ./theme: ACCENT/DIM — the widgets follow the shared look.
 *
 * Data shapes:
 *   - WrapOption: one selectable row — name + description + value.
 *
 * Extracted from app.tsx with #116: these are components (reusable building blocks), not
 * Screens — every flow module shares them.
 */

import { useRef, useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { ACCENT, DIM } from './theme';

// ----------------------------------------- Submit adapter ----------------------------------------- //

// opentui's JSX inherits React's DOM intrinsics, so onSubmit must also satisfy the DOM form
// signature — take unknown and keep only the string opentui actually sends. Moved from the
// shell with #117 — every flow's inputs share it.
export const onSubmitText = (handle: (value: string) => void) => (value: unknown) => {
  if (typeof value === 'string') handle(value);
};

// ----------------------------------------- Word wrap ----------------------------------------- //

// opentui's own wrapMode="wrap" overlays every row that follows the wrapped one (the garble the
// PANEL note describes), so long chrome copy is wrapped BY HAND: plain word-wrap into separate
// non-wrapping rows sized to the live terminal width. A word longer than a line hard-splits.
export const wrapWords = (text: string, cols: number): string[] => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    for (let rest = word; ; ) {
      const candidate = line ? `${line} ${rest}` : rest;
      if (candidate.length <= cols) { line = candidate; break; }
      if (line) { lines.push(line); line = ''; continue; }
      lines.push(rest.slice(0, cols));
      rest = rest.slice(cols);
    }
  }
  if (line) lines.push(line);
  return lines;
};

// ----------------------------------------- WrapSelect ----------------------------------------- //

// A select whose option DESCRIPTIONS wrap — the native select renderable hard-clips its rows,
// so this renders plain non-wrapping rows itself (name + hand-wrapped description lines) with a
// windowed view: variable-height items, selection kept visible within maxRows, dim "… N more"
// marker rows when clipped. Keyboard mirrors the native select: Up/Down (wrapping), Enter fires.
export type WrapOption = { name: string; description: string; value: string };
export const WrapSelect = ({ options, cols, maxRows, onSelect }: {
  options: WrapOption[];
  cols: number;
  maxRows: number;
  onSelect: (index: number, option: WrapOption) => void;
}) => {
  const [idx, setIdx] = useState(0);
  const top = useRef(0); // first visible item — persisted across renders, adjusted below
  // sel clamps a stale index (options can shrink under a reused instance) — used everywhere.
  const sel = Math.min(idx, options.length - 1);
  useKeyboard((key) => {
    if (key.name === 'up') setIdx((options.length + sel - 1) % options.length);
    else if (key.name === 'down') setIdx((sel + 1) % options.length);
    else if (key.name === 'return' || key.name === 'enter') onSelect(sel, options[sel]);
  });
  const items = options.map((o) => ({ o, lines: [o.name, ...wrapWords(o.description, cols - 1)] }));
  const rowsOf = (from: number, to: number) => items.slice(from, to + 1).reduce((n, it) => n + it.lines.length, 0);
  // Window: pull the view up to the selection, else push it down until the selection fits.
  if (sel < top.current) top.current = sel;
  while (rowsOf(top.current, sel) > maxRows && top.current < sel) top.current++;
  // Fill downward until the row budget is spent (the selected item always shows, however tall).
  let end = top.current;
  for (let used = 0; end < items.length && (end === top.current || used + items[end].lines.length <= maxRows); end++)
    used += items[end].lines.length;
  return (
    <box flexDirection="column">
      {top.current > 0 && <text wrapMode="none" flexShrink={0} fg={DIM}>{`  … ${top.current} more`}</text>}
      {items.slice(top.current, end).flatMap(({ lines }, k) => {
        const i = top.current + k;
        const on = i === sel;
        return lines.map((l, j) => (
          <text key={`${i}:${j}`} wrapMode="none" flexShrink={0} bg={on ? '#27272a' : undefined} fg={j === 0 ? (on ? ACCENT : undefined) : DIM}>
            {` ${l}`}
          </text>
        ));
      })}
      {end < items.length && <text wrapMode="none" flexShrink={0} fg={DIM}>{`  … ${items.length - end} more`}</text>}
    </box>
  );
};

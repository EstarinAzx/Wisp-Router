#!/usr/bin/env bun
// ------------- index.tsx — wisp entry: `wisp serve` headless, else boot the renderer + TUI ------------- //
/*
 * Depends on:
 *   - ./serve: the headless Bridge host (#63).
 *   - @opentui/core + @opentui/react + ./app: the TUI face.
 * Data shapes: none.
 */

// Branch before any renderer work; both sides import lazily so `wisp serve` never touches the
// native (Zig) renderer and the TUI never pays for the serve path.
if (process.argv[2] === 'serve') {
  const { runServe } = await import('./serve');
  await runServe();
} else {
  const { createCliRenderer } = await import('@opentui/core');
  const { createRoot } = await import('@opentui/react');
  const { App } = await import('./app');
  const renderer = await createCliRenderer();
  createRoot(renderer).render(<App />);
}

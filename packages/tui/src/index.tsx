#!/usr/bin/env bun
// -------- index.tsx — wisp entry: serve / routing / claude-wisp / TUI dispatch -------- //
/*
 * Depends on:
 *   - ./serve: the headless Bridge host (#63).
 *   - ./routingCli: the renderer-free Routing snapshot/write command (#108).
 *   - ./claude-wisp: the Claude Code launcher (#64) — reached via `wisp claude-wisp …` (#67).
 *   - @opentui/core + @opentui/react + ./app: the TUI face.
 * Data shapes: none.
 */

// Branch before any renderer work; every side imports lazily so `wisp serve` never touches the
// native (Zig) renderer and the TUI never pays for the serve path. The compiled release binary
// is this ONE entry — the npm `claude-wisp` shim invokes it as `wisp claude-wisp …` (#67).
if (process.argv[2] === 'serve') {
  const { runServe } = await import('./serve');
  await runServe();
} else if (process.argv[2] === 'routing') {
  const { runRoutingCli } = await import('./routingCli');
  process.exitCode = await runRoutingCli(process.argv.slice(3));
} else if (process.argv[2] === 'claude-wisp') {
  // Drop the dispatch token so the launcher's verbatim argv contract (argv.slice(2) → claude) holds.
  process.argv.splice(2, 1);
  await import('./claude-wisp');
} else {
  const { createCliRenderer } = await import('@opentui/core');
  const { createRoot } = await import('@opentui/react');
  const { App } = await import('./app');
  const renderer = await createCliRenderer();
  createRoot(renderer).render(<App />);
}

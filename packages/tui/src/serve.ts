// ---------------- serve.ts — `wisp serve`: the Bridge headless, no screen drawn ---------------- //

/*
 * Depends on:
 *   - ./bridge: the TUI's engine wiring (createTuiBridge, ensureBridgeSecret, addresses).
 *
 * Data shapes: none.
 *
 * No daemon, no pids — this IS the wisp process, just without a face (#63). The HTTP listener
 * keeps the event loop alive; Ctrl+C is the stop switch.
 */

import { createTuiBridge, ensureBridgeSecret, bridgeAddress, bridgePort } from './bridge';

// ----------------------------- Run ----------------------------- //

export const runServe = async (): Promise<void> => {
  const bridge = createTuiBridge((m) => console.log(m));
  try {
    await bridge.start();
  } catch (err) {
    // A port collision is the expected failure: the extension (or another wisp) already hosts on the
    // shared port. Fail loud, never port-hop — a second port would split clients across two hosts.
    // Bun words the bind error "Is port … in use?" without an EADDRINUSE code, hence the message probe.
    const message = err instanceof Error ? err.message : String(err);
    console.error((err as { code?: string }).code === 'EADDRINUSE' || /EADDRINUSE|in use/i.test(message)
      ? `Bridge port ${bridgePort()} is already in use — is VS Code (or another wisp) already hosting the Bridge?`
      : `Bridge failed to start: ${message}`);
    process.exit(1);
  }
  console.log('');
  console.log(`  OpenAI door:    ${bridgeAddress()}/v1`);
  console.log(`  Anthropic door: ${bridgeAddress()}  (Claude Code: ANTHROPIC_BASE_URL)`);
  console.log(`  Access secret:  ${ensureBridgeSecret()}`);
  console.log('');
  console.log('  Ctrl+C to stop.');

  const shutdown = (): void => { bridge.stop(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

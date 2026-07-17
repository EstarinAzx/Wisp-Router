// ---------------- span-baseline.tsx — the TUI split's gate: span baseline + drift check for every Screen ---------------- //

/*
 * Depends on:
 *   - @opentui/react/test-utils + @opentui/core/testing: headless render of <App/> + mock keyboard.
 *   - @wisp/core: PROVIDERS — to scrub every apiKeyEnv from the environment for determinism.
 *   - node fs/os/path/url: sandbox WISP_HOME + the baseline JSON beside this script.
 *   - ../src/app + ../src/store: imported DYNAMICALLY — WispHome captures its dir at construction,
 *     so WISP_HOME must point at the sandbox before either module loads.
 *
 * Data shapes:
 *   - Baseline: { [scenario]: string[] } — one serialized span-line array per captured Screen.
 *
 * Usage:  bun scripts/span-baseline.tsx            → diff against span-baseline.json, exit 1 on drift
 *         bun scripts/span-baseline.tsx --update   → recapture the baseline (only for a WANTED look change)
 *
 * One dev script, not a test framework (#115). Every render is deterministic: fixed 100x40 frame,
 * sandboxed store, stubbed network, stubbed OAuth sign-in, provider env keys scrubbed.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { act as reactAct } from 'react';
import { PROVIDERS } from '@wisp/core';
import { testRender } from '@opentui/react/test-utils';
import type { TestRendererSetup } from '@opentui/core/testing';

// ----------------------------------------- Sandbox ----------------------------------------- //

// Sandbox WISP_HOME with representative payloads: a keyed Provider (stored key), a signed-in OAuth
// Provider, a routed Family, one Alias, a fixed bridge port + secret. Real ~/.wisp is never touched.
const sandbox = mkdtempSync(join(tmpdir(), 'wisp-span-'));
process.env.WISP_HOME = sandbox;

// Env keys leak real machine state into keyStatus rows — scrub every catalog env var.
for (const p of PROVIDERS) if (p.apiKeyEnv) delete process.env[p.apiKeyEnv];

writeFileSync(join(sandbox, 'config.json'), JSON.stringify({
  provider: 'opencode-go',
  bridge: { port: 47831 },
  routing: {
    families: { opus: { providerId: 'opencode-go', model: 'minimax-m3' } },
    aliases: [{ name: 'fast', target: { providerId: 'opencode-go', model: 'minimax-m3' } }],
  },
}));
writeFileSync(join(sandbox, 'auth.json'), JSON.stringify({
  keys: { 'opencode-go': 'span-baseline-key' },
  anthropic: { accessToken: 'span-baseline-token' },
  bridgeSecret: 'span-baseline-secret',
}));

// ----------------------------------------- Network stub ----------------------------------------- //

// holdModels lets a scenario freeze the *-loading Screens open, then release into the pick Screen.
let holdModels: Promise<void> | null = null;
let releaseModels: () => void = () => {};
const gateModels = () => { holdModels = new Promise((r) => { releaseModels = () => { holdModels = null; r(); }; }); };

const SSE_REPLY = 'data: {"choices":[{"delta":{"content":"Stub reply."}}]}\n\ndata: [DONE]\n\n';

globalThis.fetch = (async (input: unknown) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.endsWith('/models')) {
    if (holdModels) await holdModels;
    return Response.json({ data: [{ id: 'stub-model-a' }, { id: 'stub-model-b' }] });
  }
  if (url.endsWith('/chat/completions')) {
    return new Response(
      new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(SSE_REPLY)); c.close(); } }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    );
  }
  // models.dev and anything unplanned fail hard into the callers' catch paths — never the real net.
  throw new Error(`span-baseline: unexpected fetch ${url}`);
}) as typeof fetch;

// ----------------------------------------- App under test ----------------------------------------- //

// Dynamic imports: only now is WISP_HOME safe to capture.
const store = await import('../src/store');
const { App } = await import('../src/app');

// The signin-wait Screen parks on a pending browser flow — stub every manager so no browser opens.
const neverSignIn = () => new Promise<never>(() => {});
(store.codexAuth as { signIn: () => Promise<unknown> }).signIn = neverSignIn;
(store.anthropicAuth as { signIn: () => Promise<unknown> }).signIn = neverSignIn;
(store.xaiAuth as { signIn: () => Promise<unknown> }).signIn = neverSignIn;

// ----------------------------------------- Capture machinery ----------------------------------------- //

type Frame = ReturnType<TestRendererSetup['captureSpans']>;

// One span line = every span's text + exact fg/bg ints + attributes — byte-for-byte look identity.
const frameToLines = (f: Frame): string[] =>
  f.lines.map((line) =>
    line.spans.map((s) => `[${s.text}|fg:${s.fg.toInts().join(',')}|bg:${s.bg.toInts().join(',')}|a:${s.attributes}]`).join(''));

const baselinePath = join(dirname(fileURLToPath(import.meta.url)), 'span-baseline.json');
const update = process.argv.includes('--update');

// kittyKeyboard: a legacy lone-ESC byte is an ambiguous sequence prefix the parser sits on —
// kitty encoding makes Esc land as a real keypress.
const setup = await testRender(<App />, { width: 100, height: 40, kittyKeyboard: true });
const { mockInput, waitForFrame } = setup;

const frames: Record<string, string[]> = {};
const snap = (name: string) => { frames[name] = frameToLines(setup.captureSpans()); };

// Wait until the Screen's marker text is on screen, then record it under the scenario name.
const see = async (marker: string, name: string) => { await waitForFrame((f) => f.includes(marker), { maxPasses: 200 }); snap(name); console.log(`  ✓ ${name}`); };

// Self-verifying keypresses. testRender turns on React's act environment, which DEFERS state
// updates fired outside act() — an Enter that setModes would never paint. So every press runs
// inside act, then waits until the SPAN frame (colors included — a moved selection bar counts)
// visibly changes, repeating the press if the idle parser swallowed it.
const spanFrame = () => frameToLines(setup.captureSpans()).join('\n');
const press = async (action: () => void, what: string) => {
  const before = spanFrame();
  for (let i = 0; i < 5; i++) {
    reactAct(() => { action(); });
    try { await setup.waitFor(() => spanFrame() !== before, { maxPasses: 30 }); return; } catch { /* swallowed — press again */ }
  }
  throw new Error(`${what}: no visible effect after 5 presses`);
};
const esc = () => press(() => mockInput.pressEscape(), 'esc');
const enter = () => press(() => mockInput.pressEnter(), 'enter');
const arrow = (direction: 'up' | 'down') => press(() => mockInput.pressArrow(direction), `arrow-${direction}`);

// Type a palette command, verify it landed in the input, submit it.
const run = async (command: string) => {
  await reactAct(async () => { await mockInput.typeText(command); });
  await waitForFrame((f) => f.includes(command), { maxPasses: 30 });
  await enter();
};

// ----------------------------------------- Scenario script ----------------------------------------- //

// Drives every Mode kind through the real palette + keyboard, exactly as a user would.
// Ordering matters: /bridge runs LAST — its green header badge would otherwise ride into every
// later capture.

await see('Type / for commands', 'input');

// palette with the suggestion list open
await reactAct(async () => { await mockInput.typeText('/'); });
await see('/providers', 'input-suggestions');
await press(() => mockInput.pressBackspace(), 'backspace');

// /providers list + both menu payload kinds (keyed row with stored key, OAuth row signed in)
await run('/providers');
await see('(active)', 'providers');
await enter();
await see('Use as Active Provider', 'provider-menu-keyed');
await esc();
await see('(active)', 'providers-return');
for (let i = 0; i < 3; i++) await arrow('down');
await enter();
await see('browser flow', 'provider-menu-oauth');
await esc();
await esc();

// /key: picker + masked entry
await run('/key');
await see('Set key for', 'key-pick');
await esc();
await run('/key openai');
await see('API key', 'key-entry');
await reactAct(async () => { await mockInput.typeText('secret123'); });
await see('•••••••••', 'key-entry-typed');
await esc();

// /model: loading (gate held) → pick (gate released) → free text (Custom has no list)
gateModels();
await run('/model');
await see('Fetching models', 'model-loading');
releaseModels();
await see('stub-model-a', 'model-pick');
await esc();
await run('/model custom');
await see('no live list', 'model-free');
await esc();

// /signin: OAuth target pick → the parked wait Screen (sign-in stubbed pending)
await run('/signin');
await see('Sign in to', 'oauth-pick');
await enter();
await see('Browser opened', 'signin-wait');
await esc();

// /effort ladder
await run('/effort');
await see('Reasoning Effort', 'effort-pick');
await esc();

// /test: done (stub SSE reply) and error (Custom has no base URL) phases
await run('/test opencode-go');
await see('Esc to close', 'test-done');
await esc();
await run('/test custom');
await see('no base URL', 'test-error');
await esc();

// /routing chain: overview → families section → row picker → model loading/pick/free
await run('/routing');
await see('Routing map', 'routing');
await enter();
await see('Bind Claude subscription models', 'routing-families');
await enter();
await see('Route opus via', 'route-provider-family');
gateModels();
await enter();
await see('Fetching models', 'route-model-loading');
releaseModels();
await see('stub-model-a', 'route-model-pick');
await esc();
await enter();
await see('Route opus via', 'route-provider-family-again');
await arrow('up'); // wraps to Clear route
await arrow('up'); // Custom
await enter();
await see('no live list', 'route-model-free');
await esc();

// aliases section: existing alias row (rename verbs) + rename + add-alias naming
await esc();
await see('Routing map', 'routing-back');
await arrow('down');
await enter();
await see('Add alias', 'routing-aliases');
await enter();
await see('Rename alias', 'route-provider-alias');
await enter();
await see('Rename alias fast', 'alias-rename');
await esc();
await see('Add alias', 'routing-aliases-back');
await arrow('down');
await enter();
await see('New alias name', 'alias-name');
await esc();
await esc();
await esc();

// /help registry list
await run('/help');
await see('Commands', 'help');
await esc();

// /bridge last — the header badge stays up once the listener binds
await run('/bridge');
await see('Access secret', 'bridge');

// ----------------------------------------- Baseline write / diff ----------------------------------------- //

let failed = false;
if (update) {
  writeFileSync(baselinePath, JSON.stringify(frames, null, 1));
  console.log(`baseline updated: ${Object.keys(frames).length} Screens → ${baselinePath}`);
} else {
  let baseline: Record<string, string[]>;
  try { baseline = JSON.parse(readFileSync(baselinePath, 'utf8')); }
  catch { console.error(`no baseline at ${baselinePath} — run with --update first`); process.exit(2); }
  const names = new Set([...Object.keys(baseline), ...Object.keys(frames)]);
  for (const name of names) {
    const want = baseline[name];
    const got = frames[name];
    if (!want) { console.error(`DRIFT ${name}: Screen not in baseline`); failed = true; continue; }
    if (!got) { console.error(`DRIFT ${name}: Screen no longer captured`); failed = true; continue; }
    if (want.length !== got.length) { console.error(`DRIFT ${name}: ${want.length} → ${got.length} lines`); failed = true; continue; }
    const bad = want.findIndex((l, i) => l !== got[i]);
    if (bad !== -1) {
      console.error(`DRIFT ${name}: line ${bad}\n  baseline: ${want[bad]}\n  current:  ${got[bad]}`);
      failed = true;
    }
  }
  console.log(failed ? 'span drift detected' : `all ${names.size} Screens match the baseline`);
}

setup.renderer.destroy();
rmSync(sandbox, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

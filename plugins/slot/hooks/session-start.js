// ------------- session-start.js — announce Wisp bridging to the session ------------- //

/*
Depends on:
  node:fs — existence checks + config read
  node:os — home dir resolution
  node:path — path joins
  node:child_process — one `wisp routing --json` snapshot spawn

Data shapes:
  RoutingMap — { families: { [family]: { providerId, model } }, aliases: [...] }
  config.json — { routing: RoutingMap, snapshots: { [row]: { providerId, model } | null } }
*/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

// ------------------------------- Bridged detection ------------------------------- //

// WISP_HOME override honored (TUI convention); default ~/.wisp.
const wispHome = process.env.WISP_HOME || path.join(os.homedir(), '.wisp');

// Bridged = env points somewhere AND a Wisp home exists — the env var alone
// would also match foreign proxies (corporate gateways, LiteLLM).
const bridged = !!process.env.ANTHROPIC_BASE_URL && fs.existsSync(wispHome);
if (!bridged) process.exit(0);

// ------------------------------- Context assembly ------------------------------- //

const lines = [];

lines.push('WISP BRIDGE ACTIVE — this session routes through the Wisp Bridge.');
lines.push('Claude family names (haiku / sonnet / opus / fable) resolve through the');
lines.push('Wisp Routing map on EVERY request — they may not be real Anthropic models.');

// Routing snapshot — fail-soft: an old global opens the TUI instead (killed by
// the timeout) and a missing one throws; either way the rest still prints.
try {
  const out = execSync('wisp routing --json', {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (out.startsWith('{')) {
    const families = JSON.parse(out).families || {};
    const rows = Object.entries(families).map(
      ([fam, t]) => `  ${fam} -> ${t.providerId}/${t.model}`
    );
    if (rows.length) lines.push('', 'Current family routes:', ...rows);
  }
} catch {
  // snapshot skipped — the cheat sheet below lets the session query live state
}

lines.push(
  '',
  'Headless Wisp CLI (query live state any time):',
  '  wisp routing [--json]        current family routes + aliases',
  '  wisp providers               provider ids + labels',
  '  wisp models <provider>       model ids for one provider',
);

// Held snapshot = a previous Slot rebind never reverted — slot skill "Recovery" applies.
// Held rows live in the Wisp snapshot store (~/.wisp/config.json `snapshots`), keyed by
// family/alias name; a held Family snapshot means its route may still be rebound.
let held = [];
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(wispHome, 'config.json'), 'utf8'));
  held = Object.entries(cfg.snapshots || {});
} catch {}
if (held.length) {
  lines.push(
    '',
    `WARNING: ${held.length} held Snapshot(s) in the Wisp store — a family route may`,
    'still be rebound. Recover each (slot skill, "Recovery") before rebinding that family:',
  );
  for (const [row, entry] of held) {
    lines.push(`  ${row} -> ${entry ? `${entry.providerId}/${entry.model}` : 'unset'}`);
  }
}

process.stdout.write(lines.join('\n') + '\n');

// ---------------- wisp-statusline.js — Wisp badge for a composed statusline ---------------- //

/*
Depends on:
  node:fs — stdin read, config + lease existence/reads
  node:os — home dir resolution
  node:path — path joins

Data shapes:
  stdin — Claude Code statusline JSON; model at { model: { id, display_name } }
  config.json — { routing: { families: { [family]: { providerId, model } } }, ... }
*/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ------------------------------- Bridged detection ------------------------------- //

const wispHome = process.env.WISP_HOME || path.join(os.homedir(), '.wisp');

// Same two-part check as the SessionStart hook; unbridged sessions get no badge.
if (!process.env.ANTHROPIC_BASE_URL || !fs.existsSync(wispHome)) process.exit(0);

// --------------------------------- Badge assembly --------------------------------- //

// Resolve the session's family live from config on every refresh, so a
// mid-session Slot rebind shows up on the next repaint. Any failure along the
// way degrades to the bare badge rather than lying.
let badge = '[WISP]';
try {
  const stdin = JSON.parse(fs.readFileSync(0, 'utf8'));
  const name = `${stdin.model?.id || ''} ${stdin.model?.display_name || ''}`.toLowerCase();
  const family = ['haiku', 'sonnet', 'opus', 'fable'].find((f) => name.includes(f));
  if (family) {
    const cfg = JSON.parse(fs.readFileSync(path.join(wispHome, 'config.json'), 'utf8'));
    const target = cfg.routing?.families?.[family];
    if (target?.model) badge = `[WISP ${family}→${target.model}]`;
  }
} catch {}

// Lease marker rides on any badge form — visibility must not depend on the model
// match. ASCII on purpose: wide ⚠ glyphs overlap the next cell in some terminals.
const leasePath = path.join(os.homedir(), '.claude', 'slot', 'lease.json');
if (fs.existsSync(leasePath)) badge = badge.replace(/\]$/, ' !LEASE]');

// Wisp cyan — joins the colored badge row (caveman orange, elucidate purple, ponytail pink).
process.stdout.write(`\x1b[38;5;87m${badge}\x1b[0m`);

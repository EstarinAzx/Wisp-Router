// ---------------- wisp-statusline.js — Wisp badge for a composed statusline ---------------- //

/*
Depends on:
  node:fs — stdin read, config reads
  node:os — home dir resolution
  node:path — path joins

Data shapes:
  stdin — Claude Code statusline JSON; model at { model: { id, display_name } }
  config.json — { routing: { families: { [family]: { providerId, model } } },
                  snapshots: { [row]: { providerId, model } | null }, ... }
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
// mid-session Slot rebind shows up on the next repaint. The held-Snapshot count
// comes from the same config read (the Wisp snapshot store). Any failure along
// the way degrades to the bare badge rather than lying.
let badge = '[WISP]';
let heldCount = 0;
try {
  const stdin = JSON.parse(fs.readFileSync(0, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(wispHome, 'config.json'), 'utf8'));
  heldCount = Object.keys(cfg.snapshots || {}).length;
  const name = `${stdin.model?.id || ''} ${stdin.model?.display_name || ''}`.toLowerCase();
  const family = ['haiku', 'sonnet', 'opus', 'fable'].find((f) => name.includes(f));
  const target = family && cfg.routing?.families?.[family];
  if (target?.model) badge = `[WISP ${family}→${target.model}]`;
} catch {}

// Snapshot marker rides on any badge form — visibility must not depend on the model
// match. ASCII on purpose: wide ⚠ glyphs overlap the next cell in some terminals.
if (heldCount) badge = badge.replace(/\]$/, heldCount > 1 ? ` !SNAP×${heldCount}]` : ' !SNAP]');

// Wisp purple — the signature accent (#a78bfa in the TUI theme; xterm 141 is the nearest
// 256-color). Joins the colored badge row (caveman orange, elucidate purple, ponytail pink).
process.stdout.write(`\x1b[38;5;141m${badge}\x1b[0m`);

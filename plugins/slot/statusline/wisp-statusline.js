// ---------------- wisp-statusline.js — Wisp block for a composed statusline ---------------- //

/*
Depends on:
  node:fs — stdin read, config reads
  node:os — home dir resolution
  node:path — path joins

Data shapes:
  stdin — Claude Code statusline JSON; model at { model: { id, display_name } }
  config.json — { routing: { families: { [family]: { providerId, model } },
                             aliases: [{ name, target: { providerId, model } }] },
                  snapshots: { [row]: { providerId, model } | null }, ... }
  status.json — the Bridge's per-turn snapshot (#171):
                { updatedAt, providerId, model, contextTokens?, contextWindow?,
                  contextPercent?, meters?: [{ label, percent, resetAt? }],
                  providers?: { [id]: { updatedAt, model, meters } } }

Renders a multi-row BLOCK, not a badge:

    wisp │ fable → claude-fable-5 │ ctx 38% │ anthropic
      5h  ●●○○○○○○○○   11%  ↻ 9:04pm
      7d  ●●●●○○○○○○   35%  ↻ Sun 9:59pm
      codex  7d 7%                 3h ago

Row 1 is the route — a family or an alias, whichever the picked model resolved through. The middle
rows are the ACTIVE Provider's quota windows — its live reading when this session's turn wrote the
snapshot, otherwise its ledger entry stamped with an age. The
tail rows are every OTHER Provider the ledger remembers, dimmed and stamped with their age — a limit
you are not currently spending is still a limit worth seeing, but it is never presented as current.

No leading newline: the composing statusline owns where the block starts (see plugins/slot/README.md).
*/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ------------------------------- Bridged detection ------------------------------- //

const wispHome = process.env.WISP_HOME || path.join(os.homedir(), '.wisp');

// Same two-part check as the SessionStart hook; unbridged sessions get no block.
if (!process.env.ANTHROPIC_BASE_URL || !fs.existsSync(wispHome)) process.exit(0);

// A snapshot older than this is a previous session's turn, not this one's. Its CONTEXT reading is then a
// confident wrong number — the one thing #171 forbids — so it ages out. Its quota meters do not: a window
// belongs to the account, not the conversation, so they demote to a dated row instead of vanishing.
const STATUS_MAX_AGE_MS = 30 * 60 * 1000;

// Mirrors QUOTA_LEDGER_MAX_AGE_MS in packages/core/src/status.ts. Pruning on read as well as on write is
// what keeps an idle machine from showing yesterday's limits: nothing rewrites status.json while nothing runs.
const LEDGER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const BAR_CELLS = 10;
const MAX_REMEMBERED_ROWS = 2;

// --------------------------------- Paint --------------------------------- //

// xterm-256. Wisp purple is 141 — the nearest 256-color to the TUI theme's #a78bfa.
const PURPLE = 141, TEXT = 252, LABEL = 244, DIM = 240, FAINT = 238, SNAP = 208;

const paint = (code, text) => `\x1b[38;5;${code}m${text}\x1b[0m`;

// Utilization → colour. The bands are the ones a user acts on: green is fine, amber is "plan the session",
// red is "this window is nearly gone", bright red is spent-or-over. Context percent uses the same ramp, so
// a full window and a full context look equally alarming — because they cost the same thing.
const scale = (percent) => (percent >= 100 ? 196 : percent >= 80 ? 203 : percent >= 50 ? 179 : 114);

// Ambiguous-width glyphs on purpose: ●/○ are what the reference statusline uses and what reads as a meter
// at a glance. They are single-width everywhere except terminals configured to treat CJK-ambiguous as wide.
const bar = (percent) => {
  // A non-zero reading never renders as an empty bar — floor it at one cell. 0% and 3% mean different
  // things, and rounding 3% down to nothing would make an account that has started spending look untouched.
  const cells = Math.round((percent / 100) * BAR_CELLS);
  const filled = percent <= 0 ? 0 : Math.max(1, Math.min(BAR_CELLS, cells));
  return paint(scale(percent), '●'.repeat(filled)) + paint(FAINT, '○'.repeat(BAR_CELLS - filled));
};

// ------------------------------- Time labels ------------------------------- //

const clockTime = (date) =>
  date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s+/g, '').toLowerCase();

// When a window refills. Same-day resets are the common case and need no date; anything further out gets a
// weekday, because "9:59pm" three days from now would read as tonight.
const resetLabel = (epochSeconds) => {
  const date = new Date(epochSeconds * 1000);
  if (Number.isNaN(date.getTime())) return undefined;
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? clockTime(date) : `${date.toLocaleDateString([], { weekday: 'short' })} ${clockTime(date)}`;
};

const ageLabel = (ms) => {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
};

// --------------------------------- Reads --------------------------------- //

// Every read is independently fallible: a missing status.json costs context, not cached quota or the route.
const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(path.join(wispHome, file), 'utf8')); } catch { return undefined; }
};

const stdin = (() => { try { return JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return {}; } })();

const cfg = readJson('config.json') || {};
const status = readJson('status.json');
const quota = readJson('quota.json');
// Exact WispHome.quotaAuthRevision shape, including bigint nanoseconds. No credential contents are read.
const authRevision = (() => {
  try {
    const stat = fs.statSync(path.join(wispHome, 'auth.json'), { bigint: true });
    return stat.isFile() ? `v1:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}` : undefined;
  } catch { return undefined; }
})();
const now = Date.now();

// Mirrors core's selectQuotaReading / parseQuotaCache. A malformed window rejects the WHOLE observation.
const selectQuotaReading = (provider) => {
  if (!authRevision || !['anthropic', 'codex'].includes(provider)) return undefined;
  let selected;
  const candidates = [
    { source: 'refresh', reading: quota?.schema === 1 ? quota.providers?.[provider]?.reading : undefined },
    { source: 'headers', reading: status?.providers?.[provider] },
    { source: 'headers', reading: status?.providerId === provider ? status : undefined },
  ];
  for (const { reading, source } of candidates) {
    if (!reading || reading.authRevision !== authRevision || !Number.isSafeInteger(reading.updatedAt)
      || reading.updatedAt < 0 || reading.updatedAt > now || now - reading.updatedAt > LEDGER_MAX_AGE_MS
      || !Array.isArray(reading.meters) || !reading.meters.length) continue;
    const labels = new Set();
    const valid = reading.meters.every(m => {
      if (!m || typeof m.label !== 'string' || m.label.length > 32 || !/^\d+(?:\.\d+)?[mhd]$/.test(m.label)
        || !(Number(m.label.slice(0, -1)) > 0) || labels.has(m.label)
        || typeof m.percent !== 'number' || !Number.isFinite(m.percent) || m.percent < 0 || m.percent > 100
        || (m.resetAt !== undefined && (!Number.isSafeInteger(m.resetAt) || m.resetAt < 0 || m.resetAt > 8.64e12))) return false;
      labels.add(m.label);
      return true;
    });
    // Refresh first, headers last: an equally recent header observation wins, without merging windows.
    if (valid && (!selected || reading.updatedAt >= selected.reading.updatedAt)) selected = { reading, source };
  }
  return selected;
};

// --------------------------------- The route --------------------------------- //

// Resolved live from config on every refresh, so a mid-session Slot rebind shows up on the next repaint.
// Lookup order mirrors resolveRoute (packages/core/src/routing.ts): an exact ALIAS match wins BEFORE the
// family fuzzy. Matching families only was the hole — an aliased route (`sol`, `grok`, `gemini`) resolved to
// no Target at all, so the row lost its model/provider and the live verdict below could never pass, leaving
// the previous Provider's reading as the only thing on screen.
//
// The name must be normalized FIRST. Claude Code's `/model` picker lists the Bridge's Anthropic-door rows,
// whose ids carry the `claude-wisp-` discovery prefix (bridgeAnthropic.ts:676) and may carry Claude Code's
// own `[1m]` tier suffix — so a PICKED alias arrives as `claude-wisp-keemee`, never as `keemee`. The door
// strips the same prefix before resolveRoute ever sees it (bridgeAnthropic.ts:250); this reader did not, so
// the exact-alias rung could only ever hit a hand-set ANTHROPIC_MODEL, and every alias chosen the normal way
// fell through to a bare `wisp` row. Stripping is safe for the family fuzzy too: it is a substring test.
const clean = (n) => String(n).toLowerCase().replace(/^claude-wisp-/, '').replace(/\[[^\]]*\]$/, '');
const names = [stdin.model?.id, stdin.model?.display_name].filter(Boolean).map(clean);
const alias = (cfg.routing?.aliases || []).find((a) => names.includes(String(a.name).toLowerCase()));
const family = alias ? undefined : ['haiku', 'sonnet', 'opus', 'fable'].find((f) => names.join(' ').includes(f));
const route = alias?.name || family;
const target = alias?.target || (family && cfg.routing?.families?.[family]) || undefined;
const heldCount = Object.keys(cfg.snapshots || {}).length;

// The snapshot is only THIS session's turn when it is both recent and about the model we are routed to —
// otherwise it describes another route's window. Meters survive that verdict as history; context does not.
const live = status && now - (status.updatedAt || 0) < STATUS_MAX_AGE_MS && status.model === target?.model
  ? status
  : undefined;

// Quota belongs to the account, not the conversation. Refreshes never affect the context test above.
const activeReading = selectQuotaReading(target?.providerId);
const activeQuota = activeReading && { ...activeReading.reading,
  live: activeReading.source === 'headers' && Boolean(live) && status.providerId === target.providerId
    && status.updatedAt === activeReading.reading.updatedAt };

const rows = [];

const head = [paint(PURPLE, 'wisp')];
if (target?.model) head.push(`${paint(PURPLE, route)} ${paint(DIM, '→')} ${paint(TEXT, target.model)}`);
// Rendered verbatim, including past 100% — a 122% reading is a conversation already over the window and
// doomed upstream, and seeing it BEFORE the request fails is the point.
if (typeof live?.contextPercent === 'number') {
  head.push(`${paint(LABEL, 'ctx')} ${paint(scale(live.contextPercent), `${live.contextPercent}%`)}`);
}
if (target?.providerId) head.push(paint(LABEL, target.providerId));
if (heldCount) head.push(paint(SNAP, heldCount > 1 ? `!SNAP×${heldCount}` : '!SNAP'));
rows.push(head.join(paint(DIM, ' │ ')));

// --------------------------------- Meter rows --------------------------------- //

// A window whose reset time is at-or-before now has already rolled (#203): its percent describes a spent
// window that no longer exists, so presenting it as a live alarm is a confident wrong number. The row is
// never silently dropped — the wire reported — it renders dimmed and barless with a refilled marker.
// Render-time only: reading age (the 24h prune above) and window validity are orthogonal.
const expired = (meter) => typeof meter.resetAt === 'number' && meter.resetAt * 1000 <= now;

const activeMeters = activeQuota?.meters || [];
const labelWidth = Math.max(3, ...activeMeters.map((m) => String(m.label).length));
// The reading's age, stamped ONCE on the group's first row when it did not come from this session's own
// turn. A window's level is still the account's level minutes later, so an aged reading is worth showing —
// but never worth passing off as this turn's.
let ageStamp = activeQuota && !activeQuota.live ? ageLabel(now - activeQuota.updatedAt) : undefined;

for (const meter of activeMeters) {
  if (typeof meter.percent !== 'number') continue;
  const reset = typeof meter.resetAt === 'number' ? resetLabel(meter.resetAt) : undefined;
  rows.push(expired(meter)
    ? [
        '  ',
        paint(LABEL, String(meter.label).padStart(labelWidth)),
        '  ',
        paint(FAINT, `↻ refilled${reset ? ` ${reset}` : ''}`),
        ageStamp ? `  ${paint(FAINT, ageStamp)}` : '',
      ].join('')
    : [
        '  ',
        paint(LABEL, String(meter.label).padStart(labelWidth)),
        '  ',
        bar(meter.percent),
        paint(scale(meter.percent), `${meter.percent}%`.padStart(5)),
        reset ? `  ${paint(DIM, '↻')} ${paint(LABEL, reset)}` : '',
        ageStamp ? `  ${paint(FAINT, ageStamp)}` : '',
      ].join(''));
  ageStamp = undefined;
}

// ------------------------------ Remembered rows ------------------------------ //

// Use the same selection for every other supported Provider, including explicit cache-only readings.
const remembered = ['anthropic', 'codex'].flatMap(id => {
  const selected = id !== target?.providerId ? selectQuotaReading(id) : undefined;
  return selected ? [{ id, ...selected.reading }] : [];
});

const shown = remembered
  .filter((e) => now - e.updatedAt <= LEDGER_MAX_AGE_MS)
  .sort((a, b) => b.updatedAt - a.updatedAt)
  .slice(0, MAX_REMEMBERED_ROWS);

for (const entry of shown) {
  const readings = entry.meters
    .filter((m) => typeof m.percent === 'number')
    .map((m) => expired(m)
      ? `${paint(LABEL, m.label)} ${paint(FAINT, '↻ refilled')}`
      : `${paint(LABEL, m.label)} ${paint(scale(m.percent), `${m.percent}%`)}`)
    .join(paint(FAINT, ' · '));
  if (!readings) continue;
  rows.push(`  ${paint(LABEL, entry.id)}  ${readings}  ${paint(FAINT, ageLabel(now - entry.updatedAt))}`);
}

process.stdout.write(rows.join('\n'));

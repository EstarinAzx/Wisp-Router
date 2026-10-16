// ---------------- check.js — runnable self-check for the Wisp statusline block ---------------- //

/*
Depends on:
  node:fs / node:os / node:path — sandbox WISP_HOME
  node:child_process — run the real script as Claude Code runs it (stdin JSON in, ANSI out)

Run: node plugins/slot/statusline/check.js   (exit 0 = pass, 1 = fail)

Why this exists: wisp-statusline.js runs out-of-process under Claude Code, so vitest never sees it, and it
necessarily RE-IMPLEMENTS resolveRoute (packages/core/src/routing.ts) in plain JS. That duplicate has drifted
twice — first it knew families and not aliases; then it knew aliases but not the `claude-wisp-` prefix the
picker actually sends, so a PICKED alias still rendered a bare `wisp` row with the previous Provider's quota
as the only reading. Both times the fixtures were the accomplice. These cases pin the resolution order, the
degrade ladder, and which Provider's reading is allowed to lead the block; they are not a test suite and
need no framework.
*/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const script = path.join(__dirname, 'wisp-statusline.js');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wisp-statusline-check-'));
const now = Date.now();

const write = (file, body) => fs.writeFileSync(path.join(home, file), JSON.stringify(body));
write('auth.json', {});
const authStat = fs.statSync(path.join(home, 'auth.json'), { bigint: true });
const authRevision = `v1:${authStat.dev}:${authStat.ino}:${authStat.size}:${authStat.mtimeNs}:${authStat.ctimeNs}`;

write('config.json', {
  routing: {
    families: {
      opus: { providerId: 'anthropic', model: 'claude-opus-5' },
      sonnet: { providerId: 'codex', model: 'gpt-5.6-sol' },
    },
    aliases: [
      { name: 'sol', target: { providerId: 'codex', model: 'gpt-5.6-sol' } },
      { name: 'grok', target: { providerId: 'xai', model: 'grok-4.5' } },
    ],
  },
});

// ANSI stripped: the assertions are about content, and colour is verified by eye.
const plain = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');

const render = (model, status) => {
  const file = path.join(home, 'status.json');
  if (status) write('status.json', { authRevision, ...status, providers: Object.fromEntries(
    Object.entries(status.providers || {}).map(([id, entry]) => [id, { authRevision, ...entry }])) });
  else if (fs.existsSync(file)) fs.unlinkSync(file);
  return plain(execFileSync(process.execPath, [script], {
    input: JSON.stringify({ model }),
    // ANTHROPIC_BASE_URL is half the bridged check — without it the script prints nothing at all.
    env: { ...process.env, WISP_HOME: home, ANTHROPIC_BASE_URL: 'http://127.0.0.1:8787' },
    encoding: 'utf8',
  }));
};

const codexTurn = {
  updatedAt: now,
  providerId: 'codex',
  model: 'gpt-5.6-sol',
  contextPercent: 12,
  meters: [{ label: '5h', percent: 22, resetAt: Math.floor(now / 1000) + 3600 }, { label: '7d', percent: 61 }],
  providers: { anthropic: { updatedAt: now - 7 * 60_000, model: 'claude-opus-5', meters: [{ label: '5h', percent: 5 }, { label: '7d', percent: 36 }] } },
};

let failures = 0;
const ok = (label, condition, output) => {
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}\n${output}`);
};

// 1. An ALIASED route names its own Provider and shows that Provider's live windows.
let out = render({ id: 'sol', display_name: 'gpt-5.6-sol' }, codexTurn);
ok('alias route row', out.includes('sol → gpt-5.6-sol') && out.includes('codex'), out);
ok('alias context', out.includes('ctx 12%'), out);
ok('alias live meters', /5h {2}.*22%/.test(out) && /7d {2}.*61%/.test(out), out);
ok('alias ledger row', /anthropic {2}5h 5%.*7d 36% {2}7m ago/.test(out), out);

// 2. A family route is unchanged — the fuzzy rung still fires when no alias matches.
out = render({ id: 'claude-opus-5', display_name: 'Opus 5' }, {
  updatedAt: now, providerId: 'anthropic', model: 'claude-opus-5', contextPercent: 7, meters: [{ label: '5h', percent: 5 }],
});
ok('family route row', out.includes('opus → claude-opus-5') && out.includes('anthropic'), out);
ok('family live meter', /5h {2}.*5%/.test(out), out);

// 3. A Provider that reports no quota headers (xai) still gets its route row, and the readings that DO
//    exist stay dated rows — never restated as this route's live windows.
out = render({ id: 'grok', display_name: 'grok-4.5' }, codexTurn);
ok('grok route row', out.includes('grok → grok-4.5') && out.includes('xai'), out);
ok('grok claims no context', !out.includes('ctx '), out);
ok('grok demotes both readings', /codex {2}5h 22%/.test(out) && /anthropic {2}5h 5%/.test(out), out);

// 4. No status.json: the route row must survive alone (every read is independently fallible).
out = render({ id: 'sol', display_name: 'gpt-5.6-sol' }, null);
ok('bare route row', out.trim() === 'wisp │ sol → gpt-5.6-sol │ codex', out);

// 5. status.json is ONE global slot, so a second bridged session on another Provider owns the top level and
//    pushes THIS route's reading into the ledger. The route's own Provider must still lead the block, aged —
//    reading only the top level printed the other session's numbers as if they were this session's.
out = render({ id: 'sol', display_name: 'gpt-5.6-sol' }, {
  updatedAt: now,
  providerId: 'anthropic',
  model: 'claude-opus-5',
  contextPercent: 13,
  meters: [{ label: '5h', percent: 16 }, { label: '7d', percent: 37 }],
  providers: { codex: { updatedAt: now - 9 * 60_000, model: 'gpt-5.6-sol', meters: [{ label: '7d', percent: 1 }] } },
});
ok('displaced route leads with its own Provider', /7d {2}[●○]{10} +1%/.test(out), out);
ok('displaced reading is stamped aged', /7d {2}[●○]{10} +1%.*9m ago/.test(out), out);
ok('displaced route claims no context', !out.includes('ctx '), out);
ok('displacing Provider demoted', /anthropic {2}5h 16%.*7d 37% {2}just now/.test(out), out);

// 6. The route's Provider has reported NOTHING (never turned, or pruned): no meter row may be invented, and
//    the other Provider's reading stays a dated tail row rather than becoming the block's only reading.
out = render({ id: 'sol', display_name: 'gpt-5.6-sol' }, {
  updatedAt: now, providerId: 'anthropic', model: 'claude-opus-5', contextPercent: 13, meters: [{ label: '5h', percent: 16 }],
});
ok('unmeasured Provider gets no bar', !/[●○]/.test(out), out);
ok('unmeasured Provider still routes', out.includes('sol → gpt-5.6-sol'), out);
ok('unmeasured Provider keeps the other dated', /anthropic {2}5h 16% {2}just now/.test(out), out);

// 7. A quota window belongs to the ACCOUNT, a context reading to the CONVERSATION: a sibling model on the
//    same Provider spends the same window, so its meters count — its context percentage does not.
out = render({ id: 'sol', display_name: 'gpt-5.6-sol' }, {
  updatedAt: now, providerId: 'codex', model: 'gpt-5.6-terra', contextPercent: 44, meters: [{ label: '7d', percent: 3 }],
});
ok('sibling model shares the account window', /7d {2}[●○]{10} +3%/.test(out), out);
ok('sibling model does not share context', !out.includes('ctx '), out);
ok('sibling reading is stamped aged', /7d {2}[●○]{10} +3%.*just now/.test(out), out);

// 8. The shape the PICKER actually sends. Every case above hands the block a BARE alias id — which is only
//    ever true of a hand-set ANTHROPIC_MODEL, and is why this hole outlived the last drift fix. Claude Code's
//    /model list is the Bridge's Anthropic door, so a chosen alias arrives prefixed `claude-wisp-<name>`
//    (bridgeAnthropic.ts:676) and may carry Claude Code's own `[1m]` tier suffix. The door strips the prefix
//    before resolveRoute sees it; the reader must strip the same or the exact-alias rung can never fire.
out = render({ id: 'claude-wisp-grok', display_name: 'grok — grok-4.5' }, codexTurn);
ok('picked alias resolves', out.includes('grok → grok-4.5') && out.includes('xai'), out);

out = render({ id: 'claude-wisp-sol[1m]', display_name: 'sol — gpt-5.6-sol' }, codexTurn);
ok('picked alias survives the tier suffix', out.includes('sol → gpt-5.6-sol') && out.includes('codex'), out);
ok('picked alias leads with its own live meters', /5h {2}.*22%/.test(out), out);

// A regression pin, not a control case: the family fuzzy is a substring test, so it passed the suffix before
// the strip existed too. It is here so a future normalizer cannot quietly cost families what it buys aliases.
out = render({ id: 'claude-opus-5[1m]', display_name: 'Opus 5' }, {
  updatedAt: now, providerId: 'anthropic', model: 'claude-opus-5', meters: [{ label: '5h', percent: 5 }],
});
ok('tier suffix keeps the family fuzzy', out.includes('opus → claude-opus-5'), out);

// 9. An expired window is not a current reading (#203): a meter whose resetAt is at-or-before now has
//    already rolled, so the old percent must not alarm. The row stays — this wire reported — but dimmed,
//    barless, marked refilled, keeping its label and the reset glyph. Fixtures are caller-shaped: resetAt
//    in epoch SECONDS as status.json carries it, model id picker-prefixed as Claude Code sends it.
out = render({ id: 'claude-wisp-sol[1m]', display_name: 'sol — gpt-5.6-sol' }, {
  updatedAt: now, providerId: 'codex', model: 'gpt-5.6-sol', contextPercent: 12,
  meters: [
    { label: '5h', percent: 87, resetAt: Math.floor(now / 1000) - 120 },
    { label: '7d', percent: 61, resetAt: Math.floor(now / 1000) + 3600 },
  ],
});
ok('expired meter marks refilled', /5h {2}↻ refilled/.test(out), out);
ok('expired meter drops bar and alarm percent', !/5h {2}[●○]/.test(out) && !out.includes('87%'), out);
// Regression pin, not a control case: an UNexpired meter rendered this way before the expiry rule existed,
// so this passes pre-fix too. It is here so the expiry test cannot quietly widen past `resetAt <= now`.
ok('unexpired sibling renders as before', /7d {2}[●○]{10} +61%/.test(out), out);

// 10. Remembered-Provider rows get the identical treatment: an expired ledger meter shows refilled, not a
//     percent that stopped being true when its window rolled.
out = render({ id: 'claude-wisp-sol[1m]', display_name: 'sol — gpt-5.6-sol' }, {
  updatedAt: now, providerId: 'codex', model: 'gpt-5.6-sol',
  meters: [{ label: '5h', percent: 22, resetAt: Math.floor(now / 1000) + 3600 }],
  providers: {
    anthropic: {
      updatedAt: now - 7 * 60_000, model: 'claude-opus-5',
      meters: [{ label: '5h', percent: 91, resetAt: Math.floor(now / 1000) - 300 }, { label: '7d', percent: 36 }],
    },
  },
});
ok('remembered expired meter marks refilled', /anthropic {2}5h ↻ refilled/.test(out), out);
ok('remembered expired meter drops the percent', !out.includes('91%'), out);
// Regression pin (passes pre-fix): a meter with NO resetAt is never expired — the rule needs a number.
ok('remembered meter without resetAt keeps its percent', /7d 36%/.test(out), out);

// Explicit cache is usable before any turn, with the same stat revision used by core.
const refreshed = { updatedAt: now - 60_000, authRevision, meters: [{ label: '5h', percent: 42 }] };
const cache = (reading = refreshed) => write('quota.json', { schema: 1, providers: { codex: { reading, nextAllowedAt: now + 300000 } } });
cache();
out = render({ id: 'claude-wisp-sol[1m]' }, null);
ok('cache before a turn', out.includes('42%') && out.includes('1m ago') && !out.includes('ctx '), out);
out = render({ id: 'sol' }, { ...codexTurn, updatedAt: now - 31 * 60_000 });
ok('quota freshness never refreshes context', out.includes('42%') && !out.includes('ctx ') && !out.includes('61%'), out);
for (const offset of [-1, 0, 1]) {
  out = render({ id: 'sol' }, { ...codexTurn, updatedAt: refreshed.updatedAt + offset, meters: [{ label: '7d', percent: 71 }] });
  ok('newest whole reading; headers win ties ' + offset,
    offset < 0 ? out.includes('42%') && !out.includes('71%') : out.includes('71%') && !out.includes('42%'), out);
}
out = render({ id: 'grok' }, null);
ok('cached other Provider is remembered', /codex {2}5h 42% {2}1m ago/.test(out), out);
for (const reading of [
  { ...refreshed, authRevision: undefined }, { ...refreshed, authRevision: 'v1:1:2:3:4:5' },
  { ...refreshed, updatedAt: now + 100000 }, { ...refreshed, updatedAt: now - 86400001 },
  { ...refreshed, meters: [{ label: '5h', percent: 42 }, { label: '7d', percent: 101 }] },
]) {
  cache(reading);
  out = render({ id: 'sol' }, null);
  ok('invalid whole cache is unavailable', !out.includes('%'), out);
}
cache();
out = render({ id: 'sol' }, { ...codexTurn, authRevision: undefined, providers: { anthropic: { ...codexTurn.providers.anthropic, authRevision: undefined } } });
ok('legacy unbound headers cannot replace the cache or leak remembered meters', out.includes('42%') && !out.includes('22%') && !out.includes('36%'), out);
write('auth.json', { changed: true });
out = render({ id: 'sol' }, codexTurn);
ok('account change invalidates active, remembered and refreshed meters', !out.includes('22%') && !out.includes('36%') && !out.includes('42%'), out);
fs.unlinkSync(path.join(home, 'auth.json'));
out = render({ id: 'sol' }, codexTurn);
ok('missing revision cannot attribute any quota', !/[●○]/.test(out) && !out.includes('36%'), out);

fs.rmSync(home, { recursive: true, force: true });

if (failures) { console.error(`\n${failures} failing check(s)`); process.exit(1); }
console.log('wisp-statusline: all checks passed');

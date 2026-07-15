// ---------------- slash.test.ts — slash-command parsing + palette suggestion ---------------- //

import { describe, it, expect } from 'vitest';
import { parseSlash, suggestSlash, SLASH_COMMANDS, type SlashCommandDef } from '../src/slash';

// A fixed list so filter tests never churn when the real palette grows.
const cmds: SlashCommandDef[] = [
  { name: 'providers', description: 'pick provider' },
  { name: 'key', description: 'set key' },
  { name: 'model', description: 'pick model' },
];

describe('parseSlash — input string → command + args', () => {
  it('parses a bare command', () => {
    expect(parseSlash('/providers')).toEqual({ command: 'providers', args: [] });
  });

  it('parses a command with args split on whitespace', () => {
    expect(parseSlash('/key opencode sk-abc123')).toEqual({ command: 'key', args: ['opencode', 'sk-abc123'] });
  });

  it('tolerates surrounding and repeated whitespace', () => {
    expect(parseSlash('  /key   opencode   sk-1  ')).toEqual({ command: 'key', args: ['opencode', 'sk-1'] });
  });

  it('lowercases the command but never the args', () => {
    expect(parseSlash('/KEY OpenCode SK-abc')).toEqual({ command: 'key', args: ['OpenCode', 'SK-abc'] });
  });

  it('answers undefined for non-slash input', () => {
    expect(parseSlash('hello')).toBeUndefined();
    expect(parseSlash('key opencode')).toBeUndefined();
  });

  it('answers undefined for empty input and a lone slash', () => {
    expect(parseSlash('')).toBeUndefined();
    expect(parseSlash('   ')).toBeUndefined();
    expect(parseSlash('/')).toBeUndefined();
  });
});

describe('suggestSlash — palette filter', () => {
  it('offers every command on a lone slash', () => {
    expect(suggestSlash('/', cmds)).toEqual(cmds);
  });

  it('narrows by prefix', () => {
    expect(suggestSlash('/pr', cmds)).toEqual([cmds[0]]);
  });

  it('matches case-insensitively', () => {
    expect(suggestSlash('/PR', cmds)).toEqual([cmds[0]]);
  });

  it('keeps an exact match offered', () => {
    expect(suggestSlash('/key', cmds)).toEqual([cmds[1]]);
  });

  it('closes once args begin (whitespace after the command)', () => {
    expect(suggestSlash('/key ', cmds)).toEqual([]);
    expect(suggestSlash('/key opencode', cmds)).toEqual([]);
  });

  it('answers empty for non-slash input and no match', () => {
    expect(suggestSlash('hello', cmds)).toEqual([]);
    expect(suggestSlash('/zzz', cmds)).toEqual([]);
  });
});

describe('SLASH_COMMANDS — the real palette', () => {
  it('carries the MVP trio', () => {
    const names = SLASH_COMMANDS.map((c) => c.name);
    for (const n of ['providers', 'key', 'model']) expect(names).toContain(n);
  });

  it('carries the OAuth commands (#61)', () => {
    const names = SLASH_COMMANDS.map((c) => c.name);
    for (const n of ['signin', 'signout', 'effort']) expect(names).toContain(n);
  });

  it('carries the wiring check (#62)', () => {
    expect(SLASH_COMMANDS.map((c) => c.name)).toContain('test');
  });

  it('carries the Bridge toggle (#63)', () => {
    expect(SLASH_COMMANDS.map((c) => c.name)).toContain('bridge');
  });

  it('carries the Routing map editor (#65)', () => {
    expect(SLASH_COMMANDS.map((c) => c.name)).toContain('routing');
  });

  it('carries the alias-only list toggle (#67)', () => {
    expect(SLASH_COMMANDS.map((c) => c.name)).toContain('aliasonly');
  });

  // #82: /help renders FROM this registry (no second source of truth) and /modelids is the
  // exact twin of /aliasonly — same optional on|off argument shape.
  it('carries /help and /modelids (#82)', () => {
    const names = SLASH_COMMANDS.map((c) => c.name);
    expect(names).toContain('help');
    expect(SLASH_COMMANDS.find((c) => c.name === 'modelids')?.args).toBe('[on|off]');
  });

  // #96: /signin + /signout name the third OAuth door (Grok) alongside codex/anthropic.
  it('lists xai in the /signin and /signout arg hints (#96)', () => {
    expect(SLASH_COMMANDS.find((c) => c.name === 'signin')?.args).toBe('[codex|anthropic|xai]');
    expect(SLASH_COMMANDS.find((c) => c.name === 'signout')?.args).toBe('[codex|anthropic|xai]');
  });

  it('parses and suggests the #82 commands like their siblings', () => {
    expect(parseSlash('/modelids on')).toEqual({ command: 'modelids', args: ['on'] });
    expect(parseSlash('/help')).toEqual({ command: 'help', args: [] });
    expect(suggestSlash('/he').map((c) => c.name)).toContain('help');
    // '/mode' must offer BOTH /model and /modelids — prefix filtering, not exact match — and
    // /model must come FIRST: the palette's Enter fires the top row, so registry order is behavior.
    expect(suggestSlash('/mode').map((c) => c.name)).toEqual(expect.arrayContaining(['model', 'modelids']));
    expect(suggestSlash('/mode')[0]?.name).toBe('model');
  });
});

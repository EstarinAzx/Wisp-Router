// ---------------- slash.test.ts — slash-command parsing + palette suggestion ---------------- //

import { describe, it, expect } from 'vitest';
import { parseSlash, suggestSlash, SLASH_COMMANDS, type SlashCommandDef } from './slash';

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
});

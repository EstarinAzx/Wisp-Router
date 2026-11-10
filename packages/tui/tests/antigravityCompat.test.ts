import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WispHome } from '@wisp/core';
import * as compat from '../src/antigravityCompat';

let dir: string;
let home: WispHome;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'wisp-compat-')); home = new WispHome(dir); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

test('status defaults off without creating or rewriting settings', () => {
  expect(compat.antigravityCompatResult([], home)).toMatchObject({ exitCode: 0, lines: expect.arrayContaining(['Antigravity client fallback: off']) });
  expect(readdirSync(dir)).toEqual([]);
  home.writeConfig({ bridge: { port: 4242, antigravityClientFallback: true } });
  const before = readFileSync(join(dir, 'config.json'), 'utf8');
  const result = compat.antigravityCompatResult(['status'], home);
  expect(result.exitCode).toBe(0);
  expect(result.lines.join('\n')).toContain('Start a new Claude conversation');
  expect(readFileSync(join(dir, 'config.json'), 'utf8')).toBe(before);
});

test('explicit on/off preserves other preferences and explains the accepted tradeoff', () => {
  const before = { future: 'keep', provider: 'custom', bridge: { port: 4242, aliasOnlyModels: false, future: 'keep' } };
  writeFileSync(join(dir, 'config.json'), JSON.stringify(before));
  for (const [mode, enabled] of [['on', true], ['off', false]] as const) {
    const result = compat.antigravityCompatResult([mode], home);
    expect(result.exitCode).toBe(0);
    if (enabled) expect(result.lines.join('\n')).toContain('some feature-specific reminders may be omitted');
    expect(home.readConfig()).toEqual({ ...before, bridge: { ...before.bridge, antigravityClientFallback: enabled } });
  }
  expect(readdirSync(dir)).toEqual(['config.json']);
});

test('invalid or extra arguments do not mutate settings', () => {
  home.writeConfig({ bridge: { antigravityClientFallback: true } });
  const before = readFileSync(join(dir, 'config.json'), 'utf8');
  for (const args of [['on', 'off'], ['status', 'on'], ['invalid']]) {
    const result = compat.antigravityCompatResult(args, home);
    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('Usage:');
    expect(readFileSync(join(dir, 'config.json'), 'utf8')).toBe(before);
  }
});

test('a refused config write returns a visible error and preserves the file', () => {
  writeFileSync(join(dir, 'config.json'), '{broken json');
  const result = compat.antigravityCompatResult(['on'], home);
  expect(result.exitCode).toBe(1);
  expect(result.lines.join('\n')).toContain('could not be read as JSON');
  expect(result.lines.join('\n')).not.toContain('Antigravity client fallback: on');
  expect(readFileSync(join(dir, 'config.json'), 'utf8')).toBe('{broken json');
});

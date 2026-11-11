import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '../../..');
const capture = (failure: boolean) => spawnSync(process.execPath, [
  ...(failure ? ['--preload', join(root, 'packages/tui/tests/fixtures/spanCaptureFailure.ts')] : []),
  'packages/tui/scripts/span-baseline.tsx',
], { cwd: root, encoding: 'utf8', timeout: 90000, env: { ...process.env, FORCE_COLOR: '0' } });

test('capture failures exit nonzero and remove the sandbox', () => {
  const result = capture(true), output = result.stdout + result.stderr;
  expect(result.error).toBeUndefined();
  expect(output).toContain('intentional span capture failure');
  expect(result.status).toBe(1);
  const sandbox = output.match(/span sandbox: (.+)\r?\n/)?.[1]?.trim();
  expect(sandbox).toBeDefined();
  expect(existsSync(sandbox!)).toBe(false);
}, 100000);

test('current routing sections capture under intercepted native discovery and match the baseline', () => {
  const result = capture(false), output = result.stdout + result.stderr;
  expect(result.error).toBeUndefined();
  expect(output).toContain('intercepted execFile (synthetic catalog)');
  expect(output).toContain('routing-codex');
  expect(output).toContain('routing-aliases');
  expect(output).toContain('Screens match the baseline');
  expect(result.status).toBe(0);
}, 100000);

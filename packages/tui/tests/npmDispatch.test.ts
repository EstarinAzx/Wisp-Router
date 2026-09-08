import { expect, test } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('npm commands use the shared platform resolver and preserve arguments and exit status', () => {
  const folder = mkdtempSync(join(tmpdir(), 'wisp-npm-%literal%-'));
  try {
    const pkg = join(folder, 'package');
    cpSync(resolve(import.meta.dir, '../npm/wisp-router'), pkg, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
    const platform = join(pkg, 'node_modules', '@tsd47216', `wisp-router-${process.platform}-${process.arch}`, 'bin');
    mkdirSync(platform, { recursive: true });
    // Node stands in for the platform executable: dispatch tokens load these observable scripts.
    const node = Bun.which('node')!;
    cpSync(node, join(platform, process.platform === 'win32' ? 'wisp.exe' : 'wisp'));
    for (const command of ['wisp', 'claude-wisp', 'codex-wisp']) {
      expect(typeof manifest.bin[command]).toBe('string');
      writeFileSync(join(folder, command), 'console.log(JSON.stringify(process.argv.slice(2))); process.exit(23);');
      const args = ['space value', '"quoted"', '%literal%', '&|<>'];
      const result = Bun.spawnSync([node, join(pkg, manifest.bin[command]), ...(command === 'wisp' ? ['wisp'] : []), ...args], {
        cwd: folder, env: { ...process.env, WISP_HOME: folder }, timeout: 10_000,
      });
      expect(result.stderr.toString()).toBe('');
      expect(result.exitCode).toBe(23);
      expect(JSON.parse(result.stdout.toString())).toEqual(args);
    }
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

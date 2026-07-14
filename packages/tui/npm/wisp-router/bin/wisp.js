#!/usr/bin/env node
// ------------- wisp.js — npm thin shell: locate the platform binary and hand over ------------- //

/*
 * Depends on:
 *   - child_process (node stdlib): spawnSync with inherited stdio — the binary owns the terminal.
 *
 * Data shapes: none. The real program is the bun-compiled `wisp` binary shipped by the
 * per-platform optionalDependency (esbuild/biome pattern); this shim only resolves and runs it.
 */

const { spawnSync } = require('child_process');

// platform-arch → the optionalDependency that carries its compiled binary.
// ponytail: musl (Alpine) matches linux-x64 but the glibc-linked binary fails at dlopen —
// add a musl probe with a plain error if it ever bites.
const PLATFORM_PACKAGES = {
  'win32-x64': '@tsd47216/wisp-router-win32-x64',
  'darwin-arm64': '@tsd47216/wisp-router-darwin-arm64',
  'darwin-x64': '@tsd47216/wisp-router-darwin-x64',
  'linux-x64': '@tsd47216/wisp-router-linux-x64',
};

const resolveBinary = () => {
  const key = `${process.platform}-${process.arch}`;
  const pkg = PLATFORM_PACKAGES[key];
  if (!pkg) {
    console.error(`wisp-router: unsupported platform ${key} (supported: ${Object.keys(PLATFORM_PACKAGES).join(', ')})`);
    process.exit(1);
  }
  try {
    return require.resolve(`${pkg}/bin/${process.platform === 'win32' ? 'wisp.exe' : 'wisp'}`);
  } catch {
    console.error(`wisp-router: platform package ${pkg} is missing — reinstall without --no-optional/--omit=optional.`);
    process.exit(1);
  }
};

// Run the binary with extra leading args (the claude-wisp shim passes its dispatch token here).
const run = (extraArgs) => {
  // Ctrl+C belongs to the child (TUI / claude handle their own); default would kill this shim first.
  process.on('SIGINT', () => {});
  const result = spawnSync(resolveBinary(), [...extraArgs, ...process.argv.slice(2)], { stdio: 'inherit' });
  if (result.error) {
    console.error(`wisp-router: failed to start the platform binary: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
};

module.exports = { run };
if (require.main === module) run([]);

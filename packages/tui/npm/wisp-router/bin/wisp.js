#!/usr/bin/env node
// ------------- wisp.js — npm thin shell: locate the platform binary and hand over ------------- //

/*
 * Depends on:
 *   - child_process / fs / path / os / https (node stdlib): resolve, download, and run the
 *     bun-compiled `wisp` binary with inherited stdio — the binary owns the terminal.
 *
 * Data shapes: none. The real program ships two ways (esbuild pattern): a per-platform
 * optionalDependency when npm serves it, else a one-time download of the same binary from the
 * GitHub release into ~/.wisp/bin (npm's spam filter has taken the platform packages down before
 * — the fallback keeps installs working regardless).
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VERSION = require('../package.json').version;
const RELEASE_BASE = `https://github.com/EstarinAzx/Wisp-Router/releases/download/v${VERSION}`;

// platform-arch → optionalDependency name + GitHub release asset name.
// ponytail: musl (Alpine) matches linux-x64 but the glibc-linked binary fails at dlopen —
// add a musl probe with a plain error if it ever bites.
const PLATFORMS = {
  'win32-x64': { pkg: '@tsd47216/wisp-router-win32-x64', asset: `wisp-v${VERSION}-win32-x64.exe` },
  'darwin-arm64': { pkg: '@tsd47216/wisp-router-darwin-arm64', asset: `wisp-v${VERSION}-darwin-arm64` },
  'darwin-x64': { pkg: '@tsd47216/wisp-router-darwin-x64', asset: `wisp-v${VERSION}-darwin-x64` },
  'linux-x64': { pkg: '@tsd47216/wisp-router-linux-x64', asset: `wisp-v${VERSION}-linux-x64` },
};

const BIN_NAME = process.platform === 'win32' ? 'wisp.exe' : 'wisp';

// ----------------------------- Release-asset download (fallback) ----------------------------- //

// GET following redirects (GitHub release assets 302 to storage) onto a temp file, then rename —
// a killed download never leaves a half-written "binary" behind.
const download = (url, dest, redirects = 0) =>
  new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    require('https').get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location, dest, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`download failed: HTTP ${res.statusCode} for ${url}`));
      }
      const tmp = `${dest}.tmp-${process.pid}`;
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => out.close(() => { fs.renameSync(tmp, dest); resolve(); }));
      out.on('error', (err) => { fs.rmSync(tmp, { force: true }); reject(err); });
    }).on('error', reject);
  });

const fetchBinary = async (platform) => {
  const dir = path.join(os.homedir(), '.wisp', 'bin', `v${VERSION}`);
  const file = path.join(dir, BIN_NAME);
  if (!fs.existsSync(file)) {
    console.error(`wisp-router: downloading ${platform.asset} from the GitHub release (one-time)…`);
    fs.mkdirSync(dir, { recursive: true });
    await download(`${RELEASE_BASE}/${platform.asset}`, file);
    if (process.platform !== 'win32') fs.chmodSync(file, 0o755);
  }
  return file;
};

// ----------------------------- Resolve + run ----------------------------- //

const resolveBinary = async () => {
  const key = `${process.platform}-${process.arch}`;
  const platform = PLATFORMS[key];
  if (!platform) {
    console.error(`wisp-router: unsupported platform ${key} (supported: ${Object.keys(PLATFORMS).join(', ')})`);
    process.exit(1);
  }
  // The optionalDependency wins when npm delivered it; otherwise the release download.
  try { return require.resolve(`${platform.pkg}/bin/${BIN_NAME}`); } catch {}
  try { return await fetchBinary(platform); } catch (err) {
    console.error(`wisp-router: could not get the platform binary: ${err.message}`);
    console.error(`Grab it manually: ${RELEASE_BASE}/${platform.asset}`);
    process.exit(1);
  }
};

// Run the binary with extra leading args (the claude-wisp shim passes its dispatch token here).
const run = async (extraArgs) => {
  const binary = await resolveBinary();
  // Ctrl+C belongs to the child (TUI / claude handle their own); default would kill this shim first.
  process.on('SIGINT', () => {});
  const result = spawnSync(binary, [...extraArgs, ...process.argv.slice(2)], { stdio: 'inherit' });
  if (result.error) {
    console.error(`wisp-router: failed to start the platform binary: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
};

module.exports = { run };
if (require.main === module) void run([]);

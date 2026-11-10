import fs from 'node:fs';
import path from 'node:path';
import { mock } from 'bun:test';
const record = fs.appendFileSync;
const audit = process.env.WISP_ARGON_CLI_AUDIT!;
const refused = (kind: string): never => { record(audit, kind + '\n'); throw Error('live access forbidden'); };
globalThis.fetch = (async () => refused('network')) as typeof globalThis.fetch;
for (const name of ['readFileSync','openSync','writeFileSync','mkdirSync','statSync','lstatSync','realpathSync'] as const) {
  const original: any = fs[name];
  (fs as any)[name] = Object.assign((file: any, ...args: any[]) => {
    if (typeof file === 'string' && path.resolve(file).replaceAll('\\','/').toLowerCase().startsWith('c:/users/s.d/.wisp')) refused('home');
    return original(file, ...args);
  }, original);
}
const actualHome = await import('../../src/homeStore');
mock.module('../../src/homeStore', () => ({ ...actualHome, WispHome: class { constructor() { refused('home'); } } }));
record(audit, 'preload-active\n');

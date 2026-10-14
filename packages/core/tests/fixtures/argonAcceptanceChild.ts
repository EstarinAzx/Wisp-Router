import fs from 'node:fs';
import path from 'node:path';
import { createPublicKey } from 'node:crypto';
import { mock } from 'bun:test';
import { journal, events, responseValue, SENTINEL } from './argonAcceptanceFixture';
const [root, mode, id] = process.argv.slice(2), input = JSON.parse(fs.readFileSync(path.join(root, 'child-input.json'), 'utf8'));
globalThis.fetch = (async () => { journal(root, 'escaped-fetch', { id }); throw Error('global fetch forbidden'); }) as typeof globalThis.fetch;
const actualHome = await import('../../src/homeStore');
mock.module('../../src/homeStore', () => ({ ...actualHome, WispHome: class extends actualHome.WispHome {
  constructor(dir?: string) {
    super(dir);
    const context = this.geminiReplayContext, credentials = this.geminiCredentials;
    this.geminiReplayContext = () => { journal(root, 'credential-read', { id, operation: 'context' }); return context(); };
    this.geminiCredentials = expected => { journal(root, 'credential-read', { id, operation: 'credentials' }); return credentials(expected); };
  }
} }));
const { runSyntheticArgonAcceptance } = await import('../../src/argonAcceptance');
const grant = fs.readFileSync(path.join(root, id === 'two' ? 'grant-copy.json' : 'grant.json'));
const flush = fs.fsyncSync; let flushes = 0;
fs.fsyncSync = fd => {
  flush(fd); flushes++;
  const stage = flushes === 1 ? 'header' : flushes === 2 ? 'reserve' : flushes === 8 ? 'terminal' : '';
  if (mode === stage) { journal(root, 'crash', { id, stage }); process.exit(73); }
};
const parse = JSON.parse;
JSON.parse = (text, reviver) => {
  const value = parse(text, reviver);
  if ((mode === 'response' && value?.model === 'gemini-4-argon' && value?.status === 'requires_action') ||
      (mode === 'sink' && value?.object === 'response')) {
    journal(root, 'crash', { id, stage: mode }); process.exit(73);
  }
  return value;
};
console.log('READY');
await new Promise<void>(resolve => process.stdin.once('data', () => { process.stdin.pause(); resolve(); }));
const report = await runSyntheticArgonAcceptance(grant, { root, expected: input.binding, publicKey: createPublicKey(input.publicKey), apiKey: SENTINEL,
  fetch: (async (_url, init) => {
    const attempt = events(root).filter(e => e.kind === 'fetch').length + 1;
    journal(root, 'fetch', { id, attempt, body: JSON.parse(init!.body as string) });
    return Response.json(responseValue(attempt));
  }) as typeof globalThis.fetch });
journal(root, 'report', { id, report }); console.log(JSON.stringify(report));

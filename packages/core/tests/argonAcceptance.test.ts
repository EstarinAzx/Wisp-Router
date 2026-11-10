import { afterEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { makeFixture, removeFixture, encodeGrant, canonical, sha, recipe, events, frames, responseValue, journal, receiptName, SENTINEL } from './fixtures/argonAcceptanceFixture';
const roots: string[] = [];
const observation = vi.hoisted(() => ({ constructions: 0, afterCredential: undefined as undefined | ((home: any) => void) }));
vi.mock('../src/homeStore', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/homeStore')>();
  return { ...actual, WispHome: class extends actual.WispHome {
    constructor(dir?: string) {
      super(dir); observation.constructions++;
      const credentials = this.geminiCredentials;
      this.geminiCredentials = context => { const key = credentials(context); observation.afterCredential?.(this); return key; };
    }
  } };
});
const setup = () => { const f = makeFixture(); roots.push(f.root); return f; };
const operator = async (): Promise<any> => {
  const modules = import.meta.glob('../src/argonAcceptance.ts');
  expect(modules['../src/argonAcceptance.ts'], 'the scoped operator must exist').toBeTypeOf('function');
  return modules['../src/argonAcceptance.ts']();
};
afterEach(() => { observation.afterCredential = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); roots.splice(0).forEach(removeFixture); });
const callbacks = (root: string) => events(root).filter(e => e.kind === 'fetch');
const noClaim = (root: string) => expect(fs.existsSync(path.join(root, 'acceptance', receiptName))).toBe(false);

test.each([
  ['arrays', [['right'], ['left']]],
  ['objects', ['right', { value: 'left' }]],
  ['null', ['right', null]],
  ['number', ['right', 12]],
  ['boolean', ['right', true]],
  ['unknown', ['right', 'secret']],
  ['duplicate', ['right', 'right']],
])('invalid tool keys %s stop the whole batch before any lookup', async (_name, keys) => {
  const api = await operator(), f = setup();
  vi.stubGlobal('fetch', () => { journal(f.root, 'escaped-fetch'); throw Error('global fetch forbidden'); });
  f.fixture.fetch = async () => {
    const attempt = callbacks(f.root).length + 1; journal(f.root, 'fetch', { attempt });
    const value = responseValue(attempt);
    if (attempt === 1) { value.steps[1].arguments.key = keys[0]; value.steps[2].arguments.key = keys[1]; }
    return Response.json(value);
  };
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  journal(f.root, 'report', { report });
  expect(report).toMatchObject({ outcome: 'stopped', reason: 'unexpected-tools', attempts: 1, toolExecutions: 0 });
  expect(callbacks(f.root)).toHaveLength(1);
  expect(frames(f.root).filter(f => f.entry.type === 'result')).toHaveLength(0);
});

test('left-first tool keys preserve both original IDs and their 12/19 results', async () => {
  const api = await operator(), f = setup();
  f.fixture.fetch = async (_url: unknown, init: RequestInit) => {
    const attempt = callbacks(f.root).length + 1; journal(f.root, 'fetch', { attempt, body: JSON.parse(init.body as string) });
    const value = responseValue(attempt);
    if (attempt === 1) value.steps = [value.steps[0], value.steps[2], value.steps[1]];
    return Response.json(value);
  };
  expect(await api.runSyntheticArgonAcceptance(f.grant, f.fixture)).toMatchObject({ outcome: 'completed', attempts: 3, toolExecutions: 2 });
  expect(callbacks(f.root)[1].body.input.slice(-2)).toEqual([
    { type: 'function_result', call_id: 'google-left', result: '{"value":12}' },
    { type: 'function_result', call_id: 'google-right', result: '{"value":19}' },
  ]);
});

test.each(['oversize', 'abort', 'expiry', 'source', 'http', 'redirected'])('pending cancellation cannot delay operator termination for %s', async mode => {
  const api = await operator(), f = setup(), controller = new AbortController();
  let release!: () => void, cancelled = 0, settled: any, beforeRelease: any, original: Response | undefined, active = 0;
  const cancellation = new Promise<void>(resolve => { release = resolve; });
  f.fixture.signal = controller.signal;
  const add = controller.signal.addEventListener.bind(controller.signal), remove = controller.signal.removeEventListener.bind(controller.signal);
  vi.spyOn(controller.signal, 'addEventListener').mockImplementation((...args: any[]) => { if (args[0] === 'abort') active++; return (add as any)(...args); });
  vi.spyOn(controller.signal, 'removeEventListener').mockImplementation((...args: any[]) => { if (args[0] === 'abort') active--; return (remove as any)(...args); });
  f.fixture.fetch = async () => {
    journal(f.root, 'fetch');
    if (mode === 'source') fs.appendFileSync(path.join(f.root, 'source/fixture.txt'), 'changed');
    original = new Response(new ReadableStream({
      start(c) { if (mode === 'oversize') c.enqueue(new Uint8Array(32769)); },
      cancel() { cancelled++; journal(f.root, 'cancel-requested'); return cancellation; },
    }), { status: mode === 'http' ? 429 : 200, headers: { 'retry-after': '3' } });
    if (mode === 'redirected') Object.defineProperty(original, 'redirected', { value: true });
    return original;
  };
  vi.useFakeTimers();
  const pending = api.runSyntheticArgonAcceptance(f.grant, f.fixture).then((r: any) => { settled = r; return r; });
  try {
    await vi.advanceTimersByTimeAsync(1);
    if (mode === 'abort') controller.abort();
    await vi.advanceTimersByTimeAsync(60001);
    beforeRelease = settled;
    journal(f.root, 'before-cancel-release', { settled: !!beforeRelease, report: beforeRelease, locked: original?.body?.locked, active, timers: vi.getTimerCount() });
    expect(beforeRelease, 'termination must not await the underlying cancel promise').toBeDefined();
    expect(beforeRelease).toMatchObject({ outcome: 'stopped', attempts: 1, toolExecutions: 0 });
    if (mode === 'http' || mode === 'redirected') expect(beforeRelease).toMatchObject({ reason: 'http', httpStatus: mode === 'http' ? 429 : 200, retryAfterMs: 3000 });
    expect(cancelled).toBe(1); expect(original!.body!.locked).toBe(false);
    expect(active).toBe(0); expect(vi.getTimerCount()).toBe(0);
  } finally { release(); await pending; vi.useRealTimers(); }
  expect(callbacks(f.root)).toHaveLength(1);
});

test('a rejected late-response cancellation is handled after deadline termination', async () => {
  const api = await operator(), f = setup();
  let deliver!: (response: Response) => void, cancelled = 0;
  f.fixture.fetch = () => { journal(f.root, 'fetch'); return new Promise<Response>(resolve => { deliver = resolve; }); };
  vi.useFakeTimers();
  try {
    const pending = api.runSyntheticArgonAcceptance(f.grant, f.fixture);
    await vi.advanceTimersByTimeAsync(60001);
    expect(await pending).toMatchObject({ outcome: 'stopped', reason: 'deadline-exhausted', attempts: 1 });
    deliver(new Response(new ReadableStream({ cancel() { cancelled++; return Promise.reject(Error('cancel rejected')); } })));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancelled).toBe(1); expect(vi.getTimerCount()).toBe(0); expect(callbacks(f.root)).toHaveLength(1);
  } finally { vi.useRealTimers(); }
});

test.each(['expiry', 'abort', 'failed-correction'])('terminal flush %s cannot leave a completed report or final receipt', async mode => {
  const api = await operator(), f = setup(), flush = fs.fsyncSync, controller = new AbortController();
  let time = 0, count = 0;
  f.fixture.now = () => time; f.fixture.signal = controller.signal;
  vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => {
    if (++count === 9 && mode === 'failed-correction') throw Error('terminal correction flush failed');
    flush(fd);
    if (count === 8) { if (mode === 'abort') controller.abort(); else time = 180001; }
  });
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  journal(f.root, 'report', { report });
  const reason = mode === 'abort' ? 'aborted' : 'deadline-exhausted';
  expect(report).toMatchObject({ outcome: mode === 'failed-correction' ? 'uncertain' : 'stopped',
    reason: mode === 'failed-correction' ? 'receipt-write-failed' : reason, attempts: 3, reservedInput: 24576, reservedOutput: 6144 });
  expect(frames(f.root).at(-1).entry).toMatchObject({ type: 'close', outcome: 'stopped', reason });
  const before = fs.readFileSync(path.join(f.root, 'acceptance', receiptName));
  f.fixture.signal = undefined;
  expect((await api.runSyntheticArgonAcceptance(f.grant, f.fixture)).reason).toBe('receipt-exists');
  expect(fs.readFileSync(path.join(f.root, 'acceptance', receiptName))).toEqual(before);
  expect(callbacks(f.root)).toHaveLength(3);
});


test.each([
  ['on-time', 'completed', 'completed'],
  ['expiry', 'stopped', 'deadline-exhausted'],
  ['abort', 'stopped', 'aborted'],
  ['close-error', 'uncertain', 'receipt-write-failed'],
  ['correction-close-error', 'uncertain', 'receipt-write-failed'],
  ['cleanup-expiry', 'stopped', 'deadline-exhausted'],
  ['cleanup-abort', 'stopped', 'aborted'],
])('terminal close %s preserves spending and checks the final report decision', async (mode, outcome, reason) => {
  const api = await operator(), f = setup(), controller = new AbortController();
  const open = fs.openSync, close = fs.closeSync, flush = fs.fsyncSync;
  const add = controller.signal.addEventListener.bind(controller.signal), remove = controller.signal.removeEventListener.bind(controller.signal);
  let time = 0, receiptFd: number | undefined, receiptCloses = 0, receiptOpens = 0, active = 0, flushes = 0;
  f.fixture.now = () => time; f.fixture.signal = controller.signal;
  vi.stubGlobal('fetch', () => { journal(f.root, 'escaped-fetch'); throw Error('global fetch forbidden'); });
  vi.spyOn(controller.signal, 'addEventListener').mockImplementation((...args: any[]) => { if (args[0] === 'abort') active++; return (add as any)(...args); });
  vi.spyOn(controller.signal, 'removeEventListener').mockImplementation((...args: any[]) => {
    if (args[0] === 'abort') active--;
    const value = (remove as any)(...args);
    if (receiptCloses && mode === 'cleanup-expiry') time = 180001;
    if (receiptCloses && mode === 'cleanup-abort') controller.abort();
    return value;
  });
  vi.spyOn(fs, 'openSync').mockImplementation((p: any, ...args: any[]) => {
    const claim = String(p) === path.join(f.root, 'acceptance', receiptName) && args[0] === 'wx';
    if (claim) receiptOpens++;
    const fd = (open as any)(p, ...args);
    if (claim) receiptFd = fd;
    return fd;
  });
  vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => {
    flush(fd);
    if (++flushes === 8 && mode === 'correction-close-error') time = 180001;
  });
  vi.spyOn(fs, 'closeSync').mockImplementation(fd => {
    close(fd);
    if (fd !== receiptFd) return;
    receiptFd = undefined; receiptCloses++;
    if (mode === 'expiry') time = 180001;
    if (mode === 'abort') controller.abort();
    journal(f.root, 'receipt-close-return', { mode, time, aborted: controller.signal.aborted });
    if (mode === 'close-error' || mode === 'correction-close-error') throw Error('receipt close failed');
  });
  vi.useFakeTimers();
  try {
    const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
    journal(f.root, 'close-boundary-report', { mode, report, receiptCloses, receiptOpens, active, timers: vi.getTimerCount() });
    expect(receiptCloses).toBe(1); expect(receiptOpens).toBe(1);
    expect(active).toBe(0); expect(vi.getTimerCount()).toBe(0);
    expect(report).toMatchObject({ attempts: 3, reservedInput: 24576, reservedOutput: 6144, toolExecutions: 2 });
    const before = fs.readFileSync(path.join(f.root, 'acceptance', receiptName));
    f.fixture.signal = undefined;
    expect((await api.runSyntheticArgonAcceptance(f.grant, f.fixture)).reason).toBe('receipt-exists');
    expect(fs.readFileSync(path.join(f.root, 'acceptance', receiptName))).toEqual(before);
    expect(callbacks(f.root)).toHaveLength(3); expect(receiptCloses).toBe(1); expect(receiptOpens).toBe(2);
    expect(report).toMatchObject({ outcome, reason });
    expect(frames(f.root).at(-1).entry.outcome).toBe(mode === 'correction-close-error' ? 'stopped' : 'completion-candidate');
  } finally { vi.useRealTimers(); }
});

test('public null authority refuses an approved-form test signature before filesystem or network access', async () => {
  const api = await operator(), f = setup();
  const reads = vi.spyOn(fs, 'readFileSync').mockImplementation(() => { throw Error('real files forbidden'); });
  vi.stubGlobal('fetch', () => { throw Error('real fetch forbidden'); });
  const report = await api.runArgonAcceptance(f.grant);
  expect(report).toMatchObject({ outcome: 'refused', reason: 'approval-authority-unavailable', attempts: 0, reservedInput: 0, reservedOutput: 0 });
  expect(reads).not.toHaveBeenCalled();
});

test.each(['unsigned', 'wrong-authority', 'tampered', 'noncanonical', 'duplicate', 'bad-base64', 'short-signature', 'oversize', 'unknown-field', 'unsafe-number'])('grant %s refuses before resource access or claim', async mode => {
  const api = await operator(), f = setup(); let bytes = f.grant;
  if (mode === 'unsigned') bytes = Buffer.from('{}');
  if (mode === 'wrong-authority') f.fixture.publicKey = crypto.generateKeyPairSync('ed25519').publicKey;
  if (mode === 'tampered') { const e = JSON.parse(bytes.toString()); e.payloadBase64 = Buffer.from(canonical({ ...f.binding, sessionId: '22222222-2222-4222-8222-222222222222' })).toString('base64'); bytes = Buffer.from(canonical(e)); }
  if (mode === 'noncanonical') bytes = encodeGrant(f.binding, f.keys.privateKey, JSON.stringify(f.binding, null, 2));
  if (mode === 'duplicate') bytes = encodeGrant(f.binding, f.keys.privateKey, canonical(f.binding).replace('"version":1', '"version":1,"version":1'));
  if (mode === 'bad-base64') { const e = JSON.parse(bytes.toString()); e.payloadBase64 += '='; bytes = Buffer.from(canonical(e)); }
  if (mode === 'short-signature') { const e = JSON.parse(bytes.toString()); e.signatureBase64 = Buffer.alloc(63).toString('base64'); bytes = Buffer.from(canonical(e)); }
  if (mode === 'oversize') bytes = Buffer.alloc(16385, 32);
  if (mode === 'unknown-field') bytes = encodeGrant({ ...f.binding, approved: true }, f.keys.privateKey);
  if (mode === 'unsafe-number') bytes = encodeGrant({ ...f.binding, version: Number.MAX_SAFE_INTEGER + 1 }, f.keys.privateKey);
  const read = vi.spyOn(fs, 'readFileSync');
  observation.constructions = 0;
  const report = await api.runSyntheticArgonAcceptance(bytes, f.fixture);
  expect(report.outcome).toBe('refused'); noClaim(f.root); expect(callbacks(f.root)).toHaveLength(0);
  expect(observation.constructions).toBe(0);
  expect(read.mock.calls.filter(([p]) => String(p) === path.join(f.root, 'auth.json'))).toHaveLength(0);
});

test.each(['sessionId', 'credential', 'policy', 'limits', 'payload', 'sourceManifest', 'executable', 'receiptPath', 'hostId', 'acknowledgments'])('changed signed %s binding refuses before claim', async field => {
  const api = await operator(), f = setup(), changed = structuredClone(f.binding);
  if (typeof changed[field] === 'string') changed[field] += 'changed'; else changed[field].changed = true;
  const report = await api.runSyntheticArgonAcceptance(encodeGrant(changed, f.keys.privateKey), f.fixture);
  expect(report.outcome).toBe('refused'); noClaim(f.root); expect(callbacks(f.root)).toHaveLength(0);
});

test('approved-form fixture flushes reservations before three actual callbacks and preserves full original-ID replay', async () => {
  const api = await operator(), f = setup(), flush = fs.fsyncSync;
  vi.stubGlobal('fetch', () => { throw Error('global fetch forbidden'); });
  vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { flush(fd); const last = frames(f.root).at(-1); if (last) journal(f.root, 'flush', { type: last.entry.type }); });
  f.fixture.fetch = async (url: unknown, init: RequestInit) => {
    const attempt = callbacks(f.root).length + 1;
    journal(f.root, 'fetch', { attempt, url, body: JSON.parse(init.body as string) });
    expect(events(f.root).at(-2)).toMatchObject({ kind: 'flush', type: 'reserve' });
    expect(frames(f.root).at(-1).entry.wireSha256).toBe(sha(init.body as string));
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe(SENTINEL);
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' }); expect(init.signal).toBeInstanceOf(AbortSignal);
    return Response.json(responseValue(attempt));
  };
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  expect(report).toMatchObject({ outcome: 'completed', reason: 'completed', attempts: 3, reservedInput: 24576, reservedOutput: 6144, toolExecutions: 2 });
  expect(report.observedUsage).toHaveLength(3);
  const sent = callbacks(f.root); expect(sent).toHaveLength(3);
  expect(sent.map(e => e.body.generation_config)).toEqual(['low','medium','high'].map(thinking_level => ({ thinking_level, max_output_tokens: 2048 })));
  expect(sent[0].body).toMatchObject({ model: 'gemini-4-argon', store: false, stream: false, background: false });
  expect(sent[1].body.input).toEqual([...sent[0].body.input, ...responseValue(1).steps,
    { type: 'function_result', call_id: 'google-right', result: '{"value":19}' }, { type: 'function_result', call_id: 'google-left', result: '{"value":12}' }]);
  expect(sent[2].body.input).toEqual([...sent[1].body.input, ...responseValue(2).steps, { type: 'user_input', content: [{ type: 'text', text: 'CHECK' }] }]);
  let previous = '';
  frames(f.root).forEach((frame, i) => { expect(frame.seq).toBe(i); expect(frame.previous).toBe(previous); expect(frame.digest).toBe(sha(JSON.stringify({ seq: i, previous, entry: frame.entry }))); previous = frame.digest; });
  expect(frames(f.root).map(f => f.entry.type)).toEqual(['header','reserve','result','reserve','result','reserve','result','close']);
  expect(frames(f.root).at(-1).entry.outcome).toBe('completion-candidate');
  const bytes = fs.readFileSync(path.join(f.root, 'acceptance', receiptName));
  expect((await api.runSyntheticArgonAcceptance(f.grant, f.fixture)).reason).toBe('receipt-exists');
  expect(callbacks(f.root)).toHaveLength(3); expect(fs.readFileSync(path.join(f.root, 'acceptance', receiptName))).toEqual(bytes);
  expect(bytes.toString()).not.toContain(SENTINEL); expect(bytes.toString()).not.toContain(f.context.key);
});

test.each(['source', 'bundle', 'runtime'])('changed %s bytes refuse before a receipt', async kind => {
  const api = await operator(), f = setup();
  fs.appendFileSync(path.join(f.root, kind === 'source' ? 'source/fixture.txt' : kind === 'bundle' ? 'operator.mjs' : 'runtime'), 'changed');
  expect((await api.runSyntheticArgonAcceptance(f.grant, f.fixture)).reason).toBe('source-changed'); noClaim(f.root);
});

test.each(['missing-model','wrong-model','missing-usage','input-over','output-over','thought-over','fractional-usage','late-tool','duplicate-call','wrong-answer','failed','incomplete','cancelled','malformed','http-302','http-401','http-403','http-429','http-500','network'])('response %s permanently stops without retry or partial lookups', async mode => {
  const api = await operator(), f = setup();
  f.fixture.fetch = async (_url: unknown, init: RequestInit) => {
    const attempt = callbacks(f.root).length + 1; journal(f.root, 'fetch', { attempt, body: JSON.parse(init.body as string) });
    if (mode === 'network') throw Error('PRIVATE_PROVIDER_FAILURE_' + SENTINEL);
    if (mode.startsWith('http-')) return new Response('private unbounded error', { status: Number(mode.slice(5)), headers: { 'retry-after': '3' } });
    if (mode === 'malformed') return new Response('{');
    const v = responseValue(attempt);
    if (mode === 'missing-model') delete v.model;
    if (mode === 'wrong-model') v.model = 'wrong';
    if (mode === 'missing-usage') delete v.usage;
    if (mode === 'input-over') v.usage.total_input_tokens = 8193;
    if (mode === 'output-over') v.usage.total_output_tokens = 2049;
    if (mode === 'thought-over') v.usage.total_thought_tokens = 2049;
    if (mode === 'fractional-usage') v.usage.total_input_tokens = 0.5;
    if (mode === 'late-tool') v.steps[2].arguments = { key: 'secret' };
    if (mode === 'duplicate-call') v.steps[2].id = v.steps[1].id;
    if (mode === 'wrong-answer' && attempt === 2) v.steps[0].content[0].text = 'TOTAL=30';
    if (['failed','incomplete','cancelled'].includes(mode)) v.status = mode;
    return Response.json(v);
  };
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  expect(report.outcome).toBe('stopped');
  expect(report.attempts).toBe(mode === 'wrong-answer' ? 2 : 1);
  expect(report.toolExecutions).toBe(mode === 'wrong-answer' ? 2 : 0);
  expect(JSON.stringify(report)).not.toContain(SENTINEL);
  if (mode === 'input-over') expect(report.observedUsage[0].total_input_tokens).toBe(8193);
  if (mode === 'output-over') expect(report.observedUsage[0].total_output_tokens).toBe(2049);
  if (mode === 'thought-over') expect(report.observedUsage[0].total_thought_tokens).toBe(2049);
  if (mode === 'http-429') expect(report).toMatchObject({ httpStatus: 429, retryAfterMs: 3000 });
  const count = callbacks(f.root).length;
  expect((await api.runSyntheticArgonAcceptance(f.grant, f.fixture)).reason).toBe('receipt-exists');
  expect(callbacks(f.root)).toHaveLength(count);
});

test.each([32768,32769])('response chunk boundary %i is enforced without clipping', async bytes => {
  const api = await operator(), f = setup(); let cancelled = 0;
  f.fixture.fetch = async () => {
    const attempt = callbacks(f.root).length + 1; journal(f.root, 'fetch', { attempt });
    if (attempt !== 1) return Response.json(responseValue(attempt));
    const raw = Buffer.from(JSON.stringify(responseValue(1))), pad = Buffer.alloc(bytes - raw.length, 32), all = Buffer.concat([raw,pad]);
    return new Response(new ReadableStream({ start(c) { c.enqueue(all.subarray(0,100)); c.enqueue(all.subarray(100)); if (bytes === 32768) c.close(); }, cancel() { cancelled++; } }));
  };
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  expect(report.outcome).toBe(bytes === 32768 ? 'completed' : 'stopped');
  expect(callbacks(f.root)).toHaveLength(bytes === 32768 ? 3 : 1);
  if (bytes === 32769) { expect(report.reason).toBe('response-bytes-exceeded'); expect(cancelled).toBe(1); }
});

test.each([1,2,3,8])('flush failure %i retains a permanent claim and cannot report completion', async at => {
  const api = await operator(), f = setup(), flush = fs.fsyncSync; let n = 0;
  vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { if (++n === at) throw Error('PRIVATE_IO_FAILURE'); flush(fd); });
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  expect(report).toMatchObject({ outcome: 'uncertain', reason: 'receipt-write-failed' });
  expect(callbacks(f.root)).toHaveLength(at <= 2 ? 0 : at === 3 ? 1 : 3);
  vi.restoreAllMocks(); const bytes = fs.readFileSync(path.join(f.root, 'acceptance', receiptName));
  expect((await api.runSyntheticArgonAcceptance(f.grant, f.fixture)).reason).toBe('receipt-exists');
  expect(fs.readFileSync(path.join(f.root, 'acceptance', receiptName))).toEqual(bytes);
});

test.each(['cap','model','flags','effort','history','tool'])('wire %s corruption is refused before transport even if a shared mapper regresses', async kind => {
  const api = await operator(), f = setup(), mapper = await import('../src/geminiInteractions'), original = mapper.buildGeminiInteractionRequest;
  vi.spyOn(mapper, 'buildGeminiInteractionRequest').mockImplementation(args => {
    const value = structuredClone(original(args));
    if (kind === 'cap') delete value.generation_config.max_output_tokens;
    if (kind === 'model') (value as any).model = 'wrong-model';
    if (kind === 'flags') (value as any).store = true;
    if (kind === 'effort') value.generation_config.thinking_level = 'high';
    if (kind === 'history') (value.input as any[]).push({ type: 'user_input', content: [{ type: 'text', text: 'injected' }] });
    if (kind === 'tool' && value.tools?.length) value.tools[0].description = 'changed';
    return value;
  });
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  expect(report.outcome).toBe('stopped'); expect(report.attempts).toBe(0); expect(callbacks(f.root)).toHaveLength(0);
});

test.each([8192,8193])('actual request UTF-8 boundary %i consumes only admitted attempts', async bytes => {
  const api = await operator(), f = setup();
  f.fixture.fetch = async (_url: unknown, init: RequestInit) => {
    const attempt = callbacks(f.root).length + 1, body = JSON.parse(init.body as string);
    journal(f.root, 'fetch', { attempt, body, bytes: Buffer.byteLength(init.body as string) });
    const value = responseValue(attempt);
    if (attempt === 1) {
      value.steps[0].signature = '';
      const next = { ...body, input: [...body.input, ...value.steps,
        { type: 'function_result', call_id: 'google-right', result: '{"value":19}' },
        { type: 'function_result', call_id: 'google-left', result: '{"value":12}' }],
        generation_config: { thinking_level: 'medium', max_output_tokens: 2048 } };
      const pad = bytes - Buffer.byteLength(JSON.stringify(next));
      value.steps[0].signature = 'é'.repeat(Math.floor(pad / 2)) + 'x'.repeat(pad % 2);
    }
    return Response.json(value);
  };
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  expect(report.reason).toBe('input-bytes-exceeded');
  expect(report.attempts).toBe(bytes === 8192 ? 2 : 1);
  if (bytes === 8192) expect(callbacks(f.root)[1].bytes).toBe(8192);
});

test.each(['source','credential','abort'])('change after headers cancels the original reader for %s', async mode => {
  const api = await operator(), f = setup(), controller = new AbortController(); let cancelled = 0;
  f.fixture.signal = controller.signal;
  f.fixture.fetch = async () => {
    journal(f.root, 'fetch');
    if (mode === 'source') fs.appendFileSync(path.join(f.root, 'source/fixture.txt'), 'changed');
    if (mode === 'credential') f.home.saveGeminiApiKey('SYNTHETIC_ROTATED', f.context.lifetime);
    if (mode === 'abort') controller.abort();
    return new Response(new ReadableStream({ cancel() { cancelled++; } }));
  };
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  expect(report.outcome).toBe('stopped'); expect(report.toolExecutions).toBe(0); expect(cancelled).toBe(1);
});

test.each(['before-credential','after-credential','after-result'])('credential rotation at %s permanently spends the claim', async stage => {
  const api = await operator(), f = setup(); let authReads = 0;
  if (stage === 'before-credential') f.home.saveGeminiApiKey('SYNTHETIC_ROTATED', f.context.lifetime);
  if (stage === 'after-credential') observation.afterCredential = home => {
    if (++authReads === 2) home.saveGeminiApiKey('SYNTHETIC_ROTATED', f.context.lifetime);
  };
  if (stage === 'after-result') { const flush = fs.fsyncSync; let count = 0;
    vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { flush(fd); if (++count === 3) f.home.saveGeminiApiKey('SYNTHETIC_ROTATED', f.context.lifetime); });
  }
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  expect(report).toMatchObject({ outcome: 'stopped', reason: 'credential-changed' });
  expect(callbacks(f.root)).toHaveLength(stage === 'after-result' ? 1 : 0);
});

test('abort after reservation flush sends nothing and keeps its allocation', async () => {
  const api = await operator(), f = setup(), controller = new AbortController(), flush = fs.fsyncSync; let count = 0;
  f.fixture.signal = controller.signal;
  vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { flush(fd); if (++count === 2) controller.abort(); });
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  expect(report).toMatchObject({ outcome: 'stopped', reason: 'aborted', attempts: 1, reservedInput: 8192, reservedOutput: 2048 });
  expect(callbacks(f.root)).toHaveLength(0);
});

test('a queued microtask cannot interpose between reservation flush and transport', async () => {
  const api = await operator(), f = setup(), controller = new AbortController(), flush = fs.fsyncSync; let count = 0;
  f.fixture.signal = controller.signal;
  vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { flush(fd); if (++count === 2) queueMicrotask(() => controller.abort()); });
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  expect(report.outcome).toBe('stopped'); expect(callbacks(f.root)).toHaveLength(1);
});

test.each(['attempt','sequence','stalled-reader'])('monotonic %s deadline stops and releases the reader', async mode => {
  const api = await operator(), f = setup(); let now = 0, cancelled = 0;
  f.fixture.now = () => now;
  f.fixture.fetch = async () => {
    const attempt = callbacks(f.root).length + 1; journal(f.root, 'fetch', { attempt });
    if (mode === 'attempt') now += 60000;
    if (mode === 'sequence') now += 59000;
    if (mode === 'stalled-reader') return new Response(new ReadableStream({ cancel() { cancelled++; } }));
    return Response.json(responseValue(attempt));
  };
  if (mode === 'stalled-reader') {
    vi.useFakeTimers();
    try {
      const pending = api.runSyntheticArgonAcceptance(f.grant, f.fixture);
      await vi.advanceTimersByTimeAsync(60001);
      expect(await pending).toMatchObject({ outcome: 'stopped', reason: 'deadline-exhausted', attempts: 1 });
      expect(cancelled).toBe(1); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  } else {
    if (mode === 'sequence') {
      const flush = fs.fsyncSync; let count = 0;
      vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { flush(fd); if (++count === 5) now += 3000; });
    }
    const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
    expect(report).toMatchObject({ outcome: 'stopped', reason: 'deadline-exhausted' });
  }
});

test.each(['garbage','empty','directory'])('an existing %s receipt is never repaired or reused', async mode => {
  const api = await operator(), f = setup(), p = path.join(f.root, 'acceptance', receiptName);
  fs.mkdirSync(path.dirname(p));
  if (mode === 'directory') fs.mkdirSync(p); else fs.writeFileSync(p, mode === 'garbage' ? 'broken\n' : '');
  const before = mode === 'directory' ? null : fs.readFileSync(p);
  expect((await api.runSyntheticArgonAcceptance(f.grant, f.fixture)).reason).toBe('receipt-exists');
  if (before) expect(fs.readFileSync(p)).toEqual(before);
  expect(callbacks(f.root)).toHaveLength(0);
});

test('receipt junctions refuse and alternate environment paths cannot change the claim', async () => {
  const api = await operator(), f = setup(), elsewhere = setup();
  fs.symlinkSync(elsewhere.root, path.join(f.root, 'acceptance'), 'junction');
  expect((await api.runSyntheticArgonAcceptance(f.grant, f.fixture)).reason).toBe('path-unsafe');
  expect(callbacks(f.root)).toHaveLength(0); noClaim(elsewhere.root);
  fs.unlinkSync(path.join(f.root, 'acceptance'));
  vi.stubEnv('WISP_HOME', elsewhere.root);
  expect((await api.runSyntheticArgonAcceptance(f.grant, f.fixture)).outcome).toBe('completed'); noClaim(elsewhere.root);
});

test.each(['session','lifetime','source','authority'])('a new signed %s binding never resets an existing claim', async variation => {
  const api = await operator(), f = setup();
  expect((await api.runSyntheticArgonAcceptance(f.grant, f.fixture)).outcome).toBe('completed');
  const p = path.join(f.root, 'acceptance', receiptName), before = fs.readFileSync(p);
  const next=structuredClone(f.binding);let keys=f.keys;
  if(variation==='session'){next.sessionId='22222222-2222-4222-8222-222222222222';next.payload.recipeSha256=sha(canonical(recipe(next.sessionId)));}
  if(variation==='lifetime'){f.home.saveGeminiApiKey(SENTINEL,f.context.lifetime);const c=f.home.geminiReplayContext()!;next.credential={lifetime:c.lifetime,credentialBinding:c.credentialBinding};}
  if(variation==='source'){fs.appendFileSync(path.join(f.root,'source/fixture.txt'),'new source');next.sourceManifest.head='b'.repeat(40);next.sourceManifest.files[0].sha256=sha(fs.readFileSync(path.join(f.root,'source/fixture.txt')));}
  if(variation==='authority')keys=crypto.generateKeyPairSync('ed25519');
  expect((await api.runSyntheticArgonAcceptance(encodeGrant(next,keys.privateKey), { ...f.fixture, expected:next,publicKey:keys.publicKey })).reason).toBe('receipt-exists');
  expect(fs.readFileSync(p)).toEqual(before); expect(callbacks(f.root)).toHaveLength(3);
});

test('a sink exception after the response remains uncertain delivery without more calls', async () => {
  const api = await operator(), f = setup(), parse = JSON.parse;
  vi.spyOn(JSON, 'parse').mockImplementation((text: string, reviver?: any) => {
    if (typeof text === 'string' && text.includes('"object":"response"')) throw Error('PRIVATE_SINK');
    return parse(text, reviver);
  });
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  expect(report).toMatchObject({ outcome: 'stopped', reason: 'delivery-invalid', attempts: 1, toolExecutions: 0 });
  expect(frames(f.root).filter(f => f.entry.type === 'result')).toHaveLength(0);
});

const prepareChild = (f: ReturnType<typeof setup>) => {
  fs.writeFileSync(path.join(f.root, 'child-input.json'), JSON.stringify({ binding: f.binding, publicKey: f.keys.publicKey.export({ type: 'spki', format: 'pem' }) }));
  fs.writeFileSync(path.join(f.root, 'grant.json'), f.grant); fs.writeFileSync(path.join(f.root, 'grant-copy.json'), f.grant);
};
const bunPath = () => process.env.WISP_ARGON_TEST_BUN ?? 'bun';
const child = (root: string, mode: string, id = 'one', cwd = process.cwd()) => {
  const cp = spawn(bunPath(), [path.resolve('tests/fixtures/argonAcceptanceChild.ts'), root, mode, id], { cwd, windowsHide: true, stdio: ['pipe','pipe','pipe'] });
  const startedAt = new Date().toISOString(); journal(root, 'child-start', { childPid: cp.pid, startedAt, mode, id });
  let stdout = '', stderr = '', readyResolve!: () => void, readyReject!: (e: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  cp.stdout.on('data', data => { stdout += data.toString(); if (stdout.includes('READY')) readyResolve(); });
  cp.stderr.on('data', data => stderr += data.toString());
  const finished = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    cp.once('error', reject);
    cp.once('exit', code => { if (!stdout.includes('READY')) readyReject(Error(stderr || stdout || 'child exited before READY'));
      journal(root, 'child-exit', { childPid: cp.pid, startedAt, finishedAt: new Date().toISOString(), code, mode, id }); resolve({ code, stdout, stderr }); });
  });
  return { cp, ready, finished, go: () => cp.stdin.end('go\n') };
};
test('two synchronized processes have one owner and the loser performs zero credential or transport callbacks', async () => {
  await operator(); const f = setup(); prepareChild(f);
  const first = child(f.root, 'run'), second = child(f.root, 'run', 'two', f.root);
  try {
    await Promise.all([first.ready, second.ready]); first.go(); second.go();
    const results = await Promise.all([first.finished, second.finished]); expect(results.map(r => r.code)).toEqual([0,0]);
    const reports = events(f.root).filter(e => e.kind === 'report'); expect(reports).toHaveLength(2);
    const winner = reports.find(e => e.report.outcome === 'completed'), loser = reports.find(e => e.report.reason === 'receipt-exists');
    expect(winner).toBeTruthy(); expect(loser).toBeTruthy();
    expect(events(f.root).filter(e => e.kind === 'credential-read' && e.id === winner.id).length).toBeGreaterThan(0);
    expect(events(f.root).filter(e => ['credential-read','fetch'].includes(e.kind) && e.id === loser.id)).toHaveLength(0);
    expect(callbacks(f.root)).toHaveLength(3);
    journal(f.root, 'receipt-evidence', { frames: frames(f.root) });
  } finally { if (first.cp.exitCode === null) first.cp.kill(); if (second.cp.exitCode === null) second.cp.kill(); await Promise.all([first.finished,second.finished]); }
}, 15000);

test.each(['header','reserve','response','sink','terminal'])('process crash at %s retains the original claim and restart sends zero more callbacks', async stage => {
  await operator(); const f = setup(); prepareChild(f);
  const first = child(f.root, stage);
  try {
    await first.ready; first.go(); const result = await first.finished; expect(result.code).toBe(73);
    const count = callbacks(f.root).length; expect(count).toBe(['header','reserve'].includes(stage) ? 0 : stage === 'terminal' ? 3 : 1);
    const p = path.join(f.root, 'acceptance', receiptName), before = fs.readFileSync(p);
    const next = child(f.root, 'run', 'two');
    try { await next.ready; next.go(); expect((await next.finished).code).toBe(0); }
    finally { if (next.cp.exitCode === null) next.cp.kill(); await next.finished; }
    expect(events(f.root).find(e => e.kind === 'report').report.reason).toBe('receipt-exists');
    expect(callbacks(f.root)).toHaveLength(count); expect(fs.readFileSync(p)).toEqual(before);
    journal(f.root, 'receipt-evidence', { stage, frames: frames(f.root) });
  } finally { if (first.cp.exitCode === null) first.cp.kill(); await first.finished; }
}, 15000);

test('actual CLI rejects test approval with its null authority and performs no live IO', async () => {
  const f = setup(), entry = path.resolve('tools/runArgonAcceptance.ts'); prepareChild(f);
  expect(fs.existsSync(entry), 'the minimal public CLI must exist').toBe(true);
  const audit = path.join(f.root, 'cli-audit.txt');
  const result = spawnSync(bunPath(), ['--preload', path.resolve('tests/fixtures/argonAcceptanceNoLive.ts'), entry, '--grant', path.join(f.root, 'grant.json')],
    { windowsHide: true, encoding: 'utf8', env: { ...process.env, WISP_HOME: f.root, WISP_ARGON_CLI_AUDIT: audit } });
  expect(result.status).toBe(1); expect(JSON.parse(result.stdout)).toMatchObject({ outcome: 'refused', reason: 'approval-authority-unavailable', attempts: 0 });
  expect(fs.readFileSync(audit, 'utf8')).toBe('preload-active\n'); noClaim(f.root);
  journal(f.root, 'cli-result', { pid: result.pid, exit: result.status, stdout: result.stdout, stderr: result.stderr });
});

test('aborting a never-resolving fetch removes its abort listener', async () => {
  const api = await operator(), f = setup(); let active = 0;
  vi.useFakeTimers();
  try {
    f.fixture.fetch = async (_url: unknown, init: RequestInit) => {
      journal(f.root, 'fetch');
      const signal = init.signal!, add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
      vi.spyOn(signal, 'addEventListener').mockImplementation((...args: any[]) => { if (args[0] === 'abort') active++; return (add as any)(...args); });
      vi.spyOn(signal, 'removeEventListener').mockImplementation((...args: any[]) => { if (args[0] === 'abort') active--; return (remove as any)(...args); });
      return new Promise<Response>(() => {});
    };
    const pending = api.runSyntheticArgonAcceptance(f.grant, f.fixture); await vi.advanceTimersByTimeAsync(60001);
    expect(await pending).toMatchObject({ outcome: 'stopped', reason: 'deadline-exhausted' });
    expect(active).toBe(0); expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

test.each([3,7])('expiry during result flush %i cannot run lookups or report terminal completion', async at => {
  const api = await operator(), f = setup(), flush = fs.fsyncSync; let time = 0, count = 0;
  f.fixture.now = () => time;
  vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { flush(fd); if (++count === at) time = 180001; });
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  expect(report).toMatchObject({ outcome: 'stopped', reason: 'deadline-exhausted', toolExecutions: at === 3 ? 0 : 2 });
});

test.each(['open','header-write','partial-reservation'])('receipt %s failure never reaches fetch', async mode => {
  const api = await operator(), f = setup();
  if (mode === 'open') {
    const open = fs.openSync;
    vi.spyOn(fs, 'openSync').mockImplementation(((p: any, ...args: any[]) => {
      if (String(p).endsWith(receiptName)) throw Object.assign(Error('PRIVATE_IO'), { code: 'EACCES' });
      return (open as any)(p, ...args);
    }) as any);
  } else {
    const write = fs.writeFileSync; let count = 0;
    vi.spyOn(fs, 'writeFileSync').mockImplementation(((p: any, value: any, ...args: any[]) => {
      if (typeof p === 'number' && ++count === (mode === 'header-write' ? 1 : 2)) {
        if (mode === 'partial-reservation') fs.writeSync(p, String(value).slice(0, 17));
        throw Error('PRIVATE_WRITE');
      }
      return (write as any)(p, value, ...args);
    }) as any);
  }
  const report = await api.runSyntheticArgonAcceptance(f.grant, f.fixture);
  expect(report.outcome).toBe(mode === 'open' ? 'refused' : 'uncertain'); expect(callbacks(f.root)).toHaveLength(0);
  vi.restoreAllMocks();
  if (mode !== 'open') {
    const before = fs.readFileSync(path.join(f.root,'acceptance',receiptName));
    expect((await api.runSyntheticArgonAcceptance(f.grant,f.fixture)).reason).toBe('receipt-exists');
    expect(fs.readFileSync(path.join(f.root,'acceptance',receiptName))).toEqual(before);
  }
});

test.each(['missing-stream','invalid-utf8','redirected','usage-boundary'])('response %s has explicit bounded behavior', async mode => {
  const api = await operator(), f = setup();
  f.fixture.fetch = async () => {
    const attempt = callbacks(f.root).length + 1; journal(f.root,'fetch',{attempt});
    if (mode === 'missing-stream') return new Response(null);
    if (mode === 'invalid-utf8') return new Response(new Uint8Array([195,40]));
    if (mode === 'redirected') { const r = new Response('private', { headers: { 'retry-after':'3' } }); Object.defineProperty(r,'redirected',{value:true}); return r; }
    const value = responseValue(attempt); value.usage = { total_input_tokens:8192,total_output_tokens:2048,total_thought_tokens:2048 };
    return Response.json(value);
  };
  const report=await api.runSyntheticArgonAcceptance(f.grant,f.fixture);
  expect(report.outcome).toBe(mode === 'usage-boundary' ? 'completed' : 'stopped');
  expect(callbacks(f.root)).toHaveLength(mode === 'usage-boundary' ? 3 : 1);
});

test('a second fetch callback in one execution turn is refused without an extra attempt', async () => {
  const api=await operator(),f=setup(),client=await import('../src/geminiInteractionsClient'),original=client.requestGeminiInteraction;
  vi.spyOn(client,'requestGeminiInteraction').mockImplementation(async args=>{
    const scoped=args.fetch!; let seen: any[];
    const result=await original({...args,fetch:(async(...a:any[])=>{seen=a;return (scoped as any)(...a);}) as typeof globalThis.fetch});
    await (scoped as any)(...seen!); return result;
  });
  const report=await api.runSyntheticArgonAcceptance(f.grant,f.fixture);
  expect(report).toMatchObject({outcome:'stopped',reason:'request-refused',attempts:1,toolExecutions:0});
  expect(callbacks(f.root)).toHaveLength(1);
});

test.each(['extra-flag','directory','oversize'])('actual CLI refuses %s without invoking an operator', async mode => {
  const f=setup();prepareChild(f);const file=path.join(f.root,'grant.json');
  if(mode==='oversize')fs.writeFileSync(file,Buffer.alloc(16385));
  const args=['--grant',mode==='directory'?f.root:file,...(mode==='extra-flag'?['--home',f.root]:[])];
  const result=spawnSync(bunPath(),[path.resolve('tools/runArgonAcceptance.ts'),...args],{windowsHide:true,encoding:'utf8'});
  expect(result.status).toBe(1);expect(JSON.parse(result.stdout).reason).toBe(mode==='extra-flag'?'invalid-cli-arguments':'grant-read-refused');noClaim(f.root);
});

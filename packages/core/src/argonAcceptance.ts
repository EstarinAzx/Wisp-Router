import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, verify, type KeyObject } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { ServerResponse } from 'node:http';
import { executeGeminiResponses } from './bridgeServer';
import { preflightGeminiResponses, prepareGeminiReplay } from './geminiResponses';
import { buildGeminiInteractionRequest, parseGeminiInteraction, GeminiInteractionError, type GeminiUsage, type GeminiInteractionResult } from './geminiInteractions';
import { WispHome } from './homeStore';
import type { GeminiReplayContext } from './home';

const HOME = 'C:/Users/S.D/.wisp';
const RECEIPT_NAME = 'argon-a3-component-v1.sequence-1.jsonl';
const RECEIPT = HOME + '/acceptance/' + RECEIPT_NAME;
const SEQUENCE = 'wisp/argon-a3-component-v1/sequence-1';
const PROPOSAL = 'fbce3cc01dff4be4884bc487feb53a452dee218e912e51025837cbb1527d40e8';
const HOST = 'b08757ee-de2b-4092-8d00-987f914d1226', TASK = '1702a7c7-a431-43c2-ab5f-79d9cf189643';
const POLICY = 'prepend-leading-developer-v1';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const SOURCE = 'C:/Users/S.D/.traycer/worktrees/estarinazx__wisp-router/feat-2-2-8-argon-quota';
const OUTPUT = SOURCE + '/out/release-228/argon-bounded-operator-fixes';
const BUN = 'C:/Users/S.D/.traycer/epics/' + TASK + '/scratch/bun-1.4.2/bun.exe';
// Enrollment is a separate authenticated user action. No flag, file or environment variable supplies this key.
const APPROVAL_AUTHORITY: KeyObject | null = null;
const LIMITS = Object.freeze({ attempts: 3, input: 8192, output: 2048, totalInput: 24576, totalOutput: 6144,
  requestBytes: 8192, responseBytes: 32768, attemptMs: 60000, sequenceMs: 180000, replaySteps: 64, replayPlaintextBytes: 65536 });
const ACKS = Object.freeze({ oneSequenceNoRetry: true, instructionPriorityLoss: true, tokenCostUncertain: true, localDurabilityOnly: true, credentialRaceUnqualified: true });
const provider = { id: 'gemini-api', label: 'Gemini API', kind: 'gemini-interactions' as const,
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-4-argon', apiKeyEnv: '' };
const efforts = ['low', 'medium', 'high'] as const;
const initialBody = () => ({
  model: 'argon-a3-component',
  instructions: 'You are running a bounded Wisp routing check. Use only the supplied tool data.',
  store: false, parallel_tool_calls: true,
  input: [{ type: 'message', id: 'developer-a3', role: 'developer', content: 'For the first turn, issue exactly two read_value calls in one response: key "left" and key "right". After their results, reply exactly "TOTAL=31". On the later CHECK turn, reply exactly "CHECK=31" without calling tools.' },
    { role: 'user', content: 'Read both values with read_value, then report their sum.' }] as Record<string, any>[],
  tools: [{ type: 'function', name: 'read_value', description: 'Return one fixed synthetic value.',
    parameters: { type: 'object', properties: { key: { type: 'string', enum: ['left', 'right'] } }, required: ['key'], additionalProperties: false } }],
  max_output_tokens: 2048, reasoning: { effort: 'low' as string },
});
const sha = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
type Reason = 'completed' | 'approval-authority-unavailable' | 'grant-invalid' | 'signature-invalid' | 'binding-mismatch'
  | 'source-changed' | 'path-unsafe' | 'receipt-exists' | 'receipt-io-refused' | 'receipt-write-failed' | 'receipt-order'
  | 'synthetic-only' | 'credential-changed' | 'resource-required' | 'aborted' | 'deadline-exhausted'
  | 'request-refused' | 'input-bytes-exceeded' | 'response-bytes-exceeded' | 'target-unconfirmed' | 'usage-unavailable'
  | 'usage-over-reservation' | 'unexpected-tools' | 'unexpected-answer' | 'delivery-invalid' | 'replay-refused'
  | 'invalid_request' | 'invalid_response' | 'failed' | 'cancelled' | 'incomplete' | 'auth' | 'http' | 'network';
class Refusal extends Error { constructor(readonly reason: Reason) { super(reason); } }
const fail = (reason: Reason): never => { throw new Refusal(reason); };
const check: (ok: unknown, reason: Reason) => asserts ok = (ok, reason) => { if (!ok) fail(reason); };
const reasonOf = (e: unknown): Reason => e instanceof Refusal ? e.reason : e instanceof GeminiInteractionError ? e.code : 'request-refused';
const canonical = (value: unknown): string => {
  const walk = (v: any, depth: number): any => {
    check(depth < 64, 'grant-invalid');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') { check(Number.isSafeInteger(v), 'grant-invalid'); return v; }
    check(v && typeof v === 'object', 'grant-invalid');
    if (Array.isArray(v)) return v.map(x => walk(x, depth + 1));
    check(Object.getPrototypeOf(v) === Object.prototype, 'grant-invalid');
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, walk(v[k], depth + 1)]));
  };
  return JSON.stringify(walk(value, 0));
};
const exact = (v: any, names: string[]): void => {
  check(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join('\0') === [...names].sort().join('\0'), 'grant-invalid');
};
const hashString = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v);
export type ArgonBinding = {
  version: 1; purpose: 'wisp-argon-component-acceptance'; logicalSequenceId: string; proposalSha256: string;
  hostId: string; taskId: string; credentialHome: string; receiptPath: string;
  sourceManifest: { head: string; files: { path: string; sha256: string }[] };
  executable: { bundleSha256: string; runtimeSha256: string };
  payload: { recipeSha256: string; initialBodySha256: string };
  sessionId: string; policy: typeof POLICY; credential: { lifetime: string; credentialBinding: string };
  limits: typeof LIMITS; acknowledgments: typeof ACKS;
};
export type VerifiedArgonGrant = { binding: ArgonBinding; payloadSha256: string; authoritySpkiSha256: string; signatureBase64: string };
export type ArgonAcceptanceReport = {
  outcome: 'completed' | 'refused' | 'stopped' | 'uncertain'; reason: Reason; logicalSequenceId: string;
  attempts: number; reservedInput: number; reservedOutput: number; toolExecutions: number;
  observedUsage: GeminiUsage[]; receiptPath: string; httpStatus?: number; retryAfterMs?: number;
};
const recipe = (sessionId: string) => ({ initial: initialBody(), rawHeaders: ['session-id', sessionId], efforts,
  lookups: { left: 12, right: 19 }, results: 'JSON.stringify({value}) in original call order',
  answers: ['TOTAL=31', 'CHECK=31'], limits: LIMITS });
const payloadBinding = (sessionId: string) => ({ recipeSha256: sha(canonical(recipe(sessionId))), initialBodySha256: sha(JSON.stringify(initialBody())) });
const validateBinding = (v: any): void => {
  exact(v, ['version','purpose','logicalSequenceId','proposalSha256','hostId','taskId','credentialHome','receiptPath','sourceManifest','executable','payload','sessionId','policy','credential','limits','acknowledgments']);
  check(v.version === 1 && v.purpose === 'wisp-argon-component-acceptance' && v.logicalSequenceId === SEQUENCE && v.proposalSha256 === PROPOSAL
    && v.hostId === HOST && v.taskId === TASK && v.credentialHome === HOME && v.receiptPath === RECEIPT && v.policy === POLICY && uuid(v.sessionId), 'binding-mismatch');
  check(canonical(v.limits) === canonical(LIMITS) && canonical(v.acknowledgments) === canonical(ACKS)
    && canonical(v.payload) === canonical(payloadBinding(v.sessionId)), 'binding-mismatch');
  exact(v.sourceManifest, ['head','files']); check(/^[a-f0-9]{40}$/.test(v.sourceManifest.head), 'grant-invalid');
  check(Array.isArray(v.sourceManifest.files) && v.sourceManifest.files.length > 0, 'grant-invalid');
  let previous = '';
  for (const f of v.sourceManifest.files) {
    exact(f, ['path','sha256']);
    check(typeof f.path === 'string' && /^[a-zA-Z0-9_./-]+$/.test(f.path) && !path.isAbsolute(f.path)
      && f.path.split('/').every((part: string) => part && part !== '.' && part !== '..') && f.path > previous && hashString(f.sha256), 'grant-invalid');
    previous = f.path;
  }
  exact(v.executable, ['bundleSha256','runtimeSha256']); check(Object.values(v.executable).every(hashString), 'grant-invalid');
  exact(v.credential, ['lifetime','credentialBinding']);
  check(typeof v.credential.lifetime === 'string' && /^[A-Za-z0-9_-]{22}$/.test(v.credential.lifetime)
    && typeof v.credential.credentialBinding === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v.credential.credentialBinding), 'grant-invalid');
};
const parseCanonical = (bytes: Uint8Array): any => {
  const text = Buffer.from(bytes).toString('utf8'), v = JSON.parse(text);
  check(Buffer.from(text).equals(Buffer.from(bytes)) && canonical(v) === text, 'grant-invalid');
  return v;
};
const base64 = (v: unknown): Buffer => {
  check(typeof v === 'string' && v.length > 0, 'grant-invalid');
  const b = Buffer.from(v, 'base64'); check(b.toString('base64') === v, 'grant-invalid'); return b;
};
const decodeSigned = (bytes: Uint8Array, key: KeyObject): VerifiedArgonGrant => {
  try {
    check(bytes instanceof Uint8Array && bytes.byteLength <= 16384, 'grant-invalid');
    const envelope = parseCanonical(bytes); exact(envelope, ['payloadBase64','signatureBase64']);
    const payload = base64(envelope.payloadBase64), signature = base64(envelope.signatureBase64);
    check(signature.length === 64 && key.type === 'public' && key.asymmetricKeyType === 'ed25519', 'grant-invalid');
    check(verify(null, payload, key, signature), 'signature-invalid');
    const binding = parseCanonical(payload); validateBinding(binding);
    return { binding, payloadSha256: sha(payload), authoritySpkiSha256: sha(key.export({ type: 'spki', format: 'der' })), signatureBase64: envelope.signatureBase64 };
  } catch (e) { if (e instanceof Refusal) throw e; return fail('grant-invalid'); }
};
export const verifyArgonGrant = (bytes: Uint8Array, trustedPublicKey: KeyObject, expected: ArgonBinding): VerifiedArgonGrant => {
  const grant = decodeSigned(bytes, trustedPublicKey);
  validateBinding(expected); check(canonical(grant.binding) === canonical(expected), 'binding-mismatch');
  const freeze = (v: any): void => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } };
  freeze(grant); return grant;
};
const samePath = (a: string, b: string): boolean => process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
const directory = (root: string): void => {
  try {
    const full = path.resolve(root); let at = path.parse(full).root;
    for (const part of full.slice(at.length).split(path.sep).filter(Boolean)) {
      at = path.join(at, part); const s = fs.lstatSync(at);
      check(s.isDirectory() && !s.isSymbolicLink(), 'path-unsafe');
    }
    check(samePath(fs.realpathSync.native(full), full), 'path-unsafe');
  } catch { fail('path-unsafe'); }
};
const receiptPath = (home: string): string => {
  directory(home);
  const parent = path.join(home, 'acceptance');
  try { fs.mkdirSync(parent); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') fail('receipt-io-refused'); }
  directory(parent);
  const p = path.join(parent, RECEIPT_NAME);
  try { const stat = fs.lstatSync(p); check(!stat.isSymbolicLink(), 'path-unsafe'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  return p;
};
export type ArgonReceipt = {
  readonly attempts: number; readonly reservedInput: number; readonly reservedOutput: number;
  reserve: (wire: string, attempt: 1 | 2 | 3, previousResultSha256: string | null) => void;
  result: (evidence: { attempt: 1 | 2 | 3; responseSha256: string; usage: GeminiUsage; status: 'requires_action' | 'completed'; deliveredToLocalSink: true }) => void;
  close: (outcome: 'completed' | 'stopped' | 'uncertain', reason: Reason, checkCompletion?: () => void) => void;
};
// ponytail: permanent cooperative local-file claim; rollback/deletion and power-loss durability require external reconciliation.
const openReceipt = (grant: VerifiedArgonGrant, home: string): ArgonReceipt => {
  const file = receiptPath(home); let fd: number;
  try { fd = fs.openSync(file, 'wx', 0o600); }
  catch (e) { return fail((e as NodeJS.ErrnoException).code === 'EEXIST' ? 'receipt-exists' : 'receipt-io-refused'); }
  let seq = 0, previous = '', attempts = 0, pending = false, lastResult: string | null = null, closed = false, broken = false;
  const append = (entry: object): void => {
    check(!broken && !closed, 'receipt-write-failed');
    try {
      const base = { seq, previous, entry }, digest = sha(JSON.stringify(base));
      fs.writeFileSync(fd, JSON.stringify({ ...base, digest }) + '\n');
      fs.fsyncSync(fd);
      seq++; previous = digest;
    } catch { broken = true; try { fs.closeSync(fd); } catch {} fail('receipt-write-failed'); }
  };
  append({ type: 'header', grant, pid: process.pid });
  return {
    get attempts() { return attempts; }, get reservedInput() { return attempts * LIMITS.input; }, get reservedOutput() { return attempts * LIMITS.output; },
    reserve: (wire, attempt, previousResultSha256) => {
      check(!closed && !pending && attempt === attempts + 1 && attempt <= LIMITS.attempts && previousResultSha256 === lastResult, 'receipt-order');
      check(typeof wire === 'string' && Buffer.byteLength(wire, 'utf8') <= LIMITS.requestBytes, 'input-bytes-exceeded');
      attempts++; pending = true;
      append({ type: 'reserve', attempt, wireSha256: sha(wire), wireBytes: Buffer.byteLength(wire, 'utf8'), previousResultSha256,
        attempts, reservedInput: attempts * LIMITS.input, reservedOutput: attempts * LIMITS.output });
    },
    result: evidence => {
      check(pending && evidence.attempt === attempts && hashString(evidence.responseSha256) && evidence.deliveredToLocalSink === true, 'receipt-order');
      append({ type: 'result', ...evidence, usageSha256: sha(canonical(evidence.usage)) });
      lastResult = evidence.responseSha256; pending = false;
    },
    close: (outcome, reason, checkCompletion) => {
      check(!closed && !broken, 'receipt-write-failed');
      check(outcome !== 'completed' || (attempts === 3 && !pending && reason === 'completed'), 'receipt-order');
      const terminal = { type: 'close', outcome, reason, attempts, reservedInput: attempts * LIMITS.input, reservedOutput: attempts * LIMITS.output };
      try {
        append(terminal);
        // A synchronous flush can cross the deadline. The final chained record supersedes the candidate.
        try { checkCompletion?.(); }
        catch (e) { append({ ...terminal, outcome: 'stopped', reason: reasonOf(e) }); throw e; }
      }
      finally { closed = true; if (!broken) { try { fs.closeSync(fd); } catch { fail('receipt-write-failed'); } } }
    },
  };
};
const assertFiles = (binding: ArgonBinding, source: string, bundle: string, runtime: string): void => {
  try {
    directory(source);
    for (const f of binding.sourceManifest.files) {
      const p = path.join(source, f.path); directory(path.dirname(p));
      check(fs.lstatSync(p).isFile() && !fs.lstatSync(p).isSymbolicLink() && sha(fs.readFileSync(p)) === f.sha256, 'source-changed');
    }
    for (const [p, wanted] of [[bundle, binding.executable.bundleSha256], [runtime, binding.executable.runtimeSha256]]) {
      directory(path.dirname(p)); check(fs.lstatSync(p).isFile() && !fs.lstatSync(p).isSymbolicLink() && sha(fs.readFileSync(p)) === wanted, 'source-changed');
    }
  } catch { fail('source-changed'); }
};
const liveBinding = (signed: ArgonBinding): ArgonBinding => {
  try {
    check(samePath(process.execPath, BUN) && samePath(process.argv[1], OUTPUT + '/operator.mjs'), 'source-changed');
    const git = (...args: string[]) => execFileSync('git', ['-C', SOURCE, ...args], { encoding: 'utf8', windowsHide: true }).trim();
    check(git('status', '--porcelain=v1') === '', 'source-changed');
    const files = (relative: string): string[] => fs.readdirSync(path.join(SOURCE, relative), { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? files(relative + '/' + e.name) : [relative + '/' + e.name]);
    const names = [...files('packages/core/src'), 'packages/core/tools/runArgonAcceptance.ts', 'package.json', 'packages/core/package.json',
      'packages/tui/package.json', 'packages/vscode/package.json', 'bun.lock'].sort();
    const sourceManifest = { head: git('rev-parse', 'HEAD'), files: names.map(p => ({ path: p, sha256: sha(fs.readFileSync(path.join(SOURCE, p))) })) };
    const executable = { bundleSha256: sha(fs.readFileSync(OUTPUT + '/operator.mjs')), runtimeSha256: sha(fs.readFileSync(BUN)) };
    const seal = JSON.parse(fs.readFileSync(OUTPUT + '/operator-build.json', 'utf8'));
    check(canonical(seal.sourceManifest) === canonical(sourceManifest) && canonical(seal.executable) === canonical(executable)
      && canonical(seal.command) === canonical(['build','packages/core/tools/runArgonAcceptance.ts','--target=bun','--format=esm','--outfile=out/release-228/argon-bounded-operator-fixes/operator.mjs']), 'source-changed');
    return { ...signed, sourceManifest, executable, payload: payloadBinding(signed.sessionId) };
  } catch { return fail('source-changed'); }
};
export const claimArgonReceipt = (grant: VerifiedArgonGrant): ArgonReceipt => {
  if (!APPROVAL_AUTHORITY) return fail('approval-authority-unavailable');
  const bytes = Buffer.from(canonical({ payloadBase64: Buffer.from(canonical(grant.binding)).toString('base64'), signatureBase64: grant.signatureBase64 }));
  return openReceipt(verifyArgonGrant(bytes, APPROVAL_AUTHORITY, liveBinding(grant.binding)), HOME);
};
const emptyReport = (reason: Reason, receipt = RECEIPT): ArgonAcceptanceReport => ({
  outcome: 'refused', reason, logicalSequenceId: SEQUENCE, attempts: 0, reservedInput: 0, reservedOutput: 0, toolExecutions: 0, observedUsage: [], receiptPath: receipt,
});
type Environment = { home: string; fetch: typeof globalThis.fetch; now: () => number; currentSource: () => void;
  claim: () => ArgonReceipt; signal?: AbortSignal; fixtureCredential?: string };
const run = async (grant: VerifiedArgonGrant, env: Environment): Promise<ArgonAcceptanceReport> => {
  const report = emptyReport('request-refused', path.join(env.home, 'acceptance', RECEIPT_NAME));
  let receipt: ArgonReceipt | undefined, guardReason: Reason | undefined, terminalAttempted = false;
  const body = initialBody(), headers = ['session-id', grant.binding.sessionId];
  const expectedInput: Record<string, any>[] = [{ type: 'user_input', content: [{ type: 'text', text: body.input[1].content }] }];
  let retained: GeminiReplayContext | undefined, previousResult: string | null = null;
  try {
    preflightGeminiResponses(body, headers, provider, 'gemini-4-argon', POLICY);
    env.currentSource(); if (env.signal?.aborted) fail('aborted');
    receipt = env.claim();
    const started = env.now(), home = new WispHome(env.home);
    for (const [index, effort] of efforts.entries()) {
      const attempt = (index + 1) as 1 | 2 | 3, attemptStart = env.now();
      const deadline = Math.min(started + LIMITS.sequenceMs, attemptStart + LIMITS.attemptMs);
      const controller = new AbortController();
      const abort = () => controller.abort();
      env.signal?.addEventListener('abort', abort, { once: true });
      if (env.signal?.aborted) abort();
      const checkTime = () => {
        if (env.signal?.aborted) fail('aborted');
        check(Number.isFinite(env.now()) && env.now() < deadline && !controller.signal.aborted, 'deadline-exhausted');
      };
      const timer = setTimeout(abort, Math.max(1, deadline - env.now()));
      const current = () => {
        checkTime(); env.currentSource();
        if (retained) {
          try { home.assertGeminiCurrent(retained); } catch { fail('credential-changed'); }
        }
        checkTime();
      };
      const interrupted = <T>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
        const cleanup = () => controller.signal.removeEventListener('abort', onAbort);
        const onAbort = () => { cleanup(); reject(new Refusal(env.signal?.aborted ? 'aborted' : 'deadline-exhausted')); };
        controller.signal.addEventListener('abort', onAbort, { once: true });
        if (controller.signal.aborted) onAbort();
        promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
      });
      let expectedWire = '', apiKey = '', fetches = 0, result: GeminiInteractionResult | undefined, responseSha256 = '';
      let captured: Record<string, any> | undefined, heads = 0;
      body.reasoning = { effort };
      const seam = {
        instructionPolicy: () => POLICY,
        replayContext: () => {
          current();
          if (!retained) { try { retained = home.geminiReplayContext(); } catch { fail('credential-changed'); } }
          check(retained, 'resource-required');
          check(retained.lifetime === grant.binding.credential.lifetime && retained.credentialBinding === grant.binding.credential.credentialBinding, 'credential-changed');
          try { expectedWire = JSON.stringify(buildGeminiInteractionRequest(prepareGeminiReplay(
            preflightGeminiResponses(body, headers, provider, 'gemini-4-argon', POLICY), retained).request)); }
          catch { fail('replay-refused'); }
          return retained;
        },
        credentials: (context: GeminiReplayContext) => {
          current(); check(context === retained, 'credential-changed');
          try { apiKey = home.geminiCredentials(context); } catch { fail('credential-changed'); }
          if (env.fixtureCredential !== undefined) check(apiKey === env.fixtureCredential, 'synthetic-only');
          return apiKey;
        },
        assertCurrent: (context: GeminiReplayContext) => { check(context === retained, 'credential-changed'); current(); },
      };
      const sink = {
        writeHead: (status: number, h: Record<string, string>) => {
          current(); check(heads++ === 0 && status === 200 && h['Content-Type'] === 'application/json', 'delivery-invalid');
        },
        end: (raw: string) => {
          current(); check(heads === 1 && !captured && typeof raw === 'string', 'delivery-invalid');
          try {
            const value = JSON.parse(raw);
            check(value.object === 'response' && value.status === 'completed' && Array.isArray(value.output), 'delivery-invalid');
            captured = value;
          } catch { fail('delivery-invalid'); }
        },
      } as unknown as ServerResponse;
      const scopedFetch = (async (url: unknown, init?: RequestInit) => {
        let received: Response | undefined;
        try {
          check(++fetches === 1 && url === ENDPOINT && init?.method === 'POST' && init.redirect === 'manual'
            && init.signal === controller.signal && typeof init.body === 'string' && init.body === expectedWire, 'request-refused');
          const requestHeaders = new Headers(init.headers);
          check(Array.from(requestHeaders.keys()).sort().join(',') === 'content-type,x-goog-api-key'
            && requestHeaders.get('content-type') === 'application/json' && requestHeaders.get('x-goog-api-key') === apiKey, 'request-refused');
          check(Buffer.byteLength(init.body, 'utf8') <= LIMITS.requestBytes, 'input-bytes-exceeded');
          // Independently bind the recipe, even if the shared mapper itself regresses.
          const wire = JSON.parse(init.body);
          check(canonical(wire) === canonical({ model: 'gemini-4-argon', input: expectedInput,
            system_instruction: body.instructions + '\n\n' + body.input[0].content,
            tools: [{ type: 'function', name: 'w_5dde37c342971d66c115a29087f1ea61a347d7aaa0b60a3ce48cadc27547',
              description: 'read_value (function). Return one fixed synthetic value.', parameters: body.tools[0].parameters }],
            generation_config: { thinking_level: effort, max_output_tokens: 2048 }, store: false, stream: false, background: false }), 'request-refused');
          current();
          receipt!.reserve(init.body, attempt, previousResult);
          // No await, serialization or yield between the flushed reservation and this single invocation.
          checkTime();
          const pending = env.fetch(url as string, init);
          pending.then(r => { if (controller.signal.aborted) void r.body?.cancel().catch(() => {}); }, () => {});
          const response = await interrupted(pending);
          received = response;
          if (!response.ok || response.redirected) {
            // Keep HTTP metadata, but never hand an unbounded cancellation promise to the client.
            const error = new Response(null, { status: response.status, headers: response.headers });
            if (response.redirected) Object.defineProperty(error, 'redirected', { value: true });
            return error;
          }
          current();
          const reader = response.body?.getReader(); check(reader, 'invalid_response');
          const chunks: Uint8Array[] = []; let size = 0;
          try {
            while (true) {
              checkTime(); const part = await interrupted(reader.read()); checkTime();
              if (part.done) break;
              size += part.value.byteLength; check(size <= LIMITS.responseBytes, 'response-bytes-exceeded'); chunks.push(part.value);
            }
          } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
          current();
          const bytes = Buffer.concat(chunks); let raw: any;
          try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('invalid_response'); }
          check(raw?.model === 'gemini-4-argon', 'target-unconfirmed');
          result = parseGeminiInteraction(raw);
          if (result.usage) report.observedUsage.push(result.usage);
          check(result.usage?.total_input_tokens !== undefined && result.usage.total_output_tokens !== undefined, 'usage-unavailable');
          check(result.usage.total_input_tokens <= LIMITS.input && result.usage.total_output_tokens <= LIMITS.output
            && (result.usage.total_thought_tokens ?? 0) <= LIMITS.output, 'usage-over-reservation');
          const calls = result.steps.filter(s => s.type === 'function_call');
          if (index === 0) {
            const name = JSON.parse(expectedWire).tools[0].name;
            check(result.status === 'requires_action' && calls.length === 2 && calls.every(c => c.name === name && Object.keys(c.arguments).join(',') === 'key'
              && (c.arguments.key === 'left' || c.arguments.key === 'right'))
              && calls[0].arguments.key !== calls[1].arguments.key, 'unexpected-tools');
          } else {
            const text = result.steps.flatMap(s => s.type === 'model_output' ? s.content?.map(c => c.text) ?? [] : []).join('');
            check(result.status === 'completed' && calls.length === 0 && text === (index === 1 ? 'TOTAL=31' : 'CHECK=31'), 'unexpected-answer');
          }
          responseSha256 = sha(bytes);
          return new Response(bytes, { status: response.status, headers: response.headers });
        } catch (e) { if (e instanceof Refusal || e instanceof GeminiInteractionError) guardReason = reasonOf(e); throw e; }
        finally { void received?.body?.cancel().catch(() => {}); }
      }) as typeof globalThis.fetch;
      try {
        current();
        await executeGeminiResponses(body, headers, { provider, matched: 'alias', pinnedModel: 'gemini-4-argon' },
          { gemini: seam, modelMap: () => ({}), effort: () => effort }, controller.signal, sink, scopedFetch);
        current(); check(captured && result && fetches === 1, 'delivery-invalid');
        const accepted = result as GeminiInteractionResult;
        receipt.result({ attempt, responseSha256, usage: accepted.usage!, status: accepted.status, deliveredToLocalSink: true });
        current();
        previousResult = responseSha256;
        body.input.push(...captured.output);
        expectedInput.push(...accepted.steps);
        if (index === 0) for (const call of accepted.steps.filter(s => s.type === 'function_call')) {
          const output = JSON.stringify({ value: call.arguments.key === 'left' ? 12 : 19 });
          body.input.push({ type: 'function_call_output', call_id: call.id, output });
          expectedInput.push({ type: 'function_result', call_id: call.id, result: output });
          report.toolExecutions++;
        }
        if (index === 1) {
          body.input.push({ role: 'user', content: 'CHECK' });
          expectedInput.push({ type: 'user_input', content: [{ type: 'text', text: 'CHECK' }] });
        }
        if (index === 2) {
          current(); terminalAttempted = true;
          receipt.close('completed', 'completed', current);
          report.outcome = 'completed'; report.reason = 'completed';
        }
      } finally { clearTimeout(timer); env.signal?.removeEventListener('abort', abort); }
    }
  } catch (e) {
    report.reason = guardReason ?? reasonOf(e);
    report.outcome = report.reason === 'receipt-write-failed' ? 'uncertain' : receipt ? 'stopped' : 'refused';
    if (e instanceof GeminiInteractionError) {
      if (e.status !== undefined) report.httpStatus = e.status;
      if (e.retryAfterMs !== undefined) report.retryAfterMs = e.retryAfterMs;
    }
    if (receipt && !terminalAttempted) try { receipt.close('stopped', report.reason); } catch { report.outcome = 'uncertain'; report.reason = 'receipt-write-failed'; }
  }
  if (receipt) { report.attempts = receipt.attempts; report.reservedInput = receipt.reservedInput; report.reservedOutput = receipt.reservedOutput; }
  return report;
};
export const runArgonAcceptance = async (grantBytes: Uint8Array, signal?: AbortSignal): Promise<ArgonAcceptanceReport> => {
  if (!APPROVAL_AUTHORITY) return emptyReport('approval-authority-unavailable');
  try {
    const signed = decodeSigned(grantBytes, APPROVAL_AUTHORITY);
    const expected = liveBinding(signed.binding), grant = verifyArgonGrant(grantBytes, APPROVAL_AUTHORITY, expected);
    return await run(grant, { home: HOME, signal, now: () => performance.now(), fetch: globalThis.fetch,
      claim: () => claimArgonReceipt(grant), currentSource: () => {
        check(canonical(liveBinding(grant.binding)) === canonical(grant.binding), 'source-changed');
        assertFiles(grant.binding, SOURCE, OUTPUT + '/operator.mjs', BUN);
      } });
  } catch (e) { return emptyReport(reasonOf(e)); }
};
// Fixture-only entry. It is not imported by the CLI and is removed from that bundle.
export const runSyntheticArgonAcceptance = async (grantBytes: Uint8Array, fixture: {
  root: string; expected: ArgonBinding; publicKey: KeyObject; apiKey: string; fetch: typeof globalThis.fetch;
  now?: () => number; signal?: AbortSignal;
}): Promise<ArgonAcceptanceReport> => {
  try {
    check(fixture.apiKey === 'SYNTHETIC_ARGON_A3_DO_NOT_USE' && typeof fixture.fetch === 'function' && fixture.fetch !== globalThis.fetch
      && typeof fixture.root === 'string' && path.isAbsolute(fixture.root)
      && samePath(path.dirname(fixture.root), os.tmpdir()) && path.basename(fixture.root).startsWith('wisp-argon-a3-'), 'synthetic-only');
    const grant = verifyArgonGrant(grantBytes, fixture.publicKey, fixture.expected);
    return await run(grant, { home: fixture.root, signal: fixture.signal, fixtureCredential: fixture.apiKey, fetch: fixture.fetch, now: fixture.now ?? (() => performance.now()),
      claim: () => openReceipt(grant, fixture.root),
      currentSource: () => assertFiles(grant.binding, path.join(fixture.root, 'source'), path.join(fixture.root, 'operator.mjs'), path.join(fixture.root, 'runtime')) });
  } catch (e) { return emptyReport(reasonOf(e)); }
};

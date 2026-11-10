import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { WispHome } from '../../src/homeStore';

export const SENTINEL = 'SYNTHETIC_ARGON_A3_DO_NOT_USE';
export const wireName = 'w_5dde37c342971d66c115a29087f1ea61a347d7aaa0b60a3ce48cadc27547';
export const receiptName = 'argon-a3-component-v1.sequence-1.jsonl';
export const sha = (v: string | Uint8Array) => crypto.createHash('sha256').update(v).digest('hex');
export const canonical = (v: any): string => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
export const limits = { attempts: 3, input: 8192, output: 2048, totalInput: 24576, totalOutput: 6144, requestBytes: 8192, responseBytes: 32768, attemptMs: 60000, sequenceMs: 180000, replaySteps: 64, replayPlaintextBytes: 65536 };
export const initialBody = () => ({
  model: 'argon-a3-component',
  instructions: 'You are running a bounded Wisp routing check. Use only the supplied tool data.',
  store: false, parallel_tool_calls: true,
  input: [{ type: 'message', id: 'developer-a3', role: 'developer', content: 'For the first turn, issue exactly two read_value calls in one response: key "left" and key "right". After their results, reply exactly "TOTAL=31". On the later CHECK turn, reply exactly "CHECK=31" without calling tools.' },
    { role: 'user', content: 'Read both values with read_value, then report their sum.' }],
  tools: [{ type: 'function', name: 'read_value', description: 'Return one fixed synthetic value.',
    parameters: { type: 'object', properties: { key: { type: 'string', enum: ['left', 'right'] } }, required: ['key'], additionalProperties: false } }],
  max_output_tokens: 2048, reasoning: { effort: 'low' },
});
export const recipe = (sessionId: string) => ({ initial: initialBody(), rawHeaders: ['session-id', sessionId],
  efforts: ['low', 'medium', 'high'], lookups: { left: 12, right: 19 }, results: 'JSON.stringify({value}) in original call order',
  answers: ['TOTAL=31', 'CHECK=31'], limits });
export const responseValue = (attempt: number): any => ({
  model: 'gemini-4-argon', status: attempt === 1 ? 'requires_action' : 'completed',
  steps: attempt === 1 ? [{ type: 'thought', signature: 'original-thought-α' },
    { type: 'function_call', id: 'google-right', name: wireName, arguments: { key: 'right' } },
    { type: 'function_call', id: 'google-left', name: wireName, arguments: { key: 'left' } }]
    : [{ type: 'model_output', content: [{ type: 'text', text: attempt === 2 ? 'TOTAL=31' : 'CHECK=31' }] }],
  usage: { total_input_tokens: 100, total_output_tokens: 20, total_thought_tokens: 7 },
});
export const encodeGrant = (binding: any, privateKey: crypto.KeyObject, payload = canonical(binding)) => Buffer.from(canonical({
  payloadBase64: Buffer.from(payload).toString('base64'), signatureBase64: crypto.sign(null, Buffer.from(payload), privateKey).toString('base64'),
}));
export const journal = (root: string, kind: string, data: any = {}) => {
  const line = JSON.stringify({ root, kind, ...data }) + '\n';
  fs.appendFileSync(path.join(root, 'events.jsonl'), line);
  if (process.env.WISP_ARGON_TEST_EVENTS) fs.appendFileSync(process.env.WISP_ARGON_TEST_EVENTS, line);
};
export const events = (root: string): any[] => fs.existsSync(path.join(root, 'events.jsonl'))
  ? fs.readFileSync(path.join(root, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(s => JSON.parse(s)) : [];
export const frames = (root: string): any[] => fs.existsSync(path.join(root, 'acceptance', receiptName))
  ? fs.readFileSync(path.join(root, 'acceptance', receiptName), 'utf8').trim().split('\n').filter(Boolean).map(s => JSON.parse(s)) : [];
export const makeFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wisp-argon-a3-'));
  journal(root, 'fixture-created');
  fs.mkdirSync(path.join(root, 'source')); fs.writeFileSync(path.join(root, 'source', 'fixture.txt'), 'reviewed synthetic source');
  fs.writeFileSync(path.join(root, 'operator.mjs'), 'synthetic bundled operator'); fs.writeFileSync(path.join(root, 'runtime'), 'synthetic pinned runtime');
  const home = new WispHome(root); home.saveGeminiApiKey(SENTINEL, null); const context = home.geminiReplayContext()!;
  const keys = crypto.generateKeyPairSync('ed25519');
  const sessionId = '11111111-1111-4111-8111-111111111119';
  const binding: any = {
    version: 1, purpose: 'wisp-argon-component-acceptance', logicalSequenceId: 'wisp/argon-a3-component-v1/sequence-1',
    proposalSha256: 'fbce3cc01dff4be4884bc487feb53a452dee218e912e51025837cbb1527d40e8',
    hostId: 'b08757ee-de2b-4092-8d00-987f914d1226', taskId: '1702a7c7-a431-43c2-ab5f-79d9cf189643',
    credentialHome: 'C:/Users/S.D/.wisp', receiptPath: 'C:/Users/S.D/.wisp/acceptance/' + receiptName,
    sourceManifest: { head: 'a'.repeat(40), files: [{ path: 'fixture.txt', sha256: sha('reviewed synthetic source') }] },
    executable: { bundleSha256: sha('synthetic bundled operator'), runtimeSha256: sha('synthetic pinned runtime') },
    payload: { recipeSha256: sha(canonical(recipe(sessionId))), initialBodySha256: sha(JSON.stringify(initialBody())) },
    sessionId, policy: 'prepend-leading-developer-v1', credential: { lifetime: context.lifetime, credentialBinding: context.credentialBinding },
    limits, acknowledgments: { oneSequenceNoRetry: true, instructionPriorityLoss: true, tokenCostUncertain: true, localDurabilityOnly: true, credentialRaceUnqualified: true },
  };
  const fixture: any = { root, expected: binding, publicKey: keys.publicKey, apiKey: SENTINEL,
    fetch: async (url: unknown, init: RequestInit) => {
      const attempt = events(root).filter(e => e.kind === 'fetch').length + 1;
      journal(root, 'fetch', { attempt, url, body: JSON.parse(init.body as string) });
      return Response.json(responseValue(attempt));
    } };
  return { root, home, context, keys, binding, fixture, grant: encodeGrant(binding, keys.privateKey) };
};
export const removeFixture = (root: string) => {
  const full = path.resolve(root), parent = path.resolve(os.tmpdir());
  if (path.dirname(full) !== parent || !path.basename(full).startsWith('wisp-argon-a3-')) throw Error('unsafe fixture cleanup');
  const receipt = path.join(full, 'acceptance', receiptName);
  if (fs.existsSync(receipt) && fs.lstatSync(receipt).isFile()) journal(full, 'receipt-final', { raw: fs.readFileSync(receipt, 'utf8') });
  fs.rmSync(full, { recursive: true, force: true });
  if (process.env.WISP_ARGON_TEST_EVENTS) fs.appendFileSync(process.env.WISP_ARGON_TEST_EVENTS, JSON.stringify({ root: full, kind: 'fixture-removed', absent: !fs.existsSync(full) }) + '\n');
};

// Explicit paid-call research runner: bun <this-file> --live <fixture-directory>
// Directory must contain harmless a.png/b.png; writes only synthetic image metadata/model answers.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WispHome } from '../../packages/core/src/homeStore';
import { XaiAuth } from '../../packages/core/src/xaiAuth';
import { xaiStream } from '../../packages/core/src/xaiClient';
import { parseDesktopResponsesRequest } from '../../packages/core/src/bridgeResponses';
import { toCodexResponsesTools } from '../../packages/core/src/codex';
import { desktopUpstreamFailure } from '../../packages/core/src/desktopUpstream';

assert.equal(process.argv[2], '--live', 'Requires explicit --live; performs up to six provider calls');
const directory = process.argv[3]; assert.ok(directory);
const crop = process.argv[4] === '--crop';
const pngs = ['a', 'b'].map(name => readFileSync(join(directory, `${name}.png`)));
const fingerprint = (bytes: Buffer) => ({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
const image = (index: number, detail?: string) => ({ type: 'input_image', image_url: `data:image/png;base64,${pngs[index].toString('base64')}`, ...(detail ? { detail } : {}) });
const text = (value: string) => ({ type: 'input_text', text: value });
const user = (content: unknown[]) => ({ type: 'message', role: 'user', content });
const tool = { type: 'function', name: 'view_image', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } };
const question = crop ? 'Describe only the most recent image and read its exact text. If you cannot see it, say so. Answer in one short sentence; do not call tools.'
  : 'Describe only the most recent image. State its geometric shape, color, and exact printed label. If you cannot see it, say so. Answer in one short sentence; do not call tools.';
const toolPair = (detail?: string) => [
  { type: 'function_call', call_id: 'current_image', name: 'view_image', arguments: '{"path":"synthetic-b.png"}' },
  { type: 'function_call_output', call_id: 'current_image', output: [image(1, detail)] },
];
const cases = (crop ? ['attachment', 'tool'] : ['attachment', 'tool', 'history']).flatMap(kind => (crop ? [undefined] : [undefined, 'original']).map(detail => ({
  name: `${kind}-${detail ?? 'default'}`,
  input: kind === 'attachment' ? [user([image(1, detail), text(question)])]
    : kind === 'tool' ? [user([text('Inspect the supplied image.')]), ...toolPair(detail), user([text(question)])]
    : [user([image(0), text('Earlier image.')]), { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Earlier image: red triangle A17.' }] },
      user([text('Now inspect the new image.')]), ...toolPair(detail), user([text(question)])],
})));
const evidence: any = { started: new Date().toISOString(), model: 'grok-4.6', fixtureImages: pngs.map(fingerprint), maxCalls: cases.length, calls: [], credentialsLogged: false };
const save = () => writeFileSync(join(directory, 'results.json'), JSON.stringify(evidence, null, 2) + '\n');
const home = new WispHome();
const nativeFetch = globalThis.fetch;
let count = 0;
try {
  // No import, sign-in repair, or configuration reads. Existing manager may do normal token refresh.
  assert.ok(home.readAuth().xai?.accessToken, 'Existing Wisp xAI sign-in required');
  const auth = new XaiAuth({ read: () => home.readAuth().xai, write: creds => { home.writeAuth({ xai: creds }); } }, async () => false, () => {});
  const creds = await auth.current(); assert.ok(creds?.accessToken);
  for (const scenario of cases) {
    const row: any = { name: scenario.name, started: new Date().toISOString() }; evidence.calls.push(row);
    const parsed = parseDesktopResponsesRequest({ model: 'grok-fixture', store: false, input: scenario.input, tools: [tool] });
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(url), 'https://api.x.ai/v1/responses'); assert.ok(++count <= cases.length);
      const body = JSON.parse(init!.body as string);
      row.outgoing = body.input.flatMap((item: any, itemIndex: number) => (Array.isArray(item.output) ? item.output : item.content ?? []).flatMap((part: any, partIndex: number) => {
        if (part.type !== 'input_image') return [];
        const bytes = Buffer.from(part.image_url.split(',')[1], 'base64');
        assert.ok(pngs.some(expected => expected.equals(bytes)), 'Unexpected outgoing image');
        return [{ itemIndex, partIndex, type: item.type, callId: item.call_id, detail: part.detail ?? 'absent', ...fingerprint(bytes) }];
      }));
      assert.equal(body.store, false); save();
      const response = await nativeFetch(url, init); row.httpStatus = response.status; return response;
    }) as typeof fetch;
    try {
      let answer = '';
      for await (const event of xaiStream({ creds, baseUrl: 'https://api.x.ai/v1', model: 'grok-4.6', rejectRedirects: true,
        messages: [{ role: 'system', content: 'Report only what you can visually identify. Be brief.' }, ...parsed.turns.map(t => ({ role: t.role, content: t.text, contentParts: t.contentParts, toolCalls: t.toolCalls, toolResults: t.toolResults }))],
        tools: toCodexResponsesTools(parsed.tools, false), responses: parsed.responses, effort: 'low', signal: AbortSignal.timeout(60_000) })) {
        if (event.type === 'text') answer += event.value;
        if (event.type === 'usage') row.usage = event.usage;
      }
      row.answer = answer;
      row.matchesExpected = crop ? /Synthetic Q73/.test(answer) : /blue/i.test(answer) && /circle/i.test(answer) && /B29/.test(answer);
    } catch (error) {
      row.failure = desktopUpstreamFailure(error); // Fixed vocabulary; never log raw response/error/auth data.
    } finally { globalThis.fetch = nativeFetch; row.ended = new Date().toISOString(); save(); }
    console.log(JSON.stringify(row));
    if (row.failure && (row.httpStatus === undefined || [401, 403, 429].includes(row.httpStatus) || row.httpStatus >= 500)) break;
  }
} catch {
  evidence.setupFailure = 'Unable to complete controlled check; no raw credential or error data recorded';
} finally { globalThis.fetch = nativeFetch; evidence.completed = new Date().toISOString(); save(); }

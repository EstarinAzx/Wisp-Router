// Offline research fixture. Run from repo root: bun docs/investigations/2.2.5-grok-vision-check.ts
// Uses the production signed Desktop Bridge with synthetic dependencies; ALL fetches are intercepted.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { inflateSync } from 'node:zlib';
import { createBridgeServer, type BridgeDeps } from '../../packages/core/src/bridgeServer';

const red = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg==';
const blue = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR4nGNgYPgPRmAKABf2A/1+6zfzAAAAAElFTkSuQmCC';
const hash = (base64: string) => createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex');
// Real 2x2 RGB PNGs, independently check decoded scanlines instead of using base64 of arbitrary text.
for (const [data, pixel] of [[red, [255, 0, 0]], [blue, [0, 0, 255]]] as const) {
  const bytes = Buffer.from(data, 'base64');
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  assert.equal(bytes.readUInt32BE(16), 2); assert.equal(bytes.readUInt32BE(20), 2);
  const raw = inflateSync(bytes.subarray(41, 41 + bytes.readUInt32BE(33)));
  assert.deepEqual([...raw], [0, ...pixel, ...pixel, 0, ...pixel, ...pixel]);
}
assert.notEqual(hash(red), hash(blue));
const image = (base64: string, detail = 'auto') => ({ type: 'input_image', image_url: `data:image/png;base64,${base64}`, detail });
const text = (value: string) => ({ type: 'input_text', text: value });
const user = (content: unknown[]) => ({ type: 'message', role: 'user', content });
const tool = { type: 'function', name: 'view_image', parameters: { type: 'object', properties: { path: { type: 'string' } } } };
const call = (id: string) => ({ type: 'function_call', name: 'view_image', call_id: id, arguments: JSON.stringify({ path: `${id}.png` }) });
const output = (id: string, data: string) => ({ type: 'function_call_output', call_id: id, output: [text(`before ${id}`), image(data), text(`after ${id}`)] });
const seen: any[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  assert.equal(String(url), 'https://api.x.ai/v1/responses');
  assert.equal(init?.redirect, 'error');
  seen.push(JSON.parse(init!.body as string));
  return new Response('event: response.completed\ndata: {"response":{"output":[{"type":"message","content":[{"type":"output_text","text":"FIXTURE_OK"}]}]}}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
}) as typeof fetch;
const spare = createServer();
await new Promise<void>(resolve => spare.listen(0, '127.0.0.1', resolve));
const port = (spare.address() as AddressInfo).port;
await new Promise<void>(resolve => spare.close(() => resolve()));
const provider = { id: 'xai', label: 'Grok', kind: 'xai-oauth' as const, baseUrl: 'https://synthetic.invalid/v1', defaultModel: 'grok-4.6', apiKeyEnv: '' };
const bridge = createBridgeServer({
  providers: [provider], modelMap: () => ({}), customBaseUrl: () => '', keyFor: async () => '', clientFor: async () => undefined,
  codexSignedIn: async () => false, codexCreds: async () => undefined, anthropicSignedIn: async () => false, anthropicCreds: async () => undefined,
  xaiCreds: async () => ({ accessToken: 'synthetic-only' }), effort: () => 'medium', activeProviderId: () => 'xai',
  routingMap: () => ({ families: {}, aliases: [{ name: 'grok-fixture', target: { providerId: 'xai', model: 'grok-4.6' } }] }),
  aliasPickerShowsModel: () => false, aliasOnlyModels: () => false, port: () => port, accessSecret: () => 'synthetic-local', log: () => {},
  desktopNativeModels: () => ['gpt-6-astra'], nativeFetch: async () => { throw new Error('Unexpected native path'); },
} satisfies BridgeDeps);
const post = (input: unknown[], extra = {}): Promise<{ status: number; body: string }> => new Promise((resolve, reject) => {
  const req = request({ hostname: '127.0.0.1', port, path: '/codex-desktop/v1/responses', method: 'POST', headers: { 'x-api-key': 'synthetic-local' } }, res => {
    let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => resolve({ status: res.statusCode!, body }));
  });
  req.on('error', reject);
  req.end(JSON.stringify({ model: 'grok-fixture', stream: false, store: false, tools: [tool, { type: 'web_search' }], input, ...extra }));
});
const checks: string[] = [];
try {
  await bridge.start();
  const parts = [text('before red'), image(red), text('between'), image(blue, 'high'), text('after blue')];
  assert.equal((await post([user(parts)])).status, 200);
  assert.deepEqual(seen.at(-1).input, [user(parts)]);
  assert.equal(seen.at(-1).store, false);
  assert.equal(seen.at(-1).tools.length, 1); // Proves signed Desktop hosted-search shim ran.
  checks.push('attachment bytes, detail and text/image ordering preserved');

  const history = [user([image(red)]), { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Earlier red image' }] },
    user([text('Now view blue')]), call('old'), output('old', red), call('new'), output('new', blue), user([text('Describe new only')])];
  assert.equal((await post(history)).status, 200);
  const wire = seen.at(-1).input;
  assert.deepEqual(wire.map((item: any) => item.type), history.map(item => item.type));
  assert.deepEqual(wire.filter((item: any) => item.type === 'function_call_output'), [output('old', red), output('new', blue)]);
  assert.deepEqual(wire.filter((item: any) => item.type === 'function_call').map((item: any) => item.call_id), ['old', 'new']);
  assert.equal(wire[0].content[0].image_url, image(red).image_url);
  checks.push('prior images remain only where supplied; tool result bytes and call IDs preserved');

  // Two calls before results, with reversed completion order: call_id owns association.
  assert.equal((await post([user([text('Two files')]), call('old'), call('new'), output('new', blue), output('old', red)])).status, 200);
  assert.deepEqual(seen.at(-1).input.filter((item: any) => item.type === 'function_call_output'), [output('new', blue), output('old', red)]);
  checks.push('parallel/reversed completion order preserves association');

  assert.equal((await post([user([image(blue)])])).status, 200);
  assert.deepEqual(seen.at(-1).input, [user([image(blue)])]);
  assert.equal(JSON.stringify(seen.at(-1)).includes(red), false);
  checks.push('fresh request contains no stale prior image');

  const before = seen.length;
  assert.equal((await post([output('missing', blue)])).status, 400);
  assert.equal((await post([call('old'), output('old', red), output('old', blue)])).status, 400);
  assert.equal(seen.length, before);
  checks.push('unmatched/duplicate results rejected before upstream fetch');

  // Current parser accepts original; this observes forwarding, not xAI acceptance.
  assert.equal((await post([user([image(blue, 'original')])])).status, 200);
  assert.equal(seen.at(-1).input[0].content[0].detail, 'original');
  checks.push('original detail forwarded unchanged (provider support unverified)');
  console.log(JSON.stringify({ offline: true, upstreamFetches: seen.length, realProviderCalls: 0, images: { red: hash(red), blue: hash(blue) }, checks }, null, 2));
} finally {
  bridge.stop();
  globalThis.fetch = originalFetch;
}

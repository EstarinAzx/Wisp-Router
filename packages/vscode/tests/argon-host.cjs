// Run only in an isolated Extension Development Host with a synthetic WISP_HOME (see the behavior doc).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

exports.run = async () => {
  const home = process.env.WISP_HOME;
  assert(home && fs.readFileSync(path.join(home, 'argon-host-test.txt'), 'utf8') === 'synthetic-only');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, 'auth.json'), 'utf8')).antigravity,
    { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', projectId: 'synthetic-project', expiresAt: 9000000000000 });
  fs.rmSync(path.join(home, 'receipt.json'), { force: true });
  const originalFetch = globalThis.fetch;
  const cancellation = new vscode.CancellationTokenSource();
  const requests = [];
  const nativeParts = [
    { thought: true, text: 'private synthetic reasoning', thoughtSignature: 'original-private-signature' },
    { functionCall: { id: 'native-host-call', name: 'read_file', args: { path: 'synthetic.txt' } }, thoughtSignature: 'original-tool-signature' },
  ];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes(':generateContent')) {
      requests.push(JSON.parse(init.body));
      return Response.json({ response: { modelVersion: 'gemini-4-argon', candidates: [{ finishReason: 'STOP',
        content: { role: 'model', parts: requests.length === 1 ? nativeParts : [{ text: 'Synthetic continuation complete.' }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 10 } } });
    }
    // All fetch is intercepted: optional public catalogue reads get an empty catalogue.
    return Response.json({});
  };
  try {
    await vscode.extensions.getExtension('EsarinAzx.wisp').activate();
    const models = await vscode.lm.selectChatModels({ vendor: 'wisp' });
    const model = models.find(m => m.name.includes('gemini-4-argon-high'));
    assert(model, 'Argon must be advertised by the real extension');
    const options = { tools: [{ name: 'read_file', description: 'Synthetic tool', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }],
      modelOptions: { _conversationId: 'isolated-host-session' } };
    const input = [vscode.LanguageModelChatMessage.User('Call the synthetic tool.')];
    const first = await model.sendRequest(input, options, cancellation.token);
    const parts = [];
    for await (const part of first.stream) parts.push(part);
    const marker = parts.find(p => p instanceof vscode.LanguageModelDataPart);
    const call = parts.find(p => p instanceof vscode.LanguageModelToolCallPart);
    assert.equal(marker?.mimeType, 'stateful_marker');
    assert.equal(call?.callId, 'native-host-call');
    assert(!Buffer.from(marker.data).toString().includes('private'));
    // Mirror Copilot's persisted round: only the marker string is saved, then prefixed with model.id.
    const saved = JSON.parse(JSON.stringify({ marker: Buffer.from(marker.data).toString().split('\\')[1],
      call: { id: call.callId, name: call.name, input: call.input } }));
    const restored = vscode.LanguageModelChatMessage.Assistant([
      new vscode.LanguageModelDataPart(Buffer.from(model.id + '\\' + saved.marker), 'stateful_marker'),
      new vscode.LanguageModelToolCallPart(saved.call.id, saved.call.name, saved.call.input),
    ]);
    assert(await model.countTokens(restored, cancellation.token) >= marker.data.byteLength);
    const second = await model.sendRequest([...input, restored, vscode.LanguageModelChatMessage.User([
      new vscode.LanguageModelToolResultPart('native-host-call', [new vscode.LanguageModelTextPart('synthetic result')]),
    ])], options, cancellation.token);
    let text = '';
    for await (const part of second.stream) if (part instanceof vscode.LanguageModelTextPart) text += part.value;
    assert.equal(text, 'Synthetic continuation complete.');
    assert.deepEqual(requests[1].request.contents[1].parts, nativeParts);
    assert.equal(requests[1].request.contents[2].parts[0].functionResponse.id, 'native-host-call');
    const localHeader = vscode.LanguageModelChatMessage.Assistant([
      new vscode.LanguageModelDataPart(Buffer.from(model.id + '\\' + saved.marker), 'stateful_marker'),
    ]);
    const local = await model.sendRequest([localHeader, vscode.LanguageModelChatMessage.User([
      new vscode.LanguageModelToolResultPart('native-host-call', [new vscode.LanguageModelTextPart('Local result')]),
    ])], options, cancellation.token);
    let localText = '';
    for await (const part of local.stream) if (part instanceof vscode.LanguageModelTextPart) localText += part.value;
    assert.equal(localText, 'Synthetic continuation complete.');
    assert.deepEqual(requests[2].request.contents[1].parts, nativeParts);
    assert.equal(requests[2].request.contents[2].parts[0].functionResponse.response.result, 'Local result');
    let refused = false;
    try {
      const invalid = await model.sendRequest([...input, restored, vscode.LanguageModelChatMessage.User([
        new vscode.LanguageModelToolResultPart('native-host-call ', [new vscode.LanguageModelTextPart('wrong identity')]),
      ])], options, cancellation.token);
      for await (const _part of invalid.stream) assert.fail('Invalid continuation emitted output');
    } catch (error) { assert.match(String(error), /Argon/); refused = true; }
    assert(refused, 'Unknown result identity must be refused');
    assert.equal(requests.length, 3);
    fs.writeFileSync(path.join(home, 'receipt.json'), JSON.stringify({ passed: true, vscode: vscode.version,
      model: model.id, requests: requests.length, originalPartsRestored: true, localContinuation: true, invalidResultRefused: true, providerNetwork: false }, null, 2));
  } finally { globalThis.fetch = originalFetch; cancellation.dispose(); }
};

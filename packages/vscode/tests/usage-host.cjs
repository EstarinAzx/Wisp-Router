// Run in an isolated Extension Development Host with the synthetic WISP_HOME marker below.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

exports.run = async () => {
  const home = process.env.WISP_HOME;
  assert(home && fs.readFileSync(path.join(home, 'usage-host-test.txt'), 'utf8') === 'synthetic-only');
  const auth = JSON.parse(fs.readFileSync(path.join(home, 'auth.json'), 'utf8'));
  for (const id of ['codex', 'anthropic', 'xai']) assert.equal(auth[id].accessToken, 'synthetic-access');
  const originalFetch = globalThis.fetch;
  const cancellation = new vscode.CancellationTokenSource();
  const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  const receipts = [];
  let prompt = 100;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (/\/responses(\?|$)/.test(target)) return new Response(event('response.completed', { response: {
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'USAGE_OK' }] }],
      usage: { input_tokens: prompt, output_tokens: 10, input_tokens_details: { cached_tokens: 20 } },
    } }));
    if (/\/messages(\?|$)/.test(target)) return new Response(
      event('message_start', { message: { usage: { input_tokens: prompt - 30, cache_creation_input_tokens: 20,
        cache_read_input_tokens: 10, output_tokens: 0 } } })
      + event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'USAGE_OK' } })
      + event('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 10 } })
      + event('message_stop', {}));
    // Optional catalogue calls stay synthetic too; this test never calls a real provider.
    return Response.json({ models: [] });
  };
  try {
    await vscode.extensions.getExtension('EsarinAzx.wisp').activate();
    const models = await vscode.lm.selectChatModels({ vendor: 'wisp' });
    for (const [slug, cached] of [['gpt-6-astra', 20], ['claude-sonnet-4-6', 10], ['grok-4.5', 20]]) {
      const model = models.find(candidate => candidate.name.includes(slug));
      assert(model, `${slug} must be advertised by the real extension`);
      const messages = [vscode.LanguageModelChatMessage.User('Reply USAGE_OK.')];
      for (prompt of [100, 200]) {
        const response = await model.sendRequest(messages, {}, cancellation.token);
        const parts = [];
        for await (const part of response.stream) parts.push(part);
        const text = parts.filter(part => part instanceof vscode.LanguageModelTextPart).map(part => part.value).join('');
        assert.equal(text, 'USAGE_OK');
        const usage = parts.filter(part => part instanceof vscode.LanguageModelDataPart && part.mimeType === 'usage')
          .map(part => JSON.parse(Buffer.from(part.data).toString())).at(-1);
        assert.deepEqual(usage, { prompt_tokens: prompt, completion_tokens: 10, total_tokens: prompt + 10,
          prompt_tokens_details: { cached_tokens: cached } });
        receipts.push({ model: slug, usage });
        messages.push(vscode.LanguageModelChatMessage.Assistant(text), vscode.LanguageModelChatMessage.User('Reply again.'));
      }
    }
    fs.writeFileSync(path.join(home, 'receipt.json'), JSON.stringify({ passed: true, vscode: vscode.version,
      providerNetwork: false, realExtensionHostApi: true, receipts }, null, 2));
  } finally {
    cancellation.dispose();
    globalThis.fetch = originalFetch;
  }
};

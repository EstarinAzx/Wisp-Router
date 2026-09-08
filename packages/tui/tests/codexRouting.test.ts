import { expect, test } from 'bun:test';
import { codexRoutingRows, loadCodexRoutingCatalog } from '../src/codexRouting';

test('discovered choices and saved missing routes remain independent and explain overrides', async () => {
  const target = { providerId: 'custom', model: 'saved' };
  const map = { families: {}, aliases: [{ name: 'new-mini', target }], codexModels: { removed: target, 'new-mini': target } };
  const catalog = { models: [
    { id: 'new-mini', name: 'New Mini', visible: true }, { id: 'new-spark', name: 'New Spark', visible: true },
    { id: 'hidden', name: 'Hidden', visible: false },
  ] };
  const rows = codexRoutingRows(map, catalog);
  expect(rows.map(r => r.id)).toEqual(['new-mini', 'new-spark', 'removed']);
  expect(rows[0].description).toContain('overridden by Alias');
  expect(rows[1].description).toContain('Active Provider answers');
  expect(rows[2].description).toContain('unavailable in catalog');
  const missing = await loadCodexRoutingCatalog({ PATH: '' });
  expect(missing.error).toContain('Could not find Codex');
  expect(codexRoutingRows(map, missing).map(r => r.id)).toEqual(['removed', 'new-mini']);
});

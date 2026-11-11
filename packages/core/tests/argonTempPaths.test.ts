import { expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSyntheticArgonAcceptance } from '../src/argonAcceptance';
import { makeFixture, removeFixture, events } from './fixtures/argonAcceptanceFixture';

test.each(['canonical', 'linked'] as const)('%s temp parent creates a canonical fixture, completes and cleans up', async mode => {
  const parent = fs.realpathSync.native(os.tmpdir());
  const container = fs.mkdtempSync(path.join(parent, 'wisp-temp-parent-'));
  const alias = path.join(container, 'temp-link');
  let fixture: ReturnType<typeof makeFixture> | undefined;
  try {
    fs.symlinkSync(parent, alias, process.platform === 'win32' ? 'junction' : 'dir');
    vi.spyOn(os, 'tmpdir').mockReturnValue(mode === 'linked' ? alias : parent);
    fixture = makeFixture();
    expect(fixture.root).toBe(fs.realpathSync.native(fixture.root));
    expect(await runSyntheticArgonAcceptance(fixture.grant, fixture.fixture)).toMatchObject({ outcome: 'completed', attempts: 3 });
    expect(events(fixture.root).filter(e => e.kind === 'fetch')).toHaveLength(3);
    removeFixture(fixture.root);
    expect(fs.existsSync(fixture.root)).toBe(false);
  } finally {
    vi.restoreAllMocks();
    if (fixture && fs.existsSync(fixture.root)) fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.unlinkSync(alias);
    fs.rmdirSync(container);
  }
});

test('canonical fixtures remain valid and removable when the temp parent becomes a linked spelling', async () => {
  const fixture = makeFixture(), parent = fs.realpathSync.native(os.tmpdir());
  const container = fs.mkdtempSync(path.join(parent, 'wisp-temp-parent-')), alias = path.join(container, 'temp-link');
  try {
    fs.symlinkSync(parent, alias, process.platform === 'win32' ? 'junction' : 'dir');
    vi.spyOn(os, 'tmpdir').mockReturnValue(alias);
    expect(await runSyntheticArgonAcceptance(fixture.grant, fixture.fixture)).toMatchObject({ outcome: 'completed', attempts: 3 });
    removeFixture(fixture.root);
    expect(fs.existsSync(fixture.root)).toBe(false);
  } finally {
    vi.restoreAllMocks();
    if (fs.existsSync(fixture.root)) fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.unlinkSync(alias); fs.rmdirSync(container);
  }
});

test('a fixture root link is still refused before synthetic transport or receipt creation', async () => {
  const fixture = makeFixture();
  const link = fixture.root + '-link';
  try {
    fs.symlinkSync(fixture.root, link, process.platform === 'win32' ? 'junction' : 'dir');
    const report = await runSyntheticArgonAcceptance(fixture.grant, { ...fixture.fixture, root: link });
    expect(report).toMatchObject({ outcome: 'refused', reason: 'source-changed', attempts: 0 });
    expect(events(fixture.root).filter(e => e.kind === 'fetch')).toHaveLength(0);
    expect(fs.existsSync(path.join(fixture.root, 'acceptance'))).toBe(false);
  } finally { fs.unlinkSync(link); removeFixture(fixture.root); }
});

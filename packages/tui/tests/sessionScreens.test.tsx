import { test, expect } from 'bun:test';
import { act } from 'react';
import { testRender } from '@opentui/react/test-utils';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createSessionLogger } from '@wisp/core';
import { SessionListScreen, LogScreen } from '../src/infoScreens';
import { logBackMode } from '../src/modes';

test('a fresh picker reads external logs, opens one ID and returns to the list', async () => {
  const prior = process.env.WISP_HOME;
  const home = mkdtempSync(join(tmpdir(), 'wisp-session-screen-')); process.env.WISP_HOME = home;
  const host = createSessionLogger('vscode-chat', home);
  const a = host.begin('native', 'a'); a.event('route', { model: 'visible-model' }); a.finish('complete');
  const selected: string[] = [];
  let ui: Awaited<ReturnType<typeof testRender>> | undefined;
  try {
    ui = await testRender(<SessionListScreen onSelect={id => selected.push(id)} />, { width: 100, height: 18 });
    await ui.renderOnce(); expect(ui.captureCharFrame()).toContain(a.id);
    await ui.mockInput.pressKeys(['RETURN']); expect(selected).toEqual([a.id]);
    await act(async () => { ui!.renderer.destroy(); }); ui = undefined;
    ui = await testRender(<LogScreen id={a.id} cols={96} />, { width: 100, height: 24 });
    await ui.renderOnce(); expect(ui.captureCharFrame()).toContain('visible-model');
    expect(logBackMode({ kind: 'log', id: a.id })).toEqual({ kind: 'logs' });
    expect(logBackMode({ kind: 'logs' })).toEqual({ kind: 'input' });
  } finally {
    if (ui) await act(async () => { ui!.renderer.destroy(); });
    if (prior === undefined) delete process.env.WISP_HOME; else process.env.WISP_HOME = prior;
    rmSync(home, { recursive: true, force: true });
  }
});

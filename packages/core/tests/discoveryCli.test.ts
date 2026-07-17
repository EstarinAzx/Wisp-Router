// -------- discoveryCli.test.ts — pure decisions for `wisp providers` + `wisp models` (#123) -------- //

import { describe, it, expect } from 'vitest';
import { runProvidersCommand, runModelsCommand } from '../src/discoveryCli';
import type { Provider } from '../src/catalog';

// A fixed two-row catalog — tests never churn when the real catalog grows.
const providers = [
  { id: 'alpha', label: 'Alpha', baseUrl: 'https://a.example', defaultModel: 'a1', apiKeyEnv: '' },
  { id: 'beta', label: 'Beta Cloud', baseUrl: 'https://b.example', defaultModel: 'b1', apiKeyEnv: 'B_KEY' },
] as Provider[];

describe('runProvidersCommand — the catalog, headless', () => {
  it('prints every Provider id with its label and exits 0', () => {
    const result = runProvidersCommand(providers);
    expect(result.exitCode).toBe(0);
    expect(result.lines.length).toBe(2);
    expect(result.lines[0]).toContain('alpha');
    expect(result.lines[0]).toContain('Alpha');
    expect(result.lines[1]).toContain('beta');
    expect(result.lines[1]).toContain('Beta Cloud');
  });

  it('puts the id first on each line (script-friendly first token)', () => {
    const result = runProvidersCommand(providers);
    expect(result.lines[0]?.trimStart().startsWith('alpha')).toBe(true);
  });
});

describe('runModelsCommand — one Provider’s models, headless', () => {
  const fetchStub = async () => ['m1', 'm2'];

  it('prints the fetched models and exits 0', async () => {
    const result = await runModelsCommand(['alpha'], providers, fetchStub);
    expect(result).toEqual({ lines: ['m1', 'm2'], exitCode: 0 });
  });

  it('unknown provider id → non-zero with the `wisp providers` hint, fetch never called', async () => {
    let called = false;
    const result = await runModelsCommand(['zeta'], providers, async () => { called = true; return []; });
    expect(result.exitCode).not.toBe(0);
    expect(result.lines.join('\n')).toContain('unknown provider: zeta');
    expect(result.lines.join('\n')).toContain('wisp providers');
    expect(called).toBe(false);
  });

  it('no argument → non-zero with a usage line', async () => {
    const result = await runModelsCommand([], providers, fetchStub);
    expect(result.exitCode).not.toBe(0);
    expect(result.lines.join('\n')).toContain('wisp models <provider>');
  });

  it('fetch failure surfaces the backend’s own words, non-zero', async () => {
    const result = await runModelsCommand(['beta'], providers, async () => {
      throw new Error('401 Unauthorized — invalid api key');
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.lines.join('\n')).toContain('401 Unauthorized — invalid api key');
  });

  it('no list available (undefined) → non-zero with a clear message', async () => {
    const result = await runModelsCommand(['alpha'], providers, async () => undefined);
    expect(result.exitCode).not.toBe(0);
    expect(result.lines.join('\n')).toContain('no model list');
  });
});

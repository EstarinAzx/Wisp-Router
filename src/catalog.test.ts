// ---------------- catalog.test.ts — pure Provider-catalog helpers ---------------- //

import { describe, it, expect } from 'vitest';
import {
  resolveModel, resolveBaseUrl, planLegacyMigration,
  buildEditPrompt, parseEditBlocks, applyEditBlocks, diffLines,
  CUSTOM_ID, type Provider,
} from './catalog';

// Minimal Provider builder so each test states only the fields it cares about.
const provider = (over: Partial<Provider> = {}): Provider => ({
  id: 'opencode-zen', label: 'Zen', baseUrl: 'https://opencode.ai/zen/go/v1',
  defaultModel: 'minimax-m3', apiKeyEnv: 'OPENCODE_API_KEY', ...over,
});

describe('resolveModel', () => {
  it('returns the provider\'s remembered model when the map has one', () => {
    expect(resolveModel({ 'opencode-zen': 'gpt-4o-mini' }, provider())).toBe('gpt-4o-mini');
  });

  it('falls back to the native default when the provider has no remembered model', () => {
    expect(resolveModel({ groq: 'llama-3.3' }, provider({ defaultModel: 'minimax-m3' }))).toBe('minimax-m3');
  });

  // Empty-string memory must not win — the original uses `||`, so '' degrades to the default.
  it('falls back to the default when the remembered value is an empty string', () => {
    expect(resolveModel({ 'opencode-zen': '' }, provider({ defaultModel: 'minimax-m3' }))).toBe('minimax-m3');
  });
});

describe('resolveBaseUrl', () => {
  // A built-in uses its hardcoded catalog URL and ignores the user's wisp.baseUrl entirely —
  // this is the key-redirect defense: a workspace cannot point a built-in at another endpoint.
  it('returns the built-in\'s hardcoded baseUrl, ignoring the custom one', () => {
    const p = provider({ id: 'groq', baseUrl: 'https://api.groq.com/openai/v1' });
    expect(resolveBaseUrl(p, 'https://evil.example/v1')).toBe('https://api.groq.com/openai/v1');
  });

  it('returns the user-supplied baseUrl only for the Custom provider', () => {
    const p = provider({ id: CUSTOM_ID, baseUrl: '' });
    expect(resolveBaseUrl(p, 'https://my-proxy.local/v1')).toBe('https://my-proxy.local/v1');
  });

  it('returns empty string for Custom when no baseUrl is set', () => {
    expect(resolveBaseUrl(provider({ id: CUSTOM_ID, baseUrl: '' }), '')).toBe('');
  });
});

describe('planLegacyMigration', () => {
  // Idempotency: once the zen slot exists the migration already ran, so a re-run plans nothing —
  // even if a stray legacy key is still readable. This is what makes it safe to run on every activate.
  it('is a no-op when the zen key slot already exists', () => {
    expect(planLegacyMigration({ zenKeyPresent: true, legacyKey: 'sk-old', legacyModel: 'minimax-m3' })).toBeNull();
  });

  it('is a no-op when there is no legacy key to migrate', () => {
    expect(planLegacyMigration({ zenKeyPresent: false, legacyKey: undefined, legacyModel: 'minimax-m3' })).toBeNull();
  });

  it('plans a key + model copy when a legacy key exists and zen has none', () => {
    expect(planLegacyMigration({ zenKeyPresent: false, legacyKey: 'sk-old', legacyModel: 'minimax-m3' }))
      .toEqual({ storeZenKey: 'sk-old', setModel: 'minimax-m3' });
  });

  it('omits the model when no legacy model is remembered', () => {
    expect(planLegacyMigration({ zenKeyPresent: false, legacyKey: 'sk-old', legacyModel: undefined }))
      .toEqual({ storeZenKey: 'sk-old' });
  });
});

describe('parseEditBlocks', () => {
  // The happy path: one Aider-style block → one { search, replace } pair.
  it('parses a single SEARCH/REPLACE block', () => {
    const raw = '<<<<<<< SEARCH\nconst x = 1\n=======\nconst x = 2\n>>>>>>> REPLACE';
    expect(parseEditBlocks(raw)).toEqual([{ search: 'const x = 1', replace: 'const x = 2' }]);
  });

  // Multiple blocks come back in document order.
  it('parses multiple blocks in order', () => {
    const raw =
      '<<<<<<< SEARCH\na\n=======\nA\n>>>>>>> REPLACE\n' +
      '<<<<<<< SEARCH\nb\n=======\nB\n>>>>>>> REPLACE';
    expect(parseEditBlocks(raw)).toEqual([
      { search: 'a', replace: 'A' },
      { search: 'b', replace: 'B' },
    ]);
  });

  // An empty REPLACE body is a pure deletion — the pair still parses, replace is ''.
  it('treats an empty REPLACE body as a deletion', () => {
    const raw = '<<<<<<< SEARCH\ngone\n=======\n>>>>>>> REPLACE';
    expect(parseEditBlocks(raw)).toEqual([{ search: 'gone', replace: '' }]);
  });

  // Scanning is marker-driven, so a wrapping ``` fence and surrounding prose are ignored for free.
  it('ignores a surrounding markdown fence and prose', () => {
    const raw = 'Here:\n```\n<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE\n```';
    expect(parseEditBlocks(raw)).toEqual([{ search: 'a', replace: 'b' }]);
  });

  // Reasoning models emit a <think>…</think> block before the blocks → drop it first.
  it('strips a <think> block before parsing', () => {
    const raw = '<think>plan</think>\n<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE';
    expect(parseEditBlocks(raw)).toEqual([{ search: 'a', replace: 'b' }]);
  });

  // Unterminated <think> = the token budget ran out mid-thought, no answer yet → no blocks.
  it('returns [] for an unterminated <think>', () => {
    expect(parseEditBlocks('<think>still thinking')).toEqual([]);
  });

  // No markers at all → nothing to apply.
  it('returns [] when there are no blocks', () => {
    expect(parseEditBlocks('no edits here')).toEqual([]);
  });

  // Multi-line bodies are captured whole.
  it('parses multi-line search and replace', () => {
    const raw = '<<<<<<< SEARCH\nline1\nline2\n=======\nnew1\nnew2\nnew3\n>>>>>>> REPLACE';
    expect(parseEditBlocks(raw)).toEqual([{ search: 'line1\nline2', replace: 'new1\nnew2\nnew3' }]);
  });

  // CRLF markers (a Windows model reply) normalize to LF, like the rest of the diff pipeline.
  it('normalizes CRLF markers to LF', () => {
    const raw = '<<<<<<< SEARCH\r\na\r\n=======\r\nb\r\n>>>>>>> REPLACE';
    expect(parseEditBlocks(raw)).toEqual([{ search: 'a', replace: 'b' }]);
  });
});

describe('applyEditBlocks', () => {
  // Locate the search text and splice in the replacement; the rest of the doc is untouched.
  it('applies a single block to the document', () => {
    const plan = applyEditBlocks('const x = 1\nconst y = 2', [{ search: 'const x = 1', replace: 'const x = 99' }]);
    expect(plan.text).toBe('const x = 99\nconst y = 2');
    expect(plan.notFound).toEqual([]);
  });

  // Each block applies in turn against the running result.
  it('applies multiple blocks', () => {
    const plan = applyEditBlocks('a\nb\nc', [
      { search: 'a', replace: 'A' },
      { search: 'c', replace: 'C' },
    ]);
    expect(plan.text).toBe('A\nb\nC');
    expect(plan.notFound).toEqual([]);
  });

  // An empty replace deletes — a search that includes the trailing newline drops the whole line.
  it('deletes when the replace body is empty', () => {
    const plan = applyEditBlocks('keep\nremove me\nkeep2', [{ search: 'remove me\n', replace: '' }]);
    expect(plan.text).toBe('keep\nkeep2');
    expect(plan.notFound).toEqual([]);
  });

  // A search that isn't in the document is reported, not silently dropped — and never corrupts the file.
  it('records a block whose search text is not found', () => {
    const block = { search: 'zzz', replace: 'q' };
    const plan = applyEditBlocks('a\nb', [block]);
    expect(plan.text).toBe('a\nb');
    expect(plan.notFound).toEqual([block]);
  });

  // EOL-agnostic: a CRLF document matches an LF search (the diffLines trap). Output is LF; the caller
  // rejoins with the document's own EOL.
  it('matches EOL-agnostically (CRLF document vs LF search)', () => {
    const plan = applyEditBlocks('a\r\nb\r\nc', [{ search: 'b', replace: 'B' }]);
    expect(plan.text).toBe('a\nB\nc');
    expect(plan.notFound).toEqual([]);
  });

  // Found blocks apply; missing ones are reported so the caller can warn.
  it('applies found blocks and reports the missing ones', () => {
    const plan = applyEditBlocks('a\nb', [
      { search: 'a', replace: 'A' },
      { search: 'nope', replace: 'X' },
    ]);
    expect(plan.text).toBe('A\nb');
    expect(plan.notFound).toEqual([{ search: 'nope', replace: 'X' }]);
  });

  // An empty search would match at position 0 and inject text at the top — guard it as not-found.
  it('treats an empty search as not-found', () => {
    const block = { search: '', replace: 'X' };
    const plan = applyEditBlocks('a\nb', [block]);
    expect(plan.text).toBe('a\nb');
    expect(plan.notFound).toEqual([block]);
  });
});

describe('buildEditPrompt', () => {
  // The request is a system message (the edit rules) then a user message (the work).
  it('returns a system message then a user message', () => {
    const msgs = buildEditPrompt({ instruction: 'b', languageId: 'ts', context: 'c' });
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user']);
  });

  // The user message carries the three inputs the model needs to produce edit blocks.
  it('puts language, context and instruction in the user message', () => {
    const [, user] = buildEditPrompt({ instruction: 'make it 2', languageId: 'typescript', context: 'const x = 1\n' });
    expect(user.content).toContain('typescript');
    expect(user.content).toContain('const x = 1');
    expect(user.content).toContain('make it 2');
  });

  // The system message must elicit the SEARCH/REPLACE block format.
  it('instructs the model to emit SEARCH/REPLACE edit blocks', () => {
    const [system] = buildEditPrompt({ instruction: 'x', languageId: 'js', context: '' });
    expect(system.content).toContain('SEARCH');
    expect(system.content).toContain('REPLACE');
  });
});

describe('diffLines', () => {
  // B2's in-editor diff walks this op list to paint kept/added/removed lines and to rebuild the
  // buffer on accept. An identical before/after is all 'keep' — the no-op edit shows no diff.
  it('returns all keeps when before and after are identical', () => {
    expect(diffLines('a\nb', 'a\nb')).toEqual([
      { type: 'keep', text: 'a' },
      { type: 'keep', text: 'b' },
    ]);
  });

  // Pure append: the shared prefix stays kept, the new tail is added.
  it('marks appended lines as adds', () => {
    expect(diffLines('a\nb', 'a\nb\nc')).toEqual([
      { type: 'keep', text: 'a' },
      { type: 'keep', text: 'b' },
      { type: 'add', text: 'c' },
    ]);
  });

  // Pure delete: the dropped line is a remove between two kept lines.
  it('marks dropped lines as removes', () => {
    expect(diffLines('a\nb\nc', 'a\nc')).toEqual([
      { type: 'keep', text: 'a' },
      { type: 'remove', text: 'b' },
      { type: 'keep', text: 'c' },
    ]);
  });

  // A changed line is a remove of the old followed by an add of the new (removes precede adds in a hunk).
  it('renders a replaced line as remove-then-add', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
      { type: 'keep', text: 'a' },
      { type: 'remove', text: 'b' },
      { type: 'add', text: 'x' },
      { type: 'keep', text: 'c' },
    ]);
  });

  // An empty target span is one empty line; replacing it removes that blank line and adds the new code.
  it('treats an empty before as a removed blank line plus the added code', () => {
    expect(diffLines('', 'const x = 1')).toEqual([
      { type: 'remove', text: '' },
      { type: 'add', text: 'const x = 1' },
    ]);
  });

  // EOL-agnostic: a CRLF buffer vs an LF model reply must match line-for-line (else every line
  // mismatches on a stray \r and the whole file renders as remove-all + add-all). Op text is \r-free.
  it('matches lines across CRLF/LF differences', () => {
    expect(diffLines('a\r\nb\r\nc', 'a\nb\nc')).toEqual([
      { type: 'keep', text: 'a' },
      { type: 'keep', text: 'b' },
      { type: 'keep', text: 'c' },
    ]);
  });
});

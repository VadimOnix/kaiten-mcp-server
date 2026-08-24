import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateNotes } from '@semantic-release/release-notes-generator';

// Regression guard for the empty-release-notes bug.
//
// v3.5.0 through v3.6.2 all shipped with release notes that were nothing but a
// version header: `conventional-changelog-conventionalcommits@10` was installed
// while @semantic-release/release-notes-generator@14 pins
// `conventional-changelog-writer@^8`. The v10 preset delegates its templates to
// `@conventional-changelog/template`, which targets writer v9, so every commit
// group was silently dropped and only the header template rendered. Nothing
// failed — five releases went out with an empty changelog before anyone noticed.
//
// This test runs the REAL .releaserc.json config through the REAL generator, so
// a future preset/writer mismatch (or a presetConfig typo that hides a section)
// fails here instead of shipping.

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const rc = JSON.parse(readFileSync(`${repoRoot}/.releaserc.json`, 'utf8'));
const notesConfig = rc.plugins.find(
  (p: unknown): p is [string, Record<string, unknown>] =>
    Array.isArray(p) && p[0] === '@semantic-release/release-notes-generator',
)?.[1];

const commit = (hash: string, message: string) => ({
  commit: { long: hash, short: hash.slice(0, 7) },
  tree: { long: '', short: '' },
  author: { name: 'A', email: 'a@example.com', date: '2026-08-24T00:00:00Z' },
  committer: { name: 'A', email: 'a@example.com', date: '2026-08-24T00:00:00Z' },
  subject: message.split('\n')[0],
  body: message.split('\n').slice(1).join('\n'),
  message,
  hash,
  committerDate: '2026-08-24T00:00:00Z',
});

const render = (messages: string[]) =>
  generateNotes(notesConfig, {
    cwd: repoRoot,
    env: process.env,
    options: { repositoryUrl: 'https://github.com/VadimOnix/kaiten-mcp-server.git' },
    lastRelease: { version: '1.0.0', gitTag: 'v1.0.0', gitHead: 'old' },
    nextRelease: { version: '1.1.0', gitTag: 'v1.1.0', type: 'minor', gitHead: 'new', channel: null },
    commits: messages.map((m, i) => commit(`${i}`.repeat(40), m)),
    logger: { log: () => {}, error: () => {} },
  } as never);

describe('release notes generation', () => {
  it('has a release-notes-generator entry in .releaserc.json', () => {
    expect(notesConfig).toBeDefined();
    expect(notesConfig!.preset).toBe('conventionalcommits');
  });

  it('renders a Bug Fixes section for a fix commit', async () => {
    const notes = await render(['fix(cards): stop dropping the estimate']);
    expect(notes).toContain('### Bug Fixes');
    expect(notes).toContain('stop dropping the estimate');
  });

  it('renders a Features section for a feat commit', async () => {
    const notes = await render(['feat(tools): add kaiten_list_tags']);
    expect(notes).toContain('### Features');
    expect(notes).toContain('add kaiten_list_tags');
  });

  it('renders dependency bumps instead of hiding them', async () => {
    const notes = await render(['build(deps): bump hono from 4.12.29 to 4.13.1']);
    expect(notes).toContain('### Dependencies');
    expect(notes).toContain('bump hono');
  });

  it('renders a Documentation section for a docs commit', async () => {
    const notes = await render(['docs: document the size write path']);
    expect(notes).toContain('### Documentation');
  });

  it('keeps release/chore/ci noise out of the notes', async () => {
    const notes = await render([
      'chore(release): 1.1.0 [skip ci]',
      'ci: bump actions/checkout',
      'test: add a case',
      'fix: a real fix',
    ]);
    expect(notes).toContain('a real fix');
    expect(notes).not.toContain('skip ci');
    expect(notes).not.toContain('bump actions/checkout');
    expect(notes).not.toContain('add a case');
  });

  it('produces more than a bare version header for a releasable commit', async () => {
    // The exact shape the bug produced: a header, nothing else.
    const notes = await render(['fix(cards): stop dropping the estimate']);
    const withoutHeader = notes.split('\n').slice(1).join('\n').trim();
    expect(withoutHeader.length).toBeGreaterThan(0);
  });
});

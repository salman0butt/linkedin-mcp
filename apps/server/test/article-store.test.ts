import { constants } from 'node:fs';
import {
  chmod,
  link,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ArticleStoreError,
  createLocalArticleStore,
  type ArticleProject,
  type LocalArticleStore,
} from '../src/articles/article-store.js';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function location() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'm08-article-store-')));
  cleanup.push(root);
  return { root, path: join(root, 'private', 'articles.json') };
}

function draft(title = 'A safe article') {
  return {
    title,
    topic: 'TypeScript',
    audience: 'Engineers',
    goal: 'Explain strict source provenance',
    research: {
      brief: 'Author notes, not verification',
      sources: [{ id: 's1', title: 'Author reference', url: 'https://example.com/article' }],
    },
    outline: [{ id: 'o1', heading: 'Introduction' }],
    blocks: [{ id: 'b1', kind: 'paragraph', text: 'A user authored claim', sourceIds: ['s1'] }],
    review: { state: 'draft' },
  };
}

function store(path: string): LocalArticleStore {
  const result = createLocalArticleStore({ transport: 'stdio', filePath: path, lockTimeoutMs: 400 });
  if (result === null) throw new Error('STDIO store unexpectedly absent');
  return result;
}

async function expectKind(operation: Promise<unknown> | (() => unknown), kind: ArticleStoreError['kind']) {
  try {
    await (typeof operation === 'function' ? operation() : operation);
    throw new Error('Expected rejected store operation');
  } catch (error) {
    expect(error).toBeInstanceOf(ArticleStoreError);
    expect((error as ArticleStoreError).kind).toBe(kind);
    expect(String(error)).not.toContain('Author reference');
  }
}

describe('M08.3 private article store', () => {
  it('requires host-only absolute path and stdio; http always returns null regardless of path', async () => {
    const { path } = await location();
    expect(createLocalArticleStore({ transport: 'http', filePath: path })).toBeNull();
    expect(createLocalArticleStore({ transport: 'http', filePath: '/broken/../path' })).toBeNull();
    expect(createLocalArticleStore({ transport: 'stdio' })).toBeNull();
    for (const filePath of [
      'relative/articles.json',
      '/tmp/../sneaky.json',
      '/',
      '/tmp/trailing/',
      '/tmp/a\0b',
    ]) {
      await expectKind(() => createLocalArticleStore({ transport: 'stdio', filePath }), 'invalid_input');
    }
  });

  it('creates a private initialized store with host IDs, strict permissions and canonical unverified sources', async () => {
    const { path } = await location();
    const actual = await store(path).create({ idempotencyKey: 'initial-request', draft: draft() });
    expect(actual).toMatchObject({
      revision: 1,
      draft: { title: 'A safe article', research: { sources: [{ provenance: 'user_supplied_unverified' }] } },
    });
    expect(actual.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(actual.createdAt))).toBe(false);
    expect(actual.updatedAt).toBe(actual.createdAt);
    expect((await lstat(join(path, '..'))).mode & 0o777).toBe(0o700);
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    expect((await lstat(path + '.initialized')).mode & 0o777).toBe(0o600);
    expect(await store(path).get({ id: actual.id })).toEqual(actual);
    expect(await store(path).list()).toEqual([
      {
        id: actual.id,
        title: actual.draft.title,
        revision: 1,
        createdAt: actual.createdAt,
        updatedAt: actual.updatedAt,
      },
    ]);
    expect(JSON.stringify(await store(path).list())).not.toContain('A user authored claim');
  });

  it('durably replays a canonical SHA-256 payload by key after restart and rejects mutated or reused keys', async () => {
    const { path } = await location();
    const a = store(path);
    const first = await a.create({ idempotencyKey: 'same-request', draft: draft() });
    const replay = await store(path).create({
      idempotencyKey: 'same-request',
      draft: { ...draft(), title: '  A safe article  ' },
    });
    expect(replay).toEqual(first);
    await expectKind(
      store(path).create({ idempotencyKey: 'same-request', draft: draft('Changed') }),
      'idempotency_conflict',
    );
    const second = await a.create({ idempotencyKey: 'another-request', draft: draft() });
    expect(second.id).not.toBe(first.id);
    await expectKind(a.create({ idempotencyKey: '', draft: draft() }), 'invalid_input');
    await expectKind(a.create({ idempotencyKey: '../unsafe', draft: draft() }), 'invalid_input');
    await expectKind(a.create({ idempotencyKey: 'x'.repeat(129), draft: draft() }), 'invalid_input');
  });

  it('serializes concurrent creates with the same key into exactly one project', async () => {
    const { path } = await location();
    const a = store(path);
    const b = store(path);
    const [first, second] = await Promise.all([
      a.create({ idempotencyKey: 'concurrent', draft: draft() }),
      b.create({ idempotencyKey: 'concurrent', draft: draft() }),
    ]);
    expect(first).toEqual(second);
    expect(await a.list()).toHaveLength(1);
  });

  it('implements optimistic update/remove and never clobbers an unrelated or stale revision', async () => {
    const { path } = await location();
    const a = store(path);
    const p = await a.create({ idempotencyKey: 'seed', draft: draft() });
    const newer = await a.update({ id: p.id, expectedRevision: 1, draft: draft('Revised') });
    expect(newer).toMatchObject({
      id: p.id,
      revision: 2,
      draft: { title: 'Revised' },
      createdAt: p.createdAt,
    });
    await expectKind(a.update({ id: p.id, expectedRevision: 1, draft: draft('Stale') }), 'revision_conflict');
    await expectKind(a.remove({ id: p.id, expectedRevision: 1 }), 'revision_conflict');
    expect((await a.get({ id: p.id }))?.draft.title).toBe('Revised');
    await expectKind(a.update({ id: 'not-a-uuid', expectedRevision: 1, draft: draft() }), 'invalid_input');
    await expectKind(
      a.update({ id: '00000000-0000-4000-8000-000000000000', expectedRevision: 1, draft: draft() }),
      'not_found',
    );
    expect(await a.remove({ id: p.id, expectedRevision: 2 })).toBe(true);
    expect(await a.get({ id: p.id })).toBeNull();
    expect(await a.list()).toEqual([]);
    expect(await a.remove({ id: p.id, expectedRevision: 2 })).toBe(false);
    await expectKind(a.create({ idempotencyKey: 'seed', draft: draft() }), 'idempotency_conflict');
  });

  it('allows only one winner when two instances update the same expected revision concurrently', async () => {
    const { path } = await location();
    const a = store(path);
    const b = store(path);
    const original = await a.create({ idempotencyKey: 'concurrent-updates', draft: draft() });
    const settled = await Promise.allSettled([
      a.update({ id: original.id, expectedRevision: 1, draft: draft('First update') }),
      b.update({ id: original.id, expectedRevision: 1, draft: draft('Second update') }),
    ]);
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = settled.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { kind: 'revision_conflict' },
    });
    const latest = await a.get({ id: original.id });
    expect(latest?.revision).toBe(2);
    expect(['First update', 'Second update']).toContain(latest?.draft.title);
  });

  it('rejects callers trying to inject path, owner or envelope metadata', async () => {
    const { path } = await location();
    const a = store(path);
    for (const extra of [
      { filePath: '/tmp/other' },
      { accountId: 'owner' },
      { id: 'fake' },
      { revision: 99 },
      { approved: true },
    ]) {
      await expectKind(
        a.create({ idempotencyKey: 'reject-' + Object.keys(extra)[0], draft: draft(), ...extra }),
        'invalid_input',
      );
    }
    await expectKind(
      a.create({ idempotencyKey: 'reject-draft', draft: { ...draft(), provider: 'OFFICIAL_API' } }),
      'invalid_input',
    );
    expect(await a.list()).toEqual([]);
  });

  it('fails closed on disappearance of initialized file even when a new store instance starts', async () => {
    const { path } = await location();
    const a = store(path);
    await a.create({ idempotencyKey: 'seed', draft: draft() });
    await rm(path);
    await expectKind(store(path).create({ idempotencyKey: 'after-loss', draft: draft() }), 'unsafe_store');
    await expectKind(store(path).list(), 'unsafe_store');
    await expectKind(store(path).get({ id: '00000000-0000-4000-8000-000000000000' }), 'unsafe_store');
    await expect(readFile(path)).rejects.toThrow();
  });

  it('rejects corrupt persisted schema, changes from disk and orphan write temps without overwrite', async () => {
    const { path } = await location();
    const a = store(path);
    await a.create({ idempotencyKey: 'seed', draft: draft() });
    const original = await readFile(path);
    for (const content of [
      'not json',
      JSON.stringify({ version: 2, projects: [], idempotency: [] }),
      JSON.stringify({ version: 1, projects: [{ approved: true }], idempotency: [] }),
    ]) {
      await writeFile(path, content);
      await expectKind(store(path).create({ idempotencyKey: 'bad-request', draft: draft() }), 'unsafe_store');
      expect(await readFile(path, 'utf8')).toBe(content);
    }
    await writeFile(path, original);
    const orphan = join(path, '..', '.' + path.split('/').at(-1) + '.orphan.tmp');
    await writeFile(orphan, 'interrupted');
    await expectKind(store(path).list(), 'unsafe_store');
    await rm(orphan);
    expect(await store(path).list()).toHaveLength(1);
  });

  it('fails closed when revision-one stored content no longer matches durable create SHA', async () => {
    const { path } = await location();
    const a = store(path);
    await a.create({ idempotencyKey: 'hash-integrity', draft: draft() });
    const forged = JSON.parse(await readFile(path, 'utf8')) as {
      projects: Array<{ draft: { title: string } }>;
    };
    forged.projects[0]!.draft.title = 'Tampered content';
    await writeFile(path, JSON.stringify(forged));
    await expectKind(store(path).list(), 'unsafe_store');
    await expectKind(store(path).create({ idempotencyKey: 'new-request', draft: draft() }), 'unsafe_store');
  });

  it('rejects invalid UTF-8 bytes in a later revision without silently changing author text', async () => {
    const { path } = await location();
    const a = store(path);
    const original = await a.create({ idempotencyKey: 'invalid-utf8', draft: draft() });
    await a.update({ id: original.id, expectedRevision: 1, draft: draft('Revised title') });
    const contents = await readFile(path);
    const index = contents.indexOf(Buffer.from('Revised title'));
    expect(index).toBeGreaterThanOrEqual(0);
    contents[index] = 0xff;
    await writeFile(path, contents);
    await expectKind(store(path).get({ id: original.id }), 'unsafe_store');
    expect(await readFile(path)).toEqual(contents);
  });

  it('rejects linked/private-file targets and unsafe permissions instead of overwriting', async () => {
    const { root, path } = await location();
    const a = store(path);
    await a.create({ idempotencyKey: 'seed', draft: draft() });
    await chmod(path, 0o644);
    await expectKind(a.list(), 'unsafe_store');
    await chmod(path, 0o600);
    const hard = join(root, 'second-hard-link');
    await link(path, hard);
    await expectKind(a.list(), 'unsafe_store');
    await rm(hard);
    const renamed = join(root, 'safe-original');
    await rename(path, renamed);
    await symlink(renamed, path);
    await expectKind(a.list(), 'unsafe_store');
    await rm(path);
    await rename(renamed, path);
    await chmod(join(root, 'private'), 0o755);
    await expectKind(a.list(), 'unsafe_store');
  });

  it('does not discard unresolved locks or partially-initialized sentinel state', async () => {
    const { path } = await location();
    const a = store(path);
    await a.create({ idempotencyKey: 'seed', draft: draft() });
    await writeFile(path + '.lock', 'stalled');
    await expectKind(a.list(), 'unsafe_store');
    expect((await lstat(path + '.lock')).isFile()).toBe(true);
    await rm(path + '.lock');
    await rm(path);
    await expectKind(a.create({ idempotencyKey: 'other', draft: draft() }), 'unsafe_store');
  });

  it('caps live projects at 50 and total file size, preserving the predecessor after a rejected write', async () => {
    const { path } = await location();
    const a = store(path);
    for (let i = 0; i < 50; i += 1) {
      await a.create({ idempotencyKey: 'project-' + i, draft: draft('Title-' + i) });
    }
    expect(await a.list()).toHaveLength(50);
    const before = await readFile(path);
    await expectKind(a.create({ idempotencyKey: 'project-51', draft: draft('Too many') }), 'capacity');
    expect(await readFile(path)).toEqual(before);
  });

  it('enforces the 8MiB store byte ceiling independently of the 50-project ceiling', async () => {
    const { path } = await location();
    const a = store(path);
    const large = {
      ...draft(),
      blocks: Array.from({ length: 80 }, (_, i) => ({
        id: 'b' + i,
        kind: 'paragraph',
        text: '漢'.repeat(800),
      })),
    };
    const first = await a.create({ idempotencyKey: 'large-0', draft: { ...large, title: 'Large 0' } });
    // Populate a valid on-disk envelope in one batch to avoid quadratic
    // fsync/revalidation work while testing the 8MiB boundary.
    const state = JSON.parse(await readFile(path, 'utf8')) as {
      version: number;
      projects: ArticleProject[];
      idempotency: Array<{ key: string; projectId: string; payloadHash: string }>;
    };
    for (let i = 1; i < 49; i += 1) {
      const project = { ...first, id: randomUUID(), draft: { ...first.draft, title: 'Large ' + i } };
      const history = {
        key: 'large-' + i,
        payloadHash: createHash('sha256').update(JSON.stringify(project.draft)).digest('hex'),
        projectId: project.id,
      };
      state.projects.push(project);
      state.idempotency.push(history);
      if (Buffer.byteLength(JSON.stringify(state)) > 8 * 1_048_576 - 50_000) {
        state.projects.pop();
        state.idempotency.pop();
        break;
      }
    }
    expect(state.projects.length).toBeLessThan(50);
    expect(state.projects.length).toBeGreaterThan(30);
    await writeFile(path, JSON.stringify(state));
    const before = await readFile(path);
    await expectKind(
      a.create({ idempotencyKey: 'large-overflow', draft: { ...large, title: 'Overflow' } }),
      'capacity',
    );
    expect(await readFile(path)).toEqual(before);
    expect((await readFile(path)).byteLength).toBeLessThanOrEqual(8 * 1_048_576);
    expect(await a.list()).toHaveLength(state.projects.length);
  }, 90_000);

  it('classifies failure after successful rename as outcome_unknown, then replays the durable create', async () => {
    const { path } = await location();
    let renamed = false;
    vi.doMock('node:fs/promises', async (importOriginal) => {
      const original = await importOriginal<typeof import('node:fs/promises')>();
      return {
        ...original,
        rename: async (...args: Parameters<typeof original.rename>) => {
          await original.rename(...args);
          renamed = true;
        },
        open: async (...args: Parameters<typeof original.open>) => {
          if (renamed && typeof args[1] === 'number' && (args[1] & constants.O_DIRECTORY) !== 0) {
            throw new Error('injected failure after completed rename');
          }
          return original.open(...args);
        },
      };
    });
    vi.resetModules();
    try {
      const { createLocalArticleStore: faultyCreate } = await import('../src/articles/article-store.js');
      const faultyStore = faultyCreate({ transport: 'stdio', filePath: path });
      if (faultyStore === null) throw new Error('Missing store');
      await expect(
        faultyStore.create({ idempotencyKey: 'uncertain-creation', draft: draft() }),
      ).rejects.toMatchObject({
        name: 'ArticleStoreError',
        kind: 'outcome_unknown',
      });
      expect(renamed).toBe(true);
    } finally {
      vi.doUnmock('node:fs/promises');
      vi.resetModules();
    }
    const a = store(path);
    const replay = await a.create({ idempotencyKey: 'uncertain-creation', draft: draft() });
    expect(replay.revision).toBe(1);
    expect(await a.list()).toHaveLength(1);
    expect(await a.create({ idempotencyKey: 'uncertain-creation', draft: draft() })).toEqual(replay);
  });

  it('never follows a symlink sentinel or accepts an initialized state without its sentinel', async () => {
    const { root, path } = await location();
    const a = store(path);
    await a.create({ idempotencyKey: 'seed', draft: draft() });
    await rm(path + '.initialized');
    await expectKind(a.list(), 'unsafe_store');
    await symlink(join(root, 'missing'), path + '.initialized');
    await expectKind(a.list(), 'unsafe_store');
  });
});

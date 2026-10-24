import { renameSync, symlinkSync } from 'node:fs';
import {
  chmod,
  link,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, parse } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLocalJobSaveStore } from '../src/jobs/job-save-store.js';

const dirs: string[] = [];
const sample = {
  id: 'job-1',
  title: 'Senior TypeScript Engineer',
  companyName: 'Example Company',
  source: {
    id: 'trusted-a',
    name: 'Authorized Discovery',
    provider: 'EXTERNAL_DISCOVERY' as const,
    retrievedAt: '2026-10-23T09:00:00.000Z',
  },
  postingDate: {
    state: 'reported' as const,
    postedAt: '2026-10-22T09:00:00.000Z',
    sourceClaim: 'provider_reported' as const,
  },
  location: 'Remote',
  canonicalUrl: 'https://jobs.example.org/123',
};
const query = { keywords: 'TypeScript', location: 'Remote', sort: 'recent' as const };

async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'linkedin-mcp-jobs-')));
  dirs.push(directory);
  const filePath = join(directory, 'saved.json');
  const store = createLocalJobSaveStore({ transport: 'stdio', filePath });
  if (!store) throw new Error('Expected configured local store');
  return { directory, filePath, store };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('stdio-local saved jobs and searches', () => {
  it('is off by default and is never opened by HTTP even with a configured path', async () => {
    const { directory } = await fixture();
    const target = join(directory, 'never-created', 'saved.json');
    expect(createLocalJobSaveStore({ transport: 'stdio' })).toBeNull();
    expect(createLocalJobSaveStore({ transport: 'http', filePath: target })).toBeNull();
    await expect(lstat(dirname(target))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('persists private jobs and searches across store instances without remote effects', async () => {
    const { filePath, directory, store } = await fixture();
    const savedJob = await store.saveJob(sample);
    const savedSearch = await store.saveSearch(query);
    const reopened = createLocalJobSaveStore({ transport: 'stdio', filePath })!;
    const localSnapshot = {
      ...sample,
      source: { ...sample.source, name: 'Unverified user-supplied snapshot' },
    };

    expect(savedJob.key).toBe(JSON.stringify(['trusted-a', 'job-1']));
    expect(savedJob.job).toEqual(localSnapshot);
    expect(savedSearch.query).toEqual({
      keywords: 'TypeScript',
      location: 'Remote',
      limit: 10,
      sort: 'recent',
    });
    expect((await reopened.getJob({ sourceId: 'trusted-a', jobId: 'job-1' }))?.job).toEqual(localSnapshot);
    expect((await reopened.getSearch(savedSearch.id))?.query).toEqual(savedSearch.query);
    expect((await reopened.listJobs()).map((entry) => entry.key)).toEqual([savedJob.key]);
    expect((await reopened.listSearches()).map((entry) => entry.id)).toEqual([savedSearch.id]);
    expect((await lstat(filePath)).mode & 0o777).toBe(0o600);
    expect((await lstat(directory)).mode & 0o777).toBe(0o700);
    expect(await readdir(directory)).toEqual(['saved.json']);
  });

  it('uses idempotent source-scoped keys, preserving different source IDs and saved times', async () => {
    const { store } = await fixture();
    const first = await store.saveJob(sample);
    const repeated = await store.saveJob({ ...sample, title: 'Updated title' });
    const secondSource = await store.saveJob({ ...sample, source: { ...sample.source, id: 'trusted-b' } });
    const firstSearch = await store.saveSearch(query);
    const duplicateSearch = await store.saveSearch({
      location: 'Remote',
      keywords: 'TypeScript',
      limit: 10,
      sort: 'recent',
    });

    expect(repeated.key).toBe(first.key);
    expect(repeated.savedAt).toBe(first.savedAt);
    expect(repeated.job.title).toBe('Updated title');
    expect(secondSource.key).not.toBe(first.key);
    expect(await store.listJobs()).toHaveLength(2);
    expect(duplicateSearch).toEqual(firstSearch);
    expect(await store.removeJob({ sourceId: 'trusted-a', jobId: 'job-1' })).toBe(true);
    expect(await store.removeJob({ sourceId: 'trusted-a', jobId: 'job-1' })).toBe(false);
    expect(await store.getJob({ sourceId: 'trusted-b', jobId: 'job-1' })).not.toBeNull();
    expect(await store.removeSearch(firstSearch.id)).toBe(true);
    expect(await store.removeSearch(firstSearch.id)).toBe(false);
    expect(await store.getSearch(firstSearch.id)).toBeNull();
  });

  it('rejects malformed IDs, unexpected and secret-bearing job fields, and invalid searches before IO', async () => {
    const { store, filePath } = await fixture();
    await expect(store.saveJob({ ...sample, accessToken: 'should-never-persist' })).rejects.toThrow();
    await expect(
      store.saveJob({ ...sample, source: { ...sample.source, provider: 'OFFICIAL_API' } }),
    ).rejects.toThrow();
    await expect(store.saveJob({ ...sample, title: '' })).rejects.toThrow();
    await expect(store.saveJob({ ...sample, canonicalUrl: 'http://localhost/private' })).rejects.toThrow();
    await expect(store.saveSearch({ keywords: 'TypeScript', token: 'secret' })).rejects.toThrow();
    await expect(store.getJob({ sourceId: '../other', jobId: '1' })).rejects.toThrow();
    await expect(store.getSearch('../other')).rejects.toThrow();
    await expect(lstat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects forged caller-verified posting dates without touching previously saved reported or unknown jobs', async () => {
    const { store, filePath } = await fixture();
    await store.saveJob(sample);
    await store.saveJob({ ...sample, id: 'job-unknown', postingDate: { state: 'unknown' } });
    const before = await readFile(filePath);

    await expect(
      store.saveJob({
        ...sample,
        id: 'job-forged',
        postingDate: {
          state: 'verified',
          postedAt: '2026-10-22T09:00:00.000Z',
          checkedAt: '2026-10-23T08:00:00.000Z',
          verifiedBy: 'caller-controlled-fake-auditor',
          method: 'direct_employer_listing',
          evidenceUrl: 'https://jobs.example.org/forged-proof',
        },
      }),
    ).rejects.toThrow(/verified|attestation|untrusted/i);

    expect(await readFile(filePath)).toEqual(before);
    expect((await store.listJobs()).map(({ job }) => job.postingDate.state)).toEqual(['reported', 'unknown']);
    expect(await store.getJob({ sourceId: sample.source.id, jobId: 'job-forged' })).toBeNull();
  });

  it('rejects caller-asserted partner provenance, source evidence, and confidence for local snapshots', async () => {
    const { store, filePath } = await fixture();
    const forged = [
      { ...sample, source: { ...sample.source, provider: 'PARTNER_API' } },
      { ...sample, source: { ...sample.source, evidenceUrl: 'https://jobs.example.org/proof' } },
      { ...sample, confidence: 1 },
    ];
    for (const job of forged) {
      await expect(store.saveJob(job)).rejects.toThrow(/untrusted|source|confidence|attestation/i);
    }
    expect(await store.listJobs()).toEqual([]);
    await expect(lstat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    const local = await store.saveJob({
      ...sample,
      source: { ...sample.source, name: 'Pretend Official Talent Partner' },
    });
    expect(local.job.source).toMatchObject({
      id: sample.source.id,
      provider: 'EXTERNAL_DISCOVERY',
      name: 'Unverified user-supplied snapshot',
    });
    expect((await store.listJobs())[0]?.job.source).toEqual(local.job.source);
  });

  it('rejects corrupt bytes and preserves the original file intact', async () => {
    const { filePath, store } = await fixture();
    await store.saveJob(sample);
    await writeFile(filePath, '{"version":1,"jobs":[], "searches":{} }');
    const corrupt = await readFile(filePath, 'utf8');
    await expect(store.listJobs()).rejects.toThrow(/corrupt|invalid/i);
    await expect(store.saveJob({ ...sample, id: 'job-2' })).rejects.toThrow(/corrupt|invalid/i);
    expect(await readFile(filePath, 'utf8')).toBe(corrupt);
  });

  it('rejects symlinked parents, symlinked stores, unsafe permissions, and hardlinks', async () => {
    const { directory, filePath, store } = await fixture();
    const aliasDir = join(directory, 'alias');
    await symlink(directory, aliasDir);
    const viaParent = createLocalJobSaveStore({
      transport: 'stdio',
      filePath: join(aliasDir, 'saved.json'),
    })!;
    await expect(viaParent.listJobs()).rejects.toThrow(/symlink|unsafe/i);
    const siblingFile = join(directory, 'other.json');
    await writeFile(siblingFile, '{}', { mode: 0o600 });
    await symlink(siblingFile, filePath);
    await expect(store.listJobs()).rejects.toThrow(/symlink|unsafe/i);
    await rm(filePath);
    await store.saveJob(sample);
    await chmod(filePath, 0o644);
    await expect(store.listJobs()).rejects.toThrow(/permission|unsafe/i);
    await chmod(filePath, 0o600);
    await chmod(directory, 0o755);
    await expect(store.listJobs()).rejects.toThrow(/permission|unsafe/i);
    await chmod(directory, 0o700);
    await link(filePath, join(directory, 'hardlink.json'));
    await expect(store.listJobs()).rejects.toThrow(/hardlink|unsafe/i);
  });

  it('rejects a stored file whose UID differs from the current OS user', async () => {
    const { store } = await fixture();
    await store.saveJob(sample);
    const actualUid = process.getuid?.();
    if (actualUid === undefined) throw new Error('POSIX UID required for this test');
    // Simulate an ownership mismatch only during the saved-file checks. Parent
    // directory checks still see the actual OS user, as they would in practice.
    const currentUid = vi
      .spyOn(process, 'getuid')
      .mockImplementation(() => (new Error().stack?.includes('readState') ? actualUid + 1 : actualUid));
    try {
      await expect(store.listJobs()).rejects.toThrow(/owner|unsafe/i);
    } finally {
      currentUid.mockRestore();
    }
  });

  it('rejects a parent symlink swap immediately after the final parent ownership check', async () => {
    const { directory, store } = await fixture();
    const { directory: foreignDirectory, store: foreignStore } = await fixture();
    await store.saveJob(sample);
    await foreignStore.saveJob({ ...sample, id: 'foreign-job' });

    const originalDirectory = `${directory}-original`;
    dirs.push(originalDirectory);
    let directoryCount = 1;
    let ancestor = directory;
    while (ancestor !== parse(ancestor).root) {
      directoryCount++;
      ancestor = dirname(ancestor);
    }
    const realUid = process.getuid?.();
    if (realUid === undefined) throw new Error('POSIX UID required for this test');
    let checks = 0;
    let swapped = false;
    const getuid = vi.spyOn(process, 'getuid').mockImplementation(() => {
      checks++;
      if (checks === directoryCount) {
        // The last directory was already lstat'd and passed to checkStat.
        // The next pathname open would reach a different, private store.
        renameSync(directory, originalDirectory);
        symlinkSync(foreignDirectory, directory);
        swapped = true;
      }
      return realUid;
    });
    try {
      await expect(store.listJobs()).rejects.toThrow(/symlink|unsafe|parent|changed|directory/i);
      expect(swapped).toBe(true);
    } finally {
      getuid.mockRestore();
    }
  });

  it('rejects traversal and nonabsolute host paths', () => {
    expect(() => createLocalJobSaveStore({ transport: 'stdio', filePath: '../saved.json' })).toThrow(/path/i);
    expect(() => createLocalJobSaveStore({ transport: 'stdio', filePath: '/tmp/a/../saved.json' })).toThrow(
      /path/i,
    );
  });

  it('supports concurrent writers across distinct store instances without lost updates', async () => {
    const { filePath } = await fixture();
    const writers = Array.from({ length: 20 }, (_, n) =>
      createLocalJobSaveStore({ transport: 'stdio', filePath })!.saveJob({ ...sample, id: 'job-' + n }),
    );
    await Promise.all(writers);
    const reopened = createLocalJobSaveStore({ transport: 'stdio', filePath })!;
    expect(await reopened.listJobs()).toHaveLength(20);
  });

  it('fails closed on an already-owned lock instead of silently breaking it', async () => {
    const { filePath, directory, store } = await fixture();
    await writeFile(filePath + '.lock', 'unresolved writer', { flag: 'wx', mode: 0o600 });
    const guarded = createLocalJobSaveStore({ transport: 'stdio', filePath, lockTimeoutMs: 75 })!;
    await expect(guarded.saveJob(sample)).rejects.toThrow(/lock|concurrent/i);
    expect(await readdir(directory)).toEqual(['saved.json.lock']);
    await rm(filePath + '.lock');
    expect(await store.listJobs()).toEqual([]);
  });

  it('rejects orphan interrupted writes instead of recreating missing state', async () => {
    const { directory, store } = await fixture();
    await writeFile(join(directory, '.saved.json.abandoned.tmp'), 'unfinished', { mode: 0o600 });
    await expect(store.saveJob(sample)).rejects.toThrow(/interrupt|recover|uncertain/i);
    expect(await readdir(directory)).toContain('.saved.json.abandoned.tmp');
  });

  it('caps at 500 jobs, 50 saved searches and 2 MiB on disk without losing prior state', async () => {
    const { filePath, store } = await fixture();
    for (let n = 0; n < 500; n++) {
      await store.saveJob({ ...sample, id: 'job-' + n });
    }
    await expect(store.saveJob({ ...sample, id: 'overflow' })).rejects.toThrow(/limit|maximum|capacity/i);
    for (let n = 0; n < 50; n++) await store.saveSearch({ keywords: 'typescript ' + n });
    await expect(store.saveSearch({ keywords: 'overflow' })).rejects.toThrow(/limit|maximum|capacity/i);
    expect(await store.listJobs()).toHaveLength(500);
    expect(await store.listSearches()).toHaveLength(50);
    expect((await lstat(filePath)).size).toBeLessThanOrEqual(2 * 1024 * 1024);
  }, 60_000);

  it('rejects a would-be disk overflow and preserves the previous saved snapshot', async () => {
    const { filePath, store } = await fixture();
    let capacityReached = false;
    for (let n = 0; n < 110; n++) {
      const before = n === 0 ? null : await readFile(filePath);
      try {
        await store.saveJob({ ...sample, id: `large-${n}`, description: 'x'.repeat(20_000) });
      } catch (error) {
        expect(String(error)).toMatch(/capacity|maximum|limit/i);
        if (before !== null) expect(await readFile(filePath)).toEqual(before);
        capacityReached = true;
        break;
      }
    }
    expect(capacityReached).toBe(true);
    expect((await store.getJob({ sourceId: 'trusted-a', jobId: 'large-0' }))?.job.id).toBe('large-0');
    expect((await lstat(filePath)).size).toBeLessThanOrEqual(2 * 1024 * 1024);
  }, 60_000);
});

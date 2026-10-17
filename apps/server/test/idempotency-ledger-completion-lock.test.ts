import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createFileIdempotencyLedger } from '../src/publishing/idempotency-ledger.js';

const roots: string[] = [];
const payloadHash = 'a'.repeat(64);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('idempotency completion lock handoff', () => {
  it('retries transient sibling-lock contention when persisting a known remote outcome', async () => {
    const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-complete-lock-'));
    roots.push(root);
    const filePath = join(root, 'idempotency.json');
    const lockPath = join(root, `.${basename(filePath)}.lock`);
    const seed = createFileIdempotencyLedger({ filePath });
    await seed.reserve({ idempotencyKey: 'known-outcome', payloadHash });

    let lockAttempts = 0;
    const ledger = createFileIdempotencyLedger({
      filePath,
      filesystem: {
        writeFile(path, data, options) {
          if (path === lockPath) {
            lockAttempts += 1;
            if (lockAttempts <= 2) {
              return Promise.reject(Object.assign(new Error('transient sibling writer'), { code: 'EEXIST' }));
            }
          }
          return writeFile(path, data, options);
        },
      },
    });

    await expect(
      ledger.complete({
        idempotencyKey: 'known-outcome',
        payloadHash,
        state: 'succeeded',
        result: { postUrn: 'urn:li:share:123' },
      }),
    ).resolves.toMatchObject({
      state: 'succeeded',
      result: { postUrn: 'urn:li:share:123' },
    });
    expect(lockAttempts).toBe(3);
  });

  it('fails closed after bounded completion contention without removing another writer lock', async () => {
    const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-complete-lock-'));
    roots.push(root);
    const filePath = join(root, 'idempotency.json');
    const lockPath = join(root, `.${basename(filePath)}.lock`);
    const seed = createFileIdempotencyLedger({ filePath });
    await seed.reserve({ idempotencyKey: 'known-outcome', payloadHash });
    await writeFile(lockPath, 'other writer', 'utf8');

    let lockAttempts = 0;
    const ledger = createFileIdempotencyLedger({
      filePath,
      filesystem: {
        writeFile(path, data, options) {
          if (path === lockPath) lockAttempts += 1;
          return writeFile(path, data, options);
        },
      },
    });

    await expect(
      ledger.complete({
        idempotencyKey: 'known-outcome',
        payloadHash,
        state: 'succeeded',
        result: { postUrn: 'urn:li:share:123' },
      }),
    ).rejects.toMatchObject({ kind: 'store_unavailable' });
    expect(lockAttempts).toBe(8);
    expect(await readFile(lockPath, 'utf8')).toBe('other writer');
    expect(await readFile(filePath, 'utf8')).toContain('"state":"reserved"');
  });

  it('does not retry non-contention failures when completing a known outcome', async () => {
    const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-complete-lock-'));
    roots.push(root);
    const filePath = join(root, 'idempotency.json');
    const lockPath = join(root, `.${basename(filePath)}.lock`);
    await createFileIdempotencyLedger({ filePath }).reserve({ idempotencyKey: 'known-outcome', payloadHash });

    let lockAttempts = 0;
    const ledger = createFileIdempotencyLedger({
      filePath,
      filesystem: {
        writeFile(path, data, options) {
          if (path === lockPath) {
            lockAttempts += 1;
            return Promise.reject(Object.assign(new Error('permission denied'), { code: 'EACCES' }));
          }
          return writeFile(path, data, options);
        },
      },
    });

    await expect(
      ledger.complete({ idempotencyKey: 'known-outcome', payloadHash, state: 'succeeded' }),
    ).rejects.toMatchObject({ kind: 'store_unavailable' });
    expect(lockAttempts).toBe(1);
  });
});

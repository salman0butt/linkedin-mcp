import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
});

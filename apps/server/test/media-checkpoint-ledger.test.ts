import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createFileIdempotencyLedger } from '../src/publishing/idempotency-ledger.js';

const roots: string[] = [];
const payloadHash = 'a'.repeat(64);
const imageDigest = 'b'.repeat(64);

async function createLedgerPath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-media-ledger-'));
  roots.push(root);
  return join(root, 'ledger.json');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('M03.4 durable media checkpoints', () => {
  it('replays v1 text records unchanged and migrates to v2 on the next mutation', async () => {
    const filePath = await createLedgerPath();
    const record = {
      idempotencyKey: 'legacy-text',
      payloadHash,
      state: 'succeeded',
      createdAt: '2026-10-08T09:20:00.000Z',
      updatedAt: '2026-10-08T09:21:00.000Z',
      result: { postUrn: 'urn:li:share:123' },
    };
    await writeFile(filePath, JSON.stringify({ version: 1, records: [record] }));
    const ledger = createFileIdempotencyLedger({ filePath });

    await expect(ledger.reserve({ idempotencyKey: 'legacy-text', payloadHash })).resolves.toEqual({
      status: 'replay',
      record,
    });
    await ledger.reserve({ idempotencyKey: 'new-media', payloadHash });

    const stored = JSON.parse(await readFile(filePath, 'utf8')) as {
      version: number;
      records: unknown[];
    };
    expect(stored.version).toBe(2);
    expect(stored.records[0]).toEqual(record);
  });

  it('durably checkpoints a known image URN and replays it after restart', async () => {
    const filePath = await createLedgerPath();
    const first = createFileIdempotencyLedger({ filePath });
    await first.reserve({ idempotencyKey: 'media-post', payloadHash });

    await first.checkpointMedia({
      idempotencyKey: 'media-post',
      payloadHash,
      index: 0,
      checkpoint: {
        sha256: imageDigest,
        imageUrn: 'urn:li:image:123',
        uploadState: 'uploaded',
      },
    });

    const restarted = createFileIdempotencyLedger({ filePath });
    await expect(restarted.reserve({ idempotencyKey: 'media-post', payloadHash })).resolves.toMatchObject({
      status: 'replay',
      record: {
        state: 'reserved',
        media: [{ sha256: imageDigest, imageUrn: 'urn:li:image:123', uploadState: 'uploaded' }],
      },
    });
    const persisted = await readFile(filePath, 'utf8');
    expect(JSON.parse(persisted)).toMatchObject({ version: 2 });
    expect(persisted).not.toContain('sourcePath');
    expect(persisted).not.toContain('uploadUrl');
    expect(persisted).not.toContain('altText');
  });
});

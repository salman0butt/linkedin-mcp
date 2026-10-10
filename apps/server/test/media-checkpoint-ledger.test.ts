import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  IdempotencyLedgerError,
  createFileIdempotencyLedger,
} from '../src/publishing/idempotency-ledger.js';

const roots: string[] = [];
const payloadHash = 'a'.repeat(64);
const imageDigest = 'b'.repeat(64);
const secondImageDigest = 'c'.repeat(64);

async function createLedgerPath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-media-ledger-'));
  roots.push(root);
  return join(root, 'ledger.json');
}

async function expectLedgerError(action: () => Promise<unknown>, kind: string): Promise<void> {
  try {
    await action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(IdempotencyLedgerError);
    expect((error as IdempotencyLedgerError).kind).toBe(kind);
    return;
  }
  throw new Error(`Expected idempotency ledger error: ${kind}`);
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

  it('durably checkpoints ordered image URNs and replays them after restart', async () => {
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
    await first.checkpointMedia({
      idempotencyKey: 'media-post',
      payloadHash,
      index: 1,
      checkpoint: {
        sha256: secondImageDigest,
        imageUrn: 'urn:li:image:456',
        uploadState: 'available',
      },
    });

    const restarted = createFileIdempotencyLedger({ filePath });
    await expect(restarted.reserve({ idempotencyKey: 'media-post', payloadHash })).resolves.toMatchObject({
      status: 'replay',
      record: {
        state: 'reserved',
        media: [
          { sha256: imageDigest, imageUrn: 'urn:li:image:123', uploadState: 'uploaded' },
          { sha256: secondImageDigest, imageUrn: 'urn:li:image:456', uploadState: 'available' },
        ],
      },
    });
    const persisted = await readFile(filePath, 'utf8');
    expect(JSON.parse(persisted)).toMatchObject({ version: 2 });
    expect(persisted).not.toContain('sourcePath');
    expect(persisted).not.toContain('uploadUrl');
    expect(persisted).not.toContain('altText');
  });

  it('rejects rebinding a checkpoint slot to a different image digest', async () => {
    const filePath = await createLedgerPath();
    const ledger = createFileIdempotencyLedger({ filePath });
    await ledger.reserve({ idempotencyKey: 'media-post', payloadHash });
    await ledger.checkpointMedia({
      idempotencyKey: 'media-post',
      payloadHash,
      index: 0,
      checkpoint: {
        sha256: imageDigest,
        imageUrn: 'urn:li:image:123',
        uploadState: 'uploaded',
      },
    });

    await expectLedgerError(
      () =>
        ledger.checkpointMedia({
          idempotencyKey: 'media-post',
          payloadHash,
          index: 0,
          checkpoint: {
            sha256: secondImageDigest,
            imageUrn: 'urn:li:image:999',
            uploadState: 'uploaded',
          },
        }),
      'conflict',
    );
  });

  it('preserves known image URNs when the terminal mutation outcome is unknown', async () => {
    const filePath = await createLedgerPath();
    const ledger = createFileIdempotencyLedger({ filePath });
    await ledger.reserve({ idempotencyKey: 'uncertain-media-post', payloadHash });
    await ledger.checkpointMedia({
      idempotencyKey: 'uncertain-media-post',
      payloadHash,
      index: 0,
      checkpoint: {
        sha256: imageDigest,
        imageUrn: 'urn:li:image:123',
        uploadState: 'uploaded',
      },
    });
    await ledger.complete({
      idempotencyKey: 'uncertain-media-post',
      payloadHash,
      state: 'outcome_unknown',
      result: { errorCode: 'transport_unknown' },
    });

    const restarted = createFileIdempotencyLedger({ filePath });
    await expect(
      restarted.reserve({ idempotencyKey: 'uncertain-media-post', payloadHash }),
    ).resolves.toMatchObject({
      status: 'replay',
      record: {
        state: 'outcome_unknown',
        media: [{ sha256: imageDigest, imageUrn: 'urn:li:image:123', uploadState: 'uploaded' }],
      },
    });
  });

  it('keeps terminal records immutable when a later checkpoint attempt arrives', async () => {
    const filePath = await createLedgerPath();
    const ledger = createFileIdempotencyLedger({ filePath });
    await ledger.reserve({ idempotencyKey: 'completed-media-post', payloadHash });
    await ledger.checkpointMedia({
      idempotencyKey: 'completed-media-post',
      payloadHash,
      index: 0,
      checkpoint: {
        sha256: imageDigest,
        imageUrn: 'urn:li:image:123',
        uploadState: 'uploaded',
      },
    });
    await ledger.complete({
      idempotencyKey: 'completed-media-post',
      payloadHash,
      state: 'succeeded',
      result: { postUrn: 'urn:li:share:123' },
    });
    const before = await readFile(filePath, 'utf8');

    await expect(
      ledger.checkpointMedia({
        idempotencyKey: 'completed-media-post',
        payloadHash,
        index: 0,
        checkpoint: {
          sha256: imageDigest,
          imageUrn: 'urn:li:image:456',
          uploadState: 'available',
        },
      }),
    ).resolves.toMatchObject({
      state: 'succeeded',
      media: [{ sha256: imageDigest, imageUrn: 'urn:li:image:123', uploadState: 'uploaded' }],
    });
    expect(await readFile(filePath, 'utf8')).toBe(before);
  });

  it('fails closed on corrupt v2 checkpoint data without rewriting the store', async () => {
    const filePath = await createLedgerPath();
    const corrupt = JSON.stringify({
      version: 2,
      records: [
        {
          idempotencyKey: 'media-post',
          payloadHash,
          state: 'reserved',
          createdAt: '2026-10-10T09:20:00.000Z',
          updatedAt: '2026-10-10T09:20:00.000Z',
          media: [
            {
              sha256: imageDigest,
              imageUrn: 'urn:li:image:123',
              uploadState: 'uploaded',
              uploadUrl: 'https://example.invalid/private',
            },
          ],
        },
      ],
    });
    await writeFile(filePath, corrupt, { encoding: 'utf8', mode: 0o600 });
    const ledger = createFileIdempotencyLedger({ filePath });

    await expectLedgerError(
      () => ledger.reserve({ idempotencyKey: 'media-post', payloadHash }),
      'corrupt_store',
    );
    expect(await readFile(filePath, 'utf8')).toBe(corrupt);
  });

  it('fails closed when a sibling process owns the checkpoint write lock', async () => {
    const filePath = await createLedgerPath();
    const ledger = createFileIdempotencyLedger({ filePath });
    await ledger.reserve({ idempotencyKey: 'media-post', payloadHash });
    const before = await readFile(filePath, 'utf8');
    const lockPath = join(filePath.slice(0, filePath.lastIndexOf('/')), '.ledger.json.lock');
    await writeFile(lockPath, 'owned by another writer\n', { encoding: 'utf8', mode: 0o600 });

    await expectLedgerError(
      () =>
        ledger.checkpointMedia({
          idempotencyKey: 'media-post',
          payloadHash,
          index: 0,
          checkpoint: {
            sha256: imageDigest,
            imageUrn: 'urn:li:image:123',
            uploadState: 'uploaded',
          },
        }),
      'store_unavailable',
    );
    expect(await readFile(filePath, 'utf8')).toBe(before);
  });
});

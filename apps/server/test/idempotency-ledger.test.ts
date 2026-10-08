import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { IdempotencyLedgerError, createFileIdempotencyLedger } from '../src/publishing/idempotency-ledger.js';

const roots: string[] = [];
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-idempotency-'));
  roots.push(root);
  return root;
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
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('M02 persistent idempotency ledger', () => {
  it('creates and persists a new reserved mutation record', async () => {
    const root = await createRoot();
    const filePath = join(root, 'state', 'idempotency.json');
    const ledger = createFileIdempotencyLedger({
      filePath,
      now: () => new Date('2026-10-08T09:20:00.000Z'),
    });

    await expect(ledger.reserve({ idempotencyKey: 'operation-1', payloadHash: hashA })).resolves.toEqual({
      status: 'reserved',
      record: {
        idempotencyKey: 'operation-1',
        payloadHash: hashA,
        state: 'reserved',
        createdAt: '2026-10-08T09:20:00.000Z',
        updatedAt: '2026-10-08T09:20:00.000Z',
      },
    });

    const stored = JSON.parse(await readFile(filePath, 'utf8')) as { version: number; records: unknown[] };
    expect(stored.version).toBe(1);
    expect(stored.records).toHaveLength(1);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it('returns same-key same-hash replay and rejects same-key different-hash conflicts', async () => {
    const root = await createRoot();
    const ledger = createFileIdempotencyLedger({ filePath: join(root, 'idempotency.json') });

    const first = await ledger.reserve({ idempotencyKey: 'operation-1', payloadHash: hashA });
    const replay = await ledger.reserve({ idempotencyKey: 'operation-1', payloadHash: hashA });

    expect(first.status).toBe('reserved');
    expect(replay).toEqual({ status: 'replay', record: first.record });
    await expectLedgerError(
      () => ledger.reserve({ idempotencyKey: 'operation-1', payloadHash: hashB }),
      'conflict',
    );
  });

  it('persists successful terminal results across restarts and replays them without a new reservation', async () => {
    const root = await createRoot();
    const filePath = join(root, 'idempotency.json');
    let now = new Date('2026-10-08T09:20:00.000Z');
    const first = createFileIdempotencyLedger({ filePath, now: () => now });

    await first.reserve({ idempotencyKey: 'operation-1', payloadHash: hashA });
    now = new Date('2026-10-08T09:21:00.000Z');
    await expect(
      first.complete({
        idempotencyKey: 'operation-1',
        payloadHash: hashA,
        state: 'succeeded',
        result: { postUrn: 'urn:li:share:123' },
      }),
    ).resolves.toMatchObject({
      state: 'succeeded',
      result: { postUrn: 'urn:li:share:123' },
      updatedAt: '2026-10-08T09:21:00.000Z',
    });

    const restarted = createFileIdempotencyLedger({ filePath });
    const replay = await restarted.reserve({ idempotencyKey: 'operation-1', payloadHash: hashA });
    expect(replay.status).toBe('replay');
    expect(replay.record).toMatchObject({
      state: 'succeeded',
      result: { postUrn: 'urn:li:share:123' },
    });
  });

  it('persists terminal failure and outcome-unknown states for safe replay instead of retrying', async () => {
    const root = await createRoot();
    const ledger = createFileIdempotencyLedger({ filePath: join(root, 'idempotency.json') });

    await ledger.reserve({ idempotencyKey: 'terminal', payloadHash: hashA });
    await ledger.complete({
      idempotencyKey: 'terminal',
      payloadHash: hashA,
      state: 'failed_terminal',
      result: { errorCode: 'provider_rejected' },
    });
    expect(await ledger.reserve({ idempotencyKey: 'terminal', payloadHash: hashA })).toMatchObject({
      status: 'replay',
      record: { state: 'failed_terminal', result: { errorCode: 'provider_rejected' } },
    });

    await ledger.reserve({ idempotencyKey: 'unknown', payloadHash: hashB });
    await ledger.complete({
      idempotencyKey: 'unknown',
      payloadHash: hashB,
      state: 'outcome_unknown',
      result: { errorCode: 'transport_unknown' },
    });
    expect(await ledger.reserve({ idempotencyKey: 'unknown', payloadHash: hashB })).toMatchObject({
      status: 'replay',
      record: { state: 'outcome_unknown', result: { errorCode: 'transport_unknown' } },
    });
  });

  it('writes replacement state through a same-directory temporary file with restrictive permissions', async () => {
    const operations: string[] = [];
    const root = await createRoot();
    const filePath = join(root, 'state', 'idempotency.json');
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });

    const ledger = createFileIdempotencyLedger({
      filePath,
      filesystem: {
        readFile: () => Promise.reject(missing),
        mkdir: () => Promise.resolve(undefined),
        writeFile: (path, _data, options) => {
          operations.push(`write:${path}`);
          expect(dirname(path)).toBe(dirname(filePath));
          expect(path).not.toBe(filePath);
          expect(options).toMatchObject({ mode: 0o600, flag: 'wx' });
          return Promise.resolve();
        },
        rename: (from, to) => {
          operations.push(`rename:${from}->${to}`);
          expect(dirname(from)).toBe(dirname(filePath));
          expect(to).toBe(filePath);
          return Promise.resolve();
        },
        unlink: () => Promise.resolve(),
      },
    });

    await ledger.reserve({ idempotencyKey: 'operation-atomic', payloadHash: hashA });
    expect(operations).toHaveLength(2);
    expect(operations[0]).toMatch(/^write:/);
    expect(operations[1]).toMatch(/^rename:/);
  });

  it('fails closed on corrupt persisted state without overwriting it', async () => {
    const root = await createRoot();
    const filePath = join(root, 'idempotency.json');
    const corrupt = '{ definitely-not-valid-json';
    await writeFile(filePath, corrupt, { encoding: 'utf8', mode: 0o600 });
    const ledger = createFileIdempotencyLedger({ filePath });

    await expectLedgerError(
      () => ledger.reserve({ idempotencyKey: 'operation-1', payloadHash: hashA }),
      'corrupt_store',
    );
    expect(await readFile(filePath, 'utf8')).toBe(corrupt);
    expect(await readdir(root)).toEqual(['idempotency.json']);
  });

  it('rejects terminal completion without a matching reserved operation', async () => {
    const root = await createRoot();
    const ledger = createFileIdempotencyLedger({ filePath: join(root, 'idempotency.json') });

    await expectLedgerError(
      () =>
        ledger.complete({
          idempotencyKey: 'missing',
          payloadHash: hashA,
          state: 'succeeded',
          result: { postUrn: 'urn:li:share:missing' },
        }),
      'not_reserved',
    );
  });
});

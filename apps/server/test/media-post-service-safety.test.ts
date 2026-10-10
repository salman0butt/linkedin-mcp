import { describe, expect, it, vi } from 'vitest';

import { createApprovalService } from '../src/publishing/approval-service.js';
import type {
  CheckpointMediaInput,
  CompleteMutationInput,
  MediaIdempotencyLedger,
  MutationRecord,
  ReserveMutationInput,
} from '../src/publishing/idempotency-ledger.js';
import { LinkedInImagesError } from '../src/publishing/linkedin-images.js';
import { LinkedInPostsError } from '../src/publishing/linkedin-posts.js';
import { createMediaPostService } from '../src/publishing/media-post-service.js';

const file = {
  sourceName: 'first.png',
  bytes: Buffer.from([1, 2, 3]),
  sha256: 'a'.repeat(64),
  mimeType: 'image/png' as const,
  byteLength: 3,
  width: 2,
  height: 2,
};

const draft = {
  text: 'Safety regression',
  image: { sourcePath: 'first.png', altText: 'First image' },
  visibility: 'PUBLIC' as const,
};

function clone(record: MutationRecord): MutationRecord {
  return structuredClone(record);
}

function controllableLedger() {
  const records = new Map<string, MutationRecord>();
  let failCheckpoint = false;
  let failComplete = false;

  const ledger: MediaIdempotencyLedger = {
    reserve(input: ReserveMutationInput) {
      const existing = records.get(input.idempotencyKey);
      if (existing !== undefined) {
        if (existing.payloadHash !== input.payloadHash) return Promise.reject(new Error('conflict'));
        return Promise.resolve({ status: 'replay' as const, record: clone(existing) });
      }
      const record: MutationRecord = {
        idempotencyKey: input.idempotencyKey,
        payloadHash: input.payloadHash,
        state: 'reserved',
        createdAt: '2026-10-10T00:00:00.000Z',
        updatedAt: '2026-10-10T00:00:00.000Z',
      };
      records.set(input.idempotencyKey, record);
      return Promise.resolve({ status: 'reserved' as const, record: clone(record) });
    },

    checkpointMedia(input: CheckpointMediaInput) {
      if (failCheckpoint) {
        failCheckpoint = false;
        return Promise.reject(new Error('checkpoint unavailable'));
      }
      const record = records.get(input.idempotencyKey);
      if (record === undefined || record.payloadHash !== input.payloadHash) {
        return Promise.reject(new Error('checkpoint conflict'));
      }
      const media = record.media ?? [];
      const previous = media[input.index];
      media[input.index] = {
        sha256: previous?.sha256 ?? input.checkpoint.sha256,
        ...(previous?.imageUrn === undefined && input.checkpoint.imageUrn === undefined
          ? {}
          : { imageUrn: previous?.imageUrn ?? input.checkpoint.imageUrn }),
        uploadState: input.checkpoint.uploadState,
      };
      record.media = media;
      return Promise.resolve(clone(record));
    },

    complete(input: CompleteMutationInput) {
      if (failComplete) {
        failComplete = false;
        return Promise.reject(new Error('completion unavailable'));
      }
      const record = records.get(input.idempotencyKey);
      if (record === undefined || record.payloadHash !== input.payloadHash) {
        return Promise.reject(new Error('completion conflict'));
      }
      if (record.state === 'reserved') {
        record.state = input.state;
        if (input.result !== undefined) record.result = { ...input.result };
      }
      return Promise.resolve(clone(record));
    },
  };

  return {
    ledger,
    failNextCheckpointAndCompletion() {
      failCheckpoint = true;
      failComplete = true;
    },
  };
}

function buildSafetyService(options?: {
  verification?: 'available' | 'processing_failed' | 'pending' | 'verification_unavailable';
  initializeError?: Error;
  postError?: Error;
  ttlMs?: number;
}) {
  let subject = 'member-123';
  let nowMs = Date.parse('2026-10-10T00:00:00.000Z');
  let imageNumber = 0;
  const storage = controllableLedger();
  const auth = {
    getProviderContext: vi.fn(() =>
      Promise.resolve({
        accessToken: 'access-token-secret',
        subject,
        scopes: ['w_member_social'],
      }),
    ),
    markReauthRequired: vi.fn(() => Promise.resolve()),
  };
  const approvals = createApprovalService({
    now: () => new Date(nowMs),
    randomId: () => 'approval-safety',
    ...(options?.ttlMs === undefined ? {} : { ttlMs: options.ttlMs }),
  });
  const images = {
    initializeUpload: vi.fn(() => {
      if (options?.initializeError !== undefined) return Promise.reject(options.initializeError);
      imageNumber += 1;
      return Promise.resolve({
        imageUrn: `urn:li:image:safety-${imageNumber}`,
        uploadUrl: `https://media-upload.linkedin.com/safety-${imageNumber}`,
        uploadUrlExpiresAt: 1_900_000_000_000,
      });
    }),
    upload: vi.fn(() => Promise.resolve()),
    getStatus: vi.fn(() => Promise.resolve('AVAILABLE' as const)),
  };
  const posts = {
    createImagePost: vi.fn(() =>
      options?.postError === undefined
        ? Promise.resolve({ postUrn: 'urn:li:share:9001' })
        : Promise.reject(options.postError),
    ),
    createMultiImagePost: vi.fn(() => Promise.resolve({ postUrn: 'urn:li:share:9002' })),
  };
  const verifyImage = vi.fn(() => Promise.resolve(options?.verification ?? 'available'));
  const reader = { read: vi.fn(() => Promise.resolve(file)) };
  const service = createMediaPostService({
    auth,
    approvals,
    ledger: storage.ledger,
    files: reader,
    images,
    posts,
    imageStatusReadEnabled: true,
    verifyImage,
  });

  return {
    service,
    auth,
    images,
    posts,
    storage,
    setSubject(value: string) {
      subject = value;
    },
    advanceTime(milliseconds: number) {
      nowMs += milliseconds;
    },
  };
}

async function approveSingle(built: ReturnType<typeof buildSafetyService>) {
  const preview = await built.service.previewImage(draft);
  const approval = await built.service.approve({ payloadHash: preview.payloadHash });
  return {
    preview,
    approval,
    input: {
      draft,
      payloadHash: preview.payloadHash,
      approvalReceiptId: approval.receiptId,
      idempotencyKey: 'safety-key',
    },
  };
}

describe('media orchestration safety regressions', () => {
  it('does not re-initialize after remote initialize succeeded but durable checkpointing was unavailable', async () => {
    const built = buildSafetyService();
    const { input } = await approveSingle(built);
    built.storage.failNextCheckpointAndCompletion();

    await expect(built.service.createImage(input)).rejects.toMatchObject({ kind: 'outcome_unknown' });
    expect(built.images.initializeUpload).toHaveBeenCalledTimes(1);

    await expect(built.service.createImage(input)).rejects.toMatchObject({ kind: 'outcome_unknown' });
    expect(built.images.initializeUpload).toHaveBeenCalledTimes(1);
    expect(built.images.upload).not.toHaveBeenCalled();
    expect(built.posts.createImagePost).not.toHaveBeenCalled();
  });

  it('rejects approval replay under a different authenticated subject before provider mutation', async () => {
    const built = buildSafetyService();
    const { input } = await approveSingle(built);
    built.setSubject('member-456');

    await expect(built.service.createImage(input)).rejects.toMatchObject({ kind: 'approval_mismatch' });
    expect(built.images.initializeUpload).not.toHaveBeenCalled();
    expect(built.posts.createImagePost).not.toHaveBeenCalled();
  });

  it('rejects an expired approval before provider mutation', async () => {
    const built = buildSafetyService({ ttlMs: 1_000 });
    const { input } = await approveSingle(built);
    built.advanceTime(1_000);

    await expect(built.service.createImage(input)).rejects.toMatchObject({ kind: 'approval_expired' });
    expect(built.images.initializeUpload).not.toHaveBeenCalled();
    expect(built.posts.createImagePost).not.toHaveBeenCalled();
  });

  it('blocks post creation when image processing fails', async () => {
    const built = buildSafetyService({ verification: 'processing_failed' });
    const { input } = await approveSingle(built);

    await expect(built.service.createImage(input)).rejects.toMatchObject({
      kind: 'media_processing_failed',
    });
    expect(built.posts.createImagePost).not.toHaveBeenCalled();
  });

  it('marks reauthentication on image-provider 401 without posting', async () => {
    const built = buildSafetyService({
      initializeError: new LinkedInImagesError('reauthentication_required'),
    });
    const { input } = await approveSingle(built);

    await expect(built.service.createImage(input)).rejects.toMatchObject({ kind: 'reauth_required' });
    expect(built.auth.markReauthRequired).toHaveBeenCalledTimes(1);
    expect(built.posts.createImagePost).not.toHaveBeenCalled();
  });

  it('never retries a Posts mutation whose outcome became unknown', async () => {
    const built = buildSafetyService({ postError: new LinkedInPostsError('outcome_unknown') });
    const { input } = await approveSingle(built);

    await expect(built.service.createImage(input)).rejects.toMatchObject({ kind: 'outcome_unknown' });
    await expect(built.service.createImage(input)).rejects.toMatchObject({ kind: 'outcome_unknown' });
    expect(built.posts.createImagePost).toHaveBeenCalledTimes(1);
  });

  it('marks reauthentication on Posts 401 and never repeats the mutation', async () => {
    const built = buildSafetyService({
      postError: new LinkedInPostsError('reauthentication_required'),
    });
    const { input } = await approveSingle(built);

    await expect(built.service.createImage(input)).rejects.toMatchObject({ kind: 'reauth_required' });
    await expect(built.service.createImage(input)).rejects.toMatchObject({ kind: 'reauth_required' });
    expect(built.auth.markReauthRequired).toHaveBeenCalledTimes(1);
    expect(built.posts.createImagePost).toHaveBeenCalledTimes(1);
  });
});

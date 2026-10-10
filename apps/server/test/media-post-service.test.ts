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
import { createMediaPostService } from '../src/publishing/media-post-service.js';

const firstFile = {
  sourceName: 'first.png',
  bytes: Buffer.from([1, 2, 3]),
  sha256: 'a'.repeat(64),
  mimeType: 'image/png' as const,
  byteLength: 3,
  width: 2,
  height: 2,
};

const secondFile = {
  sourceName: 'second.jpg',
  bytes: Buffer.from([4, 5, 6]),
  sha256: 'b'.repeat(64),
  mimeType: 'image/jpeg' as const,
  byteLength: 3,
  width: 3,
  height: 2,
};

const singleDraft = {
  text: 'Ship one image safely',
  image: { sourcePath: 'first.png', altText: 'First image' },
  visibility: 'PUBLIC' as const,
};

const multiDraft = {
  text: 'Ship two images safely',
  images: [
    { sourcePath: 'first.png', altText: 'First image' },
    { sourcePath: 'second.jpg', altText: 'Second image' },
  ],
  visibility: 'PUBLIC' as const,
};

function cloneRecord(record: MutationRecord): MutationRecord {
  return structuredClone(record);
}

function memoryLedger(): MediaIdempotencyLedger {
  const records = new Map<string, MutationRecord>();

  return {
    reserve(input: ReserveMutationInput) {
      const existing = records.get(input.idempotencyKey);
      if (existing !== undefined) {
        if (existing.payloadHash !== input.payloadHash) {
          return Promise.reject(new Error('idempotency conflict'));
        }
        return Promise.resolve({ status: 'replay' as const, record: cloneRecord(existing) });
      }
      const record: MutationRecord = {
        idempotencyKey: input.idempotencyKey,
        payloadHash: input.payloadHash,
        state: 'reserved',
        createdAt: '2026-10-10T00:00:00.000Z',
        updatedAt: '2026-10-10T00:00:00.000Z',
      };
      records.set(input.idempotencyKey, record);
      return Promise.resolve({ status: 'reserved' as const, record: cloneRecord(record) });
    },

    checkpointMedia(input: CheckpointMediaInput) {
      const record = records.get(input.idempotencyKey);
      if (record === undefined || record.payloadHash !== input.payloadHash) {
        return Promise.reject(new Error('checkpoint conflict'));
      }
      if (record.state !== 'reserved') return Promise.resolve(cloneRecord(record));
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
      return Promise.resolve(cloneRecord(record));
    },

    complete(input: CompleteMutationInput) {
      const record = records.get(input.idempotencyKey);
      if (record === undefined || record.payloadHash !== input.payloadHash) {
        return Promise.reject(new Error('completion conflict'));
      }
      if (record.state === 'reserved') {
        record.state = input.state;
        if (input.result !== undefined) record.result = { ...input.result };
      }
      return Promise.resolve(cloneRecord(record));
    },
  };
}

function buildService(options?: {
  scopes?: string[];
  firstRead?: typeof firstFile;
  verification?: 'available' | 'processing_failed' | 'pending' | 'verification_unavailable';
  uploadError?: Error;
}) {
  const files = new Map<string, typeof firstFile | typeof secondFile>([
    ['first.png', options?.firstRead ?? firstFile],
    ['second.jpg', secondFile],
  ]);
  const auth = {
    getProviderContext: vi.fn(() =>
      Promise.resolve({
        accessToken: 'access-token-secret',
        subject: 'member-123',
        scopes: options?.scopes ?? ['w_member_social'],
      }),
    ),
    markReauthRequired: vi.fn(() => Promise.resolve()),
  };
  const approvals = createApprovalService({ randomId: () => 'approval-receipt' });
  const ledger = memoryLedger();
  let imageNumber = 0;
  const images = {
    initializeUpload: vi.fn(() => {
      imageNumber += 1;
      return Promise.resolve({
        imageUrn: `urn:li:image:image-${imageNumber}`,
        uploadUrl: `https://media-upload.linkedin.com/image-${imageNumber}`,
        uploadUrlExpiresAt: 1_900_000_000_000,
      });
    }),
    upload: vi.fn(() =>
      options?.uploadError === undefined ? Promise.resolve() : Promise.reject(options.uploadError),
    ),
    getStatus: vi.fn(() => Promise.resolve('AVAILABLE' as const)),
  };
  const posts = {
    createImagePost: vi.fn(() => Promise.resolve({ postUrn: 'urn:li:share:1001' })),
    createMultiImagePost: vi.fn(() => Promise.resolve({ postUrn: 'urn:li:share:2002' })),
  };
  const verifyImage = vi.fn(() => Promise.resolve(options?.verification ?? 'available'));
  const reader = {
    read: vi.fn((sourcePath: string) => {
      const file = files.get(sourcePath);
      return file === undefined ? Promise.reject(new Error('missing fixture')) : Promise.resolve(file);
    }),
  };

  const service = createMediaPostService({
    auth,
    approvals,
    ledger,
    files: reader,
    images,
    posts,
    imageStatusReadEnabled: true,
    verifyImage,
  });

  return { service, auth, ledger, files, reader, images, posts, verifyImage };
}

describe('approval-gated media post service', () => {
  it('previews one local image without exposing source paths or bytes', async () => {
    const { service } = buildService();

    const preview = await service.previewImage(singleDraft);

    expect(preview.payload.media).toMatchObject({
      sourceName: 'first.png',
      sha256: 'a'.repeat(64),
      altText: 'First image',
    });
    expect(JSON.stringify(preview)).not.toContain('sourcePath');
    expect(JSON.stringify(preview)).not.toContain('access-token-secret');
  });

  it('requires w_member_social before issuing media approval', async () => {
    const { service } = buildService({ scopes: [] });

    await expect(service.approve({ payloadHash: 'a'.repeat(64) })).rejects.toMatchObject({
      kind: 'permission_required',
    });
  });

  it('rejects file replacement after approval before any provider mutation', async () => {
    const { service, files, images, posts } = buildService();
    const preview = await service.previewImage(singleDraft);
    const approval = await service.approve({ payloadHash: preview.payloadHash });
    files.set('first.png', { ...firstFile, bytes: Buffer.from([9]), sha256: 'c'.repeat(64), byteLength: 1 });

    await expect(
      service.createImage({
        draft: singleDraft,
        payloadHash: preview.payloadHash,
        approvalReceiptId: approval.receiptId,
        idempotencyKey: 'single-changed',
      }),
    ).rejects.toMatchObject({ kind: 'media_changed' });
    expect(images.initializeUpload).not.toHaveBeenCalled();
    expect(posts.createImagePost).not.toHaveBeenCalled();
  });

  it('uploads, checkpoints, verifies and creates exactly one single-image post', async () => {
    const { service, images, posts } = buildService();
    const preview = await service.previewImage(singleDraft);
    const approval = await service.approve({ payloadHash: preview.payloadHash });

    await expect(
      service.createImage({
        draft: singleDraft,
        payloadHash: preview.payloadHash,
        approvalReceiptId: approval.receiptId,
        idempotencyKey: 'single-success',
      }),
    ).resolves.toMatchObject({
      state: 'succeeded',
      provider: 'OFFICIAL_API',
      postUrn: 'urn:li:share:1001',
      imageUrns: ['urn:li:image:image-1'],
      replay: false,
    });
    expect(images.initializeUpload).toHaveBeenCalledTimes(1);
    expect(images.upload).toHaveBeenCalledTimes(1);
    expect(posts.createImagePost).toHaveBeenCalledTimes(1);
  });

  it('allows post creation when processing verification is legitimately unavailable', async () => {
    const { service, posts } = buildService({ verification: 'verification_unavailable' });
    const preview = await service.previewImage(singleDraft);
    const approval = await service.approve({ payloadHash: preview.payloadHash });

    await expect(
      service.createImage({
        draft: singleDraft,
        payloadHash: preview.payloadHash,
        approvalReceiptId: approval.receiptId,
        idempotencyKey: 'single-unverified',
      }),
    ).resolves.toMatchObject({ processing: ['verification_unavailable'] });
    expect(posts.createImagePost).toHaveBeenCalledTimes(1);
  });

  it('keeps a pending upload resumable and reuses its image URN without duplicate upload', async () => {
    const built = buildService({ verification: 'pending' });
    const preview = await built.service.previewImage(singleDraft);
    const approval = await built.service.approve({ payloadHash: preview.payloadHash });
    const createInput = {
      draft: singleDraft,
      payloadHash: preview.payloadHash,
      approvalReceiptId: approval.receiptId,
      idempotencyKey: 'single-pending',
    };

    await expect(built.service.createImage(createInput)).rejects.toMatchObject({
      kind: 'media_processing_pending',
    });
    expect(built.posts.createImagePost).not.toHaveBeenCalled();
    expect(built.images.initializeUpload).toHaveBeenCalledTimes(1);
    expect(built.images.upload).toHaveBeenCalledTimes(1);

    built.verifyImage.mockResolvedValue('available');
    await expect(built.service.createImage(createInput)).resolves.toMatchObject({
      state: 'succeeded',
      imageUrns: ['urn:li:image:image-1'],
    });
    expect(built.images.initializeUpload).toHaveBeenCalledTimes(1);
    expect(built.images.upload).toHaveBeenCalledTimes(1);
    expect(built.posts.createImagePost).toHaveBeenCalledTimes(1);
  });

  it('does not retry an upload whose transport outcome became unknown', async () => {
    const built = buildService({ uploadError: new LinkedInImagesError('outcome_unknown') });
    const preview = await built.service.previewImage(singleDraft);
    const approval = await built.service.approve({ payloadHash: preview.payloadHash });
    const createInput = {
      draft: singleDraft,
      payloadHash: preview.payloadHash,
      approvalReceiptId: approval.receiptId,
      idempotencyKey: 'single-upload-unknown',
    };

    await expect(built.service.createImage(createInput)).rejects.toMatchObject({ kind: 'outcome_unknown' });
    await expect(built.service.createImage(createInput)).rejects.toMatchObject({ kind: 'outcome_unknown' });
    expect(built.images.initializeUpload).toHaveBeenCalledTimes(1);
    expect(built.images.upload).toHaveBeenCalledTimes(1);
    expect(built.posts.createImagePost).not.toHaveBeenCalled();
  });

  it('replays a successful single-image result without a second remote mutation', async () => {
    const built = buildService();
    const preview = await built.service.previewImage(singleDraft);
    const approval = await built.service.approve({ payloadHash: preview.payloadHash });
    const createInput = {
      draft: singleDraft,
      payloadHash: preview.payloadHash,
      approvalReceiptId: approval.receiptId,
      idempotencyKey: 'single-replay',
    };

    await expect(built.service.createImage(createInput)).resolves.toMatchObject({ replay: false });
    await expect(built.service.createImage(createInput)).resolves.toMatchObject({
      replay: true,
      postUrn: 'urn:li:share:1001',
    });
    expect(built.images.initializeUpload).toHaveBeenCalledTimes(1);
    expect(built.images.upload).toHaveBeenCalledTimes(1);
    expect(built.posts.createImagePost).toHaveBeenCalledTimes(1);
  });

  it('preserves multi-image order from local files through the Posts mutation', async () => {
    const built = buildService();
    const preview = await built.service.previewMultiImage(multiDraft);
    const approval = await built.service.approve({ payloadHash: preview.payloadHash });

    await expect(
      built.service.createMultiImage({
        draft: multiDraft,
        payloadHash: preview.payloadHash,
        approvalReceiptId: approval.receiptId,
        idempotencyKey: 'multi-success',
      }),
    ).resolves.toMatchObject({
      imageUrns: ['urn:li:image:image-1', 'urn:li:image:image-2'],
      postUrn: 'urn:li:share:2002',
    });
    expect(built.posts.createMultiImagePost).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrns: ['urn:li:image:image-1', 'urn:li:image:image-2'],
      }),
    );
  });
});

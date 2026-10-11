import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApprovalService } from '../src/publishing/approval-service.js';
import { createFileIdempotencyLedger } from '../src/publishing/idempotency-ledger.js';
import { createMediaPostService } from '../src/publishing/media-post-service.js';

const roots: string[] = [];

const file = {
  sourceName: 'shared.png',
  bytes: Buffer.from([1, 2, 3]),
  sha256: 'a'.repeat(64),
  mimeType: 'image/png' as const,
  byteLength: 3,
  width: 2,
  height: 2,
};

const draft = {
  text: 'Cross-process safety',
  image: { sourcePath: 'shared.png', altText: 'Shared image' },
  visibility: 'PUBLIC' as const,
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('cross-process media mutation serialization', () => {
  it('allows only one runtime to initialize media for the same durable idempotency key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-media-race-'));
    roots.push(root);
    const ledgerPath = join(root, 'ledger.json');

    const firstInitializeEntered = deferred();
    const secondInitializeEntered = deferred();
    const competitorSettled = deferred();
    let initializeNumber = 0;

    const images = {
      initializeUpload: vi.fn(async () => {
        initializeNumber += 1;
        const current = initializeNumber;
        if (current === 1) {
          firstInitializeEntered.resolve();
          await Promise.race([secondInitializeEntered.promise, competitorSettled.promise]);
        } else if (current === 2) {
          secondInitializeEntered.resolve();
        }
        return {
          imageUrn: `urn:li:image:cross-process-${current}`,
          uploadUrl: `https://media-upload.linkedin.com/cross-process-${current}`,
          uploadUrlExpiresAt: 1_900_000_000_000,
        };
      }),
      upload: vi.fn(() => Promise.resolve()),
      getStatus: vi.fn(() => Promise.resolve('AVAILABLE' as const)),
    };
    const posts = {
      createImagePost: vi.fn(() => Promise.resolve({ postUrn: 'urn:li:share:8801' })),
      createMultiImagePost: vi.fn(() => Promise.resolve({ postUrn: 'urn:li:share:8802' })),
    };
    const auth = {
      getProviderContext: vi.fn(() =>
        Promise.resolve({
          accessToken: 'access-token-secret',
          subject: 'member-123',
          scopes: ['w_member_social'],
        }),
      ),
      markReauthRequired: vi.fn(() => Promise.resolve()),
    };
    const files = { read: vi.fn(() => Promise.resolve(file)) };
    const verifyImage = vi.fn(() => Promise.resolve('available' as const));

    const serviceA = createMediaPostService({
      auth,
      approvals: createApprovalService({ randomId: () => 'approval-a' }),
      ledger: createFileIdempotencyLedger({ filePath: ledgerPath }),
      files,
      images,
      posts,
      imageStatusReadEnabled: true,
      verifyImage,
    });
    const serviceB = createMediaPostService({
      auth,
      approvals: createApprovalService({ randomId: () => 'approval-b' }),
      ledger: createFileIdempotencyLedger({ filePath: ledgerPath }),
      files,
      images,
      posts,
      imageStatusReadEnabled: true,
      verifyImage,
    });

    const preview = await serviceA.previewImage(draft);
    const approvalA = await serviceA.approve({ payloadHash: preview.payloadHash });
    const approvalB = await serviceB.approve({ payloadHash: preview.payloadHash });
    const common = {
      draft,
      payloadHash: preview.payloadHash,
      idempotencyKey: 'shared-cross-process-key',
    };

    const first = serviceA.createImage({ ...common, approvalReceiptId: approvalA.receiptId });
    await firstInitializeEntered.promise;
    const second = serviceB
      .createImage({ ...common, approvalReceiptId: approvalB.receiptId })
      .finally(competitorSettled.resolve);

    const outcomes = await Promise.allSettled([first, second]);

    expect(images.initializeUpload).toHaveBeenCalledTimes(1);
    expect(images.upload).toHaveBeenCalledTimes(1);
    expect(posts.createImagePost).toHaveBeenCalledTimes(1);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
  });

  it('allows only one runtime to create the final post while an uploaded checkpoint is in flight', async () => {
    const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-post-race-'));
    roots.push(root);
    const ledgerPath = join(root, 'ledger.json');

    const firstVerificationEntered = deferred();
    const competitorPostEntered = deferred();
    const competitorSettled = deferred();
    let postNumber = 0;

    const images = {
      initializeUpload: vi.fn(() =>
        Promise.resolve({
          imageUrn: 'urn:li:image:cross-process-shared',
          uploadUrl: 'https://media-upload.linkedin.com/cross-process-shared',
          uploadUrlExpiresAt: 1_900_000_000_000,
        }),
      ),
      upload: vi.fn(() => Promise.resolve()),
      getStatus: vi.fn(() => Promise.resolve('AVAILABLE' as const)),
    };
    const posts = {
      createImagePost: vi.fn(() => {
        postNumber += 1;
        if (postNumber === 1) competitorPostEntered.resolve();
        return Promise.resolve({ postUrn: `urn:li:share:${8900 + postNumber}` });
      }),
      createMultiImagePost: vi.fn(() => Promise.resolve({ postUrn: 'urn:li:share:8999' })),
    };
    const auth = {
      getProviderContext: vi.fn(() =>
        Promise.resolve({
          accessToken: 'access-token-secret',
          subject: 'member-123',
          scopes: ['w_member_social'],
        }),
      ),
      markReauthRequired: vi.fn(() => Promise.resolve()),
    };
    const files = { read: vi.fn(() => Promise.resolve(file)) };
    const verifyFirst = vi.fn(async () => {
      firstVerificationEntered.resolve();
      await Promise.race([competitorPostEntered.promise, competitorSettled.promise]);
      return 'available' as const;
    });
    const verifySecond = vi.fn(() => Promise.resolve('available' as const));

    const serviceA = createMediaPostService({
      auth,
      approvals: createApprovalService({ randomId: () => 'post-approval-a' }),
      ledger: createFileIdempotencyLedger({ filePath: ledgerPath }),
      files,
      images,
      posts,
      imageStatusReadEnabled: true,
      verifyImage: verifyFirst,
    });
    const serviceB = createMediaPostService({
      auth,
      approvals: createApprovalService({ randomId: () => 'post-approval-b' }),
      ledger: createFileIdempotencyLedger({ filePath: ledgerPath }),
      files,
      images,
      posts,
      imageStatusReadEnabled: true,
      verifyImage: verifySecond,
    });

    const preview = await serviceA.previewImage(draft);
    const approvalA = await serviceA.approve({ payloadHash: preview.payloadHash });
    const approvalB = await serviceB.approve({ payloadHash: preview.payloadHash });
    const common = {
      draft,
      payloadHash: preview.payloadHash,
      idempotencyKey: 'shared-post-cross-process-key',
    };

    const first = serviceA.createImage({ ...common, approvalReceiptId: approvalA.receiptId });
    await firstVerificationEntered.promise;
    const second = serviceB
      .createImage({ ...common, approvalReceiptId: approvalB.receiptId })
      .finally(competitorSettled.resolve);

    const outcomes = await Promise.allSettled([first, second]);

    expect(images.initializeUpload).toHaveBeenCalledTimes(1);
    expect(images.upload).toHaveBeenCalledTimes(1);
    expect(posts.createImagePost).toHaveBeenCalledTimes(1);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
  });
});

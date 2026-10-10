import { describe, expect, it } from 'vitest';

import type {
  CanonicalImageDescriptor,
  ImagePostPayload,
  MultiImagePostPayload,
} from '../../../packages/core/dist/index.js';
import { createLinkedInPostsAdapter } from '../src/publishing/linkedin-posts.js';

const firstImage: CanonicalImageDescriptor = {
  sourceName: 'first.png',
  sha256: 'a'.repeat(64),
  mimeType: 'image/png',
  byteLength: 32,
  width: 2,
  height: 2,
  altText: 'First image',
};

const secondImage: CanonicalImageDescriptor = {
  sourceName: 'second.jpg',
  sha256: 'b'.repeat(64),
  mimeType: 'image/jpeg',
  byteLength: 48,
  width: 3,
  height: 2,
  altText: 'Second image',
};

const common = {
  commentary: 'Ship media safely',
  visibility: 'PUBLIC' as const,
  distribution: {
    feedDistribution: 'MAIN_FEED' as const,
    targetEntities: [] as const,
    thirdPartyDistributionChannels: [] as const,
  },
  lifecycleState: 'PUBLISHED' as const,
  isReshareDisabled: false,
};

const imagePayload: ImagePostPayload = {
  contentKind: 'image',
  ...common,
  media: firstImage,
};

const multiImagePayload: MultiImagePostPayload = {
  contentKind: 'multi_image',
  ...common,
  media: [firstImage, secondImage],
};

function recorder(response: Response) {
  const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
  return {
    calls,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return Promise.resolve(response);
    }) as typeof fetch,
  };
}

describe('LinkedIn Posts media payload mapping', () => {
  it('creates one single-image post with id and alt text', async () => {
    const recorded = recorder(
      new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:101' } }),
    );
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    await expect(
      adapter.createImagePost({
        accessToken: 'access-token-secret',
        author: 'urn:li:person:member-123',
        payload: imagePayload,
        imageUrn: 'urn:li:image:first-image',
      }),
    ).resolves.toEqual({ postUrn: 'urn:li:share:101' });

    expect(recorded.calls).toHaveLength(1);
    expect(recorded.calls[0]?.init?.body).toBe(
      JSON.stringify({
        author: 'urn:li:person:member-123',
        commentary: 'Ship media safely',
        visibility: 'PUBLIC',
        distribution: common.distribution,
        lifecycleState: 'PUBLISHED',
        isReshareDisabled: false,
        content: {
          media: {
            id: 'urn:li:image:first-image',
            altText: 'First image',
          },
        },
      }),
    );
  });

  it('creates one multi-image post with ordered ids and alt text', async () => {
    const recorded = recorder(
      new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:202' } }),
    );
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    await expect(
      adapter.createMultiImagePost({
        accessToken: 'access-token-secret',
        author: 'urn:li:person:member-123',
        payload: multiImagePayload,
        imageUrns: ['urn:li:image:first-image', 'urn:li:image:second-image'],
      }),
    ).resolves.toEqual({ postUrn: 'urn:li:share:202' });

    expect(recorded.calls).toHaveLength(1);
    expect(recorded.calls[0]?.init?.body).toBe(
      JSON.stringify({
        author: 'urn:li:person:member-123',
        commentary: 'Ship media safely',
        visibility: 'PUBLIC',
        distribution: common.distribution,
        lifecycleState: 'PUBLISHED',
        isReshareDisabled: false,
        content: {
          multiImage: {
            images: [
              { id: 'urn:li:image:first-image', altText: 'First image' },
              { id: 'urn:li:image:second-image', altText: 'Second image' },
            ],
          },
        },
      }),
    );
  });

  it('rejects an invalid image URN before POST', async () => {
    const recorded = recorder(
      new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:303' } }),
    );
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    await expect(
      adapter.createImagePost({
        accessToken: 'access-token-secret',
        author: 'urn:li:person:member-123',
        payload: imagePayload,
        imageUrn: 'not-an-image-urn',
      }),
    ).rejects.toThrow();
    expect(recorded.calls).toHaveLength(0);
  });

  it('rejects multi-image URN count mismatch before POST', async () => {
    const recorded = recorder(
      new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:404' } }),
    );
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    await expect(
      adapter.createMultiImagePost({
        accessToken: 'access-token-secret',
        author: 'urn:li:person:member-123',
        payload: multiImagePayload,
        imageUrns: ['urn:li:image:first-image'],
      }),
    ).rejects.toThrow();
    expect(recorded.calls).toHaveLength(0);
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  LinkedInImagesError,
  type LinkedInImageStatus,
  type LinkedInImagesClient,
} from '../src/publishing/linkedin-images.js';
import { verifyImageProcessing } from '../src/publishing/media-verification.js';

const accessToken = 'test-only-token';
const imageUrn = 'urn:li:image:test-image-123';

function statusClient(...statuses: LinkedInImageStatus[]): Pick<LinkedInImagesClient, 'getStatus'> {
  let index = 0;
  return {
    getStatus: vi.fn(async () => {
      const status = statuses[Math.min(index, statuses.length - 1)];
      index += 1;
      if (status === undefined) throw new Error('No image status configured');
      return status;
    }),
  };
}

function failingClient(
  kind: ConstructorParameters<typeof LinkedInImagesError>[0],
): Pick<LinkedInImagesClient, 'getStatus'> {
  return {
    getStatus: vi.fn(() => Promise.reject(new LinkedInImagesError(kind))),
  };
}

describe('bounded image processing verification', () => {
  it('returns verification_unavailable without provider access when reads are disabled', async () => {
    const client = statusClient('AVAILABLE');

    await expect(
      verifyImageProcessing({ readsEnabled: false, client, accessToken, imageUrn }),
    ).resolves.toBe('verification_unavailable');
    expect(client.getStatus).not.toHaveBeenCalled();
  });

  it('returns available immediately for AVAILABLE', async () => {
    const client = statusClient('AVAILABLE');

    await expect(
      verifyImageProcessing({ readsEnabled: true, client, accessToken, imageUrn }),
    ).resolves.toBe('available');
    expect(client.getStatus).toHaveBeenCalledTimes(1);
  });

  it('returns processing_failed immediately for PROCESSING_FAILED', async () => {
    const client = statusClient('PROCESSING_FAILED');

    await expect(
      verifyImageProcessing({ readsEnabled: true, client, accessToken, imageUrn }),
    ).resolves.toBe('processing_failed');
    expect(client.getStatus).toHaveBeenCalledTimes(1);
  });

  it('polls WAITING_UPLOAD and PROCESSING no faster than once per second until AVAILABLE', async () => {
    const client = statusClient('WAITING_UPLOAD', 'PROCESSING', 'AVAILABLE');
    const sleeps: number[] = [];

    await expect(
      verifyImageProcessing(
        { readsEnabled: true, client, accessToken, imageUrn },
        {
          now: () => 0,
          sleep: async (milliseconds) => {
            sleeps.push(milliseconds);
          },
        },
      ),
    ).resolves.toBe('available');
    expect(client.getStatus).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1_000, 1_000]);
  });

  it('returns pending after at most six processing attempts', async () => {
    const client = statusClient('PROCESSING');
    const sleeps: number[] = [];

    await expect(
      verifyImageProcessing(
        { readsEnabled: true, client, accessToken, imageUrn },
        {
          now: () => 0,
          sleep: async (milliseconds) => {
            sleeps.push(milliseconds);
          },
        },
      ),
    ).resolves.toBe('pending');
    expect(client.getStatus).toHaveBeenCalledTimes(6);
    expect(sleeps).toEqual([1_000, 1_000, 1_000, 1_000, 1_000]);
  });

  it('returns pending when the 10-second total verification budget is exhausted', async () => {
    const client = statusClient('PROCESSING');
    let currentTime = 0;
    const sleeps: number[] = [];

    await expect(
      verifyImageProcessing(
        { readsEnabled: true, client, accessToken, imageUrn },
        {
          now: () => currentTime,
          sleep: async (milliseconds) => {
            sleeps.push(milliseconds);
            currentTime += 10_000;
          },
        },
      ),
    ).resolves.toBe('pending');
    expect(client.getStatus).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([1_000]);
  });

  it(
    'maps legitimate 403 read restriction to verification_unavailable without fabricating status',
    async () => {
      const client = failingClient('permission_required');

      await expect(
        verifyImageProcessing({ readsEnabled: true, client, accessToken, imageUrn }),
      ).resolves.toBe('verification_unavailable');
      expect(client.getStatus).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['rate_limited', 'provider_failure', 'not_found', 'malformed_response'] as const)(
    'maps non-auth status-read failure %s to verification_unavailable without retrying',
    async (kind) => {
      const client = failingClient(kind);

      await expect(
        verifyImageProcessing({ readsEnabled: true, client, accessToken, imageUrn }),
      ).resolves.toBe('verification_unavailable');
      expect(client.getStatus).toHaveBeenCalledTimes(1);
    },
  );

  it('propagates 401 reauthentication_required so credential handling can invalidate auth', async () => {
    const client = failingClient('reauthentication_required');

    await expect(
      verifyImageProcessing({ readsEnabled: true, client, accessToken, imageUrn }),
    ).rejects.toMatchObject({ kind: 'reauthentication_required', retryable: false });
    expect(client.getStatus).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  LinkedInImagesError,
  type LinkedInImageStatus,
  type LinkedInImagesClient,
} from '../src/publishing/linkedin-images.js';
import { verifyImageProcessing } from '../src/publishing/media-verification.js';

type StatusClient = Pick<LinkedInImagesClient, 'getStatus'>;

const accessToken = 'test-only-token';
const imageUrn = 'urn:li:image:test-image-123';

function statusClient(...statuses: LinkedInImageStatus[]): StatusClient {
  let index = 0;
  return {
    getStatus: vi.fn(() => {
      const status = statuses[Math.min(index, statuses.length - 1)];
      index += 1;
      if (status === undefined) return Promise.reject(new Error('No image status configured'));
      return Promise.resolve(status);
    }),
  };
}

function failingClient(kind: ConstructorParameters<typeof LinkedInImagesError>[0]): StatusClient {
  return {
    getStatus: vi.fn(() => Promise.reject(new LinkedInImagesError(kind))),
  };
}

function input(client: StatusClient, readsEnabled = true) {
  return { readsEnabled, client, accessToken, imageUrn };
}

describe('bounded image processing verification', () => {
  it('skips provider reads when verification is disabled', async () => {
    const client = statusClient('AVAILABLE');

    await expect(verifyImageProcessing(input(client, false))).resolves.toBe('verification_unavailable');
    expect(client.getStatus).not.toHaveBeenCalled();
  });

  it('returns available immediately for AVAILABLE', async () => {
    const client = statusClient('AVAILABLE');

    await expect(verifyImageProcessing(input(client))).resolves.toBe('available');
    expect(client.getStatus).toHaveBeenCalledTimes(1);
  });

  it('returns processing_failed immediately', async () => {
    const client = statusClient('PROCESSING_FAILED');

    await expect(verifyImageProcessing(input(client))).resolves.toBe('processing_failed');
    expect(client.getStatus).toHaveBeenCalledTimes(1);
  });

  it('waits at least one second between pending statuses', async () => {
    const client = statusClient('WAITING_UPLOAD', 'PROCESSING', 'AVAILABLE');
    const sleeps: number[] = [];

    await expect(
      verifyImageProcessing(input(client), {
        now: () => 0,
        sleep: (milliseconds) => {
          sleeps.push(milliseconds);
          return Promise.resolve();
        },
      }),
    ).resolves.toBe('available');
    expect(client.getStatus).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1_000, 1_000]);
  });

  it('returns pending after six attempts', async () => {
    const client = statusClient('PROCESSING');
    const sleeps: number[] = [];

    await expect(
      verifyImageProcessing(input(client), {
        now: () => 0,
        sleep: (milliseconds) => {
          sleeps.push(milliseconds);
          return Promise.resolve();
        },
      }),
    ).resolves.toBe('pending');
    expect(client.getStatus).toHaveBeenCalledTimes(6);
    expect(sleeps).toEqual([1_000, 1_000, 1_000, 1_000, 1_000]);
  });

  it('returns pending when the 10-second budget expires', async () => {
    const client = statusClient('PROCESSING');
    let currentTime = 0;
    const sleeps: number[] = [];

    await expect(
      verifyImageProcessing(input(client), {
        now: () => currentTime,
        sleep: (milliseconds) => {
          sleeps.push(milliseconds);
          currentTime += 10_000;
          return Promise.resolve();
        },
      }),
    ).resolves.toBe('pending');
    expect(client.getStatus).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([1_000]);
  });

  it('maps a legitimate 403 read restriction to verification_unavailable', async () => {
    const client = failingClient('permission_required');

    await expect(verifyImageProcessing(input(client))).resolves.toBe('verification_unavailable');
    expect(client.getStatus).toHaveBeenCalledTimes(1);
  });

  it.each(['rate_limited', 'provider_failure', 'not_found', 'malformed_response'] as const)(
    'maps non-auth status failure %s to verification_unavailable',
    async (kind) => {
      const client = failingClient(kind);

      await expect(verifyImageProcessing(input(client))).resolves.toBe('verification_unavailable');
      expect(client.getStatus).toHaveBeenCalledTimes(1);
    },
  );

  it('propagates reauthentication_required', async () => {
    const client = failingClient('reauthentication_required');

    await expect(verifyImageProcessing(input(client))).rejects.toMatchObject({
      kind: 'reauthentication_required',
      retryable: false,
    });
    expect(client.getStatus).toHaveBeenCalledTimes(1);
  });

  it('cancels a stalled status read and returns pending within ten seconds', async () => {
    vi.useFakeTimers();
    try {
      const signals: AbortSignal[] = [];
      const client: StatusClient = {
        getStatus: vi.fn((request) => {
          const signal = (request as { signal?: AbortSignal }).signal;
          if (signal) signals.push(signal);
          return new Promise<LinkedInImageStatus>(() => {
            // A provider read that never settles on its own.
          });
        }),
      };

      const verification = verifyImageProcessing(input(client));
      const watchdog = new Promise<string>((resolve) => {
        setTimeout(() => resolve('watchdog'), 10_001);
      });

      const result = Promise.race([verification, watchdog]);
      await vi.advanceTimersByTimeAsync(10_001);
      await expect(result).resolves.toBe('pending');
      expect(signals).toHaveLength(1);
      expect(signals[0]?.aborted).toBe(true);
      expect(client.getStatus).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

});

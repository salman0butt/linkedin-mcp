import { LinkedInImagesError, type LinkedInImagesClient } from './linkedin-images.js';

const MAX_ATTEMPTS = 6;
const MAX_DURATION_MS = 10_000;
const POLL_INTERVAL_MS = 1_000;
const STATUS_READ_TIMEOUT = Symbol('status_read_timeout');

type AbortableStatusRequest = Parameters<LinkedInImagesClient['getStatus']>[0] & {
  signal?: AbortSignal;
};

export type ImageProcessingVerification =
  | 'available'
  | 'processing_failed'
  | 'pending'
  | 'verification_unavailable';

export interface VerifyImageProcessingInput {
  readsEnabled: boolean;
  client: Pick<LinkedInImagesClient, 'getStatus'>;
  accessToken: string;
  imageUrn: string;
}

interface VerifyImageProcessingDeps {
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function verifyImageProcessing(
  input: VerifyImageProcessingInput,
  deps: VerifyImageProcessingDeps = {},
): Promise<ImageProcessingVerification> {
  if (!input.readsEnabled) return 'verification_unavailable';

  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const startedAt = now();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0 && now() - startedAt >= MAX_DURATION_MS) return 'pending';

    const remainingMs = MAX_DURATION_MS - (now() - startedAt);
    if (remainingMs <= 0) return 'pending';

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof STATUS_READ_TIMEOUT>((resolve) => {
      timeoutId = setTimeout(() => {
        resolve(STATUS_READ_TIMEOUT);
        controller.abort();
      }, remainingMs);
    });

    let status;
    try {
      const request: AbortableStatusRequest = {
        accessToken: input.accessToken,
        imageUrn: input.imageUrn,
        signal: controller.signal,
      };
      const result = await Promise.race([input.client.getStatus(request), timeout]);
      if (result === STATUS_READ_TIMEOUT) return 'pending';
      status = result;
    } catch (error: unknown) {
      if (error instanceof LinkedInImagesError && error.kind === 'reauthentication_required') {
        throw error;
      }
      return 'verification_unavailable';
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }

    if (status === 'AVAILABLE') return 'available';
    if (status === 'PROCESSING_FAILED') return 'processing_failed';
    if (attempt === MAX_ATTEMPTS - 1 || now() - startedAt >= MAX_DURATION_MS) return 'pending';

    await sleep(POLL_INTERVAL_MS);
    if (now() - startedAt >= MAX_DURATION_MS) return 'pending';
  }

  return 'pending';
}

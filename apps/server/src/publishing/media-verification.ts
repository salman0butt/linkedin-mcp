import { LinkedInImagesError, type LinkedInImagesClient } from './linkedin-images.js';

const MAX_ATTEMPTS = 6;
const MAX_DURATION_MS = 10_000;
const POLL_INTERVAL_MS = 1_000;

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

    let status;
    try {
      status = await input.client.getStatus({
        accessToken: input.accessToken,
        imageUrn: input.imageUrn,
      });
    } catch (error: unknown) {
      if (error instanceof LinkedInImagesError && error.kind === 'reauthentication_required') {
        throw error;
      }
      return 'verification_unavailable';
    }

    if (status === 'AVAILABLE') return 'available';
    if (status === 'PROCESSING_FAILED') return 'processing_failed';
    if (attempt === MAX_ATTEMPTS - 1 || now() - startedAt >= MAX_DURATION_MS) return 'pending';

    await sleep(POLL_INTERVAL_MS);
    if (now() - startedAt >= MAX_DURATION_MS) return 'pending';
  }

  return 'pending';
}

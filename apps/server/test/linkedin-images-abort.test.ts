import { describe, expect, it } from 'vitest';

import { createLinkedInImagesClient } from '../src/publishing/linkedin-images.js';

const config = { apiVersion: '202610' };
const validImageUrn = 'urn:li:image:C4E10AQHqQ1';

describe('LinkedIn Images status cancellation', () => {
  it('forwards the status abort signal to provider fetch', async () => {
    let observedSignal: AbortSignal | null | undefined;
    const fetchImpl: typeof fetch = (_input, init) => {
      observedSignal = init?.signal;
      return Promise.resolve(Response.json({ status: 'AVAILABLE' }));
    };
    const client = createLinkedInImagesClient(config, { fetch: fetchImpl });
    const controller = new AbortController();
    const request = {
      accessToken: 'access-token-secret',
      imageUrn: validImageUrn,
      signal: controller.signal,
    } as Parameters<typeof client.getStatus>[0] & { signal: AbortSignal };

    await expect(client.getStatus(request)).resolves.toBe('AVAILABLE');
    expect(observedSignal).toBe(controller.signal);
  });
});

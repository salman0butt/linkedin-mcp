import { describe, expect, it } from 'vitest';

import { createLinkedInImagesClient } from '../src/publishing/linkedin-images.js';

const config = { apiVersion: '202610' };
const validImageUrn = 'urn:li:image:C4E10AQHqQ1';
const validUploadUrl = 'https://www.linkedin.com/dms-uploads/C4E10AQ/upload?ca=vector';
const oversizedPadding = 'x'.repeat(70_000);

function singleResponseFetch(response: Response): typeof fetch {
  return () => Promise.resolve(response);
}

describe('LinkedIn Images provider response bounds', () => {
  it('fails closed when initialize success JSON exceeds the local response bound', async () => {
    const client = createLinkedInImagesClient(config, {
      fetch: singleResponseFetch(
        Response.json({
          value: {
            uploadUrl: validUploadUrl,
            image: validImageUrn,
            uploadUrlExpiresAt: 1_800_000_000_000,
            padding: oversizedPadding,
          },
        }),
      ),
    });

    await expect(
      client.initializeUpload({
        accessToken: 'access-token-secret',
        ownerUrn: 'urn:li:person:member-123',
      }),
    ).rejects.toMatchObject({ kind: 'malformed_success', retryable: false });
  });

  it('fails closed when status success JSON exceeds the local response bound', async () => {
    const client = createLinkedInImagesClient(config, {
      fetch: singleResponseFetch(
        Response.json({
          status: 'AVAILABLE',
          padding: oversizedPadding,
        }),
      ),
    });

    await expect(
      client.getStatus({
        accessToken: 'access-token-secret',
        imageUrn: validImageUrn,
      }),
    ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
  });
});

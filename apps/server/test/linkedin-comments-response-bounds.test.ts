import { describe, expect, it } from 'vitest';

import { createLinkedInCommentsClient } from '../src/engagement/linkedin-comments.js';

const shareUrn = 'urn:li:share:6305471423242596352';
const config = { apiVersion: '202610' };

function fetchReturning(response: Response): typeof fetch {
  return () => Promise.resolve(response);
}

describe('LinkedIn Comments response bounds', () => {
  it('fails closed when a successful provider body exceeds the local JSON bound', async () => {
    const oversized = JSON.stringify({
      elements: [],
      paging: { start: 0, count: 10, total: 0 },
      padding: 'x'.repeat(70 * 1024),
    });
    const client = createLinkedInCommentsClient(config, {
      fetch: fetchReturning(new Response(oversized, { status: 200 })),
    });

    await expect(
      client.listComments({ accessToken: 'access-token-secret', targetUrn: shareUrn }),
    ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
  });

  it('fails closed when the provider success stream becomes unreadable', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"elements":['));
        controller.error(new Error('private provider stream detail'));
      },
    });
    const client = createLinkedInCommentsClient(config, {
      fetch: fetchReturning(new Response(stream, { status: 200 })),
    });

    await expect(
      client.listComments({ accessToken: 'access-token-secret', targetUrn: shareUrn }),
    ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
  });
});

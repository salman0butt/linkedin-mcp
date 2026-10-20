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
      padding: 'x'.repeat(270 * 1024),
    });
    const client = createLinkedInCommentsClient(config, {
      fetch: fetchReturning(new Response(oversized, { status: 200 })),
    });

    await expect(
      client.listComments({ accessToken: 'access-token-secret', targetUrn: shareUrn }),
    ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
  });

  it('accepts a valid bounded page of 100 substantive comment messages', async () => {
    const elements = Array.from({ length: 100 }, (_, index) => ({
      id: String(1000 + index),
      commentUrn: `urn:li:comment:(${shareUrn},${1000 + index})`,
      actor: 'urn:li:person:customer-456',
      object: shareUrn,
      message: { text: 'A'.repeat(600) },
      created: { actor: 'urn:li:person:customer-456', time: 1_582_160_678_569 },
      lastModified: { actor: 'urn:li:person:customer-456', time: 1_582_160_679_569 },
      likesSummary: { totalLikes: 0 },
    }));
    const body = JSON.stringify({ elements, paging: { start: 0, count: 100, total: 100 } });
    expect(new TextEncoder().encode(body).length).toBeGreaterThan(64 * 1024);

    const client = createLinkedInCommentsClient(config, {
      fetch: fetchReturning(new Response(body, { status: 200 })),
    });
    await expect(
      client.listComments({ accessToken: 'access-token-secret', targetUrn: shareUrn, count: 100 }),
    ).resolves.toMatchObject({ elements: expect.arrayContaining([expect.objectContaining({ id: '1000' })]) });
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

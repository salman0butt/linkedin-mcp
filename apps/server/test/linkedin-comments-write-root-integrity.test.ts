import { describe, expect, it } from 'vitest';

import { createLinkedInCommentsClient } from '../src/engagement/linkedin-comments.js';

const parent = 'urn:li:comment:(urn:li:activity:111,222)';

describe('reply adapter root integrity', () => {
  it('rejects unrelated same-family roots before provider mutation', async () => {
    const calls: unknown[] = [];
    const client = createLinkedInCommentsClient(
      { apiVersion: '202610' },
      {
        fetch: (...args: unknown[]) => {
          calls.push(args);
          return Promise.reject(new Error('must not fetch'));
        },
      },
    );

    await expect(
      client.createReply({
        accessToken: 'token',
        targetUrn: parent,
        actorUrn: 'urn:li:person:member-123',
        objectUrn: 'urn:li:activity:999',
        parentCommentUrn: parent,
        text: 'A reply',
      }),
    ).rejects.toThrow(/root.*parent|parent.*root/i);
    expect(calls).toHaveLength(0);
  });
});

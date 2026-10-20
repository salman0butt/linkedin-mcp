import { describe, expect, it } from 'vitest';

import { createLinkedInCommentsClient } from '../src/engagement/linkedin-comments.js';

const objectUrn = 'urn:li:activity:6631349431612559360';
const id = '6636062862760562688';
const commentUrn = `urn:li:comment:(${objectUrn},${id})`;
const body = {
  id,
  commentUrn,
  actor: 'urn:li:person:f49f2kf0',
  object: objectUrn,
  message: { text: 'Comment' },
  created: { actor: 'urn:li:person:f49f2kf0', time: 1582160678569 },
  lastModified: { actor: 'urn:li:person:f49f2kf0', time: 1582160679569 },
  likesSummary: { totalLikes: 0 },
};

function clientFor(value: unknown) {
  return createLinkedInCommentsClient({ apiVersion: '202610' }, { fetch: () => Promise.resolve(Response.json(value)) });
}

describe('Comments read identity integrity', () => {
  it('rejects a self-consistent provider comment for a different requested ID', async () => {
    await expect(
      clientFor(body).getComment({
        accessToken: 'token',
        targetUrn: objectUrn,
        commentId: '6636062862760562689',
      }),
    ).rejects.toMatchObject({ kind: 'malformed_response' });
  });

  it('rejects a composite comment URN with a different numeric ID', async () => {
    const mismatched = {
      ...body,
      commentUrn: `urn:li:comment:(${objectUrn},6636062862760562689)`,
    };
    await expect(
      clientFor(mismatched).getComment({
        accessToken: 'token',
        targetUrn: objectUrn,
        commentId: id,
      }),
    ).rejects.toMatchObject({ kind: 'malformed_response' });
  });

  it('rejects a paginated comment containing inconsistent numeric identity', async () => {
    const malformed = {
      ...body,
      commentUrn: `urn:li:comment:(${objectUrn},6636062862760562689)`,
    };
    await expect(
      clientFor({
        elements: [malformed],
        paging: { start: 0, count: 10, total: 1 },
      }).listComments({ accessToken: 'token', targetUrn: objectUrn }),
    ).rejects.toMatchObject({ kind: 'malformed_response' });
  });
});

import { describe, expect, it } from 'vitest';

import { LinkedInCommentsError, createLinkedInCommentsClient } from '../src/engagement/linkedin-comments.js';

interface RecordedCall {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
}

interface RecordedFetch {
  calls: RecordedCall[];
  fetch: typeof fetch;
}

function recorder(...responses: Response[]): RecordedFetch {
  const calls: RecordedCall[] = [];
  return {
    calls,
    fetch: (input, init) => {
      calls.push({ input, init });
      const response = responses.shift();
      if (!response) return Promise.reject(new Error('No queued response'));
      return Promise.resolve(response);
    },
  };
}

function throwingRecorder(): RecordedFetch {
  const calls: RecordedCall[] = [];
  return {
    calls,
    fetch: (input, init) => {
      calls.push({ input, init });
      return Promise.reject(new Error('private transport detail access-token-secret'));
    },
  };
}

function unreadableErrorResponse(status: number) {
  let bodyRead = false;
  const response = new Response('private provider body access-token-secret', { status });
  const originalText = response.text.bind(response);
  response.text = () => {
    bodyRead = true;
    return originalText();
  };
  response.json = () => {
    bodyRead = true;
    return Promise.reject(new Error('must not parse'));
  };
  return { response, wasRead: () => bodyRead };
}

const config = { apiVersion: '202610' };
const shareUrn = 'urn:li:share:6305471423242596352';
const commentUrn = 'urn:li:comment:(urn:li:activity:6631349431612559360,6636062862760562688)';
const commentBody = {
  actor: 'urn:li:person:f49f2kf0',
  commentUrn,
  created: { actor: 'urn:li:person:f49f2kf0', time: 1_582_160_678_569 },
  id: '6636062862760562688',
  lastModified: { actor: 'urn:li:person:f49f2kf0', time: 1_582_160_679_569 },
  likesSummary: { totalLikes: 1 },
  parentComment: 'urn:li:comment:(urn:li:activity:6631349431612559360,6850752781414875136)',
  message: { text: 'Comment with context' },
  object: 'urn:li:activity:6631349431612559360',
};

const expectedComment = {
  id: '6636062862760562688',
  commentUrn,
  actorUrn: 'urn:li:person:f49f2kf0',
  objectUrn: 'urn:li:activity:6631349431612559360',
  parentCommentUrn: 'urn:li:comment:(urn:li:activity:6631349431612559360,6850752781414875136)',
  text: 'Comment with context',
  createdAt: '2020-02-20T01:04:38.569Z',
  lastModifiedAt: '2020-02-20T01:04:39.569Z',
  totalLikes: 1,
};

describe('official LinkedIn Comments read client', () => {
  it('gets one explicit comment with the versioned official request contract', async () => {
    const recorded = recorder(Response.json(commentBody));
    const client = createLinkedInCommentsClient(config, { fetch: recorded.fetch });

    await expect(
      client.getComment({
        accessToken: 'access-token-secret',
        targetUrn: shareUrn,
        commentId: '6636062862760562688',
      }),
    ).resolves.toEqual(expectedComment);

    expect(recorded.calls).toEqual([
      {
        input: `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(shareUrn)}/comments/6636062862760562688`,
        init: {
          method: 'GET',
          headers: {
            authorization: 'Bearer access-token-secret',
            'linkedin-version': '202610',
            'x-restli-protocol-version': '2.0.0',
          },
        },
      },
    ]);
  });

  it('lists an explicit nested comment thread with bounded paging', async () => {
    const nestedTarget = commentBody.parentComment;
    const recorded = recorder(
      Response.json({
        elements: [commentBody],
        paging: { start: 5, count: 2, total: 8, links: [] },
      }),
    );
    const client = createLinkedInCommentsClient(config, { fetch: recorded.fetch });

    await expect(
      client.listComments({
        accessToken: 'access-token-secret',
        targetUrn: nestedTarget,
        start: 5,
        count: 2,
      }),
    ).resolves.toEqual({
      elements: [expectedComment],
      paging: { start: 5, count: 2, total: 8, nextStart: 7 },
      provider: 'OFFICIAL_API',
    });

    expect(recorded.calls[0]?.input).toBe(
      `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(nestedTarget)}/comments?start=5&count=2`,
    );
    expect(recorded.calls[0]?.init).toEqual({
      method: 'GET',
      headers: {
        authorization: 'Bearer access-token-secret',
        'linkedin-version': '202610',
        'x-restli-protocol-version': '2.0.0',
      },
    });
  });

  it('uses conservative default paging and never constructs batch-get requests', async () => {
    const recorded = recorder(Response.json({ elements: [], paging: { start: 0, count: 10, total: 0 } }));
    const client = createLinkedInCommentsClient(config, { fetch: recorded.fetch });

    await client.listComments({ accessToken: 'access-token-secret', targetUrn: shareUrn });

    const requestInput = recorded.calls[0]?.input;
    expect(requestInput).toBeTypeOf('string');
    if (typeof requestInput !== 'string') throw new Error('Expected Comments request URL string');
    expect(requestInput).toContain('?start=0&count=10');
    expect(requestInput).not.toContain('ids=List');
    expect(requestInput).not.toContain('BATCH_GET');
  });

  it('classifies read HTTP failures without reading provider error bodies', async () => {
    const cases = [
      [401, 'reauthentication_required'],
      [403, 'permission_required'],
      [404, 'not_found'],
      [429, 'rate_limited'],
      [500, 'provider_failure'],
    ] as const;

    for (const [status, kind] of cases) {
      const errorResponse = unreadableErrorResponse(status);
      const recorded = recorder(errorResponse.response);
      const client = createLinkedInCommentsClient(config, { fetch: recorded.fetch });
      let caught: unknown;
      try {
        await client.getComment({
          accessToken: 'access-token-secret',
          targetUrn: shareUrn,
          commentId: '6636062862760562688',
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(LinkedInCommentsError);
      expect(caught).toMatchObject({ kind, retryable: false });
      expect((caught as Error).message).not.toContain('access-token-secret');
      expect((caught as Error).message).not.toContain('private provider body');
      expect(errorResponse.wasRead()).toBe(false);
    }
  });

  it('classifies transport failure without leaking the transport error', async () => {
    const recorded = throwingRecorder();
    const client = createLinkedInCommentsClient(config, { fetch: recorded.fetch });

    await expect(
      client.listComments({ accessToken: 'access-token-secret', targetUrn: shareUrn }),
    ).rejects.toMatchObject({ kind: 'provider_failure', retryable: false });
  });

  it('rejects malformed comment records instead of returning partial data', async () => {
    const invalidBodies = [
      { ...commentBody, actor: 'person:invalid' },
      { ...commentBody, commentUrn: 'urn:li:comment:invalid' },
      { ...commentBody, id: 'not-numeric' },
      { ...commentBody, created: { time: -1 } },
      { ...commentBody, lastModified: { time: Number.NaN } },
      { ...commentBody, message: {} },
      { ...commentBody, object: 'urn:li:person:not-a-thread' },
      { ...commentBody, likesSummary: { totalLikes: -1 } },
      { ...commentBody, likesSummary: undefined },
    ];

    for (const body of invalidBodies) {
      const recorded = recorder(Response.json(body));
      const client = createLinkedInCommentsClient(config, { fetch: recorded.fetch });
      await expect(
        client.getComment({
          accessToken: 'access-token-secret',
          targetUrn: shareUrn,
          commentId: '6636062862760562688',
        }),
      ).rejects.toMatchObject({ kind: 'malformed_response' });
    }
  });

  it('rejects malformed list envelopes and paging', async () => {
    const invalidBodies = [
      {},
      { elements: {}, paging: { start: 0, count: 10 } },
      { elements: [], paging: null },
      { elements: [], paging: { start: -1, count: 10 } },
      { elements: [], paging: { start: 0, count: 0 } },
      { elements: [], paging: { start: 0, count: 10, total: -1 } },
    ];

    for (const body of invalidBodies) {
      const recorded = recorder(Response.json(body));
      const client = createLinkedInCommentsClient(config, { fetch: recorded.fetch });
      await expect(
        client.listComments({ accessToken: 'access-token-secret', targetUrn: shareUrn }),
      ).rejects.toMatchObject({ kind: 'malformed_response' });
    }
  });

  it('rejects invalid input before fetch', async () => {
    const recorded = recorder(Response.json(commentBody));
    const client = createLinkedInCommentsClient(config, { fetch: recorded.fetch });

    await expect(client.getComment({ accessToken: '', targetUrn: shareUrn, commentId: '1' })).rejects.toThrow(
      /access token/i,
    );
    await expect(
      client.getComment({ accessToken: 'token', targetUrn: 'urn:li:person:bad', commentId: '1' }),
    ).rejects.toThrow(/comment target/i);
    await expect(
      client.getComment({ accessToken: 'token', targetUrn: shareUrn, commentId: 'not-numeric' }),
    ).rejects.toThrow(/comment id/i);
    await expect(
      client.listComments({ accessToken: 'token', targetUrn: shareUrn, start: -1 }),
    ).rejects.toThrow(/start/i);
    await expect(
      client.listComments({ accessToken: 'token', targetUrn: shareUrn, count: 101 }),
    ).rejects.toThrow(/count/i);
    expect(recorded.calls).toHaveLength(0);
  });

  it('rejects invalid API version at construction', () => {
    expect(() => createLinkedInCommentsClient({ apiVersion: '2026-10' })).toThrow(/api version.*yyyymm/i);
  });
});

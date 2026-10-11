import { describe, expect, it } from 'vitest';

import { LinkedInCommentsError, createLinkedInCommentsClient } from '../src/engagement/linkedin-comments.js';

interface RecordedCall {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
}

function recorder(...responses: Response[]) {
  const calls: RecordedCall[] = [];
  return {
    calls,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const response = responses.shift();
      if (!response) return Promise.reject(new Error('No queued response'));
      return Promise.resolve(response);
    }) as typeof fetch,
  };
}

function throwingRecorder() {
  const calls: RecordedCall[] = [];
  return {
    calls,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return Promise.reject(new Error('private transport detail access-token-secret'));
    }) as typeof fetch,
  };
}

function unreadableResponse(status: number) {
  let bodyRead = false;
  const response = new Response('private provider detail access-token-secret', { status });
  response.text = () => {
    bodyRead = true;
    return Promise.resolve('must not read');
  };
  response.json = () => {
    bodyRead = true;
    return Promise.reject(new Error('must not parse'));
  };
  return { response, wasRead: () => bodyRead };
}

const targetUrn = 'urn:li:comment:(urn:li:activity:6305471423192264704,6308007194273021952)';
const rootUrn = 'urn:li:share:6305471423242596352';
const commentId = '6636062862760562688';
const commentUrn = `urn:li:comment:(urn:li:activity:6305471423192264704,${commentId})`;
const text = 'Thanks for the thoughtful question.';
const actorUrn = 'urn:li:person:member-123';

function successfulReplyBody() {
  return {
    actor: actorUrn,
    commentUrn,
    created: { actor: actorUrn, time: 1_760_000_000_000 },
    id: commentId,
    lastModified: { actor: actorUrn, time: 1_760_000_000_000 },
    likesSummary: { totalLikes: 0 },
    parentComment: targetUrn,
    message: { text },
    object: rootUrn,
  };
}

describe('official LinkedIn Comments reply adapter', () => {
  it('creates exactly one nested member reply with the documented POST contract', async () => {
    const recorded = recorder(
      Response.json(successfulReplyBody(), {
        status: 201,
        headers: { 'x-restli-id': commentId },
      }),
    );
    const client = createLinkedInCommentsClient({ apiVersion: '202610' }, { fetch: recorded.fetch });

    await expect(
      client.createReply({
        accessToken: 'access-token-secret',
        targetUrn,
        actorUrn,
        objectUrn: rootUrn,
        parentCommentUrn: targetUrn,
        text,
      }),
    ).resolves.toMatchObject({
      id: commentId,
      commentUrn,
      actorUrn,
      objectUrn: rootUrn,
      parentCommentUrn: targetUrn,
      text,
    });

    expect(recorded.calls).toEqual([
      {
        input: `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(targetUrn)}/comments`,
        init: {
          method: 'POST',
          headers: {
            authorization: 'Bearer access-token-secret',
            'content-type': 'application/json',
            'linkedin-version': '202610',
            'x-restli-protocol-version': '2.0.0',
          },
          body: JSON.stringify({
            actor: actorUrn,
            object: rootUrn,
            message: { text },
            parentComment: targetUrn,
          }),
        },
      },
    ]);
  });

  it.each([
    [401, 'reauthentication_required'],
    [403, 'permission_required'],
    [429, 'rate_limited'],
    [500, 'outcome_unknown'],
  ] as const)('classifies POST HTTP %i without reading its private body', async (status, kind) => {
    const errorResponse = unreadableResponse(status);
    const recorded = recorder(errorResponse.response);
    const client = createLinkedInCommentsClient({ apiVersion: '202610' }, { fetch: recorded.fetch });

    await expect(
      client.createReply({
        accessToken: 'access-token-secret',
        targetUrn,
        actorUrn,
        objectUrn: rootUrn,
        parentCommentUrn: targetUrn,
        text,
      }),
    ).rejects.toMatchObject({ kind, retryable: false });
    expect(errorResponse.wasRead()).toBe(false);
    expect(recorded.calls).toHaveLength(1);
  });

  it('treats POST transport uncertainty as outcome_unknown and never retries', async () => {
    const recorded = throwingRecorder();
    const client = createLinkedInCommentsClient({ apiVersion: '202610' }, { fetch: recorded.fetch });

    await expect(
      client.createReply({
        accessToken: 'access-token-secret',
        targetUrn,
        actorUrn,
        objectUrn: rootUrn,
        parentCommentUrn: targetUrn,
        text,
      }),
    ).rejects.toMatchObject({ kind: 'outcome_unknown', retryable: false });
    expect(recorded.calls).toHaveLength(1);
  });

  it.each([
    new Response(null, { status: 201 }),
    Response.json(successfulReplyBody(), {
      status: 201,
      headers: { 'x-restli-id': '9999999999999999999' },
    }),
    Response.json(
      { ...successfulReplyBody(), actor: 'urn:li:person:other-member' },
      {
        status: 201,
        headers: { 'x-restli-id': commentId },
      },
    ),
    Response.json(
      { ...successfulReplyBody(), object: 'urn:li:share:999' },
      {
        status: 201,
        headers: { 'x-restli-id': commentId },
      },
    ),
    Response.json(
      { ...successfulReplyBody(), parentComment: undefined },
      {
        status: 201,
        headers: { 'x-restli-id': commentId },
      },
    ),
  ])('rejects malformed or mismatched successful reply responses', async (response) => {
    const recorded = recorder(response);
    const client = createLinkedInCommentsClient({ apiVersion: '202610' }, { fetch: recorded.fetch });

    await expect(
      client.createReply({
        accessToken: 'access-token-secret',
        targetUrn,
        actorUrn,
        objectUrn: rootUrn,
        parentCommentUrn: targetUrn,
        text,
      }),
    ).rejects.toMatchObject({ kind: 'malformed_success', retryable: false });
    expect(recorded.calls).toHaveLength(1);
  });

  it('rejects caller-supplied organization actors and malformed nested targets before fetch', async () => {
    const recorded = recorder(
      Response.json(successfulReplyBody(), {
        status: 201,
        headers: { 'x-restli-id': commentId },
      }),
    );
    const client = createLinkedInCommentsClient({ apiVersion: '202610' }, { fetch: recorded.fetch });

    await expect(
      client.createReply({
        accessToken: 'access-token-secret',
        targetUrn,
        actorUrn: 'urn:li:organization:123',
        objectUrn: rootUrn,
        parentCommentUrn: targetUrn,
        text,
      }),
    ).rejects.toThrow(/actor/i);
    await expect(
      client.createReply({
        accessToken: 'access-token-secret',
        targetUrn: 'urn:li:comment:invalid',
        actorUrn,
        objectUrn: rootUrn,
        parentCommentUrn: targetUrn,
        text,
      }),
    ).rejects.toThrow(/target/i);
    expect(recorded.calls).toHaveLength(0);
  });

  it('keeps provider errors sanitized', () => {
    const error = new LinkedInCommentsError('outcome_unknown');
    expect(error.message).not.toContain('access-token-secret');
  });
});

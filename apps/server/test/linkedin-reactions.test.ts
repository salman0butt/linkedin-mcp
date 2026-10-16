import { describe, expect, it } from 'vitest';

import {
  LinkedInReactionsError,
  createLinkedInReactionsClient,
} from '../src/engagement/linkedin-reactions.js';

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

const actorUrn = 'urn:li:person:member-123';
const targetUrn = 'urn:li:activity:7067167295080394752';
const commentUrn = 'urn:li:comment:(urn:li:activity:7067167295080394752,7067167295080394753)';
const reactionUrn = `urn:li:reaction:(${actorUrn},${targetUrn})`;

function successfulReactionBody(overrides: Record<string, unknown> = {}) {
  return {
    id: reactionUrn,
    reactionType: 'LIKE',
    created: { actor: actorUrn, time: 1_760_000_000_000 },
    root: targetUrn,
    lastModified: { actor: actorUrn, time: 1_760_000_000_000 },
    ...overrides,
  };
}

describe('official LinkedIn Reactions adapter', () => {
  it('creates exactly one member reaction with the documented POST contract', async () => {
    const recorded = recorder(Response.json(successfulReactionBody(), { status: 201 }));
    const client = createLinkedInReactionsClient({ apiVersion: '202610' }, { fetch: recorded.fetch });

    await expect(
      client.addReaction({
        accessToken: 'access-token-secret',
        actorUrn,
        targetUrn,
        reactionType: 'LIKE',
      }),
    ).resolves.toEqual({
      id: reactionUrn,
      actorUrn,
      rootUrn: targetUrn,
      reactionType: 'LIKE',
      createdAt: '2025-10-09T08:53:20.000Z',
      lastModifiedAt: '2025-10-09T08:53:20.000Z',
    });

    expect(recorded.calls).toEqual([
      {
        input: `https://api.linkedin.com/rest/reactions?actor=${encodeURIComponent(actorUrn)}`,
        init: {
          method: 'POST',
          headers: {
            authorization: 'Bearer access-token-secret',
            'content-type': 'application/json',
            'linkedin-version': '202610',
            'x-restli-protocol-version': '2.0.0',
          },
          body: JSON.stringify({ root: targetUrn, reactionType: 'LIKE' }),
        },
      },
    ]);
  });

  it('removes exactly one member reaction using the actor/entity compound key', async () => {
    const recorded = recorder(new Response(null, { status: 204 }));
    const client = createLinkedInReactionsClient({ apiVersion: '202610' }, { fetch: recorded.fetch });

    await expect(
      client.removeReaction({
        accessToken: 'access-token-secret',
        actorUrn,
        targetUrn: commentUrn,
      }),
    ).resolves.toBeUndefined();

    expect(recorded.calls).toEqual([
      {
        input: `https://api.linkedin.com/rest/reactions/(actor:${encodeURIComponent(actorUrn)},entity:${encodeURIComponent(commentUrn)})`,
        init: {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer access-token-secret',
            'linkedin-version': '202610',
            'x-restli-protocol-version': '2.0.0',
          },
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
    const client = createLinkedInReactionsClient({ apiVersion: '202610' }, { fetch: recorded.fetch });

    await expect(
      client.addReaction({
        accessToken: 'access-token-secret',
        actorUrn,
        targetUrn,
        reactionType: 'LIKE',
      }),
    ).rejects.toMatchObject({ kind, retryable: false });
    expect(errorResponse.wasRead()).toBe(false);
    expect(recorded.calls).toHaveLength(1);
  });

  it.each([
    [401, 'reauthentication_required'],
    [403, 'permission_required'],
    [429, 'rate_limited'],
    [200, 'outcome_unknown'],
    [500, 'outcome_unknown'],
  ] as const)('classifies DELETE HTTP %i without reading its private body', async (status, kind) => {
    const errorResponse = unreadableResponse(status);
    const recorded = recorder(errorResponse.response);
    const client = createLinkedInReactionsClient({ apiVersion: '202610' }, { fetch: recorded.fetch });

    await expect(
      client.removeReaction({ accessToken: 'access-token-secret', actorUrn, targetUrn }),
    ).rejects.toMatchObject({ kind, retryable: false });
    expect(errorResponse.wasRead()).toBe(false);
    expect(recorded.calls).toHaveLength(1);
  });

  it('treats POST transport uncertainty as outcome_unknown and never retries', async () => {
    const recorded = throwingRecorder();
    const client = createLinkedInReactionsClient({ apiVersion: '202610' }, { fetch: recorded.fetch });

    await expect(
      client.addReaction({
        accessToken: 'access-token-secret',
        actorUrn,
        targetUrn,
        reactionType: 'LIKE',
      }),
    ).rejects.toMatchObject({ kind: 'outcome_unknown', retryable: false });
    expect(recorded.calls).toHaveLength(1);
  });

  it('treats DELETE transport uncertainty as outcome_unknown and never retries', async () => {
    const recorded = throwingRecorder();
    const client = createLinkedInReactionsClient({ apiVersion: '202610' }, { fetch: recorded.fetch });

    await expect(
      client.removeReaction({ accessToken: 'access-token-secret', actorUrn, targetUrn }),
    ).rejects.toMatchObject({ kind: 'outcome_unknown', retryable: false });
    expect(recorded.calls).toHaveLength(1);
  });

  it.each([
    successfulReactionBody({ id: 'urn:li:reaction:(urn:li:person:other,urn:li:activity:7067167295080394752)' }),
    successfulReactionBody({ reactionType: 'PRAISE' }),
    successfulReactionBody({ root: 'urn:li:activity:999' }),
    successfulReactionBody({ created: { actor: 'urn:li:person:other', time: 1_760_000_000_000 } }),
    successfulReactionBody({ lastModified: { actor: 'urn:li:person:other', time: 1_760_000_000_000 } }),
  ])('rejects malformed or mismatched successful reaction responses', async (body) => {
    const recorded = recorder(Response.json(body, { status: 201 }));
    const client = createLinkedInReactionsClient({ apiVersion: '202610' }, { fetch: recorded.fetch });

    await expect(
      client.addReaction({
        accessToken: 'access-token-secret',
        actorUrn,
        targetUrn,
        reactionType: 'LIKE',
      }),
    ).rejects.toMatchObject({ kind: 'malformed_success', retryable: false });
    expect(recorded.calls).toHaveLength(1);
  });

  it('rejects oversized successful POST bodies without exposing provider content', async () => {
    const recorded = recorder(
      Response.json({ ...successfulReactionBody(), padding: 'x'.repeat(70 * 1024) }, { status: 201 }),
    );
    const client = createLinkedInReactionsClient({ apiVersion: '202610' }, { fetch: recorded.fetch });

    await expect(
      client.addReaction({
        accessToken: 'access-token-secret',
        actorUrn,
        targetUrn,
        reactionType: 'LIKE',
      }),
    ).rejects.toMatchObject({ kind: 'malformed_success', retryable: false });
  });

  it('rejects unsupported actors, targets and reaction types before fetch', async () => {
    const recorded = recorder(Response.json(successfulReactionBody(), { status: 201 }));
    const client = createLinkedInReactionsClient({ apiVersion: '202610' }, { fetch: recorded.fetch });

    await expect(
      client.addReaction({
        accessToken: 'access-token-secret',
        actorUrn: 'urn:li:organization:123',
        targetUrn,
        reactionType: 'LIKE',
      }),
    ).rejects.toThrow(/actor/i);
    await expect(
      client.addReaction({
        accessToken: 'access-token-secret',
        actorUrn,
        targetUrn: 'urn:li:comment:invalid',
        reactionType: 'LIKE',
      }),
    ).rejects.toThrow(/target/i);
    await expect(
      client.addReaction({
        accessToken: 'access-token-secret',
        actorUrn,
        targetUrn,
        reactionType: 'MAYBE' as never,
      }),
    ).rejects.toThrow(/reaction/i);
    expect(recorded.calls).toHaveLength(0);
  });

  it('keeps provider errors sanitized', () => {
    const error = new LinkedInReactionsError('outcome_unknown');
    expect(error.message).not.toContain('access-token-secret');
  });
});

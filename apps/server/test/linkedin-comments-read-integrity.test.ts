import { describe, expect, it } from 'vitest';

import { createLinkedInCommentsClient } from '../src/engagement/linkedin-comments.js';

const requestedRoot = 'urn:li:activity:6631349431612559360';
const unrelatedRoot = 'urn:li:activity:6631349431612559361';
const commentId = '6636062862760562688';
const comment = {
  id: commentId,
  commentUrn: `urn:li:comment:(${requestedRoot},${commentId})`,
  actor: 'urn:li:person:member-1',
  object: requestedRoot,
  message: { text: 'A provider comment' },
  created: { actor: 'urn:li:person:member-1', time: 1582160678569 },
  lastModified: { actor: 'urn:li:person:member-1', time: 1582160679569 },
  likesSummary: { totalLikes: 0 },
};

function clientFor(response: unknown) {
  return createLinkedInCommentsClient(
    { apiVersion: '202610' },
    { fetch: () => Promise.resolve(Response.json(response)) },
  );
}

describe('Comments response-to-request integrity', () => {
  it('rejects a GET response belonging to another activity in the same URN family', async () => {
    const wrongThread = {
      ...comment,
      object: unrelatedRoot,
      commentUrn: `urn:li:comment:(${unrelatedRoot},${commentId})`,
    };
    await expect(
      clientFor(wrongThread).getComment({
        accessToken: 'token',
        targetUrn: requestedRoot,
        commentId,
      }),
    ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
  });

  it('rejects a list element belonging to another activity in the same URN family', async () => {
    const wrongThread = {
      ...comment,
      object: unrelatedRoot,
      commentUrn: `urn:li:comment:(${unrelatedRoot},${commentId})`,
    };
    await expect(
      clientFor({ elements: [wrongThread], paging: { start: 0, count: 10, total: 1 } }).listComments({
        accessToken: 'token',
        targetUrn: requestedRoot,
      }),
    ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
  });

  it('rejects a self-inconsistent same-family object and comment URN root', async () => {
    await expect(
      clientFor({ ...comment, object: unrelatedRoot }).getComment({
        accessToken: 'token',
        targetUrn: requestedRoot,
        commentId,
      }),
    ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
  });

  it('rejects GET replies whose parent belongs to an unrelated same-family activity', async () => {
    const wrongParent = `urn:li:comment:(${unrelatedRoot},888)`;
    await expect(
      clientFor({ ...comment, parentComment: wrongParent }).getComment({
        accessToken: 'token',
        targetUrn: requestedRoot,
        commentId,
      }),
    ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
  });

  it('rejects LIST replies whose parent belongs to an unrelated same-family activity', async () => {
    const wrongParent = `urn:li:comment:(${unrelatedRoot},888)`;
    await expect(
      clientFor({
        elements: [{ ...comment, parentComment: wrongParent }],
        paging: { start: 0, count: 10, total: 1 },
      }).listComments({
        accessToken: 'token',
        targetUrn: requestedRoot,
      }),
    ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
  });

  it('accepts a same-root parent with a distinct comment ID', async () => {
    const validParent = `urn:li:comment:(${requestedRoot},888)`;
    const value = await clientFor({ ...comment, parentComment: validParent }).getComment({
      accessToken: 'token',
      targetUrn: requestedRoot,
      commentId,
    });
    expect(value.parentCommentUrn).toBe(validParent);
  });

  it('preserves a different-family share parent representation for an activity comment', async () => {
    const aliasParent = 'urn:li:comment:(urn:li:share:6666666666666666666,888)';
    const value = await clientFor({ ...comment, parentComment: aliasParent }).getComment({
      accessToken: 'token',
      targetUrn: requestedRoot,
      commentId,
    });
    expect(value.parentCommentUrn).toBe(aliasParent);
  });

  it('rejects a provider page that reports a different start from the requested window', async () => {
    await expect(
      clientFor({ elements: [comment], paging: { start: 500, count: 10, total: 501 } }).listComments({
        accessToken: 'token',
        targetUrn: requestedRoot,
        start: 0,
        count: 10,
      }),
    ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
  });

  it('rejects a page containing more records than the requested count', async () => {
    const elements = Array.from({ length: 11 }, (_, index) => ({
      ...comment,
      id: String(1000 + index),
      commentUrn: `urn:li:comment:(${requestedRoot},${1000 + index})`,
    }));
    await expect(
      clientFor({ elements, paging: { start: 0, count: 10, total: 11 } }).listComments({
        accessToken: 'token',
        targetUrn: requestedRoot,
        count: 10,
      }),
    ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
  });

  it('rejects paging metadata advertising a larger count than requested', async () => {
    await expect(
      clientFor({ elements: [comment], paging: { start: 0, count: 101, total: 1 } }).listComments({
        accessToken: 'token',
        targetUrn: requestedRoot,
        count: 10,
      }),
    ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
  });
});

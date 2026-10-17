import { describe, expect, it } from 'vitest';

import {
  CommentInboxError,
  deriveUnansweredCommentInbox,
  type CommentInboxListComments,
} from '../src/engagement/comment-inbox.js';
import type {
  CanonicalComment,
  CommentPage,
  EngagementReadAvailability,
} from '../../../packages/core/dist/index.js';

const threadA = 'urn:li:activity:7067167295080394752';
const threadB = 'urn:li:share:6305471423242596352';
const firstComment = 'urn:li:comment:(urn:li:activity:7067167295080394752,1001)';
const secondComment = 'urn:li:comment:(urn:li:activity:7067167295080394752,1002)';
const thirdComment = 'urn:li:comment:(urn:li:share:6305471423242596352,2001)';

function comment(
  id: string,
  commentUrn: string,
  actorUrn: string,
  objectUrn: string,
  options: { parentCommentUrn?: string; text?: string; createdAt?: string } = {},
): CanonicalComment {
  return {
    id,
    commentUrn,
    actorUrn,
    objectUrn,
    ...(options.parentCommentUrn === undefined
      ? {}
      : { parentCommentUrn: options.parentCommentUrn }),
    text: options.text ?? `comment-${id}`,
    createdAt: options.createdAt ?? '2026-10-17T10:00:00.000Z',
    lastModifiedAt: options.createdAt ?? '2026-10-17T10:00:00.000Z',
    totalLikes: 0,
  };
}

function page(
  elements: readonly CanonicalComment[],
  start = 0,
  nextStart?: number,
): CommentPage {
  return {
    elements,
    paging: {
      start,
      count: elements.length || 1,
      ...(nextStart === undefined ? {} : { nextStart }),
    },
    provider: 'OFFICIAL_API',
  };
}

function available(value: CommentPage): EngagementReadAvailability<CommentPage> {
  return { status: 'available', provider: 'OFFICIAL_API', value };
}

function unavailable(
  status: 'disabled' | 'permission_required',
): EngagementReadAvailability<CommentPage> {
  return {
    status,
    provider: 'OFFICIAL_API',
    requiredScope: 'r_member_social_feed',
  };
}

describe('explicit-thread unanswered comment inbox', () => {
  it('returns only top-level comments without a direct authenticated-member reply', async () => {
    const self = 'urn:li:person:member-123';
    const customer = 'urn:li:person:customer-456';
    const childByOther = 'urn:li:comment:(urn:li:activity:7067167295080394752,1101)';
    const nestedSelf = 'urn:li:comment:(urn:li:activity:7067167295080394752,1102)';

    const listComments: CommentInboxListComments = ({ targetUrn }) => {
      if (targetUrn === threadA) {
        return Promise.resolve(
          available(
            page([
              comment('1001', firstComment, customer, threadA, {
                text: 'Already answered',
                createdAt: '2026-10-17T09:00:00.000Z',
              }),
              comment('1002', secondComment, customer, threadA, {
                text: 'Needs an answer',
                createdAt: '2026-10-17T11:00:00.000Z',
              }),
            ]),
          ),
        );
      }
      if (targetUrn === firstComment) {
        return Promise.resolve(
          available(
            page([
              comment('1003', `${firstComment.slice(0, -5)}1003)`, self, threadA, {
                parentCommentUrn: firstComment,
              }),
            ]),
          ),
        );
      }
      if (targetUrn === secondComment) {
        return Promise.resolve(
          available(
            page([
              comment('1101', childByOther, customer, threadA, {
                parentCommentUrn: secondComment,
              }),
              comment('1102', nestedSelf, self, threadA, {
                parentCommentUrn: childByOther,
              }),
            ]),
          ),
        );
      }
      throw new Error(`unexpected target: ${targetUrn}`);
    };

    await expect(
      deriveUnansweredCommentInbox(
        { subject: 'member-123', threadUrns: [threadA] },
        { listComments },
      ),
    ).resolves.toEqual({
      status: 'available',
      provider: 'OFFICIAL_API',
      value: [
        {
          threadUrn: threadA,
          commentUrn: secondComment,
          actorUrn: customer,
          text: 'Needs an answer',
          createdAt: '2026-10-17T11:00:00.000Z',
          lastModifiedAt: '2026-10-17T11:00:00.000Z',
          replyTargetUrn: secondComment,
        },
      ],
    });
  });

  it.each(['disabled', 'permission_required'] as const)(
    'propagates %s read availability instead of fabricating an empty inbox',
    async (status) => {
      let calls = 0;
      const listComments: CommentInboxListComments = () => {
        calls += 1;
        return Promise.resolve(unavailable(status));
      };

      await expect(
        deriveUnansweredCommentInbox(
          { subject: 'member-123', threadUrns: [threadA, threadB] },
          { listComments },
        ),
      ).resolves.toEqual(unavailable(status));
      expect(calls).toBe(1);
    },
  );

  it('rejects non-explicit, duplicate, empty, and over-limit thread-root inputs locally', async () => {
    const listComments: CommentInboxListComments = () => Promise.resolve(available(page([])));

    await expect(
      deriveUnansweredCommentInbox({ subject: 'member-123', threadUrns: [] }, { listComments }),
    ).rejects.toMatchObject({ kind: 'invalid_input' });
    await expect(
      deriveUnansweredCommentInbox(
        { subject: 'member-123', threadUrns: Array.from({ length: 21 }, (_, i) => `urn:li:activity:${1000 + i}`) },
        { listComments },
      ),
    ).rejects.toMatchObject({ kind: 'invalid_input' });
    await expect(
      deriveUnansweredCommentInbox(
        { subject: 'member-123', threadUrns: [threadA, threadA] },
        { listComments },
      ),
    ).rejects.toMatchObject({ kind: 'invalid_input' });
    await expect(
      deriveUnansweredCommentInbox(
        { subject: 'member-123', threadUrns: [firstComment] },
        { listComments },
      ),
    ).rejects.toMatchObject({ kind: 'invalid_input' });
  });

  it('bounds paging and total provider calls instead of returning a partial inbox', async () => {
    let calls = 0;
    const listComments: CommentInboxListComments = ({ start }) => {
      calls += 1;
      return Promise.resolve(available(page([], start, start + 100)));
    };

    await expect(
      deriveUnansweredCommentInbox(
        { subject: 'member-123', threadUrns: [threadA] },
        { listComments },
      ),
    ).rejects.toMatchObject({ kind: 'limit_exceeded' });
    expect(calls).toBeLessThanOrEqual(3);
  });

  it('paginates explicit roots/replies and returns deterministic chronological ordering', async () => {
    const customer = 'urn:li:person:customer-456';
    const calls: Array<{ targetUrn: string; start: number; count: number }> = [];
    const listComments: CommentInboxListComments = ({ targetUrn, start, count }) => {
      calls.push({ targetUrn, start, count });
      if (targetUrn === threadA && start === 0) {
        return Promise.resolve(
          available(
            page(
              [
                comment('1002', secondComment, customer, threadA, {
                  createdAt: '2026-10-17T11:00:00.000Z',
                }),
              ],
              0,
              100,
            ),
          ),
        );
      }
      if (targetUrn === threadA && start === 100) {
        return Promise.resolve(
          available(
            page([
              comment('1001', firstComment, customer, threadA, {
                createdAt: '2026-10-17T09:00:00.000Z',
              }),
            ], 100),
          ),
        );
      }
      if (targetUrn === threadB) {
        return Promise.resolve(
          available(
            page([
              comment('2001', thirdComment, customer, threadB, {
                createdAt: '2026-10-17T10:00:00.000Z',
              }),
            ]),
          ),
        );
      }
      return Promise.resolve(available(page([])));
    };

    const result = await deriveUnansweredCommentInbox(
      { subject: 'member-123', threadUrns: [threadB, threadA] },
      { listComments },
    );
    expect(result.status).toBe('available');
    if (result.status !== 'available') throw new Error('expected available inbox');
    expect(result.value.map((item) => item.commentUrn)).toEqual([
      firstComment,
      thirdComment,
      secondComment,
    ]);
    expect(calls.every((call) => call.count === 100)).toBe(true);
    expect(calls).toContainEqual({ targetUrn: threadA, start: 100, count: 100 });
  });

  it('rejects invalid authenticated-subject input before any provider call', async () => {
    let calls = 0;
    const listComments: CommentInboxListComments = () => {
      calls += 1;
      return Promise.resolve(available(page([])));
    };

    await expect(
      deriveUnansweredCommentInbox({ subject: '   ', threadUrns: [threadA] }, { listComments }),
    ).rejects.toBeInstanceOf(CommentInboxError);
    expect(calls).toBe(0);
  });
});

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
  options: {
    parentCommentUrn?: string;
    text?: string;
    createdAt?: string;
  } = {},
): CanonicalComment {
  const createdAt = options.createdAt ?? '2026-10-17T10:00:00.000Z';
  return {
    id,
    commentUrn,
    actorUrn,
    objectUrn,
    ...(options.parentCommentUrn === undefined ? {} : { parentCommentUrn: options.parentCommentUrn }),
    text: options.text ?? `comment-${id}`,
    createdAt,
    lastModifiedAt: createdAt,
    totalLikes: 0,
  };
}

function page(elements: readonly CanonicalComment[], start = 0, nextStart?: number): CommentPage {
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

function unavailable(status: 'disabled' | 'permission_required'): EngagementReadAvailability<CommentPage> {
  return {
    status,
    provider: 'OFFICIAL_API',
    requiredScope: 'r_member_social_feed',
  };
}

describe('explicit-thread unanswered comment inbox', () => {
  it('keeps only comments without a direct authenticated-member reply', async () => {
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
        const selfReply = 'urn:li:comment:(urn:li:activity:7067167295080394752,1003)';
        return Promise.resolve(
          available(
            page([
              comment('1003', selfReply, self, threadA, {
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
      deriveUnansweredCommentInbox({ subject: 'member-123', threadUrns: [threadA] }, { listComments }),
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
    'propagates %s availability rather than returning an empty inbox',
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

  it('rejects invalid explicit-root inputs before provider reads', async () => {
    const listComments: CommentInboxListComments = () => Promise.resolve(available(page([])));
    const tooMany = Array.from({ length: 21 }, (_, index) => `urn:li:activity:${1000 + index}`);

    await expect(
      deriveUnansweredCommentInbox({ subject: 'member-123', threadUrns: [] }, { listComments }),
    ).rejects.toMatchObject({ kind: 'invalid_input' });
    await expect(
      deriveUnansweredCommentInbox({ subject: 'member-123', threadUrns: tooMany }, { listComments }),
    ).rejects.toMatchObject({ kind: 'invalid_input' });
    await expect(
      deriveUnansweredCommentInbox(
        { subject: 'member-123', threadUrns: [threadA, threadA] },
        { listComments },
      ),
    ).rejects.toMatchObject({ kind: 'invalid_input' });
    await expect(
      deriveUnansweredCommentInbox({ subject: 'member-123', threadUrns: [firstComment] }, { listComments }),
    ).rejects.toMatchObject({ kind: 'invalid_input' });
  });

  it('bounds paging instead of returning a partial inbox', async () => {
    let calls = 0;
    const listComments: CommentInboxListComments = ({ start }) => {
      calls += 1;
      return Promise.resolve(available(page([], start, start + 100)));
    };

    await expect(
      deriveUnansweredCommentInbox({ subject: 'member-123', threadUrns: [threadA] }, { listComments }),
    ).rejects.toMatchObject({ kind: 'limit_exceeded' });
    expect(calls).toBeLessThanOrEqual(3);
  });

  it('paginates and returns deterministic chronological ordering', async () => {
    const customer = 'urn:li:person:customer-456';
    const calls: Array<{
      targetUrn: string;
      start: number;
      count: number;
    }> = [];
    const listComments: CommentInboxListComments = ({ targetUrn, start, count }) => {
      calls.push({ targetUrn, start, count });
      if (targetUrn === threadA && start === 0) {
        const item = comment('1002', secondComment, customer, threadA, {
          createdAt: '2026-10-17T11:00:00.000Z',
        });
        return Promise.resolve(available(page([item], 0, 100)));
      }
      if (targetUrn === threadA && start === 100) {
        const item = comment('1001', firstComment, customer, threadA, {
          createdAt: '2026-10-17T09:00:00.000Z',
        });
        return Promise.resolve(available(page([item], 100)));
      }
      if (targetUrn === threadB) {
        const item = comment('2001', thirdComment, customer, threadB, {
          createdAt: '2026-10-17T10:00:00.000Z',
        });
        return Promise.resolve(available(page([item])));
      }
      return Promise.resolve(available(page([])));
    };

    const result = await deriveUnansweredCommentInbox(
      { subject: 'member-123', threadUrns: [threadB, threadA] },
      { listComments },
    );
    expect(result.status).toBe('available');
    if (result.status !== 'available') {
      throw new Error('expected available inbox');
    }
    expect(result.value.map((item) => item.commentUrn)).toEqual([firstComment, thirdComment, secondComment]);
    expect(calls.every((call) => call.count === 100)).toBe(true);
    expect(calls).toContainEqual({
      targetUrn: threadA,
      start: 100,
      count: 100,
    });
  });

  it('does not treat the authenticated member own top-level comments as unanswered', async () => {
    const self = 'urn:li:person:member-123';
    let nestedReads = 0;
    const listComments: CommentInboxListComments = ({ targetUrn }) => {
      if (targetUrn === threadA) {
        return Promise.resolve(available(page([comment('1001', firstComment, self, threadA)])));
      }
      nestedReads += 1;
      return Promise.resolve(available(page([])));
    };

    await expect(
      deriveUnansweredCommentInbox({ subject: 'member-123', threadUrns: [threadA] }, { listComments }),
    ).resolves.toMatchObject({ status: 'available', value: [] });
    expect(nestedReads).toBe(0);
  });

  it('continues a full page with unknown total before deciding a comment is unanswered', async () => {
    const self = 'urn:li:person:member-123';
    const other = 'urn:li:person:customer-456';
    const starts: number[] = [];
    const listComments: CommentInboxListComments = ({ targetUrn, start }) => {
      if (targetUrn === threadA) {
        return Promise.resolve(available(page([comment('1001', firstComment, other, threadA)])));
      }
      if (targetUrn !== firstComment) throw new Error('Unexpected thread');
      starts.push(start);
      if (start === 0) {
        const firstPage = Array.from({ length: 100 }, (_, index) =>
          comment(
            String(3000 + index),
            `urn:li:comment:(${threadA},${3000 + index})`,
            other,
            threadA,
            { parentCommentUrn: firstComment },
          ),
        );
        return Promise.resolve(available(page(firstPage)));
      }
      if (start === 100) {
        return Promise.resolve(
          available(
            page([
              comment('4000', `urn:li:comment:(${threadA},4000)`, self, threadA, {
                parentCommentUrn: firstComment,
              }),
            ], start),
          ),
        );
      }
      throw new Error('Unexpected page');
    };

    await expect(
      deriveUnansweredCommentInbox({ subject: 'member-123', threadUrns: [threadA] }, { listComments }),
    ).resolves.toMatchObject({ status: 'available', value: [] });
    expect(starts).toEqual([0, 100]);
  });

  it('rejects an invalid subject before any provider call', async () => {
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

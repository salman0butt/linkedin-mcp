import { describe, expect, it } from 'vitest';

import {
  createReactionPreview,
  createReplyPreview,
  parseCommentTarget,
  reactionTypes,
} from '../src/engagement.js';

const shareUrn = 'urn:li:share:6305471423242596352';
const ugcPostUrn = 'urn:li:ugcPost:70161431162413057';
const activityUrn = 'urn:li:activity:6631349431612559360';
const commentUrn =
  'urn:li:comment:(urn:li:activity:6631349431612559360,6636062862760562688)';

describe('engagement contracts', () => {
  it.each([shareUrn, ugcPostUrn, activityUrn, commentUrn])(
    'accepts conservative explicit comment target %s',
    (targetUrn) => {
      expect(parseCommentTarget(targetUrn)).toBe(targetUrn);
    },
  );

  it.each([
    'urn:li:person:abc',
    'urn:li:organization:123',
    'urn:li:share:not-numeric',
    'urn:li:comment:(urn:li:person:abc,6636062862760562688)',
    'urn:li:comment:(urn:li:activity:6631349431612559360,not-numeric)',
    ` ${shareUrn}`,
    `${shareUrn} `,
    '',
  ])('rejects unsupported or non-canonical target %j', (targetUrn) => {
    expect(() => parseCommentTarget(targetUrn)).toThrow(/comment target/i);
  });

  it('creates a stable actor-free nested reply preview', () => {
    const draft = {
      targetUrn: commentUrn,
      rootUrn: shareUrn,
      parentCommentUrn: commentUrn,
      text: 'Thanks for the thoughtful question.',
    } as const;

    const first = createReplyPreview(draft);
    const second = createReplyPreview({ ...draft });

    expect(first).toEqual(second);
    expect(first.payload).toEqual(draft);
    expect(first.canonicalJson).toBe(JSON.stringify(draft));
    expect(first.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.provider).toBe('OFFICIAL_API');
    expect(first.requiredScope).toBe('w_member_social_feed');
    expect(first.warnings).toEqual([]);
    expect(first.canonicalJson).not.toContain('actor');
  });

  it('rejects blank reply text and caller-controlled actor fields', () => {
    expect(() =>
      createReplyPreview({
        targetUrn: commentUrn,
        rootUrn: shareUrn,
        parentCommentUrn: commentUrn,
        text: '   ',
      }),
    ).toThrow(/reply text/i);

    expect(() =>
      createReplyPreview({
        targetUrn: commentUrn,
        rootUrn: shareUrn,
        parentCommentUrn: commentUrn,
        text: 'Thanks',
        actor: 'urn:li:person:attacker',
      } as never),
    ).toThrow(/unsupported reply/i);
  });

  it('allows only current supported reaction types and rejects MAYBE', () => {
    expect(reactionTypes).toEqual([
      'LIKE',
      'PRAISE',
      'EMPATHY',
      'INTEREST',
      'APPRECIATION',
      'ENTERTAINMENT',
    ]);

    for (const reactionType of reactionTypes) {
      expect(
        createReactionPreview({ operation: 'add', targetUrn: commentUrn, reactionType }),
      ).toMatchObject({
        provider: 'OFFICIAL_API',
        requiredScope: 'w_member_social_feed',
      });
    }

    expect(() =>
      createReactionPreview({
        operation: 'add',
        targetUrn: commentUrn,
        reactionType: 'MAYBE',
      } as never),
    ).toThrow(/reaction type/i);
  });

  it('creates operation-specific stable reaction hashes without actor identity', () => {
    const add = createReactionPreview({
      operation: 'add',
      targetUrn: shareUrn,
      reactionType: 'PRAISE',
    });
    const remove = createReactionPreview({
      operation: 'remove',
      targetUrn: shareUrn,
    });

    expect(add.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(remove.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(add.payloadHash).not.toBe(remove.payloadHash);
    expect(add.canonicalJson).toBe(
      JSON.stringify({ operation: 'add', targetUrn: shareUrn, reactionType: 'PRAISE' }),
    );
    expect(remove.canonicalJson).toBe(
      JSON.stringify({ operation: 'remove', targetUrn: shareUrn }),
    );
    expect(add.canonicalJson).not.toContain('actor');
    expect(remove.canonicalJson).not.toContain('actor');
  });
});

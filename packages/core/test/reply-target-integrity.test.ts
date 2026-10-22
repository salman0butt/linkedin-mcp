import { describe, expect, it } from 'vitest';

import { createReplyPreview } from '../src/engagement.js';

const parentCommentUrn = 'urn:li:comment:(urn:li:activity:6631349431612559360,6636062862760562688)';
const unrelatedCommentUrn = 'urn:li:comment:(urn:li:activity:6631349431612559360,6636062862760562689)';

describe('nested reply approval boundary', () => {
  it('rejects a reply targeting a different comment before creating an approvable preview', () => {
    expect(() =>
      createReplyPreview({
        targetUrn: unrelatedCommentUrn,
        rootUrn: 'urn:li:share:6305471423242596352',
        parentCommentUrn,
        text: 'Thanks for your question.',
      }),
    ).toThrow(/reply target.*parent comment/i);
  });
});

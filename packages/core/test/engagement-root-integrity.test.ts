import { describe, expect, it } from 'vitest';

import { createReplyPreview, matchesReplyIdentity } from '../src/engagement.js';

const parent = 'urn:li:comment:(urn:li:activity:111,222)';
const reply = 'urn:li:comment:(urn:li:activity:111,333)';

describe('reply root identity integrity', () => {
  it('rejects an unrelated same-family root before constructing an approval preview', () => {
    expect(() =>
      createReplyPreview({
        targetUrn: parent,
        parentCommentUrn: parent,
        rootUrn: 'urn:li:activity:999',
        text: 'A reply',
      }),
    ).toThrow(/root|parent|thread/i);
  });

  it('rejects a reply identity when parent and root identify different activities', () => {
    expect(matchesReplyIdentity(reply, '333', parent, 'urn:li:activity:999')).toBe(false);
  });

  it('preserves matching activity roots and legitimate cross-family aliases', () => {
    expect(
      createReplyPreview({
        targetUrn: parent,
        parentCommentUrn: parent,
        rootUrn: 'urn:li:activity:111',
        text: 'A reply',
      }).payload.rootUrn,
    ).toBe('urn:li:activity:111');
    expect(matchesReplyIdentity(reply, '333', parent, 'urn:li:activity:111')).toBe(true);
    expect(matchesReplyIdentity(reply, '333', parent, 'urn:li:share:444')).toBe(true);
  });
});

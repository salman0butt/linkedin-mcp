import { describe, expect, it } from 'vitest';

import { createReplyPreview } from '../../../packages/core/src/engagement.js';
import { createLinkedInCommentsClient } from '../src/engagement/linkedin-comments.js';
import { createLinkedInReactionsClient } from '../src/engagement/linkedin-reactions.js';

const activity = 'urn:li:activity:6305471423192264704';
const share = 'urn:li:share:6305471423242596352';
const parent = 'urn:li:comment:(urn:li:activity:6305471423192264704,6308007194273021952)';
const actor = 'urn:li:person:member-123';
const createdId = '6636062862760562688';
const config = { apiVersion: '202610' };

function replyBody(commentUrn: string) {
  return {
    actor,
    object: share,
    parentComment: parent,
    commentUrn,
    id: createdId,
    message: { text: 'Reply with context' },
    created: { actor, time: 1_582_160_678_569 },
    lastModified: { actor, time: 1_582_160_679_569 },
  };
}

describe('M04 official provider contract review regressions', () => {
  it('rejects using another comment as a nested reply root object before approval', () => {
    expect(() =>
      createReplyPreview({
        targetUrn: parent,
        parentCommentUrn: parent,
        rootUrn: 'urn:li:comment:(urn:li:activity:9,10)',
        text: 'Reply with context',
      }),
    ).toThrow(/root|object/i);
  });

  it('accepts a valid reply identity rooted in the documented share object', async () => {
    const client = createLinkedInCommentsClient(config, {
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify(replyBody(`urn:li:comment:(${share},${createdId})`)), {
            status: 201,
            headers: { 'x-restli-id': createdId },
          }),
        ),
    });
    await expect(
      client.createReply({
        accessToken: 'token',
        actorUrn: actor,
        targetUrn: parent,
        parentCommentUrn: parent,
        objectUrn: share,
        text: 'Reply with context',
      }),
    ).resolves.toMatchObject({
      id: createdId,
      commentUrn: `urn:li:comment:(${share},${createdId})`,
      objectUrn: share,
      parentCommentUrn: parent,
    });
  });

  it('accepts organization-brand actors in otherwise valid member comment reads', async () => {
    const brand = 'urn:li:organizationBrand:7744';
    const body = {
      id: createdId,
      commentUrn: `urn:li:comment:(${activity},${createdId})`,
      object: activity,
      actor: brand,
      message: { text: 'Brand feedback' },
      likesSummary: { totalLikes: 0 },
      created: { actor: brand, time: 1_582_160_678_569 },
      lastModified: { actor: brand, time: 1_582_160_679_569 },
    };
    const client = createLinkedInCommentsClient(config, {
      fetch: () => Promise.resolve(Response.json(body)),
    });
    await expect(
      client.getComment({ accessToken: 'token', targetUrn: activity, commentId: createdId }),
    ).resolves.toMatchObject({ id: createdId, actorUrn: brand });
  });

  it('escapes nested comment-URN parentheses inside reaction DELETE compound keys', async () => {
    const targetUrn = 'urn:li:comment:(urn:li:activity:6666,120381273128)';
    let requestedUrl: string | undefined;
    const client = createLinkedInReactionsClient(config, {
      fetch: (input) => {
        requestedUrl = String(input);
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });
    await client.removeReaction({ accessToken: 'token', actorUrn: actor, targetUrn });
    expect(requestedUrl).toBe(
      'https://api.linkedin.com/rest/reactions/(actor:urn%3Ali%3Aperson%3Amember-123,entity:urn%3Ali%3Acomment%3A%28urn%3Ali%3Aactivity%3A6666%2C120381273128%29)',
    );
  });
});

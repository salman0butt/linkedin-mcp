import type { NormalizedPost, PostSearchQuery } from '../../../../packages/core/dist/index.js';

const maxBatchSize = 1_000;

/** Deterministic, local-only filter; provider claims must already be normalized by the core contract. */
export function filterDiscoveredPosts(
  posts: readonly NormalizedPost[],
  query: PostSearchQuery,
): readonly NormalizedPost[] {
  if (Object.prototype.toString.call(posts) !== '[object Array]' || posts.length > maxBatchSize) {
    throw new Error('Post discovery input exceeds local bound');
  }

  const seen = new Set<string>();
  const filtered: Array<{ post: NormalizedPost; index: number }> = [];
  const since = query.since === undefined ? undefined : Date.parse(query.since);
  const until = query.until === undefined ? undefined : Date.parse(query.until);
  const hashtag =
    query.kind === 'hashtag'
      ? new RegExp(
          `(?:^|[^a-zA-Z0-9_])#${query.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zA-Z0-9_])`,
          'i',
        )
      : undefined;

  for (const [index, post] of posts.entries()) {
    if (
      query.kind === 'topic' &&
      !post.text.toLocaleLowerCase('en').includes(query.term.toLocaleLowerCase('en'))
    ) {
      continue;
    }
    if (hashtag !== undefined && !hashtag.test(post.text)) continue;
    if (query.kind === 'author' && post.authorUrn !== query.authorUrn) continue;
    if (query.kind === 'company' && post.authorUrn !== query.organizationUrn) continue;

    if (since !== undefined || until !== undefined) {
      if (post.publishedAt === undefined) continue;
      const published = Date.parse(post.publishedAt);
      if (!Number.isFinite(published)) continue;
      if ((since !== undefined && published < since) || (until !== undefined && published > until)) {
        continue;
      }
    }
    if (query.minimumEngagement !== undefined) {
      // Do not interpret a missing metric as zero or sufficient evidence of engagement.
      if (post.likes === undefined || post.comments === undefined) continue;
      if (post.likes + post.comments < query.minimumEngagement) continue;
    }
    // Deduplicate only eligible records; an older/incomplete duplicate must
    // never consume the source identity before a genuinely matching record.
    const identity = JSON.stringify([post.source.id, post.id]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    filtered.push({ post, index });
  }

  filtered.sort((left, right) => {
    const lTime = left.post.publishedAt === undefined ? -Infinity : Date.parse(left.post.publishedAt);
    const rTime = right.post.publishedAt === undefined ? -Infinity : Date.parse(right.post.publishedAt);
    return rTime - lTime || left.index - right.index;
  });
  return Object.freeze(filtered.slice(0, query.limit).map(({ post }) => post));
}

import { describe, expect, it } from 'vitest';

import {
  createPostSearchQuery,
  normalizeDiscoveredPost,
  type TrustedDiscoveryContext,
} from '../../../packages/core/src/post-discovery.js';
import { filterDiscoveredPosts } from '../src/discovery/post-search-filter.js';

const retrievedAt = '2026-10-22T07:30:00.000Z';
const external = {
  providerId: 'external-a',
  providerType: 'EXTERNAL_DISCOVERY',
  name: 'External A',
  retrievedAt,
} as const;
const partner = {
  providerId: 'partner-b',
  providerType: 'PARTNER_API',
  name: 'Partner B',
  retrievedAt,
} as const;

const post = (
  id: string,
  text: string,
  values: Record<string, unknown> = {},
  source: TrustedDiscoveryContext = external,
) => normalizeDiscoveredPost({ id, text, ...values }, source);

describe('M05 deterministic bounded post discovery filtering', () => {
  it('filters case-insensitive topic text and supports stable recent-first ordering', () => {
    const results = filterDiscoveredPosts(
      [
        post('old', 'GEN AI', { publishedAt: '2026-10-18T01:00:00Z' }),
        post('other', 'Design thinking', { publishedAt: '2026-10-20T01:00:00Z' }),
        post('new', 'gen AI agents', { publishedAt: '2026-10-21T01:00:00Z' }),
        post('undated', 'Gen ai, undated'),
      ],
      createPostSearchQuery({ kind: 'topic', term: 'gen ai' }),
    );
    expect(results.map((p) => p.id)).toEqual(['new', 'old', 'undated']);
    expect(Object.isFrozen(results)).toBe(true);
  });

  it('matches explicit hashtag tokens, not partial substrings', () => {
    const items = [
      post('a', 'Working on #TypeScript!'),
      post('b', 'Working on #typescriptdaily'),
      post('c', 'typescript without hashtag'),
    ];
    expect(
      filterDiscoveredPosts(items, createPostSearchQuery({ kind: 'hashtag', term: '#typescript' })).map(
        (x) => x.id,
      ),
    ).toEqual(['a']);
  });

  it('filters only genuine author/company identifiers, never guessed metadata', () => {
    const items = [
      post('person', 'hello', { authorUrn: 'urn:li:person:alice' }),
      post('company', 'hello', { authorUrn: 'urn:li:organization:456' }),
      post('unknown', 'hello'),
    ];
    expect(
      filterDiscoveredPosts(
        items,
        createPostSearchQuery({ kind: 'author', authorUrn: 'urn:li:person:alice' }),
      ).map((x) => x.id),
    ).toEqual(['person']);
    expect(
      filterDiscoveredPosts(
        items,
        createPostSearchQuery({ kind: 'company', organizationUrn: 'urn:li:organization:456' }),
      ).map((x) => x.id),
    ).toEqual(['company']);
  });

  it('applies inclusive UTC bounds only to actual publication dates', () => {
    const input = [
      post('before', 'hello', { publishedAt: '2026-10-01T00:00:00Z' }),
      post('in', 'hello', { publishedAt: '2026-10-10T00:00:00Z' }),
      post('after', 'hello', { publishedAt: '2026-10-21T00:00:00Z' }),
      post('unknown', 'hello'),
    ];
    const query = createPostSearchQuery({
      kind: 'recent',
      since: '2026-10-10T00:00:00Z',
      until: '2026-10-20T00:00:00Z',
    });
    expect(filterDiscoveredPosts(input, query).map((x) => x.id)).toEqual(['in']);
  });

  it('does not invent missing engagement metrics to meet a threshold', () => {
    const input = [
      post('complete', 'ai', { likes: 6, comments: 4 }),
      post('unknown-comment-count', 'ai', { likes: 100 }),
      post('low', 'ai', { likes: 8, comments: 1 }),
      post('unknown', 'ai'),
    ];
    expect(
      filterDiscoveredPosts(
        input,
        createPostSearchQuery({ kind: 'topic', term: 'ai', minimumEngagement: 10 }),
      ).map((x) => x.id),
    ).toEqual(['complete']);
  });

  it('dedupes within a verified provider ID only and preserves identical URNs across untrusted providers', () => {
    const urn = 'urn:li:activity:123';
    const externalA = post('id1', 'hello', { postUrn: urn });
    const duplicate = post('id1', 'duplicate from same source', { postUrn: urn });
    const partnerA = post('id1', 'same post URN claimed by another source', { postUrn: urn }, partner);
    const result = filterDiscoveredPosts(
      [externalA, duplicate, partnerA],
      createPostSearchQuery({ kind: 'recent' }),
    );
    expect(result).toHaveLength(2);
    expect(result.map((x) => x.source.id)).toEqual(['external-a', 'partner-b']);
    expect(result[0]?.text).toBe('hello');
  });

  it('does not let an ineligible duplicate hide a later matching source record', () => {
    const records = [
      post('same', 'unrelated', { publishedAt: '2026-09-01T00:00:00Z' }),
      post('same', 'AI launch', { publishedAt: '2026-10-20T00:00:00Z' }),
    ];
    const result = filterDiscoveredPosts(
      records,
      createPostSearchQuery({ kind: 'topic', term: 'AI', since: '2026-10-01T00:00:00Z' }),
    );
    expect(result.map((item) => item.text)).toEqual(['AI launch']);

    const engagementRecords = [
      post('metrics', 'AI example', { likes: 100 }),
      post('metrics', 'AI example', { likes: 14, comments: 6 }),
    ];
    expect(
      filterDiscoveredPosts(
        engagementRecords,
        createPostSearchQuery({ kind: 'topic', term: 'AI', minimumEngagement: 20 }),
      ).map((item) => item.id),
    ).toEqual(['metrics']);
  });

  it('returns at most requested limit and rejects excessive provider input batches', () => {
    const items = Array.from({ length: 55 }, (_, i) =>
      post(String(i), 'hello', { publishedAt: '2026-10-21T00:00:00Z' }),
    );
    const result = filterDiscoveredPosts(items, createPostSearchQuery({ kind: 'recent', limit: 2 }));
    expect(result.map((x) => x.id)).toEqual(['0', '1']);
    expect(() =>
      filterDiscoveredPosts(
        items
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items)
          .concat(items),
        createPostSearchQuery({ kind: 'recent' }),
      ),
    ).toThrow();
  });
});

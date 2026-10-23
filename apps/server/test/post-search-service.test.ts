import { describe, expect, it, vi } from 'vitest';

import {
  createPostSearchService,
  DiscoveryProviderError,
  type DiscoveryProvider,
} from '../src/discovery/post-search-service.js';

const now = () => new Date('2026-10-22T08:00:00.000Z');

function provider(
  id: string,
  search: DiscoveryProvider['search'],
  kinds: DiscoveryProvider['supportedKinds'] = ['topic', 'recent'],
  type: DiscoveryProvider['providerType'] = 'EXTERNAL_DISCOVERY',
): DiscoveryProvider {
  return { providerId: id, providerType: type, name: `Source ${id}`, supportedKinds: kinds, search };
}

const topic = { kind: 'topic', term: 'AI' } as const;

describe('M05 explicit provider router and availability', () => {
  it('preserves prototype-defined search methods for trusted host adapter classes', async () => {
    class ConfiguredProvider implements DiscoveryProvider {
      readonly providerId = 'prototype-provider';
      readonly providerType = 'EXTERNAL_DISCOVERY' as const;
      readonly name = 'Configured provider class';
      readonly supportedKinds = ['topic'] as const;
      private readonly records = [{ id: 'post-1', text: 'AI overview' }];

      search() {
        return Promise.resolve({ posts: this.records });
      }
    }

    const service = createPostSearchService({ providers: [new ConfiguredProvider()], now });
    const result = await service.search(topic);
    expect(result).toMatchObject({
      status: 'available',
      posts: [{ id: 'post-1', source: { id: 'prototype-provider', provider: 'EXTERNAL_DISCOVERY' } }],
      providerOutcomes: [{ state: 'success', consulted: true }],
    });
  });

  it('reports unavailable without contacting anyone when no provider is configured', async () => {
    const result = await createPostSearchService({ providers: [], now }).search(topic);
    expect(result).toEqual({
      status: 'unavailable',
      query: { kind: 'topic', term: 'AI', limit: 10 },
      providerOutcomes: [],
    });
    expect(result).not.toHaveProperty('posts');
  });

  it('rejects malformed queries before provider side effects', async () => {
    const search = vi.fn(() => Promise.resolve({ posts: [] }));
    const service = createPostSearchService({ providers: [provider('source-a', search)], now });
    await expect(
      service.search({ kind: 'topic', term: 'AI', unexpected: 'https://attacker.test' }),
    ).rejects.toThrow();
    expect(search).not.toHaveBeenCalled();
  });

  it('a genuinely consulted empty provider returns available empty with auditable outcome', async () => {
    const service = createPostSearchService({
      providers: [provider('source-a', () => Promise.resolve({ posts: [] }))],
      now,
    });
    const result = await service.search(topic);
    expect(result).toMatchObject({
      status: 'available',
      posts: [],
      providerOutcomes: [
        { providerId: 'source-a', providerType: 'EXTERNAL_DISCOVERY', state: 'success', consulted: true },
      ],
    });
  });

  it('derives result source identity and retrievedAt from the configured adapter rather than provider payload', async () => {
    const service = createPostSearchService({
      providers: [
        provider('source-a', () =>
          Promise.resolve({
            posts: [
              {
                id: 'p1',
                text: 'AI systems',
                source: { provider: 'OFFICIAL_API', id: 'spoofed', retrievedAt: '2000-01-01T00:00:00Z' },
              },
              { id: 'p2', text: 'unrelated' },
            ],
          }),
        ),
      ],
      now,
    });
    const result = await service.search(topic);
    expect(result).toMatchObject({
      status: 'available',
      posts: [
        {
          id: 'p1',
          source: {
            id: 'source-a',
            provider: 'EXTERNAL_DISCOVERY',
            name: 'Source source-a',
            retrievedAt: '2026-10-22T08:00:00.000Z',
          },
        },
      ],
    });
    if (result.status === 'available') {
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0]).not.toHaveProperty('publishedAt');
    }
  });

  it('reports partial instead of complete empty when another eligible provider fails', async () => {
    const service = createPostSearchService({
      providers: [
        provider('empty', () => Promise.resolve({ posts: [] })),
        provider('limited', () => Promise.reject(new DiscoveryProviderError('rate_limited'))),
      ],
      now,
    });
    const result = await service.search(topic);
    expect(result).toMatchObject({
      status: 'partial',
      posts: [],
      providerOutcomes: [
        { providerId: 'empty', state: 'success', consulted: true },
        { providerId: 'limited', state: 'rate_limited', consulted: true },
      ],
    });
  });

  it('preserves actual posts when another eligible provider fails without disguising a partial search', async () => {
    const service = createPostSearchService({
      providers: [
        provider('succeeded', () => Promise.resolve({ posts: [{ id: 'a', text: 'AI today' }] })),
        provider('failed', () => Promise.reject(new Error('provider private body must not leak'))),
      ],
      now,
    });
    const result = await service.search(topic);
    expect(result).toMatchObject({
      status: 'partial',
      posts: [{ id: 'a', text: 'AI today' }],
      providerOutcomes: [{ state: 'success' }, { state: 'failed' }],
    });
    expect(JSON.stringify(result)).not.toContain('private body');
  });

  it('returns permission and rate limit failures explicitly and applies deterministic precedence', async () => {
    const result = await createPostSearchService({
      providers: [
        provider('rate', () => Promise.reject(new DiscoveryProviderError('rate_limited'))),
        provider('access', () => Promise.reject(new DiscoveryProviderError('permission_required'))),
      ],
      now,
    }).search(topic);
    expect(result.status).toBe('permission_required');
    expect(result).not.toHaveProperty('posts');
    expect(result.providerOutcomes.map((x) => x.state)).toEqual(['rate_limited', 'permission_required']);
  });

  it('never calls unsupported provider kinds or presents them as having searched', async () => {
    const skipped = vi.fn(() => Promise.resolve({ posts: [] }));
    const service = createPostSearchService({
      providers: [provider('author-only', skipped, ['author'])],
      now,
    });
    const result = await service.search(topic);
    expect(result).toMatchObject({
      status: 'unavailable',
      providerOutcomes: [{ providerId: 'author-only', consulted: false, state: 'unavailable' }],
    });
    expect(skipped).not.toHaveBeenCalled();
  });

  it('bounds per-provider response size and does not claim success from oversized data', async () => {
    const service = createPostSearchService({
      providers: [
        provider('huge', () =>
          Promise.resolve({
            posts: Array.from({ length: 1001 }, (_, id) => ({ id: `${id}`, text: 'AI' })),
          }),
        ),
      ],
      now,
    });
    expect(await service.search(topic)).toMatchObject({
      status: 'failed',
      providerOutcomes: [{ state: 'failed' }],
    });
  });

  it('times out and aborts a nonresponsive provider without returning success', async () => {
    let aborted = false;
    const service = createPostSearchService({
      providers: [
        provider('stalled', (_query, signal) => {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
          return new Promise(() => {});
        }),
      ],
      now,
      timeoutMs: 10,
    });
    const result = await service.search(topic);
    expect(result.status).toBe('failed');
    expect(aborted).toBe(true);
  });

  it('rejects duplicate, fake official, or unsupported trusted adapter metadata', () => {
    const search = () => Promise.resolve({ posts: [] });
    const a = provider('duplicate', search);
    expect(() => createPostSearchService({ providers: [a, a], now })).toThrow();
    expect(() => createPostSearchService({ providers: [provider('', search)], now })).toThrow();
    expect(() =>
      createPostSearchService({
        providers: [provider('browser', search, ['topic'], 'BROWSER_INTERACTIVE' as 'PARTNER_API')],
        now,
      }),
    ).toThrow();
    expect(() =>
      createPostSearchService({
        providers: [a, provider('other', search), provider('third', search), provider('fourth', search)],
        now,
      }),
    ).toThrow();
  });

  it('rejects an official provider configured for global topic or hashtag discovery', () => {
    const search = () => Promise.resolve({ posts: [{ id: 'post', text: 'AI #engineering' }] });
    for (const kind of ['topic', 'hashtag', 'recent'] as const) {
      expect(() =>
        createPostSearchService({ providers: [provider('official', search, [kind], 'OFFICIAL_API')], now }),
      ).toThrow();
    }
    expect(() =>
      createPostSearchService({
        providers: [provider('mixed', search, ['author', 'topic'], 'OFFICIAL_API')],
        now,
      }),
    ).toThrow();
    expect(() =>
      createPostSearchService({
        providers: [provider('author-only', search, ['author'], 'OFFICIAL_API')],
        now,
      }),
    ).not.toThrow();
  });
});

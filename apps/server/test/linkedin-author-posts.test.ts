import { describe, expect, it, vi } from 'vitest';

import { createPostSearchQuery } from '../../../packages/core/dist/index.js';
import { createLinkedInAuthorPostsProvider } from '../src/discovery/linkedin-author-posts.js';
import { createPostSearchService, DiscoveryProviderError } from '../src/discovery/post-search-service.js';

const member = 'urn:li:person:member_1';
const company = 'urn:li:organization:2414183';
const memberQuery = createPostSearchQuery({ kind: 'author', authorUrn: member, limit: 2 });
const companyQuery = createPostSearchQuery({ kind: 'company', organizationUrn: company });

function verifiedMember() {
  return {
    kind: 'member' as const,
    verifiedPersonUrn: member,
    identityVerified: true as const,
    accessToken: 'private-test-token',
    scopes: ['r_member_social'],
  };
}

function verifiedCompany() {
  return {
    kind: 'organization' as const,
    verifiedOrganizationUrn: company,
    roleVerified: true as const,
    roleState: 'APPROVED' as const,
    role: 'CONTENT_ADMIN' as const,
    accessToken: 'private-test-token',
    scopes: ['r_organization_social'],
  };
}

function published(id: string, author = member) {
  return {
    id: `urn:li:ugcPost:${id}`,
    author,
    commentary: `Post ${id}`,
    visibility: 'PUBLIC',
    lifecycleState: 'PUBLISHED',
    publishedAt: 1735689600000,
  };
}

function page(elements: unknown[], start = 0, count = 2, more = false) {
  return {
    elements,
    paging: {
      start,
      count,
      links: more
        ? [
            {
              rel: 'next',
              href: `/rest/posts?author=${encodeURIComponent(member)}&q=author&viewContext=READER&sortBy=CREATED&count=${count}&start=${start + count}`,
            },
          ]
        : [],
    },
  };
}

function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): URL {
  return new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
}

function finder(
  options: {
    enabled?: boolean;
    resolveAccess?: (author: string, signal: AbortSignal) => Promise<unknown>;
  } = {},
  fetch = vi.fn<typeof globalThis.fetch>(),
) {
  const resolveAccess = options.resolveAccess ?? vi.fn(() => Promise.resolve(verifiedMember()));
  const provider = createLinkedInAuthorPostsProvider(
    { apiVersion: '202610', ...options, resolveAccess },
    { fetch },
  );
  return { provider, fetch, resolveAccess };
}

describe('M05.4 restricted official author finder', () => {
  it('defaults OFF without consulting identity or making a provider request', async () => {
    const { provider, fetch, resolveAccess } = finder();
    await expect(provider.search(memberQuery, new AbortController().signal)).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(resolveAccess).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    const result = await createPostSearchService({ providers: [provider] }).search(memberQuery);
    expect(result).toMatchObject({
      status: 'unavailable',
      providerOutcomes: [{ providerType: 'OFFICIAL_API', state: 'unavailable', consulted: true }],
    });
  });

  it('can be configured without any access resolver and remains unavailable even if enabled', async () => {
    for (const enabled of [false, true]) {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const provider = createLinkedInAuthorPostsProvider({ apiVersion: '202610', enabled }, { fetch });
      await expect(provider.search(memberQuery, new AbortController().signal)).rejects.toMatchObject({
        kind: 'unavailable',
      });
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it('preserves trusted resolver rate limit or provider failure outcomes', async () => {
    for (const [reason, expectedKind] of [
      [new DiscoveryProviderError('rate_limited'), 'rate_limited'],
      [new DiscoveryProviderError('failed'), 'failed'],
      [new Error('unexpected external identity failure'), 'failed'],
    ] as const) {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const provider = createLinkedInAuthorPostsProvider(
        { apiVersion: '202610', enabled: true, resolveAccess: () => Promise.reject(reason) },
        { fetch },
      );
      await expect(provider.search(memberQuery, new AbortController().signal)).rejects.toMatchObject({
        kind: expectedKind,
      });
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it('rejects invalid direct caller queries before consulting access', async () => {
    const { provider, fetch, resolveAccess } = finder({ enabled: true });
    await expect(
      provider.search(
        { kind: 'author', authorUrn: member, limit: 1000 } as never,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(resolveAccess).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses global discovery, malformed API versions, and unverified access without network calls', async () => {
    const { provider, fetch, resolveAccess } = finder({ enabled: true });
    const global = createPostSearchQuery({ kind: 'topic', term: 'security' });
    await expect(provider.search(global, new AbortController().signal)).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(resolveAccess).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(() =>
      createLinkedInAuthorPostsProvider({ apiVersion: 'not-a-version', enabled: true, resolveAccess }),
    ).toThrow();

    for (const access of [
      null,
      { ...verifiedMember(), identityVerified: false },
      { ...verifiedMember(), scopes: ['openid'] },
      { ...verifiedMember(), verifiedPersonUrn: 'urn:li:person:another' },
      { ...verifiedMember(), accessToken: '' },
      { ...verifiedCompany(), roleVerified: false },
      { ...verifiedCompany(), roleState: 'REVOKED' },
      { ...verifiedCompany(), scopes: ['r_member_social'] },
      { ...verifiedCompany(), role: 'VIEWER' },
      { ...verifiedCompany(), verifiedOrganizationUrn: 'urn:li:organization:22' },
    ]) {
      const organization = access !== null && access.kind === 'organization';
      const f = finder({ enabled: true, resolveAccess: () => Promise.resolve(access) });
      await expect(
        f.provider.search(organization ? companyQuery : memberQuery, new AbortController().signal),
      ).rejects.toMatchObject({ kind: 'permission_required' });
      expect(f.fetch).not.toHaveBeenCalled();
    }
  });

  it('uses a fixed one-author official finder URL, versioned headers, and READER context', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(page([published('123')])));
    const { provider, resolveAccess } = finder({ enabled: true }, fetch);
    expect(provider.providerType).toBe('OFFICIAL_API');
    expect(provider.supportedKinds).toEqual(['author', 'company']);
    const result = await provider.search(memberQuery, new AbortController().signal);
    expect(resolveAccess).toHaveBeenCalledWith(member, expect.any(AbortSignal));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [rawUrl, request] = fetch.mock.calls[0]!;
    const url = requestUrl(rawUrl);
    expect(url.origin + url.pathname).toBe('https://api.linkedin.com/rest/posts');
    expect(url.searchParams.get('author')).toBe(member);
    expect(url.searchParams.get('q')).toBe('author');
    expect(url.searchParams.get('viewContext')).toBe('READER');
    expect(url.searchParams.get('count')).toBe('2');
    expect(url.searchParams.get('start')).toBe('0');
    expect(url.searchParams.get('sortBy')).toBe('CREATED');
    expect(request?.method).toBe('GET');
    expect(request?.headers).toMatchObject({
      Authorization: 'Bearer private-test-token',
      'Linkedin-Version': '202610',
      'X-Restli-Protocol-Version': '2.0.0',
      'X-RestLi-Method': 'FINDER',
    });
    expect(result.posts).toEqual([
      {
        id: 'urn:li:ugcPost:123',
        postUrn: 'urn:li:ugcPost:123',
        authorUrn: member,
        text: 'Post 123',
        publishedAt: '2025-01-01T00:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('private-test-token');
  });

  it('requires verified organization role and its own scope for company author reads', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json(page([published('123', company)], 0, 10)));
    const { provider } = finder(
      { enabled: true, resolveAccess: () => Promise.resolve(verifiedCompany()) },
      fetch,
    );
    const result = await provider.search(companyQuery, new AbortController().signal);
    expect(result.posts[0]).toMatchObject({ authorUrn: company });
    const [url] = fetch.mock.calls[0]!;
    expect(requestUrl(url).searchParams.get('author')).toBe(company);
  });

  it('never returns draft, private, or non-public published posts', async () => {
    const elements = [
      published('100'),
      { ...published('101'), lifecycleState: 'DRAFT' },
      { ...published('102'), visibility: 'CONNECTIONS' },
      { ...published('103'), visibility: 'PUBLIC', lifecycleState: 'PROCESSING' },
    ];
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(page(elements, 0, 10)));
    const { provider } = finder({ enabled: true }, fetch);
    const result = await provider.search(
      createPostSearchQuery({ kind: 'author', authorUrn: member, limit: 10 }),
      new AbortController().signal,
    );
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toMatchObject({ id: 'urn:li:ugcPost:100' });
  });

  it('rejects mismatched author, malformed URN, and invalid page bounds rather than leaking results', async () => {
    const bad = [
      page([published('123', 'urn:li:person:other')]),
      page([{ ...published('123'), id: 'https://example.test/untrusted' }]),
      page([published('123')], 999),
      page([published('123')], 0, 101),
      page(
        Array.from({ length: 101 }, (_, i) => published(String(i + 1))),
        0,
        100,
      ),
      { elements: [published('123')], paging: { start: 0, count: 2, links: 'untrusted' } },
    ];
    for (const invalid of bad) {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(invalid));
      const { provider } = finder({ enabled: true }, fetch);
      await expect(provider.search(memberQuery, new AbortController().signal)).rejects.toMatchObject({
        kind: 'failed',
      });
    }
  });

  it('continues bounded pagination when the provider advertises another page', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(page([published('100')], 0, 2, true)))
      .mockResolvedValueOnce(Response.json(page([published('101')], 2, 2)));
    const { provider } = finder({ enabled: true }, fetch);
    const response = await provider.search(memberQuery, new AbortController().signal);
    expect(response.posts).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requestUrl(fetch.mock.calls[1]![0]).searchParams.get('start')).toBe('2');
  });

  it('keeps paging past a full first page filtered out by date bounds', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json(
          page(
            [
              { ...published('100'), publishedAt: 1767225600000 },
              { ...published('101'), publishedAt: 1767139200000 },
            ],
            0,
            2,
            true,
          ),
        ),
      )
      .mockResolvedValueOnce(Response.json(page([published('102')], 2, 2)));
    const { provider } = finder({ enabled: true }, fetch);
    const query = createPostSearchQuery({
      kind: 'author',
      authorUrn: member,
      limit: 2,
      until: '2025-06-01T00:00:00.000Z',
    });
    const result = await createPostSearchService({ providers: [provider] }).search(query);
    expect(result).toMatchObject({ status: 'available', posts: [{ id: 'urn:li:ugcPost:102' }] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('counts distinct matching post identities before stopping pagination', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(page([published('100'), published('100')], 0, 2, true)))
      .mockResolvedValueOnce(Response.json(page([published('101')], 2, 2)));
    const { provider } = finder({ enabled: true }, fetch);
    const result = await createPostSearchService({ providers: [provider] }).search(memberQuery);
    expect(result).toMatchObject({
      status: 'available',
      posts: [{ id: 'urn:li:ugcPost:100' }, { id: 'urn:li:ugcPost:101' }],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('uses the validated provider next cursor, but never follows an untrusted next link', async () => {
    const first = page([published('100')], 0, 2, true);
    first.paging.links[0]!.href = first.paging.links[0]!.href.replace('start=2', 'start=5');
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(first))
      .mockResolvedValueOnce(Response.json(page([published('101')], 5, 2)));
    const { provider } = finder({ enabled: true }, fetch);
    const result = await provider.search(memberQuery, new AbortController().signal);
    expect(result.posts).toHaveLength(2);
    expect(requestUrl(fetch.mock.calls[1]![0]).searchParams.get('start')).toBe('5');

    const invalidLinks = [
      'https://evil.example/rest/posts?author=ignored&start=2',
      `/rest/posts?author=${encodeURIComponent('urn:li:person:other')}&q=author&viewContext=READER&sortBy=CREATED&count=2&start=2`,
      `/rest/posts?author=${encodeURIComponent(member)}&q=author&viewContext=READER&sortBy=CREATED&count=2&start=0`,
    ];
    for (const href of invalidLinks) {
      const invalid = page([], 0, 2, true);
      invalid.paging.links[0]!.href = href;
      const badFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(invalid));
      const f = finder({ enabled: true }, badFetch);
      await expect(f.provider.search(memberQuery, new AbortController().signal)).rejects.toMatchObject({
        kind: 'failed',
      });
      expect(badFetch).toHaveBeenCalledTimes(1);
    }
  });

  it('declines engagement filtering without evidenced provider engagement metrics', async () => {
    const { provider, fetch, resolveAccess } = finder({ enabled: true });
    const query = createPostSearchQuery({
      kind: 'author',
      authorUrn: member,
      minimumEngagement: 1,
    });
    await expect(provider.search(query, new AbortController().signal)).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(resolveAccess).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'permission_required'],
    [403, 'permission_required'],
    [429, 'rate_limited'],
    [500, 'failed'],
    [400, 'failed'],
    [404, 'failed'],
  ] as const)('maps HTTP %i to %s without exposing the body', async (status, kind) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('sensitive upstream details', { status }));
    const { provider } = finder({ enabled: true }, fetch);
    await expect(provider.search(memberQuery, new AbortController().signal)).rejects.toMatchObject({ kind });
  });

  it('fails closed for an oversized or malformed provider JSON body', async () => {
    for (const response of [
      new Response('x'.repeat(300_000)),
      new Response('{not-json'),
      Response.json({ elements: [], paging: { start: 0, count: 2, links: [] }, token: 'x'.repeat(300_000) }),
    ]) {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
      const { provider } = finder({ enabled: true }, fetch);
      await expect(provider.search(memberQuery, new AbortController().signal)).rejects.toMatchObject({
        kind: 'failed',
      });
    }
  });

  it('rejects malformed UTF-8 in JSON instead of silently replacing bytes', async () => {
    const data = Buffer.from(JSON.stringify(page([published('123')])));
    const offset = data.indexOf(Buffer.from('Post 123'));
    expect(offset).toBeGreaterThan(0);
    data[offset] = 0xff;
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(data));
    const { provider } = finder({ enabled: true }, fetch);
    await expect(provider.search(memberQuery, new AbortController().signal)).rejects.toMatchObject({
      kind: 'failed',
    });
  });

  it('fails on a network error or when advertised further pages exhaust the safe page budget', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('private-network-url'));
    const { provider } = finder({ enabled: true }, fetch);
    await expect(provider.search(memberQuery, new AbortController().signal)).rejects.toMatchObject({
      kind: 'failed',
    });
    const pages = vi.fn<typeof globalThis.fetch>().mockImplementation((url) => {
      const start = Number(requestUrl(url).searchParams.get('start'));
      return Promise.resolve(Response.json(page([], start, 2, true)));
    });
    const f = finder({ enabled: true }, pages);
    await expect(f.provider.search(memberQuery, new AbortController().signal)).rejects.toMatchObject({
      kind: 'failed',
    });
    expect(pages).toHaveBeenCalledTimes(3);
  });
});

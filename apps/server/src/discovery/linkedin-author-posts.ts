import { createPostSearchQuery, type PostSearchQuery } from '../../../../packages/core/dist/index.js';

import { DiscoveryProviderError, type DiscoveryProvider } from './post-search-service.js';

const POSTS_URL = 'https://api.linkedin.com/rest/posts';
const MAX_BODY_BYTES = 256 * 1024;
const MAX_PAGES = 3;
const PERSON_URN = /^urn:li:person:[a-zA-Z0-9_-]{1,128}$/;
const ORGANIZATION_URN = /^urn:li:organization:[0-9]+$/;
const POST_URN = /^urn:li:(?:share|ugcPost):[0-9]+$/;
const VALID_ROLES = new Set(['ADMINISTRATOR', 'DIRECT_SPONSORED_CONTENT_POSTER', 'CONTENT_ADMIN']);

/** The host resolver must independently verify an author ID / organization role for this credential.
 * An OAuth OIDC `sub` claim is not sufficient proof of a LinkedIn Posts author URN.
 */
export interface LinkedInAuthorPostsConfig {
  apiVersion: string;
  enabled?: boolean;
  resolveAccess?: (authorUrn: string, signal: AbortSignal) => Promise<unknown>;
}

interface LinkedInAuthorPostsDeps {
  fetch?: typeof globalThis.fetch;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function permittedAccess(value: unknown, authorUrn: string): string | null {
  const access = record(value);
  if (
    access === null ||
    typeof access.accessToken !== 'string' ||
    !access.accessToken.trim() ||
    !Array.isArray(access.scopes) ||
    !access.scopes.every((scope: unknown) => typeof scope === 'string')
  ) {
    return null;
  }
  if (PERSON_URN.test(authorUrn)) {
    if (
      access.kind !== 'member' ||
      access.identityVerified !== true ||
      access.verifiedPersonUrn !== authorUrn ||
      !access.scopes.includes('r_member_social')
    ) {
      return null;
    }
  } else if (ORGANIZATION_URN.test(authorUrn)) {
    if (
      access.kind !== 'organization' ||
      access.verifiedOrganizationUrn !== authorUrn ||
      access.roleVerified !== true ||
      access.roleState !== 'APPROVED' ||
      !VALID_ROLES.has(String(access.role)) ||
      !access.scopes.includes('r_organization_social')
    ) {
      return null;
    }
  } else {
    return null;
  }
  return access.accessToken;
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw new DiscoveryProviderError('failed');
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      for (;;) {
        if (signal.aborted) throw new DiscoveryProviderError('failed');
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) throw new DiscoveryProviderError('failed');
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
      if (size > MAX_BODY_BYTES) await response.body.cancel().catch(() => {});
    }
  } else {
    const text = await response.text();
    size = Buffer.byteLength(text, 'utf8');
    if (size > MAX_BODY_BYTES) throw new DiscoveryProviderError('failed');
    chunks.push(Buffer.from(text, 'utf8'));
  }
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)),
    ) as unknown;
  } catch {
    throw new DiscoveryProviderError('failed');
  }
}

function timestamp(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new DiscoveryProviderError('failed');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new DiscoveryProviderError('failed');
  return date.toISOString();
}

function mapElement(input: unknown, authorUrn: string): Record<string, unknown> | null {
  const item = record(input);
  if (!item || item.author !== authorUrn) {
    throw new DiscoveryProviderError('failed');
  }
  if (item.lifecycleState !== 'PUBLISHED' || item.visibility !== 'PUBLIC') {
    return null;
  }
  if (
    typeof item.id !== 'string' ||
    !POST_URN.test(item.id) ||
    (item.commentary !== undefined &&
      (typeof item.commentary !== 'string' || item.commentary.length > 30_000))
  ) {
    throw new DiscoveryProviderError('failed');
  }
  const publishedAt = timestamp(item.publishedAt);
  return {
    id: item.id,
    postUrn: item.id,
    authorUrn,
    text: item.commentary ?? '',
    ...(publishedAt === undefined ? {} : { publishedAt }),
  };
}

function verifiedNextStart(href: string, authorUrn: string, count: number, start: number): number {
  let next: URL;
  try {
    next = new URL(href, POSTS_URL);
  } catch {
    throw new DiscoveryProviderError('failed');
  }
  const params = next.searchParams;
  const keys = ['author', 'q', 'viewContext', 'sortBy', 'count', 'start'];
  const rawStart = params.get('start');
  const offset = rawStart !== null && /^\d+$/.test(rawStart) ? Number(rawStart) : NaN;
  if (
    next.origin !== 'https://api.linkedin.com' ||
    next.pathname !== '/rest/posts' ||
    next.username !== '' ||
    next.password !== '' ||
    next.hash !== '' ||
    params.size !== keys.length ||
    keys.some((key) => params.getAll(key).length !== 1) ||
    params.get('author') !== authorUrn ||
    params.get('q') !== 'author' ||
    params.get('viewContext') !== 'READER' ||
    params.get('sortBy') !== 'CREATED' ||
    params.get('count') !== String(count) ||
    !Number.isSafeInteger(offset) ||
    offset <= start ||
    offset > start + 100
  ) {
    throw new DiscoveryProviderError('failed');
  }
  return offset;
}

function parsePage(
  input: unknown,
  authorUrn: string,
  start: number,
  requestedCount: number,
): { posts: Record<string, unknown>[]; next: boolean; nextStart: number } {
  const page = record(input);
  const paging = record(page?.paging);
  if (
    !page ||
    !Array.isArray(page.elements) ||
    page.elements.length > 100 ||
    page.elements.length > requestedCount ||
    !paging ||
    paging.start !== start ||
    !Number.isSafeInteger(paging.count) ||
    (paging.count as number) < 1 ||
    (paging.count as number) > requestedCount ||
    page.elements.length > (paging.count as number) ||
    !Array.isArray(paging.links) ||
    paging.links.length > 20 ||
    !paging.links.every((link: unknown) => {
      const item = record(link);
      return item !== null && typeof item.rel === 'string' && typeof item.href === 'string';
    })
  ) {
    throw new DiscoveryProviderError('failed');
  }
  const posts = page.elements
    .map((element: unknown) => mapElement(element, authorUrn))
    .filter((post: Record<string, unknown> | null): post is Record<string, unknown> => post !== null);
  const nextLinks = (paging.links as { rel: string; href: string }[]).filter(
    (link) => link.rel.toLowerCase() === 'next',
  );
  if (nextLinks.length > 1) throw new DiscoveryProviderError('failed');
  return {
    posts,
    next: nextLinks.length === 1,
    nextStart:
      nextLinks.length === 1
        ? verifiedNextStart(nextLinks[0]!.href, authorUrn, requestedCount, start)
        : start + (paging.count as number),
  };
}

function matchesDateWindow(post: Record<string, unknown>, query: PostSearchQuery): boolean {
  if (query.since === undefined && query.until === undefined) return true;
  if (typeof post.publishedAt !== 'string') return false;
  if (query.since !== undefined && post.publishedAt < query.since) return false;
  if (query.until !== undefined && post.publishedAt > query.until) return false;
  return true;
}

/**
 * Optional official Posts finder. Fixed endpoint, one trusted verified author per request;
 * not a global topic, keyword, hashtag or recent-post search provider.
 */
export function createLinkedInAuthorPostsProvider(
  config: LinkedInAuthorPostsConfig,
  deps: LinkedInAuthorPostsDeps = {},
): DiscoveryProvider {
  if (
    !/^\d{4}(0[1-9]|1[0-2])$/.test(config.apiVersion) ||
    (config.resolveAccess !== undefined && typeof config.resolveAccess !== 'function')
  ) {
    throw new Error('Invalid official author finder configuration');
  }
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  return Object.freeze({
    providerId: 'linkedin-official-author-posts',
    providerType: 'OFFICIAL_API' as const,
    name: 'LinkedIn Posts API (restricted author finder)',
    supportedKinds: Object.freeze(['author', 'company'] as const),
    async search(query: PostSearchQuery, signal: AbortSignal): Promise<{ posts: readonly unknown[] }> {
      if (config.enabled !== true) throw new DiscoveryProviderError('unavailable');
      if (config.resolveAccess === undefined) throw new DiscoveryProviderError('unavailable');
      // Also protect direct adapter callers: the service validates inputs before routing,
      // but no public adapter method may turn malformed input into a provider request.
      query = createPostSearchQuery(query);
      // The finder does not return engagement totals. A successful zero-result
      // response would incorrectly suggest that the requested metric was searched.
      if (query.minimumEngagement !== undefined) throw new DiscoveryProviderError('unavailable');
      const authorUrn =
        query.kind === 'author' ? query.authorUrn : query.kind === 'company' ? query.organizationUrn : null;
      if (!authorUrn || signal.aborted) throw new DiscoveryProviderError('unavailable');
      let access: unknown;
      try {
        access = await config.resolveAccess(authorUrn, signal);
      } catch (error) {
        if (error instanceof DiscoveryProviderError) throw error;
        throw new DiscoveryProviderError('failed');
      }
      const token = permittedAccess(access, authorUrn);
      if (token === null) throw new DiscoveryProviderError('permission_required');

      const posts: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      let start = 0;
      for (let index = 0; index < MAX_PAGES; index++) {
        if (signal.aborted) throw new DiscoveryProviderError('failed');
        const url = new URL(POSTS_URL);
        url.searchParams.set('author', authorUrn);
        url.searchParams.set('q', 'author');
        url.searchParams.set('viewContext', 'READER');
        url.searchParams.set('start', String(start));
        url.searchParams.set('count', String(query.limit));
        url.searchParams.set('sortBy', 'CREATED');
        let response: Response;
        try {
          response = await fetchImpl(url.href, {
            method: 'GET',
            redirect: 'error',
            signal,
            headers: {
              Authorization: `Bearer ${token}`,
              'Linkedin-Version': config.apiVersion,
              'X-Restli-Protocol-Version': '2.0.0',
              'X-RestLi-Method': 'FINDER',
            },
          });
        } catch {
          throw new DiscoveryProviderError('failed');
        }
        if (response.status === 401 || response.status === 403) {
          throw new DiscoveryProviderError('permission_required');
        }
        if (response.status === 429) throw new DiscoveryProviderError('rate_limited');
        if (response.status !== 200) throw new DiscoveryProviderError('failed');
        const result = parsePage(await boundedJson(response, signal), authorUrn, start, query.limit);
        for (const post of result.posts) {
          if (!matchesDateWindow(post, query)) continue;
          const id = post.id as string;
          if (seen.has(id)) continue;
          seen.add(id);
          posts.push(post);
        }
        if (posts.length >= query.limit || !result.next) {
          return { posts: Object.freeze(posts.slice(0, query.limit)) };
        }
        if (result.nextStart <= start) throw new DiscoveryProviderError('failed');
        start = result.nextStart;
      }
      // Never report a complete empty discovery if the provider still advertises more pages.
      throw new DiscoveryProviderError('failed');
    },
  });
}

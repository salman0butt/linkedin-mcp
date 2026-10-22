import {
  createPostSearchQuery,
  normalizeDiscoveredPost,
  type NormalizedPost,
  type PostDiscoveryProviderType,
  type PostProviderOutcome,
  type PostSearchKind,
  type PostSearchQuery,
  type PostSearchResult,
} from '../../../../packages/core/dist/index.js';

import { filterDiscoveredPosts } from './post-search-filter.js';

export type DiscoveryProviderErrorKind = 'unavailable' | 'permission_required' | 'rate_limited' | 'failed';

export class DiscoveryProviderError extends Error {
  readonly kind: DiscoveryProviderErrorKind;

  constructor(kind: DiscoveryProviderErrorKind) {
    super(`Post discovery provider unavailable: ${kind}`);
    this.name = 'DiscoveryProviderError';
    this.kind = kind;
  }
}

export interface DiscoveryProvider {
  readonly providerId: string;
  readonly providerType: PostDiscoveryProviderType;
  readonly name: string;
  readonly supportedKinds: readonly PostSearchKind[];
  search(query: PostSearchQuery, signal: AbortSignal): Promise<{ posts: readonly unknown[] }>;
}

export interface PostSearchService {
  search(input: unknown): Promise<PostSearchResult>;
}

const maxProviderCount = 3;
const maxResponseItems = 100;
const maxResponseBytes = 256 * 1024;
const defaultTimeoutMs = 15_000;
const validTypes = new Set<PostDiscoveryProviderType>(['OFFICIAL_API', 'PARTNER_API', 'EXTERNAL_DISCOVERY']);
const validKinds = new Set<PostSearchKind>(['topic', 'hashtag', 'author', 'company', 'recent']);

function validateProviders(input: readonly DiscoveryProvider[]): readonly Readonly<DiscoveryProvider>[] {
  if (Object.prototype.toString.call(input) !== '[object Array]' || input.length > maxProviderCount) {
    throw new Error('Too many configured discovery providers');
  }
  const ids = new Set<string>();
  return Object.freeze(
    input.map((provider) => {
      if (
        provider === null ||
        typeof provider !== 'object' ||
        typeof provider.providerId !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(provider.providerId) ||
        ids.has(provider.providerId) ||
        typeof provider.name !== 'string' ||
        provider.name.trim().length === 0 ||
        provider.name.length > 100 ||
        !validTypes.has(provider.providerType) ||
        Object.prototype.toString.call(provider.supportedKinds) !== '[object Array]' ||
        provider.supportedKinds.length === 0 ||
        provider.supportedKinds.some((kind) => !validKinds.has(kind)) ||
        typeof provider.search !== 'function'
      ) {
        throw new Error('Invalid or duplicate trusted discovery provider');
      }
      ids.add(provider.providerId);
      return Object.freeze({ ...provider, supportedKinds: Object.freeze([...provider.supportedKinds]) });
    }),
  );
}

function errorKind(error: unknown): DiscoveryProviderErrorKind {
  if (error instanceof DiscoveryProviderError) return error.kind;
  return 'failed';
}

function aggregateError(outcomes: readonly PostProviderOutcome[]): DiscoveryProviderErrorKind {
  const kinds = outcomes.map((outcome) => outcome.state);
  if (kinds.includes('permission_required')) return 'permission_required';
  if (kinds.includes('rate_limited')) return 'rate_limited';
  if (kinds.includes('failed')) return 'failed';
  return 'unavailable';
}

function sourceOutcome(
  provider: DiscoveryProvider,
  state: PostProviderOutcome['state'],
  consulted: boolean,
): PostProviderOutcome {
  return Object.freeze({
    providerId: provider.providerId,
    providerType: provider.providerType,
    state,
    consulted,
  });
}

async function fetchProvider(
  provider: DiscoveryProvider,
  query: PostSearchQuery,
  now: () => Date,
  timeoutMs: number,
): Promise<{ outcome: PostProviderOutcome; posts: readonly NormalizedPost[] }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      provider.search(query, controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new DiscoveryProviderError('failed'));
        }, timeoutMs);
      }),
    ]);
    if (
      response === null ||
      typeof response !== 'object' ||
      !Array.isArray(response.posts) ||
      response.posts.length > maxResponseItems ||
      Buffer.byteLength(JSON.stringify(response), 'utf8') > maxResponseBytes
    ) {
      throw new DiscoveryProviderError('failed');
    }
    const retrievedAt = now().toISOString();
    const context = {
      providerId: provider.providerId,
      providerType: provider.providerType,
      name: provider.name,
      retrievedAt,
    } as const;
    const posts = response.posts.map((item: unknown) => normalizeDiscoveredPost(item, context));
    return { outcome: sourceOutcome(provider, 'success', true), posts };
  } catch (error) {
    controller.abort();
    return { outcome: sourceOutcome(provider, errorKind(error), true), posts: [] };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Strict read-only orchestration; provider instances and metadata must come from trusted host wiring. */
export function createPostSearchService(options: {
  providers: readonly DiscoveryProvider[];
  now?: () => Date;
  timeoutMs?: number;
}): PostSearchService {
  const providers = validateProviders(options.providers);
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30_000) {
    throw new Error('Invalid discovery timeout');
  }
  return {
    async search(input: unknown): Promise<PostSearchResult> {
      const query = createPostSearchQuery(input);
      const selected = providers.filter((provider) => provider.supportedKinds.includes(query.kind));
      const skipped = providers.filter((provider) => !provider.supportedKinds.includes(query.kind));
      const skippedOutcomes = skipped.map((provider) => sourceOutcome(provider, 'unavailable', false));
      if (selected.length === 0) {
        return Object.freeze({
          status: 'unavailable',
          query,
          providerOutcomes: Object.freeze(skippedOutcomes),
        });
      }
      const settled = await Promise.all(
        selected.map((provider) => fetchProvider(provider, query, now, timeoutMs)),
      );
      // Preserve configured order even when requests finish in an unexpected order.
      const results = new Map(selected.map((provider, index) => [provider.providerId, settled[index]!]));
      const providerOutcomes = Object.freeze(
        providers.map(
          (provider) =>
            results.get(provider.providerId)?.outcome ?? sourceOutcome(provider, 'unavailable', false),
        ),
      );
      const succeeded = settled.filter(({ outcome }) => outcome.state === 'success');
      if (succeeded.length === 0) {
        return Object.freeze({
          status: aggregateError(settled.map(({ outcome }) => outcome)),
          query,
          providerOutcomes,
        });
      }
      const posts = filterDiscoveredPosts(
        succeeded.flatMap(({ posts: values }) => values),
        query,
      );
      const status = succeeded.length === selected.length ? 'available' : 'partial';
      return Object.freeze({ status, query, posts, providerOutcomes });
    },
  };
}

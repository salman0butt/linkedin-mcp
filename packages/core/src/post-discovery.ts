/** Canonical local contracts. No remote search or provider claims are made here. */
export type PostSearchKind = 'topic' | 'hashtag' | 'author' | 'company' | 'recent';
export type PostDiscoveryProviderType = 'OFFICIAL_API' | 'PARTNER_API' | 'EXTERNAL_DISCOVERY';

export type PostSearchQuery = Readonly<
  (
    | { kind: 'topic' | 'hashtag'; term: string }
    | { kind: 'author'; authorUrn: string }
    | { kind: 'company'; organizationUrn: string }
    | { kind: 'recent' }
  ) & {
    limit: number;
    since?: string;
    until?: string;
    minimumEngagement?: number;
  }
>;

export interface TrustedDiscoveryContext {
  providerId: string;
  providerType: PostDiscoveryProviderType;
  name: string;
  retrievedAt: string;
  evidenceUrl?: string;
  /** Confidence may only be supplied by the trusted adapter, never raw results. */
  confidence?: number;
}

export interface PostSource {
  provider: PostDiscoveryProviderType;
  id: string;
  name: string;
  retrievedAt: string;
  evidenceUrl?: string;
}

export interface NormalizedPost {
  id: string;
  text: string;
  source: Readonly<PostSource>;
  postUrn?: string;
  canonicalUrl?: string;
  authorUrn?: string;
  publishedAt?: string;
  likes?: number;
  comments?: number;
  confidence?: number;
}

export type PostSearchResult =
  | {
      status: 'available' | 'partial';
      query: PostSearchQuery;
      posts: readonly NormalizedPost[];
      providerOutcomes: readonly PostProviderOutcome[];
    }
  | {
      status: 'unavailable' | 'permission_required' | 'rate_limited' | 'failed';
      query: PostSearchQuery;
      providerOutcomes: readonly PostProviderOutcome[];
    };

export interface PostProviderOutcome {
  providerId: string;
  providerType: PostDiscoveryProviderType;
  state: 'success' | 'unavailable' | 'permission_required' | 'rate_limited' | 'failed';
  consulted: boolean;
}

const modes = ['topic', 'hashtag', 'author', 'company', 'recent'] as const;
const providers = ['OFFICIAL_API', 'PARTNER_API', 'EXTERNAL_DISCOVERY'] as const;
const personUrn = /^urn:li:person:[a-zA-Z0-9_-]{1,128}$/;
const organizationUrn = /^urn:li:organization:[0-9]+$/;
const postUrn = /^urn:li:(?:share|ugcPost|activity):[0-9]+$/;
const isoUtc = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/;

function object(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected an object');
  }
  return input as Record<string, unknown>;
}

function strictKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new Error('Unsupported post discovery field');
  }
}

function nonempty(input: unknown, label: string, length: number): string {
  if (typeof input !== 'string') throw new Error(`Invalid ${label}`);
  const value = input.trim();
  if (!value || value.length > length) throw new Error(`Invalid ${label}`);
  return value;
}

function utcInstant(input: unknown): string {
  if (typeof input !== 'string' || !isoUtc.test(input)) throw new Error('Invalid UTC instant');
  const date = new Date(input);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.slice(0, 10)) {
    throw new Error('Invalid calendar date');
  }
  return date.toISOString();
}

function integer(input: unknown, min: number, max: number, label: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < min || input > max) {
    throw new Error(`Invalid ${label}`);
  }
  return input;
}

function link(input: unknown): string {
  const raw = nonempty(input, 'canonicalUrl', 2048);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid canonicalUrl');
  }
  if (
    url.protocol !== 'https:' ||
    (url.hostname !== 'linkedin.com' && url.hostname !== 'www.linkedin.com') ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== ''
  ) {
    throw new Error('Untrusted canonicalUrl');
  }
  return url.href;
}

export function createPostSearchQuery(input: unknown): PostSearchQuery {
  const value = object(input);
  const kind = value.kind;
  if (!modes.includes(kind as PostSearchKind)) throw new Error('Unsupported post search mode');
  const limit = value.limit === undefined ? 10 : integer(value.limit, 1, 50, 'limit');
  const sharedKeys = ['kind', 'limit', 'since', 'until', 'minimumEngagement'];
  const shared: { limit: number; since?: string; until?: string; minimumEngagement?: number } = { limit };
  if (value.since !== undefined) shared.since = utcInstant(value.since);
  if (value.until !== undefined) shared.until = utcInstant(value.until);
  if (shared.since !== undefined && shared.until !== undefined && shared.since > shared.until) {
    throw new Error('Post search date interval is reversed');
  }
  if (value.minimumEngagement !== undefined) {
    shared.minimumEngagement = integer(value.minimumEngagement, 0, Number.MAX_SAFE_INTEGER, 'engagement');
  }
  switch (kind) {
    case 'topic':
    case 'hashtag': {
      strictKeys(value, [...sharedKeys, 'term']);
      const raw = nonempty(value.term, 'term', 101);
      const term = kind === 'hashtag' ? raw.replace(/^#/, '') : raw;
      if (!term || term.length > 100) throw new Error('Invalid term');
      return Object.freeze({ kind, term, ...shared });
    }
    case 'author': {
      strictKeys(value, [...sharedKeys, 'authorUrn']);
      const authorUrn = nonempty(value.authorUrn, 'authorUrn', 160);
      if (!personUrn.test(authorUrn)) throw new Error('Invalid authorUrn');
      return Object.freeze({ kind, authorUrn, ...shared });
    }
    case 'company': {
      strictKeys(value, [...sharedKeys, 'organizationUrn']);
      const organizationUrnValue = nonempty(value.organizationUrn, 'organizationUrn', 160);
      if (!organizationUrn.test(organizationUrnValue)) throw new Error('Invalid organizationUrn');
      return Object.freeze({ kind, organizationUrn: organizationUrnValue, ...shared });
    }
    case 'recent':
      strictKeys(value, sharedKeys);
      return Object.freeze({ kind, ...shared });
    default:
      throw new Error('Unsupported post search mode');
  }
}

export function normalizeDiscoveredPost(input: unknown, context: TrustedDiscoveryContext): NormalizedPost {
  const value = object(input);
  const providerContext = object(context);
  const providerId = nonempty(providerContext.providerId, 'provider ID', 100);
  const name = nonempty(providerContext.name, 'provider name', 100);
  const type = providerContext.providerType;
  if (!providers.includes(type as PostDiscoveryProviderType)) throw new Error('Unsupported provider');
  const retrievedAt = utcInstant(providerContext.retrievedAt);
  const source: PostSource = {
    provider: type as PostDiscoveryProviderType,
    id: providerId,
    name,
    retrievedAt,
  };
  if (providerContext.evidenceUrl !== undefined) source.evidenceUrl = link(providerContext.evidenceUrl);
  const id = nonempty(value.id, 'post id', 256);
  if (typeof value.text !== 'string' || value.text.length > 30_000) throw new Error('Invalid post text');
  const post: NormalizedPost = { id, text: value.text, source: Object.freeze(source) };
  if (value.postUrn !== undefined) {
    const urn = nonempty(value.postUrn, 'postUrn', 160);
    if (!postUrn.test(urn)) throw new Error('Invalid postUrn');
    post.postUrn = urn;
  }
  if (value.canonicalUrl !== undefined) post.canonicalUrl = link(value.canonicalUrl);
  if (value.authorUrn !== undefined) {
    const authorUrn = nonempty(value.authorUrn, 'authorUrn', 160);
    if (!personUrn.test(authorUrn) && !organizationUrn.test(authorUrn)) {
      throw new Error('Invalid authorUrn');
    }
    post.authorUrn = authorUrn;
  }
  if (value.publishedAt !== undefined) post.publishedAt = utcInstant(value.publishedAt);
  if (value.likes !== undefined) post.likes = integer(value.likes, 0, Number.MAX_SAFE_INTEGER, 'likes');
  if (value.comments !== undefined) {
    post.comments = integer(value.comments, 0, Number.MAX_SAFE_INTEGER, 'comments');
  }
  if (providerContext.confidence !== undefined) {
    const confidence = providerContext.confidence;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('Invalid trusted confidence');
    }
    post.confidence = confidence;
  }
  return Object.freeze(post);
}

/** Canonical job discovery contracts. No search provider or Talent access is implied. */
export type JobProviderType = 'EXTERNAL_DISCOVERY' | 'PARTNER_API';
export type JobWorkplace = 'remote' | 'hybrid' | 'on_site';
export type JobEmploymentType = 'full_time' | 'part_time' | 'contract' | 'temporary' | 'internship';
export type JobSort = 'recent' | 'relevance';

export type JobSearchQuery = Readonly<{
  keywords: string;
  location?: string;
  workplace?: JobWorkplace;
  employmentType?: JobEmploymentType;
  postedSince?: string;
  limit: number;
  sort: JobSort;
}>;

export interface VerifiedPostingDateInput {
  providerId: string;
  jobId: string;
  postedAt: string;
  checkedAt: string;
  verifiedBy: string;
  method: 'direct_employer_listing' | 'official_posting_api' | 'trusted_independent_audit';
  evidenceUrl: string;
  canonicalUrl?: string;
}

export interface TrustedJobContext {
  providerId: string;
  providerType: JobProviderType;
  name: string;
  retrievedAt: string;
  evidenceUrl?: string;
  confidence?: number;
  /** This trusted host-owned per-record attestation must be bound to job identity. */
  verifiedPostingDate?: VerifiedPostingDateInput;
}

export type PostingDateEvidence =
  | Readonly<{ state: 'unknown' }>
  | Readonly<{ state: 'reported'; postedAt: string; sourceClaim: 'provider_reported' }>
  | Readonly<{
      state: 'verified';
      postedAt: string;
      checkedAt: string;
      verifiedBy: string;
      method: VerifiedPostingDateInput['method'];
      evidenceUrl: string;
    }>;

export interface JobSource {
  provider: JobProviderType;
  id: string;
  name: string;
  retrievedAt: string;
  evidenceUrl?: string;
}

export interface JobSalary {
  min: number;
  max: number;
  currency: string;
  period: 'hour' | 'month' | 'year';
}

export interface NormalizedJob {
  id: string;
  title: string;
  companyName: string;
  source: Readonly<JobSource>;
  postingDate: PostingDateEvidence;
  description?: string;
  location?: string;
  workplace?: JobWorkplace;
  employmentType?: JobEmploymentType;
  canonicalUrl?: string;
  salary?: Readonly<JobSalary>;
  confidence?: number;
}

const isoUtc = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/;
const workplaceValues = new Set<JobWorkplace>(['remote', 'hybrid', 'on_site']);
const employmentValues = new Set<JobEmploymentType>([
  'full_time',
  'part_time',
  'contract',
  'temporary',
  'internship',
]);
const verificationMethods = new Set<VerifiedPostingDateInput['method']>([
  'direct_employer_listing',
  'official_posting_api',
  'trusted_independent_audit',
]);

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected object');
  }
  return value as Record<string, unknown>;
}

function trimmed(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${label}`);
  const result = value.trim();
  if (result.length === 0 || result.length > maxLength) throw new Error(`Invalid ${label}`);
  return result;
}

function utcInstant(value: unknown): string {
  if (typeof value !== 'string' || !isoUtc.test(value)) throw new Error('Invalid UTC timestamp');
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw new Error('Invalid calendar date');
  }
  return date.toISOString();
}

function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error('Invalid integer');
  }
  return value;
}

function publicUrl(value: unknown): string {
  const raw = trimmed(value, 'public HTTPS URL', 2048);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid public HTTPS URL');
  }
  const host = url.hostname.toLowerCase();
  // Deliberately require a public DNS hostname. Every IPv4/IPv6 literal,
  // including alternative numeric spellings and IPv4-mapped IPv6, is excluded.
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.hash !== '' ||
    !/^[a-z0-9.-]+$/.test(host) ||
    !host.includes('.') ||
    host.startsWith('.') ||
    host.endsWith('.') ||
    host.split('.').some((part) => part === '') ||
    // Known wildcard DNS services can encode a private IP in a DNS-looking
    // hostname. This is a local syntactic guard, not a DNS/public-IP guarantee.
    /(?:^|\.)(?:nip\.io|sslip\.io|localtest\.me)$/.test(host) ||
    /^\d+(?:\.\d+){3}$/.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host) ||
    /^(?:127|10|0|169|172|192|198|224|255)\./.test(host) ||
    [...url.searchParams.keys()].some((key) =>
      /(?:token|apikey|authorization|auth|password|passwd|secret|session|signature|sig|credential|bearer|jwt|privatekey|accesskey)/.test(
        key.toLowerCase().replace(/[^a-z0-9]/g, ''),
      ),
    )
  ) {
    throw new Error('Untrusted public job URL');
  }
  return url.href;
}

export function createJobSearchQuery(input: unknown): JobSearchQuery {
  const value = record(input);
  const allowed = ['keywords', 'location', 'workplace', 'employmentType', 'postedSince', 'limit', 'sort'];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error('Unsupported job search field');
  }
  const keywords = trimmed(value.keywords, 'keywords', 120);
  const query: {
    keywords: string;
    location?: string;
    workplace?: JobWorkplace;
    employmentType?: JobEmploymentType;
    postedSince?: string;
    limit: number;
    sort: JobSort;
  } = {
    keywords,
    limit: value.limit === undefined ? 10 : integer(value.limit, 1, 50),
    sort:
      value.sort === undefined
        ? 'recent'
        : value.sort === 'recent' || value.sort === 'relevance'
          ? value.sort
          : (() => {
              throw new Error('Invalid sort');
            })(),
  };
  if (value.location !== undefined) query.location = trimmed(value.location, 'location', 120);
  if (value.workplace !== undefined) {
    if (!workplaceValues.has(value.workplace as JobWorkplace)) throw new Error('Invalid workplace');
    query.workplace = value.workplace as JobWorkplace;
  }
  if (value.employmentType !== undefined) {
    if (!employmentValues.has(value.employmentType as JobEmploymentType)) {
      throw new Error('Invalid employment type');
    }
    query.employmentType = value.employmentType as JobEmploymentType;
  }
  if (value.postedSince !== undefined) query.postedSince = utcInstant(value.postedSince);
  return Object.freeze(query);
}

function normalizeSalary(input: unknown): Readonly<JobSalary> {
  const value = record(input);
  if (Object.keys(value).some((key) => !['min', 'max', 'currency', 'period'].includes(key))) {
    throw new Error('Invalid salary');
  }
  const min = integer(value.min, 0, Number.MAX_SAFE_INTEGER);
  const max = integer(value.max, min, Number.MAX_SAFE_INTEGER);
  const currency = trimmed(value.currency, 'salary currency', 3);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid ISO salary currency');
  if (value.period !== 'hour' && value.period !== 'month' && value.period !== 'year') {
    throw new Error('Invalid salary period');
  }
  return Object.freeze({ min, max, currency, period: value.period });
}

function normalizePostingDate(
  rawPostedAt: unknown,
  source: TrustedJobContext,
  id: string,
  canonicalUrl?: string,
): PostingDateEvidence {
  const reported = rawPostedAt === undefined ? undefined : utcInstant(rawPostedAt);
  if (source.verifiedPostingDate === undefined) {
    return Object.freeze(
      reported === undefined
        ? ({ state: 'unknown' } as const)
        : ({ state: 'reported', postedAt: reported, sourceClaim: 'provider_reported' } as const),
    );
  }
  const attestation = record(source.verifiedPostingDate);
  const postedAt = utcInstant(attestation.postedAt);
  const checkedAt = utcInstant(attestation.checkedAt);
  const retrievedAt = utcInstant(source.retrievedAt);
  if (
    attestation.providerId !== source.providerId ||
    attestation.jobId !== id ||
    ((canonicalUrl !== undefined || attestation.canonicalUrl !== undefined) &&
      (attestation.canonicalUrl === undefined || publicUrl(attestation.canonicalUrl) !== canonicalUrl)) ||
    (reported !== undefined && reported !== postedAt) ||
    postedAt > checkedAt ||
    checkedAt > retrievedAt ||
    !verificationMethods.has(attestation.method as VerifiedPostingDateInput['method'])
  ) {
    throw new Error('Invalid trusted job date attestation');
  }
  const verifiedBy = trimmed(attestation.verifiedBy, 'verifier', 120);
  const evidenceUrl = publicUrl(attestation.evidenceUrl);
  return Object.freeze({
    state: 'verified',
    postedAt,
    checkedAt,
    verifiedBy,
    method: attestation.method as VerifiedPostingDateInput['method'],
    evidenceUrl,
  });
}

export function normalizeDiscoveredJob(
  input: unknown,
  trustedContext: TrustedJobContext,
): Readonly<NormalizedJob> {
  const value = record(input);
  const ctx = record(trustedContext);
  const providerId = trimmed(ctx.providerId, 'provider ID', 100);
  const name = trimmed(ctx.name, 'provider name', 100);
  if (ctx.providerType !== 'PARTNER_API' && ctx.providerType !== 'EXTERNAL_DISCOVERY') {
    throw new Error('Untrusted job provider type');
  }
  const retrievedAt = utcInstant(ctx.retrievedAt);
  const source: JobSource = {
    provider: ctx.providerType,
    id: providerId,
    name,
    retrievedAt,
  };
  if (ctx.evidenceUrl !== undefined) source.evidenceUrl = publicUrl(ctx.evidenceUrl);
  const id = trimmed(value.id, 'job ID', 256);
  const title = trimmed(value.title, 'job title', 300);
  const companyName = trimmed(value.companyName, 'company name', 300);
  const canonicalUrl = value.canonicalUrl === undefined ? undefined : publicUrl(value.canonicalUrl);
  const postingDate = normalizePostingDate(value.postedAt, trustedContext, id, canonicalUrl);
  const result: NormalizedJob = {
    id,
    title,
    companyName,
    source: Object.freeze(source),
    postingDate,
  };
  if (value.description !== undefined) {
    if (typeof value.description !== 'string' || value.description.length > 20_000) {
      throw new Error('Invalid job description');
    }
    result.description = value.description;
  }
  if (value.location !== undefined) result.location = trimmed(value.location, 'job location', 300);
  if (value.workplace !== undefined) {
    if (!workplaceValues.has(value.workplace as JobWorkplace)) throw new Error('Invalid job workplace');
    result.workplace = value.workplace as JobWorkplace;
  }
  if (value.employmentType !== undefined) {
    if (!employmentValues.has(value.employmentType as JobEmploymentType)) {
      throw new Error('Invalid job employment type');
    }
    result.employmentType = value.employmentType as JobEmploymentType;
  }
  if (canonicalUrl !== undefined) result.canonicalUrl = canonicalUrl;
  if (value.salary !== undefined) result.salary = normalizeSalary(value.salary);
  if (ctx.confidence !== undefined) {
    if (
      typeof ctx.confidence !== 'number' ||
      !Number.isFinite(ctx.confidence) ||
      ctx.confidence < 0 ||
      ctx.confidence > 1
    ) {
      throw new Error('Invalid trusted job confidence');
    }
    result.confidence = ctx.confidence;
  }
  return Object.freeze(result);
}

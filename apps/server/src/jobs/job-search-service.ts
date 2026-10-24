import {
  createJobSearchQuery,
  normalizeDiscoveredJob,
  type JobProviderType,
  type JobSearchQuery,
  type NormalizedJob,
  type TrustedJobContext,
  type VerifiedPostingDateInput,
} from '../../../../packages/core/dist/index.js';

import { filterDiscoveredJobs, type JobFreshnessCoverage } from './job-search-filter.js';

export type JobProviderErrorKind = 'unavailable' | 'permission_required' | 'rate_limited' | 'failed';
export type JobProviderState = 'success' | JobProviderErrorKind;
export type JobSearchStatus = 'available' | 'partial' | JobProviderErrorKind;
export type JobFilterKey = 'keywords' | 'location' | 'workplace' | 'employmentType' | 'postedSince';

export class JobProviderError extends Error {
  readonly kind: JobProviderErrorKind;
  constructor(kind: JobProviderErrorKind) {
    super(`Job provider unavailable: ${kind}`);
    this.name = 'JobProviderError';
    this.kind = kind;
  }
}

/** Return fields must be assembled by a trusted host-injected adapter, not raw upstream JSON. */
export interface JobProviderCoverage {
  readonly complete: boolean;
  readonly hasMore: boolean;
  readonly honoredFilters: readonly JobFilterKey[];
  readonly honoredSort: JobSearchQuery['sort'] | null;
  readonly verifiedDateCoverage: boolean;
}

export interface JobProvider {
  readonly providerId: string;
  readonly providerType: JobProviderType;
  readonly name: string;
  readonly supportsSearch: boolean;
  readonly supportsDetails: boolean;
  search(
    query: JobSearchQuery,
    signal: AbortSignal,
  ): Promise<{
    jobs: readonly unknown[];
    coverage: JobProviderCoverage;
    verifiedPostingDates?: readonly VerifiedPostingDateInput[];
  }>;
  getDetails?(jobId: string, signal: AbortSignal): Promise<unknown>;
}

export interface JobProviderOutcome {
  readonly providerId: string;
  readonly providerType: JobProviderType;
  readonly state: JobProviderState;
  readonly consulted: boolean;
  readonly coverage?: Readonly<JobProviderCoverage>;
}

export type JobSearchResult = Readonly<{
  status: JobSearchStatus;
  query: JobSearchQuery;
  providerOutcomes: readonly JobProviderOutcome[];
  jobs?: readonly Readonly<NormalizedJob>[];
  freshnessCoverage?: Readonly<JobFreshnessCoverage & { providerCoverage: readonly JobProviderOutcome[] }>;
}>;

export interface JobRef {
  readonly sourceId: string;
  readonly jobId: string;
}
export type JobDetailResult = Readonly<{
  status: 'available' | JobProviderErrorKind;
  job?: Readonly<NormalizedJob>;
  sourceId?: string;
}>;
export interface JobSearchService {
  search(input: unknown): Promise<JobSearchResult>;
  getDetails(input: unknown): Promise<JobDetailResult>;
}

const maxProviders = 3;
const maxItems = 200;
const maxBytes = 256 * 1024;
const filterKeys = new Set<JobFilterKey>([
  'keywords',
  'location',
  'workplace',
  'employmentType',
  'postedSince',
]);

function validateProviders(input: readonly JobProvider[]): readonly Readonly<JobProvider>[] {
  if (Object.prototype.toString.call(input) !== '[object Array]' || input.length > maxProviders) {
    throw new Error('Invalid configured job provider count');
  }
  const ids = new Set<string>();
  return Object.freeze(
    input.map((item) => {
      if (
        item === null ||
        typeof item !== 'object' ||
        typeof item.providerId !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(item.providerId) ||
        ids.has(item.providerId) ||
        typeof item.name !== 'string' ||
        !item.name.trim() ||
        item.name.length > 100 ||
        (item.providerType !== 'PARTNER_API' && item.providerType !== 'EXTERNAL_DISCOVERY') ||
        typeof item.supportsSearch !== 'boolean' ||
        typeof item.supportsDetails !== 'boolean' ||
        typeof item.search !== 'function' ||
        (item.supportsDetails && typeof item.getDetails !== 'function')
      )
        throw new Error('Invalid or duplicate trusted job provider');
      ids.add(item.providerId);
      return Object.freeze({
        providerId: item.providerId,
        providerType: item.providerType,
        name: item.name,
        supportsSearch: item.supportsSearch,
        supportsDetails: item.supportsDetails,
        search: item.search.bind(item),
        ...(item.getDetails === undefined ? {} : { getDetails: item.getDetails.bind(item) }),
      });
    }),
  );
}

function outcome(
  provider: JobProvider,
  state: JobProviderState,
  consulted: boolean,
  coverage?: JobProviderCoverage,
): JobProviderOutcome {
  return Object.freeze({
    providerId: provider.providerId,
    providerType: provider.providerType,
    state,
    consulted,
    ...(coverage === undefined ? {} : { coverage }),
  });
}
function errorKind(error: unknown): JobProviderErrorKind {
  return error instanceof JobProviderError ? error.kind : 'failed';
}
function precedence(outcomes: readonly JobProviderOutcome[]): JobProviderErrorKind {
  const states = outcomes.map((o) => o.state);
  if (states.includes('permission_required')) return 'permission_required';
  if (states.includes('rate_limited')) return 'rate_limited';
  if (states.includes('failed')) return 'failed';
  return 'unavailable';
}
function validateCoverage(input: JobProviderCoverage): JobProviderCoverage {
  if (
    input === null ||
    typeof input !== 'object' ||
    typeof input.complete !== 'boolean' ||
    typeof input.hasMore !== 'boolean' ||
    typeof input.verifiedDateCoverage !== 'boolean' ||
    (input.complete && input.hasMore) ||
    (input.honoredSort !== null && input.honoredSort !== 'recent' && input.honoredSort !== 'relevance') ||
    Object.prototype.toString.call(input.honoredFilters) !== '[object Array]' ||
    input.honoredFilters.length > 5 ||
    input.honoredFilters.some((key) => !filterKeys.has(key)) ||
    new Set(input.honoredFilters).size !== input.honoredFilters.length
  )
    throw new Error('Untrusted job coverage');
  // The adapter is trusted to attest coverage, but never to add arbitrary
  // fields to client-visible results (including accidentally forwarded secrets).
  return Object.freeze({
    complete: input.complete,
    hasMore: input.hasMore,
    honoredFilters: Object.freeze([...input.honoredFilters]),
    honoredSort: input.honoredSort,
    verifiedDateCoverage: input.verifiedDateCoverage,
  });
}
function demanded(query: JobSearchQuery): JobFilterKey[] {
  return (['keywords', 'location', 'workplace', 'employmentType', 'postedSince'] as const).filter(
    (key) => key === 'keywords' || query[key] !== undefined,
  );
}
function fullyCovered(
  coverage: JobProviderCoverage,
  query: JobSearchQuery,
  jobs: readonly Readonly<NormalizedJob>[],
): boolean {
  return (
    coverage.complete &&
    !coverage.hasMore &&
    demanded(query).every((key) => coverage.honoredFilters.includes(key)) &&
    (coverage.honoredSort === query.sort ||
      (query.sort === 'recent' &&
        coverage.honoredSort === null &&
        jobs.every((job) => job.postingDate.state === 'verified'))) &&
    (query.postedSince === undefined || coverage.verifiedDateCoverage)
  );
}

async function bounded<T>(call: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => call(controller.signal)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new JobProviderError('failed'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    controller.abort();
    if (timer !== undefined) clearTimeout(timer);
  }
}

function ensureResponseSize(input: unknown, maxCount?: number): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw new JobProviderError('failed');
  }
  if (
    typeof serialized !== 'string' ||
    Buffer.byteLength(serialized, 'utf8') > maxBytes ||
    (maxCount !== undefined && maxCount > maxItems)
  ) {
    throw new JobProviderError('failed');
  }
}

async function fetchSearch(
  provider: JobProvider,
  query: JobSearchQuery,
  now: () => Date,
  timeoutMs: number,
): Promise<{ outcome: JobProviderOutcome; jobs: readonly Readonly<NormalizedJob>[] }> {
  try {
    const response = await bounded((signal) => provider.search(query, signal), timeoutMs);
    if (
      response === null ||
      typeof response !== 'object' ||
      Object.prototype.toString.call(response.jobs) !== '[object Array]' ||
      response.jobs.length > maxItems
    )
      throw new Error('Invalid job source data');
    ensureResponseSize(response, response.jobs.length);
    const coverage = validateCoverage(response.coverage);
    const retrievedAt = now().toISOString();
    const trustedEvidence = new Map<string, VerifiedPostingDateInput>();
    if (response.verifiedPostingDates !== undefined) {
      if (
        Object.prototype.toString.call(response.verifiedPostingDates) !== '[object Array]' ||
        response.verifiedPostingDates.length > maxItems
      )
        throw new Error('Invalid job date evidence');
      for (const record of response.verifiedPostingDates) {
        if (
          !record ||
          typeof record.jobId !== 'string' ||
          trustedEvidence.has(record.jobId) ||
          record.providerId !== provider.providerId
        )
          throw new Error('Conflicting trusted date evidence');
        trustedEvidence.set(record.jobId, record);
      }
    }
    const jobs = response.jobs.map((raw) => {
      const id =
        raw !== null && typeof raw === 'object' && !Array.isArray(raw) && 'id' in raw ? raw.id : undefined;
      const context: TrustedJobContext = {
        providerId: provider.providerId,
        providerType: provider.providerType,
        name: provider.name,
        retrievedAt,
      };
      if (typeof id === 'string') {
        const verifiedPostingDate = trustedEvidence.get(id);
        if (verifiedPostingDate !== undefined) context.verifiedPostingDate = verifiedPostingDate;
      }
      return normalizeDiscoveredJob(raw, context);
    });
    // Raw objects can define toJSON() to disguise large actual fields during
    // the first size check. Recheck plain normalized data before returning it.
    ensureResponseSize(jobs);
    if (trustedEvidence.size > 0) {
      const ids = new Set(jobs.map((item) => item.id));
      if ([...trustedEvidence.keys()].some((id) => !ids.has(id)))
        throw new Error('Unmatched trusted date evidence');
    }
    return { outcome: outcome(provider, 'success', true, coverage), jobs };
  } catch (error) {
    return { outcome: outcome(provider, errorKind(error), true), jobs: [] };
  }
}

function jobRef(input: unknown): JobRef {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid job ref');
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).sort().join(',') !== 'jobId,sourceId' ||
    typeof value.sourceId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value.sourceId) ||
    typeof value.jobId !== 'string' ||
    value.jobId.trim() !== value.jobId ||
    value.jobId.length < 1 ||
    value.jobId.length > 256
  ) {
    throw new Error('Invalid source-scoped job ref');
  }
  return { sourceId: value.sourceId, jobId: value.jobId };
}

export function createJobSearchService(options: {
  providers: readonly JobProvider[];
  now?: () => Date;
  timeoutMs?: number;
}): JobSearchService {
  const providers = validateProviders(options.providers);
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30_000) {
    throw new Error('Invalid job provider timeout');
  }
  return {
    async search(input: unknown): Promise<JobSearchResult> {
      const query = createJobSearchQuery(input); // reject caller-controlled endpoint before effects
      const selected = providers.filter((p) => p.supportsSearch);
      const skipped = providers.filter((p) => !p.supportsSearch);
      const skips = skipped.map((p) => outcome(p, 'unavailable', false));
      if (selected.length === 0) {
        return Object.freeze({ status: 'unavailable', query, providerOutcomes: Object.freeze(skips) });
      }
      const settled = await Promise.all(selected.map((p) => fetchSearch(p, query, now, timeoutMs)));
      const byId = new Map(selected.map((p, index) => [p.providerId, settled[index]!]));
      const providerOutcomes = Object.freeze(
        providers.map((p) => byId.get(p.providerId)?.outcome ?? outcome(p, 'unavailable', false)),
      );
      const successes = settled.filter((entry) => entry.outcome.state === 'success');
      if (successes.length === 0) {
        return Object.freeze({ status: precedence(providerOutcomes), query, providerOutcomes });
      }
      const filtered = filterDiscoveredJobs(
        successes.flatMap((entry) => entry.jobs),
        query,
        new Map(
          successes.map((entry) => [
            entry.outcome.providerId,
            new Set(entry.outcome.coverage?.honoredFilters ?? []),
          ]),
        ),
      );
      const complete =
        successes.length === selected.length &&
        successes.every(
          (entry) =>
            entry.outcome.coverage !== undefined && fullyCovered(entry.outcome.coverage, query, entry.jobs),
        ) &&
        filtered.criteriaUncertainCount === 0 &&
        filtered.identityConflictCount === 0 &&
        !filtered.freshnessCoverage.truncated &&
        (query.postedSince === undefined || filtered.freshnessCoverage.omittedUncertainCount === 0);
      const state = complete && filtered.freshnessCoverage.state === 'verified' ? 'verified' : 'incomplete';
      const freshnessCoverage = Object.freeze({
        ...filtered.freshnessCoverage,
        state,
        providerCoverage: providerOutcomes,
      });
      return Object.freeze({
        status: complete ? 'available' : 'partial',
        query,
        jobs: filtered.jobs,
        providerOutcomes,
        freshnessCoverage,
      });
    },
    async getDetails(input: unknown): Promise<JobDetailResult> {
      const ref = jobRef(input);
      const selected = providers.find((p) => p.providerId === ref.sourceId);
      if (selected === undefined || !selected.supportsDetails || selected.getDetails === undefined) {
        return Object.freeze({ status: 'unavailable', sourceId: ref.sourceId });
      }
      try {
        const response = await bounded((signal) => selected.getDetails!(ref.jobId, signal), timeoutMs);
        ensureResponseSize(response);
        const normalized = normalizeDiscoveredJob(response, {
          providerId: selected.providerId,
          providerType: selected.providerType,
          name: selected.name,
          retrievedAt: now().toISOString(),
        });
        if (normalized.id !== ref.jobId) throw new Error('Mismatched job details');
        return Object.freeze({ status: 'available', job: normalized, sourceId: selected.providerId });
      } catch (error) {
        return Object.freeze({ status: errorKind(error), sourceId: selected.providerId });
      }
    },
  };
}

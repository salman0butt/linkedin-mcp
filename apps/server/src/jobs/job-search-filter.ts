import type { JobSearchQuery, NormalizedJob } from '../../../../packages/core/dist/index.js';

export interface JobFreshnessCoverage {
  readonly state: 'verified' | 'incomplete';
  readonly unknownDateCount: number;
  readonly reportedDateCount: number;
  readonly omittedUncertainCount: number;
  readonly truncated: boolean;
}

export interface JobFilterResult {
  readonly jobs: readonly Readonly<NormalizedJob>[];
  readonly freshnessCoverage: Readonly<JobFreshnessCoverage>;
  readonly criteriaUncertainCount: number;
  readonly identityConflictCount: number;
}

const MAX_INPUT_ITEMS = 1_000;

function strength(item: NormalizedJob): number {
  switch (item.postingDate.state) {
    case 'verified':
      return 0;
    case 'reported':
      return 1;
    default:
      return 2;
  }
}

function postingTime(item: NormalizedJob): number {
  return item.postingDate.state === 'unknown' ? -Infinity : Date.parse(item.postingDate.postedAt);
}

/** Pure local filtering. A local 'verified' state only describes observed rows;
 * provider exhaustiveness, requested filter coverage and final availability
 * MUST be checked independently by the trusted provider service. */
export function filterDiscoveredJobs(
  jobs: readonly Readonly<NormalizedJob>[],
  query: JobSearchQuery,
): JobFilterResult {
  if (Object.prototype.toString.call(jobs) !== '[object Array]' || jobs.length > MAX_INPUT_ITEMS) {
    throw new Error('Job discovery input exceeds local bound');
  }
  const candidates = new Map<string, Array<{ job: Readonly<NormalizedJob>; index: number }>>();
  const keywords = query.keywords.toLocaleLowerCase('en');
  const wantedLocation = query.location?.toLocaleLowerCase('en');
  const postedSince = query.postedSince === undefined ? undefined : Date.parse(query.postedSince);
  let unknownDateCount = 0;
  let reportedDateCount = 0;
  let omittedUncertainCount = 0;
  const uncertainCriteria = new Set<string>();

  for (const [index, job] of jobs.entries()) {
    const identity = JSON.stringify([job.source.id, job.id]);
    // Content is untrusted text; it is only compared as text, never executed.
    if (
      ![job.title, job.companyName, job.description ?? '']
        .join(' ')
        .toLocaleLowerCase('en')
        .includes(keywords)
    ) {
      continue;
    }
    if (wantedLocation !== undefined) {
      if (job.location === undefined) {
        uncertainCriteria.add(identity);
        continue;
      }
      if (!job.location.toLocaleLowerCase('en').includes(wantedLocation)) continue;
    }
    if (query.workplace !== undefined) {
      if (job.workplace === undefined) {
        uncertainCriteria.add(identity);
        continue;
      }
      if (job.workplace !== query.workplace) continue;
    }
    if (query.employmentType !== undefined) {
      if (job.employmentType === undefined) {
        uncertainCriteria.add(identity);
        continue;
      }
      if (job.employmentType !== query.employmentType) continue;
    }

    const existing = candidates.get(identity) ?? [];
    existing.push({ job, index });
    candidates.set(identity, existing);
  }
  const matches = new Map<string, { job: Readonly<NormalizedJob>; index: number }>();
  let identityConflictCount = 0;
  for (const [identity, entries] of candidates) {
    const verified = entries.filter(({ job }) => job.postingDate.state === 'verified');
    const initialDate = verified[0]?.job.postingDate;
    const firstVerifiedPostedAt = initialDate?.state === 'verified' ? initialDate.postedAt : undefined;
    const firstVerifiedUrl = verified[0]?.job.canonicalUrl;
    // Conflicting independent posting-date evidence on the same source/job
    // identity cannot be silently resolved by array order.
    if (
      verified.length > 1 &&
      verified.some(
        ({ job }) =>
          job.postingDate.state !== 'verified' ||
          job.postingDate.postedAt !== firstVerifiedPostedAt ||
          (job.canonicalUrl !== undefined &&
            firstVerifiedUrl !== undefined &&
            job.canonicalUrl !== firstVerifiedUrl),
      )
    ) {
      identityConflictCount++;
      continue;
    }
    const best = entries.reduce((best, item) => (strength(item.job) < strength(best.job) ? item : best));
    const job = best.job;
    if (job.postingDate.state === 'unknown') unknownDateCount++;
    if (job.postingDate.state === 'reported') reportedDateCount++;
    if (postedSince !== undefined) {
      if (job.postingDate.state !== 'verified') {
        omittedUncertainCount++;
        continue;
      }
      if (Date.parse(job.postingDate.postedAt) < postedSince) continue;
    }
    matches.set(identity, { job, index: entries[0]!.index });
  }
  const criteriaUncertainCount = uncertainCriteria.size;
  const ordered = [...matches.values()];
  if (query.sort === 'recent') {
    ordered.sort(
      (a, b) =>
        strength(a.job) - strength(b.job) || postingTime(b.job) - postingTime(a.job) || a.index - b.index,
    );
  } else {
    ordered.sort((a, b) => a.index - b.index);
  }
  const truncated = ordered.length > query.limit;
  const freshnessCoverage: JobFreshnessCoverage = Object.freeze({
    state:
      truncated ||
      criteriaUncertainCount > 0 ||
      identityConflictCount > 0 ||
      unknownDateCount > 0 ||
      reportedDateCount > 0 ||
      omittedUncertainCount > 0
        ? ('incomplete' as const)
        : ('verified' as const),
    unknownDateCount,
    reportedDateCount,
    omittedUncertainCount,
    truncated,
  });
  return Object.freeze({
    jobs: Object.freeze(ordered.slice(0, query.limit).map(({ job }) => job)),
    freshnessCoverage,
    criteriaUncertainCount,
    identityConflictCount,
  });
}

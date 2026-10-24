import { describe, expect, it } from 'vitest';

import {
  createJobSearchQuery,
  normalizeDiscoveredJob,
  type TrustedJobContext,
  type NormalizedJob,
} from '../../../packages/core/src/job-discovery.js';
import { filterDiscoveredJobs } from '../src/jobs/job-search-filter.js';

const ctx: TrustedJobContext = {
  providerId: 'source-one',
  providerType: 'EXTERNAL_DISCOVERY',
  name: 'Source One',
  retrievedAt: '2026-10-23T10:00:00.000Z',
};
const other: TrustedJobContext = { ...ctx, providerId: 'source-two', name: 'Source Two' };
function listing(
  id: string,
  title = 'Senior TypeScript Engineer',
  fields: Record<string, unknown> = {},
  context: TrustedJobContext = ctx,
): Readonly<NormalizedJob> {
  return normalizeDiscoveredJob({ id, title, companyName: 'Example Company', ...fields }, context);
}
function verified(id: string, postedAt: string, fields: Record<string, unknown> = {}) {
  const context: TrustedJobContext = {
    ...ctx,
    verifiedPostingDate: {
      jobId: id,
      providerId: ctx.providerId,
      postedAt,
      checkedAt: '2026-10-23T09:00:00Z',
      verifiedBy: 'first-party-employer-check',
      method: 'direct_employer_listing',
      evidenceUrl: 'https://jobs.example.org/job',
    },
  };
  return listing(id, 'Senior TypeScript Engineer', fields, context);
}

describe('M06.2 deterministic job filtering and freshness coverage', () => {
  it('filters text, location, workplace and employment using sourced fields without assuming missing values', () => {
    const jobs = [
      listing('a', 'React Developer', {
        location: 'Berlin, Germany',
        workplace: 'remote',
        employmentType: 'contract',
      }),
      listing('b', 'React Developer', {
        location: 'Berlin, Germany',
        workplace: 'hybrid',
        employmentType: 'contract',
      }),
      listing('c', 'React Developer', { workplace: 'remote', employmentType: 'contract' }),
      listing('d', 'Frontend Designer', {
        location: 'Berlin, Germany',
        workplace: 'remote',
        employmentType: 'contract',
      }),
    ];
    const result = filterDiscoveredJobs(
      jobs,
      createJobSearchQuery({
        keywords: 'react',
        location: 'Berlin',
        workplace: 'remote',
        employmentType: 'contract',
      }),
    );
    expect(result.jobs.map((item) => item.id)).toEqual(['a']);
    expect(result.criteriaUncertainCount).toBe(1);
    expect(result.freshnessCoverage.state).toBe('incomplete');
  });

  it('only verified posting dates prove postedSince eligibility and tracks omitted uncertainty', () => {
    const jobs = [
      listing('unknown'),
      listing('reported', undefined, { postedAt: '2026-10-22T09:00:00Z' }),
      verified('older', '2026-10-01T09:00:00Z'),
      verified('fresh', '2026-10-22T09:00:00Z'),
    ];
    const result = filterDiscoveredJobs(
      jobs,
      createJobSearchQuery({ keywords: 'typescript', postedSince: '2026-10-20T00:00:00Z' }),
    );
    expect(result.jobs.map((item) => item.id)).toEqual(['fresh']);
    expect(result.freshnessCoverage).toMatchObject({
      state: 'incomplete',
      unknownDateCount: 1,
      reportedDateCount: 1,
      omittedUncertainCount: 2,
      truncated: false,
    });
  });

  it('returns incomplete zero results, never verified complete-empty, for unknown or reported-only dates', () => {
    const query = createJobSearchQuery({ keywords: 'TypeScript', postedSince: '2026-10-22T00:00:00Z' });
    for (const items of [
      [listing('unknown')],
      [listing('reported', undefined, { postedAt: '2026-10-22T09:00:00Z' })],
    ]) {
      const result = filterDiscoveredJobs(items, query);
      expect(result.jobs).toEqual([]);
      expect(result.freshnessCoverage.state).toBe('incomplete');
      expect(result.freshnessCoverage.omittedUncertainCount).toBe(1);
    }
  });

  it('orders verified newer-first, reported newer-first separately and unknown last', () => {
    const records = [
      listing('unknown'),
      listing('report-new', undefined, { postedAt: '2026-10-23T09:00:00Z' }),
      verified('verified-old', '2026-10-20T09:00:00Z'),
      listing('report-old', undefined, { postedAt: '2026-10-10T09:00:00Z' }),
      verified('verified-new', '2026-10-22T09:00:00Z'),
    ];
    const result = filterDiscoveredJobs(records, createJobSearchQuery({ keywords: 'typescript' }));
    expect(result.jobs.map((item) => item.id)).toEqual([
      'verified-new',
      'verified-old',
      'report-new',
      'report-old',
      'unknown',
    ]);
    expect(result.freshnessCoverage.state).toBe('incomplete');
  });

  it('preserves source identity, dedupes after filters, and favors stronger evidence from one source', () => {
    const jobs = [
      listing('same', 'Unrelated design role'),
      listing('same', 'Senior TypeScript Engineer', { postedAt: '2026-10-21T09:00:00Z' }),
      verified('same', '2026-10-22T09:00:00Z'),
      listing('same', 'Senior TypeScript Engineer', {}, other),
    ];
    const result = filterDiscoveredJobs(jobs, createJobSearchQuery({ keywords: 'typescript' }));
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs.map((item) => item.source.id)).toEqual(['source-one', 'source-two']);
    expect(result.jobs[0]?.postingDate.state).toBe('verified');
  });

  it('resolves source-scoped duplicates before applying postedSince and counting uncertainty', () => {
    const jobs = [
      listing('same', undefined, { postedAt: '2026-10-22T08:00:00Z' }),
      verified('same', '2026-10-01T08:00:00Z'),
    ];
    const result = filterDiscoveredJobs(
      jobs,
      createJobSearchQuery({ keywords: 'typescript', postedSince: '2026-10-20T00:00:00Z' }),
    );
    expect(result.jobs).toEqual([]);
    expect(result.freshnessCoverage).toMatchObject({
      state: 'verified',
      reportedDateCount: 0,
      unknownDateCount: 0,
      omittedUncertainCount: 0,
    });
  });

  it('flags conflicting verified duplicate posting dates instead of silently trusting the first', () => {
    const result = filterDiscoveredJobs(
      [verified('same', '2026-10-21T08:00:00Z'), verified('same', '2026-10-22T08:00:00Z')],
      createJobSearchQuery({ keywords: 'typescript', postedSince: '2026-10-20T00:00:00Z' }),
    );
    expect(result.jobs).toEqual([]);
    expect(result.identityConflictCount).toBe(1);
    expect(result.freshnessCoverage.state).toBe('incomplete');
  });

  it('keeps source order for relevance and sorts equal evidence deterministically', () => {
    const jobs = [
      verified('old', '2026-10-01T10:00:00Z'),
      verified('new', '2026-10-22T10:00:00Z'),
      verified('same-time', '2026-10-22T10:00:00Z'),
    ];
    expect(
      filterDiscoveredJobs(
        jobs,
        createJobSearchQuery({ keywords: 'typescript', sort: 'relevance' }),
      ).jobs.map((item) => item.id),
    ).toEqual(['old', 'new', 'same-time']);
    expect(
      filterDiscoveredJobs(jobs, createJobSearchQuery({ keywords: 'typescript', sort: 'recent' })).jobs.map(
        (item) => item.id,
      ),
    ).toEqual(['new', 'same-time', 'old']);
  });

  it('reports local result truncation and never interprets top-N as full source coverage', () => {
    const jobs = Array.from({ length: 10 }, (_, index) =>
      verified(String(index + 1), '2026-10-20T09:00:00Z'),
    );
    const result = filterDiscoveredJobs(jobs, createJobSearchQuery({ keywords: 'typescript', limit: 2 }));
    expect(result.jobs).toHaveLength(2);
    expect(result.freshnessCoverage).toMatchObject({ state: 'incomplete', truncated: true });
  });

  it('only returns a verified date-coverage state if all matched records have verified evidence', () => {
    const result = filterDiscoveredJobs(
      [verified('one', '2026-10-22T09:00:00Z')],
      createJobSearchQuery({ keywords: 'typescript', postedSince: '2026-10-01T00:00:00Z' }),
    );
    expect(result.freshnessCoverage).toMatchObject({
      state: 'verified',
      unknownDateCount: 0,
      reportedDateCount: 0,
      omittedUncertainCount: 0,
      truncated: false,
    });
  });

  it('bounds the input batch and returns frozen local results', () => {
    const result = filterDiscoveredJobs([listing('one')], createJobSearchQuery({ keywords: 'typescript' }));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.jobs)).toBe(true);
    expect(Object.isFrozen(result.freshnessCoverage)).toBe(true);
    expect(() =>
      filterDiscoveredJobs(
        Array.from({ length: 1001 }, (_, index) => listing(String(index))),
        createJobSearchQuery({ keywords: 'typescript' }),
      ),
    ).toThrow();
  });
});

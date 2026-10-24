import { describe, expect, it, vi } from 'vitest';
import {
  createJobSearchService,
  JobProviderError,
  type JobProvider,
} from '../src/jobs/job-search-service.js';

const now = () => new Date('2026-10-23T10:00:00Z');
const query = { keywords: 'TypeScript' };
const job = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: 'TypeScript Engineer',
  companyName: 'Example Company',
  ...extra,
});
const coverage = {
  complete: true,
  hasMore: false,
  honoredFilters: ['keywords'] as const,
  honoredSort: 'recent' as const,
  verifiedDateCoverage: false,
};
const provider = (
  id: string,
  search: JobProvider['search'],
  other: Partial<JobProvider> = {},
): JobProvider => ({
  providerId: id,
  providerType: 'EXTERNAL_DISCOVERY',
  name: `Provider ${id}`,
  supportsSearch: true,
  supportsDetails: false,
  search,
  ...other,
});
const succeed = (jobs: unknown[] = [], overrides: Record<string, unknown> = {}) =>
  Promise.resolve({ jobs, coverage: { ...coverage, ...overrides } });

describe('M06.3 configured job providers with trustworthy coverage and details', () => {
  it('has explicit unavailable without configured providers or phantom jobs', async () => {
    const result = await createJobSearchService({ providers: [], now }).search(query);
    expect(result).toMatchObject({
      status: 'unavailable',
      query: { keywords: 'TypeScript', limit: 10, sort: 'recent' },
      providerOutcomes: [],
    });
    expect(result).not.toHaveProperty('jobs');
  });
  it('validates query before calling any provider', async () => {
    const search = vi.fn(() => succeed());
    const service = createJobSearchService({ providers: [provider('a', search)], now });
    await expect(service.search({ ...query, endpoint: 'http://127.0.0.1' })).rejects.toThrow();
    expect(search).not.toHaveBeenCalled();
  });
  it('returns empty available only with proof of complete source coverage', async () => {
    const yes = await createJobSearchService({ providers: [provider('a', () => succeed())], now }).search(
      query,
    );
    expect(yes).toMatchObject({ status: 'available', jobs: [], providerOutcomes: [{ state: 'success' }] });
    const missing = await createJobSearchService({
      providers: [provider('a', () => succeed([], { complete: false, hasMore: true }))],
      now,
    }).search(query);
    expect(missing).toMatchObject({ status: 'partial', jobs: [], providerOutcomes: [{ state: 'success' }] });
    expect(missing.freshnessCoverage?.state).toBe('incomplete');
  });
  it('keeps provider-attested semantic keyword and geographic matches that literal local filtering cannot prove', async () => {
    const service = createJobSearchService({
      providers: [
        provider('semantic', () =>
          succeed([job('semantic-job', { title: 'TS Backend Engineer', location: 'Berlin' })], {
            honoredFilters: ['keywords', 'location'],
          }),
        ),
      ],
      now,
    });
    const semanticKeyword = await service.search({ keywords: 'TypeScript' });
    expect(semanticKeyword.status).toBe('available');
    expect(semanticKeyword.jobs?.map((item) => item.id)).toEqual(['semantic-job']);
    const geographicLocation = await service.search({ keywords: 'TS', location: 'Germany' });
    expect(geographicLocation.status).toBe('available');
    expect(geographicLocation.jobs?.map((item) => item.id)).toEqual(['semantic-job']);
  });

  it('does not claim a complete empty result when an attested exact workplace filter conflicts with source data', async () => {
    const result = await createJobSearchService({
      providers: [
        provider('a', () =>
          succeed([job('conflict', { workplace: 'on_site' })], { honoredFilters: ['keywords', 'workplace'] }),
        ),
      ],
      now,
    }).search({ keywords: 'TypeScript', workplace: 'remote' });
    expect(result.status).toBe('partial');
    expect(result.jobs).toEqual([]);
    expect(result.freshnessCoverage?.state).toBe('incomplete');
  });

  it('preserves source-attested workplace and employment matches when the listing omits those fields', async () => {
    for (const requested of [
      { workplace: 'remote' as const, honoredFilters: ['keywords', 'workplace'] },
      { employmentType: 'contract' as const, honoredFilters: ['keywords', 'employmentType'] },
    ]) {
      const { honoredFilters, ...filters } = requested;
      const service = createJobSearchService({
        providers: [provider('a', () => succeed([job('sparse')], { honoredFilters }))],
        now,
      });
      const result = await service.search({ keywords: 'TypeScript', ...filters });
      expect(result.status).toBe('available');
      expect(result.jobs?.map((item) => item.id)).toEqual(['sparse']);
    }
  });
  it('preserves per-provider provenance and never trusts spoofed fields', async () => {
    const result = await createJobSearchService({
      providers: [
        provider('a', () =>
          succeed([
            job('123', {
              source: { provider: 'OFFICIAL_API', id: 'li' },
              verified: true,
              postedAt: '2026-10-22T09:00:00Z',
              confidence: 0.99,
            }),
          ]),
        ),
      ],
      now,
    }).search(query);
    expect(result).toMatchObject({
      status: 'available',
      jobs: [
        {
          id: '123',
          source: { id: 'a', provider: 'EXTERNAL_DISCOVERY' },
          postingDate: { state: 'reported' },
        },
      ],
    });
    expect(result.jobs?.[0]).not.toHaveProperty('confidence');
  });
  it('rejects date-only success for incomplete verified freshness, including empty results', async () => {
    const request = { ...query, postedSince: '2026-10-21T00:00:00Z' };
    const incomplete = await createJobSearchService({
      providers: [provider('a', () => succeed([], { honoredFilters: ['keywords', 'postedSince'] }))],
      now,
    }).search(request);
    expect(incomplete).toMatchObject({
      status: 'partial',
      jobs: [],
      freshnessCoverage: { state: 'incomplete' },
    });
    const proof = await createJobSearchService({
      providers: [
        provider('a', () =>
          succeed([], {
            honoredFilters: ['keywords', 'postedSince'],
            verifiedDateCoverage: true,
          }),
        ),
      ],
      now,
    }).search(request);
    expect(proof).toMatchObject({ status: 'available', jobs: [] });
  });
  it('reports partial for mixed failure or unhonored sort/filter without leaking errors', async () => {
    const result = await createJobSearchService({
      providers: [
        provider('a', () => succeed([job('1')], { honoredSort: null })),
        provider('b', () => Promise.reject(new JobProviderError('rate_limited'))),
      ],
      now,
    }).search(query);
    expect(result).toMatchObject({
      status: 'partial',
      jobs: [{ id: '1' }],
      providerOutcomes: [{ state: 'success' }, { state: 'rate_limited' }],
    });
    expect(JSON.stringify(result)).not.toContain('accessToken');
  });
  it('preserves typed error precedence with no successful sources and no posts field', async () => {
    const result = await createJobSearchService({
      providers: [
        provider('a', () => Promise.reject(new JobProviderError('rate_limited'))),
        provider('b', () => Promise.reject(new JobProviderError('permission_required'))),
      ],
      now,
    }).search(query);
    expect(result.status).toBe('permission_required');
    expect(result).not.toHaveProperty('jobs');
  });
  it('rejects incompatible coverage flags and oversized provider batches', async () => {
    for (const response of [
      { jobs: [], coverage: { ...coverage, complete: true, hasMore: true } },
      { jobs: [], coverage: { ...coverage, honoredFilters: ['bogus'] } },
      { jobs: [job('x', { description: 'x'.repeat(280000) })], coverage },
      { jobs: Array.from({ length: 201 }, (_, i) => job(String(i))), coverage },
    ]) {
      const result = await createJobSearchService({
        providers: [provider('a', () => Promise.resolve(response as never))],
        now,
      }).search(query);
      expect(result.status).toBe('failed');
      expect(result).not.toHaveProperty('jobs');
    }
  });

  it('strips unknown coverage metadata so provider secrets never enter audited outcomes', async () => {
    const result = await createJobSearchService({
      providers: [
        provider('a', () =>
          succeed([job('one')], { complete: false, hasMore: true, accessToken: 'secret-value' }),
        ),
      ],
      now,
    }).search(query);
    expect(result.status).toBe('partial');
    expect(result.providerOutcomes[0]?.coverage).toEqual({
      complete: false,
      hasMore: true,
      honoredFilters: ['keywords'],
      honoredSort: 'recent',
      verifiedDateCoverage: false,
    });
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  it('does not claim fully covered recent sorting from undated results when provider sort is unproven', async () => {
    const uncertain = await createJobSearchService({
      providers: [provider('a', () => succeed([job('undated')], { honoredSort: null }))],
      now,
    }).search(query);
    expect(uncertain.status).toBe('partial');
    const empty = await createJobSearchService({
      providers: [provider('a', () => succeed([], { honoredSort: null }))],
      now,
    }).search(query);
    expect(empty.status).toBe('available');
  });

  it('preserves a relevant multi-term job whose query terms occur in separate fields', async () => {
    const result = await createJobSearchService({
      providers: [
        provider('a', () =>
          succeed([
            job('candidate', {
              title: 'Senior Software Engineer',
              description: 'TypeScript experience is essential',
            }),
          ]),
        ),
      ],
      now,
    }).search({ keywords: 'Senior TypeScript' });
    expect(result.status).toBe('available');
    expect(result.jobs?.map((item) => item.id)).toEqual(['candidate']);
  });

  it('rejects normalized payloads that exceed the output bound despite a misleading toJSON method', async () => {
    const disguised = Array.from({ length: 100 }, (_, index) => ({
      ...job('large-' + index, { description: 'TypeScript ' + 'x'.repeat(18_000) }),
      toJSON() {
        return { id: 'small-' + index };
      },
    }));
    const result = await createJobSearchService({
      providers: [provider('a', () => succeed(disguised))],
      now,
    }).search(query);
    expect(result.status).toBe('failed');
    expect(result).not.toHaveProperty('jobs');
  });
  it('binds class-based provider methods to the configured instance', async () => {
    class Example implements JobProvider {
      providerId = 'class-provider';
      providerType = 'PARTNER_API' as const;
      name = 'Class';
      supportsSearch = true;
      supportsDetails = false;
      private readonly records = [job('bound')];
      search() {
        return succeed(this.records);
      }
    }
    const result = await createJobSearchService({ providers: [new Example()], now }).search(query);
    expect(result.jobs?.[0]?.id).toBe('bound');
  });
  it('retains trusted metadata exposed by a class provider through accessors', async () => {
    class GetterProvider implements JobProvider {
      get providerId() {
        return 'getter-provider';
      }
      get providerType() {
        return 'EXTERNAL_DISCOVERY' as const;
      }
      get name() {
        return 'Getter Provider';
      }
      get supportsSearch() {
        return true;
      }
      get supportsDetails() {
        return false;
      }
      calls = 0;
      search() {
        this.calls++;
        return succeed([job('getter-job')]);
      }
    }
    const source = new GetterProvider();
    const result = await createJobSearchService({ providers: [source], now }).search(query);
    expect(source.calls).toBe(1);
    expect(result.status).toBe('available');
    expect(result.providerOutcomes[0]).toMatchObject({
      providerId: 'getter-provider',
      providerType: 'EXTERNAL_DISCOVERY',
      consulted: true,
      state: 'success',
    });
    expect(result.jobs?.map((item) => item.id)).toEqual(['getter-job']);
  });
  it('routes details by exact configured source and job ID, never caller URL', async () => {
    const detailsA = vi.fn((id: string) => Promise.resolve(job(id, { description: 'Source A details' })));
    const detailsB = vi.fn((id: string) => Promise.resolve(job(id, { description: 'Source B details' })));
    const service = createJobSearchService({
      providers: [
        provider('a', () => succeed(), { supportsDetails: true, getDetails: detailsA }),
        provider('b', () => succeed(), { supportsDetails: true, getDetails: detailsB }),
      ],
      now,
    });
    const result = await service.getDetails({ sourceId: 'b', jobId: '123' });
    expect(result).toMatchObject({
      status: 'available',
      job: { id: '123', description: 'Source B details', source: { id: 'b' } },
    });
    expect(detailsA).not.toHaveBeenCalled();
    expect(detailsB).toHaveBeenCalledTimes(1);
    await expect(
      service.getDetails({ sourceId: 'b', jobId: '123', url: 'https://localhost/admin' }),
    ).rejects.toThrow();
    expect((await service.getDetails({ sourceId: 'nonexistent', jobId: '123' })).status).toBe('unavailable');
    expect(detailsB).toHaveBeenCalledTimes(1);
  });
  it('fails closed on detail ID mismatch and never invokes unsupported provider', async () => {
    const called = vi.fn(() => Promise.resolve(job('other')));
    const service = createJobSearchService({
      providers: [
        provider('a', () => succeed(), { supportsDetails: true, getDetails: called }),
        provider('no-detail', () => succeed()),
      ],
      now,
    });
    expect((await service.getDetails({ sourceId: 'a', jobId: '123' })).status).toBe('failed');
    expect((await service.getDetails({ sourceId: 'no-detail', jobId: '123' })).status).toBe('unavailable');
    expect(called).toHaveBeenCalledTimes(1);
  });
  it('rejects bad host configuration and honors local timeout limits', async () => {
    expect(() =>
      createJobSearchService({
        providers: [provider('same', () => succeed()), provider('same', () => succeed())],
      }),
    ).toThrow();
    expect(() =>
      createJobSearchService({
        providers: [provider('official', () => succeed(), { providerType: 'OFFICIAL_API' as never })],
      }),
    ).toThrow();
    const service = createJobSearchService({
      providers: [provider('slow', () => new Promise(() => {}))],
      now,
      timeoutMs: 15,
    });
    expect((await service.search(query)).status).toBe('failed');
  });
});

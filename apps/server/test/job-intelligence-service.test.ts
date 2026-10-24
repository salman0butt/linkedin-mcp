import { describe, expect, it } from 'vitest';
import { createJobIntelligenceService } from '../src/jobs/job-intelligence-service.js';

const raw = (
  id: string,
  sourceId = 'external-one',
  description = 'Must have TypeScript. Nice to have AWS.',
) => ({
  id,
  title: 'TypeScript Engineer',
  companyName: 'Example Ltd',
  source: {
    provider: 'EXTERNAL_DISCOVERY',
    id: sourceId,
    name: 'Pretend Official Recruiter',
    retrievedAt: '2026-10-24T08:00:00Z',
  },
  postingDate: { state: 'unknown' },
  description,
  canonicalUrl: 'https://jobs.example.org/roles/12',
});
const service = createJobIntelligenceService();

describe('M07.5 deterministic intelligence service', () => {
  it('analyzes caller data conservatively and never upgrades fake display source to trust', async () => {
    const result = await service.analyze({ job: raw('a'), candidate: { skills: ['TypeScript'] } });
    expect(result).toMatchObject({
      status: 'available',
      analysis: {
        ref: { sourceId: 'external-one', jobId: 'a' },
        sourceTrust: 'caller_supplied',
        source: { provider: 'EXTERNAL_DISCOVERY', name: 'Unverified user-supplied snapshot' },
        fit: { status: 'evaluated', score: 75 },
      },
    });
    expect(JSON.stringify(result)).not.toContain('Pretend Official Recruiter');
    expect(JSON.stringify(result)).not.toContain('candidate');
    expect(JSON.stringify(result)).not.toContain('accessToken');
  });

  it('compares 2–10 different source-scoped jobs in original input order', async () => {
    const result = await service.compare({
      jobs: [raw('same', 'one'), raw('same', 'two'), raw('other', 'one')],
      candidate: { skills: ['TypeScript', 'AWS'] },
    });
    expect(result.status).toBe('available');
    expect(result.analyses?.map((item) => item.ref)).toEqual([
      { sourceId: 'one', jobId: 'same' },
      { sourceId: 'two', jobId: 'same' },
      { sourceId: 'one', jobId: 'other' },
    ]);
    expect(result.analyses?.map((item) => item.fit.score)).toEqual([100, 100, 100]);
  });

  it('rejects source-scoped duplicate identity and reports no misleading ranking', async () => {
    await expect(
      service.compare({ jobs: [raw('shared'), raw('shared', 'external-one', 'Nice to have Python')] }),
    ).rejects.toThrow(/duplicate|identity/i);
  });

  it('rejects untrusted source attestations and oversized or malformed comparisons before analysis', async () => {
    for (const value of [
      { jobs: [raw('single')] },
      { jobs: Array.from({ length: 11 }, (_, index) => raw(String(index))) },
      { jobs: [raw('a'), { ...raw('b'), source: { ...raw('b').source, provider: 'PARTNER_API' } }] },
      { jobs: [raw('a'), raw('b')], endpoint: 'https://evil.invalid' },
      { jobs: [raw('a'), raw('b')], candidate: { skills: ['TS'], accessToken: 'secret' } },
      { jobs: [raw('a'), raw('b')], mode: 'apply' },
      { jobs: [raw('a'), raw('b')], candidate: null },
    ]) {
      await expect(service.compare(value)).rejects.toThrow();
    }
    await expect(service.analyze({ job: { ...raw('a'), confidence: 1 } })).rejects.toThrow();
  });

  it('does not mis-score a stated work-authorization requirement from candidate location preference', async () => {
    const result = await service.analyze({
      job: raw(
        'a',
        'jobs',
        'Must have TypeScript. Applicants must already have authorization to work in Germany.',
      ),
      candidate: { skills: ['TypeScript'], preferredLocations: ['Germany'] },
    });
    expect(result.analysis?.fit.status).toBe('insufficient_evidence');
    expect(result.analysis?.fit).not.toHaveProperty('score');
    expect(JSON.stringify(result)).not.toContain('preferredLocations');
  });

  it('withholds a numeric score whenever source signals say existing work authorization is required', async () => {
    for (const description of [
      'Must have TypeScript. US work authorization required.',
      'Must have TypeScript. Applicants must be authorized to work in the US.',
      'Must have TypeScript. U.S. work authorization required.',
    ]) {
      const result = await service.analyze({
        job: raw('a', 'jobs', description),
        candidate: { skills: ['TypeScript'], preferredLocations: ['US'] },
      });
      expect(result.analysis.signals.workAuthorization.status).toBe('explicit_yes');
      expect(result.analysis.fit.status).toBe('insufficient_evidence');
      expect(result.analysis.fit).not.toHaveProperty('score');
    }
  });

  it.each([
    'Must have valid Pakistan work permit',
    'Must have French work permit',
    'Applicants must hold legal work authorization for Pakistan',
    'Must be based in France',
    'Applicants must reside in Pakistan',
  ])('withholds skill-only score when a location-field mandate is not assessed: %s', async (location) => {
    const result = await service.analyze({
      job: { ...raw('location-mandate', 'jobs', 'Must have TypeScript.'), location },
      candidate: { skills: ['TypeScript'] },
    });
    expect(result.analysis.fit.status).toBe('insufficient_evidence');
    expect(result.analysis.fit).not.toHaveProperty('score');
    expect(result.analysis.fit.scoreCoverage.unassessedRequiredCount).toBeGreaterThan(0);
  });

  it('does not withhold a supported skill score for an unqualified neutral location', async () => {
    const result = await service.analyze({
      job: { ...raw('neutral-location', 'jobs', 'Must have TypeScript.'), location: 'Paris, France' },
      candidate: { skills: ['TypeScript'] },
    });
    expect(result.analysis.fit).toMatchObject({ status: 'evaluated', score: 100 });
  });

  it('never presents 100% fit when explicit role-qualified required skills are missing', async () => {
    for (const description of [
      'Must have TypeScript. AWS is required for this role.',
      'Must have TypeScript. This role requires AWS.',
      'Must have TypeScript. Python is mandatory for this position.',
    ]) {
      const result = await service.analyze({
        job: raw('role-qualified', 'jobs', description),
        candidate: { skills: ['TypeScript'] },
      });
      expect(result.analysis.fit.score).not.toBe(100);
      if (result.analysis.fit.status === 'evaluated') {
        expect(result.analysis.fit.missing.length).toBeGreaterThan(0);
      }
    }
  });
});

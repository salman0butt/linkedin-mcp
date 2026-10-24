import { describe, expect, it } from 'vitest';
import { analyzeJobFit } from '../src/jobs/job-fit.js';

const requirement = (
  value: string,
  priority: 'required' | 'preferred' | 'unspecified' = 'required',
  category: 'skill' | 'experience' | 'work_authorization' = 'skill',
) => ({
  id: `requirement-${value}-${priority}`,
  category,
  priority,
  value,
  quote: `Must have ${value}`,
  sourceSpan: { field: 'description' as const, start: 0, end: 10, offsetUnit: 'utf16' as const },
});
const extraction = (
  requirements: ReturnType<typeof requirement>[],
  options: { truncated?: boolean; evidenceStatus?: 'explicit' | 'incomplete' } = {},
) => ({
  requirements,
  truncated: options.truncated ?? false,
  evidenceStatus: options.evidenceStatus ?? 'explicit',
});

describe('M07.4 advisory skill-only candidate fit', () => {
  it('uses exactly 3:1 required/preferred weights with stable golden results', () => {
    const requirements = extraction([requirement('TypeScript'), requirement('AWS', 'preferred')]);
    const onlyRequired = analyzeJobFit(requirements, { skills: ['typescript'] });
    expect(onlyRequired).toMatchObject({
      status: 'evaluated',
      score: 75,
      scoreScope: 'explicit_skills_only',
      matched: [{ value: 'TypeScript', priority: 'required' }],
      missing: [{ value: 'AWS', priority: 'preferred' }],
    });
    expect(analyzeJobFit(requirements, { skills: ['TypeScript', 'AWS'] }).score).toBe(100);
    expect(analyzeJobFit(requirements, { skills: ['AWS'] }).score).toBe(25);
    expect(analyzeJobFit(requirements, { skills: ['Rust'] }).score).toBe(0);
  });

  it('matches only exact normalized names and the five permitted aliases', () => {
    const requirements = extraction([
      requirement('TypeScript'),
      requirement('JavaScript'),
      requirement('Node.js'),
      requirement('React'),
      requirement('PostgreSQL'),
    ]);
    expect(
      analyzeJobFit(requirements, { skills: ['TS', 'JS', 'nodejs', 'react.js', 'postgres'] }).score,
    ).toBe(100);
    expect(analyzeJobFit(extraction([requirement('React')]), { skills: ['react-native'] }).score).toBe(0);
    expect(
      analyzeJobFit(extraction([requirement('TypeScript')]), { skills: ['typescript advanced'] }).score,
    ).toBe(0);
  });

  it('deduplicates repeated required skills without inflating denominators', () => {
    const result = analyzeJobFit(
      extraction([requirement('TypeScript'), requirement('typescript'), requirement('AWS', 'preferred')]),
      { skills: ['TS'] },
    );
    expect(result.score).toBe(75);
    expect(result.matched).toHaveLength(1);
  });

  it('withholds all scores when evidence is incomplete, truncated or absent', () => {
    const core = [requirement('TypeScript')];
    for (const [requirements, candidate] of [
      [extraction(core, { truncated: true }), { skills: ['TypeScript'] }],
      [extraction(core, { evidenceStatus: 'incomplete' }), { skills: ['TypeScript'] }],
      [extraction(core), { skills: [] }],
      [extraction([]), { skills: ['TypeScript'] }],
      [extraction(core), undefined],
    ] as const) {
      const result = analyzeJobFit(requirements, candidate);
      expect(result.status).toBe('insufficient_evidence');
      expect(result).not.toHaveProperty('score');
    }
  });

  it('does not score incomplete mandatory experience, work-authorization or unclear requirements', () => {
    const requirements = extraction([
      requirement('TypeScript'),
      requirement('3+ years', 'required', 'experience'),
      requirement('German work authorization', 'required', 'work_authorization'),
    ]);
    const result = analyzeJobFit(requirements, {
      skills: ['TypeScript'],
      yearsOfExperience: 10,
      preferredLocations: ['Germany'],
    });
    expect(result.status).toBe('insufficient_evidence');
    expect(result).not.toHaveProperty('score');
    expect(result.unknown.map((r: { category: string }) => r.category)).toEqual(
      expect.arrayContaining(['experience', 'work_authorization']),
    );
    expect(JSON.stringify(result)).not.toContain('Germany');
  });

  it('does not reflect candidate private metadata or alter source extraction', () => {
    const input = extraction([requirement('AWS')]);
    const before = JSON.stringify(input);
    const result = analyzeJobFit(input, {
      skills: ['AWS'],
      yearsOfExperience: 7,
      preferredLocations: ['Oslo'],
    });
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(result)).not.toContain('Oslo');
    expect(JSON.stringify(result)).not.toContain('yearsOfExperience');
    expect(Object.isFrozen(result)).toBe(true);
  });
});

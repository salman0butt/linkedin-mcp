import { describe, expect, it } from 'vitest';

import { compareResearchCohorts } from '../src/research/corpus-comparison.js';
import { ResearchOutputTooLargeError } from '../src/research/content-analysis.js';

const fixture = () => ({
  topic: 'Source notes',
  focusTerms: ['RAG', 'SQL'],
  sources: [
    { id: 'a1', title: 'First', url: 'https://research.example.org/a1', body: '🤖 RAG in this note.' },
    { id: 'a2', title: 'Second', url: 'https://research.example.org/a2', body: 'Unrelated notes.' },
    { id: 'b1', title: 'Third', url: 'https://research.example.org/b1', body: 'SQL is here.' },
    { id: 'unused', title: 'Fourth', url: 'https://research.example.org/u', body: 'RAG and SQL are here.' },
  ],
  cohorts: [
    { id: 'A', label: 'Caller A', sourceIds: ['a2', 'a1'] },
    { id: 'B', label: 'Caller B', sourceIds: ['b1'] },
  ],
  unmatchedSourceIds: ['unused'],
});

describe('M10.3 caller-defined two-cohort corpus comparison', () => {
  it('projects only original source UTF-16 evidence inside its caller assigned cohort', () => {
    const input = fixture();
    const result = compareResearchCohorts(input);
    expect(result).toMatchObject({
      kind: 'local_caller_defined_corpus_comparison',
      status: 'available',
      comparisonOrigin: 'caller_defined_cohorts',
      sourceTrust: 'caller_supplied_unverified',
      verification: 'not_performed',
      topic: input.topic,
      focusTerms: ['RAG', 'SQL'],
      unmatchedSourceIds: ['unused'],
    });
    expect(result.cohorts.map((c) => c.id)).toEqual(['A', 'B']);
    expect(result.cohorts[0]?.sourceIds).toEqual(['a1', 'a2']);
    expect(result.cohorts[0]?.termObservations).toEqual([
      {
        term: 'RAG',
        state: 'observed_in_supplied_cohort',
        evidence: [
          {
            sourceId: 'a1',
            field: 'body',
            start: 3,
            end: 6,
            offsetUnit: 'utf16',
            endExclusive: true,
            quote: 'RAG',
          },
        ],
      },
      { term: 'SQL', state: 'not_observed_in_supplied_cohort', evidence: [] },
    ]);
    expect(result.cohorts[1]?.termObservations).toEqual([
      { term: 'RAG', state: 'not_observed_in_supplied_cohort', evidence: [] },
      {
        term: 'SQL',
        state: 'observed_in_supplied_cohort',
        evidence: [
          {
            sourceId: 'b1',
            field: 'body',
            start: 0,
            end: 3,
            offsetUnit: 'utf16',
            endExclusive: true,
            quote: 'SQL',
          },
        ],
      },
    ]);
    expect(result.warnings).toContain('unmatched_sources_excluded');
    expect(result.warnings).toContain('single_source_cohort');
    expect(JSON.stringify(result)).not.toContain('RAG and SQL are here.');
    expect(Object.isFrozen(result.cohorts[0]?.termObservations[0]?.evidence)).toBe(true);
    expect(compareResearchCohorts(input)).toEqual(result);
    for (const cohort of result.cohorts)
      for (const observation of cohort.termObservations)
        for (const span of observation.evidence) {
          const original = input.sources.find((source) => source.id === span.sourceId)!;
          expect(original.body.slice(span.start, span.end)).toBe(span.quote);
        }
  });

  it('requires a complete disjoint exact-case membership partition and two nonempty cohorts', () => {
    const input = fixture();
    for (const patch of [
      { unmatchedSourceIds: undefined },
      { unmatchedSourceIds: [] },
      { unmatchedSourceIds: ['unused', 'unused'] },
      { unmatchedSourceIds: ['b1', 'unused'] },
      { unmatchedSourceIds: ['unknown', 'unused'] },
      { cohorts: [] },
      { cohorts: [input.cohorts[0]] },
      { cohorts: [...input.cohorts, input.cohorts[0]] },
      { cohorts: [{ ...input.cohorts[0], sourceIds: [] }, input.cohorts[1]] },
      { cohorts: [{ ...input.cohorts[0], sourceIds: ['a1', 'a1'] }, input.cohorts[1]] },
      { cohorts: [{ ...input.cohorts[0], sourceIds: ['A1', 'a2'] }, input.cohorts[1]] },
      { cohorts: [{ ...input.cohorts[0], sourceIds: ['a1', 'b1'] }, input.cohorts[1]] },
      { cohorts: [input.cohorts[0], { ...input.cohorts[1], id: 'a' }] },
      { focusTerms: [] },
      { focusTerms: Array.from({ length: 13 }, (_, i) => `term${i}`) },
      { sources: input.sources.slice(0, 1) },
      { sources: Array.from({ length: 21 }, (_, i) => ({ ...input.sources[0]!, id: `x${i}` })) },
    ])
      expect(() => compareResearchCohorts({ ...input, ...patch })).toThrow();
    const two = fixture();
    expect(
      compareResearchCohorts({
        ...two,
        cohorts: [
          { id: 'first', label: 'A', sourceIds: ['a1', 'a2'] },
          { id: 'second', label: 'B', sourceIds: ['b1', 'unused'] },
        ],
        unmatchedSourceIds: [],
      }).unmatchedSourceIds,
    ).toEqual([]);
  });

  it('rejects untrusted getters, proxies, extra keys, sparse and nonenumerable arrays without invoking getters', () => {
    const input = fixture();
    let calls = 0;
    const poisoned: Record<string, unknown> = { ...input };
    Object.defineProperty(poisoned, 'provider', {
      enumerable: true,
      get() {
        calls++;
        throw new Error('SECRET');
      },
    });
    const weirdArray = [...input.focusTerms];
    weirdArray.length = 3;
    const extraArray = [...input.focusTerms] as string[] & { extra?: string };
    extraArray.extra = 'NO';
    const badCohort = { ...input.cohorts[0] };
    Object.defineProperty(badCohort, 'label', {
      enumerable: true,
      get() {
        calls++;
        throw new Error('SECRET');
      },
    });
    const source = { ...input.sources[0] };
    Object.defineProperty(source, 'body', {
      enumerable: true,
      get() {
        calls++;
        throw new Error('SECRET');
      },
    });
    for (const candidate of [
      poisoned,
      { ...input, provider: 'OFFICIAL_API' },
      { ...input, cohorts: [{ ...input.cohorts[0], verified: true }, input.cohorts[1]] },
      { ...input, cohorts: [badCohort, input.cohorts[1]] },
      { ...input, sources: [source, ...input.sources.slice(1)] },
      new Proxy(input, {}),
      { ...input, sources: new Proxy(input.sources, {}) },
      { ...input, focusTerms: weirdArray },
      { ...input, focusTerms: extraArray },
      { ...input, cohorts: new Proxy(input.cohorts, {}) },
      { ...input, unmatchedSourceIds: new Proxy(input.unmatchedSourceIds, {}) },
      Object.assign(Object.create(null), input),
    ])
      expect(() => compareResearchCohorts(candidate)).toThrow(/Invalid|invalid/u);
    expect(calls).toBe(0);
  });

  it('rejects Unicode case aliases and topic collision; preserves authentic topic-equivalent evidence', () => {
    const input = fixture();
    for (const pair of [
      ['s', 'ſ'],
      ['σ', 'ς'],
      ['k', 'K'],
      ['İ', 'i\u0307'],
    ]) {
      expect(() => compareResearchCohorts({ ...input, focusTerms: pair })).toThrow();
    }
    for (const [topic, focus] of [
      ['İ', 'i\u0307'],
      ['i\u0307', 'İ'],
    ])
      expect(() => compareResearchCohorts({ ...input, topic, focusTerms: [focus] })).toThrow();
    for (const bad of ['line\u2028break', 'line\u2029break', 'lone\ud800'])
      expect(() => compareResearchCohorts({ ...input, focusTerms: [bad] })).toThrow();
    const result = compareResearchCohorts({ ...input, topic: 'RAG', focusTerms: ['rag'] });
    expect(result.cohorts[0]?.termObservations[0]?.evidence[0]?.quote).toBe('RAG');
  });

  it('never interprets a caller backslash term as an executable regex escape or topic alias', () => {
    const source = fixture();
    const result = compareResearchCohorts({
      topic: '1',
      focusTerms: ['\\d', '1'],
      sources: [
        { ...source.sources[0], body: '1' },
        { ...source.sources[2], body: 'A literal \\d token.' },
      ],
      cohorts: [
        { id: 'A', label: 'Cohort A', sourceIds: ['a1'] },
        { id: 'B', label: 'Cohort B', sourceIds: ['b1'] },
      ],
      unmatchedSourceIds: [],
    });
    expect(result.cohorts[0]?.termObservations).toEqual([
      { term: '\\d', state: 'not_observed_in_supplied_cohort', evidence: [] },
      {
        term: '1',
        state: 'observed_in_supplied_cohort',
        evidence: [expect.objectContaining({ sourceId: 'a1', quote: '1' })],
      },
    ]);
    expect(result.cohorts[1]?.termObservations[0]?.evidence).toEqual([
      expect.objectContaining({ sourceId: 'b1', quote: '\\d' }),
    ]);
  });

  it('preserves case-sensitive source IDs and original body evidence, not unverified claims', () => {
    const input = fixture();
    input.sources[0]!.id = 'constructor';
    input.sources[1]!.id = 'X';
    input.sources[2]!.id = 'x';
    input.cohorts[0]!.sourceIds = ['X', 'constructor'];
    input.cohorts[1]!.sourceIds = ['x'];
    const result = compareResearchCohorts(input);
    expect(result.cohorts[0]?.sourceIds).toEqual(['constructor', 'X']);
    expect(result.cohorts[1]?.sourceIds).toEqual(['x']);
    expect(result.verification).toBe('not_performed');
    expect(JSON.stringify(result)).not.toContain('competitorGap');
  });

  it('fails closed on oversized intermediate analysis rather than silently discarding evidence', () => {
    const input = fixture();
    input.focusTerms = Array.from({ length: 12 }, (_, i) => `term${i}`);
    input.sources = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      title: 'Caller note',
      url: `https://research.example.org/s${i}`,
      body: `${input.focusTerms.join(' ')} ${'x'.repeat(1400)}`,
    }));
    input.cohorts = [
      { id: 'A', label: 'A', sourceIds: input.sources.slice(0, 10).map((source) => source.id) },
      { id: 'B', label: 'B', sourceIds: input.sources.slice(10).map((source) => source.id) },
    ];
    input.unmatchedSourceIds = [];
    const result = compareResearchCohorts(input);
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(96 * 1024);
    expect(result.cohorts[0]?.termObservations).toHaveLength(12);
    expect(() => compareResearchCohorts({ ...input, focusTerms: ['x', ...input.focusTerms] })).toThrow();
    const longTerms = Array.from({ length: 12 }, (_, i) => `term${i} long`);
    const largeSources = Array.from({ length: 20 }, (_, i) => ({
      id: `large${i}`,
      title: 'Title '.padEnd(230, 'T'),
      url: `https://research.example.org/${'long'.repeat(450)}${i}`,
      body: longTerms.map((term) => term.replace(' ', '\t'.repeat(135))).join(' '),
    }));
    expect(() =>
      compareResearchCohorts({
        topic: 'Source notes',
        focusTerms: longTerms,
        sources: largeSources,
        cohorts: [
          { id: 'A', label: 'A', sourceIds: largeSources.slice(0, 10).map((source) => source.id) },
          { id: 'B', label: 'B', sourceIds: largeSources.slice(10).map((source) => source.id) },
        ],
        unmatchedSourceIds: [],
      }),
    ).toThrow(ResearchOutputTooLargeError);
  });

  it('rejects unusual property descriptors, hidden symbols and a poisoned root accessor', () => {
    const input = fixture();
    let invoked = 0;
    const root = { ...input };
    Object.defineProperty(root, 'sources', {
      enumerable: true,
      get() {
        invoked++;
        throw new Error('PRIVATE-CANARY');
      },
    });
    const nested = [...input.cohorts];
    const hidden = [...input.focusTerms];
    Object.defineProperty(hidden, 'private', { value: 'PRIVATE-CANARY', enumerable: false });
    const symbol = { ...input, [Symbol('PRIVATE-CANARY')]: 'PRIVATE-CANARY' };
    const accessorMembers = [...input.cohorts[0]!.sourceIds];
    Object.defineProperty(accessorMembers, '0', {
      configurable: true,
      enumerable: true,
      get() {
        invoked++;
        throw new Error('PRIVATE-CANARY');
      },
    });
    for (const candidate of [
      root,
      symbol,
      { ...input, focusTerms: hidden },
      { ...input, cohorts: [{ ...nested[0], sourceIds: accessorMembers }, nested[1]] },
      {
        ...input,
        cohorts: [
          { ...nested[0], label: 'long ſ' },
          { ...nested[1], label: 'long s' },
        ],
      },
    ])
      expect(() => compareResearchCohorts(candidate)).toThrow();
    expect(invoked).toBe(0);
  });
});

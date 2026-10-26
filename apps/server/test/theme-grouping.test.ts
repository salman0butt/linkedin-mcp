import { describe, expect, it } from 'vitest';

import { groupResearchThemes } from '../src/research/theme-grouping.js';
import { ResearchOutputTooLargeError } from '../src/research/content-analysis.js';

const corpus = () => ({
  topic: 'Applied research',
  themes: [
    { id: 'agents', label: 'Caller-defined automation theme', phrases: ['Agentic systems'] },
    { id: 'retrieval', label: 'Caller-defined retrieval theme', phrases: ['RAG'] },
  ],
  sources: [
    {
      id: 's1',
      title: 'First note',
      url: 'https://research.example.org/one',
      body: '🤖 Agentic systems use RAG for retrieval.',
      publishedAt: '2026-10-01T00:00:00Z',
    },
    { id: 's2', title: 'Second note', url: 'https://research.example.org/two', body: 'RAG in practice.' },
    { id: 's3', title: 'Third note', url: 'https://research.example.org/three', body: 'Nothing matched.' },
  ],
});

describe('M10.1 strictly caller-defined local theme grouping', () => {
  it('groups only original-body literal evidence and allows source overlap without market claims', () => {
    const original = corpus();
    const result = groupResearchThemes(original);
    expect(result).toMatchObject({
      kind: 'local_caller_defined_theme_grouping',
      status: 'available',
      themeOrigin: 'caller_defined',
      sourceTrust: 'caller_supplied_unverified',
      verification: 'not_performed',
      topic: 'Applied research',
      unmatchedSourceIds: ['s3'],
      warnings: [
        'caller_sources_unverified',
        'coverage_is_corpus_only',
        'dates_caller_reported_only',
        'themes_caller_defined_only',
      ],
    });
    expect(result.themeGroups).toHaveLength(2);
    expect(result.themeGroups[0]).toMatchObject({
      id: 'agents',
      label: original.themes[0]!.label,
      sourceIds: ['s1'],
    });
    expect(result.themeGroups[1]).toMatchObject({ id: 'retrieval', sourceIds: ['s1', 's2'] });
    expect(result.themeGroups[0]!.phrases[0]!.term).toBe('Agentic systems');
    const span = result.themeGroups[0]!.phrases[0]!.evidence[0]!;
    expect(span).toMatchObject({
      sourceId: 's1',
      field: 'body',
      start: 3,
      end: 18,
      offsetUnit: 'utf16',
      endExclusive: true,
      quote: 'Agentic systems',
    });
    expect(original.sources[0]!.body.slice(span.start, span.end)).toBe(span.quote);
    expect(result.sourceSummaries[0]!.publicationDate).toMatchObject({
      state: 'reported',
      sourceClaim: 'caller_reported',
    });
    expect(JSON.stringify(result)).not.toContain('Nothing matched.');
    expect(JSON.stringify(result)).not.toContain('verified_trend');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.themeGroups[0]!.phrases[0]!.evidence)).toBe(true);
    expect(Object.isFrozen(result.unmatchedSourceIds)).toBe(true);
    expect(groupResearchThemes(original)).toEqual(result);
  });

  it('maps a caller phrase equal to the context topic without losing or misattributing the original span', () => {
    const value = corpus();
    const result = groupResearchThemes({
      topic: 'AI',
      themes: [
        { id: 'topic', label: 'Chosen by caller', phrases: ['ai'] },
        { id: 'other', label: 'Other caller name', phrases: ['RAG'] },
      ],
      sources: [
        { ...value.sources[0], body: 'AI and RAG appear here.' },
        { ...value.sources[1], body: 'AI_tech and RAG_tail are not whole words.' },
      ],
    });
    expect(result.themeGroups[0]!.phrases[0]).toMatchObject({
      term: 'ai',
      state: 'observed_in_supplied_corpus',
    });
    expect(result.themeGroups[0]!.phrases[0]!.evidence).toEqual([
      expect.objectContaining({ sourceId: 's1', quote: 'AI', start: 0, end: 2 }),
    ]);
    expect(result.themeGroups[1]!.sourceIds).toEqual(['s1']);
    expect(result.unmatchedSourceIds).toEqual(['s2']);
  });

  it('never maps Unicode lowercase topic collisions onto literal evidence from a different phrase', () => {
    const value = corpus();
    for (const [topic, phrase, body] of [
      ['İ', 'i\u0307', 'İ other text'],
      ['i\u0307', 'İ', 'i\u0307 other text'],
    ]) {
      expect(() =>
        groupResearchThemes({
          topic,
          themes: [{ id: 'literal', label: 'Explicit caller label', phrases: [phrase] }],
          sources: [{ ...value.sources[0], body }],
        }),
      ).toThrow(/theme/u);
    }
  });

  it('reports corpus-only non-observation and insufficient sources without inferring a gap', () => {
    const value = corpus();
    const result = groupResearchThemes({
      topic: 'Knowledge',
      themes: [{ id: 'missing', label: 'Not proof of a market gap', phrases: ['Never found'] }],
      sources: [value.sources[2]],
    });
    expect(result.status).toBe('insufficient_evidence');
    expect(result.themeGroups[0]).toMatchObject({
      sourceIds: [],
      phrases: [{ term: 'Never found', state: 'not_observed_in_supplied_corpus', evidence: [] }],
    });
    expect(result.unmatchedSourceIds).toEqual(['s3']);
    expect(result.warnings).toContain('insufficient_sources');
  });

  it('rejects unknown fields, duplicates, malformed Unicode and hostile theme data without reading getters', () => {
    const value = corpus();
    for (const input of [
      { ...value, provider: 'OFFICIAL_API' },
      { ...value, focusTerms: ['RAG'] },
      { ...value, topic: 'first\u2028second' },
      { ...value, topic: 'first\u2029second' },
      { ...value, themes: [{ ...value.themes[0], verified: true }] },
      { ...value, themes: [value.themes[0], { ...value.themes[1], id: 'agents' }] },
      {
        ...value,
        themes: [value.themes[0], { ...value.themes[1], label: 'CALLER-DEFINED AUTOMATION THEME' }],
      },
      { ...value, themes: [value.themes[0], { ...value.themes[1], phrases: ['agentic systems'] }] },
      { ...value, themes: [{ ...value.themes[0], phrases: ['bad\ud800'] }] },
      { ...value, themes: [{ ...value.themes[0], label: 'first\u2028second' }] },
      { ...value, themes: [{ ...value.themes[0], label: 'first\u2029second' }] },
      { ...value, themes: [{ ...value.themes[0], phrases: ['line\u2028break'] }] },
      { ...value, themes: [{ ...value.themes[0], phrases: ['para\u2029break'] }] },
      { ...value, themes: [{ ...value.themes[0], phrases: Array(2) }] },
      { ...value, themes: Array(2) },
      { ...value, themes: Array.from({ length: 5 }, (_, i) => ({ ...value.themes[0], id: 't' + i })) },
      {
        ...value,
        themes: [{ ...value.themes[0], phrases: Array.from({ length: 4 }, (_, i) => 'term' + i) }],
      },
    ])
      expect(() => groupResearchThemes(input)).toThrow();
    let called = false;
    const getter = Object.defineProperty({ ...value.themes[0] }, 'phrases', {
      enumerable: true,
      get() {
        called = true;
        throw new Error('SECRET');
      },
    });
    expect(() => groupResearchThemes({ ...value, themes: [getter] })).toThrow();
    expect(called).toBe(false);
    expect(() => groupResearchThemes({ ...value, themes: [new Proxy(value.themes[0]!, {})] })).toThrow();
    expect(() => groupResearchThemes(new Proxy(value, {}))).toThrow();
  });

  it('rejects distinct-looking phrases that the inherited Unicode /iu matcher treats as the same evidence', () => {
    const value = corpus();
    for (const [first, second] of [
      ['s', 'ſ'],
      ['σ', 'ς'],
      ['k', 'K'],
      ['İ', 'i\u0307'],
    ]) {
      expect(() =>
        groupResearchThemes({
          ...value,
          themes: [
            { id: 'first', label: 'First caller theme', phrases: [first] },
            { id: 'second', label: 'Second caller theme', phrases: [second] },
          ],
        }),
      ).toThrow(/duplicate theme phrase/u);
    }
  });

  it('preserves the 96 KiB pure output ceiling for otherwise valid bounded caller data', () => {
    const topic = 'Topic ' + 'Q'.repeat(153);
    const phrases = Array.from(
      { length: 12 },
      (_, i) => 'term' + String(i).padStart(2, '0') + 'X'.repeat(74),
    );
    const sources = Array.from({ length: 20 }, (_, i) => ({
      id: 'source' + String(i).padStart(2, '0') + 's'.repeat(71),
      title: 'T'.repeat(240),
      url: 'https://research.example.org/' + 'p'.repeat(1930) + i,
      body: [topic, ...phrases].join(' '),
    }));
    expect(() =>
      groupResearchThemes({
        topic,
        themes: [
          { id: 't1', label: 'Theme one', phrases: phrases.slice(0, 3) },
          { id: 't2', label: 'Theme two', phrases: phrases.slice(3, 6) },
          { id: 't3', label: 'Theme three', phrases: phrases.slice(6, 9) },
          { id: 't4', label: 'Theme four', phrases: phrases.slice(9, 12) },
        ],
        sources,
      }),
    ).toThrow(ResearchOutputTooLargeError);
  });
});

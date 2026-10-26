import { describe, expect, it } from 'vitest';

import { analyzeResearchCorpus, ResearchOutputTooLargeError } from '../src/research/content-analysis.js';

const input = () => ({
  topic: 'Agentic systems',
  focusTerms: ['RAG', 'AI agents', 'blockchain'],
  sources: [
    {
      id: 'a',
      title: 'Research one',
      url: 'https://research.example.org/one',
      body: 'RAG is used by AI agents. RAG supports retrieval.',
      publishedAt: '2026-10-24T09:00:00Z',
    },
    {
      id: 'b',
      title: 'Research two',
      url: 'https://research.example.net/two',
      body: 'Many AI agents integrate RAG.',
    },
  ],
});

describe('M10 pure research intelligence — caller-supplied and unverified', () => {
  it('reports topic-first literal coverage with one exact UTF-16 span per source and never claims market trends', () => {
    const corpus = input();
    const result = analyzeResearchCorpus(corpus);
    expect(result).toMatchObject({
      kind: 'local_corpus_analysis',
      status: 'available',
      sourceTrust: 'caller_supplied_unverified',
      verification: 'not_performed',
      topic: 'Agentic systems',
      termCoverage: [
        { term: 'Agentic systems', state: 'not_observed_in_supplied_corpus', evidence: [] },
        { term: 'RAG', state: 'observed_in_supplied_corpus' },
        { term: 'AI agents', state: 'observed_in_supplied_corpus' },
        { term: 'blockchain', state: 'not_observed_in_supplied_corpus', evidence: [] },
      ],
      warnings: ['caller_sources_unverified', 'coverage_is_corpus_only', 'dates_caller_reported_only'],
      sourceSummaries: [
        {
          id: 'a',
          sourceTrust: 'caller_supplied_unverified',
          publicationDate: { state: 'reported', sourceClaim: 'caller_reported' },
        },
        { id: 'b', sourceTrust: 'caller_supplied_unverified', publicationDate: { state: 'unknown' } },
      ],
      duplicateGroups: [],
    });
    expect(JSON.stringify(result)).not.toContain('RAG supports retrieval.');
    expect(result).not.toHaveProperty('trend');
    expect(result).not.toHaveProperty('marketGap');
    expect(result).not.toHaveProperty('competitorRank');
    for (const term of result.termCoverage) {
      expect(new Set(term.evidence.map((e) => e.sourceId)).size).toBe(term.evidence.length);
      for (const e of term.evidence) {
        const source = corpus.sources.find((s) => s.id === e.sourceId)!;
        expect(e).toMatchObject({ field: 'body', endExclusive: true, offsetUnit: 'utf16' });
        expect(source.body.slice(e.start, e.end)).toBe(e.quote);
        expect(e.quote.length).toBeLessThanOrEqual(160);
      }
    }
    expect(result.termCoverage[1]?.evidence.map((e) => e.sourceId)).toEqual(['a', 'b']);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.termCoverage[1]?.evidence)).toBe(true);
  });

  it('preserves astral Unicode and original whitespace offsets with phrase matching and no partial words', () => {
    const result = analyzeResearchCorpus({
      topic: 'Remote teams',
      focusTerms: ['SQL', 'AI', 'Missing'],
      sources: [
        {
          id: 'a',
          title: 'One',
          url: 'https://research.example.org/a',
          body: '🧑‍💻 Remote   teams share notes\nSQL use; said is unrelated.',
        },
        {
          id: 'b',
          title: 'Two',
          url: 'https://research.example.org/b',
          body: 'REMOTE\tTEAMS document decisions',
        },
      ],
    });
    expect(result.termCoverage.map((x) => x.term)).toEqual(['Remote teams', 'SQL', 'AI', 'Missing']);
    expect(result.termCoverage[0]?.evidence.length).toBe(2);
    expect(result.termCoverage[0]?.evidence[0]?.quote).toBe('Remote   teams');
    expect(result.termCoverage[0]?.evidence[1]?.quote).toBe('REMOTE\tTEAMS');
    expect(result.termCoverage[1]?.evidence[0]?.quote).toBe('SQL');
    expect(result.termCoverage[2]).toMatchObject({ state: 'not_observed_in_supplied_corpus', evidence: [] });
    for (const item of result.termCoverage)
      for (const e of item.evidence) {
        const original = [
          '🧑‍💻 Remote   teams share notes\nSQL use; said is unrelated.',
          'REMOTE\tTEAMS document decisions',
        ][e.sourceId === 'a' ? 0 : 1];
        expect(original?.slice(e.start, e.end)).toBe(e.quote);
      }
  });

  it('does not report matches inside Unicode combining or connector word continuations', () => {
    const c = input();
    const result = analyzeResearchCorpus({
      ...c,
      topic: 'AI',
      focusTerms: ['RAG'],
      sources: [
        { ...c.sources[0], body: 'AI\u0301 and AI_tech and RAG\u0301 only' },
        { ...c.sources[1], body: 'AI\u200Dteam and RAG_tail only' },
      ],
    });
    expect(result.termCoverage[0]).toMatchObject({
      term: 'AI',
      state: 'not_observed_in_supplied_corpus',
      evidence: [],
    });
    expect(result.termCoverage[1]).toMatchObject({
      term: 'RAG',
      state: 'not_observed_in_supplied_corpus',
      evidence: [],
    });
  });

  it('finds only exact duplicate bodies, not case or whitespace-normalized similarities', () => {
    const c = input();
    const sources = [
      { ...c.sources[0], body: 'Identical text.' },
      { ...c.sources[1], body: 'Identical text.' },
      { ...c.sources[1], id: 'c', body: 'identical text.' },
      { ...c.sources[1], id: 'd', body: 'Identical  text.' },
    ];
    const r = analyzeResearchCorpus({ ...c, sources });
    expect(r.duplicateGroups).toEqual([{ sourceIds: ['a', 'b'] }]);
  });

  it('reports single-source insufficiency and caller-reported dates without inventing verification', () => {
    const c = input();
    const r = analyzeResearchCorpus({ ...c, sources: [c.sources[0]] });
    expect(r.status).toBe('insufficient_evidence');
    expect(r.termCoverage[1]?.evidence[0]?.quote).toBe('RAG');
    expect(r.warnings).toContain('insufficient_sources');
    expect(r.sourceSummaries[0]?.publicationDate).toEqual({
      state: 'reported',
      publishedAt: '2026-10-24T09:00:00Z',
      sourceClaim: 'caller_reported',
    });
  });

  it('rejects pure output larger than 96 KiB, rather than succeeding after dropping evidence', () => {
    expect(() =>
      analyzeResearchCorpus({
        topic: 'Evidence',
        sources: Array.from({ length: 3 }, (_, i) => ({
          id: 'source-' + i,
          title: 'Large source',
          url: 'https://research.example.org/source-' + i,
          body: 'x'.repeat(43_000) + i,
        })),
      }),
    ).not.toThrow();
    // Each report contains short summaries, not bodies; a huge input must not
    // automatically make the output huge. The result still has a hard 96KiB guard.
    const r = analyzeResearchCorpus(input());
    expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThanOrEqual(96 * 1024);
    expect(ResearchOutputTooLargeError).toBeDefined();
    const topic = 'Topic ' + 'Q'.repeat(153);
    const focusTerms = Array.from(
      { length: 12 },
      (_, i) => 'term' + String(i).padStart(2, '0') + 'X'.repeat(74),
    );
    const oversizedReport = {
      topic,
      focusTerms,
      sources: Array.from({ length: 20 }, (_, i) => ({
        id: 'source' + String(i).padStart(2, '0') + 's'.repeat(71),
        title: 'T'.repeat(240),
        url: 'https://research.example.org/' + 'p'.repeat(1930) + i,
        body: [topic, ...focusTerms].join(' '),
      })),
    };
    expect(() => analyzeResearchCorpus(oversizedReport)).toThrow(ResearchOutputTooLargeError);
  });

  it('returns stable immutable results for matching caller-provided data', () => {
    const a = analyzeResearchCorpus(input());
    const b = analyzeResearchCorpus(input());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(() => (a.termCoverage[1]?.evidence as unknown as unknown[]).push({ forged: true })).toThrow();
  });
});

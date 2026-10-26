import { describe, expect, it } from 'vitest';

import { normalizeResearchCorpus } from '../src/content-research.js';

const corpus = () => ({
  topic: 'Agentic AI',
  focusTerms: ['RAG', 'AI agents'],
  sources: [
    {
      id: 'ref-1',
      title: 'Independent study',
      url: 'https://research.example.org/study',
      body: 'RAG systems and AI agents are discussed here.\nRAG is a technique.',
      publishedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'ref-2',
      title: 'Engineering notes',
      url: 'https://notes.example.net/ai',
      body: 'AI agents can use RAG for retrieval.',
    },
  ],
});

describe('M10 local-only research input normalization', () => {
  it('keeps source prose and reported dates unchanged and cannot upgrade user input to verified evidence', () => {
    const input = corpus();
    const result = normalizeResearchCorpus(input);
    expect(result).toMatchObject({
      topic: 'Agentic AI',
      focusTerms: ['RAG', 'AI agents'],
      sourceTrust: 'caller_supplied_unverified',
    });
    expect(result.sources[0]).toMatchObject({
      id: 'ref-1',
      body: input.sources[0]?.body,
      publishedAt: '2026-10-01T00:00:00Z',
      sourceTrust: 'caller_supplied_unverified',
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.sources)).toBe(true);
    expect(Object.isFrozen(result.sources[0])).toBe(true);
    input.sources[0]!.body = 'tampered';
    expect(result.sources[0]?.body).toContain('RAG systems');
  });

  it('rejects arbitrary provider/verification fields and hostile object shapes without calling getters', () => {
    expect(() => normalizeResearchCorpus({ ...corpus(), provider: 'OFFICIAL_API' })).toThrow(
      /Invalid research corpus/,
    );
    expect(() => normalizeResearchCorpus({ ...corpus(), verified: true })).toThrow(/Invalid research corpus/);
    expect(() =>
      normalizeResearchCorpus({
        ...corpus(),
        sources: [{ ...corpus().sources[0], sourceTrust: 'verified' }],
      }),
    ).toThrow(/Invalid research corpus/);
    expect(() =>
      normalizeResearchCorpus({
        ...corpus(),
        sources: [{ ...corpus().sources[0], retrievedAt: '2026-10-25T00:00:00Z' }],
      }),
    ).toThrow(/Invalid research corpus/);
    expect(() => normalizeResearchCorpus(new Proxy(corpus(), {}))).toThrow(/Invalid research corpus/);
    const getter = Object.defineProperty(corpus(), 'provider', {
      enumerable: true,
      get: () => {
        throw new Error('SECRET CANARY');
      },
    });
    expect(() => normalizeResearchCorpus(getter)).toThrow(/Invalid research corpus/);
  });

  it('rejects duplicate IDs, malformed Unicode, invalid reported dates and secret-bearing URL aliases', () => {
    expect(() =>
      normalizeResearchCorpus({
        ...corpus(),
        sources: [corpus().sources[0], { ...corpus().sources[1], id: 'ref-1' }],
      }),
    ).toThrow(/Invalid research corpus/);
    expect(() =>
      normalizeResearchCorpus({ ...corpus(), sources: [{ ...corpus().sources[0], body: 'bad\ud800' }] }),
    ).toThrow(/Invalid research corpus/);
    expect(() =>
      normalizeResearchCorpus({
        ...corpus(),
        sources: [{ ...corpus().sources[0], publishedAt: '2026-02-30T00:00:00Z' }],
      }),
    ).toThrow(/Invalid research corpus/);
    for (const query of ['code', 'Access-Code', 'access%43ode', 'ticket', 't%2569cket', 'api_key']) {
      expect(() =>
        normalizeResearchCorpus({
          ...corpus(),
          sources: [{ ...corpus().sources[0], url: `https://research.example.org/study?${query}=canary` }],
        }),
      ).toThrow(/Invalid research corpus/);
    }
    expect(() =>
      normalizeResearchCorpus({
        ...corpus(),
        sources: [{ ...corpus().sources[0], url: 'https://127.0.0.1/research' }],
      }),
    ).toThrow(/Invalid research corpus/);
    expect(() =>
      normalizeResearchCorpus({
        ...corpus(),
        sources: [{ ...corpus().sources[0], url: 'https://research.example.org/study?topic=%ZZ' }],
      }),
    ).toThrow(/Invalid research corpus/);
  });

  it('preserves legitimate query keys and rejects excessive or sparse inputs', () => {
    const input = {
      ...corpus(),
      sources: [
        {
          ...corpus().sources[0],
          url: 'https://research.example.org/study?languageCode=en&discount_code=public',
        },
      ],
    };
    expect(normalizeResearchCorpus(input).sources[0]?.url).toContain('languageCode=en');
    expect(() => normalizeResearchCorpus({ ...corpus(), sources: Array(2) })).toThrow(
      /Invalid research corpus/,
    );
    expect(() =>
      normalizeResearchCorpus({
        ...corpus(),
        sources: Array.from({ length: 21 }, (_, i) => ({ ...corpus().sources[0], id: `s${i}` })),
      }),
    ).toThrow(/Invalid research corpus/);
    expect(() =>
      normalizeResearchCorpus({
        ...corpus(),
        sources: [{ ...corpus().sources[0], body: 'X'.repeat(50_001) }],
      }),
    ).toThrow(/Invalid research corpus/);
    expect(() =>
      normalizeResearchCorpus({
        ...corpus(),
        sources: Array.from({ length: 4 }, (_, i) => ({
          ...corpus().sources[0],
          id: 'id-' + i,
          body: '\\'.repeat(49_000),
        })),
      }),
    ).toThrow(/Invalid research corpus/);
  });

  it('rejects signed URL aliases, nested encoded controls and canonical URL expansion', () => {
    const fixture = corpus();
    for (const url of [
      'https://research.example.org/study?AWSAccessKeyId=canary',
      'https://research.example.org/study?GoogleAccessId=canary',
      'https://research.example.org/study?access_key_id=canary',
      'https://research.example.org/study?q=%250a',
      'https://research.example.org/study?q=%c2%9b',
      'https://portal.private/study',
      'https://portal.corp/study',
      'https://research.example.org/' + 'é'.repeat(800),
    ]) {
      expect(() =>
        normalizeResearchCorpus({
          ...fixture,
          sources: [{ ...fixture.sources[0], url }],
        }),
      ).toThrow('Invalid research corpus: source.url');
    }
    for (const unsafeField of ['A\u009b31m', 'T\u0080X']) {
      expect(() => normalizeResearchCorpus({ ...fixture, topic: unsafeField })).toThrow();
      expect(() =>
        normalizeResearchCorpus({
          ...fixture,
          sources: [{ ...fixture.sources[0], title: unsafeField }],
        }),
      ).toThrow();
    }
  });
});

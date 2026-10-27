import { describe, expect, it } from 'vitest';
import { normalizeResearchCorpus } from '../../../packages/core/dist/index.js';

import { prepareResearchRepurposingEvidence } from '../src/research/repurposing-evidence.js';

const fixture = () => ({
  topic: 'Caller notes',
  sources: [
    {
      id: 'alpha',
      title: 'Caller source alpha',
      url: 'https://RESEARCH.example.org/old/../one',
      body: '🤖 RAG\tworks. Human review is required. PRIVATE_UNSELECTED_BODY',
      publishedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'beta',
      title: 'Caller source beta',
      url: 'https://research.example.org/two',
      body: 'SQL and queues are mentioned here.',
    },
  ],
  targets: [
    {
      id: 'post',
      label: 'Post evidence',
      format: 'post',
      selections: [{ sourceId: 'alpha', start: 3, end: 12 }],
    },
    {
      id: 'article',
      label: 'Article evidence',
      format: 'article',
      selections: [{ sourceId: 'beta', start: 0, end: 3 }],
    },
  ],
});

describe('M10.4 caller-curated local repurposing evidence preparation', () => {
  it('rejects padded raw source, target and selection IDs rather than silently rewriting attribution', () => {
    const req = fixture();
    const cases = [
      { ...req, sources: [{ ...req.sources[0], id: ' alpha ' }, req.sources[1]] },
      { ...req, targets: [{ ...req.targets[0], id: ' post ' }] },
      {
        ...req,
        targets: [
          {
            ...req.targets[0],
            selections: [{ ...req.targets[0]!.selections[0], sourceId: ' alpha ' }],
          },
        ],
      },
    ];
    for (const candidate of cases)
      expect(() => prepareResearchRepurposingEvidence(candidate)).toThrow(/Invalid repurposing evidence/u);
  });

  it('preserves exactly selected original UTF16 quotes and formats without inventing a draft', () => {
    const request = fixture();
    const result = prepareResearchRepurposingEvidence(request);
    expect(result).toMatchObject({
      kind: 'local_caller_curated_repurposing_evidence',
      status: 'available',
      selectionOrigin: 'caller_defined_utf16_offsets',
      sourceTrust: 'caller_supplied_unverified',
      verification: 'not_performed',
      topic: 'Caller notes',
      warnings: [
        'caller_sources_unverified',
        'selections_caller_defined_only',
        'evidence_is_excerpt_only',
        'human_review_required',
        'dates_caller_reported_only',
      ],
      targets: [
        {
          id: 'post',
          label: 'Post evidence',
          format: 'post',
          excerpts: [
            {
              sourceId: 'alpha',
              field: 'body',
              start: 3,
              end: 12,
              offsetUnit: 'utf16',
              endExclusive: true,
              quote: 'RAG\tworks',
            },
          ],
        },
        {
          id: 'article',
          label: 'Article evidence',
          format: 'article',
          excerpts: [
            {
              sourceId: 'beta',
              field: 'body',
              start: 0,
              end: 3,
              offsetUnit: 'utf16',
              endExclusive: true,
              quote: 'SQL',
            },
          ],
        },
      ],
    });
    expect(result.sourceSummaries.map((source) => source.url)).toEqual([
      'https://research.example.org/one',
      'https://research.example.org/two',
    ]);
    expect(result.sourceSummaries[0]?.publicationDate).toMatchObject({
      state: 'reported',
      sourceClaim: 'caller_reported',
    });
    for (const target of result.targets)
      for (const span of target.excerpts) {
        const source = request.sources.find((entry) => entry.id === span.sourceId)!;
        expect(span.quote).toBe(source.body.slice(span.start, span.end));
      }
    expect(JSON.stringify(result)).not.toContain('PRIVATE_UNSELECTED_BODY');
    expect(JSON.stringify(result)).not.toContain('draftText');
    expect(Object.isFrozen(result.targets[0]?.excerpts[0])).toBe(true);
    expect(Object.isFrozen(result.targets)).toBe(true);
    expect(prepareResearchRepurposingEvidence(request)).toEqual(result);
  });

  it('rejects invalid source IDs, bounds, duplicate targets and extraneous input keys', () => {
    const req = fixture();
    for (const candidate of [
      { ...req, verified: true },
      { ...req, targets: [] },
      { ...req, targets: [req.targets[0]].concat([req.targets[0], req.targets[0], req.targets[0]]) },
      { ...req, targets: [{ ...req.targets[0], format: 'video' }] },
      { ...req, targets: [{ ...req.targets[0], sourceTrust: 'verified' }] },
      { ...req, targets: [{ ...req.targets[0], selections: [] }] },
      { ...req, targets: [{ ...req.targets[0], selections: [{ sourceId: 'missing', start: 0, end: 3 }] }] },
      { ...req, targets: [{ ...req.targets[0], selections: [{ sourceId: 'ALPHA', start: 0, end: 3 }] }] },
      { ...req, targets: [{ ...req.targets[0], selections: [{ sourceId: 'alpha', start: 0, end: 9999 }] }] },
      { ...req, targets: [{ ...req.targets[0], selections: [{ sourceId: 'alpha', start: 7, end: 7 }] }] },
      { ...req, targets: [{ ...req.targets[0], selections: [{ sourceId: 'alpha', start: -1, end: 2 }] }] },
      { ...req, targets: [{ ...req.targets[0], selections: [{ sourceId: 'alpha', start: 0.5, end: 3 }] }] },
      { ...req, targets: [{ ...req.targets[0], selections: [{ sourceId: 'alpha', start: -0, end: 3 }] }] },
      { ...req, targets: [{ ...req.targets[0], selections: [{ sourceId: 'alpha', start: 1, end: 3 }] }] },
      { ...req, targets: [{ ...req.targets[0], selections: [{ sourceId: 'alpha', start: 0, end: 1 }] }] },
      { ...req, targets: [{ ...req.targets[0], selections: [{ sourceId: 'alpha', start: 3, end: 164 }] }] },
      {
        ...req,
        targets: [
          {
            ...req.targets[0],
            selections: [
              { sourceId: 'alpha', start: 3, end: 8 },
              { sourceId: 'alpha', start: 3, end: 8 },
            ],
          },
        ],
      },
      { ...req, targets: [req.targets[0], { ...req.targets[1], id: 'POST' }] },
      { ...req, topic: 'Hidden\u2028line' },
      {
        ...req,
        targets: [
          {
            ...req.targets[0],
            selections: Array.from({ length: 5 }, (_, i) => ({
              sourceId: 'alpha',
              start: i + 3,
              end: i + 4,
            })),
          },
          {
            ...req.targets[1],
            selections: Array.from({ length: 5 }, (_, i) => ({ sourceId: 'beta', start: i, end: i + 1 })),
          },
          {
            id: 'carousel',
            label: 'Carousel notes',
            format: 'carousel',
            selections: Array.from({ length: 3 }, (_, i) => ({
              sourceId: 'beta',
              start: i + 9,
              end: i + 10,
            })),
          },
        ],
      },
      { ...req, sources: [] },
      { ...req, sources: Array.from({ length: 21 }, (_, i) => ({ ...req.sources[0], id: 's' + i })) },
    ])
      expect(() => prepareResearchRepurposingEvidence(candidate)).toThrow();
  });

  it('rejects whitespace-only selections even when source body also contains nonblank text', () => {
    const req = fixture();
    const body = '   \nSQL appears later';
    expect(() =>
      prepareResearchRepurposingEvidence({
        ...req,
        sources: [{ ...req.sources[0], body }, req.sources[1]],
        targets: [{ ...req.targets[0], selections: [{ sourceId: 'alpha', start: 0, end: 4 }] }],
      }),
    ).toThrow(/Invalid repurposing evidence/u);
  });

  it('bounds the entire curated request including target metadata beyond the inherited normalized corpus', () => {
    const sources = Array.from({ length: 5 }, (_, i) => ({
      id: 'source' + i,
      title: 'Caller data',
      url: 'https://research.example.org/source' + i,
      body: 'X'.repeat(i === 4 ? 3400 : 50000),
    }));
    const targets = Array.from({ length: 3 }, (_, i) => ({
      id: 'target' + i,
      label: 'Evidence packet ' + i,
      format: 'post',
      selections: Array.from({ length: 4 }, (_, n) => ({
        sourceId: 'source' + (n % 5),
        start: i * 4 + n,
        end: i * 4 + n + 1,
      })),
    }));
    const corpus = normalizeResearchCorpus({ topic: 'One bounded corpus', sources });
    expect(Buffer.byteLength(JSON.stringify(corpus), 'utf8')).toBeLessThanOrEqual(200 * 1024);
    expect(
      Buffer.byteLength(JSON.stringify({ topic: corpus.topic, sources: corpus.sources, targets }), 'utf8'),
    ).toBeGreaterThan(200 * 1024);
    expect(() =>
      prepareResearchRepurposingEvidence({ topic: 'One bounded corpus', sources, targets }),
    ).toThrow(/Invalid|invalid/u);
  });

  it('handles astral UTF16 offsets, safe prototype-like IDs, multiple formats and unselected privacy', () => {
    const req = fixture();
    const body = '🧑‍💻 Remote\t teams are distributed';
    const input = {
      topic: 'Remote work',
      sources: [
        { id: 'constructor', title: req.sources[0]!.title, url: req.sources[0]!.url, body },
        { ...req.sources[1], id: 'toString', body: 'SQL is relevant.' },
        {
          id: 'unselected',
          title: 'PRIVATE_TITLE_CANARY',
          url: 'https://research.example.org/PRIVATE_URL_CANARY',
          body: 'PRIVATE_BODY_CANARY',
        },
      ],
      targets: [
        {
          id: 'post',
          label: 'Post',
          format: 'post',
          selections: [{ sourceId: 'constructor', start: 0, end: 5 }],
        },
        {
          id: 'article',
          label: 'Article',
          format: 'article',
          selections: [{ sourceId: 'toString', start: 0, end: 3 }],
        },
        {
          id: 'carousel',
          label: 'Carousel',
          format: 'carousel',
          selections: [{ sourceId: 'constructor', start: 6, end: 12 }],
        },
      ],
    };
    const result = prepareResearchRepurposingEvidence(input);
    expect(result.targets.map((target) => target.format)).toEqual(['post', 'article', 'carousel']);
    expect(result.targets[0]?.excerpts[0]).toMatchObject({ quote: '🧑‍💻', start: 0, end: 5 });
    expect(result.targets[2]?.excerpts[0]).toMatchObject({ quote: 'Remote', start: 6, end: 12 });
    expect(result.sourceSummaries.map((source) => source.id)).toEqual(['constructor', 'toString']);
    for (const canary of ['PRIVATE_TITLE_CANARY', 'PRIVATE_URL_CANARY', 'PRIVATE_BODY_CANARY'])
      expect(JSON.stringify(result)).not.toContain(canary);
    expect(result.warnings).not.toContain('dates_caller_reported_only');
  });

  it('rejects hostile proxies, getters, extra/sparse arrays and secret-bearing field names without touching getters', () => {
    const req = fixture();
    let reads = 0;
    const root = { ...req };
    Object.defineProperty(root, 'targets', {
      enumerable: true,
      get() {
        reads++;
        throw Error('SECRET');
      },
    });
    const nested = { ...req.targets[0] };
    Object.defineProperty(nested, 'label', {
      enumerable: true,
      get() {
        reads++;
        throw Error('SECRET');
      },
    });
    const source = { ...req.sources[0] };
    Object.defineProperty(source, 'body', {
      enumerable: true,
      get() {
        reads++;
        throw Error('SECRET');
      },
    });
    const extra = [...req.targets] as typeof req.targets & { secret?: string };
    extra.secret = 'SECRET';
    const hole = [...req.targets];
    hole.length = 3;
    const symbol = { ...req, [Symbol('sensitive')]: 'SECRET' };
    for (const candidate of [
      root,
      symbol,
      new Proxy(req, {}),
      { ...req, sources: [source, req.sources[1]] },
      { ...req, targets: [nested, req.targets[1]] },
      { ...req, targets: new Proxy(req.targets, {}) },
      { ...req, targets: extra },
      { ...req, targets: hole },
      {
        ...req,
        targets: [
          { ...req.targets[0], selections: new Proxy(req.targets[0]!.selections, {}) },
          req.targets[1],
        ],
      },
      Object.assign(Object.create(null), req),
    ])
      expect(() => prepareResearchRepurposingEvidence(candidate)).toThrow(/Invalid|invalid/u);
    expect(reads).toBe(0);
  });
});

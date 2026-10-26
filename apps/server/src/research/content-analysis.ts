import { normalizeResearchCorpus, type ResearchCorpus } from '../../../../packages/core/dist/index.js';

export interface ResearchEvidenceSpan {
  readonly sourceId: string;
  readonly field: 'body';
  readonly start: number;
  readonly end: number;
  readonly offsetUnit: 'utf16';
  readonly endExclusive: true;
  readonly quote: string;
}

export interface ResearchAnalysis {
  readonly kind: 'local_corpus_analysis';
  readonly status: 'available' | 'insufficient_evidence';
  readonly sourceTrust: 'caller_supplied_unverified';
  readonly verification: 'not_performed';
  readonly topic: string;
  readonly sourceSummaries: readonly Readonly<{
    id: string;
    title: string;
    url: string;
    publicationDate:
      | Readonly<{ state: 'unknown' }>
      | Readonly<{ state: 'reported'; publishedAt: string; sourceClaim: 'caller_reported' }>;
    sourceTrust: 'caller_supplied_unverified';
  }>[];
  readonly termCoverage: readonly Readonly<{
    term: string;
    state: 'observed_in_supplied_corpus' | 'not_observed_in_supplied_corpus';
    evidence: readonly ResearchEvidenceSpan[];
  }>[];
  readonly duplicateGroups: readonly Readonly<{ sourceIds: readonly string[] }>[];
  readonly warnings: readonly (
    | 'caller_sources_unverified'
    | 'coverage_is_corpus_only'
    | 'insufficient_sources'
    | 'dates_caller_reported_only'
  )[];
}

export class ResearchOutputTooLargeError extends Error {
  constructor() {
    super('Research analysis output exceeded safe size.');
    this.name = 'ResearchOutputTooLargeError';
  }
}

const MAX_ANALYSIS_BYTES = 96 * 1024;
const MAX_EVIDENCE_QUOTE = 160;
const lettersOrNumbers = /[\p{L}\p{N}\p{M}\p{Pc}\p{Join_Control}]/u;

function escapeRegex(term: string): string {
  let escaped = '';
  for (const ch of term) escaped += '\\^$.*+?()[]{}|'.includes(ch) ? '\\' + ch : ch;
  return escaped;
}

function previousCodePoint(body: string, start: number): string {
  if (start === 0) return '';
  let offset = start - 1;
  const last = body.charCodeAt(offset);
  if (last >= 0xdc00 && last <= 0xdfff && offset > 0) {
    const preceding = body.charCodeAt(offset - 1);
    if (preceding >= 0xd800 && preceding <= 0xdbff) offset -= 1;
  }
  return body.slice(offset, start);
}

function nextCodePoint(body: string, end: number): string {
  if (end >= body.length) return '';
  const value = body.codePointAt(end);
  return value === undefined ? '' : String.fromCodePoint(value);
}

function literalEvidence(body: string, phrase: string, sourceId: string): ResearchEvidenceSpan | undefined {
  const expression = phrase.split(/\s+/u).map(escapeRegex).join('\\s+');
  // Untrusted phrases contribute escaped literal tokens only; no regex operators.
  const pattern = new RegExp(expression, 'giu');
  for (const hit of body.matchAll(pattern)) {
    const start = hit.index;
    const end = start + hit[0].length;
    if (end - start > MAX_EVIDENCE_QUOTE) continue;
    if (
      lettersOrNumbers.test(previousCodePoint(body, start)) ||
      lettersOrNumbers.test(nextCodePoint(body, end))
    ) {
      continue;
    }
    return Object.freeze({
      sourceId,
      field: 'body',
      start,
      end,
      offsetUnit: 'utf16',
      endExclusive: true,
      quote: body.slice(start, end),
    });
  }
  return undefined;
}

function duplicateBodies(corpus: ResearchCorpus): readonly Readonly<{ sourceIds: readonly string[] }>[] {
  const bodies = new Map<string, string[]>();
  for (const source of corpus.sources) {
    const ids = bodies.get(source.body) ?? [];
    ids.push(source.id);
    bodies.set(source.body, ids);
  }
  return Object.freeze(
    [...bodies.values()]
      .filter((ids) => ids.length >= 2)
      .map((ids) => Object.freeze({ sourceIds: Object.freeze(ids) })),
  );
}

/**
 * Source-scoped literal corpus observations only. This never verifies articles,
 * market trends, competitor claims, publication dates or content popularity.
 */
export function analyzeResearchCorpus(input: unknown): Readonly<ResearchAnalysis> {
  const corpus = normalizeResearchCorpus(input);
  const topicKey = corpus.topic.toLocaleLowerCase('en-US');
  const terms = [
    corpus.topic,
    ...corpus.focusTerms.filter((term) => term.toLocaleLowerCase('en-US') !== topicKey),
  ];
  const sourceSummaries = Object.freeze(
    corpus.sources.map((source) =>
      Object.freeze({
        id: source.id,
        title: source.title,
        url: source.url,
        publicationDate: Object.freeze(
          source.publishedAt === undefined
            ? { state: 'unknown' as const }
            : {
                state: 'reported' as const,
                publishedAt: source.publishedAt,
                sourceClaim: 'caller_reported' as const,
              },
        ),
        sourceTrust: 'caller_supplied_unverified' as const,
      }),
    ),
  );
  const termCoverage = Object.freeze(
    terms.map((term) => {
      const evidence = corpus.sources.flatMap((source) => {
        const observed = literalEvidence(source.body, term, source.id);
        return observed === undefined ? [] : [observed];
      });
      return Object.freeze({
        term,
        state:
          evidence.length > 0
            ? ('observed_in_supplied_corpus' as const)
            : ('not_observed_in_supplied_corpus' as const),
        evidence: Object.freeze(evidence),
      });
    }),
  );
  const warnings: ResearchAnalysis['warnings'][number][] = [
    'caller_sources_unverified',
    'coverage_is_corpus_only',
  ];
  if (corpus.sources.length < 2) warnings.push('insufficient_sources');
  if (corpus.sources.some((source) => source.publishedAt !== undefined))
    warnings.push('dates_caller_reported_only');
  const report: ResearchAnalysis = Object.freeze({
    kind: 'local_corpus_analysis',
    status: corpus.sources.length < 2 ? 'insufficient_evidence' : 'available',
    sourceTrust: 'caller_supplied_unverified',
    verification: 'not_performed',
    topic: corpus.topic,
    sourceSummaries,
    termCoverage,
    duplicateGroups: duplicateBodies(corpus),
    warnings: Object.freeze(warnings),
  });
  if (Buffer.byteLength(JSON.stringify(report), 'utf8') > MAX_ANALYSIS_BYTES) {
    throw new ResearchOutputTooLargeError();
  }
  return report;
}

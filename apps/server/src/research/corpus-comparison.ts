import { types } from 'node:util';

import {
  analyzeResearchCorpus,
  ResearchOutputTooLargeError,
  type ResearchAnalysis,
} from './content-analysis.js';

export interface CorpusComparisonInput {
  readonly topic: string;
  readonly focusTerms: readonly string[];
  readonly sources: readonly Readonly<{
    id: string;
    title: string;
    url: string;
    body: string;
    publishedAt?: string;
  }>[];
  readonly cohorts: readonly Readonly<{
    id: string;
    label: string;
    sourceIds: readonly string[];
  }>[];
  readonly unmatchedSourceIds: readonly string[];
}

type Evidence = ResearchAnalysis['termCoverage'][number]['evidence'];

export interface LocalCohortComparison {
  readonly kind: 'local_caller_defined_corpus_comparison';
  readonly status: 'available';
  readonly comparisonOrigin: 'caller_defined_cohorts';
  readonly sourceTrust: 'caller_supplied_unverified';
  readonly verification: 'not_performed';
  readonly topic: string;
  readonly focusTerms: readonly string[];
  readonly sourceSummaries: ResearchAnalysis['sourceSummaries'];
  readonly cohorts: readonly Readonly<{
    id: string;
    label: string;
    sourceIds: readonly string[];
    termObservations: readonly Readonly<{
      term: string;
      state: 'observed_in_supplied_cohort' | 'not_observed_in_supplied_cohort';
      evidence: Evidence;
    }>[];
  }>[];
  readonly unmatchedSourceIds: readonly string[];
  readonly warnings: readonly (
    | 'caller_sources_unverified'
    | 'comparison_is_corpus_only'
    | 'cohorts_caller_defined_only'
    | 'single_source_cohort'
    | 'unmatched_sources_excluded'
    | 'dates_caller_reported_only'
  )[];
}

const MAX_COMPARISON_BYTES = 96 * 1024;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;

function invalid(label: string): never {
  // The label is a trusted literal chosen in this file, never user-authored.
  throw new Error('Invalid corpus comparison: ' + label);
}

function ownData(input: unknown, label: string, fields: readonly string[]): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== 'object' ||
    types.isProxy(input) ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    invalid(label);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const output: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !fields.includes(key)) invalid(label);
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid(label);
    output[key] = descriptor.value;
  }
  if (fields.some((field) => !Object.hasOwn(descriptors, field))) invalid(label);
  return output;
}

function ownDense(input: unknown, label: string, min: number, max: number): readonly unknown[] {
  if (
    types.isProxy(input) ||
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    input.length < min ||
    input.length > max ||
    Reflect.ownKeys(input).length !== input.length + 1
  )
    invalid(label);
  const out: unknown[] = [];
  for (let i = 0; i < input.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid(label);
    out.push(descriptor.value);
  }
  return out;
}

function singleLine(input: unknown, label: string, max: number): string {
  if (typeof input !== 'string' || !input.trim() || input.length > max) invalid(label);
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    if (
      cp < 32 ||
      (cp >= 127 && cp <= 159) ||
      (cp >= 0xd800 && cp <= 0xdfff) ||
      cp === 0x2028 ||
      cp === 0x2029
    )
      invalid(label);
  }
  return input.trim();
}

function matcherEquals(left: string, right: string): boolean {
  // A caller-supplied backslash must never turn into a regex escape (\\d).
  const metacharacters = '\\^$.*+?()[]{}|';
  const escaped = [...left.replace(/\s+/gu, ' ')]
    .map((character) => (metacharacters.includes(character) ? '\\' + character : character))
    .join('');
  return new RegExp('^(?:' + escaped + ')$', 'iu').test(right.replace(/\s+/gu, ' '));
}

function identicalTerm(left: string, right: string): boolean {
  return left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US') || matcherEquals(left, right);
}

interface Cohort {
  readonly id: string;
  readonly label: string;
  readonly sourceIds: readonly string[];
}

/** No provider access; compares only source-scoped evidence from one caller-supplied corpus. */
export function compareResearchCohorts(input: unknown): Readonly<LocalCohortComparison> {
  const root = ownData(input, 'input', ['topic', 'focusTerms', 'sources', 'cohorts', 'unmatchedSourceIds']);
  const topic = singleLine(root.topic, 'topic', 200);
  const focusTerms: string[] = [];
  for (const raw of ownDense(root.focusTerms, 'focusTerms', 1, 12)) {
    const term = singleLine(raw, 'focusTerm', 80);
    if (focusTerms.some((previous) => identicalTerm(previous, term))) invalid('duplicate focusTerm');
    // Lowercase alone can merge Unicode strings that the M10.0 literal
    // matcher considers distinct (Turkish dotted I, for example).
    if (topic.toLocaleLowerCase('en-US') === term.toLocaleLowerCase('en-US') && !matcherEquals(topic, term))
      invalid('focusTerm mapping');
    focusTerms.push(term);
  }

  const cohorts: Cohort[] = [];
  for (const raw of ownDense(root.cohorts, 'cohorts', 2, 2)) {
    const value = ownData(raw, 'cohort', ['id', 'label', 'sourceIds']);
    const id = singleLine(value.id, 'cohort.id', 80);
    if (!idPattern.test(id) || cohorts.some((cohort) => cohort.id.toLowerCase() === id.toLowerCase()))
      invalid('cohort.id');
    const label = singleLine(value.label, 'cohort.label', 80);
    if (cohorts.some((cohort) => identicalTerm(cohort.label, label))) invalid('cohort.label');
    const members: string[] = [];
    for (const rawId of ownDense(value.sourceIds, 'cohort.sourceIds', 1, 20)) {
      const sourceId = singleLine(rawId, 'cohort.sourceId', 80);
      if (!idPattern.test(sourceId) || members.includes(sourceId)) invalid('cohort.sourceId');
      members.push(sourceId);
    }
    cohorts.push(Object.freeze({ id, label, sourceIds: Object.freeze(members) }));
  }
  const unmatched: string[] = [];
  for (const raw of ownDense(root.unmatchedSourceIds, 'unmatchedSourceIds', 0, 20)) {
    const id = singleLine(raw, 'unmatchedSourceId', 80);
    if (!idPattern.test(id) || unmatched.includes(id)) invalid('unmatchedSourceId');
    unmatched.push(id);
  }

  // One analyzer call enforces the existing strict source descriptors/URL/date,
  // 200KiB normalized input, 96KiB intermediate and exact original UTF-16 spans.
  const analyzed = analyzeResearchCorpus({ topic, focusTerms, sources: root.sources });
  const allIds = analyzed.sourceSummaries.map((source) => source.id);
  const assignment = [...cohorts[0]!.sourceIds, ...cohorts[1]!.sourceIds, ...unmatched];
  if (
    assignment.length !== allIds.length ||
    new Set(assignment).size !== assignment.length ||
    assignment.some((id) => !allIds.includes(id))
  )
    invalid('source assignment');

  const projected = Object.freeze(
    cohorts.map((cohort) => {
      const memberSet = new Set(cohort.sourceIds);
      const sourceIds = Object.freeze(allIds.filter((id) => memberSet.has(id)));
      const termObservations = Object.freeze(
        focusTerms.map((term) => {
          const existing = matcherEquals(term, analyzed.topic)
            ? analyzed.termCoverage[0]
            : analyzed.termCoverage.find(
                (entry) => entry.term.toLocaleLowerCase('en-US') === term.toLocaleLowerCase('en-US'),
              );
          if (!existing) invalid('focusTerm mapping');
          const evidence = Object.freeze(existing.evidence.filter((span) => memberSet.has(span.sourceId)));
          return Object.freeze({
            term,
            state: evidence.length
              ? ('observed_in_supplied_cohort' as const)
              : ('not_observed_in_supplied_cohort' as const),
            evidence,
          });
        }),
      );
      return Object.freeze({ id: cohort.id, label: cohort.label, sourceIds, termObservations });
    }),
  );

  const unmatchedSet = new Set(unmatched);
  const unmatchedSourceIds = Object.freeze(allIds.filter((id) => unmatchedSet.has(id)));
  const warnings: LocalCohortComparison['warnings'] = Object.freeze([
    'caller_sources_unverified' as const,
    'comparison_is_corpus_only' as const,
    'cohorts_caller_defined_only' as const,
    ...(projected.some((cohort) => cohort.sourceIds.length === 1) ? ['single_source_cohort' as const] : []),
    ...(unmatchedSourceIds.length ? ['unmatched_sources_excluded' as const] : []),
    ...(analyzed.sourceSummaries.some((source) => source.publicationDate.state === 'reported')
      ? ['dates_caller_reported_only' as const]
      : []),
  ]);
  const result: LocalCohortComparison = Object.freeze({
    kind: 'local_caller_defined_corpus_comparison',
    status: 'available',
    comparisonOrigin: 'caller_defined_cohorts',
    sourceTrust: 'caller_supplied_unverified',
    verification: 'not_performed',
    topic: analyzed.topic,
    focusTerms: Object.freeze(focusTerms),
    sourceSummaries: analyzed.sourceSummaries,
    cohorts: projected,
    unmatchedSourceIds,
    warnings,
  });
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_COMPARISON_BYTES)
    throw new ResearchOutputTooLargeError();
  return result;
}

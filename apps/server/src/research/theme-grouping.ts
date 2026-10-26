import { types } from 'node:util';

import {
  analyzeResearchCorpus,
  ResearchOutputTooLargeError,
  type ResearchAnalysis,
} from './content-analysis.js';

export interface CallerThemeInput {
  readonly id: string;
  readonly label: string;
  readonly phrases: readonly string[];
}

export interface ThemeGroupingInput {
  readonly topic: string;
  readonly themes: readonly CallerThemeInput[];
  readonly sources: readonly Readonly<{
    id: string;
    title: string;
    url: string;
    body: string;
    publishedAt?: string;
  }>[];
}

export interface ThemeGroupingAnalysis {
  readonly kind: 'local_caller_defined_theme_grouping';
  readonly status: ResearchAnalysis['status'];
  readonly themeOrigin: 'caller_defined';
  readonly sourceTrust: 'caller_supplied_unverified';
  readonly verification: 'not_performed';
  readonly topic: string;
  readonly sourceSummaries: ResearchAnalysis['sourceSummaries'];
  readonly themeGroups: readonly Readonly<{
    id: string;
    label: string;
    sourceIds: readonly string[];
    phrases: readonly Readonly<{
      term: string;
      state: ResearchAnalysis['termCoverage'][number]['state'];
      evidence: ResearchAnalysis['termCoverage'][number]['evidence'];
    }>[];
  }>[];
  readonly unmatchedSourceIds: readonly string[];
  readonly warnings: readonly (ResearchAnalysis['warnings'][number] | 'themes_caller_defined_only')[];
}

const MAX_GROUPING_BYTES = 96 * 1024;
const themeIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;

function invalid(label: string): never {
  // A field label is selected by this module; no caller-authored key/value is echoed.
  throw new Error('Invalid theme grouping: ' + label);
}

function ownData(input: unknown, label: string, required: readonly string[]): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== 'object' ||
    types.isProxy(input) ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    invalid(label);
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  // Only fixed schema keys can reach this object; no user key is allowed to
  // shadow the prototype, and a plain object avoids unsafe any assignment.
  const normalized: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !required.includes(key)) invalid(label);
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) invalid(label);
    normalized[key] = descriptor.value;
  }
  for (const key of required) if (!Object.hasOwn(descriptors, key)) invalid(label);
  return normalized;
}

function ownDense(input: unknown, label: string, min: number, max: number): readonly unknown[] {
  if (
    types.isProxy(input) ||
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    input.length < min ||
    input.length > max ||
    Reflect.ownKeys(input).length !== input.length + 1
  ) {
    invalid(label);
  }
  const values: unknown[] = [];
  for (let i = 0; i < input.length; i++) {
    const property = Object.getOwnPropertyDescriptor(input, String(i));
    if (!property || !property.enumerable || !('value' in property)) invalid(label);
    values.push(property.value);
  }
  return values;
}

function plainText(input: unknown, label: string): string {
  if (typeof input !== 'string' || input.length > 80 || !input.trim()) invalid(label);
  for (const character of input) {
    const cp = character.codePointAt(0)!;
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

function phraseKey(phrase: string): string {
  return phrase.toLocaleLowerCase('en-US');
}

/**
 * The inherited analyzer searches with Unicode /iu, which equates more than
 * Unicode lowercase does (e.g. long s / s and Greek final sigma / sigma).
 * Reject caller-defined terms that its literal matcher cannot distinguish.
 * All regex metacharacters are escaped; this is an equality check, not an
 * opportunity for caller-authored patterns or unrestricted expressions.
 */
function sameMatcherTerm(left: string, right: string): boolean {
  const normalized = left.replace(/\s+/gu, ' ');
  const candidate = right.replace(/\s+/gu, ' ');
  const literal = [...normalized]
    .map((character) => (/[\\^$.*+?()[\]{}|]/u.test(character) ? '\\' + character : character))
    .join('');
  return new RegExp('^(?:' + literal + ')$', 'iu').test(candidate);
}

/**
 * Group only caller-defined themes using the already verified exact evidence
 * analyzer. No inferred clusters, source verification, external research or I/O.
 */
export function groupResearchThemes(input: unknown): Readonly<ThemeGroupingAnalysis> {
  const root = ownData(input, 'input', ['topic', 'themes', 'sources']);
  const topic = root.topic;
  // The M10.0 topic parser permits Unicode LS/PS; the M10.1 interface
  // explicitly requires single-line context. Preserve the legacy tool's
  // behavior without silently loosening this new contract.
  if (typeof topic !== 'string' || topic.includes('\u2028') || topic.includes('\u2029')) invalid('topic');
  const rawThemes = ownDense(root.themes, 'themes', 1, 4);
  const themes: Readonly<CallerThemeInput>[] = [];
  const ids = new Set<string>();
  const labels: string[] = [];
  const uniquePhrases: string[] = [];
  const allPhrases: string[] = [];

  for (const raw of rawThemes) {
    const value = ownData(raw, 'theme', ['id', 'label', 'phrases']);
    const id = plainText(value.id, 'theme.id');
    if (!themeIdPattern.test(id) || ids.has(id.toLowerCase())) invalid('theme.id');
    ids.add(id.toLowerCase());
    const label = plainText(value.label, 'theme.label');
    if (labels.some((prior) => phraseKey(prior) === phraseKey(label) || sameMatcherTerm(prior, label)))
      invalid('theme.label');
    labels.push(label);
    const phrases: string[] = [];
    for (const rawPhrase of ownDense(value.phrases, 'theme.phrases', 1, 3)) {
      const phrase = plainText(rawPhrase, 'theme.phrase');
      if (
        uniquePhrases.some(
          (prior) => phraseKey(prior) === phraseKey(phrase) || sameMatcherTerm(prior, phrase),
        )
      )
        invalid('duplicate theme phrase');
      uniquePhrases.push(phrase);
      phrases.push(phrase);
      allPhrases.push(phrase);
    }
    themes.push(Object.freeze({ id, label, phrases: Object.freeze(phrases) }));
  }
  if (allPhrases.length > 12) invalid('theme.phrases');
  // The legacy analyzer elides focus terms whose lowercase key equals the
  // topic. Unicode lowercase sometimes merges terms not equivalent under
  // its /iu literal matcher (İ versus i + combining dot). Reject that input
  // before projection so a theme never borrows a false quote from the topic.
  if (allPhrases.some((phrase) => phraseKey(phrase) === phraseKey(topic) && !sameMatcherTerm(phrase, topic)))
    invalid('theme term mapping');

  // Never spread the untrusted wrapper or pass already normalized sourceTrust
  // fields back to the strict M10.0 corpus analyzer.
  const analyzed = analyzeResearchCorpus({
    topic,
    focusTerms: allPhrases,
    sources: root.sources,
  });
  const evidenceByPhrase = new Map(analyzed.termCoverage.map((entry) => [phraseKey(entry.term), entry]));
  const allMatchedIds = new Set<string>();
  const themeGroups = Object.freeze(
    themes.map((theme) => {
      const themeMatchedIds = new Set<string>();
      const phrases = Object.freeze(
        theme.phrases.map((phrase) => {
          // Topic-equivalent phrases are represented by the analyzer's first
          // topic entry even when Unicode /iu sees equivalence that the
          // analyzer's lowercase-only focus-term filtering does not.
          const original = sameMatcherTerm(phrase, analyzed.topic)
            ? analyzed.termCoverage[0]
            : evidenceByPhrase.get(phraseKey(phrase));
          if (!original) invalid('theme term mapping');
          for (const span of original.evidence) {
            themeMatchedIds.add(span.sourceId);
            allMatchedIds.add(span.sourceId);
          }
          return Object.freeze({ term: phrase, state: original.state, evidence: original.evidence });
        }),
      );
      const sourceIds = Object.freeze(
        analyzed.sourceSummaries
          .filter((source) => themeMatchedIds.has(source.id))
          .map((source) => source.id),
      );
      return Object.freeze({ id: theme.id, label: theme.label, sourceIds, phrases });
    }),
  );
  const unmatchedSourceIds = Object.freeze(
    analyzed.sourceSummaries.filter((source) => !allMatchedIds.has(source.id)).map((source) => source.id),
  );
  const result: ThemeGroupingAnalysis = Object.freeze({
    kind: 'local_caller_defined_theme_grouping',
    status: analyzed.status,
    themeOrigin: 'caller_defined',
    sourceTrust: 'caller_supplied_unverified',
    verification: 'not_performed',
    topic: analyzed.topic,
    sourceSummaries: analyzed.sourceSummaries,
    themeGroups,
    unmatchedSourceIds,
    warnings: Object.freeze([...analyzed.warnings, 'themes_caller_defined_only' as const]),
  });
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_GROUPING_BYTES) {
    throw new ResearchOutputTooLargeError();
  }
  return result;
}

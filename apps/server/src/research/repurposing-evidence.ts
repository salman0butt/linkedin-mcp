import { types } from 'node:util';

import { normalizeResearchCorpus } from '../../../../packages/core/dist/index.js';

import { ResearchOutputTooLargeError, type ResearchAnalysis } from './content-analysis.js';

export type RepurposingTargetFormat = 'post' | 'article' | 'carousel';

export interface RepurposingEvidenceInput {
  readonly topic: string;
  readonly sources: readonly Readonly<{
    id: string;
    title: string;
    url: string;
    body: string;
    publishedAt?: string;
  }>[];
  readonly targets: readonly Readonly<{
    id: string;
    label: string;
    format: RepurposingTargetFormat;
    selections: readonly Readonly<{ sourceId: string; start: number; end: number }>[];
  }>[];
}

export interface LocalRepurposingEvidence {
  readonly kind: 'local_caller_curated_repurposing_evidence';
  readonly status: 'available';
  readonly selectionOrigin: 'caller_defined_utf16_offsets';
  readonly sourceTrust: 'caller_supplied_unverified';
  readonly verification: 'not_performed';
  readonly topic: string;
  readonly sourceSummaries: ResearchAnalysis['sourceSummaries'];
  readonly targets: readonly Readonly<{
    id: string;
    label: string;
    format: RepurposingTargetFormat;
    excerpts: readonly Readonly<{
      sourceId: string;
      field: 'body';
      start: number;
      end: number;
      offsetUnit: 'utf16';
      endExclusive: true;
      quote: string;
    }>[];
  }>[];
  readonly warnings: readonly (
    | 'caller_sources_unverified'
    | 'selections_caller_defined_only'
    | 'evidence_is_excerpt_only'
    | 'human_review_required'
    | 'dates_caller_reported_only'
  )[];
}

interface Selection {
  readonly sourceId: string;
  readonly start: number;
  readonly end: number;
}

interface Destination {
  readonly id: string;
  readonly label: string;
  readonly format: RepurposingTargetFormat;
  readonly selections: readonly Selection[];
}

const MAX_RESULT_BYTES = 96 * 1024;
const MAX_INPUT_BYTES = 200 * 1024;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;

function invalid(label: string): never {
  // Never render caller-controlled URLs, record keys, labels or excerpts in errors.
  throw new Error('Invalid repurposing evidence: ' + label);
}

function ownData(input: unknown, label: string, required: readonly string[]): Record<string, unknown> {
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
    if (typeof key !== 'string' || !required.includes(key)) invalid(label);
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid(label);
    output[key] = descriptor.value;
  }
  if (required.some((key) => !Object.hasOwn(descriptors, key))) invalid(label);
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
  const elements: unknown[] = [];
  for (let i = 0; i < input.length; i++) {
    const desc = Object.getOwnPropertyDescriptor(input, String(i));
    if (!desc?.enumerable || !('value' in desc)) invalid(label);
    elements.push(desc.value);
  }
  return elements;
}

function singleLine(input: unknown, label: string, max: number): string {
  if (typeof input !== 'string' || input.length > max || !input.trim()) invalid(label);
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

function safeId(input: unknown, label: string): string {
  // IDs are exact identifiers, not display strings: never silently trim them.
  if (typeof input !== 'string' || !idPattern.test(input)) invalid(label);
  return input;
}

function safeOffset(input: unknown, label: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0 || Object.is(input, -0))
    invalid(label);
  return input;
}

function cutsSurrogatePair(body: string, index: number): boolean {
  return (
    index > 0 &&
    index < body.length &&
    body.charCodeAt(index) >= 0xdc00 &&
    body.charCodeAt(index) <= 0xdfff &&
    body.charCodeAt(index - 1) >= 0xd800 &&
    body.charCodeAt(index - 1) <= 0xdbff
  );
}

/**
 * Produces only caller-selected exact excerpts as reusable evidence.
 * Does not write, summarize, verify, fetch or infer any article/post/market claims.
 */
export function prepareResearchRepurposingEvidence(input: unknown): Readonly<LocalRepurposingEvidence> {
  const root = ownData(input, 'input', ['topic', 'sources', 'targets']);
  const topic = singleLine(root.topic, 'topic', 200);
  const targets: Destination[] = [];
  let selectionCount = 0;
  for (const raw of ownDense(root.targets, 'targets', 1, 3)) {
    const value = ownData(raw, 'target', ['id', 'label', 'format', 'selections']);
    const id = safeId(value.id, 'target.id');
    if (targets.some((prior) => prior.id.toLowerCase() === id.toLowerCase())) invalid('target.id');
    const label = singleLine(value.label, 'target.label', 80);
    const format = value.format;
    if (format !== 'post' && format !== 'article' && format !== 'carousel') invalid('target.format');
    const selections: Selection[] = [];
    for (const entry of ownDense(value.selections, 'target.selections', 1, 12)) {
      const selection = ownData(entry, 'selection', ['sourceId', 'start', 'end']);
      const sourceId = safeId(selection.sourceId, 'selection.sourceId');
      const start = safeOffset(selection.start, 'selection.start');
      const end = safeOffset(selection.end, 'selection.end');
      if (end <= start || end - start > 160) invalid('selection.range');
      if (
        selections.some(
          (existing) => existing.sourceId === sourceId && existing.start === start && existing.end === end,
        )
      )
        invalid('selection.duplicate');
      selections.push(Object.freeze({ sourceId, start, end }));
      selectionCount++;
      if (selectionCount > 12) invalid('selections');
    }
    targets.push(Object.freeze({ id, label, format, selections: Object.freeze(selections) }));
  }

  // M10.0 canonicalizes IDs by trimming. Preserve exact caller identity at this
  // boundary before delegating its deeper source/schema/URL validation.
  for (const rawSource of ownDense(root.sources, 'sources', 1, 20)) {
    if (rawSource === null || typeof rawSource !== 'object' || types.isProxy(rawSource)) invalid('source.id');
    const descriptor = Object.getOwnPropertyDescriptor(rawSource, 'id');
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid('source.id');
    safeId(descriptor.value, 'source.id');
  }

  // M10.0 validates all source own-data descriptors, canonical safe HTTPS URLs,
  // bodies and dates. Its UTF-8 normalized corpus byte ceiling remains authoritative.
  const corpus = normalizeResearchCorpus({ topic, sources: root.sources });
  // The caller-defined destinations are part of this new request's budget;
  // checking the corpus alone could admit another few KiB of control metadata.
  if (
    Buffer.byteLength(JSON.stringify({ topic: corpus.topic, sources: corpus.sources, targets }), 'utf8') >
    MAX_INPUT_BYTES
  )
    invalid('input bytes');
  const sourceById = new Map(corpus.sources.map((source) => [source.id, source]));
  const selectedIds = new Set<string>();
  const curatedTargets = Object.freeze(
    targets.map((target) => {
      const excerpts = Object.freeze(
        target.selections.map((selection) => {
          const source = sourceById.get(selection.sourceId);
          if (
            !source ||
            selection.end > source.body.length ||
            cutsSurrogatePair(source.body, selection.start) ||
            cutsSurrogatePair(source.body, selection.end)
          )
            invalid('selection.range');
          const quote = source.body.slice(selection.start, selection.end);
          if (!quote.trim()) invalid('selection.quote');
          selectedIds.add(source.id);
          return Object.freeze({
            sourceId: source.id,
            field: 'body' as const,
            start: selection.start,
            end: selection.end,
            offsetUnit: 'utf16' as const,
            endExclusive: true as const,
            quote,
          });
        }),
      );
      return Object.freeze({ id: target.id, label: target.label, format: target.format, excerpts });
    }),
  );
  const sourceSummaries: ResearchAnalysis['sourceSummaries'] = Object.freeze(
    corpus.sources
      .filter((source) => selectedIds.has(source.id))
      .map((source) =>
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
  const warnings: LocalRepurposingEvidence['warnings'] = Object.freeze([
    'caller_sources_unverified',
    'selections_caller_defined_only',
    'evidence_is_excerpt_only',
    'human_review_required',
    ...(sourceSummaries.some((source) => source.publicationDate.state === 'reported')
      ? ['dates_caller_reported_only' as const]
      : []),
  ]);
  const result: LocalRepurposingEvidence = Object.freeze({
    kind: 'local_caller_curated_repurposing_evidence',
    status: 'available',
    selectionOrigin: 'caller_defined_utf16_offsets',
    sourceTrust: 'caller_supplied_unverified',
    verification: 'not_performed',
    topic: corpus.topic,
    sourceSummaries,
    targets: curatedTargets,
    warnings,
  });
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_RESULT_BYTES)
    throw new ResearchOutputTooLargeError();
  return result;
}

import { types } from 'node:util';

import { normalizeResearchCorpus } from '../../../../packages/core/dist/index.js';

import { ResearchOutputTooLargeError } from './content-analysis.js';

export interface LocalReferenceRegisterInput {
  readonly sources: readonly Readonly<{
    id: string;
    title: string;
    url: string;
    body: string;
    publishedAt?: string;
  }>[];
}

type ReportedPublicationDate =
  | Readonly<{ state: 'unknown' }>
  | Readonly<{ state: 'reported'; publishedAt: string; sourceClaim: 'caller_reported' }>;

export interface LocalReferenceRegister {
  readonly kind: 'local_reference_register';
  readonly status: 'available';
  readonly referenceOrigin: 'caller_supplied';
  readonly sourceTrust: 'caller_supplied_unverified';
  readonly verification: 'not_performed';
  readonly sourceSummaries: readonly Readonly<{
    id: string;
    title: string;
    url: string;
    publicationDate: ReportedPublicationDate;
    sourceTrust: 'caller_supplied_unverified';
  }>[];
  readonly repeatedUrlGroups: readonly Readonly<{
    url: string;
    sourceIds: readonly string[];
  }>[];
  readonly singleUrlSourceIds: readonly string[];
  readonly warnings: readonly (
    | 'caller_sources_unverified'
    | 'same_url_not_independent_confirmation'
    | 'dates_caller_reported_only'
  )[];
}

const MAX_REGISTER_BYTES = 96 * 1024;

function invalid(): never {
  // Caller field names, values, URLs, and body text must never be echoed.
  throw new Error('Invalid local reference register: input');
}

/**
 * This is a returned, stateless register, not a database or source verifier.
 * All URL, body, date and nested object validation is inherited from M10.0.
 */
export function indexResearchReferences(input: unknown): Readonly<LocalReferenceRegister> {
  if (
    input === null ||
    typeof input !== 'object' ||
    types.isProxy(input) ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    invalid();

  const keys = Reflect.ownKeys(input);
  if (keys.length !== 1 || keys[0] !== 'sources') invalid();
  const sourcesProperty = Object.getOwnPropertyDescriptor(input, 'sources');
  if (!sourcesProperty || !sourcesProperty.enumerable || !('value' in sourcesProperty)) invalid();

  // Construct a fresh known-key wrapper; never spread or read a hostile getter.
  // The strict core parser validates the dense array and every source exactly once.
  const corpus = normalizeResearchCorpus({
    topic: 'Reference register',
    sources: sourcesProperty.value as unknown,
  });

  const groupedUrls = new Map<string, string[]>();
  const sourceSummaries = Object.freeze(
    corpus.sources.map((source) => {
      const members = groupedUrls.get(source.url);
      if (members) members.push(source.id);
      else groupedUrls.set(source.url, [source.id]);

      const publicationDate: ReportedPublicationDate =
        source.publishedAt === undefined
          ? Object.freeze({ state: 'unknown' as const })
          : Object.freeze({
              state: 'reported' as const,
              publishedAt: source.publishedAt,
              sourceClaim: 'caller_reported' as const,
            });
      return Object.freeze({
        id: source.id,
        title: source.title,
        url: source.url,
        publicationDate,
        sourceTrust: 'caller_supplied_unverified' as const,
      });
    }),
  );

  const repeatedUrlGroups = Object.freeze(
    [...groupedUrls.entries()]
      .filter(([, members]) => members.length >= 2)
      .map(([url, members]) => Object.freeze({ url, sourceIds: Object.freeze([...members]) })),
  );
  const singleUrlSourceIds = Object.freeze(
    corpus.sources.filter((source) => groupedUrls.get(source.url)?.length === 1).map((source) => source.id),
  );
  const warnings: LocalReferenceRegister['warnings'] = Object.freeze([
    'caller_sources_unverified',
    'same_url_not_independent_confirmation',
    ...(corpus.sources.some((source) => source.publishedAt !== undefined)
      ? (['dates_caller_reported_only'] as const)
      : []),
  ]);
  const result: Readonly<LocalReferenceRegister> = Object.freeze({
    kind: 'local_reference_register',
    status: 'available',
    referenceOrigin: 'caller_supplied',
    sourceTrust: 'caller_supplied_unverified',
    verification: 'not_performed',
    sourceSummaries,
    repeatedUrlGroups,
    singleUrlSourceIds,
    warnings,
  });
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_REGISTER_BYTES)
    throw new ResearchOutputTooLargeError();
  return result;
}

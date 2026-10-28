import { types } from 'node:util';

import { compareLocalAnalyticsSnapshots } from './snapshot-comparison.js';

export class LocalAnalyticsSeriesError extends Error {
  constructor(readonly kind: 'invalid_input' | 'output_too_large') {
    super(
      kind === 'invalid_input'
        ? 'Invalid local metric observation series input.'
        : 'Local metric observation series is too large.',
    );
    this.name = 'LocalAnalyticsSeriesError';
  }
}

type SnapshotComparison = ReturnType<typeof compareLocalAnalyticsSnapshots>;

export interface LocalAnalyticsObservationSeries {
  readonly kind: 'local_caller_metric_observation_series';
  readonly status: 'observations_only';
  readonly provenance: 'caller_supplied_unverified';
  readonly verification: 'not_performed';
  readonly providerData: 'not_fetched';
  readonly accountAuthorization: 'not_evaluated';
  readonly publication: 'not_attempted';
  readonly contentId: string;
  readonly contentKind: 'post' | 'article';
  readonly capturesUtc: readonly string[];
  readonly intervals: readonly Readonly<{
    fromUtc: string;
    toUtc: string;
    metrics: SnapshotComparison['metrics'];
  }>[];
  readonly counts: Readonly<{ captures: number; intervals: number }>;
  readonly warnings: readonly (
    | 'caller_metrics_unverified'
    | 'capture_intervals_not_provider_windows'
    | 'no_rates_or_performance_inferred'
    | 'missing_metrics_not_zero'
    | 'negative_delta_may_reflect_counter_revisions'
  )[];
}

function invalid(): never {
  throw new LocalAnalyticsSeriesError('invalid_input');
}

function exactInput(input: unknown): { contentId: unknown; contentKind: unknown; snapshots: unknown } {
  if (
    input === null ||
    typeof input !== 'object' ||
    types.isProxy(input) ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    invalid();

  const names = Reflect.ownKeys(input);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    names.length !== 3 ||
    !names.includes('contentId') ||
    !names.includes('contentKind') ||
    !names.includes('snapshots')
  )
    invalid();
  for (const name of names) {
    if (typeof name !== 'string' || !['contentId', 'contentKind', 'snapshots'].includes(name)) invalid();
    if (!descriptors[name]?.enumerable || !Object.hasOwn(descriptors[name], 'value')) invalid();
  }
  return {
    contentId: descriptors.contentId!.value,
    contentKind: descriptors.contentKind!.value,
    snapshots: descriptors.snapshots!.value,
  };
}

function strictSnapshots(input: unknown): readonly unknown[] {
  if (
    types.isProxy(input) ||
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    input.length < 3 ||
    input.length > 10 ||
    Reflect.ownKeys(input).length !== input.length + 1
  )
    invalid();

  const snapshots: unknown[] = [];
  for (let i = 0; i < input.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    snapshots.push(descriptor.value);
  }
  return snapshots;
}

/** Compare unverified caller observations without inferring provider trends or measurement windows. */
export function compareLocalAnalyticsObservationSeries(
  input: unknown,
): Readonly<LocalAnalyticsObservationSeries> {
  const raw = exactInput(input);
  const snapshots = strictSnapshots(raw.snapshots);
  const intervals: LocalAnalyticsObservationSeries['intervals'][number][] = [];
  const capturesUtc: string[] = [];
  let missing = false;
  let decreased = false;

  for (let i = 1; i < snapshots.length; i++) {
    let comparison: SnapshotComparison;
    try {
      comparison = compareLocalAnalyticsSnapshots({
        contentId: raw.contentId,
        contentKind: raw.contentKind,
        snapshots: [snapshots[i - 1], snapshots[i]],
      });
    } catch {
      invalid();
    }

    if (i === 1) capturesUtc.push(comparison.capturesUtc[0]);
    capturesUtc.push(comparison.capturesUtc[1]);
    if (comparison.warnings.includes('missing_metrics_not_zero')) missing = true;
    if (comparison.warnings.includes('decrease_may_reflect_counter_revisions')) decreased = true;
    intervals.push(
      Object.freeze({
        fromUtc: comparison.capturesUtc[0],
        toUtc: comparison.capturesUtc[1],
        metrics: comparison.metrics,
      }),
    );
  }

  const warnings: LocalAnalyticsObservationSeries['warnings'] = Object.freeze([
    'caller_metrics_unverified',
    'capture_intervals_not_provider_windows',
    'no_rates_or_performance_inferred',
    ...(missing ? (['missing_metrics_not_zero'] as const) : []),
    ...(decreased ? (['negative_delta_may_reflect_counter_revisions'] as const) : []),
  ]);
  const result: LocalAnalyticsObservationSeries = Object.freeze({
    kind: 'local_caller_metric_observation_series',
    status: 'observations_only',
    provenance: 'caller_supplied_unverified',
    verification: 'not_performed',
    providerData: 'not_fetched',
    accountAuthorization: 'not_evaluated',
    publication: 'not_attempted',
    contentId: raw.contentId as string,
    contentKind: raw.contentKind as 'post' | 'article',
    capturesUtc: Object.freeze(capturesUtc),
    intervals: Object.freeze(intervals),
    counts: Object.freeze({ captures: snapshots.length, intervals: intervals.length }),
    warnings,
  });
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 32_768)
    throw new LocalAnalyticsSeriesError('output_too_large');
  return result;
}

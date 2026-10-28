import { types } from 'node:util';

import { compareLocalAnalyticsSnapshots } from './snapshot-comparison.js';

export class LocalAnalyticsRankingError extends Error {
  constructor(readonly kind: 'invalid_input' | 'output_too_large') {
    super(
      kind === 'invalid_input'
        ? 'Invalid local metric snapshot ranking input.'
        : 'Local metric ranking is too large.',
    );
    this.name = 'LocalAnalyticsRankingError';
  }
}

const METRIC_NAMES = ['impressions', 'reactions', 'comments', 'reposts'] as const;
type MetricName = (typeof METRIC_NAMES)[number];
type ContentKind = 'post' | 'article';

export interface LocalAnalyticsDeltaRanking {
  readonly kind: 'local_caller_metric_delta_ranking';
  readonly status: 'ranking_only';
  readonly provenance: 'caller_supplied_unverified';
  readonly verification: 'not_performed';
  readonly providerData: 'not_fetched';
  readonly accountAuthorization: 'not_evaluated';
  readonly publication: 'not_attempted';
  readonly targetMetric: MetricName;
  readonly capturesUtc: readonly [string, string];
  readonly ranked: readonly Readonly<{
    contentId: string;
    contentKind: ContentKind;
    previous: number;
    current: number;
    delta: number;
  }>[];
  readonly unavailable: readonly Readonly<{
    contentId: string;
    contentKind: ContentKind;
    previous: number | null;
    current: number | null;
  }>[];
  readonly counts: Readonly<{ compared: number; ranked: number; unavailable: number }>;
  readonly warnings: readonly (
    | 'caller_metrics_unverified'
    | 'same_capture_minutes_not_provider_window'
    | 'no_performance_or_rates_inferred'
    | 'unavailable_excluded_from_ranking'
    | 'negative_delta_may_be_counter_correction'
  )[];
}

function invalid(): never {
  throw new LocalAnalyticsRankingError('invalid_input');
}
function rootData(value: unknown): { targetMetric: unknown; entries: unknown } {
  if (
    value === null ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    invalid();
  const keys = Reflect.ownKeys(value);
  const desc = Object.getOwnPropertyDescriptors(value);
  if (keys.length !== 2 || !keys.includes('targetMetric') || !keys.includes('entries')) invalid();
  for (const key of keys) {
    if (typeof key !== 'string' || !['targetMetric', 'entries'].includes(key)) invalid();
    if (!desc[key]?.enumerable || !Object.hasOwn(desc[key], 'value')) invalid();
  }
  return { targetMetric: desc.targetMetric!.value, entries: desc.entries!.value };
}
function strictEntries(value: unknown): unknown[] {
  if (
    types.isProxy(value) ||
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length < 2 ||
    value.length > 10 ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    invalid();
  const entries: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    entries.push(descriptor.value);
  }
  return entries;
}

/**
 * A deterministic ordering of observed differences; this is not LinkedIn
 * provider analytics, a comparable lifetime performance study or a winner.
 */
export function rankLocalAnalyticsSnapshotChanges(input: unknown): Readonly<LocalAnalyticsDeltaRanking> {
  const raw = rootData(input);
  if (typeof raw.targetMetric !== 'string' || !METRIC_NAMES.some((name) => name === raw.targetMetric))
    invalid();
  const targetMetric: MetricName = raw.targetMetric as MetricName;
  const entries = strictEntries(raw.entries);
  type Ranked = LocalAnalyticsDeltaRanking['ranked'][number] & { position: number };
  const ranked: Ranked[] = [];
  const unavailable: LocalAnalyticsDeltaRanking['unavailable'][number][] = [];
  const known = new Set<string>();
  let capturesUtc: readonly [string, string] | undefined;
  for (const [position, entry] of entries.entries()) {
    let snapshot: ReturnType<typeof compareLocalAnalyticsSnapshots>;
    try {
      snapshot = compareLocalAnalyticsSnapshots(entry);
    } catch {
      invalid();
    }
    if (known.has(snapshot.contentId)) invalid();
    known.add(snapshot.contentId);
    if (
      capturesUtc !== undefined &&
      (capturesUtc[0] !== snapshot.capturesUtc[0] || capturesUtc[1] !== snapshot.capturesUtc[1])
    )
      invalid();
    capturesUtc = snapshot.capturesUtc;
    const metric = snapshot.metrics[targetMetric];
    if (metric.state === 'comparable') {
      ranked.push({
        position,
        contentId: snapshot.contentId,
        contentKind: snapshot.contentKind,
        previous: metric.previous,
        current: metric.current,
        delta: metric.delta,
      });
    } else {
      unavailable.push(
        Object.freeze({
          contentId: snapshot.contentId,
          contentKind: snapshot.contentKind,
          previous: metric.previous,
          current: metric.current,
        }),
      );
    }
  }
  if (capturesUtc === undefined) invalid();
  ranked.sort((a, b) => b.delta - a.delta || a.position - b.position);
  const results = Object.freeze(
    ranked.map(({ contentId, contentKind, previous, current, delta }) =>
      Object.freeze({ contentId, contentKind, previous, current, delta }),
    ),
  );
  const missed = Object.freeze(unavailable);
  const warnings: LocalAnalyticsDeltaRanking['warnings'] = Object.freeze([
    'caller_metrics_unverified',
    'same_capture_minutes_not_provider_window',
    'no_performance_or_rates_inferred',
    ...(missed.length ? (['unavailable_excluded_from_ranking'] as const) : []),
    ...(results.some((item) => item.delta < 0)
      ? (['negative_delta_may_be_counter_correction'] as const)
      : []),
  ]);
  const result: LocalAnalyticsDeltaRanking = Object.freeze({
    kind: 'local_caller_metric_delta_ranking',
    status: 'ranking_only',
    provenance: 'caller_supplied_unverified',
    verification: 'not_performed',
    providerData: 'not_fetched',
    accountAuthorization: 'not_evaluated',
    publication: 'not_attempted',
    targetMetric,
    capturesUtc,
    ranked: results,
    unavailable: missed,
    counts: Object.freeze({ compared: entries.length, ranked: results.length, unavailable: missed.length }),
    warnings,
  });
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 32_768)
    throw new LocalAnalyticsRankingError('output_too_large');
  return result;
}

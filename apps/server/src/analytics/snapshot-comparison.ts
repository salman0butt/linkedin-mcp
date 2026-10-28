import { types } from 'node:util';

export class LocalAnalyticsSnapshotError extends Error {
  constructor(readonly kind: 'invalid_input' | 'output_too_large') {
    super(
      kind === 'invalid_input'
        ? 'Invalid local analytics snapshot input.'
        : 'Local analytics result too large.',
    );
    this.name = 'LocalAnalyticsSnapshotError';
  }
}

const CONTENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const UTC_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/u;
const METRICS = ['impressions', 'reactions', 'comments', 'reposts'] as const;
const MAX_COUNTER = 1_000_000_000;

type MetricName = (typeof METRICS)[number];
type MetricComparison =
  | Readonly<{ state: 'unavailable'; previous: number | null; current: number | null; delta: null }>
  | Readonly<{ state: 'comparable'; previous: number; current: number; delta: number }>;

export interface LocalAnalyticsSnapshotComparison {
  readonly kind: 'local_content_metric_snapshot_comparison';
  readonly status: 'comparison_only';
  readonly provenance: 'caller_supplied_unverified';
  readonly verification: 'not_performed';
  readonly providerData: 'not_fetched';
  readonly accountAuthorization: 'not_evaluated';
  readonly publication: 'not_attempted';
  readonly contentId: string;
  readonly contentKind: 'post' | 'article';
  readonly capturesUtc: readonly [string, string];
  readonly metrics: Readonly<Record<MetricName, MetricComparison>>;
  readonly warnings: readonly (
    | 'caller_metrics_unverified'
    | 'not_provider_analytics'
    | 'snapshots_are_observations_only'
    | 'decrease_may_reflect_counter_revisions'
    | 'missing_metrics_not_zero'
  )[];
}

function invalid(): never {
  throw new LocalAnalyticsSnapshotError('invalid_input');
}

function ownData(input: unknown, expected: readonly string[]): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== 'object' ||
    types.isProxy(input) ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    invalid();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const names = Reflect.ownKeys(input);
  if (names.length !== expected.length) invalid();
  const result: Record<string, unknown> = {};
  for (const name of names) {
    if (typeof name !== 'string' || !expected.includes(name)) invalid();
    const descriptor = descriptors[name];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    result[name] = descriptor.value;
  }
  if (expected.some((name) => !Object.hasOwn(descriptors, name))) invalid();
  return result;
}

function twoDataValues(input: unknown): readonly [unknown, unknown] {
  if (
    types.isProxy(input) ||
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    input.length !== 2 ||
    Reflect.ownKeys(input).length !== 3
  )
    invalid();
  const first = Object.getOwnPropertyDescriptor(input, '0');
  const second = Object.getOwnPropertyDescriptor(input, '1');
  if (
    !first?.enumerable ||
    !Object.hasOwn(first, 'value') ||
    !second?.enumerable ||
    !Object.hasOwn(second, 'value')
  )
    invalid();
  return [first.value, second.value];
}

function capturedAt(value: unknown): string {
  if (typeof value !== 'string' || !UTC_MINUTE.test(value)) invalid();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) invalid();
  return value;
}

function metricsFrom(input: unknown): Readonly<Record<MetricName, number | null>> {
  const raw = ownData(input, METRICS);
  const metrics = {} as Record<MetricName, number | null>;
  let observed = false;
  for (const name of METRICS) {
    const value = raw[name];
    if (
      value !== null &&
      (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_COUNTER)
    )
      invalid();
    metrics[name] = value;
    if (value !== null) observed = true;
  }
  if (!observed) invalid();
  return Object.freeze(metrics);
}

function snapshotFrom(input: unknown) {
  const raw = ownData(input, ['capturedAtUtc', 'metrics']);
  return Object.freeze({ capturedAtUtc: capturedAt(raw.capturedAtUtc), metrics: metricsFrom(raw.metrics) });
}

/** Strictly local arithmetic over two explicitly caller-supplied, unverified observations. */
export function compareLocalAnalyticsSnapshots(input: unknown): Readonly<LocalAnalyticsSnapshotComparison> {
  const raw = ownData(input, ['contentId', 'contentKind', 'snapshots']);
  if (typeof raw.contentId !== 'string' || !CONTENT_ID.test(raw.contentId)) invalid();
  if (raw.contentKind !== 'post' && raw.contentKind !== 'article') invalid();
  const [left, right] = twoDataValues(raw.snapshots);
  const before = snapshotFrom(left);
  const after = snapshotFrom(right);
  if (before.capturedAtUtc >= after.capturedAtUtc) invalid();

  const comparisons = {} as Record<MetricName, MetricComparison>;
  let decreased = false;
  let missing = false;
  for (const name of METRICS) {
    const previous = before.metrics[name],
      current = after.metrics[name];
    if (previous === null || current === null) {
      missing = true;
      comparisons[name] = Object.freeze({ state: 'unavailable', previous, current, delta: null });
    } else {
      const delta = current - previous;
      if (delta < 0) decreased = true;
      comparisons[name] = Object.freeze({ state: 'comparable', previous, current, delta });
    }
  }
  const warnings: LocalAnalyticsSnapshotComparison['warnings'] = Object.freeze([
    'caller_metrics_unverified',
    'not_provider_analytics',
    'snapshots_are_observations_only',
    ...(decreased ? (['decrease_may_reflect_counter_revisions'] as const) : []),
    ...(missing ? (['missing_metrics_not_zero'] as const) : []),
  ]);
  const captures: readonly [string, string] = [before.capturedAtUtc, after.capturedAtUtc];
  const result: LocalAnalyticsSnapshotComparison = Object.freeze({
    kind: 'local_content_metric_snapshot_comparison',
    status: 'comparison_only',
    provenance: 'caller_supplied_unverified',
    verification: 'not_performed',
    providerData: 'not_fetched',
    accountAuthorization: 'not_evaluated',
    publication: 'not_attempted',
    contentId: raw.contentId,
    contentKind: raw.contentKind,
    capturesUtc: Object.freeze(captures),
    metrics: Object.freeze(comparisons),
    warnings,
  });
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 16_384)
    throw new LocalAnalyticsSnapshotError('output_too_large');
  return result;
}

import { describe, expect, it, vi } from 'vitest';

import {
  LocalAnalyticsSeriesError,
  compareLocalAnalyticsObservationSeries,
} from '../src/analytics/snapshot-series.js';

function sample(): {
  contentId: string;
  contentKind: string;
  snapshots: {
    capturedAtUtc: string;
    metrics: {
      impressions: number | null;
      reactions: number | null;
      comments: number | null;
      reposts: number | null;
    };
  }[];
} {
  return {
    contentId: 'local-post-1',
    contentKind: 'post',
    snapshots: [
      {
        capturedAtUtc: '2026-10-20T10:00:00.000Z',
        metrics: { impressions: 100, reactions: 5, comments: null, reposts: 2 },
      },
      {
        capturedAtUtc: '2026-10-21T10:00:00.000Z',
        metrics: { impressions: 80, reactions: 7, comments: 0, reposts: 2 },
      },
      {
        capturedAtUtc: '2026-10-23T10:00:00.000Z',
        metrics: { impressions: 90, reactions: null, comments: 0, reposts: 1 },
      },
    ],
  };
}

function reject(input: unknown) {
  try {
    compareLocalAnalyticsObservationSeries(input);
    throw new Error('Expected invalid local observation series input');
  } catch (error) {
    expect(error).toBeInstanceOf(LocalAnalyticsSeriesError);
    expect((error as LocalAnalyticsSeriesError).kind).toBe('invalid_input');
    expect(String(error)).not.toMatch(/SECRET|PRIVATE|canary|password/u);
  }
}

describe('M12.2 pure caller-only metric observation series', () => {
  it('compares adjacent observations while keeping signed differences and nulls separate', () => {
    const result = compareLocalAnalyticsObservationSeries(sample());
    expect(result).toEqual({
      kind: 'local_caller_metric_observation_series',
      status: 'observations_only',
      provenance: 'caller_supplied_unverified',
      verification: 'not_performed',
      providerData: 'not_fetched',
      accountAuthorization: 'not_evaluated',
      publication: 'not_attempted',
      contentId: 'local-post-1',
      contentKind: 'post',
      capturesUtc: ['2026-10-20T10:00:00.000Z', '2026-10-21T10:00:00.000Z', '2026-10-23T10:00:00.000Z'],
      intervals: [
        {
          fromUtc: '2026-10-20T10:00:00.000Z',
          toUtc: '2026-10-21T10:00:00.000Z',
          metrics: {
            impressions: { state: 'comparable', previous: 100, current: 80, delta: -20 },
            reactions: { state: 'comparable', previous: 5, current: 7, delta: 2 },
            comments: { state: 'unavailable', previous: null, current: 0, delta: null },
            reposts: { state: 'comparable', previous: 2, current: 2, delta: 0 },
          },
        },
        {
          fromUtc: '2026-10-21T10:00:00.000Z',
          toUtc: '2026-10-23T10:00:00.000Z',
          metrics: {
            impressions: { state: 'comparable', previous: 80, current: 90, delta: 10 },
            reactions: { state: 'unavailable', previous: 7, current: null, delta: null },
            comments: { state: 'comparable', previous: 0, current: 0, delta: 0 },
            reposts: { state: 'comparable', previous: 2, current: 1, delta: -1 },
          },
        },
      ],
      counts: { captures: 3, intervals: 2 },
      warnings: [
        'caller_metrics_unverified',
        'capture_intervals_not_provider_windows',
        'no_rates_or_performance_inferred',
        'missing_metrics_not_zero',
        'negative_delta_may_reflect_counter_revisions',
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/accountId|postUrl|engagementRate|trendForecast/u);
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(32_768);
  });

  it('accepts 10 captures of zero or billion counters with immutable signed intervals', () => {
    const input = sample();
    input.contentKind = 'article';
    input.snapshots = Array.from({ length: 10 }, (_, i) => ({
      capturedAtUtc: `2026-10-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
      metrics: { impressions: i % 2 ? 0 : 1_000_000_000, reactions: 0, comments: 0, reposts: 0 },
    }));
    const output = compareLocalAnalyticsObservationSeries(input);
    expect(output.counts).toEqual({ captures: 10, intervals: 9 });
    expect(output.intervals[0]?.metrics.impressions.delta).toBe(-1_000_000_000);
    expect(output.intervals[1]?.metrics.impressions.delta).toBe(1_000_000_000);
    expect(output.warnings).toEqual([
      'caller_metrics_unverified',
      'capture_intervals_not_provider_windows',
      'no_rates_or_performance_inferred',
      'negative_delta_may_reflect_counter_revisions',
    ]);
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.capturesUtc)).toBe(true);
    expect(Object.isFrozen(output.intervals)).toBe(true);
    expect(Object.isFrozen(output.counts)).toBe(true);
    expect(Object.isFrozen(output.warnings)).toBe(true);
    for (const interval of output.intervals) {
      expect(Object.isFrozen(interval)).toBe(true);
      expect(Object.isFrozen(interval.metrics)).toBe(true);
      for (const metric of Object.values(interval.metrics)) expect(Object.isFrozen(metric)).toBe(true);
    }
    expect(() => (output.intervals as unknown as unknown[]).push('SECRET')).toThrow();
  });

  it('returns only base warnings when all metrics are observed and nondecreasing', () => {
    const input = sample();
    for (const [i, snapshot] of input.snapshots.entries()) {
      snapshot.metrics = { impressions: i, reactions: i, comments: i, reposts: i };
    }
    expect(compareLocalAnalyticsObservationSeries(input).warnings).toEqual([
      'caller_metrics_unverified',
      'capture_intervals_not_provider_windows',
      'no_rates_or_performance_inferred',
    ]);
  });

  it('rejects wrong lengths, missing or unexpected fields, secret-bearing keys and sparse arrays', () => {
    const input = sample();
    reject({ ...input, snapshots: input.snapshots.slice(0, 2) });
    reject({
      ...input,
      snapshots: [...input.snapshots, ...Array.from({ length: 8 }, () => input.snapshots[2]!)],
    });
    reject({ ...input, PRIVATE_TOKEN: 'canary' });
    reject({ ...input, contentId: 'urn:li:person:SECRET' });
    reject({ ...input, contentId: 'é' });
    reject({ ...input, contentKind: 'account' });
    reject({ ...input, snapshots: undefined });
    reject({ contentId: input.contentId, snapshots: input.snapshots });
    const hole = sample();
    Reflect.deleteProperty(hole.snapshots, '1');
    reject(hole);
    const extra = sample();
    Object.defineProperty(extra.snapshots, 'SECRET_KEY', { value: 'canary' });
    reject(extra);
    const symbol = sample();
    Object.defineProperty(symbol, Symbol('PRIVATE'), { value: 'canary' });
    reject(symbol);
  });

  it('rejects invalid or repeated capture times including malformed civil dates', () => {
    const input = sample();
    reject({ ...input, snapshots: [input.snapshots[1], input.snapshots[0], input.snapshots[2]] });
    reject({ ...input, snapshots: [input.snapshots[0], input.snapshots[0], input.snapshots[2]] });
    for (const timestamp of [
      '2026-02-30T10:00:00.000Z',
      '2026-10-22T10:00:01.000Z',
      '2026-10-22T10:00:00+00:00',
      '2026-10-22T10:00:00.100Z',
    ]) {
      const changed = sample();
      changed.snapshots[1]!.capturedAtUtc = timestamp;
      reject(changed);
    }
  });

  it('rejects invalid metrics at first, middle, and last snapshot without coercion', () => {
    for (const position of [0, 1, 2]) {
      for (const counter of [-1, 1.1, NaN, Infinity, 1_000_000_001]) {
        const input = sample();
        input.snapshots[position]!.metrics.impressions = counter;
        reject(input);
      }
      const unavailableOnly = sample();
      unavailableOnly.snapshots[position]!.metrics = {
        impressions: null,
        reactions: null,
        comments: null,
        reposts: null,
      };
      reject(unavailableOnly);
      const secret = sample();
      Object.assign(secret.snapshots[position]!.metrics, { PRIVATE_TOKEN: 'canary' });
      reject(secret);
    }
  });

  it('rejects proxies, revoked proxies, inherited props and accessor traps at every level', () => {
    reject(new Proxy(sample(), {}));
    const revoked = Proxy.revocable(sample(), {});
    revoked.revoke();
    reject(revoked.proxy);
    reject(Object.assign(Object.create(null), sample()));
    const proxyArray = sample();
    proxyArray.snapshots = new Proxy(proxyArray.snapshots, {});
    reject(proxyArray);
    const inheritedArray = sample();
    Object.setPrototypeOf(inheritedArray.snapshots, []);
    reject(inheritedArray);
    const proxySnapshot = sample();
    proxySnapshot.snapshots[1] = new Proxy(proxySnapshot.snapshots[1]!, {});
    reject(proxySnapshot);
    const getter = vi.fn(() => {
      throw Error('SECRET getter canary');
    });
    const accessorSnapshot = sample();
    Object.defineProperty(accessorSnapshot.snapshots[1], 'capturedAtUtc', {
      enumerable: true,
      get: getter,
    });
    reject(accessorSnapshot);
    const accessorArray = sample();
    Object.defineProperty(accessorArray.snapshots, '1', { enumerable: true, get: getter });
    reject(accessorArray);
    const accessorRoot = sample();
    Object.defineProperty(accessorRoot, 'contentId', { enumerable: true, get: getter });
    reject(accessorRoot);
    expect(getter).not.toHaveBeenCalled();
  });

  it('does not read ambient clock, call network or mutate frozen caller observations', () => {
    const input = sample();
    for (const snapshot of input.snapshots) {
      Object.freeze(snapshot.metrics);
      Object.freeze(snapshot);
    }
    Object.freeze(input.snapshots);
    Object.freeze(input);
    const now = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw Error('SECRET clock canary');
    });
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw Error('SECRET network canary');
    });
    try {
      expect(compareLocalAnalyticsObservationSeries(input).counts).toEqual({ captures: 3, intervals: 2 });
      expect(now).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
      fetch.mockRestore();
    }
  });
});

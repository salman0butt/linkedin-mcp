import { describe, expect, it, vi } from 'vitest';

import {
  LocalAnalyticsRankingError,
  rankLocalAnalyticsSnapshotChanges,
} from '../src/analytics/snapshot-delta-ranking.js';

function entry(
  contentId: string,
  first: number | null,
  second: number | null,
  contentKind: 'post' | 'article' = 'post',
) {
  return {
    contentId,
    contentKind,
    snapshots: [
      {
        capturedAtUtc: '2026-10-20T10:00:00.000Z',
        metrics: {
          impressions: first,
          reactions: 2,
          comments: 0,
          reposts: 0,
        },
      },
      {
        capturedAtUtc: '2026-10-27T10:00:00.000Z',
        metrics: {
          impressions: second,
          reactions: 2,
          comments: 0,
          reposts: 0,
        },
      },
    ],
  };
}
function example() {
  return {
    targetMetric: 'impressions',
    entries: [entry('first', 100, 90), entry('second', 10, 20, 'article'), entry('unavailable', null, 50)],
  };
}
function reject(input: unknown) {
  try {
    rankLocalAnalyticsSnapshotChanges(input);
    throw new Error('Expected invalid local ranking request');
  } catch (error) {
    expect(error).toBeInstanceOf(LocalAnalyticsRankingError);
    expect((error as LocalAnalyticsRankingError).kind).toBe('invalid_input');
    expect(String(error)).not.toMatch(/SECRET|PRIVATE|canary/u);
  }
}

describe('M12.1 pure caller-only metric delta ranking', () => {
  it('ranks comparable signed deltas and separates unavailable without claiming provider performance', () => {
    const result = rankLocalAnalyticsSnapshotChanges(example());
    expect(result).toMatchObject({
      kind: 'local_caller_metric_delta_ranking',
      status: 'ranking_only',
      provenance: 'caller_supplied_unverified',
      verification: 'not_performed',
      providerData: 'not_fetched',
      accountAuthorization: 'not_evaluated',
      publication: 'not_attempted',
      targetMetric: 'impressions',
      capturesUtc: ['2026-10-20T10:00:00.000Z', '2026-10-27T10:00:00.000Z'],
      ranked: [
        { contentId: 'second', contentKind: 'article', previous: 10, current: 20, delta: 10 },
        { contentId: 'first', contentKind: 'post', previous: 100, current: 90, delta: -10 },
      ],
      unavailable: [{ contentId: 'unavailable', contentKind: 'post', previous: null, current: 50 }],
      counts: { compared: 3, ranked: 2, unavailable: 1 },
      warnings: [
        'caller_metrics_unverified',
        'same_capture_minutes_not_provider_window',
        'no_performance_or_rates_inferred',
        'unavailable_excluded_from_ranking',
        'negative_delta_may_be_counter_correction',
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/accountId|postUrl|engagementRate|estimatedWinner/u);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.ranked)).toBe(true);
    expect(Object.isFrozen(result.ranked[0])).toBe(true);
    expect(Object.isFrozen(result.counts)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(32 * 1024);
  });

  it('retains caller item order on exact signed ties and does not invent missing ranks', () => {
    const result = rankLocalAnalyticsSnapshotChanges({
      targetMetric: 'impressions',
      entries: [entry('alpha', 0, 5), entry('beta', 20, 25), entry('gamma', null, null)],
    });
    expect(result.ranked.map((x) => x.contentId)).toEqual(['alpha', 'beta']);
    expect(result.unavailable.map((x) => x.contentId)).toEqual(['gamma']);
    expect(result.warnings).not.toContain('negative_delta_may_be_counter_correction');
  });

  it('rejects duplicate IDs, inconsistent two captures, unknown metrics and malformed sub-snapshots', () => {
    const input = example();
    reject({ ...input, targetMetric: 'verifiedEngagementRate' });
    reject({ ...input, SECRET_KEY: 'canary' });
    reject({ ...input, entries: [entry('first', 1, 2)] });
    reject({ ...input, entries: [...input.entries, entry('first', 1, 2)] });
    const mismatch = example();
    mismatch.entries[1]!.snapshots[1]!.capturedAtUtc = '2026-10-28T10:00:00.000Z';
    reject(mismatch);
    const invalid = example();
    invalid.entries[0]!.snapshots[0]!.metrics.impressions = -1;
    reject(invalid);
    const secret = example();
    Object.assign(secret.entries[0]!.snapshots[0]!.metrics, { PRIVATE_TOKEN: 'canary' });
    reject(secret);
  });

  it('rejects hostile proxies, getters, sparse arrays, prototypes and extra array properties safely', () => {
    reject(new Proxy(example(), {}));
    const revoked = Proxy.revocable(example(), {});
    revoked.revoke();
    reject(revoked.proxy);
    reject(Object.assign(Object.create(null), example()));
    const getter = vi.fn(() => {
      throw Error('SECRET getter canary');
    });
    const withGetter = example();
    Object.defineProperty(withGetter.entries[0]!, 'contentId', { enumerable: true, get: getter });
    reject(withGetter);
    expect(getter).not.toHaveBeenCalled();
    const sparse = example().entries;
    Reflect.deleteProperty(sparse, '1');
    reject({ targetMetric: 'impressions', entries: sparse });
    const extra = example().entries as unknown[] & { SECRET?: string };
    extra.SECRET = 'canary';
    reject({ targetMetric: 'impressions', entries: extra });
  });

  it('supports ten entries and preserves bounded immutable ranking without external IO', () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry('content-' + i, 0, i));
    const result = rankLocalAnalyticsSnapshotChanges({ targetMetric: 'impressions', entries });
    expect(result.counts).toEqual({ compared: 10, ranked: 10, unavailable: 0 });
    expect(result.ranked.map((x) => x.contentId)).toEqual(entries.map((x) => x.contentId).reverse());
    expect(result.warnings).not.toContain('unavailable_excluded_from_ranking');
    reject({ targetMetric: 'impressions', entries: [...entries, entry('extra', 1, 2)] });
  });
});

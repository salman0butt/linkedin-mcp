import { describe, expect, it, vi } from 'vitest';

import {
  LocalAnalyticsSnapshotError,
  compareLocalAnalyticsSnapshots,
} from '../src/analytics/snapshot-comparison.js';

function sample() {
  return {
    contentId: 'post-local-001',
    contentKind: 'post',
    snapshots: [
      {
        capturedAtUtc: '2026-10-25T12:00:00.000Z',
        metrics: { impressions: 100, reactions: 20, comments: null, reposts: 4 },
      },
      {
        capturedAtUtc: '2026-10-27T12:00:00.000Z',
        metrics: { impressions: 90, reactions: 25, comments: 5, reposts: 4 },
      },
    ],
  };
}

function rejected(input: unknown) {
  try {
    compareLocalAnalyticsSnapshots(input);
    throw new Error('expected invalid input');
  } catch (error) {
    expect(error).toBeInstanceOf(LocalAnalyticsSnapshotError);
    expect((error as LocalAnalyticsSnapshotError).kind).toBe('invalid_input');
    expect(String(error)).not.toMatch(/SECRET|password|canary/u);
  }
}

describe('M12.0 pure local caller-metric snapshot comparison', () => {
  it('compares only caller-observed counters and preserves negative deltas, null, provenance', () => {
    const value = compareLocalAnalyticsSnapshots(sample());
    expect(value).toMatchObject({
      kind: 'local_content_metric_snapshot_comparison',
      status: 'comparison_only',
      provenance: 'caller_supplied_unverified',
      verification: 'not_performed',
      providerData: 'not_fetched',
      accountAuthorization: 'not_evaluated',
      publication: 'not_attempted',
      contentId: 'post-local-001',
      contentKind: 'post',
      capturesUtc: ['2026-10-25T12:00:00.000Z', '2026-10-27T12:00:00.000Z'],
      metrics: {
        impressions: { state: 'comparable', previous: 100, current: 90, delta: -10 },
        reactions: { state: 'comparable', previous: 20, current: 25, delta: 5 },
        comments: { state: 'unavailable', previous: null, current: 5, delta: null },
        reposts: { state: 'comparable', previous: 4, current: 4, delta: 0 },
      },
      warnings: [
        'caller_metrics_unverified',
        'not_provider_analytics',
        'snapshots_are_observations_only',
        'decrease_may_reflect_counter_revisions',
        'missing_metrics_not_zero',
      ],
    });
    expect(JSON.stringify(value)).not.toMatch(
      /engagementRate|clickThroughRate|accountToken|impliedPublished/u,
    );
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.metrics)).toBe(true);
    expect(Object.isFrozen(value.metrics.impressions)).toBe(true);
    expect(Object.isFrozen(value.warnings)).toBe(true);
    expect(() => (value.warnings as unknown as string[]).push('injected')).toThrow();
  });

  it('supports article snapshots with all available zero metrics without claiming provider analytics', () => {
    const input = sample();
    input.contentKind = 'article';
    for (const snapshot of input.snapshots) {
      snapshot.metrics = { impressions: 0, reactions: 0, comments: 0, reposts: 0 };
    }
    const value = compareLocalAnalyticsSnapshots(input);
    expect(value.contentKind).toBe('article');
    expect(value.metrics.comments).toEqual({ state: 'comparable', previous: 0, current: 0, delta: 0 });
    expect(value.warnings).toEqual([
      'caller_metrics_unverified',
      'not_provider_analytics',
      'snapshots_are_observations_only',
    ]);
  });

  it('rejects missing fields, sparse arrays, unavailable-only snapshots and unexpected secret data', () => {
    const original = sample();
    rejected({ ...original, SECRET_ACCESS_TOKEN: 'canary' });
    rejected({ ...original, snapshots: [original.snapshots[0]] });
    rejected({ ...original, contentId: 'urn:li:person:secret' });
    rejected({ ...original, contentKind: 'account' });
    rejected({ ...original, snapshots: [original.snapshots[1], original.snapshots[0]] });
    rejected({ ...original, snapshots: [original.snapshots[0], original.snapshots[0]] });
    rejected({
      ...original,
      snapshots: [
        original.snapshots[0],
        {
          ...original.snapshots[1],
          metrics: {
            impressions: null,
            reactions: null,
            comments: null,
            reposts: null,
          },
        },
      ],
    });
    rejected({
      ...original,
      snapshots: [
        original.snapshots[0],
        {
          ...original.snapshots[1],
          metrics: { impressions: 1, reactions: 2, comments: 3 },
        },
      ],
    });
    const hole = [original.snapshots[0], original.snapshots[1]];
    Reflect.deleteProperty(hole, '1');
    rejected({ ...original, snapshots: hole });
    const extraArray = [original.snapshots[0], original.snapshots[1]] as unknown[] & { password?: string };
    extraArray.password = 'canary';
    rejected({ ...original, snapshots: extraArray });
  });

  it('rejects impossible/noncanonical UTC dates, overflow and invalid counters', () => {
    for (const capturedAtUtc of [
      '2026-02-30T12:00:00.000Z',
      '2026-10-27T12:00:01.000Z',
      '2026-10-27T12:00:00+00:00',
      '2026-10-27T12:00:00.100Z',
    ]) {
      const input = sample();
      input.snapshots[1]!.capturedAtUtc = capturedAtUtc;
      rejected(input);
    }
    for (const invalid of [-1, 1.2, NaN, Infinity, 1_000_000_001, 9_007_199_254_740_992]) {
      const input = sample();
      input.snapshots[1]!.metrics.impressions = invalid;
      rejected(input);
    }
  });

  it('rejects proxy/accessor/unusual prototypes without invoking getters or leaking errors', () => {
    const original = sample();
    rejected(new Proxy(original, {}));
    const revoked = Proxy.revocable(original, {});
    revoked.revoke();
    rejected(revoked.proxy);
    rejected(Object.assign(Object.create(null), original));
    const getter = vi.fn(() => {
      throw new Error('SECRET getter canary');
    });
    const bad = sample();
    Object.defineProperty(bad.snapshots[0]!.metrics, 'impressions', { enumerable: true, get: getter });
    rejected(bad);
    expect(getter).not.toHaveBeenCalled();
    rejected({ ...sample(), snapshots: [new Proxy(sample().snapshots[0]!, {}), sample().snapshots[1]] });
  });
});

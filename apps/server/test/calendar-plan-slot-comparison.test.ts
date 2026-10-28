import { describe, expect, it, vi } from 'vitest';

import {
  CalendarPlanSlotComparisonError,
  compareLocalCalendarPlanSlots,
} from '../src/scheduling/calendar-plan-slot-comparison.js';

const A = '123e4567-e89b-42d3-a456-426614174000';
const B = '123e4567-e89b-42d3-a456-426614174001';
const SHARED = '2026-10-29T12:00:00.000Z';
const REFERENCE = '2026-10-27T10:00:00.000Z';

function plan(
  id: string,
  revision: number,
  items: Array<{ id: string; label: string; kind: string; plannedAtUtc: string }>,
) {
  return {
    id,
    revision,
    createdAt: '2026-10-27T09:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
    calendar: { referenceUtc: REFERENCE, items },
  };
}

function fixtures() {
  return [
    plan(A, 2, [
      {
        id: 'future',
        label: 'SECRET FUTURE 🤖',
        kind: 'text_post',
        plannedAtUtc: '2026-10-30T10:00:00.000Z',
      },
      { id: 'same', label: 'SECRET ONE 🌎', kind: 'manual_article_handoff', plannedAtUtc: SHARED },
      { id: 'same-tie', label: 'SECRET TWO 📅', kind: 'image_post', plannedAtUtc: SHARED },
    ]),
    plan(B, 4, [
      { id: 'same', label: 'SECRET THREE 🪐', kind: 'multi_image_post', plannedAtUtc: SHARED },
      { id: 'other', label: 'SECRET FOUR 🛰️', kind: 'text_post', plannedAtUtc: '2026-10-31T11:00:00.000Z' },
    ]),
  ];
}

function compare(plans: unknown = fixtures(), expectedRevisions: unknown = [2, 4]) {
  return compareLocalCalendarPlanSlots({ plans, expectedRevisions });
}

function reject(kind: CalendarPlanSlotComparisonError['kind'], plans: unknown, revisions: unknown = [2, 4]) {
  try {
    compare(plans, revisions);
    throw new Error('Expected slot comparison to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(CalendarPlanSlotComparisonError);
    expect((error as CalendarPlanSlotComparisonError).kind).toBe(kind);
    expect(String(error)).not.toMatch(/SECRET|PRIVATE_KEY|canary/u);
  }
}

describe('M11.3 pure UTC slot comparison between independent private plan revisions', () => {
  it('returns chronological collision metadata only in original plan and tied-item order', () => {
    const result = compare();
    expect(Object.keys(result)).toEqual([
      'kind',
      'status',
      'origin',
      'persistence',
      'execution',
      'approval',
      'publication',
      'snapshotConsistency',
      'plans',
      'collisions',
      'counts',
      'warnings',
    ]);
    expect(result).toMatchObject({
      kind: 'local_cross_plan_utc_slot_comparison',
      status: 'planning_only',
      origin: 'caller_defined',
      persistence: 'private_local',
      execution: 'not_queued',
      approval: 'not_evaluated',
      publication: 'not_attempted',
      snapshotConsistency: 'independent_revisions_not_atomic',
      plans: [
        { id: A, revision: 2, referenceUtc: REFERENCE, itemCount: 3 },
        { id: B, revision: 4, referenceUtc: REFERENCE, itemCount: 2 },
      ],
      collisions: [
        {
          plannedAtUtc: SHARED,
          items: [
            { planId: A, itemId: 'same', kind: 'manual_article_handoff', manualOnly: true },
            { planId: A, itemId: 'same-tie', kind: 'image_post', manualOnly: false },
            { planId: B, itemId: 'same', kind: 'multi_image_post', manualOnly: false },
          ],
        },
      ],
      counts: { comparedPlans: 2, collisionMinutes: 1, collisionItems: 3 },
      warnings: [
        'caller_planned_only',
        'independent_revisions_not_atomic',
        'no_scheduling_or_publishing',
        'approval_not_evaluated',
        'cross_plan_same_minute_collision',
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/SECRET|label|approvedAt|publicationReceiptId|token-/iu);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.collisions)).toBe(true);
    expect(Object.isFrozen(result.collisions[0]?.items)).toBe(true);
  });

  it('returns no cross-plan collisions for same-plan-only ties and different minutes', () => {
    const inputs = fixtures();
    inputs[1]!.calendar.items[0]!.plannedAtUtc = '2026-10-29T13:00:00.000Z';
    const result = compare(inputs);
    expect(result.collisions).toEqual([]);
    expect(result.counts).toEqual({ comparedPlans: 2, collisionMinutes: 0, collisionItems: 0 });
    expect(result.warnings).not.toContain('cross_plan_same_minute_collision');
  });

  it('sorts multiple cross-plan collision minutes and preserves both plan-specific ID namespaces', () => {
    const inputs = fixtures();
    inputs[0]!.calendar.items[0]!.plannedAtUtc = '2026-10-28T09:00:00.000Z';
    inputs[1]!.calendar.items[1]!.plannedAtUtc = '2026-10-28T09:00:00.000Z';
    const result = compare(inputs);
    expect(result.collisions.map((entry) => entry.plannedAtUtc)).toEqual([
      '2026-10-28T09:00:00.000Z',
      SHARED,
    ]);
    expect(result.counts).toMatchObject({ collisionMinutes: 2, collisionItems: 5 });
  });

  it('rejects stale revisions, invalid selections and duplicate plan IDs without caller data echo', () => {
    reject('revision_conflict', fixtures(), [1, 4]);
    reject('revision_conflict', fixtures(), [2, 3]);
    const same = fixtures();
    same[1]!.id = A;
    reject('invalid_input', same);
    reject('invalid_input', fixtures(), [2]);
    reject('invalid_input', fixtures(), [2, 0]);
    reject('invalid_input', fixtures(), [2, Number.MAX_SAFE_INTEGER + 1]);
    reject('invalid_input', [fixtures()[0]]);
    reject('invalid_input', [{ ...fixtures()[0] }, { ...fixtures()[1] }, { ...fixtures()[1] }]);
  });

  it('rejects invalid persisted metadata and invalid calendar semantics', () => {
    for (const mutate of [
      (x: ReturnType<typeof fixtures>) => {
        x[0]!.id = 'bad id';
      },
      (x: ReturnType<typeof fixtures>) => {
        x[0]!.createdAt = '2026-02-30T09:00:00.000Z';
      },
      (x: ReturnType<typeof fixtures>) => {
        x[0]!.updatedAt = '2026-10-26T09:00:00.000Z';
      },
      (x: ReturnType<typeof fixtures>) => {
        x[0]!.calendar.items[0]!.plannedAtUtc = '2026-10-27T09:00:00.000Z';
      },
      (x: ReturnType<typeof fixtures>) => {
        x[0]!.calendar.items[0]!.label = 'PRIVATE_KEY\ncanary';
      },
    ]) {
      const inputs = fixtures();
      mutate(inputs);
      reject('invalid_output', inputs);
    }
  });

  it('rejects proxies, accessors, unusual objects and unknown secret keys without invoking them', () => {
    const cases: unknown[] = [
      new Proxy(fixtures()[0]!, {}),
      Object.assign(Object.create(null), fixtures()[0]!),
      { ...fixtures()[0], PRIVATE_KEY: 'canary' },
    ];
    for (const first of cases) reject('invalid_output', [first, fixtures()[1]]);
    const withGetter = fixtures();
    const getter = vi.fn(() => {
      throw new Error('SECRET_GETTER_TRIGGERED');
    });
    Object.defineProperty(withGetter[0], 'id', { enumerable: true, configurable: true, get: getter });
    reject('invalid_output', withGetter);
    expect(getter).not.toHaveBeenCalled();
    const revoked = Proxy.revocable(fixtures()[0]!, {});
    revoked.revoke();
    reject('invalid_output', [revoked.proxy, fixtures()[1]]);
    const sparse = fixtures();
    const hole = [sparse[0], sparse[1]];
    Reflect.deleteProperty(hole, '1');
    reject('invalid_input', hole);
  });

  it('preserves 20-item per-plan bounds without leaks or mutable result structures', () => {
    const [left, right] = fixtures();
    left!.calendar.items = Array.from({ length: 20 }, (_, index) => ({
      id: `left-${index}`,
      label: `SECRET LEFT ${index} 🧠`,
      kind: 'text_post',
      plannedAtUtc: `2026-10-29T${String(index).padStart(2, '0')}:00:00.000Z`,
    }));
    right!.calendar.items = Array.from({ length: 20 }, (_, index) => ({
      id: `right-${index}`,
      label: `SECRET RIGHT ${index} 🌻`,
      kind: 'text_post',
      plannedAtUtc: `2026-10-29T${String(index).padStart(2, '0')}:00:00.000Z`,
    }));
    const result = compare([left, right]);
    expect(result.collisions).toHaveLength(20);
    expect(result.counts).toEqual({ comparedPlans: 2, collisionMinutes: 20, collisionItems: 40 });
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(32 * 1024);
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(() => {
      (result.collisions as unknown as unknown[]).push({});
    }).toThrow();
  });
});

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  CalendarPlanInspectionError,
  inspectLocalCalendarPlan,
} from '../src/scheduling/calendar-plan-inspection.js';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const AS_OF = '2026-10-28T12:30:00.000Z';

function fixture() {
  return {
    id: ID,
    revision: 3,
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T11:05:00.000Z',
    calendar: {
      referenceUtc: '2026-10-27T10:00:00.000Z',
      items: [
        {
          id: 'late',
          label: 'SECRET 🤖 engineering notes',
          kind: 'image_post',
          plannedAtUtc: '2026-10-30T07:00:00.000Z',
        },
        {
          id: 'tie-first',
          label: 'SECRET résumé é e\u0301',
          kind: 'manual_article_handoff',
          plannedAtUtc: AS_OF,
        },
        {
          id: 'early',
          label: 'SECRET launched',
          kind: 'text_post',
          plannedAtUtc: '2026-10-28T08:00:00.000Z',
        },
        { id: 'tie-second', label: 'SECRET \u6c49\u5b57', kind: 'multi_image_post', plannedAtUtc: AS_OF },
      ],
    },
  };
}

function inspect(plan: unknown = fixture(), expectedRevision: unknown = 3, asOfUtc: unknown = AS_OF) {
  return inspectLocalCalendarPlan({ plan, expectedRevision, asOfUtc });
}

function rejects(
  kind: CalendarPlanInspectionError['kind'],
  plan: unknown,
  revision?: unknown,
  asOfUtc?: unknown,
) {
  const expectedRevision = arguments.length >= 3 ? revision : 3;
  const asOf = arguments.length >= 4 ? asOfUtc : AS_OF;
  try {
    inspectLocalCalendarPlan({ plan, expectedRevision, asOfUtc: asOf });
    throw new Error('Expected inspection rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(CalendarPlanInspectionError);
    expect((error as CalendarPlanInspectionError).kind).toBe(kind);
    for (const secret of ['SECRET', 'malicious-secret', 'untrusted_key', 'Engineering']) {
      expect(String(error)).not.toContain(secret);
    }
  }
}

describe('M11.2 pure revision-gated saved calendar plan inspection', () => {
  it('returns exactly planning-only fields with strict stable UTC ordering and exact-time past bucket', () => {
    const source = fixture();
    const result = inspect(source);
    expect(Object.keys(result)).toEqual([
      'kind',
      'status',
      'origin',
      'persistence',
      'execution',
      'approval',
      'publication',
      'id',
      'revision',
      'createdAt',
      'updatedAt',
      'referenceUtc',
      'asOfUtc',
      'planDigest',
      'pastAsOf',
      'futureAsOf',
      'counts',
      'collisions',
      'warnings',
    ]);
    expect(result).toMatchObject({
      kind: 'local_saved_plan_inspection',
      status: 'planning_only',
      origin: 'caller_defined',
      persistence: 'private_local',
      execution: 'not_queued',
      approval: 'not_evaluated',
      publication: 'not_attempted',
      id: ID,
      revision: 3,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      referenceUtc: source.calendar.referenceUtc,
      asOfUtc: AS_OF,
      counts: { pastAsOf: 3, futureAsOf: 1 },
      collisions: [{ plannedAtUtc: AS_OF, itemIds: ['tie-first', 'tie-second'] }],
      warnings: [
        'caller_planned_only',
        'no_scheduling_or_publishing',
        'approval_not_evaluated',
        'same_minute_collision',
        'manual_article_handoff_only',
      ],
    });
    expect(result.pastAsOf).toEqual([
      { id: 'early', kind: 'text_post', plannedAtUtc: '2026-10-28T08:00:00.000Z', manualOnly: false },
      { id: 'tie-first', kind: 'manual_article_handoff', plannedAtUtc: AS_OF, manualOnly: true },
      { id: 'tie-second', kind: 'multi_image_post', plannedAtUtc: AS_OF, manualOnly: false },
    ]);
    expect(result.futureAsOf).toEqual([
      { id: 'late', kind: 'image_post', plannedAtUtc: '2026-10-30T07:00:00.000Z', manualOnly: false },
    ]);
    expect(result.planDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(result)).not.toMatch(
      /SECRET|résumé|Engineering|launched|汉字|label|scheduledJobId|approvalReceiptId/u,
    );
    expect(source.calendar.items.map((item) => item.id)).toEqual([
      'late',
      'tie-first',
      'early',
      'tie-second',
    ]);
  });

  it('digest is version-domain separated, plan-only, deterministic over original Unicode and order', () => {
    const base = fixture();
    const earlier = inspect(base, 3, '2026-10-27T10:00:00.000Z');
    const later = inspect(base, 3, '2027-01-25T10:00:00.000Z');
    const again = inspect(base);
    expect(earlier.planDigest).toBe(later.planDigest);
    expect(earlier.planDigest).toBe(again.planDigest);
    expect(earlier.counts).toEqual({ pastAsOf: 0, futureAsOf: 4 });
    expect(later.counts).toEqual({ pastAsOf: 4, futureAsOf: 0 });
    const plain = createHash('sha256')
      .update(
        JSON.stringify({
          id: ID,
          revision: 3,
          calendar: base.calendar,
        }),
      )
      .digest('hex');
    expect(earlier.planDigest).not.toBe(plain);
    expect(earlier.planDigest).toBe(
      createHash('sha256')
        .update('linkedin-mcp.local-calendar-plan-inspection.plan-only.v1\0', 'utf8')
        .update(JSON.stringify({ id: base.id, revision: base.revision, calendar: base.calendar }), 'utf8')
        .digest('hex'),
    );
    expect(inspect({ ...base, revision: 4 }, 4).planDigest).not.toBe(again.planDigest);
    expect(
      inspect({ ...base, calendar: { ...base.calendar, items: [...base.calendar.items].reverse() } })
        .planDigest,
    ).not.toBe(again.planDigest);
    expect(
      inspect({
        ...base,
        calendar: {
          ...base.calendar,
          items: base.calendar.items.map((item, i) => ({
            ...item,
            label: i === 0 ? 'A different caller label' : item.label,
          })),
        },
      }).planDigest,
    ).not.toBe(again.planDigest);
    expect(inspect({ ...base, updatedAt: '2026-10-27T12:00:00.000Z' }).planDigest).toBe(again.planDigest);
  });

  it('is deeply immutable, bounded, and deterministic without any ambient clock', () => {
    const originalNow = Date.now;
    Date.now = () => {
      throw new Error('NOT_AN_AMBIENT_CLOCK');
    };
    try {
      const result = inspect();
      expect(result).toEqual(inspect());
      for (const part of [
        result,
        result.pastAsOf,
        result.futureAsOf,
        result.counts,
        result.collisions,
        result.collisions[0],
        result.collisions[0]?.itemIds,
        result.warnings,
        result.pastAsOf[0],
        result.futureAsOf[0],
      ]) {
        expect(Object.isFrozen(part)).toBe(true);
      }
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(32 * 1024);
    } finally {
      Date.now = originalNow;
    }
  });

  it('remains bounded at 20 maximum-size Unicode caller items without leaking any labels', () => {
    const original = fixture();
    const calendar = {
      referenceUtc: original.calendar.referenceUtc,
      items: Array.from({ length: 20 }, (_, i) => ({
        id: 'id' + String(i).padStart(62, 'x'),
        label: '🤖'.repeat(60),
        kind: 'manual_article_handoff',
        plannedAtUtc: AS_OF,
      })),
    };
    const result = inspect({ ...original, calendar });
    expect(result.counts).toEqual({ pastAsOf: 20, futureAsOf: 0 });
    expect(result.collisions[0]?.itemIds).toHaveLength(20);
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(32 * 1024);
    expect(JSON.stringify(result)).not.toContain('🤖');
    expect(Object.isFrozen(result.collisions[0]?.itemIds)).toBe(true);
  });

  it('rejects invalid expectedRevision and asOfUtc, but reports stale revision separately', () => {
    for (const bad of [undefined, null, 0, -1, 1.5, '3', Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
      rejects('invalid_input', fixture(), bad);
    }
    for (const bad of [
      undefined,
      123,
      '2026-10-28T12:30:00Z',
      '2026-10-28T12:30:00.001Z',
      '2026-10-28T12:30:30.000Z',
      '2026-10-28T12:30:00.000+00:00',
      '2026-02-30T12:30:00.000Z',
      '2025-02-29T12:30:00.000Z',
      '2026-10-28T24:30:00.000Z',
      '2026-10-28T12:60:00.000Z',
    ])
      rejects('invalid_input', fixture(), 3, bad);
    rejects('revision_conflict', fixture(), 2);
    rejects('revision_conflict', fixture(), 4);
  });

  it('rejects invalid persisted metadata, unknown fields and semantic forged calendars', () => {
    const good = fixture();
    for (const plan of [
      null,
      [],
      Object.create(null),
      { ...good, id: 'not-a-uuid' },
      { ...good, revision: 0 },
      { ...good, revision: '3' },
      { ...good, createdAt: '2026-10-27T10:00:00Z' },
      { ...good, updatedAt: '2026-10-27T12:05:00.000+00:00' },
      { ...good, updatedAt: '2026-10-26T11:05:00.000Z' },
      { ...good, untrusted_key: 'malicious-secret' },
      { ...good, calendar: { ...good.calendar, untrusted_key: 'malicious-secret' } },
      { ...good, calendar: { ...good.calendar, items: [] } },
      {
        ...good,
        calendar: {
          ...good.calendar,
          items: [...good.calendar.items, { ...good.calendar.items[0], id: 'LATE' }],
        },
      },
      {
        ...good,
        calendar: {
          ...good.calendar,
          items: [{ ...good.calendar.items[0], plannedAtUtc: good.calendar.referenceUtc }],
        },
      },
      {
        ...good,
        calendar: {
          ...good.calendar,
          items: [{ ...good.calendar.items[0], extraSecret: 'malicious-secret' }],
        },
      },
      {
        ...good,
        calendar: { ...good.calendar, items: [{ ...good.calendar.items[0], label: 'malicious-secret\n' }] },
      },
    ])
      rejects('invalid_output', plan);
  });

  it('rejects proxies, revoked proxies, accessor getters and symbols without triggering user code', () => {
    const base = fixture();
    let traps = 0;
    const hostile = new Proxy(base, {
      getPrototypeOf() {
        traps++;
        throw Error('malicious-secret');
      },
      get() {
        traps++;
        throw Error('malicious-secret');
      },
      ownKeys() {
        traps++;
        throw Error('malicious-secret');
      },
    });
    rejects('invalid_output', hostile);
    const revoked = Proxy.revocable(base, {});
    revoked.revoke();
    rejects('invalid_output', revoked.proxy);
    rejects('invalid_output', {
      ...base,
      calendar: new Proxy(base.calendar, {
        getPrototypeOf() {
          traps++;
          throw Error('malicious-secret');
        },
      }),
    });
    rejects('invalid_output', {
      ...base,
      calendar: {
        ...base.calendar,
        items: [
          new Proxy(base.calendar.items[0]!, {
            getPrototypeOf() {
              traps++;
              throw Error('malicious-secret');
            },
          }),
        ],
      },
    });
    for (const at of ['plan', 'calendar', 'item'] as const) {
      let reads = 0;
      const getter = {
        get untrusted_key(): string {
          reads++;
          throw Error('malicious-secret');
        },
      };
      const bad = {
        ...base,
        calendar: { ...base.calendar, items: base.calendar.items.map((item) => ({ ...item })) },
      };
      const target = at === 'plan' ? bad : at === 'calendar' ? bad.calendar : bad.calendar.items[0]!;
      Object.defineProperty(
        target,
        'untrusted_key',
        Object.getOwnPropertyDescriptor(getter, 'untrusted_key')!,
      );
      rejects('invalid_output', bad);
      expect(reads).toBe(0);
    }
    rejects('invalid_output', Object.assign({}, base, { [Symbol('SECRET')]: 'malicious-secret' }));
    expect(traps).toBe(0);
  });

  it('rejects hostile outer call objects without evaluating their getters or proxy traps', () => {
    const good = { plan: fixture(), expectedRevision: 3, asOfUtc: AS_OF };
    let called = 0;
    const hostile = new Proxy(good, {
      getPrototypeOf() {
        called++;
        throw Error('malicious-secret');
      },
      get() {
        called++;
        throw Error('malicious-secret');
      },
    });
    expect(() => inspectLocalCalendarPlan(hostile)).toThrow(CalendarPlanInspectionError);
    const revoked = Proxy.revocable(good, {});
    revoked.revoke();
    expect(() => inspectLocalCalendarPlan(revoked.proxy)).toThrow(CalendarPlanInspectionError);
    const accessor = { ...good };
    Object.defineProperty(accessor, 'asOfUtc', {
      enumerable: true,
      get() {
        called++;
        throw Error('malicious-secret');
      },
    });
    expect(() => inspectLocalCalendarPlan(accessor)).toThrow(CalendarPlanInspectionError);
    expect(called).toBe(0);
    const secretField = { ...good, untrusted_key: 'malicious-secret' };
    expect(() => inspectLocalCalendarPlan(secretField)).toThrow(CalendarPlanInspectionError);
    expect(() => inspectLocalCalendarPlan({ ...good, [Symbol('secret')]: 'malicious-secret' })).toThrow(
      CalendarPlanInspectionError,
    );
    const sparse = fixture();
    sparse.calendar.items.length = 5;
    rejects('invalid_output', sparse);
  });
});

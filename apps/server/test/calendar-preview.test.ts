import { describe, expect, it } from 'vitest';

import { previewLocalContentCalendar } from '../src/scheduling/calendar-preview.js';

const referenceUtc = '2026-10-27T10:00:00.000Z';

function fixture() {
  return {
    referenceUtc,
    items: [
      {
        id: 'late',
        label: 'Publish later',
        kind: 'image_post',
        plannedAtUtc: '2026-10-29T08:10:00.000Z',
      },
      {
        id: 'first',
        label: 'Human article handoff',
        kind: 'manual_article_handoff',
        plannedAtUtc: '2026-10-28T12:30:00.000Z',
      },
      {
        id: 'second',
        label: 'Text-only idea',
        kind: 'text_post',
        plannedAtUtc: '2026-10-28T12:30:00.000Z',
      },
      {
        id: 'third',
        label: 'Multi-image idea',
        kind: 'multi_image_post',
        plannedAtUtc: '2026-10-28T12:31:00.000Z',
      },
    ],
  };
}

function reject(input: unknown): void {
  expect(() => previewLocalContentCalendar(input)).toThrow(/Invalid|invalid|large/u);
}

describe('M11.0 pure caller-defined local content calendar preview', () => {
  it('groups chronological UTC days, preserves same-minute order and never claims queue/approval/publication', () => {
    const input = fixture();
    const result = previewLocalContentCalendar(input);
    expect(result).toEqual({
      kind: 'local_content_calendar_preview',
      status: 'planning_only',
      origin: 'caller_defined',
      persistence: 'none',
      execution: 'not_queued',
      approval: 'not_evaluated',
      publication: 'not_attempted',
      referenceUtc,
      days: [
        {
          utcDate: '2026-10-28',
          items: [
            { ...input.items[1], manualOnly: true },
            { ...input.items[2], manualOnly: false },
            { ...input.items[3], manualOnly: false },
          ],
        },
        { utcDate: '2026-10-29', items: [{ ...input.items[0], manualOnly: false }] },
      ],
      collisions: [{ plannedAtUtc: '2026-10-28T12:30:00.000Z', itemIds: ['first', 'second'] }],
      warnings: [
        'caller_planned_only',
        'no_scheduling_or_publishing',
        'approval_not_evaluated',
        'same_minute_collision',
        'manual_article_handoff_only',
      ],
    });
    expect(previewLocalContentCalendar(input)).toEqual(result);
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(32 * 1024);
    expect(JSON.stringify(result)).not.toContain('approvalReceiptId');
    expect(JSON.stringify(result)).not.toContain('scheduledJobId');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.days)).toBe(true);
    expect(Object.isFrozen(result.days[0])).toBe(true);
    expect(Object.isFrozen(result.days[0]?.items)).toBe(true);
    expect(Object.isFrozen(result.days[0]?.items[0])).toBe(true);
    expect(Object.isFrozen(result.collisions)).toBe(true);
    expect(Object.isFrozen(result.collisions[0]?.itemIds)).toBe(true);
    expect(Object.isFrozen(result.warnings)).toBe(true);
    expect(input.items.map((item) => item.id)).toEqual(['late', 'first', 'second', 'third']);
  });

  it('treats boundaries as exact caller UTC instants and rejects invalid or noncanonical minute timestamps', () => {
    const base = fixture();
    const refMs = Date.parse(referenceUtc);
    const at90d = new Date(refMs + 90 * 86_400_000).toISOString();
    const at90dAndMinute = new Date(refMs + 90 * 86_400_000 + 60_000).toISOString();
    const sole = { ...base.items[0], plannedAtUtc: at90d };
    const firstMinute = new Date(refMs + 60_000).toISOString();
    expect(
      previewLocalContentCalendar({
        referenceUtc,
        items: [{ ...sole, plannedAtUtc: firstMinute }],
      }).days[0]?.items[0]?.plannedAtUtc,
    ).toBe(firstMinute);
    expect(previewLocalContentCalendar({ referenceUtc, items: [sole] }).days[0]?.items[0]?.plannedAtUtc).toBe(
      at90d,
    );
    for (const candidate of [
      referenceUtc,
      at90dAndMinute,
      '2026-02-30T10:00:00.000Z',
      '2025-02-29T10:00:00.000Z',
      '2026-10-27T24:00:00.000Z',
      '2026-10-27T10:60:00.000Z',
      '2026-10-27T10:59:60.000Z',
      '2026-10-27T10:00:01.000Z',
      '2026-10-27T10:00:00.001Z',
      '2026-10-27T10:00:00Z',
      '2026-10-27T12:30:00.000+02:00',
      '2026-10-27T10:00:00.000+00:00',
      '2026-10-27T10:00:00.000z',
      '2026-10-27 10:00:00.000Z',
      '2026-10-27T02:30:00.000',
      '2026-13-27T10:00:00.000Z',
    ]) {
      reject({ referenceUtc, items: [{ ...sole, plannedAtUtc: candidate }] });
    }
    for (const badReference of [
      '2026-02-30T10:00:00.000Z',
      '2026-10-27T10:00:00Z',
      '2026-10-27T10:00:00.000+00:00',
      '2026-10-27T10:00:30.000Z',
      '2026-10-27T02:30:00.000',
    ]) {
      reject({ referenceUtc: badReference, items: [sole] });
    }
    expect(
      previewLocalContentCalendar({
        referenceUtc: '2024-02-28T23:59:00.000Z',
        items: [{ ...sole, plannedAtUtc: '2024-02-29T00:00:00.000Z' }],
      }).days[0]?.utcDate,
    ).toBe('2024-02-29');
  });

  it('enforces 1–20 entries, unique case-insensitive raw IDs and exact four safe kinds', () => {
    const one = { ...fixture().items[0], id: 'constructor' };
    expect(previewLocalContentCalendar({ referenceUtc, items: [one] }).days[0]?.items[0]?.id).toBe(
      'constructor',
    );
    const twenty = Array.from({ length: 20 }, (_, i) => ({ ...one, id: 's' + i }));
    expect(previewLocalContentCalendar({ referenceUtc, items: twenty }).days[0]?.items).toHaveLength(20);
    reject({ referenceUtc, items: [] });
    reject({ referenceUtc, items: [...twenty, { ...one, id: 'overflow' }] });
    reject({ referenceUtc, items: [one, { ...one, id: 'CONSTRUCTOR' }] });
    for (const badId of [' extra', 'extra ', 'with.dot', '__proto__', '-leading', '', '🤖', 'x'.repeat(65)]) {
      reject({ referenceUtc, items: [{ ...one, id: badId }] });
    }
    for (const kind of ['post', 'carousel', 'video', 'article', 'native_article_publish', 'draft']) {
      reject({ referenceUtc, items: [{ ...one, kind }] });
    }
    expect(
      previewLocalContentCalendar({ referenceUtc, items: [{ ...one, id: 'toString' }] }).days[0]?.items[0]
        ?.id,
    ).toBe('toString');
  });

  it('rejects malformed labels, unauthorized injected data and never normalizes caller text silently', () => {
    const one = fixture().items[0];
    const valid = { ...one, label: '🤖 Engineering  notes' };
    expect(previewLocalContentCalendar({ referenceUtc, items: [valid] }).days[0]?.items[0]?.label).toBe(
      valid.label,
    );
    for (const label of [
      '',
      '   ',
      ' padded',
      'padded ',
      'bad\nlabel',
      'bad\tlabel',
      'bad\u0080label',
      'bad\u2028label',
      'bad\u2029label',
      'a\ud800b',
      'b\udfff',
      'x'.repeat(121),
    ]) {
      reject({ referenceUtc, items: [{ ...one, label }] });
    }
    for (const request of [
      { referenceUtc, items: [one], approved: true },
      { referenceUtc, items: [one], PRIVATE_TOKEN_NAME: 'PRIVATE_TOKEN_VALUE' },
      { referenceUtc, items: [{ ...one, autoPublish: true }] },
      { referenceUtc, items: [{ ...one, callbackUrl: 'https://example.org/secret' }] },
      { referenceUtc, items: [{ ...one, approvalReceiptId: 'private' }] },
    ]) {
      reject(request);
    }
  });

  it('rejects hostile proxies/getters/own symbols/sparse and polluted structures without evaluating accessors', () => {
    const request = fixture();
    let getterInvocations = 0;
    const rootGetter = { ...request };
    Object.defineProperty(rootGetter, 'referenceUtc', {
      enumerable: true,
      get() {
        getterInvocations++;
        throw new Error('PRIVATE_SECRET_GETTER');
      },
    });
    const badItem = { ...request.items[0] };
    Object.defineProperty(badItem, 'label', {
      enumerable: true,
      get() {
        getterInvocations++;
        throw new Error('PRIVATE_SECRET_GETTER');
      },
    });
    const badArray = [...request.items];
    Object.defineProperty(badArray, '0', {
      enumerable: true,
      get() {
        getterInvocations++;
        throw new Error('PRIVATE_SECRET_GETTER');
      },
    });
    const hole = [...request.items];
    Reflect.deleteProperty(hole, '0');
    const extras = [...request.items] as typeof request.items & { privateSecret?: string };
    extras.privateSecret = 'PRIVATE_TOKEN_VALUE';
    const nonenumerable = { ...request.items[0] };
    Object.defineProperty(nonenumerable, 'hiddenSecret', { enumerable: false, value: 'PRIVATE' });
    const badRootNoProto = Object.assign(Object.create(null) as Record<string, unknown>, request);
    const proxy = new Proxy(request, {});
    const { proxy: revoked, revoke } = Proxy.revocable(request, {});
    revoke();
    const candidates: unknown[] = [
      rootGetter,
      { ...request, items: [badItem] },
      { ...request, items: badArray },
      { ...request, items: hole },
      { ...request, items: extras },
      { ...request, items: [nonenumerable] },
      { ...request, items: new Proxy(request.items, {}) },
      { ...request, [Symbol('PRIVATE')]: 'PRIVATE' },
      { ...request, items: [{ ...request.items[0], [Symbol('PRIVATE')]: 'PRIVATE' }] },
      badRootNoProto,
      proxy,
      revoked,
      Object.assign(Object.create({ injected: 'PRIVATE' }) as Record<string, unknown>, request),
    ];
    for (const candidate of candidates) reject(candidate);
    expect(getterInvocations).toBe(0);
  });

  it('emits only fixed three warnings when neither collisions nor manual handoffs apply', () => {
    const one = { ...fixture().items[0], id: 'one' };
    const result = previewLocalContentCalendar({ referenceUtc, items: [one] });
    expect(result.warnings).toEqual([
      'caller_planned_only',
      'no_scheduling_or_publishing',
      'approval_not_evaluated',
    ]);
    expect(result.collisions).toEqual([]);
    expect(result.days).toHaveLength(1);
  });

  it('reports each exact-minute collision in chronological order without merging or rescheduling same-day ideas', () => {
    const first = fixture().items[0];
    const item = (id: string, plannedAtUtc: string) => ({ ...first, id, plannedAtUtc });
    const input = {
      referenceUtc,
      items: [
        item('d', '2026-10-28T12:32:00.000Z'),
        item('b', '2026-10-28T12:31:00.000Z'),
        item('f', '2026-10-28T12:32:00.000Z'),
        item('a', '2026-10-28T12:31:00.000Z'),
        item('e', '2026-10-28T12:32:00.000Z'),
        item('c', '2026-10-28T12:31:00.000Z'),
      ],
    };
    const preview = previewLocalContentCalendar(input);
    expect(preview.days).toHaveLength(1);
    expect(preview.days[0]?.items.map((entry) => entry.id)).toEqual(['b', 'a', 'c', 'd', 'f', 'e']);
    expect(preview.collisions).toEqual([
      { plannedAtUtc: '2026-10-28T12:31:00.000Z', itemIds: ['b', 'a', 'c'] },
      { plannedAtUtc: '2026-10-28T12:32:00.000Z', itemIds: ['d', 'f', 'e'] },
    ]);
    expect(preview.warnings).toEqual([
      'caller_planned_only',
      'no_scheduling_or_publishing',
      'approval_not_evaluated',
      'same_minute_collision',
    ]);
    expect(Object.isFrozen(preview.collisions[1])).toBe(true);
    expect(Object.isFrozen(preview.collisions[1]?.itemIds)).toBe(true);
  });

  it('keeps UTF-8 input and output bounded with 20 full-length multibyte labels and IDs', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      id: 'entry-' + String(index).padStart(2, '0') + '-'.repeat(56),
      label: '界'.repeat(120),
      kind: 'text_post' as const,
      plannedAtUtc: new Date(Date.parse(referenceUtc) + (index + 1) * 60_000).toISOString(),
    }));
    expect(items.every((item) => item.id.length === 64)).toBe(true);
    const input = { referenceUtc, items };
    const inputBytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
    expect(inputBytes).toBeLessThanOrEqual(16 * 1024);
    const result = previewLocalContentCalendar(input);
    expect(result.days[0]?.items).toHaveLength(20);
    expect(result.days[0]?.items.every((item) => item.label === items[0]?.label)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(32 * 1024);
    expect(Object.isFrozen(result.days[0]?.items[19])).toBe(true);
    expect(result.collisions).toEqual([]);
  });
});

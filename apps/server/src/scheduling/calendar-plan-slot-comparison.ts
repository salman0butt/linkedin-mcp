import { types } from 'node:util';

import {
  previewLocalContentCalendar,
  type LocalCalendarItemKind,
  type LocalCalendarPreview,
} from './calendar-preview.js';

export type CalendarPlanSlotComparisonErrorKind = 'invalid_input' | 'invalid_output' | 'revision_conflict';

/** Never include caller text, private paths, provider errors or store contents in errors. */
export class CalendarPlanSlotComparisonError extends Error {
  constructor(readonly kind: CalendarPlanSlotComparisonErrorKind) {
    super(
      (
        {
          invalid_input: 'Invalid private calendar plan comparison input.',
          invalid_output: 'Private saved calendar plan snapshot is invalid.',
          revision_conflict: 'Private saved calendar plan revision does not match.',
        } as const
      )[kind],
    );
    this.name = 'CalendarPlanSlotComparisonError';
  }
}

export interface LocalCalendarPlanSlotComparison {
  readonly kind: 'local_cross_plan_utc_slot_comparison';
  readonly status: 'planning_only';
  readonly origin: 'caller_defined';
  readonly persistence: 'private_local';
  readonly execution: 'not_queued';
  readonly approval: 'not_evaluated';
  readonly publication: 'not_attempted';
  readonly snapshotConsistency: 'independent_revisions_not_atomic';
  readonly plans: readonly Readonly<{
    id: string;
    revision: number;
    referenceUtc: string;
    itemCount: number;
  }>[];
  readonly collisions: readonly Readonly<{
    plannedAtUtc: string;
    items: readonly Readonly<{
      planId: string;
      itemId: string;
      kind: LocalCalendarItemKind;
      manualOnly: boolean;
    }>[];
  }>[];
  readonly counts: Readonly<{
    comparedPlans: 2;
    collisionMinutes: number;
    collisionItems: number;
  }>;
  readonly warnings: readonly (
    | 'caller_planned_only'
    | 'independent_revisions_not_atomic'
    | 'no_scheduling_or_publishing'
    | 'approval_not_evaluated'
    | 'cross_plan_same_minute_collision'
  )[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_OUTPUT_BYTES = 32 * 1024;

function fail(kind: CalendarPlanSlotComparisonErrorKind): never {
  throw new CalendarPlanSlotComparisonError(kind);
}

/** No inherited/accessor/proxy evaluation. Extra keys, including secrets, fail closed. */
function ownData(
  value: unknown,
  expected: readonly string[],
  kind: CalendarPlanSlotComparisonErrorKind,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail(kind);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Reflect.ownKeys(value);
  if (names.length !== expected.length) fail(kind);
  const result: Record<string, unknown> = {};
  for (const name of names) {
    if (typeof name !== 'string' || !expected.includes(name)) fail(kind);
    const entry = descriptors[name];
    if (!entry?.enumerable || !Object.hasOwn(entry, 'value')) fail(kind);
    result[name] = entry.value;
  }
  if (expected.some((name) => !Object.hasOwn(descriptors, name))) fail(kind);
  return result;
}

function exactArray(
  value: unknown,
  length: number,
  kind: CalendarPlanSlotComparisonErrorKind,
): readonly unknown[] {
  if (
    types.isProxy(value) ||
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length !== length ||
    Reflect.ownKeys(value).length !== length + 1
  )
    fail(kind);
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(kind);
    result.push(descriptor.value);
  }
  return result;
}

function safeRevision(value: unknown, kind: CalendarPlanSlotComparisonErrorKind): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) fail(kind);
  return value;
}

function safeTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) fail('invalid_output');
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value) fail('invalid_output');
  return value;
}

function validatedPlan(
  value: unknown,
  expectedRevision: unknown,
): {
  id: string;
  revision: number;
  referenceUtc: string;
  itemCount: number;
  preview: Readonly<LocalCalendarPreview>;
} {
  const expected = safeRevision(expectedRevision, 'invalid_input');
  const data = ownData(value, ['id', 'revision', 'createdAt', 'updatedAt', 'calendar'], 'invalid_output');
  if (typeof data.id !== 'string' || !UUID.test(data.id)) fail('invalid_output');
  const revision = safeRevision(data.revision, 'invalid_output');
  const created = safeTimestamp(data.createdAt);
  const updated = safeTimestamp(data.updatedAt);
  if (updated < created) fail('invalid_output');
  let preview: Readonly<LocalCalendarPreview>;
  try {
    preview = previewLocalContentCalendar(data.calendar);
  } catch {
    fail('invalid_output');
  }
  if (revision !== expected) fail('revision_conflict');
  let count = 0;
  for (const day of preview.days) count += day.items.length;
  return {
    id: data.id,
    revision,
    referenceUtc: preview.referenceUtc,
    itemCount: count,
    preview,
  };
}

/**
 * Compare only exact UTC minutes present in two independently read private
 * plan revisions. No transactional snapshot, stored writer, clock, queue,
 * provider, approval or LinkedIn operation exists.
 */
export function compareLocalCalendarPlanSlots(input: {
  plans: unknown;
  expectedRevisions: unknown;
}): Readonly<LocalCalendarPlanSlotComparison> {
  const args = ownData(input, ['plans', 'expectedRevisions'], 'invalid_input');
  const rawPlans = exactArray(args.plans, 2, 'invalid_input');
  const revisions = exactArray(args.expectedRevisions, 2, 'invalid_input');
  const first = validatedPlan(rawPlans[0], revisions[0]);
  const second = validatedPlan(rawPlans[1], revisions[1]);
  if (first.id === second.id) fail('invalid_input');

  type CollisionItem = LocalCalendarPlanSlotComparison['collisions'][number]['items'][number];
  const minutes = new Map<string, [CollisionItem[], CollisionItem[]]>();
  for (const [position, snapshot] of [first, second].entries()) {
    for (const day of snapshot.preview.days) {
      for (const item of day.items) {
        const groups = minutes.get(item.plannedAtUtc) ?? [[], []];
        groups[position]!.push(
          Object.freeze({
            planId: snapshot.id,
            itemId: item.id,
            kind: item.kind,
            manualOnly: item.manualOnly,
          }),
        );
        minutes.set(item.plannedAtUtc, groups);
      }
    }
  }
  const collisions = Object.freeze(
    [...minutes]
      .filter(([, groups]) => groups[0].length > 0 && groups[1].length > 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([plannedAtUtc, groups]) =>
        Object.freeze({ plannedAtUtc, items: Object.freeze([...groups[0], ...groups[1]]) }),
      ),
  );
  const collisionItems = collisions.reduce((total, entry) => total + entry.items.length, 0);
  const warnings: LocalCalendarPlanSlotComparison['warnings'] = Object.freeze([
    'caller_planned_only',
    'independent_revisions_not_atomic',
    'no_scheduling_or_publishing',
    'approval_not_evaluated',
    ...(collisions.length ? (['cross_plan_same_minute_collision'] as const) : []),
  ]);
  const result: LocalCalendarPlanSlotComparison = Object.freeze({
    kind: 'local_cross_plan_utc_slot_comparison',
    status: 'planning_only',
    origin: 'caller_defined',
    persistence: 'private_local',
    execution: 'not_queued',
    approval: 'not_evaluated',
    publication: 'not_attempted',
    snapshotConsistency: 'independent_revisions_not_atomic',
    plans: Object.freeze(
      [first, second].map(({ id, revision, referenceUtc, itemCount }) =>
        Object.freeze({ id, revision, referenceUtc, itemCount }),
      ),
    ),
    collisions,
    counts: Object.freeze({ comparedPlans: 2, collisionMinutes: collisions.length, collisionItems }),
    warnings,
  });
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_OUTPUT_BYTES) fail('invalid_output');
  return result;
}

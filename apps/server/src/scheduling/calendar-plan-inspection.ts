import { createHash } from 'node:crypto';
import { types } from 'node:util';

import {
  previewLocalContentCalendar,
  type LocalCalendarItemKind,
  type LocalCalendarPreview,
} from './calendar-preview.js';

export type CalendarPlanInspectionErrorKind = 'invalid_input' | 'invalid_output' | 'revision_conflict';

/** Fixed strings only; never repeat private labels, keys, paths or host values. */
export class CalendarPlanInspectionError extends Error {
  constructor(readonly kind: CalendarPlanInspectionErrorKind) {
    super(
      (
        {
          invalid_input: 'Invalid local calendar plan inspection input.',
          invalid_output: 'Invalid saved calendar plan snapshot.',
          revision_conflict: 'Saved calendar plan revision does not match.',
        } as const
      )[kind],
    );
    this.name = 'CalendarPlanInspectionError';
  }
}

export interface LocalCalendarPlanInspectionItem {
  readonly id: string;
  readonly kind: LocalCalendarItemKind;
  readonly plannedAtUtc: string;
  readonly manualOnly: boolean;
}

export interface LocalCalendarPlanInspection {
  readonly kind: 'local_saved_plan_inspection';
  readonly status: 'planning_only';
  readonly origin: 'caller_defined';
  readonly persistence: 'private_local';
  readonly execution: 'not_queued';
  readonly approval: 'not_evaluated';
  readonly publication: 'not_attempted';
  readonly id: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly referenceUtc: string;
  readonly asOfUtc: string;
  readonly planDigest: string;
  readonly pastAsOf: readonly Readonly<LocalCalendarPlanInspectionItem>[];
  readonly futureAsOf: readonly Readonly<LocalCalendarPlanInspectionItem>[];
  readonly counts: Readonly<{ pastAsOf: number; futureAsOf: number }>;
  readonly collisions: LocalCalendarPreview['collisions'];
  readonly warnings: LocalCalendarPreview['warnings'];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UTC_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const UTC_MINUTE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:00\.000Z$/u;
const DIGEST_DOMAIN = 'linkedin-mcp.local-calendar-plan-inspection.plan-only.v1\0';
const MAX_OUTPUT_BYTES = 32 * 1024;

function fail(kind: CalendarPlanInspectionErrorKind): never {
  throw new CalendarPlanInspectionError(kind);
}

/** Own data only, with Proxy detection ahead of any reflective traversal. */
function record(
  value: unknown,
  names: readonly string[],
  kind: CalendarPlanInspectionErrorKind = 'invalid_output',
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(kind);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length) fail(kind);
  const safe: Record<string, unknown> = {};
  for (const name of keys) {
    if (typeof name !== 'string' || !names.includes(name)) fail(kind);
    const descriptor = descriptors[name];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(kind);
    safe[name] = descriptor.value;
  }
  if (names.some((name) => !Object.hasOwn(descriptors, name))) fail(kind);
  return safe;
}

function calendarItems(value: unknown): readonly unknown[] {
  if (
    types.isProxy(value) ||
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length < 1 ||
    value.length > 20 ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    fail('invalid_output');
  const items: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const element = Object.getOwnPropertyDescriptor(value, String(i));
    if (!element?.enumerable || !Object.hasOwn(element, 'value')) fail('invalid_output');
    items.push(element.value);
  }
  return items;
}

function safeUtc(value: unknown, minute: boolean, kind: CalendarPlanInspectionErrorKind): string {
  if (typeof value !== 'string' || !(minute ? UTC_MINUTE : UTC_TIME).test(value)) fail(kind);
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value) fail(kind);
  return value;
}

function safeRevision(value: unknown, kind: CalendarPlanInspectionErrorKind): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) fail(kind);
  return value;
}

/**
 * Inspect one already-read private plan revision at an explicit caller UTC
 * minute. The digest identifies this *plan*, not an execution authorization.
 * No clocks, filesystem, provider, approval, queue or publishing operations.
 */
export function inspectLocalCalendarPlan(input: {
  plan: unknown;
  expectedRevision: unknown;
  asOfUtc: unknown;
}): Readonly<LocalCalendarPlanInspection> {
  const args = record(input, ['plan', 'expectedRevision', 'asOfUtc'], 'invalid_input');
  const expected = safeRevision(args.expectedRevision, 'invalid_input');
  const instant = safeUtc(args.asOfUtc, true, 'invalid_input');
  const snapshot = record(args.plan, ['id', 'revision', 'createdAt', 'updatedAt', 'calendar']);
  if (typeof snapshot.id !== 'string' || !UUID.test(snapshot.id)) fail('invalid_output');
  const revision = safeRevision(snapshot.revision, 'invalid_output');
  const createdAt = safeUtc(snapshot.createdAt, false, 'invalid_output');
  const updatedAt = safeUtc(snapshot.updatedAt, false, 'invalid_output');
  if (updatedAt < createdAt) fail('invalid_output');

  // Existing semantic parser validates the strict shape, order, Unicode,
  // kinds, 90-day horizon, duplicate IDs and bounded original calendar.
  let preview: Readonly<LocalCalendarPreview>;
  try {
    preview = previewLocalContentCalendar(snapshot.calendar);
  } catch {
    fail('invalid_output');
  }
  const calendar = record(snapshot.calendar, ['referenceUtc', 'items']);
  const items = calendarItems(calendar.items).map((item) => {
    const valid = record(item, ['id', 'label', 'kind', 'plannedAtUtc']);
    return Object.freeze({
      id: valid.id as string,
      label: valid.label as string,
      kind: valid.kind as LocalCalendarItemKind,
      plannedAtUtc: valid.plannedAtUtc as string,
    });
  });
  const validatedCalendar = Object.freeze({
    referenceUtc: calendar.referenceUtc as string,
    items: Object.freeze(items),
  });
  if (revision !== expected) fail('revision_conflict');

  const planDigest = createHash('sha256')
    .update(DIGEST_DOMAIN, 'utf8')
    .update(JSON.stringify({ id: snapshot.id, revision, calendar: validatedCalendar }), 'utf8')
    .digest('hex');
  const past: LocalCalendarPlanInspectionItem[] = [];
  const future: LocalCalendarPlanInspectionItem[] = [];
  for (const day of preview.days) {
    for (const item of day.items) {
      const projected = Object.freeze({
        id: item.id,
        kind: item.kind,
        plannedAtUtc: item.plannedAtUtc,
        manualOnly: item.manualOnly,
      });
      (item.plannedAtUtc <= instant ? past : future).push(projected);
    }
  }
  const result: LocalCalendarPlanInspection = Object.freeze({
    kind: 'local_saved_plan_inspection',
    status: 'planning_only',
    origin: 'caller_defined',
    persistence: 'private_local',
    execution: 'not_queued',
    approval: 'not_evaluated',
    publication: 'not_attempted',
    id: snapshot.id,
    revision,
    createdAt,
    updatedAt,
    referenceUtc: validatedCalendar.referenceUtc,
    asOfUtc: instant,
    planDigest,
    pastAsOf: Object.freeze(past),
    futureAsOf: Object.freeze(future),
    counts: Object.freeze({ pastAsOf: past.length, futureAsOf: future.length }),
    collisions: preview.collisions,
    warnings: preview.warnings,
  });
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_OUTPUT_BYTES) fail('invalid_output');
  return result;
}

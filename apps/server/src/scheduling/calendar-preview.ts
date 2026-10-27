import { types } from 'node:util';

export type LocalCalendarItemKind =
  | 'text_post'
  | 'image_post'
  | 'multi_image_post'
  | 'manual_article_handoff';

export interface LocalCalendarPreview {
  readonly kind: 'local_content_calendar_preview';
  readonly status: 'planning_only';
  readonly origin: 'caller_defined';
  readonly persistence: 'none';
  readonly execution: 'not_queued';
  readonly approval: 'not_evaluated';
  readonly publication: 'not_attempted';
  readonly referenceUtc: string;
  readonly days: readonly Readonly<{
    utcDate: string;
    items: readonly Readonly<{
      id: string;
      label: string;
      kind: LocalCalendarItemKind;
      plannedAtUtc: string;
      manualOnly: boolean;
    }>[];
  }>[];
  readonly collisions: readonly Readonly<{
    plannedAtUtc: string;
    itemIds: readonly string[];
  }>[];
  readonly warnings: readonly (
    | 'caller_planned_only'
    | 'no_scheduling_or_publishing'
    | 'approval_not_evaluated'
    | 'same_minute_collision'
    | 'manual_article_handoff_only'
  )[];
}

export type CalendarPreviewErrorKind = 'invalid_input' | 'input_too_large' | 'output_too_large';

/** Never interpolate caller-supplied property names, timestamps, labels or other data. */
export class CalendarPreviewError extends Error {
  readonly kind: CalendarPreviewErrorKind;

  constructor(kind: CalendarPreviewErrorKind = 'invalid_input') {
    super(
      kind === 'invalid_input'
        ? 'Invalid local content calendar input.'
        : 'Local content calendar too large.',
    );
    this.kind = kind;
    this.name = 'CalendarPreviewError';
  }
}

interface ValidItem {
  readonly id: string;
  readonly label: string;
  readonly kind: LocalCalendarItemKind;
  readonly plannedAtUtc: string;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const UTC_MINUTE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:00\.000Z$/u;
const MAX_INPUT_BYTES = 16 * 1024;
const MAX_OUTPUT_BYTES = 32 * 1024;
const MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

function invalid(): never {
  throw new CalendarPreviewError();
}

function ownData(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== 'object' ||
    types.isProxy(input) ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    invalid();
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.length !== keys.length) invalid();
  const result: Record<string, unknown> = {};
  for (const key of ownKeys) {
    if (typeof key !== 'string' || !keys.includes(key)) invalid();
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    result[key] = descriptor.value;
  }
  if (keys.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  return result;
}

function ownArray(input: unknown, min: number, max: number): readonly unknown[] {
  if (
    types.isProxy(input) ||
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    input.length < min ||
    input.length > max ||
    Reflect.ownKeys(input).length !== input.length + 1
  ) {
    invalid();
  }
  const result: unknown[] = [];
  for (let i = 0; i < input.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    result.push(descriptor.value);
  }
  return result;
}

function safeId(input: unknown): string {
  if (typeof input !== 'string' || !ID_PATTERN.test(input)) invalid();
  return input;
}

function safeLabel(input: unknown): string {
  if (
    typeof input !== 'string' ||
    input.length < 1 ||
    input.length > 120 ||
    !input.trim() ||
    input.trim() !== input
  ) {
    invalid();
  }
  for (const codepoint of input) {
    const cp = codepoint.codePointAt(0)!;
    if (
      cp < 32 ||
      (cp >= 127 && cp <= 159) ||
      (cp >= 0xd800 && cp <= 0xdfff) ||
      cp === 0x2028 ||
      cp === 0x2029
    ) {
      invalid();
    }
  }
  return input;
}

function safeKind(input: unknown): LocalCalendarItemKind {
  if (
    input !== 'text_post' &&
    input !== 'image_post' &&
    input !== 'multi_image_post' &&
    input !== 'manual_article_handoff'
  ) {
    invalid();
  }
  return input;
}

function safeMinute(input: unknown): { text: string; instant: number } {
  if (typeof input !== 'string' || !UTC_MINUTE.test(input)) invalid();
  const instant = Date.parse(input);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== input) invalid();
  return { text: input, instant };
}

/**
 * A deterministic caller-authored calendar arrangement. This is NOT a scheduler:
 * there is no clock, persistence, credential access, approval or publishing I/O.
 */
export function previewLocalContentCalendar(input: unknown): Readonly<LocalCalendarPreview> {
  const root = ownData(input, ['referenceUtc', 'items']);
  const reference = safeMinute(root.referenceUtc);
  const seen = new Set<string>();
  const items: ValidItem[] = [];
  for (const rawItem of ownArray(root.items, 1, 20)) {
    const entry = ownData(rawItem, ['id', 'label', 'kind', 'plannedAtUtc']);
    const id = safeId(entry.id);
    const identity = id.toLowerCase();
    if (seen.has(identity)) invalid();
    seen.add(identity);
    const label = safeLabel(entry.label);
    const kind = safeKind(entry.kind);
    const planned = safeMinute(entry.plannedAtUtc);
    const distance = planned.instant - reference.instant;
    if (distance <= 0 || distance > MAX_AHEAD_MS) invalid();
    items.push(Object.freeze({ id, label, kind, plannedAtUtc: planned.text }));
  }

  // Measure *validated own data*, not potentially hostile caller objects.
  const canonicalInput = { referenceUtc: reference.text, items };
  if (Buffer.byteLength(JSON.stringify(canonicalInput), 'utf8') > MAX_INPUT_BYTES)
    throw new CalendarPreviewError('input_too_large');

  // Canonical UTC ISO-8601 instants sort chronologically as raw ASCII strings.
  // Explicit caller position preserves ties without locale/ICU dependencies.
  const sorted = items
    .map((item, position) => ({ item, position }))
    .sort((a, b) =>
      a.item.plannedAtUtc < b.item.plannedAtUtc
        ? -1
        : a.item.plannedAtUtc > b.item.plannedAtUtc
          ? 1
          : a.position - b.position,
    );
  const byDay = new Map<string, LocalCalendarPreview['days'][number]['items'][number][]>();
  const byMinute = new Map<string, string[]>();
  let manualArticle = false;
  for (const { item } of sorted) {
    const utcDate = item.plannedAtUtc.slice(0, 10);
    const manualOnly = item.kind === 'manual_article_handoff';
    if (manualOnly) manualArticle = true;
    const projected = Object.freeze({ ...item, manualOnly });
    const day = byDay.get(utcDate) ?? [];
    day.push(projected);
    byDay.set(utcDate, day);
    const minute = byMinute.get(item.plannedAtUtc) ?? [];
    minute.push(item.id);
    byMinute.set(item.plannedAtUtc, minute);
  }

  const days = Object.freeze(
    [...byDay].map(([utcDate, dayItems]) => Object.freeze({ utcDate, items: Object.freeze(dayItems) })),
  );
  const collisions = Object.freeze(
    [...byMinute]
      .filter(([, ids]) => ids.length > 1)
      .map(([plannedAtUtc, itemIds]) => Object.freeze({ plannedAtUtc, itemIds: Object.freeze(itemIds) })),
  );
  const warnings: LocalCalendarPreview['warnings'] = Object.freeze([
    'caller_planned_only',
    'no_scheduling_or_publishing',
    'approval_not_evaluated',
    ...(collisions.length ? (['same_minute_collision'] as const) : []),
    ...(manualArticle ? (['manual_article_handoff_only'] as const) : []),
  ]);
  const result: LocalCalendarPreview = Object.freeze({
    kind: 'local_content_calendar_preview',
    status: 'planning_only',
    origin: 'caller_defined',
    persistence: 'none',
    execution: 'not_queued',
    approval: 'not_evaluated',
    publication: 'not_attempted',
    referenceUtc: reference.text,
    days,
    collisions,
    warnings,
  });
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_OUTPUT_BYTES)
    throw new CalendarPreviewError('output_too_large');
  return result;
}

import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { compareLocalCalendarPlanSlots } from './scheduling/calendar-plan-slot-comparison.js';
import { inspectLocalCalendarPlan } from './scheduling/calendar-plan-inspection.js';
import { previewLocalContentCalendar } from './scheduling/calendar-preview.js';
import { CalendarPlanStoreError, type LocalCalendarPlanStore } from './scheduling/calendar-plan-store.js';

interface CalendarPlanToolsDeps {
  transport?: 'stdio' | 'http';
  calendarStore?: LocalCalendarPlanStore;
  createRequestId: () => string;
  now: () => Date;
}

const id = z.string().uuid();
const revision = z.number().int().safe().min(1);
const utcMinute = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/u);
const item = z.strictObject(
  {
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u),
    label: z.string().min(1).max(120),
    kind: z.enum(['text_post', 'image_post', 'multi_image_post', 'manual_article_handoff']),
    plannedAtUtc: utcMinute,
  },
  { error: () => 'Invalid calendar item.' },
);
const calendar = z.strictObject(
  { referenceUtc: utcMinute, items: z.array(item).min(1).max(20) },
  { error: () => 'Invalid calendar definition.' },
);
const key = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$/u);
const createInput = z.strictObject(
  { idempotencyKey: key, calendar },
  { error: () => 'Invalid calendar plan create request.' },
);
const updateInput = z.strictObject(
  { id, expectedRevision: revision, calendar },
  { error: () => 'Invalid calendar plan update request.' },
);
const getInput = z.strictObject({ id }, { error: () => 'Invalid calendar plan read request.' });
const removeInput = z.strictObject(
  { id, expectedRevision: revision },
  { error: () => 'Invalid calendar plan remove request.' },
);
const listInput = z.strictObject({}, { error: () => 'Invalid calendar plan list request.' });
const inspectInput = z.strictObject(
  {
    id,
    expectedRevision: revision,
    asOfUtc: utcMinute.refine(
      (value) => {
        const instant = Date.parse(value);
        return Number.isFinite(instant) && new Date(instant).toISOString() === value;
      },
      { error: () => 'Invalid calendar plan inspection UTC minute.' },
    ),
  },
  { error: () => 'Invalid calendar plan inspection request.' },
);
const planRevisionRef = z.strictObject(
  { id, expectedRevision: revision },
  { error: () => 'Invalid private calendar plan comparison reference.' },
);
const compareSlotsInput = z.strictObject(
  {
    plans: z
      .array(planRevisionRef)
      .length(2)
      .refine((entries) => entries[0]?.id !== entries[1]?.id, {
        error: () => 'Private calendar plan comparison requires distinct IDs.',
      }),
  },
  { error: () => 'Invalid private calendar plan comparison request.' },
);

const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
const rawPlan = z.strictObject({
  id,
  revision,
  createdAt: timestamp,
  updatedAt: timestamp,
  calendar,
});
const planning = z.strictObject({
  persistence: z.literal('private_local'),
  execution: z.literal('not_queued'),
  approval: z.literal('not_evaluated'),
  publication: z.literal('not_attempted'),
});
const planningFacts = {
  persistence: 'private_local',
  execution: 'not_queued',
  approval: 'not_evaluated',
  publication: 'not_attempted',
} as const;
const savedPlan = rawPlan.extend(planning.shape);
const summary = z.strictObject({
  id,
  revision,
  createdAt: timestamp,
  updatedAt: timestamp,
  referenceUtc: utcMinute,
  itemCount: z.number().int().min(1).max(20),
});
const summaries = z.array(summary).max(20);
const inspectionItem = z.strictObject({
  id: item.shape.id,
  kind: item.shape.kind,
  plannedAtUtc: utcMinute,
  manualOnly: z.boolean(),
});
const inspection = z.strictObject({
  kind: z.literal('local_saved_plan_inspection'),
  status: z.literal('planning_only'),
  origin: z.literal('caller_defined'),
  ...planning.shape,
  id,
  revision,
  createdAt: timestamp,
  updatedAt: timestamp,
  referenceUtc: utcMinute,
  asOfUtc: utcMinute,
  planDigest: z.string().regex(/^[0-9a-f]{64}$/u),
  pastAsOf: z.array(inspectionItem).max(20),
  futureAsOf: z.array(inspectionItem).max(20),
  counts: z.strictObject({
    pastAsOf: z.number().int().min(0).max(20),
    futureAsOf: z.number().int().min(0).max(20),
  }),
  collisions: z
    .array(
      z.strictObject({
        plannedAtUtc: utcMinute,
        itemIds: z.array(item.shape.id).min(2).max(20),
      }),
    )
    .max(20),
  warnings: z
    .array(
      z.enum([
        'caller_planned_only',
        'no_scheduling_or_publishing',
        'approval_not_evaluated',
        'same_minute_collision',
        'manual_article_handoff_only',
      ]),
    )
    .min(3)
    .max(5),
});
const slotComparisonItem = z.strictObject({
  planId: id,
  itemId: item.shape.id,
  kind: item.shape.kind,
  manualOnly: z.boolean(),
});
const slotComparison = z.strictObject({
  kind: z.literal('local_cross_plan_utc_slot_comparison'),
  status: z.literal('planning_only'),
  origin: z.literal('caller_defined'),
  ...planning.shape,
  snapshotConsistency: z.literal('independent_revisions_not_atomic'),
  plans: z
    .array(
      z.strictObject({
        id,
        revision,
        referenceUtc: utcMinute,
        itemCount: z.number().int().min(1).max(20),
      }),
    )
    .length(2),
  collisions: z
    .array(
      z.strictObject({
        plannedAtUtc: utcMinute,
        items: z.array(slotComparisonItem).min(2).max(40),
      }),
    )
    .max(20),
  counts: z.strictObject({
    comparedPlans: z.literal(2),
    collisionMinutes: z.number().int().min(0).max(20),
    collisionItems: z.number().int().min(0).max(40),
  }),
  warnings: z
    .tuple([
      z.literal('caller_planned_only'),
      z.literal('independent_revisions_not_atomic'),
      z.literal('no_scheduling_or_publishing'),
      z.literal('approval_not_evaluated'),
    ])
    .or(
      z.tuple([
        z.literal('caller_planned_only'),
        z.literal('independent_revisions_not_atomic'),
        z.literal('no_scheduling_or_publishing'),
        z.literal('approval_not_evaluated'),
        z.literal('cross_plan_same_minute_collision'),
      ]),
    ),
});

const codes = [
  'local_store_not_available',
  'invalid_input',
  'not_found',
  'revision_conflict',
  'idempotency_conflict',
  'capacity',
  'unsafe_store',
  'outcome_unknown',
  'invalid_output',
  'output_too_large',
] as const;
type ErrorCode = (typeof codes)[number];
type Status = 'succeeded' | 'unsupported' | 'failed' | 'partial';
const commonOutput = z.strictObject({
  status: z.enum(['succeeded', 'unsupported', 'failed', 'partial']),
  provider: z.strictObject({ type: z.literal('LOCAL_ONLY'), name: z.literal('linkedin-mcp') }),
  planning: planning.optional(),
  error: z
    .strictObject({
      code: z.enum(codes),
      message: z.literal('Private local calendar plan operation could not be safely completed.'),
      retryable: z.boolean(),
    })
    .optional(),
  metadata: z.strictObject({ requestId: z.string().min(1).max(128), timestamp: timestamp }),
});
const outputFor = <T extends z.ZodTypeAny>(schema: T) => commonOutput.safeExtend({ data: schema.optional() });
const MAX_MCP_BYTES = 262_144;
const JSON_RPC_ALLOWANCE_BYTES = 2_048;

function errorCode(error: unknown): ErrorCode {
  try {
    if (error === null || typeof error !== 'object' || !Object.hasOwn(error, 'kind')) return 'invalid_input';
    const value: unknown = Object.getOwnPropertyDescriptor(error, 'kind')?.value;
    return typeof value === 'string' && (codes as readonly string[]).includes(value)
      ? (value as ErrorCode)
      : 'invalid_input';
  } catch {
    return 'invalid_input';
  }
}

function reply(
  deps: CalendarPlanToolsDeps,
  status: Status,
  data?: unknown,
  code?: ErrorCode,
  committed = false,
) {
  const rawId = deps.createRequestId();
  const requestId =
    typeof rawId === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(rawId) ? rawId : 'invalid-request-id';
  const provider = { type: 'LOCAL_ONLY' as const, name: 'linkedin-mcp' as const };
  const metadata = { requestId, timestamp: deps.now().toISOString() };
  const makeError = (error: ErrorCode) => ({
    code: error,
    message: 'Private local calendar plan operation could not be safely completed.' as const,
    retryable: error === 'outcome_unknown',
  });
  const createEnvelope = (state: Status, result?: unknown, failure?: ErrorCode) => ({
    status: state,
    provider,
    ...(state === 'succeeded' ? { planning: planningFacts } : {}),
    ...(result === undefined ? {} : { data: result }),
    ...(failure === undefined ? {} : { error: makeError(failure) }),
    metadata,
  });
  let envelope = createEnvelope(status, data, code);
  let serialized = JSON.stringify(envelope);
  const bytes =
    Buffer.byteLength(
      JSON.stringify({ content: [{ type: 'text', text: serialized }], structuredContent: envelope }),
      'utf8',
    ) + JSON_RPC_ALLOWANCE_BYTES;
  if (bytes > MAX_MCP_BYTES) {
    const fallback = committed ? 'outcome_unknown' : 'output_too_large';
    envelope = createEnvelope(committed ? 'partial' : 'failed', undefined, fallback);
    serialized = JSON.stringify(envelope);
  }
  return {
    content: [{ type: 'text' as const, text: serialized }],
    structuredContent: envelope,
    ...(envelope.status === 'succeeded' ? {} : { isError: true as const }),
  };
}

/** Private host-owned calendar draft state. No timer, queue, approval or LinkedIn provider. */
export function registerCalendarPlanTools(server: McpServer, deps: CalendarPlanToolsDeps): void {
  async function saved<T extends z.ZodTypeAny>(
    output: T,
    mutate: boolean,
    run: (store: LocalCalendarPlanStore) => Promise<unknown>,
  ) {
    if (deps.transport !== 'stdio' || deps.calendarStore === undefined)
      return reply(deps, 'unsupported', undefined, 'local_store_not_available');
    let committed = false;
    try {
      const value = await run(deps.calendarStore);
      committed = mutate;
      const validated = output.safeParse(value);
      if (!validated.success)
        return reply(
          deps,
          mutate ? 'partial' : 'failed',
          undefined,
          mutate ? 'outcome_unknown' : 'invalid_output',
        );
      return reply(deps, 'succeeded', validated.data, undefined, committed);
    } catch (error) {
      const code = errorCode(error);
      return reply(deps, code === 'outcome_unknown' ? 'partial' : 'failed', undefined, code);
    }
  }

  const requireCalendar = (input: { calendar: unknown }) => {
    // The same pure validator used by M11.0 enforces true UTC minutes,
    // exact own data, size limits and absence of forged execution metadata.
    previewLocalContentCalendar(input.calendar);
  };
  const checked = <T extends { calendar: unknown }>(input: T, operation: (args: T) => Promise<unknown>) => {
    requireCalendar(input);
    return operation(input);
  };
  const planResult = (raw: unknown) => {
    const parsed = rawPlan.safeParse(raw);
    if (!parsed.success) return undefined;
    try {
      // Revalidate data returned by an injected store before presenting it as
      // durable caller-authored planning state. A malformed result after a
      // write has an uncertain outcome and must not be echoed to the caller.
      previewLocalContentCalendar(parsed.data.calendar);
    } catch {
      return undefined;
    }
    return { ...parsed.data, ...planningFacts };
  };

  server.registerTool(
    'linkedin.calendar.plans.create',
    {
      description:
        'Persist a private opt-in STDIO planning-only calendar using a create idempotency key; never queue or publish.',
      inputSchema: createInput,
      outputSchema: outputFor(savedPlan),
    },
    (input) =>
      saved(savedPlan, true, async (store) => {
        const result = await checked(input, (args) => store.create(args));
        return planResult(result);
      }),
  );
  server.registerTool(
    'linkedin.calendar.plans.update',
    {
      description: 'Replace a private STDIO calendar plan at its expected revision; no scheduled execution.',
      inputSchema: updateInput,
      outputSchema: outputFor(savedPlan),
    },
    (input) =>
      saved(savedPlan, true, async (store) => {
        const result = await checked(input, (args) => store.update(args));
        return planResult(result);
      }),
  );
  server.registerTool(
    'linkedin.calendar.plans.get',
    {
      description: 'Read one private STDIO calendar plan by its host-created UUID; planning only.',
      inputSchema: getInput,
      outputSchema: outputFor(savedPlan.nullable()),
    },
    (input) =>
      saved(savedPlan.nullable(), false, async (store) => {
        const result = await store.get(input);
        return result === null ? null : planResult(result);
      }),
  );
  server.registerTool(
    'linkedin.calendar.plans.inspect',
    {
      description:
        'Read-only inspect one exact revision of a private STDIO calendar plan at a caller-declared UTC minute; never queue, approve or publish.',
      inputSchema: inspectInput,
      outputSchema: outputFor(inspection),
    },
    (input) =>
      saved(inspection, false, async (store) => {
        // The stored snapshot is retrieved exactly once. Validation, digest
        // and ordering are pure; inspection cannot reserve or execute a slot.
        const plan = await store.get({ id: input.id });
        if (plan === null) throw new CalendarPlanStoreError('not_found');
        return inspectLocalCalendarPlan({
          plan,
          expectedRevision: input.expectedRevision,
          asOfUtc: input.asOfUtc,
        });
      }),
  );
  server.registerTool(
    'linkedin.calendar.plans.compare_slots',
    {
      description:
        'Compare UTC-minute collisions between two explicitly selected private STDIO plan revisions. Independent read-only snapshots; no queue, approval, provider or publication.',
      inputSchema: compareSlotsInput,
      outputSchema: outputFor(slotComparison),
    },
    (input) =>
      saved(slotComparison, false, async (store) => {
        // No cross-plan transaction is claimed: these two independently read
        // persisted revisions are checked by the pure semantic comparator.
        const first = await store.get({ id: input.plans[0]!.id });
        if (first === null) throw new CalendarPlanStoreError('not_found');
        const second = await store.get({ id: input.plans[1]!.id });
        if (second === null) throw new CalendarPlanStoreError('not_found');
        return compareLocalCalendarPlanSlots({
          plans: [first, second],
          expectedRevisions: [input.plans[0]!.expectedRevision, input.plans[1]!.expectedRevision],
        });
      }),
  );
  server.registerTool(
    'linkedin.calendar.plans.list',
    {
      description: 'List only private local calendar plan metadata; never return calendar labels.',
      inputSchema: listInput,
      outputSchema: outputFor(summaries),
    },
    () => saved(summaries, false, (store) => store.list()),
  );
  server.registerTool(
    'linkedin.calendar.plans.remove',
    {
      description:
        'Remove a private local plan only at its expected revision; never cancel a LinkedIn scheduled action.',
      inputSchema: removeInput,
      outputSchema: outputFor(z.boolean()),
    },
    (input) => saved(z.boolean(), true, (store) => store.remove(input)),
  );
}

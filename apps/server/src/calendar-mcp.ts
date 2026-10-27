import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { CalendarPreviewError, previewLocalContentCalendar } from './scheduling/calendar-preview.js';

interface CalendarDeps {
  createRequestId: () => string;
  now: () => Date;
}

const calendarKind = z.enum(['text_post', 'image_post', 'multi_image_post', 'manual_article_handoff']);
const calendarId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u);
const utcMinute = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/u);
const calendarItemInput = z.strictObject(
  {
    id: calendarId,
    label: z.string().min(1).max(120),
    kind: calendarKind,
    plannedAtUtc: utcMinute,
  },
  { error: () => 'Invalid calendar item fields.' },
);
const calendarInput = z.strictObject(
  {
    referenceUtc: utcMinute,
    items: z.array(calendarItemInput).min(1).max(20),
  },
  { error: () => 'Invalid calendar request fields.' },
);

const calendarPreviewItem = z
  .object({
    id: calendarId,
    label: z.string().min(1).max(120),
    kind: calendarKind,
    plannedAtUtc: utcMinute,
    manualOnly: z.boolean(),
  })
  .strict();
const calendarData = z
  .object({
    kind: z.literal('local_content_calendar_preview'),
    status: z.literal('planning_only'),
    origin: z.literal('caller_defined'),
    persistence: z.literal('none'),
    execution: z.literal('not_queued'),
    approval: z.literal('not_evaluated'),
    publication: z.literal('not_attempted'),
    referenceUtc: utcMinute,
    days: z
      .array(
        z
          .object({
            utcDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
            items: z.array(calendarPreviewItem).min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    collisions: z
      .array(
        z
          .object({
            plannedAtUtc: utcMinute,
            itemIds: z.array(calendarId).min(2).max(20),
          })
          .strict(),
      )
      .max(10),
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
  })
  .strict();
const calendarOutput = z
  .object({
    status: z.enum(['succeeded', 'failed']),
    data: calendarData.optional(),
    provider: z.object({ type: z.literal('LOCAL_ONLY'), name: z.literal('linkedin-mcp') }).strict(),
    error: z
      .object({
        code: z.enum(['invalid_input', 'invalid_output', 'output_too_large']),
        message: z.literal('Calendar preview could not be safely prepared.'),
        retryable: z.literal(false),
      })
      .strict()
      .optional(),
    metadata: z.object({ requestId: z.string().min(1).max(128), timestamp: z.string().max(30) }).strict(),
  })
  .strict();

const MAX_MCP_RESULT_BYTES = 262_144;
const JSON_RPC_ALLOWANCE_BYTES = 2_048;
type CalendarErrorCode = 'invalid_input' | 'invalid_output' | 'output_too_large';

function reply(deps: CalendarDeps, status: 'succeeded' | 'failed', data?: unknown, code?: CalendarErrorCode) {
  const rawRequestId = deps.createRequestId();
  const requestId =
    typeof rawRequestId === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(rawRequestId)
      ? rawRequestId
      : 'invalid-request-id';
  const metadata = { requestId, timestamp: deps.now().toISOString() };
  const provider = { type: 'LOCAL_ONLY' as const, name: 'linkedin-mcp' as const };
  const errorFor = (errorCode: CalendarErrorCode) => ({
    code: errorCode,
    message: 'Calendar preview could not be safely prepared.' as const,
    retryable: false as const,
  });
  let envelope = {
    status,
    ...(data === undefined ? {} : { data }),
    provider,
    ...(code === undefined ? {} : { error: errorFor(code) }),
    metadata,
  };
  let serialized = JSON.stringify(envelope);
  const bytes =
    Buffer.byteLength(
      JSON.stringify({
        content: [{ type: 'text', text: serialized }],
        structuredContent: envelope,
      }),
      'utf8',
    ) + JSON_RPC_ALLOWANCE_BYTES;
  if (bytes > MAX_MCP_RESULT_BYTES) {
    envelope = { status: 'failed', provider, error: errorFor('output_too_large'), metadata };
    serialized = JSON.stringify(envelope);
  }
  return {
    content: [{ type: 'text' as const, text: serialized }],
    structuredContent: envelope,
    ...(envelope.status === 'succeeded' ? {} : { isError: true as const }),
  };
}

/** Caller-defined dates only: never reads any scheduler, publisher, credentials, or private stores. */
export function registerCalendarTools(server: McpServer, deps: CalendarDeps): void {
  server.registerTool(
    'linkedin.calendar.preview',
    {
      description:
        'Read-only, stateless UTC content calendar preview for caller-defined slots. Planning only: never queues, approves, schedules or publishes content.',
      inputSchema: calendarInput,
      outputSchema: calendarOutput,
    },
    (input) => {
      try {
        const result = reply(deps, 'succeeded', previewLocalContentCalendar(input));
        if (!calendarOutput.safeParse(result.structuredContent).success)
          return reply(deps, 'failed', undefined, 'invalid_output');
        return result;
      } catch (error) {
        return reply(
          deps,
          'failed',
          undefined,
          error instanceof CalendarPreviewError && error.kind === 'output_too_large'
            ? 'output_too_large'
            : 'invalid_input',
        );
      }
    },
  );
}

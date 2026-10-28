import type { McpServer } from '@modelcontextprotocol/server';
import { types } from 'node:util';
import * as z from 'zod/v4';

import {
  compareLocalAnalyticsObservationSeries,
  LocalAnalyticsSeriesError,
} from './analytics/snapshot-series.js';

interface Dependencies {
  createRequestId: () => string;
  now: () => Date;
}

const MAX_WIRE_BYTES = 262_144;
const ENVELOPE_ALLOWANCE_BYTES = 2_048;
const ERROR_MESSAGE = 'Local metric observation series could not be safely compared.' as const;
type ErrorCode = 'invalid_input' | 'invalid_output' | 'output_too_large';

const counter = z.number().int().min(0).max(1_000_000_000).nullable();
const metricsInput = z.strictObject(
  {
    impressions: counter,
    reactions: counter,
    comments: counter,
    reposts: counter,
  },
  { error: () => 'Invalid local metric observation fields.' },
);
const snapshotInput = z.strictObject(
  {
    capturedAtUtc: z.string().max(24),
    metrics: metricsInput,
  },
  { error: () => 'Invalid local metric observation capture.' },
);
const contentId = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u);
const contentKind = z.enum(['post', 'article']);
const input = z.strictObject(
  {
    contentId,
    contentKind,
    snapshots: z.array(snapshotInput).min(3).max(10),
  },
  { error: () => 'Invalid local metric observation series request.' },
);

const metric = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('unavailable'),
    previous: counter,
    current: counter,
    delta: z.null(),
  }),
  z.strictObject({
    state: z.literal('comparable'),
    previous: counter.unwrap(),
    current: counter.unwrap(),
    delta: z.number().int().min(-1_000_000_000).max(1_000_000_000),
  }),
]);
const interval = z.strictObject({
  fromUtc: z.string().max(24),
  toUtc: z.string().max(24),
  // Enum records require exactly these four keys at runtime, avoiding four
  // repeated schemas in the 256 KiB HTTP tool-list response.
  metrics: z.record(z.enum(['impressions', 'reactions', 'comments', 'reposts']), metric),
});
const data = z.strictObject({
  kind: z.literal('local_caller_metric_observation_series'),
  status: z.literal('observations_only'),
  provenance: z.literal('caller_supplied_unverified'),
  verification: z.literal('not_performed'),
  providerData: z.literal('not_fetched'),
  accountAuthorization: z.literal('not_evaluated'),
  publication: z.literal('not_attempted'),
  contentId,
  contentKind,
  capturesUtc: z.array(z.string().max(24)).min(3).max(10),
  intervals: z.array(interval).min(2).max(9),
  counts: z.strictObject({
    captures: z.number().int().min(3).max(10),
    intervals: z.number().int().min(2).max(9),
  }),
  warnings: z
    .array(
      z.enum([
        'caller_metrics_unverified',
        'capture_intervals_not_provider_windows',
        'no_rates_or_performance_inferred',
        'missing_metrics_not_zero',
        'negative_delta_may_reflect_counter_revisions',
      ]),
    )
    .min(3)
    .max(5),
});
const output = z.strictObject({
  status: z.enum(['succeeded', 'failed']),
  data: data.optional(),
  provider: z.strictObject({ type: z.literal('LOCAL_ONLY'), name: z.literal('linkedin-mcp') }),
  error: z
    .strictObject({
      code: z.enum(['invalid_input', 'invalid_output', 'output_too_large']),
      message: z.literal(ERROR_MESSAGE),
      retryable: z.literal(false),
    })
    .optional(),
  metadata: z.strictObject({
    requestId: z.string().min(1).max(128),
    timestamp: z.string(),
  }),
});

function reply(deps: Dependencies, status: 'succeeded' | 'failed', value?: unknown, code?: ErrorCode) {
  let requestId = 'invalid-request-id';
  try {
    const supplied = deps.createRequestId();
    if (typeof supplied === 'string' && supplied.length <= 128 && /^[A-Za-z0-9_-]{1,128}$/u.test(supplied))
      requestId = supplied;
  } catch {
    // Host request IDs must never be echoed when invalid.
  }
  let timestamp = '1970-01-01T00:00:00.000Z';
  try {
    const supplied = deps.now();
    if (supplied instanceof Date && !types.isProxy(supplied)) {
      timestamp = Date.prototype.toISOString.call(supplied);
    }
  } catch {
    // Ignore hostile clock objects, getters, invalid Dates and thrown host errors.
  }

  const metadata = { requestId, timestamp };
  const provider = { type: 'LOCAL_ONLY' as const, name: 'linkedin-mcp' as const };
  const safeError = (kind: ErrorCode) => ({
    code: kind,
    message: ERROR_MESSAGE,
    retryable: false as const,
  });
  let body = {
    status,
    ...(value === undefined ? {} : { data: value }),
    provider,
    ...(code === undefined ? {} : { error: safeError(code) }),
    metadata,
  };
  let text = JSON.stringify(body);
  if (
    Buffer.byteLength(
      JSON.stringify({
        content: [{ type: 'text', text }],
        structuredContent: body,
      }),
      'utf8',
    ) +
      ENVELOPE_ALLOWANCE_BYTES >
    MAX_WIRE_BYTES
  ) {
    body = { status: 'failed', provider, error: safeError('output_too_large'), metadata };
    text = JSON.stringify(body);
  }
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: body,
    ...(body.status === 'succeeded' ? {} : { isError: true as const }),
  };
}

/** Strictly caller-supplied arithmetic; no provider, account, private store or publication. */
export function registerAnalyticsSeriesTools(server: McpServer, deps: Dependencies): void {
  server.registerTool(
    'linkedin.analytics.compare_snapshot_series',
    {
      description: 'Local-only arithmetic over 3–10 caller observations; not LinkedIn provider analytics.',
      inputSchema: input,
      outputSchema: output,
    },
    (values) => {
      try {
        const compared = compareLocalAnalyticsObservationSeries(values);
        if (!data.safeParse(compared).success) return reply(deps, 'failed', undefined, 'invalid_output');
        const response = reply(deps, 'succeeded', compared);
        if (!output.safeParse(response.structuredContent).success)
          return reply(deps, 'failed', undefined, 'invalid_output');
        return response;
      } catch (error) {
        return reply(
          deps,
          'failed',
          undefined,
          error instanceof LocalAnalyticsSeriesError && error.kind === 'output_too_large'
            ? 'output_too_large'
            : 'invalid_input',
        );
      }
    },
  );
}

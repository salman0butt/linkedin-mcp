import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import {
  compareLocalAnalyticsSnapshots,
  LocalAnalyticsSnapshotError,
} from './analytics/snapshot-comparison.js';

interface AnalyticsDeps {
  createRequestId: () => string;
  now: () => Date;
}

const counter = z.number().int().min(0).max(1_000_000_000).nullable();
const metricsInput = z.strictObject(
  {
    impressions: counter,
    reactions: counter,
    comments: counter,
    reposts: counter,
  },
  { error: () => 'Invalid local analytics metric fields.' },
);
const snapshotInput = z.strictObject(
  {
    capturedAtUtc: z.string().max(24),
    metrics: metricsInput,
  },
  { error: () => 'Invalid local analytics capture.' },
);
const input = z.strictObject(
  {
    contentId: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u),
    contentKind: z.enum(['post', 'article']),
    snapshots: z.tuple([snapshotInput, snapshotInput]),
  },
  { error: () => 'Invalid local analytics snapshot request.' },
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
const data = z.strictObject({
  kind: z.literal('local_content_metric_snapshot_comparison'),
  status: z.literal('comparison_only'),
  provenance: z.literal('caller_supplied_unverified'),
  verification: z.literal('not_performed'),
  providerData: z.literal('not_fetched'),
  accountAuthorization: z.literal('not_evaluated'),
  publication: z.literal('not_attempted'),
  contentId: input.shape.contentId,
  contentKind: input.shape.contentKind,
  capturesUtc: z.tuple([z.string().max(24), z.string().max(24)]),
  metrics: z.strictObject({
    impressions: metric,
    reactions: metric,
    comments: metric,
    reposts: metric,
  }),
  warnings: z
    .array(
      z.enum([
        'caller_metrics_unverified',
        'not_provider_analytics',
        'snapshots_are_observations_only',
        'decrease_may_reflect_counter_revisions',
        'missing_metrics_not_zero',
      ]),
    )
    .min(3)
    .max(5),
});
const result = z.strictObject({
  status: z.enum(['succeeded', 'failed']),
  data: data.optional(),
  provider: z.strictObject({ type: z.literal('LOCAL_ONLY'), name: z.literal('linkedin-mcp') }),
  error: z
    .strictObject({
      code: z.enum(['invalid_input', 'invalid_output', 'output_too_large']),
      message: z.literal('Local analytics could not be safely compared.'),
      retryable: z.literal(false),
    })
    .optional(),
  metadata: z.strictObject({
    requestId: z.string().min(1).max(128),
    timestamp: z.string(),
  }),
});

const MAX_WIRE_BYTES = 262_144;
const MAX_ENVELOPE_ALLOWANCE = 2_048;

function respond(
  deps: AnalyticsDeps,
  status: 'succeeded' | 'failed',
  value?: unknown,
  code?: 'invalid_input' | 'invalid_output' | 'output_too_large',
) {
  let requestId: string;
  try {
    const candidate = deps.createRequestId();
    requestId =
      typeof candidate === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(candidate)
        ? candidate
        : 'invalid-request-id';
  } catch {
    requestId = 'invalid-request-id';
  }
  let timestamp: string;
  try {
    timestamp = deps.now().toISOString();
  } catch {
    timestamp = '1970-01-01T00:00:00.000Z';
  }
  const metadata = { requestId, timestamp };
  const provider = { type: 'LOCAL_ONLY' as const, name: 'linkedin-mcp' as const };
  const safeError = (kind: 'invalid_input' | 'invalid_output' | 'output_too_large') => ({
    code: kind,
    message: 'Local analytics could not be safely compared.' as const,
    retryable: false as const,
  });
  let response = {
    status,
    ...(value === undefined ? {} : { data: value }),
    provider,
    ...(code === undefined ? {} : { error: safeError(code) }),
    metadata,
  };
  let json = JSON.stringify(response);
  if (
    Buffer.byteLength(
      JSON.stringify({ content: [{ type: 'text', text: json }], structuredContent: response }),
      'utf8',
    ) +
      MAX_ENVELOPE_ALLOWANCE >
    MAX_WIRE_BYTES
  ) {
    response = { status: 'failed', provider, error: safeError('output_too_large'), metadata };
    json = JSON.stringify(response);
  }
  return {
    content: [{ type: 'text' as const, text: json }],
    structuredContent: response,
    ...(response.status === 'succeeded' ? {} : { isError: true as const }),
  };
}

export function registerAnalyticsTools(server: McpServer, deps: AnalyticsDeps): void {
  server.registerTool(
    'linkedin.analytics.compare_snapshots',
    {
      description:
        'Read-only deterministic comparison of two unverified caller-supplied post/article counter snapshots. No LinkedIn analytics provider, account permission or publication.',
      inputSchema: input,
      outputSchema: result,
    },
    (values) => {
      try {
        const compared = compareLocalAnalyticsSnapshots(values);
        if (!data.safeParse(compared).success) return respond(deps, 'failed', undefined, 'invalid_output');
        const reply = respond(deps, 'succeeded', compared);
        if (!result.safeParse(reply.structuredContent).success)
          return respond(deps, 'failed', undefined, 'invalid_output');
        return reply;
      } catch (error) {
        return respond(
          deps,
          'failed',
          undefined,
          error instanceof LocalAnalyticsSnapshotError && error.kind === 'output_too_large'
            ? 'output_too_large'
            : 'invalid_input',
        );
      }
    },
  );
}

import type { McpServer } from '@modelcontextprotocol/server';
import { types } from 'node:util';
import * as z from 'zod/v4';

import {
  LocalAnalyticsRankingError,
  rankLocalAnalyticsSnapshotChanges,
} from './analytics/snapshot-delta-ranking.js';

interface Dependencies {
  createRequestId: () => string;
  now: () => Date;
}
const counter = z.number().int().min(0).max(1_000_000_000).nullable();
const metricFields = z.strictObject(
  {
    impressions: counter,
    reactions: counter,
    comments: counter,
    reposts: counter,
  },
  { error: () => 'Invalid local analytics metric fields.' },
);
const snapshot = z.strictObject(
  {
    capturedAtUtc: z.string().max(24),
    metrics: metricFields,
  },
  { error: () => 'Invalid local analytics capture.' },
);
const contentId = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u);
const contentKind = z.enum(['post', 'article']);
const name = z.enum(['impressions', 'reactions', 'comments', 'reposts']);
const entry = z.strictObject(
  {
    contentId,
    contentKind,
    snapshots: z.tuple([snapshot, snapshot]),
  },
  { error: () => 'Invalid local analytics content entry.' },
);
const input = z.strictObject(
  {
    targetMetric: name,
    entries: z.array(entry).min(2).max(10),
  },
  { error: () => 'Invalid local metric ranking request.' },
);

const ranked = z.strictObject({
  contentId,
  contentKind,
  previous: counter.unwrap(),
  current: counter.unwrap(),
  delta: z.number().int().min(-1_000_000_000).max(1_000_000_000),
});
const unavailable = z.strictObject({ contentId, contentKind, previous: counter, current: counter });
const data = z.strictObject({
  kind: z.literal('local_caller_metric_delta_ranking'),
  status: z.literal('ranking_only'),
  provenance: z.literal('caller_supplied_unverified'),
  verification: z.literal('not_performed'),
  providerData: z.literal('not_fetched'),
  accountAuthorization: z.literal('not_evaluated'),
  publication: z.literal('not_attempted'),
  targetMetric: name,
  capturesUtc: z.tuple([z.string().max(24), z.string().max(24)]),
  ranked: z.array(ranked).max(10),
  unavailable: z.array(unavailable).max(10),
  counts: z.strictObject({
    compared: z.number().int().min(2).max(10),
    ranked: z.number().int().min(0).max(10),
    unavailable: z.number().int().min(0).max(10),
  }),
  warnings: z
    .array(
      z.enum([
        'caller_metrics_unverified',
        'same_capture_minutes_not_provider_window',
        'no_performance_or_rates_inferred',
        'unavailable_excluded_from_ranking',
        'negative_delta_may_be_counter_correction',
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
      message: z.literal('Local metric ranking could not be safely calculated.'),
      retryable: z.literal(false),
    })
    .optional(),
  metadata: z.strictObject({ requestId: z.string().min(1).max(128), timestamp: z.string() }),
});

type ErrorCode = 'invalid_input' | 'invalid_output' | 'output_too_large';
function reply(deps: Dependencies, status: 'succeeded' | 'failed', value?: unknown, code?: ErrorCode) {
  let requestId = 'invalid-request-id';
  let timestamp = '1970-01-01T00:00:00.000Z';
  try {
    const supplied = deps.createRequestId();
    if (typeof supplied === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(supplied)) requestId = supplied;
  } catch {
    /* fail safely */
  }
  try {
    const supplied = deps.now();
    if (supplied instanceof Date && !types.isProxy(supplied)) {
      timestamp = Date.prototype.toISOString.call(supplied);
    }
  } catch {
    /* fail safely */
  }
  const metadata = { requestId, timestamp };
  const provider = { type: 'LOCAL_ONLY' as const, name: 'linkedin-mcp' as const };
  const safeError = (kind: ErrorCode) => ({
    code: kind,
    message: 'Local metric ranking could not be safely calculated.' as const,
    retryable: false as const,
  });
  let body = {
    status,
    ...(value === undefined ? {} : { data: value }),
    provider,
    ...(code === undefined ? {} : { error: safeError(code) }),
    metadata,
  };
  let json = JSON.stringify(body);
  if (
    Buffer.byteLength(
      JSON.stringify({
        content: [{ type: 'text', text: json }],
        structuredContent: body,
      }),
      'utf8',
    ) +
      2048 >
    262_144
  ) {
    body = { status: 'failed', provider, error: safeError('output_too_large'), metadata };
    json = JSON.stringify(body);
  }
  return {
    content: [{ type: 'text' as const, text: json }],
    structuredContent: body,
    ...(body.status === 'succeeded' ? {} : { isError: true as const }),
  };
}

/** Caller-only stateless arithmetic; no LinkedIn analytics provider, account or persistence dependencies. */
export function registerAnalyticsRankingTools(server: McpServer, deps: Dependencies): void {
  server.registerTool(
    'linkedin.analytics.rank_snapshot_changes',
    {
      description:
        'Order differences of 2–10 caller-supplied unverified content metric snapshots; nulls excluded, no LinkedIn API, relative performance claim or publication.',
      inputSchema: input,
      outputSchema: output,
    },
    (values) => {
      try {
        const calculated = rankLocalAnalyticsSnapshotChanges(values);
        if (!data.safeParse(calculated).success) return reply(deps, 'failed', undefined, 'invalid_output');
        const result = reply(deps, 'succeeded', calculated);
        if (!output.safeParse(result.structuredContent).success)
          return reply(deps, 'failed', undefined, 'invalid_output');
        return result;
      } catch (error) {
        return reply(
          deps,
          'failed',
          undefined,
          error instanceof LocalAnalyticsRankingError && error.kind === 'output_too_large'
            ? 'output_too_large'
            : 'invalid_input',
        );
      }
    },
  );
}

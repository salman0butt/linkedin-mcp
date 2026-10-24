import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { createJobSearchQuery } from '../../../packages/core/dist/index.js';
import { createJobSearchService, type JobSearchService } from './jobs/job-search-service.js';

interface JobToolDeps {
  jobs?: JobSearchService;
  createRequestId: () => string;
  now: () => Date;
}

const providerType = z.enum(['PARTNER_API', 'EXTERNAL_DISCOVERY']);
const providerState = z.enum(['success', 'unavailable', 'permission_required', 'rate_limited', 'failed']);
const domainStatus = z.enum([
  'available',
  'partial',
  'unavailable',
  'permission_required',
  'rate_limited',
  'failed',
]);
const workplace = z.enum(['remote', 'hybrid', 'on_site']);
const employmentType = z.enum(['full_time', 'part_time', 'contract', 'temporary', 'internship']);
const sort = z.enum(['recent', 'relevance']);

const searchInput = z
  .object({
    keywords: z.string().min(1).max(120),
    location: z.string().min(1).max(120).optional(),
    workplace: workplace.optional(),
    employmentType: employmentType.optional(),
    postedSince: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
    sort: sort.optional(),
  })
  .strict();

const detailInput = z
  .object({
    sourceId: z.string().min(1).max(100),
    jobId: z.string().min(1).max(256),
  })
  .strict();

const postingDate = z.discriminatedUnion('state', [
  z.object({ state: z.literal('unknown') }).strict(),
  z
    .object({
      state: z.literal('reported'),
      postedAt: z.string(),
      sourceClaim: z.literal('provider_reported'),
    })
    .strict(),
  z
    .object({
      state: z.literal('verified'),
      postedAt: z.string(),
      checkedAt: z.string(),
      verifiedBy: z.string(),
      method: z.enum(['direct_employer_listing', 'official_posting_api', 'trusted_independent_audit']),
      evidenceUrl: z.string(),
    })
    .strict(),
]);

const job = z
  .object({
    id: z.string(),
    title: z.string(),
    companyName: z.string(),
    source: z
      .object({
        provider: providerType,
        id: z.string(),
        name: z.string(),
        retrievedAt: z.string(),
        evidenceUrl: z.string().optional(),
      })
      .strict(),
    postingDate,
    description: z.string().optional(),
    location: z.string().optional(),
    workplace: workplace.optional(),
    employmentType: employmentType.optional(),
    canonicalUrl: z.string().optional(),
    salary: z
      .object({
        min: z.number(),
        max: z.number(),
        currency: z.string(),
        period: z.enum(['hour', 'month', 'year']),
      })
      .strict()
      .optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export { job as normalizedJobSchema };

const coverage = z
  .object({
    complete: z.boolean(),
    hasMore: z.boolean(),
    honoredFilters: z.array(z.enum(['keywords', 'location', 'workplace', 'employmentType', 'postedSince'])),
    honoredSort: sort.nullable(),
    verifiedDateCoverage: z.boolean(),
  })
  .strict();
const outcome = z
  .object({
    providerId: z.string(),
    providerType,
    state: providerState,
    consulted: z.boolean(),
    coverage: coverage.optional(),
  })
  .strict();

const searchData = z
  .object({
    status: domainStatus,
    query: z
      .object({
        keywords: z.string(),
        location: z.string().optional(),
        workplace: workplace.optional(),
        employmentType: employmentType.optional(),
        postedSince: z.string().optional(),
        limit: z.number(),
        sort,
      })
      .strict(),
    providerOutcomes: z.array(outcome),
    jobs: z.array(job).optional(),
    freshnessCoverage: z
      .object({
        state: z.enum(['verified', 'incomplete']),
        unknownDateCount: z.number().int(),
        reportedDateCount: z.number().int(),
        omittedUncertainCount: z.number().int(),
        truncated: z.boolean(),
        providerCoverage: z.array(outcome),
      })
      .strict()
      .optional(),
  })
  .strict();

const detailData = z
  .object({
    status: z.enum(['available', 'unavailable', 'permission_required', 'rate_limited', 'failed']),
    job: job.optional(),
    sourceId: z.string().optional(),
  })
  .strict();

const envelope = z
  .object({
    status: z.enum(['succeeded', 'partial', 'unsupported', 'permission_required', 'rate_limited', 'failed']),
    data: z.unknown().optional(),
    provider: z.object({ type: z.literal('LOCAL_ONLY'), name: z.literal('linkedin-mcp') }).strict(),
    error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).strict().optional(),
    metadata: z.object({ requestId: z.string(), timestamp: z.string() }).strict(),
  })
  .strict();

const searchOutput = envelope.safeExtend({ data: searchData.optional() });
const detailOutput = envelope.safeExtend({ data: detailData.optional() });
type OuterStatus = z.infer<typeof envelope>['status'];

function mapStatus(status: z.infer<typeof domainStatus>): OuterStatus {
  if (status === 'available') return 'succeeded';
  if (status === 'unavailable') return 'unsupported';
  return status;
}

function reply(deps: JobToolDeps, status: OuterStatus, data?: unknown, code?: string) {
  const value = {
    status,
    ...(data === undefined ? {} : { data }),
    provider: { type: 'LOCAL_ONLY' as const, name: 'linkedin-mcp' as const },
    ...(code === undefined
      ? {}
      : {
          error: {
            code,
            message: 'Job discovery is unavailable, incomplete, or requires an authorized provider.',
            retryable: status === 'rate_limited',
          },
        }),
    metadata: { requestId: deps.createRequestId(), timestamp: deps.now().toISOString() },
  };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value,
    ...(status === 'succeeded' ? {} : { isError: true as const }),
  };
}

/** Provider selection and credentials belong exclusively to trusted runtime configuration. */
export function registerJobSearchTools(server: McpServer, deps: JobToolDeps): void {
  const service = deps.jobs ?? createJobSearchService({ providers: [] });
  server.registerTool(
    'linkedin.jobs.search',
    {
      description:
        'Discover source-attributed jobs using authorized configured providers only. Posting-date evidence and incomplete coverage are explicit. No default LinkedIn Talent API access.',
      inputSchema: searchInput,
      outputSchema: searchOutput,
    },
    async (input) => {
      let query: ReturnType<typeof createJobSearchQuery>;
      try {
        query = createJobSearchQuery(input);
      } catch {
        return reply(deps, 'failed', undefined, 'invalid_input');
      }
      try {
        const result = await service.search(query);
        const status = mapStatus(result.status);
        return reply(deps, status, result, status === 'succeeded' ? undefined : result.status);
      } catch {
        return reply(deps, 'failed', undefined, 'search_failed');
      }
    },
  );

  server.registerTool(
    'linkedin.jobs.get',
    {
      description:
        'Read job details by configured provider sourceId and source-scoped jobId. No caller URL or provider override is accepted.',
      inputSchema: detailInput,
      outputSchema: detailOutput,
    },
    async (input) => {
      try {
        const result = await service.getDetails(input);
        const status = mapStatus(result.status);
        return reply(deps, status, result, status === 'succeeded' ? undefined : result.status);
      } catch {
        return reply(deps, 'failed', undefined, 'invalid_job_ref');
      }
    },
  );
}

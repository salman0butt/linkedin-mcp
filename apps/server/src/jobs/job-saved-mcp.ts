import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { createJobSearchQuery, type JobSearchQuery } from '../../../../packages/core/dist/index.js';
import { normalizedJobSchema } from '../jobs-mcp.js';

/** Explicit local-only persistence operations. No LinkedIn network mutation. */
export interface LocalSavedJobsStore {
  listJobs(): Promise<unknown>;
  getJob(ref: { sourceId: string; jobId: string }): Promise<unknown>;
  saveJob(job: unknown): Promise<unknown>;
  removeJob(ref: { sourceId: string; jobId: string }): Promise<unknown>;
  listSearches(): Promise<unknown>;
  getSearch(id: string): Promise<unknown>;
  saveSearch(query: JobSearchQuery): Promise<unknown>;
  removeSearch(id: string): Promise<unknown>;
}

interface SavedToolsDeps {
  transport?: 'stdio' | 'http';
  jobStore?: LocalSavedJobsStore;
  createRequestId: () => string;
  now: () => Date;
}

const refInput = z
  .object({
    sourceId: z.string().min(1).max(100),
    jobId: z.string().min(1).max(256),
  })
  .strict();
const searchIdInput = z.object({ id: z.string().min(1).max(128) }).strict();
const emptyInput = z.object({}).strict();
const jobSaveInput = z.object({ job: normalizedJobSchema }).strict();
const searchSaveInput = z
  .object({
    query: z
      .object({
        keywords: z.string().min(1).max(120),
        location: z.string().min(1).max(120).optional(),
        workplace: z.enum(['remote', 'hybrid', 'on_site']).optional(),
        employmentType: z.enum(['full_time', 'part_time', 'contract', 'temporary', 'internship']).optional(),
        postedSince: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
        sort: z.enum(['recent', 'relevance']).optional(),
      })
      .strict(),
  })
  .strict();

const output = z
  .object({
    status: z.enum(['succeeded', 'unsupported', 'failed']),
    data: z.unknown().optional(),
    provider: z.object({ type: z.literal('LOCAL_ONLY'), name: z.literal('linkedin-mcp') }).strict(),
    error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).strict().optional(),
    metadata: z.object({ requestId: z.string(), timestamp: z.string() }).strict(),
  })
  .strict();

function reply(deps: SavedToolsDeps, status: 'succeeded' | 'unsupported' | 'failed', data?: unknown) {
  const value = {
    status,
    ...(data === undefined ? {} : { data }),
    provider: { type: 'LOCAL_ONLY' as const, name: 'linkedin-mcp' as const },
    ...(status === 'succeeded'
      ? {}
      : {
          error: {
            code: status === 'unsupported' ? 'local_store_not_available' : 'local_store_failed',
            message: 'Saved jobs and searches require a configured private local STDIO store.',
            retryable: false,
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

export function registerSavedJobTools(server: McpServer, deps: SavedToolsDeps): void {
  async function run(fn: (store: LocalSavedJobsStore) => Promise<unknown>) {
    // HTTP has no authenticated request owner. Do not touch an injected store.
    if (deps.transport !== 'stdio' || deps.jobStore === undefined) return reply(deps, 'unsupported');
    try {
      return reply(deps, 'succeeded', await fn(deps.jobStore));
    } catch {
      return reply(deps, 'failed');
    }
  }

  server.registerTool(
    'linkedin.jobs.saved.list',
    {
      description: 'List private OS-user saved job snapshots (not LinkedIn bookmarks).',
      inputSchema: emptyInput,
      outputSchema: output,
    },
    async () => run((store) => store.listJobs()),
  );

  server.registerTool(
    'linkedin.jobs.saved.get',
    {
      description: 'Read one private local job by sourceId and jobId.',
      inputSchema: refInput,
      outputSchema: output,
    },
    async (input) => run((store) => store.getJob(input)),
  );

  server.registerTool(
    'linkedin.jobs.saved.save',
    {
      description: 'Save a job snapshot only in the local STDIO workspace; never submit an application.',
      inputSchema: jobSaveInput,
      outputSchema: output,
    },
    async (input) => run((store) => store.saveJob(input.job)),
  );

  server.registerTool(
    'linkedin.jobs.saved.remove',
    {
      description: 'Remove only one local saved job snapshot.',
      inputSchema: refInput,
      outputSchema: output,
    },
    async (input) => run((store) => store.removeJob(input)),
  );

  server.registerTool(
    'linkedin.jobs.saved_searches.list',
    {
      description: 'List private local saved job searches.',
      inputSchema: emptyInput,
      outputSchema: output,
    },
    async () => run((store) => store.listSearches()),
  );

  server.registerTool(
    'linkedin.jobs.saved_searches.get',
    {
      description: 'Read one local saved job-search query by ID.',
      inputSchema: searchIdInput,
      outputSchema: output,
    },
    async (input) => run((store) => store.getSearch(input.id)),
  );

  server.registerTool(
    'linkedin.jobs.saved_searches.save',
    {
      description: 'Save validated search criteria locally without querying or mutating LinkedIn.',
      inputSchema: searchSaveInput,
      outputSchema: output,
    },
    async (input) => {
      if (deps.transport !== 'stdio' || deps.jobStore === undefined) return reply(deps, 'unsupported');
      let query: JobSearchQuery;
      try {
        query = createJobSearchQuery(input.query);
      } catch {
        return reply(deps, 'failed');
      }
      return run((store) => store.saveSearch(query));
    },
  );

  server.registerTool(
    'linkedin.jobs.saved_searches.remove',
    {
      description: 'Remove one locally saved search; no remote LinkedIn action.',
      inputSchema: searchIdInput,
      outputSchema: output,
    },
    async (input) => run((store) => store.removeSearch(input.id)),
  );
}

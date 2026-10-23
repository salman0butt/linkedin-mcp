import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { createPostSearchQuery, type PostSearchResult } from '../../../packages/core/dist/index.js';
import { createPostSearchService, type PostSearchService } from './discovery/post-search-service.js';

interface DiscoveryToolDeps {
  discovery?: PostSearchService;
  createRequestId: () => string;
  now: () => Date;
}

const shared = {
  limit: z.number().int().min(1).max(50).optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  minimumEngagement: z.number().int().nonnegative().safe().optional(),
};

const searchInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('topic'), term: z.string().min(1).max(101), ...shared }).strict(),
  z.object({ kind: z.literal('hashtag'), term: z.string().min(1).max(101), ...shared }).strict(),
  z.object({ kind: z.literal('author'), authorUrn: z.string().min(1).max(160), ...shared }).strict(),
  z.object({ kind: z.literal('company'), organizationUrn: z.string().min(1).max(160), ...shared }).strict(),
  z.object({ kind: z.literal('recent'), ...shared }).strict(),
]);

const providerTypeSchema = z.enum(['OFFICIAL_API', 'PARTNER_API', 'EXTERNAL_DISCOVERY']);
const providerOutcomeSchema = z
  .object({
    providerId: z.string(),
    providerType: providerTypeSchema,
    state: z.enum(['success', 'unavailable', 'permission_required', 'rate_limited', 'failed']),
    consulted: z.boolean(),
  })
  .strict();

const postSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    source: z
      .object({
        provider: providerTypeSchema,
        id: z.string(),
        name: z.string(),
        retrievedAt: z.string(),
        evidenceUrl: z.string().optional(),
      })
      .strict(),
    postUrn: z.string().optional(),
    canonicalUrl: z.string().optional(),
    authorUrn: z.string().optional(),
    publishedAt: z.string().optional(),
    likes: z.number().nonnegative().int().optional(),
    comments: z.number().nonnegative().int().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

const searchDataSchema = z
  .object({
    status: z.enum(['available', 'partial', 'unavailable', 'permission_required', 'rate_limited', 'failed']),
    query: z.unknown(),
    posts: z.array(postSchema).optional(),
    providerOutcomes: z.array(providerOutcomeSchema),
  })
  .strict();

const searchOutputSchema = z
  .object({
    status: z.enum(['succeeded', 'partial', 'unsupported', 'permission_required', 'rate_limited', 'failed']),
    data: searchDataSchema.optional(),
    provider: z.object({ type: z.literal('LOCAL_ONLY'), name: z.literal('linkedin-mcp') }).strict(),
    error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).strict().optional(),
    metadata: z.object({ requestId: z.string(), timestamp: z.string() }).strict(),
  })
  .strict();

type OuterStatus = z.infer<typeof searchOutputSchema>['status'];

function mapStatus(status: PostSearchResult['status']): OuterStatus {
  switch (status) {
    case 'available':
      return 'succeeded';
    case 'unavailable':
      return 'unsupported';
    default:
      return status;
  }
}

function response(
  deps: DiscoveryToolDeps,
  status: OuterStatus,
  data?: PostSearchResult,
  error?: { code: string; message: string; retryable: boolean },
) {
  const value = {
    status,
    ...(data === undefined ? {} : { data }),
    provider: { type: 'LOCAL_ONLY' as const, name: 'linkedin-mcp' as const },
    ...(error === undefined ? {} : { error }),
    metadata: { requestId: deps.createRequestId(), timestamp: deps.now().toISOString() },
  };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value,
    ...(status === 'succeeded' ? {} : { isError: true as const }),
  };
}

/** Read-only aggregate search surface. Provider adapters and credentials are trusted host dependencies. */
export function registerPostSearchTools(server: McpServer, deps: DiscoveryToolDeps): void {
  const service = deps.discovery ?? createPostSearchService({ providers: [] });
  server.registerTool(
    'linkedin.posts.search',
    {
      description:
        'Discover bounded public posts from explicitly configured sources. Global LinkedIn search is not an ordinary official API capability; unconfigured sources return unavailable, and partial outcomes are reported.',
      inputSchema: searchInputSchema,
      outputSchema: searchOutputSchema,
    },
    async (input) => {
      let query: ReturnType<typeof createPostSearchQuery>;
      try {
        query = createPostSearchQuery(input);
      } catch {
        return response(deps, 'failed', undefined, {
          code: 'invalid_input',
          message: 'The supplied post search criteria are invalid.',
          retryable: false,
        });
      }
      try {
        const result = await service.search(query);
        const status = mapStatus(result.status);
        return response(
          deps,
          status,
          result,
          status === 'succeeded'
            ? undefined
            : {
                code: result.status,
                message: 'Post discovery is incomplete or requires a configured, authorized source.',
                retryable: result.status === 'rate_limited',
              },
        );
      } catch {
        return response(deps, 'failed', undefined, {
          code: 'search_failed',
          message: 'Post discovery could not complete.',
          retryable: false,
        });
      }
    },
  );
}

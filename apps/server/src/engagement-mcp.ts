import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { EngagementReadAvailability } from '../../../packages/core/dist/index.js';
import type { EngagementReadService } from './engagement/engagement-read-service.js';
import { EngagementServiceError, type EngagementService } from './engagement/engagement-service.js';

export interface EngagementTools {
  reads: EngagementReadService;
  writes?: EngagementService;
}

interface RegisterEngagementToolsDeps {
  engagement?: EngagementTools;
  createRequestId: () => string;
  now: () => Date;
}

const payloadHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const targetUrnSchema = z
  .string()
  .regex(/^urn:li:(?:(?:share|ugcPost|activity):\d+|comment:\(urn:li:(?:share|ugcPost|activity):\d+,\d+\))$/);
const threadUrnSchema = z.string().regex(/^urn:li:(?:share|ugcPost|activity):\d+$/);
const commentUrnSchema = z.string().regex(/^urn:li:comment:\(urn:li:(?:share|ugcPost|activity):\d+,\d+\)$/);
const commentIdSchema = z.string().regex(/^\d+$/);
const nonEmptyStringSchema = z.string().refine((value) => value.trim().length > 0);
const reactionTypeSchema = z.enum(['LIKE', 'PRAISE', 'EMPATHY', 'INTEREST', 'APPRECIATION', 'ENTERTAINMENT']);

const getCommentInputSchema = z.object({ targetUrn: targetUrnSchema, commentId: commentIdSchema }).strict();
const listCommentsInputSchema = z
  .object({
    targetUrn: targetUrnSchema,
    start: z.number().int().nonnegative().optional(),
    count: z.number().int().min(1).max(100).optional(),
  })
  .strict();
const inboxInputSchema = z
  .object({
    threadUrns: z
      .array(threadUrnSchema)
      .min(1)
      .max(20)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();
const replyDraftSchema = z
  .object({
    targetUrn: commentUrnSchema,
    rootUrn: targetUrnSchema,
    parentCommentUrn: commentUrnSchema,
    text: nonEmptyStringSchema,
  })
  .strict();
const approveInputSchema = z.object({ payloadHash: payloadHashSchema, approved: z.literal(true) }).strict();
const createReplyInputSchema = z
  .object({
    draft: replyDraftSchema,
    payloadHash: payloadHashSchema,
    approvalReceiptId: nonEmptyStringSchema,
    idempotencyKey: nonEmptyStringSchema,
  })
  .strict();
const reactionAddDraftSchema = z
  .object({ targetUrn: targetUrnSchema, reactionType: reactionTypeSchema })
  .strict();
const reactionRemoveDraftSchema = z.object({ targetUrn: targetUrnSchema }).strict();
const reactionAddInputSchema = z
  .object({
    draft: reactionAddDraftSchema,
    payloadHash: payloadHashSchema,
    approvalReceiptId: nonEmptyStringSchema,
    idempotencyKey: nonEmptyStringSchema,
  })
  .strict();
const reactionRemoveInputSchema = z
  .object({
    draft: reactionRemoveDraftSchema,
    payloadHash: payloadHashSchema,
    approvalReceiptId: nonEmptyStringSchema,
    idempotencyKey: nonEmptyStringSchema,
  })
  .strict();

const providerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('LOCAL_ONLY'), name: z.literal('linkedin-mcp') }).strict(),
  z.object({ type: z.literal('OFFICIAL_API'), name: z.literal('LinkedIn') }).strict(),
]);
const outputSchema = z
  .object({
    status: z.enum([
      'succeeded',
      'requires_approval',
      'human_action_required',
      'unsupported',
      'permission_required',
      'partner_access_required',
      'restricted',
      'rate_limited',
      'duplicate',
      'partial',
      'failed',
    ]),
    data: z.unknown().optional(),
    provider: providerSchema,
    warnings: z.array(z.string()).optional(),
    error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).strict().optional(),
    metadata: z.object({ requestId: z.string(), timestamp: z.string() }).strict(),
  })
  .strict();

type OuterProvider = 'LOCAL_ONLY' | 'OFFICIAL_API';
type ToolStatus = z.infer<typeof outputSchema>['status'];

function result(
  deps: RegisterEngagementToolsDeps,
  status: ToolStatus,
  provider: OuterProvider,
  options: {
    data?: unknown;
    error?: { code: string; message: string; retryable: boolean };
  } = {},
) {
  const value = {
    status,
    ...(options.data === undefined ? {} : { data: options.data }),
    provider:
      provider === 'LOCAL_ONLY'
        ? ({ type: 'LOCAL_ONLY', name: 'linkedin-mcp' } as const)
        : ({ type: 'OFFICIAL_API', name: 'LinkedIn' } as const),
    ...(options.error === undefined ? {} : { error: options.error }),
    metadata: {
      requestId: deps.createRequestId(),
      timestamp: deps.now().toISOString(),
    },
  };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function unavailable(deps: RegisterEngagementToolsDeps, provider: OuterProvider) {
  return result(deps, 'permission_required', provider, {
    error: {
      code: 'engagement_not_configured',
      message: 'LinkedIn engagement is not configured.',
      retryable: false,
    },
  });
}

function mapFailure(error: unknown, deps: RegisterEngagementToolsDeps, provider: OuterProvider) {
  let status: ToolStatus = 'failed';
  let code = 'operation_failed';
  let message = 'LinkedIn engagement operation did not complete.';
  let data: unknown;

  if (error instanceof EngagementServiceError) {
    code = error.kind;
    switch (error.kind) {
      case 'auth_unconfigured':
      case 'not_connected':
      case 'reauth_required':
      case 'permission_required':
        status = 'permission_required';
        message = 'LinkedIn member authorization is required.';
        break;
      case 'approval_mismatch':
      case 'approval_expired':
      case 'approval_not_found':
      case 'approval_consumed':
        status = 'requires_approval';
        message = 'A valid approval receipt is required.';
        break;
      case 'idempotency_conflict':
        status = 'duplicate';
        message = 'The idempotency key conflicts with a different operation.';
        break;
      case 'rate_limited':
        status = 'rate_limited';
        message = 'LinkedIn rate limits prevented this operation.';
        break;
      case 'outcome_unknown':
        status = 'partial';
        data = { state: 'outcome_unknown' };
        message = 'The remote outcome is unknown; do not retry with a new idempotency key.';
        break;
      case 'invalid_payload':
        status = 'failed';
        message = 'The engagement payload is invalid.';
        break;
      case 'storage_failure':
        status = 'failed';
        message = 'Local engagement state could not be persisted.';
        break;
    }
  }

  return result(deps, status, provider, {
    ...(data === undefined ? {} : { data }),
    error: { code, message, retryable: false },
  });
}

function readResult<T>(value: EngagementReadAvailability<T>, deps: RegisterEngagementToolsDeps) {
  return result(deps, value.status === 'available' ? 'succeeded' : 'permission_required', 'OFFICIAL_API', {
    data: value,
  });
}

export function registerEngagementTools(server: McpServer, deps: RegisterEngagementToolsDeps): void {
  server.registerTool(
    'linkedin.comments.get',
    {
      description: 'Read one explicit LinkedIn comment when restricted member-read access is enabled.',
      inputSchema: getCommentInputSchema,
      outputSchema,
    },
    async (input) => {
      if (deps.engagement === undefined) return unavailable(deps, 'OFFICIAL_API');
      try {
        return readResult(await deps.engagement.reads.getComment(input), deps);
      } catch (error: unknown) {
        return mapFailure(error, deps, 'OFFICIAL_API');
      }
    },
  );

  server.registerTool(
    'linkedin.comments.list',
    {
      description: 'List bounded comments or replies for one explicit LinkedIn target.',
      inputSchema: listCommentsInputSchema,
      outputSchema,
    },
    async (input) => {
      if (deps.engagement === undefined) return unavailable(deps, 'OFFICIAL_API');
      try {
        const request = {
          targetUrn: input.targetUrn,
          ...(input.start === undefined ? {} : { start: input.start }),
          ...(input.count === undefined ? {} : { count: input.count }),
        };
        return readResult(await deps.engagement.reads.listComments(request), deps);
      } catch (error: unknown) {
        return mapFailure(error, deps, 'OFFICIAL_API');
      }
    },
  );

  server.registerTool(
    'linkedin.comments.inbox',
    {
      description: 'Derive unanswered comments from 1–20 explicit thread roots without feed discovery.',
      inputSchema: inboxInputSchema,
      outputSchema,
    },
    async (input) => {
      if (deps.engagement === undefined) return unavailable(deps, 'OFFICIAL_API');
      try {
        return readResult(await deps.engagement.reads.inbox(input), deps);
      } catch (error: unknown) {
        return mapFailure(error, deps, 'OFFICIAL_API');
      }
    },
  );

  server.registerTool(
    'linkedin.comments.reply.preview',
    {
      description: 'Build a local canonical nested-reply preview without contacting LinkedIn.',
      inputSchema: replyDraftSchema,
      outputSchema,
    },
    (input) => {
      const writes = deps.engagement?.writes;
      if (writes === undefined) return unavailable(deps, 'LOCAL_ONLY');
      try {
        return result(deps, 'succeeded', 'LOCAL_ONLY', {
          data: writes.previewReply(input),
        });
      } catch (error: unknown) {
        return mapFailure(error, deps, 'LOCAL_ONLY');
      }
    },
  );

  server.registerTool(
    'linkedin.comments.reply.approve',
    {
      description: 'Issue a short-lived subject-bound approval receipt for a reply preview.',
      inputSchema: approveInputSchema,
      outputSchema,
    },
    async (input) => {
      const writes = deps.engagement?.writes;
      if (writes === undefined) return unavailable(deps, 'LOCAL_ONLY');
      try {
        return result(deps, 'succeeded', 'LOCAL_ONLY', {
          data: await writes.approveReply({ payloadHash: input.payloadHash }),
        });
      } catch (error: unknown) {
        return mapFailure(error, deps, 'LOCAL_ONLY');
      }
    },
  );

  server.registerTool(
    'linkedin.comments.reply.create',
    {
      description: 'Create one approved nested reply with durable idempotency protection.',
      inputSchema: createReplyInputSchema,
      outputSchema,
    },
    async (input) => {
      const writes = deps.engagement?.writes;
      if (writes === undefined) return unavailable(deps, 'OFFICIAL_API');
      try {
        return result(deps, 'succeeded', 'OFFICIAL_API', {
          data: await writes.createReply(input),
        });
      } catch (error: unknown) {
        return mapFailure(error, deps, 'OFFICIAL_API');
      }
    },
  );

  server.registerTool(
    'linkedin.reactions.add.preview',
    {
      description: 'Build a local canonical member-reaction preview without contacting LinkedIn.',
      inputSchema: reactionAddDraftSchema,
      outputSchema,
    },
    (input) => {
      const writes = deps.engagement?.writes;
      if (writes === undefined) return unavailable(deps, 'LOCAL_ONLY');
      try {
        return result(deps, 'succeeded', 'LOCAL_ONLY', {
          data: writes.previewReactionAdd(input),
        });
      } catch (error: unknown) {
        return mapFailure(error, deps, 'LOCAL_ONLY');
      }
    },
  );

  server.registerTool(
    'linkedin.reactions.add.approve',
    {
      description: 'Issue a short-lived subject-bound approval receipt for a reaction-add preview.',
      inputSchema: approveInputSchema,
      outputSchema,
    },
    async (input) => {
      const writes = deps.engagement?.writes;
      if (writes === undefined) return unavailable(deps, 'LOCAL_ONLY');
      try {
        return result(deps, 'succeeded', 'LOCAL_ONLY', {
          data: await writes.approveReactionAdd({ payloadHash: input.payloadHash }),
        });
      } catch (error: unknown) {
        return mapFailure(error, deps, 'LOCAL_ONLY');
      }
    },
  );

  server.registerTool(
    'linkedin.reactions.add',
    {
      description: 'Add one approved member reaction with durable idempotency protection.',
      inputSchema: reactionAddInputSchema,
      outputSchema,
    },
    async (input) => {
      const writes = deps.engagement?.writes;
      if (writes === undefined) return unavailable(deps, 'OFFICIAL_API');
      try {
        return result(deps, 'succeeded', 'OFFICIAL_API', {
          data: await writes.addReaction(input),
        });
      } catch (error: unknown) {
        return mapFailure(error, deps, 'OFFICIAL_API');
      }
    },
  );

  server.registerTool(
    'linkedin.reactions.remove.preview',
    {
      description: 'Build a local canonical reaction-removal preview without contacting LinkedIn.',
      inputSchema: reactionRemoveDraftSchema,
      outputSchema,
    },
    (input) => {
      const writes = deps.engagement?.writes;
      if (writes === undefined) return unavailable(deps, 'LOCAL_ONLY');
      try {
        return result(deps, 'succeeded', 'LOCAL_ONLY', {
          data: writes.previewReactionRemove(input),
        });
      } catch (error: unknown) {
        return mapFailure(error, deps, 'LOCAL_ONLY');
      }
    },
  );

  server.registerTool(
    'linkedin.reactions.remove.approve',
    {
      description: 'Issue a short-lived subject-bound approval receipt for a reaction-removal preview.',
      inputSchema: approveInputSchema,
      outputSchema,
    },
    async (input) => {
      const writes = deps.engagement?.writes;
      if (writes === undefined) return unavailable(deps, 'LOCAL_ONLY');
      try {
        return result(deps, 'succeeded', 'LOCAL_ONLY', {
          data: await writes.approveReactionRemove({ payloadHash: input.payloadHash }),
        });
      } catch (error: unknown) {
        return mapFailure(error, deps, 'LOCAL_ONLY');
      }
    },
  );

  server.registerTool(
    'linkedin.reactions.remove',
    {
      description: 'Remove one approved member reaction with durable idempotency protection.',
      inputSchema: reactionRemoveInputSchema,
      outputSchema,
    },
    async (input) => {
      const writes = deps.engagement?.writes;
      if (writes === undefined) return unavailable(deps, 'OFFICIAL_API');
      try {
        return result(deps, 'succeeded', 'OFFICIAL_API', {
          data: await writes.removeReaction(input),
        });
      } catch (error: unknown) {
        return mapFailure(error, deps, 'OFFICIAL_API');
      }
    },
  );
}

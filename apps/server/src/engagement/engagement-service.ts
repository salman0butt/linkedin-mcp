import { createHash } from 'node:crypto';

import {
  createReplyPreview,
  type CanonicalComment,
  type ReplyDraft,
  type ReplyPreview,
} from '../../../../packages/core/dist/index.js';
import { AuthServiceError, type AuthService } from '../auth/auth-service.js';
import {
  ApprovalServiceError,
  type ApprovalReceipt,
  type ApprovalService,
} from '../publishing/approval-service.js';
import {
  IdempotencyLedgerError,
  type IdempotencyLedger,
  type MutationRecord,
} from '../publishing/idempotency-ledger.js';
import {
  LinkedInCommentsError,
  type CreateReplyInput as LinkedInCreateReplyInput,
  type LinkedInCommentsClient,
} from './linkedin-comments.js';

export type EngagementServiceErrorKind =
  | 'invalid_payload'
  | 'auth_unconfigured'
  | 'not_connected'
  | 'reauth_required'
  | 'permission_required'
  | 'approval_mismatch'
  | 'approval_expired'
  | 'approval_not_found'
  | 'approval_consumed'
  | 'idempotency_conflict'
  | 'storage_failure'
  | 'rate_limited'
  | 'outcome_unknown';

export class EngagementServiceError extends Error {
  readonly kind: EngagementServiceErrorKind;
  readonly retryable = false;

  constructor(kind: EngagementServiceErrorKind) {
    super(`Engagement operation failed: ${kind}`);
    this.name = 'EngagementServiceError';
    this.kind = kind;
  }
}

export interface ApproveReplyInput {
  payloadHash: string;
}

export interface CreateReplyInput {
  draft: ReplyDraft;
  payloadHash: string;
  approvalReceiptId: string;
  idempotencyKey: string;
}

export interface ReplyPublishResult {
  state: 'succeeded';
  provider: 'OFFICIAL_API';
  commentId: string;
  commentUrn: string;
  replay: boolean;
}

export interface EngagementService {
  previewReply(draft: ReplyDraft): ReplyPreview;
  approveReply(input: ApproveReplyInput): Promise<ApprovalReceipt>;
  createReply(input: CreateReplyInput): Promise<ReplyPublishResult>;
}

type AuthProvider = Pick<AuthService, 'getProviderContext' | 'markReauthRequired'>;
type CommentsWriter = Pick<LinkedInCommentsClient, 'createReply'>;

interface EngagementServiceDeps {
  auth: AuthProvider;
  approvals: ApprovalService;
  ledger: IdempotencyLedger;
  comments: CommentsWriter;
}

interface ProviderContext {
  accessToken: string;
  subject: string;
  scopes: string[];
}

const replyQueues = new WeakMap<IdempotencyLedger, Promise<void>>();
const COMMENT_URN_PATTERN = /^urn:li:comment:\(urn:li:(?:share|ugcPost|activity):\d+,\d+\)$/;

function serializeByLedger<T>(ledger: IdempotencyLedger, action: () => Promise<T>): Promise<T> {
  const previous = replyQueues.get(ledger) ?? Promise.resolve();
  const result = previous.then(action, action);
  replyQueues.set(
    ledger,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

function assertNonEmpty(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new EngagementServiceError('invalid_payload');
  }
}

function assertPayloadHash(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new EngagementServiceError('invalid_payload');
  }
}

function previewFor(draft: ReplyDraft): ReplyPreview {
  try {
    return createReplyPreview(draft);
  } catch {
    throw new EngagementServiceError('invalid_payload');
  }
}

function errorForAuth(error: unknown): EngagementServiceError {
  if (error instanceof AuthServiceError) {
    switch (error.kind) {
      case 'not_configured':
        return new EngagementServiceError('auth_unconfigured');
      case 'disconnected':
      case 'authorization_pending':
        return new EngagementServiceError('not_connected');
      case 'expired':
      case 'reauth_required':
        return new EngagementServiceError('reauth_required');
      case 'permission_required':
        return new EngagementServiceError('permission_required');
      case 'rate_limited':
      case 'provider_failure':
        return new EngagementServiceError('not_connected');
    }
  }
  return new EngagementServiceError('not_connected');
}

async function providerContext(deps: EngagementServiceDeps): Promise<ProviderContext> {
  let context: ProviderContext;
  try {
    context = await deps.auth.getProviderContext();
  } catch (error: unknown) {
    throw errorForAuth(error);
  }

  if (
    typeof context.accessToken !== 'string' ||
    context.accessToken.trim() === '' ||
    typeof context.subject !== 'string' ||
    context.subject.trim() === '' ||
    !Array.isArray(context.scopes)
  ) {
    throw new EngagementServiceError('not_connected');
  }
  if (!context.scopes.includes('w_member_social_feed')) {
    throw new EngagementServiceError('permission_required');
  }
  return context;
}

function errorForApproval(error: unknown): EngagementServiceError {
  if (error instanceof ApprovalServiceError) {
    switch (error.kind) {
      case 'mismatch':
        return new EngagementServiceError('approval_mismatch');
      case 'expired':
        return new EngagementServiceError('approval_expired');
      case 'not_found':
        return new EngagementServiceError('approval_not_found');
      case 'already_consumed':
        return new EngagementServiceError('approval_consumed');
    }
  }
  return new EngagementServiceError('storage_failure');
}

function errorForLedger(error: unknown): EngagementServiceError {
  if (error instanceof IdempotencyLedgerError && error.kind === 'conflict') {
    return new EngagementServiceError('idempotency_conflict');
  }
  return new EngagementServiceError('storage_failure');
}

function errorForTerminal(record: MutationRecord): EngagementServiceError {
  switch (record.result?.errorCode) {
    case 'reauth_required':
      return new EngagementServiceError('reauth_required');
    case 'permission_required':
      return new EngagementServiceError('permission_required');
    case 'rate_limited':
      return new EngagementServiceError('rate_limited');
    case 'approval_consumed':
      return new EngagementServiceError('approval_consumed');
    default:
      return new EngagementServiceError('outcome_unknown');
  }
}

function replayResult(record: MutationRecord): ReplyPublishResult {
  const commentId = record.result?.resourceId;
  const commentUrn = record.result?.resourceUrn;
  if (
    typeof commentId !== 'string' ||
    !/^\d+$/.test(commentId) ||
    typeof commentUrn !== 'string' ||
    !COMMENT_URN_PATTERN.test(commentUrn)
  ) {
    throw new EngagementServiceError('outcome_unknown');
  }
  return {
    state: 'succeeded',
    provider: 'OFFICIAL_API',
    commentId,
    commentUrn,
    replay: true,
  };
}

async function bestEffortReauth(deps: EngagementServiceDeps, context: ProviderContext): Promise<void> {
  try {
    await deps.auth.markReauthRequired({
      accessToken: context.accessToken,
      subject: context.subject,
    });
  } catch {
    // Preserve the provider classification if local credential invalidation fails.
  }
}

async function completeFailure(
  deps: EngagementServiceDeps,
  idempotencyKey: string,
  mutationHash: string,
  state: 'failed_terminal' | 'outcome_unknown',
  errorCode: string,
): Promise<never> {
  try {
    const completed = await deps.ledger.complete({
      idempotencyKey,
      payloadHash: mutationHash,
      state,
      result: { errorCode },
    });
    if (completed.state === 'failed_terminal') throw errorForTerminal(completed);
  } catch (error: unknown) {
    if (error instanceof EngagementServiceError) throw error;
  }
  throw new EngagementServiceError('outcome_unknown');
}

function validateProviderReply(
  reply: CanonicalComment,
  expected: LinkedInCreateReplyInput,
): { commentId: string; commentUrn: string } {
  if (
    typeof reply.id !== 'string' ||
    !/^\d+$/.test(reply.id) ||
    typeof reply.commentUrn !== 'string' ||
    !COMMENT_URN_PATTERN.test(reply.commentUrn) ||
    reply.actorUrn !== expected.actorUrn ||
    reply.objectUrn !== expected.objectUrn ||
    reply.parentCommentUrn !== expected.parentCommentUrn ||
    reply.text !== expected.text
  ) {
    throw new EngagementServiceError('outcome_unknown');
  }
  return { commentId: reply.id, commentUrn: reply.commentUrn };
}

export function createEngagementService(deps: EngagementServiceDeps): EngagementService {
  return {
    previewReply(draft) {
      return previewFor(draft);
    },

    async approveReply(input) {
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new EngagementServiceError('invalid_payload');
      }
      assertPayloadHash(input.payloadHash);
      const context = await providerContext(deps);
      try {
        return deps.approvals.issue({ payloadHash: input.payloadHash, subject: context.subject });
      } catch {
        throw new EngagementServiceError('storage_failure');
      }
    },

    createReply(input) {
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        return Promise.reject(new EngagementServiceError('invalid_payload'));
      }
      assertPayloadHash(input.payloadHash);
      assertNonEmpty(input.approvalReceiptId);
      assertNonEmpty(input.idempotencyKey);

      let preview: ReplyPreview;
      try {
        preview = previewFor(input.draft);
      } catch (error: unknown) {
        return Promise.reject(error instanceof Error ? error : new EngagementServiceError('invalid_payload'));
      }
      if (preview.payloadHash !== input.payloadHash) {
        return Promise.reject(new EngagementServiceError('approval_mismatch'));
      }

      return serializeByLedger(deps.ledger, async () => {
        const context = await providerContext(deps);
        let approval;
        try {
          approval = deps.approvals.consume({
            receiptId: input.approvalReceiptId,
            payloadHash: preview.payloadHash,
            subject: context.subject,
            idempotencyKey: input.idempotencyKey,
          });
        } catch (error: unknown) {
          throw errorForApproval(error);
        }

        const actorUrn = `urn:li:person:${context.subject}`;
        const mutationHash = createHash('sha256')
          .update(
            JSON.stringify({
              operation: 'comments.reply',
              actor: actorUrn,
              payload: preview.payload,
            }),
          )
          .digest('hex');

        let reservation;
        try {
          reservation = await deps.ledger.reserve({
            idempotencyKey: input.idempotencyKey,
            payloadHash: mutationHash,
          });
        } catch (error: unknown) {
          throw errorForLedger(error);
        }

        if (reservation.status === 'replay') {
          const record = reservation.record;
          if (record.state === 'succeeded') return replayResult(record);
          if (record.state === 'failed_terminal') throw errorForTerminal(record);
          if (record.state === 'outcome_unknown') throw new EngagementServiceError('outcome_unknown');
          // Another runtime can still own a reserved mutation. Never complete or retry it here.
          throw new EngagementServiceError('outcome_unknown');
        }

        if (approval.status !== 'initiated') {
          return completeFailure(
            deps,
            input.idempotencyKey,
            mutationHash,
            'failed_terminal',
            'approval_consumed',
          );
        }

        const providerInput: LinkedInCreateReplyInput = {
          accessToken: context.accessToken,
          targetUrn: preview.payload.targetUrn,
          actorUrn,
          objectUrn: preview.payload.rootUrn,
          parentCommentUrn: preview.payload.parentCommentUrn,
          text: preview.payload.text,
        };

        let created: CanonicalComment;
        try {
          created = await deps.comments.createReply(providerInput);
        } catch (error: unknown) {
          if (error instanceof LinkedInCommentsError) {
            if (error.kind === 'reauthentication_required') {
              await bestEffortReauth(deps, context);
              return completeFailure(
                deps,
                input.idempotencyKey,
                mutationHash,
                'failed_terminal',
                'reauth_required',
              );
            }
            if (error.kind === 'permission_required') {
              return completeFailure(
                deps,
                input.idempotencyKey,
                mutationHash,
                'failed_terminal',
                'permission_required',
              );
            }
            if (error.kind === 'rate_limited') {
              return completeFailure(
                deps,
                input.idempotencyKey,
                mutationHash,
                'failed_terminal',
                'rate_limited',
              );
            }
          }
          return completeFailure(
            deps,
            input.idempotencyKey,
            mutationHash,
            'outcome_unknown',
            'reply_outcome_unknown',
          );
        }

        let commentId: string;
        let commentUrn: string;
        try {
          ({ commentId, commentUrn } = validateProviderReply(created, providerInput));
        } catch {
          return completeFailure(
            deps,
            input.idempotencyKey,
            mutationHash,
            'outcome_unknown',
            'reply_outcome_unknown',
          );
        }
        let completed: MutationRecord;
        try {
          completed = await deps.ledger.complete({
            idempotencyKey: input.idempotencyKey,
            payloadHash: mutationHash,
            state: 'succeeded',
            result: { resourceId: commentId, resourceUrn: commentUrn },
          });
        } catch {
          throw new EngagementServiceError('outcome_unknown');
        }
        if (completed.state !== 'succeeded') throw new EngagementServiceError('outcome_unknown');

        return {
          state: 'succeeded',
          provider: 'OFFICIAL_API',
          commentId,
          commentUrn,
          replay: false,
        };
      });
    },
  };
}

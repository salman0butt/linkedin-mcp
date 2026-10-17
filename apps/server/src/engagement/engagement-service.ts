import { createHash } from 'node:crypto';

import {
  createReplyPreview,
  createReactionPreview,
  matchesReplyIdentity,
  type CanonicalComment,
  type ReplyDraft,
  type ReplyPreview,
  type ReactionDraft,
  type ReactionPreview,
} from '../../../../packages/core/dist/index.js';
import { AuthServiceError, type AuthService } from '../auth/auth-service.js';
import {
  ApprovalServiceError,
  scopeApprovalService,
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
import {
  LinkedInReactionsError,
  type CanonicalReaction,
  type LinkedInReactionsClient,
} from './linkedin-reactions.js';

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

export type ReactionAddDraft = Omit<Extract<ReactionDraft, { operation: 'add' }>, 'operation'>;
export type ReactionRemoveDraft = Omit<Extract<ReactionDraft, { operation: 'remove' }>, 'operation'>;

export interface ReactionMutationInput<TDraft> {
  draft: TDraft;
  payloadHash: string;
  approvalReceiptId: string;
  idempotencyKey: string;
}

export interface ReactionAddResult {
  state: 'succeeded';
  provider: 'OFFICIAL_API';
  targetUrn: string;
  reactionUrn: string;
  reactionType: string;
  replay: boolean;
}

export interface ReactionRemoveResult {
  state: 'succeeded';
  provider: 'OFFICIAL_API';
  targetUrn: string;
  replay: boolean;
}

export interface EngagementService {
  previewReactionAdd(draft: ReactionAddDraft): ReactionPreview;
  previewReactionRemove(draft: ReactionRemoveDraft): ReactionPreview;
  approveReactionAdd(input: ApproveReplyInput): Promise<ApprovalReceipt>;
  approveReactionRemove(input: ApproveReplyInput): Promise<ApprovalReceipt>;
  addReaction(input: ReactionMutationInput<ReactionAddDraft>): Promise<ReactionAddResult>;
  removeReaction(input: ReactionMutationInput<ReactionRemoveDraft>): Promise<ReactionRemoveResult>;
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
  reactions?: Pick<LinkedInReactionsClient, 'addReaction' | 'removeReaction'>;
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

function replayResult(record: MutationRecord, parentCommentUrn: string): ReplyPublishResult {
  const commentId = record.result?.resourceId;
  const commentUrn = record.result?.resourceUrn;
  if (
    typeof commentId !== 'string' ||
    !/^\d+$/.test(commentId) ||
    typeof commentUrn !== 'string' ||
    !COMMENT_URN_PATTERN.test(commentUrn) ||
    !matchesReplyIdentity(commentUrn, commentId, parentCommentUrn)
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
    reply.text !== expected.text ||
    !matchesReplyIdentity(reply.commentUrn, reply.id, expected.parentCommentUrn)
  ) {
    throw new EngagementServiceError('outcome_unknown');
  }
  return { commentId: reply.id, commentUrn: reply.commentUrn };
}

function previewReactionFor(
  draft: ReactionAddDraft | ReactionRemoveDraft,
  operation: 'add' | 'remove',
): ReactionPreview {
  try {
    if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) {
      throw new Error('Invalid reaction draft');
    }
    return createReactionPreview({ ...draft, operation } as ReactionDraft);
  } catch {
    throw new EngagementServiceError('invalid_payload');
  }
}

async function approveReactionFor(
  deps: EngagementServiceDeps,
  operation: 'add' | 'remove',
  input: ApproveReplyInput,
): Promise<ApprovalReceipt> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new EngagementServiceError('invalid_payload');
  }
  assertPayloadHash(input.payloadHash);
  const context = await providerContext(deps);
  try {
    return scopeApprovalService(deps.approvals, `reactions.${operation}`).issue({
      payloadHash: input.payloadHash,
      subject: context.subject,
    });
  } catch {
    throw new EngagementServiceError('storage_failure');
  }
}

function expectedReactionUrn(actorUrn: string, targetUrn: string): string {
  return `urn:li:reaction:(${actorUrn},${targetUrn})`;
}

function validateReactionSuccess(
  reaction: CanonicalReaction,
  actorUrn: string,
  preview: ReactionPreview,
): string {
  if (preview.payload.operation !== 'add') throw new EngagementServiceError('outcome_unknown');
  const expected = expectedReactionUrn(actorUrn, preview.payload.targetUrn);
  if (
    reaction === null ||
    typeof reaction !== 'object' ||
    reaction.id !== expected ||
    reaction.actorUrn !== actorUrn ||
    reaction.rootUrn !== preview.payload.targetUrn ||
    reaction.reactionType !== preview.payload.reactionType ||
    typeof reaction.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(reaction.createdAt)) ||
    typeof reaction.lastModifiedAt !== 'string' ||
    !Number.isFinite(Date.parse(reaction.lastModifiedAt))
  ) {
    throw new EngagementServiceError('outcome_unknown');
  }
  return expected;
}

function replayReactionResult(
  record: MutationRecord,
  operation: 'add' | 'remove',
  actorUrn: string,
  preview: ReactionPreview,
): ReactionAddResult | ReactionRemoveResult {
  if (operation === 'add' && preview.payload.operation === 'add') {
    const expected = expectedReactionUrn(actorUrn, preview.payload.targetUrn);
    if (
      record.result?.resourceUrn !== expected ||
      record.result.resourceId !== preview.payload.reactionType
    ) {
      throw new EngagementServiceError('outcome_unknown');
    }
    return {
      state: 'succeeded',
      provider: 'OFFICIAL_API',
      targetUrn: preview.payload.targetUrn,
      reactionUrn: expected,
      reactionType: preview.payload.reactionType,
      replay: true,
    };
  }
  if (operation === 'remove' && preview.payload.operation === 'remove') {
    if (record.result?.resourceUrn !== preview.payload.targetUrn || record.result.resourceId !== 'removed') {
      throw new EngagementServiceError('outcome_unknown');
    }
    return {
      state: 'succeeded',
      provider: 'OFFICIAL_API',
      targetUrn: preview.payload.targetUrn,
      replay: true,
    };
  }
  throw new EngagementServiceError('outcome_unknown');
}

async function runReaction(
  deps: EngagementServiceDeps,
  operation: 'add',
  input: ReactionMutationInput<ReactionAddDraft>,
): Promise<ReactionAddResult>;
async function runReaction(
  deps: EngagementServiceDeps,
  operation: 'remove',
  input: ReactionMutationInput<ReactionRemoveDraft>,
): Promise<ReactionRemoveResult>;
async function runReaction(
  deps: EngagementServiceDeps,
  operation: 'add' | 'remove',
  input: ReactionMutationInput<ReactionAddDraft | ReactionRemoveDraft>,
): Promise<ReactionAddResult | ReactionRemoveResult> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new EngagementServiceError('invalid_payload');
  }
  assertPayloadHash(input.payloadHash);
  assertNonEmpty(input.approvalReceiptId);
  assertNonEmpty(input.idempotencyKey);
  const preview = previewReactionFor(input.draft, operation);
  if (preview.payloadHash !== input.payloadHash) {
    throw new EngagementServiceError('approval_mismatch');
  }
  if (deps.reactions === undefined) throw new EngagementServiceError('storage_failure');

  return serializeByLedger(deps.ledger, async () => {
    const context = await providerContext(deps);
    let approval;
    try {
      approval = scopeApprovalService(deps.approvals, `reactions.${operation}`).consume({
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
        JSON.stringify({ operation: `reactions.${operation}`, actor: actorUrn, payload: preview.payload }),
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
      if (record.state === 'succeeded') {
        return replayReactionResult(record, operation, actorUrn, preview);
      }
      if (record.state === 'failed_terminal') throw errorForTerminal(record);
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

    try {
      if (operation === 'add' && preview.payload.operation === 'add') {
        const reaction = await deps.reactions!.addReaction({
          accessToken: context.accessToken,
          actorUrn,
          targetUrn: preview.payload.targetUrn,
          reactionType: preview.payload.reactionType,
        });
        const reactionUrn = validateReactionSuccess(reaction, actorUrn, preview);
        const completed = await deps.ledger.complete({
          idempotencyKey: input.idempotencyKey,
          payloadHash: mutationHash,
          state: 'succeeded',
          result: { resourceUrn: reactionUrn, resourceId: preview.payload.reactionType },
        });
        if (completed.state !== 'succeeded') throw new EngagementServiceError('outcome_unknown');
        return {
          state: 'succeeded',
          provider: 'OFFICIAL_API',
          targetUrn: preview.payload.targetUrn,
          reactionUrn,
          reactionType: preview.payload.reactionType,
          replay: false,
        } as const;
      }
      if (operation === 'remove' && preview.payload.operation === 'remove') {
        await deps.reactions!.removeReaction({
          accessToken: context.accessToken,
          actorUrn,
          targetUrn: preview.payload.targetUrn,
        });
        const completed = await deps.ledger.complete({
          idempotencyKey: input.idempotencyKey,
          payloadHash: mutationHash,
          state: 'succeeded',
          result: { resourceUrn: preview.payload.targetUrn, resourceId: 'removed' },
        });
        if (completed.state !== 'succeeded') throw new EngagementServiceError('outcome_unknown');
        return {
          state: 'succeeded',
          provider: 'OFFICIAL_API',
          targetUrn: preview.payload.targetUrn,
          replay: false,
        } as const;
      }
    } catch (error: unknown) {
      if (error instanceof LinkedInReactionsError) {
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
          return completeFailure(deps, input.idempotencyKey, mutationHash, 'failed_terminal', 'rate_limited');
        }
      }
      return completeFailure(
        deps,
        input.idempotencyKey,
        mutationHash,
        'outcome_unknown',
        'reaction_outcome_unknown',
      );
    }
    throw new EngagementServiceError('outcome_unknown');
  });
}

export function createEngagementService(deps: EngagementServiceDeps): EngagementService {
  return {
    previewReactionAdd(draft) {
      return previewReactionFor(draft, 'add');
    },
    previewReactionRemove(draft) {
      return previewReactionFor(draft, 'remove');
    },
    approveReactionAdd(input) {
      return approveReactionFor(deps, 'add', input);
    },
    approveReactionRemove(input) {
      return approveReactionFor(deps, 'remove', input);
    },
    addReaction(input) {
      return runReaction(deps, 'add', input);
    },
    removeReaction(input) {
      return runReaction(deps, 'remove', input);
    },
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
        return scopeApprovalService(deps.approvals, 'comments.reply').issue({
          payloadHash: input.payloadHash,
          subject: context.subject,
        });
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
          approval = scopeApprovalService(deps.approvals, 'comments.reply').consume({
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
          if (record.state === 'succeeded') {
            return replayResult(record, preview.payload.parentCommentUrn);
          }
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

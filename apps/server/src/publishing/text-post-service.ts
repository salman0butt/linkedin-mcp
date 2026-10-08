import { createHash } from 'node:crypto';

import { createTextPostPreview, type TextPostPayload } from '../../../../packages/core/dist/index.js';
import { AuthServiceError, type AuthService } from '../auth/auth-service.js';
import { ApprovalServiceError, type ApprovalService } from './approval-service.js';
import { IdempotencyLedgerError, type IdempotencyLedger, type MutationRecord } from './idempotency-ledger.js';
import { isValidLinkedInPostUrn, LinkedInPostsError, type LinkedInPostsAdapter } from './linkedin-posts.js';

export type TextPostServiceErrorKind =
  | 'invalid_payload'
  | 'not_connected'
  | 'reauth_required'
  | 'permission_required'
  | 'approval_mismatch'
  | 'approval_expired'
  | 'approval_not_found'
  | 'approval_consumed'
  | 'idempotency_conflict'
  | 'storage_failure'
  | 'auth_unconfigured'
  | 'provider_conflict'
  | 'rate_limited'
  | 'outcome_unknown';

export class TextPostServiceError extends Error {
  readonly kind: TextPostServiceErrorKind;
  readonly retryable = false;

  constructor(kind: TextPostServiceErrorKind) {
    super(`Text post publishing failed: ${kind}`);
    this.name = 'TextPostServiceError';
    this.kind = kind;
  }
}

export interface PublishTextPostInput {
  payload: TextPostPayload;
  approvalReceiptId: string;
  idempotencyKey: string;
}

export interface TextPostService {
  publish(input: PublishTextPostInput): Promise<{
    state: 'succeeded';
    provider: 'OFFICIAL_API';
    postUrn: string;
    replay: boolean;
  }>;
}

interface TextPostServiceDeps {
  auth: AuthService;
  approvals: ApprovalService;
  ledger: IdempotencyLedger;
  posts: LinkedInPostsAdapter;
}

interface ProviderContext {
  accessToken: string;
  subject: string;
  scopes: string[];
}

const publishQueues = new WeakMap<IdempotencyLedger, Promise<void>>();

function exactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === expected.length && keys.every((key) => typeof key === 'string' && expected.includes(key))
  );
}

function snapshotPayload(value: unknown): { payload: TextPostPayload; previewHash: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TextPostServiceError('invalid_payload');
  }
  const candidate = value as Record<string, unknown>;
  if (
    !exactKeys(candidate, [
      'commentary',
      'visibility',
      'distribution',
      'lifecycleState',
      'isReshareDisabled',
    ]) ||
    typeof candidate.commentary !== 'string' ||
    candidate.commentary.trim() === '' ||
    candidate.commentary.length > 3000 ||
    (candidate.visibility !== 'PUBLIC' && candidate.visibility !== 'CONNECTIONS') ||
    candidate.lifecycleState !== 'PUBLISHED' ||
    typeof candidate.isReshareDisabled !== 'boolean'
  ) {
    throw new TextPostServiceError('invalid_payload');
  }

  const distribution = candidate.distribution;
  if (
    distribution === null ||
    typeof distribution !== 'object' ||
    Array.isArray(distribution) ||
    !exactKeys(distribution, ['feedDistribution', 'targetEntities', 'thirdPartyDistributionChannels'])
  ) {
    throw new TextPostServiceError('invalid_payload');
  }
  const target = distribution as Record<string, unknown>;
  if (
    target.feedDistribution !== 'MAIN_FEED' ||
    !Array.isArray(target.targetEntities) ||
    target.targetEntities.length !== 0 ||
    !Array.isArray(target.thirdPartyDistributionChannels) ||
    target.thirdPartyDistributionChannels.length !== 0
  ) {
    throw new TextPostServiceError('invalid_payload');
  }

  const payload: TextPostPayload = {
    commentary: candidate.commentary,
    visibility: candidate.visibility,
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabled: candidate.isReshareDisabled,
  };
  const previewHash = createTextPostPreview({
    text: payload.commentary,
    visibility: payload.visibility,
    disableReshare: payload.isReshareDisabled,
  }).payloadHash;
  return { payload, previewHash };
}

function errorForAuth(error: unknown): TextPostServiceError {
  if (error instanceof AuthServiceError) {
    switch (error.kind) {
      case 'not_configured':
        return new TextPostServiceError('auth_unconfigured');
      case 'disconnected':
      case 'authorization_pending':
        return new TextPostServiceError('not_connected');
      case 'expired':
      case 'reauth_required':
        return new TextPostServiceError('reauth_required');
      case 'permission_required':
        return new TextPostServiceError('permission_required');
      case 'rate_limited':
      case 'provider_failure':
        return new TextPostServiceError('not_connected');
    }
  }
  return new TextPostServiceError('not_connected');
}

function errorForApproval(error: unknown): TextPostServiceError {
  if (error instanceof ApprovalServiceError) {
    switch (error.kind) {
      case 'mismatch':
        return new TextPostServiceError('approval_mismatch');
      case 'expired':
        return new TextPostServiceError('approval_expired');
      case 'not_found':
        return new TextPostServiceError('approval_not_found');
      case 'already_consumed':
        return new TextPostServiceError('approval_consumed');
    }
  }
  return new TextPostServiceError('storage_failure');
}

function errorForProvider(error: unknown): TextPostServiceError {
  if (error instanceof LinkedInPostsError) {
    switch (error.kind) {
      case 'reauthentication_required':
        return new TextPostServiceError('reauth_required');
      case 'permission_required':
        return new TextPostServiceError('permission_required');
      case 'conflict':
        return new TextPostServiceError('provider_conflict');
      case 'rate_limited':
        return new TextPostServiceError('rate_limited');
      case 'provider_failure':
      case 'malformed_success':
      case 'outcome_unknown':
        return new TextPostServiceError('outcome_unknown');
    }
  }
  return new TextPostServiceError('outcome_unknown');
}

function errorForLedger(error: unknown): TextPostServiceError {
  if (error instanceof IdempotencyLedgerError && error.kind === 'conflict') {
    return new TextPostServiceError('idempotency_conflict');
  }
  return new TextPostServiceError('storage_failure');
}

function errorForTerminal(record: MutationRecord): TextPostServiceError {
  switch (record.result?.errorCode) {
    case 'reauth_required':
      return new TextPostServiceError('reauth_required');
    case 'permission_required':
      return new TextPostServiceError('permission_required');
    case 'provider_conflict':
      return new TextPostServiceError('provider_conflict');
    case 'rate_limited':
      return new TextPostServiceError('rate_limited');
    case 'approval_consumed':
      return new TextPostServiceError('approval_consumed');
    default:
      return new TextPostServiceError('outcome_unknown');
  }
}

function serializeByLedger<T>(ledger: IdempotencyLedger, action: () => Promise<T>): Promise<T> {
  const previous = publishQueues.get(ledger) ?? Promise.resolve();
  const result = previous.then(action, action);
  publishQueues.set(
    ledger,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

export function createTextPostService(deps: TextPostServiceDeps): TextPostService {
  return {
    publish(input) {
      if (
        input === null ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        !exactKeys(input, ['payload', 'approvalReceiptId', 'idempotencyKey']) ||
        typeof input.approvalReceiptId !== 'string' ||
        input.approvalReceiptId.trim() === '' ||
        typeof input.idempotencyKey !== 'string' ||
        input.idempotencyKey.trim() === ''
      ) {
        return Promise.reject(new TextPostServiceError('invalid_payload'));
      }

      let snapshot: { payload: TextPostPayload; previewHash: string };
      try {
        snapshot = snapshotPayload(input.payload);
      } catch (error: unknown) {
        return Promise.reject(
          error instanceof TextPostServiceError ? error : new TextPostServiceError('invalid_payload'),
        );
      }
      const receiptId = input.approvalReceiptId;
      const idempotencyKey = input.idempotencyKey;

      return serializeByLedger(deps.ledger, async () => {
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
          context.subject.trim() === ''
        ) {
          throw new TextPostServiceError('not_connected');
        }
        if (!Array.isArray(context.scopes) || !context.scopes.includes('w_member_social')) {
          throw new TextPostServiceError('permission_required');
        }

        let approval;
        try {
          approval = deps.approvals.consume({
            receiptId,
            payloadHash: snapshot.previewHash,
            subject: context.subject,
            idempotencyKey,
          });
        } catch (error: unknown) {
          throw errorForApproval(error);
        }

        const author = `urn:li:person:${context.subject}`;
        const mutationHash = createHash('sha256')
          .update(JSON.stringify({ author, ...snapshot.payload }))
          .digest('hex');
        let reservation;
        try {
          reservation = await deps.ledger.reserve({ idempotencyKey, payloadHash: mutationHash });
        } catch (error: unknown) {
          throw errorForLedger(error);
        }

        if (reservation.status === 'replay') {
          const record = reservation.record;
          if (record.state === 'succeeded') {
            if (!isValidLinkedInPostUrn(record.result?.postUrn)) {
              throw new TextPostServiceError('outcome_unknown');
            }
            return {
              state: 'succeeded',
              provider: 'OFFICIAL_API',
              postUrn: record.result.postUrn,
              replay: true,
            };
          }
          if (record.state === 'failed_terminal') throw errorForTerminal(record);
          if (record.state === 'outcome_unknown') throw new TextPostServiceError('outcome_unknown');

          let completed: MutationRecord;
          try {
            completed = await deps.ledger.complete({
              idempotencyKey,
              payloadHash: mutationHash,
              state: 'outcome_unknown',
              result: { errorCode: 'interrupted_after_reservation' },
            });
          } catch {
            throw new TextPostServiceError('outcome_unknown');
          }
          if (completed.state === 'failed_terminal') throw errorForTerminal(completed);
          throw new TextPostServiceError('outcome_unknown');
        }

        if (approval.status !== 'initiated') {
          let completed: MutationRecord;
          try {
            completed = await deps.ledger.complete({
              idempotencyKey,
              payloadHash: mutationHash,
              state: 'failed_terminal',
              result: { errorCode: 'approval_consumed' },
            });
          } catch {
            throw new TextPostServiceError('storage_failure');
          }
          throw errorForTerminal(completed);
        }

        let postUrn: string;
        try {
          const result = await deps.posts.createTextPost({
            accessToken: context.accessToken,
            author,
            payload: snapshot.payload,
          });
          if (!isValidLinkedInPostUrn(result?.postUrn)) {
            throw new TextPostServiceError('outcome_unknown');
          }
          postUrn = result.postUrn;
        } catch (error: unknown) {
          const mapped = errorForProvider(error);
          if (mapped.kind === 'reauth_required') {
            try {
              await deps.auth.markReauthRequired({
                accessToken: context.accessToken,
                subject: context.subject,
              });
            } catch {
              // A failed local invalidation must not replace the provider classification.
            }
          }

          const terminal =
            mapped.kind === 'reauth_required' ||
            mapped.kind === 'permission_required' ||
            mapped.kind === 'provider_conflict' ||
            mapped.kind === 'rate_limited';
          let completed: MutationRecord;
          try {
            completed = await deps.ledger.complete({
              idempotencyKey,
              payloadHash: mutationHash,
              state: terminal ? 'failed_terminal' : 'outcome_unknown',
              result: { errorCode: mapped.kind },
            });
          } catch {
            throw new TextPostServiceError('outcome_unknown');
          }
          if (completed.state === 'failed_terminal') throw errorForTerminal(completed);
          throw new TextPostServiceError('outcome_unknown');
        }

        let completed: MutationRecord;
        try {
          completed = await deps.ledger.complete({
            idempotencyKey,
            payloadHash: mutationHash,
            state: 'succeeded',
            result: { postUrn },
          });
        } catch {
          throw new TextPostServiceError('outcome_unknown');
        }
        if (completed.state !== 'succeeded' || !isValidLinkedInPostUrn(completed.result?.postUrn)) {
          if (completed.state === 'failed_terminal') throw errorForTerminal(completed);
          throw new TextPostServiceError('outcome_unknown');
        }

        return {
          state: 'succeeded',
          provider: 'OFFICIAL_API',
          postUrn: completed.result.postUrn,
          replay: false,
        };
      });
    },
  };
}

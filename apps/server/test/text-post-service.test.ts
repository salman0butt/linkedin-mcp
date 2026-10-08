import { describe, expect, it } from 'vitest';

import { createTextPostPreview, type TextPostPayload } from '../../../packages/core/dist/index.js';
import { AuthServiceError, type AuthService } from '../src/auth/auth-service.js';
import { createApprovalService, type ApprovalService } from '../src/publishing/approval-service.js';
import {
  IdempotencyLedgerError,
  type CompleteMutationInput,
  type IdempotencyLedger,
  type MutationRecord,
  type ReserveMutationInput,
  type ReserveMutationResult,
} from '../src/publishing/idempotency-ledger.js';
import {
  LinkedInPostsError,
  type CreateTextPostInput,
  type LinkedInPostsAdapter,
} from '../src/publishing/linkedin-posts.js';
import { TextPostServiceError, createTextPostService } from '../src/publishing/text-post-service.js';

const NOW = new Date('2026-10-08T10:35:00.000Z');
const preview = createTextPostPreview({ text: 'Ship safely' });

function mutationRecord(state: MutationRecord['state'], result?: MutationRecord['result']): MutationRecord {
  return {
    idempotencyKey: 'idem-1',
    payloadHash: preview.payloadHash,
    state,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...(result === undefined ? {} : { result }),
  };
}

function fakeAuth(
  options: {
    scopes?: string[];
    subject?: string;
    contextError?: AuthServiceError;
  } = {},
): {
  auth: AuthService;
  markCount(): number;
  contextCount(): number;
} {
  const scopes = options.scopes ?? ['openid', 'profile', 'w_member_social'];
  const subject = options.subject ?? 'member-123';
  let marked = 0;
  let contexts = 0;

  const auth = {
    getProviderContext() {
      contexts += 1;
      if (options.contextError !== undefined) return Promise.reject(options.contextError);
      return Promise.resolve({
        accessToken: 'access-token-secret',
        subject,
        scopes: [...scopes],
      });
    },
    markReauthRequired() {
      marked += 1;
      return Promise.resolve();
    },
  } as unknown as AuthService;

  return { auth, markCount: () => marked, contextCount: () => contexts };
}

function approval(
  subject = 'member-123',
  events?: string[],
): {
  approvals: ApprovalService;
  receiptId: string;
} {
  const base = createApprovalService({
    now: () => NOW,
    randomId: () => 'approval-receipt-1',
  });
  const receipt = base.issue({ payloadHash: preview.payloadHash, subject });

  return {
    receiptId: receipt.receiptId,
    approvals: {
      issue: (input) => base.issue(input),
      consume(input) {
        events?.push('approval');
        return base.consume(input);
      },
    },
  };
}

function fakeLedger(
  options: {
    reserveResult?: ReserveMutationResult;
    reserveError?: Error;
    completeError?: Error;
    events?: string[];
  } = {},
): {
  ledger: IdempotencyLedger;
  reserveInputs: ReserveMutationInput[];
  completeInputs: CompleteMutationInput[];
} {
  const reserveInputs: ReserveMutationInput[] = [];
  const completeInputs: CompleteMutationInput[] = [];

  return {
    reserveInputs,
    completeInputs,
    ledger: {
      reserve(input) {
        options.events?.push('reserve');
        reserveInputs.push({ ...input });
        if (options.reserveError !== undefined) return Promise.reject(options.reserveError);
        return Promise.resolve(
          options.reserveResult ?? {
            status: 'reserved',
            record: mutationRecord('reserved'),
          },
        );
      },
      complete(input) {
        options.events?.push('complete');
        completeInputs.push({
          ...input,
          ...(input.result === undefined ? {} : { result: { ...input.result } }),
        });
        if (options.completeError !== undefined) return Promise.reject(options.completeError);
        return Promise.resolve(mutationRecord(input.state, input.result));
      },
    },
  };
}

function fakePosts(
  options: {
    error?: LinkedInPostsError;
    events?: string[];
  } = {},
): {
  posts: LinkedInPostsAdapter;
  calls: CreateTextPostInput[];
} {
  const calls: CreateTextPostInput[] = [];
  return {
    calls,
    posts: {
      createTextPost(input) {
        options.events?.push('post');
        calls.push({
          accessToken: input.accessToken,
          author: input.author,
          payload: input.payload,
        });
        if (options.error !== undefined) return Promise.reject(options.error);
        return Promise.resolve({ postUrn: 'urn:li:share:123' });
      },
    },
  };
}

function publishInput(receiptId: string, payload: TextPostPayload = preview.payload) {
  return {
    payload,
    approvalReceiptId: receiptId,
    idempotencyKey: 'idem-1',
  };
}

describe('text-post publish orchestration', () => {
  it('gates auth/approval, reserves before one provider POST, derives author, and persists success before return', async () => {
    const events: string[] = [];
    const authState = fakeAuth();
    const approvalState = approval('member-123', events);
    const ledgerState = fakeLedger({ events });
    const postsState = fakePosts({ events });
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).resolves.toEqual({
      state: 'succeeded',
      provider: 'OFFICIAL_API',
      postUrn: 'urn:li:share:123',
      replay: false,
    });

    expect(events).toEqual(['approval', 'reserve', 'post', 'complete']);
    expect(postsState.calls).toHaveLength(1);
    expect(postsState.calls[0]).toEqual({
      accessToken: 'access-token-secret',
      author: 'urn:li:person:member-123',
      payload: preview.payload,
    });
    expect(ledgerState.reserveInputs).toEqual([
      { idempotencyKey: 'idem-1', payloadHash: preview.payloadHash },
    ]);
    expect(ledgerState.completeInputs).toEqual([
      {
        idempotencyKey: 'idem-1',
        payloadHash: preview.payloadHash,
        state: 'succeeded',
        result: { postUrn: 'urn:li:share:123' },
      },
    ]);
  });

  it.each([
    ['disconnected', 'not_connected'],
    ['reauth_required', 'reauth_required'],
  ] as const)(
    'rejects auth state %s before approval, reservation, or provider mutation',
    async (authKind, expected) => {
      const authState = fakeAuth({ contextError: new AuthServiceError(authKind, false) });
      const approvalState = approval();
      const ledgerState = fakeLedger();
      const postsState = fakePosts();
      const service = createTextPostService({
        auth: authState.auth,
        approvals: approvalState.approvals,
        ledger: ledgerState.ledger,
        posts: postsState.posts,
      });

      await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
        kind: expected,
        retryable: false,
      });
      expect(ledgerState.reserveInputs).toHaveLength(0);
      expect(postsState.calls).toHaveLength(0);
    },
  );

  it('requires w_member_social before consuming approval or reserving mutation state', async () => {
    const events: string[] = [];
    const authState = fakeAuth({ scopes: ['openid', 'profile'] });
    const approvalState = approval('member-123', events);
    const ledgerState = fakeLedger({ events });
    const postsState = fakePosts({ events });
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
      kind: 'permission_required',
      retryable: false,
    });
    expect(events).toEqual([]);
  });

  it('rejects approval subject mismatch before reservation or provider mutation', async () => {
    const authState = fakeAuth({ subject: 'member-999' });
    const approvalState = approval('member-123');
    const ledgerState = fakeLedger();
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
      kind: 'approval_mismatch',
      retryable: false,
    });
    expect(ledgerState.reserveInputs).toHaveLength(0);
    expect(postsState.calls).toHaveLength(0);
  });

  it('rejects non-canonical/tampered payloads before auth or mutation', async () => {
    const authState = fakeAuth();
    const approvalState = approval();
    const ledgerState = fakeLedger();
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });
    const tampered = {
      ...preview.payload,
      author: 'urn:li:person:attacker',
    } as unknown as TextPostPayload;

    await expect(service.publish(publishInput(approvalState.receiptId, tampered))).rejects.toMatchObject({
      kind: 'invalid_payload',
      retryable: false,
    });
    expect(authState.contextCount()).toBe(0);
    expect(ledgerState.reserveInputs).toHaveLength(0);
    expect(postsState.calls).toHaveLength(0);
  });

  it('replays a persisted success without a second provider POST', async () => {
    const authState = fakeAuth();
    const approvalState = approval();
    const ledgerState = fakeLedger({
      reserveResult: {
        status: 'replay',
        record: mutationRecord('succeeded', { postUrn: 'urn:li:share:prior' }),
      },
    });
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).resolves.toEqual({
      state: 'succeeded',
      provider: 'OFFICIAL_API',
      postUrn: 'urn:li:share:prior',
      replay: true,
    });
    expect(postsState.calls).toHaveLength(0);
    expect(ledgerState.completeInputs).toHaveLength(0);
  });

  it('maps same-key/different-payload idempotency conflict without provider mutation', async () => {
    const authState = fakeAuth();
    const approvalState = approval();
    const ledgerState = fakeLedger({ reserveError: new IdempotencyLedgerError('conflict') });
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
      kind: 'idempotency_conflict',
      retryable: false,
    });
    expect(postsState.calls).toHaveLength(0);
  });

  it('converts a replayed reserved record to durable outcome_unknown without another POST', async () => {
    const authState = fakeAuth();
    const approvalState = approval();
    const ledgerState = fakeLedger({
      reserveResult: { status: 'replay', record: mutationRecord('reserved') },
    });
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
      kind: 'outcome_unknown',
      retryable: false,
    });
    expect(postsState.calls).toHaveLength(0);
    expect(ledgerState.completeInputs).toEqual([
      {
        idempotencyKey: 'idem-1',
        payloadHash: preview.payloadHash,
        state: 'outcome_unknown',
        result: { errorCode: 'interrupted_after_reservation' },
      },
    ]);
  });

  it('persists provider transport uncertainty as outcome_unknown before returning the error', async () => {
    const events: string[] = [];
    const authState = fakeAuth();
    const approvalState = approval('member-123', events);
    const ledgerState = fakeLedger({ events });
    const postsState = fakePosts({
      events,
      error: new LinkedInPostsError('outcome_unknown'),
    });
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
      kind: 'outcome_unknown',
      retryable: false,
    });
    expect(events).toEqual(['approval', 'reserve', 'post', 'complete']);
    expect(postsState.calls).toHaveLength(1);
    expect(ledgerState.completeInputs[0]).toMatchObject({
      state: 'outcome_unknown',
      result: { errorCode: 'outcome_unknown' },
    });
  });

  it('persists 401 terminal state and transitions AuthService to reauth-required', async () => {
    const authState = fakeAuth();
    const approvalState = approval();
    const ledgerState = fakeLedger();
    const postsState = fakePosts({ error: new LinkedInPostsError('reauthentication_required') });
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
      kind: 'reauth_required',
      retryable: false,
    });
    expect(ledgerState.completeInputs[0]).toMatchObject({
      state: 'failed_terminal',
      result: { errorCode: 'reauth_required' },
    });
    expect(authState.markCount()).toBe(1);
  });

  it('treats failure to persist a known provider success as non-retryable outcome_unknown', async () => {
    const authState = fakeAuth();
    const approvalState = approval();
    const ledgerState = fakeLedger({ completeError: new IdempotencyLedgerError('write_failed') });
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
      kind: 'outcome_unknown',
      retryable: false,
    });
    expect(postsState.calls).toHaveLength(1);
  });

  it('does not expose provider tokens in structured service errors', async () => {
    const authState = fakeAuth();
    const approvalState = approval();
    const ledgerState = fakeLedger();
    const postsState = fakePosts({ error: new LinkedInPostsError('permission_required') });
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });

    let error: unknown;
    try {
      await service.publish(publishInput(approvalState.receiptId));
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(TextPostServiceError);
    expect(error).toMatchObject({ kind: 'permission_required', retryable: false });
    expect((error as Error).message).not.toContain('access-token-secret');
  });
});

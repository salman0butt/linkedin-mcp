import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { createFileIdempotencyLedger } from '../src/publishing/idempotency-ledger.js';
import {
  createLinkedInPostsAdapter,
  LinkedInPostsError,
  type CreateTextPostInput,
  type GetTextPostInput,
  type LinkedInPostsAdapter,
  type LinkedInPostReadResult,
} from '../src/publishing/linkedin-posts.js';
import { TextPostServiceError, createTextPostService } from '../src/publishing/text-post-service.js';

const NOW = new Date('2026-10-08T10:35:00.000Z');
const preview = createTextPostPreview({ text: 'Ship safely' });
const mutationHash = createHash('sha256')
  .update(JSON.stringify({ author: 'urn:li:person:member-123', ...preview.payload }))
  .digest('hex');

function mutationRecord(state: MutationRecord['state'], result?: MutationRecord['result']): MutationRecord {
  return {
    idempotencyKey: 'idem-1',
    payloadHash: mutationHash,
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
    markError?: Error;
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
      if (options.markError !== undefined) return Promise.reject(options.markError);
      return Promise.resolve();
    },
  } as unknown as AuthService;

  return { auth, markCount: () => marked, contextCount: () => contexts };
}

function approval(
  subject = 'member-123',
  events?: string[],
  now: () => Date = () => NOW,
): {
  approvals: ApprovalService;
  receiptId: string;
} {
  let receiptSequence = 0;
  const base = createApprovalService({
    now,
    randomId: () => `approval-receipt-${receiptSequence++}`,
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
    completeResult?: MutationRecord;
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
        return Promise.resolve(options.completeResult ?? mutationRecord(input.state, input.result));
      },
    },
  };
}

function fakePosts(
  options: {
    error?: Error;
    postUrn?: string;
    events?: string[];
    readError?: Error;
    readResult?: LinkedInPostReadResult;
  } = {},
): {
  posts: LinkedInPostsAdapter;
  calls: CreateTextPostInput[];
  readCalls: GetTextPostInput[];
} {
  const calls: CreateTextPostInput[] = [];
  const readCalls: GetTextPostInput[] = [];
  return {
    calls,
    readCalls,
    posts: {
      createTextPost(input) {
        options.events?.push('post');
        calls.push({
          accessToken: input.accessToken,
          author: input.author,
          payload: input.payload,
        });
        if (options.error !== undefined) return Promise.reject(options.error);
        return Promise.resolve({ postUrn: options.postUrn ?? 'urn:li:share:123' });
      },
      getTextPost(input) {
        options.events?.push('get');
        readCalls.push({ ...input });
        if (options.readError !== undefined) return Promise.reject(options.readError);
        return Promise.resolve(
          options.readResult ?? {
            postUrn: options.postUrn ?? 'urn:li:share:123',
            author: 'urn:li:person:member-123',
            commentary: 'Ship safely',
            lifecycleState: 'PUBLISHED',
          },
        );
      },
    },
  };
}

function publishInput(
  receiptId: string,
  payload: TextPostPayload = preview.payload,
  idempotencyKey = 'idem-1',
) {
  return {
    payload,
    approvalReceiptId: receiptId,
    idempotencyKey,
  };
}

describe('text-post publish orchestration', () => {
  it('classifies a valid organization-authored GET as a member post mismatch', async () => {
    let calls = 0;
    const posts = createLinkedInPostsAdapter(
      { apiVersion: '202510' },
      {
        fetch: (_input, init) => {
          calls += 1;
          if (init?.method === 'POST') {
            return Promise.resolve(
              new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:123' } }),
            );
          }
          return Promise.resolve(
            Response.json({
              id: 'urn:li:share:123',
              author: 'urn:li:organization:987',
              commentary: 'Ship safely',
              lifecycleState: 'PUBLISHED',
            }),
          );
        },
      },
    );
    const approvalState = approval();
    const service = createTextPostService({
      auth: fakeAuth({ scopes: ['w_member_social', 'r_member_social'] }).auth,
      approvals: approvalState.approvals,
      ledger: fakeLedger().ledger,
      posts,
      memberPostReadEnabled: true,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).resolves.toMatchObject({
      state: 'succeeded',
      verification: { state: 'verification_failed', reason: 'post_mismatch' },
    });
    expect(calls).toBe(2);
  });

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
      verification: { state: 'created_unverified', reason: 'read_permission_unavailable' },
    });

    expect(events).toEqual(['approval', 'reserve', 'post', 'complete']);
    expect(postsState.calls).toHaveLength(1);
    expect(postsState.calls[0]).toEqual({
      accessToken: 'access-token-secret',
      author: 'urn:li:person:member-123',
      payload: preview.payload,
    });
    expect(ledgerState.reserveInputs).toEqual([{ idempotencyKey: 'idem-1', payloadHash: mutationHash }]);
    expect(ledgerState.completeInputs).toEqual([
      {
        idempotencyKey: 'idem-1',
        payloadHash: mutationHash,
        state: 'succeeded',
        result: { postUrn: 'urn:li:share:123' },
      },
    ]);
  });

  it('verifies a persisted success only with trusted read access and an eligible granted scope', async () => {
    const events: string[] = [];
    const authState = fakeAuth({ scopes: ['w_member_social', 'r_member_social'] });
    const approvalState = approval('member-123', events);
    const ledgerState = fakeLedger({ events });
    const postsState = fakePosts({ events });
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
      memberPostReadEnabled: true,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).resolves.toEqual({
      state: 'succeeded',
      provider: 'OFFICIAL_API',
      postUrn: 'urn:li:share:123',
      replay: false,
      verification: { state: 'verified' },
    });
    expect(events).toEqual(['approval', 'reserve', 'post', 'complete', 'get']);
    expect(postsState.readCalls).toEqual([
      { accessToken: 'access-token-secret', postUrn: 'urn:li:share:123' },
    ]);
  });

  it('keeps read verification disabled by default even when r_member_social is granted', async () => {
    const approvalState = approval();
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: fakeAuth({ scopes: ['w_member_social', 'r_member_social'] }).auth,
      approvals: approvalState.approvals,
      ledger: fakeLedger().ledger,
      posts: postsState.posts,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).resolves.toMatchObject({
      state: 'succeeded',
      verification: { state: 'created_unverified', reason: 'read_permission_unavailable' },
    });
    expect(postsState.calls).toHaveLength(1);
    expect(postsState.readCalls).toHaveLength(0);
  });

  it.each([
    ['disabled trusted capability', false, ['w_member_social', 'r_member_social']],
    ['missing granted read scope', true, ['w_member_social', 'openid', 'profile']],
  ])('does not read on %s', async (_name, memberPostReadEnabled, scopes) => {
    const approvalState = approval();
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: fakeAuth({ scopes }).auth,
      approvals: approvalState.approvals,
      ledger: fakeLedger().ledger,
      posts: postsState.posts,
      memberPostReadEnabled,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).resolves.toMatchObject({
      state: 'succeeded',
      verification: { state: 'created_unverified', reason: 'read_permission_unavailable' },
    });
    expect(postsState.calls).toHaveLength(1);
    expect(postsState.readCalls).toHaveLength(0);
  });

  it.each([
    ['post URN', { postUrn: 'urn:li:ugcPost:999' }],
    ['author', { author: 'urn:li:person:other' }],
    ['commentary', { commentary: 'Ship safely ' }],
    ['lifecycle', { lifecycleState: 'DRAFT' }],
  ])('keeps creation successful when read %s mismatches', async (_name, override) => {
    const approvalState = approval();
    const postsState = fakePosts({
      readResult: {
        postUrn: 'urn:li:share:123',
        author: 'urn:li:person:member-123',
        commentary: 'Ship safely',
        lifecycleState: 'PUBLISHED',
        ...override,
      },
    });
    const service = createTextPostService({
      auth: fakeAuth({ scopes: ['w_member_social', 'r_member_social'] }).auth,
      approvals: approvalState.approvals,
      ledger: fakeLedger().ledger,
      posts: postsState.posts,
      memberPostReadEnabled: true,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).resolves.toMatchObject({
      state: 'succeeded',
      verification: { state: 'verification_failed', reason: 'post_mismatch' },
    });
    expect(postsState.calls).toHaveLength(1);
    expect(postsState.readCalls).toHaveLength(1);
  });

  it.each([
    [401, 'reauthentication_required', { state: 'verification_failed', reason: 'reauth_required' }],
    [403, 'permission_required', { state: 'created_unverified', reason: 'read_permission_unavailable' }],
    [404, 'not_found', { state: 'verification_failed', reason: 'read_not_found' }],
    [429, 'rate_limited', { state: 'verification_failed', reason: 'rate_limited' }],
    [500, 'provider_failure', { state: 'verification_failed', reason: 'provider_failure' }],
  ] as const)('keeps creation succeeded after GET %i', async (_status, errorKind, verification) => {
    const approvalState = approval();
    const ledgerState = fakeLedger();
    const postsState = fakePosts({ readError: new LinkedInPostsError(errorKind) });
    const authState = fakeAuth({ scopes: ['w_member_social', 'r_member_social'] });
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
      memberPostReadEnabled: true,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).resolves.toMatchObject({
      state: 'succeeded',
      verification,
    });
    expect(postsState.calls).toHaveLength(1);
    expect(postsState.readCalls).toHaveLength(1);
    expect(ledgerState.completeInputs).toHaveLength(1);
    if (errorKind === 'reauthentication_required') expect(authState.markCount()).toBe(1);
  });

  it.each([
    [new LinkedInPostsError('malformed_response'), 'malformed_response'],
    [new Error('private provider body Ship safely access-token-secret'), 'provider_failure'],
  ] as const)('keeps the durable success unchanged after GET failure %s', async (readError, reason) => {
    const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-read-failure-'));
    const filePath = join(root, 'idempotency.json');
    try {
      const approvalState = approval();
      const ledger = createFileIdempotencyLedger({ filePath });
      const basePosts = fakePosts({ readError });
      let persistedBeforeRead = '';
      const posts: LinkedInPostsAdapter = {
        createTextPost: (input) => basePosts.posts.createTextPost(input),
        async getTextPost(input) {
          persistedBeforeRead = await readFile(filePath, 'utf8');
          return basePosts.posts.getTextPost(input);
        },
      };
      const service = createTextPostService({
        auth: fakeAuth({ scopes: ['w_member_social', 'r_member_social'] }).auth,
        approvals: approvalState.approvals,
        ledger,
        posts,
        memberPostReadEnabled: true,
      });

      const result = await service.publish(publishInput(approvalState.receiptId));
      const persistedAfter = await readFile(filePath, 'utf8');
      const persisted = JSON.parse(persistedAfter) as { records: Array<{ state: string; result: unknown }> };

      expect(result).toEqual({
        state: 'succeeded',
        provider: 'OFFICIAL_API',
        postUrn: 'urn:li:share:123',
        replay: false,
        verification: { state: 'verification_failed', reason },
      });
      expect(persisted.records).toHaveLength(1);
      expect(persisted.records[0]).toMatchObject({
        state: 'succeeded',
        result: { postUrn: 'urn:li:share:123' },
      });
      expect(persistedBeforeRead).toBe(persistedAfter);
      expect(persistedAfter).not.toContain('verification');
      expect(persistedAfter).not.toContain('private provider body');
      expect(JSON.stringify(result)).not.toContain('Ship safely');
      expect(JSON.stringify(result)).not.toContain('access-token-secret');
      expect(basePosts.calls).toHaveLength(1);
      expect(basePosts.readCalls).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps creation success when GET 401 credential cleanup rejects', async () => {
    const approvalState = approval();
    const authState = fakeAuth({
      scopes: ['w_member_social', 'r_member_social'],
      markError: new Error('private credential storage detail'),
    });
    const postsState = fakePosts({ readError: new LinkedInPostsError('reauthentication_required') });
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: fakeLedger().ledger,
      posts: postsState.posts,
      memberPostReadEnabled: true,
    });

    const result = await service.publish(publishInput(approvalState.receiptId));
    expect(result).toMatchObject({
      state: 'succeeded',
      verification: { state: 'verification_failed', reason: 'reauth_required' },
    });
    expect(JSON.stringify(result)).not.toContain('private credential storage detail');
    expect(authState.markCount()).toBe(1);
    expect(postsState.calls).toHaveLength(1);
  });

  it('does not invalidate a replacement credential when a delayed GET 401 arrives', async () => {
    let readStarted!: () => void;
    const readStartedPromise = new Promise<void>((resolve) => {
      readStarted = resolve;
    });
    let rejectRead!: (error: Error) => void;
    const read = new Promise<LinkedInPostReadResult>((_resolve, reject) => {
      rejectRead = reject;
    });
    let currentToken = 'original-token';
    const invalidations: Array<{ accessToken: string; subject: string } | undefined> = [];
    const auth = {
      getProviderContext() {
        return Promise.resolve({
          accessToken: 'original-token',
          subject: 'member-123',
          scopes: ['w_member_social', 'r_member_social'],
        });
      },
      markReauthRequired(expected?: { accessToken: string; subject: string }) {
        invalidations.push(expected);
        if (expected?.accessToken === currentToken && expected.subject === 'member-123') {
          currentToken = 'cleared';
        }
        return Promise.resolve();
      },
    } as unknown as AuthService;
    const approvalState = approval();
    const basePosts = fakePosts();
    const posts: LinkedInPostsAdapter = {
      createTextPost: (input) => basePosts.posts.createTextPost(input),
      getTextPost(input) {
        readStarted();
        expect(input.accessToken).toBe('original-token');
        return read;
      },
    };
    const service = createTextPostService({
      auth,
      approvals: approvalState.approvals,
      ledger: fakeLedger().ledger,
      posts,
      memberPostReadEnabled: true,
    });

    const pending = service.publish(publishInput(approvalState.receiptId));
    await readStartedPromise;
    currentToken = 'replacement-token';
    rejectRead(new LinkedInPostsError('reauthentication_required'));
    await expect(pending).resolves.toMatchObject({
      state: 'succeeded',
      verification: { state: 'verification_failed', reason: 'reauth_required' },
    });
    expect(invalidations).toEqual([{ accessToken: 'original-token', subject: 'member-123' }]);
    expect(currentToken).toBe('replacement-token');
  });

  it('keeps a successful replay GET-only and returns fresh verification metadata', async () => {
    const approvalState = approval();
    const ledgerState = fakeLedger({
      reserveResult: {
        status: 'replay',
        record: mutationRecord('succeeded', { postUrn: 'urn:li:share:456' }),
      },
    });
    const postsState = fakePosts({ postUrn: 'urn:li:share:456' });
    const service = createTextPostService({
      auth: fakeAuth({ scopes: ['w_member_social', 'r_member_social'] }).auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
      memberPostReadEnabled: true,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).resolves.toMatchObject({
      postUrn: 'urn:li:share:456',
      replay: true,
      verification: { state: 'verified' },
    });
    expect(postsState.calls).toHaveLength(0);
    expect(postsState.readCalls).toHaveLength(1);
    expect(ledgerState.completeInputs).toHaveLength(0);
  });

  it('computes fresh verification for each persisted replay as read outcomes and scopes change', async () => {
    const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-replay-verification-'));
    const filePath = join(root, 'idempotency.json');
    try {
      const ledger = createFileIdempotencyLedger({ filePath });
      let completeCount = 0;
      const countedLedger: IdempotencyLedger = {
        reserve: (input) => ledger.reserve(input),
        complete(input) {
          completeCount += 1;
          return ledger.complete(input);
        },
      };
      let scopes = ['w_member_social', 'r_member_social'];
      const auth = {
        getProviderContext: () =>
          Promise.resolve({ accessToken: 'access-token-secret', subject: 'member-123', scopes: [...scopes] }),
        markReauthRequired: () => Promise.resolve(),
      } as unknown as AuthService;
      let getCount = 0;
      let postCount = 0;
      let receiptSequence = 0;
      const approvals = createApprovalService({ randomId: () => `replay-approval-${receiptSequence++}` });
      const posts: LinkedInPostsAdapter = {
        createTextPost() {
          postCount += 1;
          return Promise.resolve({ postUrn: 'urn:li:share:123' });
        },
        getTextPost() {
          getCount += 1;
          if (getCount === 1) return Promise.reject(new LinkedInPostsError('not_found'));
          if (getCount === 2) {
            return Promise.resolve({
              postUrn: 'urn:li:share:123',
              author: 'urn:li:person:member-123',
              commentary: 'Ship safely',
              lifecycleState: 'PUBLISHED',
            });
          }
          return Promise.resolve({
            postUrn: 'urn:li:share:123',
            author: 'urn:li:person:member-123',
            commentary: 'Ship safely ',
            lifecycleState: 'PUBLISHED',
          });
        },
      };
      const service = createTextPostService({
        auth,
        approvals,
        ledger: countedLedger,
        posts,
        memberPostReadEnabled: true,
      });
      const publishWithFreshApproval = () => {
        const receipt = approvals.issue({ payloadHash: preview.payloadHash, subject: 'member-123' });
        return service.publish(publishInput(receipt.receiptId));
      };

      await expect(publishWithFreshApproval()).resolves.toMatchObject({
        replay: false,
        verification: { state: 'verification_failed', reason: 'read_not_found' },
      });
      expect(completeCount).toBe(1);
      const persistedBeforeReplays = await readFile(filePath, 'utf8');

      await expect(publishWithFreshApproval()).resolves.toMatchObject({
        replay: true,
        verification: { state: 'verified' },
      });
      scopes = ['w_member_social'];
      await expect(publishWithFreshApproval()).resolves.toMatchObject({
        replay: true,
        verification: { state: 'created_unverified', reason: 'read_permission_unavailable' },
      });
      scopes = ['w_member_social', 'r_member_social'];
      await expect(publishWithFreshApproval()).resolves.toMatchObject({
        replay: true,
        verification: { state: 'verification_failed', reason: 'post_mismatch' },
      });

      expect(postCount).toBe(1);
      expect(getCount).toBe(3);
      expect(completeCount).toBe(1);
      expect(await readFile(filePath, 'utf8')).toBe(persistedBeforeReplays);
      expect(persistedBeforeReplays).not.toContain('verification');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['not_configured', 'auth_unconfigured'],
    ['disconnected', 'not_connected'],
    ['reauth_required', 'reauth_required'],
    ['expired', 'reauth_required'],
    ['authorization_pending', 'not_connected'],
  ] as const)(
    'rejects auth state %s before approval, reservation, or provider mutation',
    async (authKind, expected) => {
      const authState = fakeAuth({ contextError: new AuthServiceError(authKind, false) });
      const events: string[] = [];
      const approvalState = approval('member-123', events);
      const ledgerState = fakeLedger();
      const postsState = fakePosts({ events });
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
      expect(events).toEqual([]);
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

  it('rejects a changed but canonical payload against the approved preview', async () => {
    const authState = fakeAuth();
    const approvalState = approval();
    const changed = createTextPostPreview({ text: 'A different approved body' });
    const receipt = approvalState.approvals.issue({
      payloadHash: changed.payloadHash,
      subject: 'member-123',
    });
    const ledgerState = fakeLedger();
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });

    await expect(service.publish(publishInput(receipt.receiptId))).rejects.toMatchObject({
      kind: 'approval_mismatch',
      retryable: false,
    });
    expect(ledgerState.reserveInputs).toHaveLength(0);
    expect(postsState.calls).toHaveLength(0);
  });

  it('rejects an expired approval before reservation or provider mutation', async () => {
    let now = NOW;
    const authState = fakeAuth();
    const approvalState = approval('member-123', undefined, () => now);
    const ledgerState = fakeLedger();
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });
    now = new Date(NOW.getTime() + 6 * 60_000);

    await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
      kind: 'approval_expired',
      retryable: false,
    });
    expect(ledgerState.reserveInputs).toHaveLength(0);
    expect(postsState.calls).toHaveLength(0);
  });

  it('rejects an unknown approval before reservation or provider mutation', async () => {
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

    await expect(service.publish(publishInput('unknown-receipt'))).rejects.toMatchObject({
      kind: 'approval_not_found',
      retryable: false,
    });
    expect(ledgerState.reserveInputs).toHaveLength(0);
    expect(postsState.calls).toHaveLength(0);
  });

  it('rejects a receipt reused under another raw key before reserving or posting', async () => {
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

    await service.publish(publishInput(approvalState.receiptId));
    await expect(
      service.publish(publishInput(approvalState.receiptId, preview.payload, 'different-raw-key')),
    ).rejects.toMatchObject({ kind: 'approval_consumed', retryable: false });
    expect(ledgerState.reserveInputs).toHaveLength(1);
    expect(postsState.calls).toHaveLength(1);
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

  it('rejects unknown nested payload fields and blank keys before authentication', async () => {
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
    const malformed = {
      ...preview.payload,
      distribution: { ...preview.payload.distribution, targetEntities: ['urn:li:organization:1'] },
    } as unknown as TextPostPayload;

    await expect(service.publish(publishInput(approvalState.receiptId, malformed))).rejects.toMatchObject({
      kind: 'invalid_payload',
      retryable: false,
    });
    await expect(
      service.publish({ ...publishInput(approvalState.receiptId), idempotencyKey: '  ' }),
    ).rejects.toMatchObject({ kind: 'invalid_payload', retryable: false });
    expect(authState.contextCount()).toBe(0);
    expect(ledgerState.reserveInputs).toHaveLength(0);
    expect(postsState.calls).toHaveLength(0);
  });

  it.each([
    ['capability flag', { memberPostReadEnabled: true }],
    ['scope grant', { scopes: ['w_member_social', 'r_member_social'] }],
  ])('does not accept caller-supplied %s to enable read access', async (_name, hint) => {
    const authState = fakeAuth({ scopes: ['w_member_social'] });
    const approvalState = approval();
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: fakeLedger().ledger,
      posts: postsState.posts,
      memberPostReadEnabled: true,
    });
    const callerInput = { ...publishInput(approvalState.receiptId), ...hint };

    await expect(
      service.publish(callerInput as unknown as Parameters<typeof service.publish>[0]),
    ).rejects.toMatchObject({ kind: 'invalid_payload', retryable: false });
    expect(authState.contextCount()).toBe(0);
    expect(postsState.calls).toHaveLength(0);
    expect(postsState.readCalls).toHaveLength(0);
  });

  it('uses an owned payload snapshot if the caller mutates input while authentication is pending', async () => {
    let releaseAuth!: () => void;
    const authGate = new Promise<void>((resolve) => {
      releaseAuth = resolve;
    });
    const auth = {
      async getProviderContext() {
        await authGate;
        return {
          accessToken: 'access-token-secret',
          subject: 'member-123',
          scopes: ['openid', 'profile', 'w_member_social', 'r_member_social'],
        };
      },
      async markReauthRequired() {},
    } as unknown as AuthService;
    const approvalState = approval();
    const ledgerState = fakeLedger();
    const postsState = fakePosts();
    const service = createTextPostService({
      auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
      memberPostReadEnabled: true,
    });
    const callerPayload = structuredClone(preview.payload);
    const pending = service.publish(publishInput(approvalState.receiptId, callerPayload));
    callerPayload.commentary = 'mutated after publish started';
    releaseAuth();

    await expect(pending).resolves.toMatchObject({
      state: 'succeeded',
      replay: false,
      verification: { state: 'verified' },
    });
    expect(postsState.calls[0]?.payload).toEqual(preview.payload);
    expect(postsState.readCalls).toEqual([
      { accessToken: 'access-token-secret', postUrn: 'urn:li:share:123' },
    ]);
    expect(ledgerState.reserveInputs[0]?.payloadHash).toBe(mutationHash);
  });

  it('replays a persisted success without a second provider POST', async () => {
    const authState = fakeAuth();
    const approvalState = approval();
    const ledgerState = fakeLedger({
      reserveResult: {
        status: 'replay',
        record: mutationRecord('succeeded', { postUrn: 'urn:li:share:456' }),
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
      postUrn: 'urn:li:share:456',
      replay: true,
      verification: { state: 'created_unverified', reason: 'read_permission_unavailable' },
    });
    expect(postsState.calls).toHaveLength(0);
    expect(ledgerState.completeInputs).toHaveLength(0);
  });

  it('rejects a malformed provider result as persisted non-retryable outcome-unknown', async () => {
    const authState = fakeAuth();
    const approvalState = approval();
    const ledgerState = fakeLedger();
    const postsState = fakePosts({ postUrn: 'urn:li:share:123 456' });
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
    expect(ledgerState.completeInputs[0]).toMatchObject({
      state: 'outcome_unknown',
      result: { errorCode: 'outcome_unknown' },
    });
  });

  it.each([
    ['generic provider failure', new LinkedInPostsError('provider_failure')],
    ['malformed provider success', new LinkedInPostsError('malformed_success')],
    ['unexpected provider exception', new Error('private provider and access-token-secret detail')],
  ] as const)('persists %s as sanitized non-retryable outcome-unknown', async (_label, providerError) => {
    const authState = fakeAuth();
    const approvalState = approval();
    const ledgerState = fakeLedger();
    const postsState = fakePosts({ error: providerError });
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });

    let caught: unknown;
    try {
      await service.publish(publishInput(approvalState.receiptId));
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TextPostServiceError);
    expect(caught).toMatchObject({ kind: 'outcome_unknown', retryable: false });
    expect((caught as Error).message).not.toContain('private provider');
    expect((caught as Error).message).not.toContain('access-token-secret');
    expect(ledgerState.completeInputs[0]).toMatchObject({
      state: 'outcome_unknown',
      result: { errorCode: 'outcome_unknown' },
    });
  });

  it('rejects a malformed authoritative successful completion', async () => {
    const approvalState = approval();
    const ledgerState = fakeLedger({
      completeResult: mutationRecord('succeeded', { postUrn: 'urn:li:share:123 456' }),
    });
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: fakeAuth({ scopes: ['w_member_social', 'r_member_social'] }).auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
      memberPostReadEnabled: true,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
      kind: 'outcome_unknown',
      retryable: false,
    });
    expect(postsState.calls).toHaveLength(1);
    expect(postsState.readCalls).toHaveLength(0);
  });

  it.each([
    ['outcome_unknown', { errorCode: 'outcome_unknown' }, 'outcome_unknown'],
    ['failed_terminal', { errorCode: 'permission_required' }, 'permission_required'],
  ] as const)('does not GET when authoritative completion returns %s', async (state, result, errorKind) => {
    const approvalState = approval();
    const ledgerState = fakeLedger({ completeResult: mutationRecord(state, result) });
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: fakeAuth({ scopes: ['w_member_social', 'r_member_social'] }).auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
      memberPostReadEnabled: true,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
      kind: errorKind,
      retryable: false,
    });
    expect(postsState.calls).toHaveLength(1);
    expect(postsState.readCalls).toHaveLength(0);
    expect(ledgerState.completeInputs).toHaveLength(1);
    expect(ledgerState.completeInputs[0]?.state).toBe('succeeded');
  });

  it('rejects a malformed persisted success replay without POST or completion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-malformed-persisted-post-'));
    const filePath = join(root, 'idempotency.json');
    try {
      const fileLedger = createFileIdempotencyLedger({ filePath });
      await fileLedger.reserve({ idempotencyKey: 'idem-1', payloadHash: mutationHash });
      await fileLedger.complete({
        idempotencyKey: 'idem-1',
        payloadHash: mutationHash,
        state: 'succeeded',
        result: { postUrn: 'urn:li:share:123 456' },
      });
      const persistedBeforeReplay = await readFile(filePath, 'utf8');
      let reserveCount = 0;
      let completeCount = 0;
      const ledger: IdempotencyLedger = {
        reserve(input) {
          reserveCount += 1;
          return fileLedger.reserve(input);
        },
        complete(input) {
          completeCount += 1;
          return fileLedger.complete(input);
        },
      };
      const approvalState = approval();
      const postsState = fakePosts();
      const service = createTextPostService({
        auth: fakeAuth({ scopes: ['w_member_social', 'r_member_social'] }).auth,
        approvals: approvalState.approvals,
        ledger,
        posts: postsState.posts,
        memberPostReadEnabled: true,
      });

      await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
        kind: 'outcome_unknown',
        retryable: false,
      });
      expect(reserveCount).toBe(1);
      expect(completeCount).toBe(0);
      expect(postsState.calls).toHaveLength(0);
      expect(postsState.readCalls).toHaveLength(0);
      expect(await readFile(filePath, 'utf8')).toBe(persistedBeforeReplay);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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

  it('binds a global raw key to the authenticated member in the persisted mutation fingerprint', async () => {
    const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-member-bound-'));
    try {
      const ledger = createFileIdempotencyLedger({ filePath: join(root, 'idempotency.json') });
      const firstApproval = approval('member-123');
      const firstPosts = fakePosts();
      const first = createTextPostService({
        auth: fakeAuth({ subject: 'member-123', scopes: ['w_member_social', 'r_member_social'] }).auth,
        approvals: firstApproval.approvals,
        ledger,
        posts: firstPosts.posts,
        memberPostReadEnabled: true,
      });
      await first.publish(publishInput(firstApproval.receiptId));

      const secondApproval = approval('member-456');
      const secondPosts = fakePosts();
      const second = createTextPostService({
        auth: fakeAuth({ subject: 'member-456', scopes: ['w_member_social', 'r_member_social'] }).auth,
        approvals: secondApproval.approvals,
        ledger,
        posts: secondPosts.posts,
        memberPostReadEnabled: true,
      });
      await expect(second.publish(publishInput(secondApproval.receiptId))).rejects.toMatchObject({
        kind: 'idempotency_conflict',
        retryable: false,
      });
      expect(firstPosts.calls).toHaveLength(1);
      expect(firstPosts.readCalls).toHaveLength(1);
      expect(secondPosts.calls).toHaveLength(0);
      expect(secondPosts.readCalls).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails closed on an author-independent legacy preview-hash record', async () => {
    const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-legacy-key-'));
    try {
      const ledger = createFileIdempotencyLedger({ filePath: join(root, 'idempotency.json') });
      await ledger.reserve({ idempotencyKey: 'idem-1', payloadHash: preview.payloadHash });
      const approvalState = approval();
      const postsState = fakePosts();
      const service = createTextPostService({
        auth: fakeAuth().auth,
        approvals: approvalState.approvals,
        ledger,
        posts: postsState.posts,
      });

      await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
        kind: 'idempotency_conflict',
        retryable: false,
      });
      expect(postsState.calls).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    { ledgerState: 'succeeded', providerError: undefined, replayError: undefined },
    {
      ledgerState: 'failed_terminal',
      providerError: new LinkedInPostsError('permission_required'),
      replayError: 'permission_required',
    },
    {
      ledgerState: 'outcome_unknown',
      providerError: new Error('private provider failure detail'),
      replayError: 'outcome_unknown',
    },
  ] as const)(
    'requires fresh approval after restart before replaying persisted $ledgerState without another POST',
    async ({ ledgerState, providerError, replayError }) => {
      const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-restart-replay-'));
      const filePath = join(root, 'idempotency.json');
      try {
        const initialLedger = createFileIdempotencyLedger({ filePath });
        const initialApproval = approval();
        const initialPosts = fakePosts(providerError === undefined ? {} : { error: providerError });
        const initialService = createTextPostService({
          auth: fakeAuth({ scopes: ['w_member_social', 'r_member_social'] }).auth,
          approvals: initialApproval.approvals,
          ledger: initialLedger,
          posts: initialPosts.posts,
          memberPostReadEnabled: true,
        });
        if (ledgerState === 'succeeded') {
          await expect(
            initialService.publish(publishInput(initialApproval.receiptId)),
          ).resolves.toMatchObject({
            verification: { state: 'verified' },
          });
        } else {
          await expect(initialService.publish(publishInput(initialApproval.receiptId))).rejects.toMatchObject(
            {
              kind: replayError,
              retryable: false,
            },
          );
        }
        expect(initialPosts.calls).toHaveLength(1);
        expect(initialPosts.readCalls).toHaveLength(ledgerState === 'succeeded' ? 1 : 0);

        const restartedFileLedger = createFileIdempotencyLedger({ filePath });
        let reserveCount = 0;
        let completeCount = 0;
        const restartedLedger: IdempotencyLedger = {
          reserve(input) {
            reserveCount += 1;
            return restartedFileLedger.reserve(input);
          },
          complete(input) {
            completeCount += 1;
            return restartedFileLedger.complete(input);
          },
        };
        const noApprovalPosts = fakePosts();
        const noApprovalService = createTextPostService({
          auth: fakeAuth().auth,
          approvals: createApprovalService({ randomId: () => 'empty-restart-approvals' }),
          ledger: restartedLedger,
          posts: noApprovalPosts.posts,
        });
        await expect(noApprovalService.publish(publishInput('missing-after-restart'))).rejects.toMatchObject({
          kind: 'approval_not_found',
          retryable: false,
        });
        expect(reserveCount).toBe(0);

        const freshApproval = approval();
        const replayPosts = fakePosts();
        const replayService = createTextPostService({
          auth: fakeAuth({ scopes: ['w_member_social', 'r_member_social'] }).auth,
          approvals: freshApproval.approvals,
          ledger: restartedLedger,
          posts: replayPosts.posts,
          memberPostReadEnabled: true,
        });
        if (ledgerState === 'succeeded') {
          await expect(replayService.publish(publishInput(freshApproval.receiptId))).resolves.toMatchObject({
            state: 'succeeded',
            replay: true,
            verification: { state: 'verified' },
          });
        } else {
          await expect(replayService.publish(publishInput(freshApproval.receiptId))).rejects.toMatchObject({
            kind: replayError,
            retryable: false,
          });
        }
        expect(reserveCount).toBe(1);
        expect(completeCount).toBe(0);
        expect(replayPosts.calls).toHaveLength(0);
        expect(replayPosts.readCalls).toHaveLength(ledgerState === 'succeeded' ? 1 : 0);
        expect(initialPosts.readCalls).toHaveLength(ledgerState === 'succeeded' ? 1 : 0);
        const stored = JSON.parse(await readFile(filePath, 'utf8')) as {
          records: Array<{ state: string }>;
        };
        expect(stored.records[0]?.state).toBe(ledgerState);
        expect(await readFile(filePath, 'utf8')).not.toContain('verification');
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it('serializes concurrent services that share a ledger and returns the persisted replay', async () => {
    const root = await mkdtemp(join(tmpdir(), 'linkedin-mcp-shared-ledger-'));
    let startProvider!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      startProvider = resolve;
    });
    let releaseProvider!: () => void;
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    let providerCalls = 0;
    try {
      const ledger = createFileIdempotencyLedger({ filePath: join(root, 'idempotency.json') });
      const approvalState = approval();
      const auth = fakeAuth().auth;
      const posts: LinkedInPostsAdapter = {
        async createTextPost() {
          providerCalls += 1;
          startProvider();
          await providerGate;
          return { postUrn: 'urn:li:share:789' };
        },
        getTextPost() {
          return Promise.resolve({
            postUrn: 'urn:li:share:789',
            author: 'urn:li:person:member-123',
            commentary: 'Ship safely',
            lifecycleState: 'PUBLISHED',
          });
        },
      };
      const first = createTextPostService({ auth, approvals: approvalState.approvals, ledger, posts });
      const second = createTextPostService({ auth, approvals: approvalState.approvals, ledger, posts });
      const firstResult = first.publish(publishInput(approvalState.receiptId));
      const secondResult = second.publish(publishInput(approvalState.receiptId));
      await providerStarted;
      releaseProvider();

      await expect(Promise.all([firstResult, secondResult])).resolves.toEqual([
        {
          state: 'succeeded',
          provider: 'OFFICIAL_API',
          postUrn: 'urn:li:share:789',
          replay: false,
          verification: { state: 'created_unverified', reason: 'read_permission_unavailable' },
        },
        {
          state: 'succeeded',
          provider: 'OFFICIAL_API',
          postUrn: 'urn:li:share:789',
          replay: true,
          verification: { state: 'created_unverified', reason: 'read_permission_unavailable' },
        },
      ]);
      expect(providerCalls).toBe(1);
    } finally {
      releaseProvider?.();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not let a consumed receipt start a new reservation after the first reserve failed and expired', async () => {
    let now = NOW;
    const baseApprovals = createApprovalService({
      now: () => now,
      randomId: () => 'consumed-receipt',
    });
    const receipt = baseApprovals.issue({ payloadHash: preview.payloadHash, subject: 'member-123' });
    let reserveCalls = 0;
    const ledger: IdempotencyLedger = {
      reserve(input) {
        reserveCalls += 1;
        if (reserveCalls === 1) return Promise.reject(new IdempotencyLedgerError('write_failed'));
        return Promise.resolve({
          status: 'reserved',
          record: {
            ...mutationRecord('reserved'),
            idempotencyKey: input.idempotencyKey,
            payloadHash: input.payloadHash,
          },
        });
      },
      complete(input) {
        return Promise.resolve(mutationRecord(input.state, input.result));
      },
    };
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: fakeAuth().auth,
      approvals: baseApprovals,
      ledger,
      posts: postsState.posts,
    });
    const input = publishInput(receipt.receiptId);

    await expect(service.publish(input)).rejects.toMatchObject({ kind: 'storage_failure' });
    now = new Date(NOW.getTime() + 6 * 60_000);
    await expect(service.publish(input)).rejects.toMatchObject({
      kind: 'approval_consumed',
      retryable: false,
    });
    expect(reserveCalls).toBe(2);
    expect(postsState.calls).toHaveLength(0);
    expect(postsState.readCalls).toHaveLength(0);
  });

  it('converts a replayed reserved record to durable outcome_unknown without another POST', async () => {
    const approvalState = approval();
    const ledgerState = fakeLedger({
      reserveResult: { status: 'replay', record: mutationRecord('reserved') },
    });
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: fakeAuth({ scopes: ['w_member_social', 'r_member_social'] }).auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
      memberPostReadEnabled: true,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
      kind: 'outcome_unknown',
      retryable: false,
    });
    expect(postsState.calls).toHaveLength(0);
    expect(postsState.readCalls).toHaveLength(0);
    expect(ledgerState.completeInputs).toEqual([
      {
        idempotencyKey: 'idem-1',
        payloadHash: mutationHash,
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

  it('still attempts 401 auth invalidation when terminal persistence fails and sanitizes cleanup errors', async () => {
    const authState = fakeAuth({ markError: new Error('credential token cleanup secret') });
    const approvalState = approval();
    const ledgerState = fakeLedger({ completeError: new IdempotencyLedgerError('write_failed') });
    const postsState = fakePosts({ error: new LinkedInPostsError('reauthentication_required') });
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });

    let caught: unknown;
    try {
      await service.publish(publishInput(approvalState.receiptId));
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toMatchObject({ kind: 'outcome_unknown', retryable: false });
    expect((caught as Error).message).not.toContain('credential token cleanup secret');
    expect(authState.markCount()).toBe(1);
  });

  it('treats failure to persist a known provider success as non-retryable outcome_unknown', async () => {
    const approvalState = approval();
    const ledgerState = fakeLedger({ completeError: new IdempotencyLedgerError('write_failed') });
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: fakeAuth({ scopes: ['w_member_social', 'r_member_social'] }).auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
      memberPostReadEnabled: true,
    });

    await expect(service.publish(publishInput(approvalState.receiptId))).rejects.toMatchObject({
      kind: 'outcome_unknown',
      retryable: false,
    });
    expect(postsState.calls).toHaveLength(1);
    expect(postsState.readCalls).toHaveLength(0);
  });

  it('keeps an unknown provider outcome sanitized when persisting unknown also fails', async () => {
    const authState = fakeAuth();
    const approvalState = approval();
    const backing = fakeLedger();
    const completionAttempts: CompleteMutationInput[] = [];
    const ledger: IdempotencyLedger = {
      reserve: (input) => backing.ledger.reserve(input),
      complete(input) {
        completionAttempts.push(input);
        return Promise.reject(new Error('private unknown persistence sentinel'));
      },
    };
    const postsState = fakePosts({
      error: new Error('private provider failure access-token-secret'),
    });
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger,
      posts: postsState.posts,
    });

    let caught: unknown;
    try {
      await service.publish(publishInput(approvalState.receiptId));
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toMatchObject({ kind: 'outcome_unknown', retryable: false });
    expect((caught as Error).message).not.toContain('private unknown persistence sentinel');
    expect((caught as Error).message).not.toContain('private provider failure');
    expect((caught as Error).message).not.toContain('access-token-secret');
    expect(completionAttempts).toHaveLength(1);
    expect(completionAttempts[0]).toMatchObject({
      state: 'outcome_unknown',
      result: { errorCode: 'outcome_unknown' },
    });
    expect(postsState.calls).toHaveLength(1);
  });

  it('does not report success when completion returns an authoritative unknown record', async () => {
    const authState = fakeAuth();
    const approvalState = approval();
    const ledgerState = fakeLedger({
      completeResult: mutationRecord('outcome_unknown', { errorCode: 'provider_failure' }),
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
    expect(postsState.calls).toHaveLength(1);
  });

  it('honors an authoritative failed completion after a provider success', async () => {
    const authState = fakeAuth();
    const approvalState = approval();
    const ledgerState = fakeLedger({
      completeResult: mutationRecord('failed_terminal', { errorCode: 'permission_required' }),
    });
    const postsState = fakePosts();
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
    expect(postsState.calls).toHaveLength(1);
  });

  it('treats arbitrary persisted terminal codes as unknown sanitized failures', async () => {
    const authState = fakeAuth();
    const approvalState = approval();
    const ledgerState = fakeLedger({
      reserveResult: {
        status: 'replay',
        record: mutationRecord('failed_terminal', {
          errorCode: 'provider-private-detail access-token-secret',
        }),
      },
    });
    const postsState = fakePosts();
    const service = createTextPostService({
      auth: authState.auth,
      approvals: approvalState.approvals,
      ledger: ledgerState.ledger,
      posts: postsState.posts,
    });

    let caught: unknown;
    try {
      await service.publish(publishInput(approvalState.receiptId));
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toMatchObject({ kind: 'outcome_unknown', retryable: false });
    expect((caught as Error).message).not.toContain('provider-private-detail');
    expect((caught as Error).message).not.toContain('access-token-secret');
    expect(postsState.calls).toHaveLength(0);
    expect(ledgerState.completeInputs).toHaveLength(0);
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

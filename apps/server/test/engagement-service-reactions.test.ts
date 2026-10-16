import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createEngagementService } from '../src/engagement/engagement-service.js';
import { LinkedInReactionsError } from '../src/engagement/linkedin-reactions.js';
import { createApprovalService } from '../src/publishing/approval-service.js';
import { createFileIdempotencyLedger } from '../src/publishing/idempotency-ledger.js';

const temporaryDirectories: string[] = [];

async function ledgerPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'linkedin-mcp-m04-reaction-'));
  temporaryDirectories.push(directory);
  return join(directory, 'idempotency.json');
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

const targetUrn = 'urn:li:activity:7067167295080394752';
const reactionUrn = 'urn:li:reaction:(urn:li:person:member-123,urn:li:activity:7067167295080394752)';
const addDraft = { targetUrn, reactionType: 'LIKE' } as const;
const removeDraft = { targetUrn } as const;

function successfulReaction() {
  return {
    id: reactionUrn,
    actorUrn: 'urn:li:person:member-123',
    rootUrn: targetUrn,
    reactionType: 'LIKE' as const,
    createdAt: '2026-10-16T13:00:00.000Z',
    lastModifiedAt: '2026-10-16T13:00:00.000Z',
  };
}

function authHarness(initialScopes: string[] = ['w_member_social_feed']) {
  let subject = 'member-123';
  let scopes = [...initialScopes];
  let reauthCalls = 0;
  return {
    auth: {
      getProviderContext: () =>
        Promise.resolve({ accessToken: 'access-token-secret', subject, scopes: [...scopes] }),
      markReauthRequired: () => {
        reauthCalls += 1;
        return Promise.resolve();
      },
    },
    setSubject(value: string) {
      subject = value;
    },
    setScopes(value: string[]) {
      scopes = [...value];
    },
    reauthCalls: () => reauthCalls,
  };
}

function approvalHarness() {
  let sequence = 0;
  return createApprovalService({ randomId: () => `reaction-receipt-${++sequence}` });
}

function commentsHarness() {
  return {
    createReply: () => Promise.reject(new Error('comments are outside this test')),
  };
}

describe('engagement service reactions', () => {
  it('previews add/remove canonically and binds approvals to member write scope', async () => {
    const auth = authHarness();
    const service = createEngagementService({
      auth: auth.auth,
      approvals: approvalHarness(),
      ledger: createFileIdempotencyLedger({ filePath: await ledgerPath() }),
      comments: commentsHarness(),
      reactions: {
        addReaction: () => Promise.resolve(successfulReaction()),
        removeReaction: () => Promise.resolve(),
      },
    });

    const addPreview = service.previewReactionAdd(addDraft);
    expect(addPreview).toMatchObject({
      payload: { operation: 'add', ...addDraft },
      provider: 'OFFICIAL_API',
      requiredScope: 'w_member_social_feed',
    });
    expect(addPreview.payloadHash).toMatch(/^[a-f0-9]{64}$/);

    const removePreview = service.previewReactionRemove(removeDraft);
    expect(removePreview).toMatchObject({
      payload: { operation: 'remove', ...removeDraft },
      provider: 'OFFICIAL_API',
      requiredScope: 'w_member_social_feed',
    });

    auth.setScopes([]);
    await expect(service.approveReactionAdd({ payloadHash: addPreview.payloadHash })).rejects.toMatchObject({
      kind: 'permission_required',
    });
    await expect(
      service.approveReactionRemove({ payloadHash: removePreview.payloadHash }),
    ).rejects.toMatchObject({ kind: 'permission_required' });
  });

  it('derives the actor and durably replays one successful reaction add', async () => {
    const filePath = await ledgerPath();
    const auth = authHarness();
    const approvals = approvalHarness();
    const providerCalls: unknown[] = [];
    const reactions = {
      addReaction: (input: unknown) => {
        providerCalls.push(input);
        return Promise.resolve(successfulReaction());
      },
      removeReaction: () => Promise.resolve(),
    };
    const first = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments: commentsHarness(),
      reactions,
    });
    const preview = first.previewReactionAdd(addDraft);
    const receipt = await first.approveReactionAdd({ payloadHash: preview.payloadHash });
    const input = {
      draft: addDraft,
      payloadHash: preview.payloadHash,
      approvalReceiptId: receipt.receiptId,
      idempotencyKey: 'reaction-add-key-success',
    };

    await expect(first.addReaction(input)).resolves.toEqual({
      state: 'succeeded',
      provider: 'OFFICIAL_API',
      targetUrn,
      reactionUrn,
      reactionType: 'LIKE',
      replay: false,
    });
    expect(providerCalls).toEqual([
      {
        accessToken: 'access-token-secret',
        actorUrn: 'urn:li:person:member-123',
        targetUrn,
        reactionType: 'LIKE',
      },
    ]);

    const restarted = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments: commentsHarness(),
      reactions,
    });
    await expect(restarted.addReaction(input)).resolves.toEqual({
      state: 'succeeded',
      provider: 'OFFICIAL_API',
      targetUrn,
      reactionUrn,
      reactionType: 'LIKE',
      replay: true,
    });
    expect(providerCalls).toHaveLength(1);
  });

  it('derives the actor and durably replays one successful reaction removal', async () => {
    const filePath = await ledgerPath();
    const auth = authHarness();
    const approvals = approvalHarness();
    const providerCalls: unknown[] = [];
    const reactions = {
      addReaction: () => Promise.resolve(successfulReaction()),
      removeReaction: (input: unknown) => {
        providerCalls.push(input);
        return Promise.resolve();
      },
    };
    const first = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments: commentsHarness(),
      reactions,
    });
    const preview = first.previewReactionRemove(removeDraft);
    const receipt = await first.approveReactionRemove({ payloadHash: preview.payloadHash });
    const input = {
      draft: removeDraft,
      payloadHash: preview.payloadHash,
      approvalReceiptId: receipt.receiptId,
      idempotencyKey: 'reaction-remove-key-success',
    };

    await expect(first.removeReaction(input)).resolves.toEqual({
      state: 'succeeded',
      provider: 'OFFICIAL_API',
      targetUrn,
      replay: false,
    });
    expect(providerCalls).toEqual([
      {
        accessToken: 'access-token-secret',
        actorUrn: 'urn:li:person:member-123',
        targetUrn,
      },
    ]);

    const restarted = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments: commentsHarness(),
      reactions,
    });
    await expect(restarted.removeReaction(input)).resolves.toEqual({
      state: 'succeeded',
      provider: 'OFFICIAL_API',
      targetUrn,
      replay: true,
    });
    expect(providerCalls).toHaveLength(1);
  });

  it('rejects approval replay under a different authenticated member before provider mutation', async () => {
    const auth = authHarness();
    let providerCalls = 0;
    const service = createEngagementService({
      auth: auth.auth,
      approvals: approvalHarness(),
      ledger: createFileIdempotencyLedger({ filePath: await ledgerPath() }),
      comments: commentsHarness(),
      reactions: {
        addReaction: () => {
          providerCalls += 1;
          return Promise.resolve(successfulReaction());
        },
        removeReaction: () => Promise.resolve(),
      },
    });
    const preview = service.previewReactionAdd(addDraft);
    const receipt = await service.approveReactionAdd({ payloadHash: preview.payloadHash });
    auth.setSubject('other-member');

    await expect(
      service.addReaction({
        draft: addDraft,
        payloadHash: preview.payloadHash,
        approvalReceiptId: receipt.receiptId,
        idempotencyKey: 'reaction-add-subject-bound',
      }),
    ).rejects.toMatchObject({ kind: 'approval_mismatch' });
    expect(providerCalls).toBe(0);
  });

  it.each([
    ['reauthentication_required', 'reauth_required'],
    ['permission_required', 'permission_required'],
    ['rate_limited', 'rate_limited'],
  ] as const)('persists known add failures terminally and never retries %s', async (providerKind, serviceKind) => {
    const filePath = await ledgerPath();
    const auth = authHarness();
    const approvals = approvalHarness();
    let providerCalls = 0;
    const reactions = {
      addReaction: () => {
        providerCalls += 1;
        return Promise.reject(new LinkedInReactionsError(providerKind));
      },
      removeReaction: () => Promise.resolve(),
    };
    const first = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments: commentsHarness(),
      reactions,
    });
    const preview = first.previewReactionAdd(addDraft);
    const receipt = await first.approveReactionAdd({ payloadHash: preview.payloadHash });
    const input = {
      draft: addDraft,
      payloadHash: preview.payloadHash,
      approvalReceiptId: receipt.receiptId,
      idempotencyKey: `reaction-add-${providerKind}`,
    };

    await expect(first.addReaction(input)).rejects.toMatchObject({ kind: serviceKind });
    const restarted = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments: commentsHarness(),
      reactions,
    });
    await expect(restarted.addReaction(input)).rejects.toMatchObject({ kind: serviceKind });
    expect(providerCalls).toBe(1);
    if (providerKind === 'reauthentication_required') expect(auth.reauthCalls()).toBe(1);
  });

  it.each(['add', 'remove'] as const)(
    'persists uncertain %s outcomes and never retries the remote mutation',
    async (operation) => {
      const filePath = await ledgerPath();
      const auth = authHarness();
      const approvals = approvalHarness();
      let providerCalls = 0;
      const reactions = {
        addReaction: () => {
          providerCalls += 1;
          return Promise.reject(new LinkedInReactionsError('outcome_unknown'));
        },
        removeReaction: () => {
          providerCalls += 1;
          return Promise.reject(new LinkedInReactionsError('outcome_unknown'));
        },
      };
      const first = createEngagementService({
        auth: auth.auth,
        approvals,
        ledger: createFileIdempotencyLedger({ filePath }),
        comments: commentsHarness(),
        reactions,
      });
      const preview =
        operation === 'add' ? first.previewReactionAdd(addDraft) : first.previewReactionRemove(removeDraft);
      const receipt =
        operation === 'add'
          ? await first.approveReactionAdd({ payloadHash: preview.payloadHash })
          : await first.approveReactionRemove({ payloadHash: preview.payloadHash });
      const input = {
        draft: operation === 'add' ? addDraft : removeDraft,
        payloadHash: preview.payloadHash,
        approvalReceiptId: receipt.receiptId,
        idempotencyKey: `reaction-${operation}-unknown`,
      };

      if (operation === 'add') {
        await expect(first.addReaction(input as never)).rejects.toMatchObject({ kind: 'outcome_unknown' });
      } else {
        await expect(first.removeReaction(input as never)).rejects.toMatchObject({ kind: 'outcome_unknown' });
      }

      const restarted = createEngagementService({
        auth: auth.auth,
        approvals,
        ledger: createFileIdempotencyLedger({ filePath }),
        comments: commentsHarness(),
        reactions,
      });
      if (operation === 'add') {
        await expect(restarted.addReaction(input as never)).rejects.toMatchObject({ kind: 'outcome_unknown' });
      } else {
        await expect(restarted.removeReaction(input as never)).rejects.toMatchObject({ kind: 'outcome_unknown' });
      }
      expect(providerCalls).toBe(1);
    },
  );

  it('fails closed on idempotency reuse with a different approved reaction payload', async () => {
    const auth = authHarness();
    const approvals = approvalHarness();
    const ledger = createFileIdempotencyLedger({ filePath: await ledgerPath() });
    let providerCalls = 0;
    const service = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger,
      comments: commentsHarness(),
      reactions: {
        addReaction: () => {
          providerCalls += 1;
          return Promise.resolve(successfulReaction());
        },
        removeReaction: () => Promise.resolve(),
      },
    });

    const likePreview = service.previewReactionAdd(addDraft);
    const likeReceipt = await service.approveReactionAdd({ payloadHash: likePreview.payloadHash });
    await expect(
      service.addReaction({
        draft: addDraft,
        payloadHash: likePreview.payloadHash,
        approvalReceiptId: likeReceipt.receiptId,
        idempotencyKey: 'reaction-conflict-key',
      }),
    ).resolves.toMatchObject({ state: 'succeeded' });

    const praiseDraft = { targetUrn, reactionType: 'PRAISE' } as const;
    const praisePreview = service.previewReactionAdd(praiseDraft);
    const praiseReceipt = await service.approveReactionAdd({ payloadHash: praisePreview.payloadHash });
    await expect(
      service.addReaction({
        draft: praiseDraft,
        payloadHash: praisePreview.payloadHash,
        approvalReceiptId: praiseReceipt.receiptId,
        idempotencyKey: 'reaction-conflict-key',
      }),
    ).rejects.toMatchObject({ kind: 'idempotency_conflict' });
    expect(providerCalls).toBe(1);
  });
});

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LinkedInCommentsError } from '../src/engagement/linkedin-comments.js';
import { createEngagementService } from '../src/engagement/engagement-service.js';
import { createApprovalService } from '../src/publishing/approval-service.js';
import { createFileIdempotencyLedger } from '../src/publishing/idempotency-ledger.js';

const temporaryDirectories: string[] = [];

async function ledgerPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'linkedin-mcp-m04-reply-'));
  temporaryDirectories.push(directory);
  return join(directory, 'idempotency.json');
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

const targetUrn = 'urn:li:comment:(urn:li:activity:6305471423192264704,6308007194273021952)';
const rootUrn = 'urn:li:share:6305471423242596352';
const createdCommentId = '6636062862760562688';
const createdCommentUrn = 'urn:li:comment:(urn:li:activity:6305471423192264704,6636062862760562688)';
const draft = {
  targetUrn,
  rootUrn,
  parentCommentUrn: targetUrn,
  text: 'Thanks for the thoughtful question.',
} as const;

function successfulComment(actorUrn = 'urn:li:person:member-123') {
  return {
    id: createdCommentId,
    commentUrn: createdCommentUrn,
    actorUrn,
    objectUrn: rootUrn,
    parentCommentUrn: targetUrn,
    text: draft.text,
    createdAt: '2026-10-11T17:00:00.000Z',
    lastModifiedAt: '2026-10-11T17:00:00.000Z',
    totalLikes: 0,
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
  return createApprovalService({ randomId: () => `reply-receipt-${++sequence}` });
}

describe('engagement service comment replies', () => {
  it('previews canonically and binds approval to an authenticated member with write scope', async () => {
    const filePath = await ledgerPath();
    const auth = authHarness();
    const approvals = approvalHarness();
    const service = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments: {
        createReply: () => Promise.resolve(successfulComment()),
      },
    });

    const preview = service.previewReply(draft);
    expect(preview).toMatchObject({
      payload: draft,
      provider: 'OFFICIAL_API',
      requiredScope: 'w_member_social_feed',
    });
    expect(preview.payloadHash).toMatch(/^[a-f0-9]{64}$/);

    auth.setScopes([]);
    await expect(service.approveReply({ payloadHash: preview.payloadHash })).rejects.toMatchObject({
      kind: 'permission_required',
    });

    auth.setScopes(['w_member_social_feed']);
    const receipt = await service.approveReply({ payloadHash: preview.payloadHash });
    auth.setSubject('other-member');

    await expect(
      service.createReply({
        draft,
        payloadHash: preview.payloadHash,
        approvalReceiptId: receipt.receiptId,
        idempotencyKey: 'reply-key-subject-bound',
      }),
    ).rejects.toMatchObject({ kind: 'approval_mismatch' });
  });

  it('derives the actor, preserves root/parent identity, and durably replays one successful reply', async () => {
    const filePath = await ledgerPath();
    const auth = authHarness();
    const approvals = approvalHarness();
    const providerCalls: unknown[] = [];
    const comments = {
      createReply: (input: unknown) => {
        providerCalls.push(input);
        return Promise.resolve(successfulComment());
      },
    };
    const firstService = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments,
    });

    const preview = firstService.previewReply(draft);
    const receipt = await firstService.approveReply({ payloadHash: preview.payloadHash });
    const input = {
      draft,
      payloadHash: preview.payloadHash,
      approvalReceiptId: receipt.receiptId,
      idempotencyKey: 'reply-key-success',
    };

    await expect(firstService.createReply(input)).resolves.toEqual({
      state: 'succeeded',
      provider: 'OFFICIAL_API',
      commentId: createdCommentId,
      commentUrn: createdCommentUrn,
      replay: false,
    });
    expect(providerCalls).toEqual([
      {
        accessToken: 'access-token-secret',
        targetUrn,
        actorUrn: 'urn:li:person:member-123',
        objectUrn: rootUrn,
        parentCommentUrn: targetUrn,
        text: draft.text,
      },
    ]);

    const restartedService = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments,
    });
    await expect(restartedService.createReply(input)).resolves.toEqual({
      state: 'succeeded',
      provider: 'OFFICIAL_API',
      commentId: createdCommentId,
      commentUrn: createdCommentUrn,
      replay: true,
    });
    expect(providerCalls).toHaveLength(1);
  });

  it('fails closed when replaying a legacy success with mismatched composite reply identity', async () => {
    const filePath = await ledgerPath();
    const auth = authHarness();
    const approvals = approvalHarness();
    let providerCalls = 0;
    const comments = {
      createReply: () => {
        providerCalls += 1;
        return Promise.resolve(successfulComment());
      },
    };
    const service = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments,
    });
    const preview = service.previewReply(draft);
    const receipt = await service.approveReply({ payloadHash: preview.payloadHash });
    const input = {
      draft,
      payloadHash: preview.payloadHash,
      approvalReceiptId: receipt.receiptId,
      idempotencyKey: 'reply-key-legacy-inconsistent-success',
    };
    await expect(service.createReply(input)).resolves.toMatchObject({ state: 'succeeded' });

    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as {
      records: { result?: { resourceUrn?: string } }[];
    };
    persisted.records[0]!.result!.resourceUrn = `urn:li:comment:(urn:li:activity:9999999999999999999,${createdCommentId})`;
    await writeFile(filePath, JSON.stringify(persisted), 'utf8');

    const restarted = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments,
    });
    await expect(restarted.createReply(input)).rejects.toMatchObject({ kind: 'outcome_unknown' });
    expect(providerCalls).toBe(1);
  });

  it('fails closed when the draft changed after approval', async () => {
    const filePath = await ledgerPath();
    const auth = authHarness();
    const approvals = approvalHarness();
    let providerCalls = 0;
    const service = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments: {
        createReply: () => {
          providerCalls += 1;
          return Promise.resolve(successfulComment());
        },
      },
    });
    const preview = service.previewReply(draft);
    const receipt = await service.approveReply({ payloadHash: preview.payloadHash });

    await expect(
      service.createReply({
        draft: { ...draft, text: 'Changed after approval' },
        payloadHash: preview.payloadHash,
        approvalReceiptId: receipt.receiptId,
        idempotencyKey: 'reply-key-changed',
      }),
    ).rejects.toMatchObject({ kind: 'approval_mismatch' });
    expect(providerCalls).toBe(0);
  });

  it('records malformed provider success as terminal outcome_unknown', async () => {
    const filePath = await ledgerPath();
    const auth = authHarness();
    const approvals = approvalHarness();
    const backingLedger = createFileIdempotencyLedger({ filePath });
    const completions: Array<Parameters<typeof backingLedger.complete>[0]> = [];
    const ledger = {
      reserve: backingLedger.reserve.bind(backingLedger),
      complete: async (input: Parameters<typeof backingLedger.complete>[0]) => {
        completions.push(input);
        return backingLedger.complete(input);
      },
    };
    let providerCalls = 0;
    const service = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger,
      comments: {
        createReply: () => {
          providerCalls += 1;
          return Promise.resolve(successfulComment('urn:li:person:unexpected-member'));
        },
      },
    });
    const preview = service.previewReply(draft);
    const receipt = await service.approveReply({ payloadHash: preview.payloadHash });
    const input = {
      draft,
      payloadHash: preview.payloadHash,
      approvalReceiptId: receipt.receiptId,
      idempotencyKey: 'reply-key-malformed-success',
    };

    await expect(service.createReply(input)).rejects.toMatchObject({ kind: 'outcome_unknown' });
    expect(completions).toEqual([
      expect.objectContaining({
        state: 'outcome_unknown',
        result: { errorCode: 'reply_outcome_unknown' },
      }),
    ]);
    await expect(service.createReply(input)).rejects.toMatchObject({ kind: 'outcome_unknown' });
    expect(providerCalls).toBe(1);
  });

  it.each([
    ['different numeric ID', `urn:li:comment:(urn:li:activity:6305471423192264704,9999999999999999999)`],
    ['different parent thread', `urn:li:comment:(urn:li:activity:9999999999999999999,${createdCommentId})`],
  ])(
    'rejects and terminally records provider reply with %s in its composite URN',
    async (_case, returnedUrn) => {
      const filePath = await ledgerPath();
      const auth = authHarness();
      const approvals = approvalHarness();
      const backingLedger = createFileIdempotencyLedger({ filePath });
      const completions: Array<Parameters<typeof backingLedger.complete>[0]> = [];
      const ledger = {
        reserve: backingLedger.reserve.bind(backingLedger),
        complete: async (input: Parameters<typeof backingLedger.complete>[0]) => {
          completions.push(input);
          return backingLedger.complete(input);
        },
      };
      let providerCalls = 0;
      const service = createEngagementService({
        auth: auth.auth,
        approvals,
        ledger,
        comments: {
          createReply: () => {
            providerCalls += 1;
            return Promise.resolve({ ...successfulComment(), commentUrn: returnedUrn });
          },
        },
      });
      const preview = service.previewReply(draft);
      const receipt = await service.approveReply({ payloadHash: preview.payloadHash });
      const input = {
        draft,
        payloadHash: preview.payloadHash,
        approvalReceiptId: receipt.receiptId,
        idempotencyKey: `reply-key-urn-mismatch-${_case}`,
      };

      await expect(service.createReply(input)).rejects.toMatchObject({ kind: 'outcome_unknown' });
      expect(completions).toEqual([
        expect.objectContaining({
          state: 'outcome_unknown',
          result: { errorCode: 'reply_outcome_unknown' },
        }),
      ]);
      expect(providerCalls).toBe(1);
    },
  );

  it('marks uncertain mutation outcomes durable and never retries them automatically', async () => {
    const filePath = await ledgerPath();
    const auth = authHarness();
    const approvals = approvalHarness();
    let providerCalls = 0;
    const comments = {
      createReply: () => {
        providerCalls += 1;
        return Promise.reject(new LinkedInCommentsError('outcome_unknown'));
      },
    };
    const service = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments,
    });
    const preview = service.previewReply(draft);
    const receipt = await service.approveReply({ payloadHash: preview.payloadHash });
    const input = {
      draft,
      payloadHash: preview.payloadHash,
      approvalReceiptId: receipt.receiptId,
      idempotencyKey: 'reply-key-uncertain',
    };

    await expect(service.createReply(input)).rejects.toMatchObject({ kind: 'outcome_unknown' });
    await expect(service.createReply(input)).rejects.toMatchObject({ kind: 'outcome_unknown' });
    expect(providerCalls).toBe(1);
  });

  it('prevents a second runtime from issuing a duplicate POST while the first owns the reservation', async () => {
    const filePath = await ledgerPath();
    const auth = authHarness();
    const approvals = approvalHarness();
    let providerCalls = 0;
    let releaseProvider: ((value: ReturnType<typeof successfulComment>) => void) | undefined;
    let firstProviderStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      firstProviderStarted = resolve;
    });
    const providerResult = new Promise<ReturnType<typeof successfulComment>>((resolve) => {
      releaseProvider = resolve;
    });
    const comments = {
      createReply: () => {
        providerCalls += 1;
        firstProviderStarted?.();
        return providerResult;
      },
    };
    const firstService = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments,
    });
    const secondService = createEngagementService({
      auth: auth.auth,
      approvals,
      ledger: createFileIdempotencyLedger({ filePath }),
      comments,
    });
    const preview = firstService.previewReply(draft);
    const receipt = await firstService.approveReply({ payloadHash: preview.payloadHash });
    const input = {
      draft,
      payloadHash: preview.payloadHash,
      approvalReceiptId: receipt.receiptId,
      idempotencyKey: 'reply-key-concurrent',
    };

    const first = firstService.createReply(input);
    await started;
    await expect(secondService.createReply(input)).rejects.toMatchObject({ kind: 'outcome_unknown' });
    expect(providerCalls).toBe(1);

    releaseProvider?.(successfulComment());
    await expect(first).resolves.toMatchObject({ replay: false, commentUrn: createdCommentUrn });
    await expect(secondService.createReply(input)).resolves.toMatchObject({
      replay: true,
      commentUrn: createdCommentUrn,
    });
    expect(providerCalls).toBe(1);
  });

  it.each([
    ['reauthentication_required', 'reauth_required'],
    ['permission_required', 'permission_required'],
    ['rate_limited', 'rate_limited'],
  ] as const)(
    'persists terminal provider classification %s without retry',
    async (providerKind, serviceKind) => {
      const filePath = await ledgerPath();
      const auth = authHarness();
      const approvals = approvalHarness();
      let providerCalls = 0;
      const service = createEngagementService({
        auth: auth.auth,
        approvals,
        ledger: createFileIdempotencyLedger({ filePath }),
        comments: {
          createReply: () => {
            providerCalls += 1;
            return Promise.reject(new LinkedInCommentsError(providerKind));
          },
        },
      });
      const preview = service.previewReply(draft);
      const receipt = await service.approveReply({ payloadHash: preview.payloadHash });
      const input = {
        draft,
        payloadHash: preview.payloadHash,
        approvalReceiptId: receipt.receiptId,
        idempotencyKey: `reply-key-${providerKind}`,
      };

      await expect(service.createReply(input)).rejects.toMatchObject({ kind: serviceKind });
      await expect(service.createReply(input)).rejects.toMatchObject({ kind: serviceKind });
      expect(providerCalls).toBe(1);
      if (providerKind === 'reauthentication_required') expect(auth.reauthCalls()).toBe(1);
    },
  );
});

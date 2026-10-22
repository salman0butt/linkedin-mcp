import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createEngagementService } from '../src/engagement/engagement-service.js';
import { createApprovalService } from '../src/publishing/approval-service.js';
import { createFileIdempotencyLedger } from '../src/publishing/idempotency-ledger.js';

const temporaryDirectories: string[] = [];
const targetUrn = 'urn:li:activity:7067167295080394752';
const addDraft = { targetUrn, reactionType: 'LIKE' } as const;
const removeDraft = { targetUrn } as const;

async function ledgerPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'linkedin-mcp-m04-approval-purpose-'));
  temporaryDirectories.push(directory);
  return join(directory, 'idempotency.json');
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function serviceWithProviderCounter(providerCalls: { value: number }) {
  return createEngagementService({
    auth: {
      getProviderContext: () =>
        Promise.resolve({
          accessToken: 'access-token-secret',
          subject: 'member-123',
          scopes: ['w_member_social_feed'],
        }),
      markReauthRequired: () => Promise.resolve(),
    },
    approvals: createApprovalService({ randomId: () => 'purpose-receipt' }),
    ledger: createFileIdempotencyLedger({ filePath: await ledgerPath() }),
    comments: {
      createReply: () => Promise.reject(new Error('provider must not be called')),
    },
    reactions: {
      addReaction: () => {
        providerCalls.value += 1;
        return Promise.reject(new Error('provider must not be called'));
      },
      removeReaction: () => {
        providerCalls.value += 1;
        return Promise.reject(new Error('provider must not be called'));
      },
    },
  });
}

describe('engagement approval purpose isolation', () => {
  it('rejects add approval reuse for reaction removal before provider mutation', async () => {
    const providerCalls = { value: 0 };
    const service = await serviceWithProviderCounter(providerCalls);
    const removePreview = service.previewReactionRemove(removeDraft);
    const receipt = await service.approveReactionAdd({ payloadHash: removePreview.payloadHash });

    await expect(
      service.removeReaction({
        draft: removeDraft,
        payloadHash: removePreview.payloadHash,
        approvalReceiptId: receipt.receiptId,
        idempotencyKey: 'cross-purpose-remove',
      }),
    ).rejects.toMatchObject({ kind: 'approval_mismatch' });
    expect(providerCalls.value).toBe(0);
  });

  it('rejects reply approval reuse for reaction add before provider mutation', async () => {
    const providerCalls = { value: 0 };
    const service = await serviceWithProviderCounter(providerCalls);
    const addPreview = service.previewReactionAdd(addDraft);
    const receipt = await service.approveReply({ payloadHash: addPreview.payloadHash });

    await expect(
      service.addReaction({
        draft: addDraft,
        payloadHash: addPreview.payloadHash,
        approvalReceiptId: receipt.receiptId,
        idempotencyKey: 'cross-purpose-add',
      }),
    ).rejects.toMatchObject({ kind: 'approval_mismatch' });
    expect(providerCalls.value).toBe(0);
  });
});

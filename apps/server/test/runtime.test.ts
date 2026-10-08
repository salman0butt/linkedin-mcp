import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createLinkedInRuntime } from '../src/runtime.js';
import { parseConfig } from '../src/config.js';
import { createTextPostPreview } from '../../../packages/core/dist/index.js';
import type { AuthService } from '../src/auth/auth-service.js';
import type { IdempotencyLedger } from '../src/publishing/idempotency-ledger.js';
import type { LinkedInPostsAdapter } from '../src/publishing/linkedin-posts.js';

describe('createLinkedInRuntime', () => {
  it('keeps a publisher absent when API version or explicit ledger path is missing and creates no files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm02-runtime-'));
    const config = parseConfig({
      LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: join(directory, 'ledger.json'),
    });

    try {
      const runtime = createLinkedInRuntime(config);

      expect(runtime.publishing.textPostService).toBeUndefined();
      expect(await readdir(directory)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('also keeps a publisher absent when only the API version is configured', () => {
    const runtime = createLinkedInRuntime(parseConfig({ LINKEDIN_MCP_API_VERSION: '202610' }));
    expect(runtime.publishing.textPostService).toBeUndefined();
  });

  it('uses the configured approval lifetime without requiring publisher configuration', () => {
    const runtime = createLinkedInRuntime(parseConfig({ LINKEDIN_MCP_APPROVAL_TTL_MS: '120000' }), {
      now: () => new Date('2026-10-08T12:00:00.000Z'),
    });

    const receipt = runtime.publishing.approvals.issue({
      payloadHash: 'a'.repeat(64),
      subject: 'member-123',
    });

    expect(receipt.expiresAt).toBe('2026-10-08T12:02:00.000Z');
    expect(runtime.publishing.textPostService).toBeUndefined();
  });

  it('shares one injected dependency graph and creates a publisher only with explicit config', () => {
    const authService = { getStatus: vi.fn() } as unknown as AuthService;
    const approvals = { issue: vi.fn(), consume: vi.fn() } as never;
    const ledger = { reserve: vi.fn(), complete: vi.fn() } as unknown as IdempotencyLedger;
    const createTextPost = vi.fn();
    const getTextPost = vi.fn();
    const posts = { createTextPost, getTextPost } as unknown as LinkedInPostsAdapter;
    const config = parseConfig({
      LINKEDIN_MCP_API_VERSION: '202610',
      LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: '/tmp/task-7-runtime-ledger.json',
      LINKEDIN_MCP_APPROVAL_TTL_MS: '120000',
      LINKEDIN_MCP_MEMBER_POST_READ_ENABLED: 'true',
    });

    const runtime = createLinkedInRuntime(config, {
      authService,
      approvals,
      ledger,
      posts,
      now: () => new Date('2026-10-08T12:00:00.000Z'),
    });

    expect(runtime.authService).toBe(authService);
    expect(runtime.publishing.approvals).toBe(approvals);
    expect(runtime.publishing.textPostService).toBeDefined();
    expect(createTextPost).not.toHaveBeenCalled();
    expect(getTextPost).not.toHaveBeenCalled();
  });

  it('forwards trusted member-read enablement to the shared Task 6 service', async () => {
    const now = () => new Date('2026-10-08T12:00:00.000Z');
    const getProviderContext = vi.fn(() =>
      Promise.resolve({
        accessToken: 'runtime-test-token',
        subject: 'member-123',
        scopes: ['w_member_social', 'r_member_social'],
      }),
    );
    const authService = {
      getProviderContext,
      markReauthRequired: vi.fn(),
    } as unknown as AuthService;
    const ledger = {
      reserve: vi.fn(({ idempotencyKey, payloadHash }: { idempotencyKey: string; payloadHash: string }) =>
        Promise.resolve({
          status: 'reserved' as const,
          record: {
            idempotencyKey,
            payloadHash,
            state: 'reserved' as const,
            createdAt: now().toISOString(),
            updatedAt: now().toISOString(),
          },
        }),
      ),
      complete: vi.fn(
        ({
          idempotencyKey,
          payloadHash,
          result,
        }: {
          idempotencyKey: string;
          payloadHash: string;
          state: 'succeeded' | 'failed_terminal' | 'outcome_unknown';
          result?: { postUrn?: string; errorCode?: string };
        }) =>
          Promise.resolve({
            idempotencyKey,
            payloadHash,
            state: 'succeeded' as const,
            createdAt: now().toISOString(),
            updatedAt: now().toISOString(),
            ...(result === undefined ? {} : { result }),
          }),
      ),
    } as unknown as IdempotencyLedger;
    const createTextPost = vi.fn(() => Promise.resolve({ postUrn: 'urn:li:share:123456' }));
    const getTextPost = vi.fn(() =>
      Promise.resolve({
        postUrn: 'urn:li:share:123456',
        author: 'urn:li:person:member-123',
        commentary: 'runtime verified post',
        lifecycleState: 'PUBLISHED',
      }),
    );
    const posts = {
      createTextPost,
      getTextPost,
    } as unknown as LinkedInPostsAdapter;
    const config = parseConfig({
      LINKEDIN_MCP_API_VERSION: '202610',
      LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: '/tmp/runtime-read-ledger.json',
      LINKEDIN_MCP_MEMBER_POST_READ_ENABLED: 'true',
    });
    const runtime = createLinkedInRuntime(config, { authService, ledger, posts, now });
    const preview = createTextPostPreview({ text: 'runtime verified post' });
    const receipt = runtime.publishing.approvals.issue({
      payloadHash: preview.payloadHash,
      subject: 'member-123',
    });

    const published = await runtime.publishing.textPostService?.publish({
      payload: preview.payload,
      approvalReceiptId: receipt.receiptId,
      idempotencyKey: 'runtime-read-key',
    });

    expect(published?.verification).toEqual({ state: 'verified' });
    expect(getTextPost).toHaveBeenCalledTimes(1);
    expect(getTextPost).toHaveBeenCalledWith({
      accessToken: 'runtime-test-token',
      postUrn: 'urn:li:share:123456',
    });
  });
});

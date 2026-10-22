import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTextPostPreview } from '../../../packages/core/dist/index.js';
import { parseConfig } from '../src/config.js';
import { createLinkedInMcpServer } from '../src/create-server.js';
import { createLinkedInRuntime } from '../src/runtime.js';
import { createTrustedApprovalGrantStore } from '../src/publishing/trusted-approval-grants.js';
import type { AuthService } from '../src/auth/auth-service.js';
import type { MediaIdempotencyLedger } from '../src/publishing/idempotency-ledger.js';
import type { MediaLinkedInPostsAdapter } from '../src/publishing/linkedin-posts.js';

const activeClients: Client[] = [];
const activeHandlers: Array<ReturnType<typeof createMcpHandler>> = [];
const hash = 'a'.repeat(64);
const subject = 'member-123';
const textPreview = createTextPostPreview({ text: 'Human-reviewed text post' });

afterEach(async () => {
  await Promise.all(activeClients.splice(0).map((client) => client.close()));
  await Promise.all(activeHandlers.splice(0).map((handler) => handler.close()));
});

function fixture(consumer?: ReturnType<typeof createTrustedApprovalGrantStore>['consumer']) {
  const auth = {
    getStatus: vi.fn(() =>
      Promise.resolve({
        state: 'connected' as const,
        provider: 'OFFICIAL_API' as const,
        scopes: ['w_member_social', 'w_member_social_feed'],
        refreshAvailable: false,
        subject,
      }),
    ),
    getProviderContext: vi.fn(() =>
      Promise.resolve({
        accessToken: 'test-token-never-sent',
        subject,
        scopes: ['w_member_social', 'w_member_social_feed'],
      }),
    ),
    markReauthRequired: vi.fn(),
  } as unknown as AuthService;
  const reserve = vi.fn();
  const createTextPost = vi.fn();
  const ledger = {
    reserve,
    complete: vi.fn(),
    checkpointMedia: vi.fn(),
  } as unknown as MediaIdempotencyLedger;
  const posts = {
    createTextPost,
    getTextPost: vi.fn(),
    createImagePost: vi.fn(),
    createMultiImagePost: vi.fn(),
  } as unknown as MediaLinkedInPostsAdapter;
  const config = parseConfig({
    LINKEDIN_MCP_API_VERSION: '202610',
    LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: '/tmp/unused-approval-test-ledger.json',
    LINKEDIN_MCP_MEDIA_ROOT: process.cwd(),
  });
  const runtime = createLinkedInRuntime(config, {
    authService: auth,
    ledger,
    posts,
    ...(consumer === undefined ? {} : { trustedApprovalGrants: consumer }),
  });
  return { runtime, reserve, createTextPost };
}

async function connect(runtime: ReturnType<typeof createLinkedInRuntime>) {
  const handler = createMcpHandler(() => createLinkedInMcpServer(runtime));
  activeHandlers.push(handler);
  const client = new Client({ name: 'trusted-approval-contract', version: '1.0.0' });
  activeClients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  return client;
}

const approvals = [
  {
    name: 'linkedin.post.approve.text',
    args: { payload: textPreview.payload, payloadHash: textPreview.payloadHash, approved: true },
    purpose: 'posts.text',
    payloadHash: textPreview.payloadHash,
  },
  {
    name: 'linkedin.post.approve.image',
    args: { payloadHash: hash, approved: true },
    purpose: 'posts.media',
    payloadHash: hash,
  },
  {
    name: 'linkedin.post.approve.multi_image',
    args: { payloadHash: hash, approved: true },
    purpose: 'posts.media',
    payloadHash: hash,
  },
  {
    name: 'linkedin.comments.reply.approve',
    args: { payloadHash: hash, approved: true },
    purpose: 'comments.reply',
    payloadHash: hash,
  },
  {
    name: 'linkedin.reactions.add.approve',
    args: { payloadHash: hash, approved: true },
    purpose: 'reactions.add',
    payloadHash: hash,
  },
  {
    name: 'linkedin.reactions.remove.approve',
    args: { payloadHash: hash, approved: true },
    purpose: 'reactions.remove',
    payloadHash: hash,
  },
] as const;

describe('trusted human approval MCP boundary', () => {
  it('does not let a second MCP client steal a grant issued for another client', async () => {
    const grants = createTrustedApprovalGrantStore();
    const { runtime } = fixture(grants.consumer);
    const intendedClient = await connect(runtime);
    const otherClient = await connect(runtime);
    const grantId = grants.issuer.grant({
      subject,
      purpose: 'posts.text',
      payloadHash: textPreview.payloadHash,
    });
    const args = { payload: textPreview.payload, payloadHash: textPreview.payloadHash, approved: true };

    const stolen = await otherClient.callTool({ name: 'linkedin.post.approve.text', arguments: args });
    expect(stolen.structuredContent).toMatchObject({ status: 'human_action_required' });

    const intended = await intendedClient.callTool({
      name: 'linkedin.post.approve.text',
      arguments: { ...args, trustedGrantId: grantId },
    });
    expect(intended.structuredContent).toMatchObject({ status: 'succeeded' });
  });
  it.each(approvals)('denies caller-only approval for $name without a host grant', async ({ name, args }) => {
    const { runtime, reserve, createTextPost } = fixture();
    const client = await connect(runtime);
    const response = await client.callTool({ name, arguments: args });

    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({
      status: 'human_action_required',
      error: { code: 'trusted_human_approval_required', retryable: false },
    });
    expect(response.structuredContent).not.toHaveProperty('data.receiptId');
    expect(reserve).not.toHaveBeenCalled();
    expect(createTextPost).not.toHaveBeenCalled();
  });

  it.each(approvals)(
    'issues only one receipt after an exact host grant for $name',
    async ({ name, args, purpose, payloadHash }) => {
      const grants = createTrustedApprovalGrantStore();
      const { runtime } = fixture(grants.consumer);
      const client = await connect(runtime);
      const trustedGrantId = grants.issuer.grant({ subject, purpose, payloadHash });

      const approved = await client.callTool({ name, arguments: { ...args, trustedGrantId } });
      expect(approved.structuredContent).toMatchObject({
        status: 'succeeded',
        data: { payloadHash, provider: 'LOCAL_ONLY' },
      });
      expect((approved.structuredContent as { data: { receiptId: string } }).data.receiptId).toBeTruthy();

      const second = await client.callTool({ name, arguments: { ...args, trustedGrantId } });
      expect(second.structuredContent).toMatchObject({
        status: 'human_action_required',
        error: { code: 'trusted_human_approval_required' },
      });
    },
  );
});

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';

const activeClients: Client[] = [];
const activeHandlers: Array<ReturnType<typeof createMcpHandler>> = [];

const threadUrn = 'urn:li:activity:7067167295080394752';
const parentCommentUrn = 'urn:li:comment:(urn:li:activity:7067167295080394752,1001)';
const replyDraft = {
  targetUrn: parentCommentUrn,
  rootUrn: threadUrn,
  parentCommentUrn,
  text: 'Thanks for the question.',
};
const replyPreview = {
  payload: replyDraft,
  canonicalJson: JSON.stringify(replyDraft),
  payloadHash: 'a'.repeat(64),
  provider: 'OFFICIAL_API' as const,
  requiredScope: 'w_member_social_feed' as const,
  warnings: [] as const,
};
const reactionAddPreview = {
  payload: { operation: 'add' as const, targetUrn: threadUrn, reactionType: 'LIKE' as const },
  canonicalJson: '{}',
  payloadHash: 'b'.repeat(64),
  provider: 'OFFICIAL_API' as const,
  requiredScope: 'w_member_social_feed' as const,
  warnings: [] as const,
};

const engagementToolNames = [
  'linkedin.comments.get',
  'linkedin.comments.list',
  'linkedin.comments.inbox',
  'linkedin.comments.reply.preview',
  'linkedin.comments.reply.approve',
  'linkedin.comments.reply.create',
  'linkedin.reactions.add.preview',
  'linkedin.reactions.add.approve',
  'linkedin.reactions.add',
  'linkedin.reactions.remove.preview',
  'linkedin.reactions.remove.approve',
  'linkedin.reactions.remove',
] as const;

afterEach(async () => {
  await Promise.all(activeClients.splice(0).map((client) => client.close()));
  await Promise.all(activeHandlers.splice(0).map((handler) => handler.close()));
});

async function connect(deps: unknown = {}) {
  const handler = createMcpHandler(() => createLinkedInMcpServer(deps as never));
  activeHandlers.push(handler);
  const client = new Client({ name: 'engagement-contract-test', version: '1.0.0' });
  activeClients.push(client);
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  await client.connect(transport);
  return client;
}

function engagement(overrides: Record<string, unknown> = {}) {
  const reads = {
    getComment: vi.fn(() =>
      Promise.resolve({
        status: 'disabled' as const,
        provider: 'OFFICIAL_API' as const,
        requiredScope: 'r_member_social_feed' as const,
      }),
    ),
    listComments: vi.fn(() =>
      Promise.resolve({
        status: 'permission_required' as const,
        provider: 'OFFICIAL_API' as const,
        requiredScope: 'r_member_social_feed' as const,
      }),
    ),
    inbox: vi.fn(() =>
      Promise.resolve({
        status: 'disabled' as const,
        provider: 'OFFICIAL_API' as const,
        requiredScope: 'r_member_social_feed' as const,
      }),
    ),
  };
  const writes = {
    previewReply: vi.fn(() => replyPreview),
    approveReply: vi.fn(() =>
      Promise.resolve({
        receiptId: 'reply-receipt-private',
        payloadHash: replyPreview.payloadHash,
        expiresAt: '2026-10-17T14:05:00.000Z',
        provider: 'LOCAL_ONLY' as const,
      }),
    ),
    createReply: vi.fn(() =>
      Promise.resolve({
        state: 'succeeded' as const,
        provider: 'OFFICIAL_API' as const,
        commentId: '1002',
        commentUrn: 'urn:li:comment:(urn:li:activity:7067167295080394752,1002)',
        replay: false,
      }),
    ),
    previewReactionAdd: vi.fn(() => reactionAddPreview),
    approveReactionAdd: vi.fn(() =>
      Promise.resolve({
        receiptId: 'reaction-add-receipt-private',
        payloadHash: reactionAddPreview.payloadHash,
        expiresAt: '2026-10-17T14:05:00.000Z',
        provider: 'LOCAL_ONLY' as const,
      }),
    ),
    addReaction: vi.fn(() =>
      Promise.resolve({
        state: 'succeeded' as const,
        provider: 'OFFICIAL_API' as const,
        targetUrn: threadUrn,
        reactionUrn: `urn:li:reaction:(urn:li:person:member-123,${threadUrn})`,
        reactionType: 'LIKE',
        replay: false,
      }),
    ),
    previewReactionRemove: vi.fn(),
    approveReactionRemove: vi.fn(),
    removeReaction: vi.fn(),
  };
  return {
    deps: { engagement: { reads, writes }, ...overrides },
    reads,
    writes,
  };
}

describe('M04 engagement MCP contract', () => {
  it('advertises all engagement tools before live Community Management availability is proven', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    expect(names).toEqual(expect.arrayContaining([...engagementToolNames]));
  });

  it.each([
    ['linkedin.comments.get', { targetUrn: threadUrn, commentId: '1001' }, 'accessToken', 'secret'],
    ['linkedin.comments.inbox', { threadUrns: [threadUrn] }, 'engagementReadEnabled', true],
    ['linkedin.comments.reply.preview', replyDraft, 'actorUrn', 'urn:li:person:attacker'],
    [
      'linkedin.reactions.add.preview',
      { targetUrn: threadUrn, reactionType: 'LIKE' },
      'providerUrl',
      'https://attacker.invalid',
    ],
  ] as const)('rejects privileged field %s/%s before engagement execution', async (tool, args, field, value) => {
    const fixture = engagement();
    const client = await connect(fixture.deps);
    const result = await client.callTool({ name: tool, arguments: { ...args, [field]: value } });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/input validation error|unrecognized key/i);
    expect(fixture.reads.getComment).not.toHaveBeenCalled();
    expect(fixture.reads.inbox).not.toHaveBeenCalled();
    expect(fixture.writes.previewReply).not.toHaveBeenCalled();
    expect(fixture.writes.previewReactionAdd).not.toHaveBeenCalled();
  });

  it('preserves an explicit disabled restricted-read state instead of returning empty comment data', async () => {
    const fixture = engagement();
    const client = await connect(fixture.deps);
    const result = await client.callTool({
      name: 'linkedin.comments.get',
      arguments: { targetUrn: threadUrn, commentId: '1001' },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'permission_required',
      data: {
        status: 'disabled',
        provider: 'OFFICIAL_API',
        requiredScope: 'r_member_social_feed',
      },
      provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
    });
    expect(fixture.reads.getComment).toHaveBeenCalledWith({
      targetUrn: threadUrn,
      commentId: '1001',
    });
  });

  it('previews a reply locally without exposing actor, token, or provider controls', async () => {
    const fixture = engagement();
    const client = await connect(fixture.deps);
    const result = await client.callTool({ name: 'linkedin.comments.reply.preview', arguments: replyDraft });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: replyPreview,
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
    });
    expect(fixture.writes.previewReply).toHaveBeenCalledWith(replyDraft);
    expect(JSON.stringify(result.structuredContent)).not.toMatch(/accessToken|actorUrn|providerUrl/);
  });

  it('requires literal approved:true before issuing a reply approval receipt', async () => {
    const fixture = engagement();
    const client = await connect(fixture.deps);
    const result = await client.callTool({
      name: 'linkedin.comments.reply.approve',
      arguments: { payloadHash: replyPreview.payloadHash, approved: false },
    });

    expect(result.isError).toBe(true);
    expect(fixture.writes.approveReply).not.toHaveBeenCalled();
  });

  it('creates an approved reaction without reflecting receipt or idempotency material', async () => {
    const fixture = engagement();
    const client = await connect(fixture.deps);
    const argumentsValue = {
      draft: { targetUrn: threadUrn, reactionType: 'LIKE' },
      payloadHash: reactionAddPreview.payloadHash,
      approvalReceiptId: 'reaction-add-receipt-private',
      idempotencyKey: 'reaction-add-idempotency-private',
    };
    const result = await client.callTool({ name: 'linkedin.reactions.add', arguments: argumentsValue });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: {
        state: 'succeeded',
        provider: 'OFFICIAL_API',
        targetUrn: threadUrn,
        reactionType: 'LIKE',
        replay: false,
      },
      provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
    });
    expect(fixture.writes.addReaction).toHaveBeenCalledWith(argumentsValue);
    const serialized = JSON.stringify(result.structuredContent);
    expect(serialized).not.toContain(argumentsValue.approvalReceiptId);
    expect(serialized).not.toContain(argumentsValue.idempotencyKey);
  });
});

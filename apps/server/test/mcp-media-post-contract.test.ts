import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';

const activeClients: Client[] = [];
const activeHandlers: Array<ReturnType<typeof createMcpHandler>> = [];

const imageDraft = {
  text: 'Ship the image safely',
  image: { sourcePath: 'assets/launch.png', altText: 'Product launch graphic' },
  visibility: 'PUBLIC' as const,
  disableReshare: false,
};
const multiDraft = {
  text: 'Ship the carousel safely',
  images: [
    { sourcePath: 'assets/one.png', altText: 'First panel' },
    { sourcePath: 'assets/two.png', altText: 'Second panel' },
  ],
  visibility: 'CONNECTIONS' as const,
  disableReshare: true,
};
const imagePreview = {
  payload: {
    contentKind: 'image' as const,
    commentary: imageDraft.text,
    visibility: imageDraft.visibility,
    distribution: {
      feedDistribution: 'MAIN_FEED' as const,
      targetEntities: [] as const,
      thirdPartyDistributionChannels: [] as const,
    },
    lifecycleState: 'PUBLISHED' as const,
    isReshareDisabled: imageDraft.disableReshare,
    media: {
      sourceName: 'launch.png',
      sha256: 'a'.repeat(64),
      mimeType: 'image/png' as const,
      byteLength: 42,
      width: 2,
      height: 2,
      altText: imageDraft.image.altText,
    },
  },
  canonicalJson: '{}',
  payloadHash: 'b'.repeat(64),
  provider: 'OFFICIAL_API' as const,
  requiredScope: 'w_member_social' as const,
  warnings: [] as string[],
};
const multiPreview = {
  payload: {
    contentKind: 'multi_image' as const,
    commentary: multiDraft.text,
    visibility: multiDraft.visibility,
    distribution: {
      feedDistribution: 'MAIN_FEED' as const,
      targetEntities: [] as const,
      thirdPartyDistributionChannels: [] as const,
    },
    lifecycleState: 'PUBLISHED' as const,
    isReshareDisabled: multiDraft.disableReshare,
    media: [
      {
        sourceName: 'one.png',
        sha256: 'c'.repeat(64),
        mimeType: 'image/png' as const,
        byteLength: 42,
        width: 2,
        height: 2,
        altText: 'First panel',
      },
      {
        sourceName: 'two.png',
        sha256: 'd'.repeat(64),
        mimeType: 'image/png' as const,
        byteLength: 43,
        width: 2,
        height: 2,
        altText: 'Second panel',
      },
    ],
  },
  canonicalJson: '{}',
  payloadHash: 'e'.repeat(64),
  provider: 'OFFICIAL_API' as const,
  requiredScope: 'w_member_social' as const,
  warnings: [] as string[],
};

afterEach(async () => {
  await Promise.all(activeClients.splice(0).map((client) => client.close()));
  await Promise.all(activeHandlers.splice(0).map((handler) => handler.close()));
});

async function connect(deps: unknown = {}) {
  const handler = createMcpHandler(() => createLinkedInMcpServer(deps as never));
  activeHandlers.push(handler);
  const client = new Client({ name: 'media-post-contract-test', version: '1.0.0' });
  activeClients.push(client);
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  await client.connect(transport);
  return client;
}

function mediaService(overrides: Record<string, unknown> = {}) {
  return {
    previewImage: vi.fn(() => Promise.resolve(imagePreview)),
    previewMultiImage: vi.fn(() => Promise.resolve(multiPreview)),
    approve: vi.fn(() =>
      Promise.resolve({
        receiptId: 'media-receipt-private',
        payloadHash: imagePreview.payloadHash,
        expiresAt: '2026-10-11T12:05:00.000Z',
        provider: 'LOCAL_ONLY' as const,
      }),
    ),
    createImage: vi.fn(() =>
      Promise.resolve({
        state: 'succeeded' as const,
        provider: 'OFFICIAL_API' as const,
        postUrn: 'urn:li:share:9001',
        imageUrns: ['urn:li:image:single-1'],
        processing: ['available' as const],
        replay: false,
      }),
    ),
    createMultiImage: vi.fn(() =>
      Promise.resolve({
        state: 'succeeded' as const,
        provider: 'OFFICIAL_API' as const,
        postUrn: 'urn:li:share:9002',
        imageUrns: ['urn:li:image:multi-1', 'urn:li:image:multi-2'],
        processing: ['available' as const, 'verification_unavailable' as const],
        replay: false,
      }),
    ),
    ...overrides,
  };
}

function publishing(service: ReturnType<typeof mediaService>) {
  return {
    approvals: { issue: vi.fn() },
    mediaPostService: service,
  };
}

describe('M03 media-post MCP contract', () => {
  it('advertises all six media tools before live provider availability is proven', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'linkedin.post.preview.image',
        'linkedin.post.approve.image',
        'linkedin.post.create.image',
        'linkedin.post.preview.multi_image',
        'linkedin.post.approve.multi_image',
        'linkedin.post.create.multi_image',
      ]),
    );
  });

  it('previews a single image through the media service without exposing the source path', async () => {
    const service = mediaService();
    const client = await connect({ publishing: publishing(service) });
    const result = await client.callTool({
      name: 'linkedin.post.preview.image',
      arguments: imageDraft,
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: imagePreview,
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      metadata: { audit: { operation: 'post.preview.image', payloadHash: imagePreview.payloadHash } },
    });
    expect(service.previewImage).toHaveBeenCalledWith(imageDraft);
    expect(JSON.stringify(result.structuredContent)).not.toContain(imageDraft.image.sourcePath);
  });

  it.each([
    ['author', 'urn:li:person:attacker'],
    ['accessToken', 'bearer-secret'],
    ['mediaRoot', '/etc'],
    ['imageStatusReadEnabled', true],
  ] as const)('rejects privileged preview field %s before service execution', async (field, value) => {
    const service = mediaService();
    const client = await connect({ publishing: publishing(service) });
    const result = await client.callTool({
      name: 'linkedin.post.preview.image',
      arguments: { ...imageDraft, [field]: value },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/input validation error|unrecognized key/i);
    expect(service.previewImage).not.toHaveBeenCalled();
  });

  it('requires literal approved:true for image approval before the service executes', async () => {
    const service = mediaService();
    const client = await connect({ publishing: publishing(service) });
    const result = await client.callTool({
      name: 'linkedin.post.approve.image',
      arguments: { payloadHash: imagePreview.payloadHash, approved: false },
    });

    expect(result.isError).toBe(true);
    expect(service.approve).not.toHaveBeenCalled();
  });

  it('creates an approved image post without reflecting receipt, idempotency key, path or upload data', async () => {
    const service = mediaService();
    const client = await connect({ publishing: publishing(service) });
    const result = await client.callTool({
      name: 'linkedin.post.create.image',
      arguments: {
        draft: imageDraft,
        payloadHash: imagePreview.payloadHash,
        approvalReceiptId: 'receipt-private',
        idempotencyKey: 'key-private',
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: {
        state: 'succeeded',
        provider: 'OFFICIAL_API',
        postUrn: 'urn:li:share:9001',
        imageUrns: ['urn:li:image:single-1'],
        replay: false,
      },
      provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
      metadata: { audit: { operation: 'post.create.image', payloadHash: imagePreview.payloadHash } },
    });
    expect(service.createImage).toHaveBeenCalledWith({
      draft: imageDraft,
      payloadHash: imagePreview.payloadHash,
      approvalReceiptId: 'receipt-private',
      idempotencyKey: 'key-private',
    });
    const serialized = JSON.stringify(result.structuredContent);
    expect(serialized).not.toContain('receipt-private');
    expect(serialized).not.toContain('key-private');
    expect(serialized).not.toContain(imageDraft.image.sourcePath);
    expect(serialized).not.toContain('uploadUrl');
  });

  it('enforces the 2–20 multi-image boundary in the MCP schema before service execution', async () => {
    const service = mediaService();
    const client = await connect({ publishing: publishing(service) });
    const result = await client.callTool({
      name: 'linkedin.post.preview.multi_image',
      arguments: {
        ...multiDraft,
        images: [multiDraft.images[0]],
      },
    });

    expect(result.isError).toBe(true);
    expect(service.previewMultiImage).not.toHaveBeenCalled();
  });

  it('previews ordered multi-image input and preserves only safe canonical descriptors', async () => {
    const service = mediaService();
    const client = await connect({ publishing: publishing(service) });
    const result = await client.callTool({
      name: 'linkedin.post.preview.multi_image',
      arguments: multiDraft,
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: multiPreview,
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      metadata: { audit: { operation: 'post.preview.multi_image', payloadHash: multiPreview.payloadHash } },
    });
    expect(service.previewMultiImage).toHaveBeenCalledWith(multiDraft);
    const serialized = JSON.stringify(result.structuredContent);
    expect(serialized).not.toContain(multiDraft.images[0].sourcePath);
    expect(serialized).not.toContain(multiDraft.images[1].sourcePath);
  });

  it('returns structured not-configured behavior instead of attempting media filesystem/provider work', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'linkedin.post.preview.image',
      arguments: imageDraft,
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'permission_required',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      error: { code: 'publishing_not_configured', retryable: false },
    });
  });
});

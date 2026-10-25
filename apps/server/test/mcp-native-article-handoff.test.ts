import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';
import type { LocalArticleStore } from '../src/articles/article-store.js';

const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

const draft = () => ({
  title: 'Manual native article transfer',
  topic: 'Engineering',
  audience: 'Engineers',
  goal: 'Offer editor-ready plain text without publication.',
  research: {
    brief: 'My unverified notes',
    sources: [{ id: 'src1', title: 'My own notes', url: 'https://example.org/notes' }],
  },
  outline: [{ id: 'o1', heading: 'Introduction' }],
  blocks: [
    { id: 'b1', kind: 'heading', text: 'First heading' },
    { id: 'b2', kind: 'paragraph', text: '<script>alert(1)</script>', sourceIds: ['src1'] },
  ],
  review: { state: 'reviewed' },
});

async function clientFor(transport: 'http' | 'stdio', articleStore?: LocalArticleStore) {
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      transport,
      ...(articleStore === undefined ? {} : { articleStore }),
      createRequestId: () => 'm09-native-handoff',
      now: () => new Date('2026-10-24T18:00:00.000Z'),
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm09-handoff-test', version: '1.0.0' });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  return client;
}

describe('M09 manual handoff real MCP contract', () => {
  it('registers one typed, local-only, stateless native handoff without native publishing entitlement', async () => {
    const client = await clientFor('http');
    const { tools } = await client.listTools();
    const tool = tools.find((item) => item.name === 'linkedin.article.native.handoff');
    expect(tool?.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(tool?.outputSchema).toMatchObject({ type: 'object' });
    expect(tools.map((item) => item.name)).not.toContain('linkedin.article.native.publish');

    const result = await client.callTool({
      name: 'linkedin.article.native.handoff',
      arguments: { draft: draft() },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY' },
      data: {
        kind: 'manual_editor_handoff',
        publicationStatus: 'not_published',
        nativePublishAvailability: 'UNAVAILABLE',
        provider: 'LOCAL_ONLY',
        orderedBlocks: [
          { order: 0, id: 'b1' },
          { order: 1, id: 'b2', plainText: '<script>alert(1)</script>' },
        ],
        sources: [{ id: 'src1', provenance: 'user_supplied_unverified' }],
      },
    });
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
    const capabilities = await client.callTool({ name: 'linkedin.capabilities', arguments: {} });
    const records = (
      capabilities.structuredContent as {
        data: { capabilities: Array<{ id: string; availability: string }> };
      }
    ).data.capabilities;
    expect(records.find((item) => item.id === 'article.native.publish')?.availability).toBe('UNAVAILABLE');
  });

  it('fails closed on forged publication fields, ID lookup and secret-bearing source URLs', async () => {
    const client = await clientFor('stdio');
    for (const arguments_ of [
      { draft: draft(), approved: true },
      { projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      { draft: { ...draft(), publishedAt: '2026-10-24' } },
      {
        draft: {
          ...draft(),
          research: {
            brief: 'x',
            sources: [{ id: 'src1', title: 'X', url: 'https://example.org/?token=secret' }],
          },
        },
      },
    ]) {
      const result = await client.callTool({
        name: 'linkedin.article.native.handoff',
        arguments: arguments_,
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain('secret');
    }
  });

  it('never invokes injected private STDIO project methods over HTTP', async () => {
    const store = {
      get: vi.fn(() => Promise.reject(new Error('PRIVATE_READ'))),
      list: vi.fn(() => Promise.reject(new Error('PRIVATE_READ'))),
      create: vi.fn(() => Promise.reject(new Error('PRIVATE_WRITE'))),
      update: vi.fn(() => Promise.reject(new Error('PRIVATE_WRITE'))),
      remove: vi.fn(() => Promise.reject(new Error('PRIVATE_WRITE'))),
    };
    const client = await clientFor('http', store);
    const result = await client.callTool({
      name: 'linkedin.article.native.handoff',
      arguments: { draft: draft() },
    });
    expect(result.structuredContent).toMatchObject({ status: 'succeeded' });
    expect(Object.values(store).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it('caps the entire dual-copy MCP response with a sanitized oversized error', async () => {
    const client = await clientFor('http');
    const blocks = Array.from({ length: 80 }, (_, i) => ({
      id: `b${i}`,
      kind: 'paragraph',
      text: 'Z'.repeat(2_270),
    }));
    const result = await client.callTool({
      name: 'linkedin.article.native.handoff',
      arguments: { draft: { ...draft(), blocks } },
    });
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
    expect(result.structuredContent).toMatchObject({ status: 'failed', error: { code: 'output_too_large' } });
    expect(JSON.stringify(result)).not.toContain('Z'.repeat(100));
  });
});

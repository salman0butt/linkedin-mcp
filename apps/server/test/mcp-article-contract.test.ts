import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';
import type { LocalArticleStore } from '../src/articles/article-store.js';
import { createLocalArticleStore } from '../src/articles/article-store.js';

const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];
const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
  await Promise.all(scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const draft = () => ({
  title: 'Secure distributed systems',
  topic: 'Engineering',
  audience: 'Senior developers',
  goal: 'Explain safe deployment practices',
  research: {
    brief: 'Investigate safe deployment patterns.',
    sources: [{ id: 's-1', title: 'Unverified notes', url: 'https://example.org/research' }],
  },
  outline: [{ id: 'o-1', heading: 'Core ideas' }],
  blocks: [{ id: 'b-1', kind: 'paragraph', text: 'A human-written claim', sourceIds: ['s-1'] }],
  seo: { description: 'Secure deployment approaches' },
  companionPost: 'An article draft on deployment.',
  review: { state: 'draft' },
});

async function clientFor(store?: LocalArticleStore, transport: 'stdio' | 'http' = 'http') {
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      ...(store === undefined ? {} : { articleStore: store }),
      transport,
      createRequestId: () => 'article-mcp',
      now: () => new Date('2026-10-24T12:00:00Z'),
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm08-contract', version: '1.0.0' });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  return client;
}

describe('M08 local article MCP boundary', () => {
  it('registers read-only stateless drafting tools and truthful LOCAL_ONLY capability', async () => {
    const client = await clientFor();
    const { tools } = await client.listTools();
    for (const name of [
      'linkedin.article.draft.validate',
      'linkedin.article.draft.preview',
      'linkedin.article.draft.companion',
    ]) {
      expect(tools.find((tool) => tool.name === name)?.inputSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
      });
    }
    const capabilities = await client.callTool({ name: 'linkedin.capabilities', arguments: {} });
    const entries = (
      capabilities.structuredContent as {
        data: { capabilities: Array<{ id: string; provider: string; availability: string }> };
      }
    ).data.capabilities;
    expect(entries.find((item) => item.id === 'article.draft')).toMatchObject({
      provider: 'LOCAL_ONLY',
      availability: 'AVAILABLE',
    });
    expect(entries.find((item) => item.id === 'article.native.publish')).toMatchObject({
      availability: 'UNAVAILABLE',
    });
  });

  it('validates, previews and suggests companion text with inert unverified source provenance', async () => {
    const client = await clientFor();
    for (const operation of ['validate', 'preview', 'companion']) {
      const result = await client.callTool({
        name: `linkedin.article.draft.${operation}`,
        arguments: { draft: draft() },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        status: 'succeeded',
        provider: { type: 'LOCAL_ONLY' },
      });
      expect(JSON.stringify(result)).not.toMatch(/OFFICIAL_API|native_article_published/);
    }
    const preview = await client.callTool({
      name: 'linkedin.article.draft.preview',
      arguments: { draft: draft() },
    });
    expect(preview.structuredContent).toMatchObject({
      data: { publicationStatus: 'not_published', sourceVerification: 'user_supplied_unverified' },
    });
  });

  it('rejects elevated status, arbitrary paths and secret parameters before any storage or side effects', async () => {
    const client = await clientFor();
    for (const input of [
      { draft: { ...draft(), published: true } },
      { draft: draft(), filePath: '/tmp/secret' },
      { draft: draft(), accessToken: 'secret-marker' },
      {
        draft: {
          ...draft(),
          research: {
            brief: '',
            sources: [{ id: 's-1', title: 'Bad', url: 'https://u:secret@example.org/' }],
          },
        },
      },
    ]) {
      const result = await client.callTool({ name: 'linkedin.article.draft.preview', arguments: input });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain('secret-marker');
    }
  });

  it('never exposes an injected STDIO project store to HTTP callers', async () => {
    const store = {
      create: vi.fn(() => Promise.reject(new Error('HTTP must not read private data'))),
      get: vi.fn(() => Promise.reject(new Error('HTTP must not read private data'))),
      update: vi.fn(() => Promise.reject(new Error('HTTP must not read private data'))),
      list: vi.fn(() => Promise.reject(new Error('HTTP must not read private data'))),
      remove: vi.fn(() => Promise.reject(new Error('HTTP must not read private data'))),
    };
    const client = await clientFor(store, 'http');
    const requests = [
      {
        name: 'linkedin.article.projects.create',
        arguments: { draft: draft(), idempotencyKey: 'article-test-1' },
      },
      { name: 'linkedin.article.projects.list', arguments: {} },
      { name: 'linkedin.article.projects.get', arguments: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } },
      {
        name: 'linkedin.article.projects.update',
        arguments: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', expectedRevision: 1, draft: draft() },
      },
      {
        name: 'linkedin.article.projects.remove',
        arguments: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', expectedRevision: 1 },
      },
    ];
    for (const request of requests) {
      const result = await client.callTool(request);
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ status: 'unsupported' });
    }
    for (const method of Object.values(store)) expect(method).not.toHaveBeenCalled();
  });

  it('saves, version-updates, lists and removes only explicit private STDIO projects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'm08-mcp-contract-'));
    scratch.push(root);
    const store = createLocalArticleStore({
      transport: 'stdio',
      filePath: join(root, 'private', 'articles.json'),
    });
    expect(store).not.toBeNull();
    const client = await clientFor(store!, 'stdio');
    const created = await client.callTool({
      name: 'linkedin.article.projects.create',
      arguments: { draft: draft(), idempotencyKey: 'first-mcp-write' },
    });
    expect(created.isError).not.toBe(true);
    const saved = (
      created.structuredContent as { data: { id: string; revision: number; draft: { title: string } } }
    ).data;
    expect(saved).toMatchObject({ revision: 1, draft: { title: draft().title } });
    const replay = await client.callTool({
      name: 'linkedin.article.projects.create',
      arguments: { draft: draft(), idempotencyKey: 'first-mcp-write' },
    });
    expect((replay.structuredContent as { data: { id: string } }).data.id).toBe(saved.id);
    const list = await client.callTool({ name: 'linkedin.article.projects.list', arguments: {} });
    expect(list.structuredContent).toMatchObject({ status: 'succeeded', data: [{ id: saved.id }] });
    expect(JSON.stringify(list)).not.toContain('A human-written claim');
    const edited = await client.callTool({
      name: 'linkedin.article.projects.update',
      arguments: { id: saved.id, expectedRevision: 1, draft: { ...draft(), title: 'New title' } },
    });
    expect(edited.structuredContent).toMatchObject({ status: 'succeeded', data: { revision: 2 } });
    const stale = await client.callTool({
      name: 'linkedin.article.projects.remove',
      arguments: { id: saved.id, expectedRevision: 1 },
    });
    expect(stale.structuredContent).toMatchObject({ status: 'failed', error: { code: 'revision_conflict' } });
    const deleted = await client.callTool({
      name: 'linkedin.article.projects.remove',
      arguments: { id: saved.id, expectedRevision: 2 },
    });
    expect(deleted.structuredContent).toMatchObject({ status: 'succeeded', data: true });
  });
});

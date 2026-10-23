import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';
import {
  createPostSearchService,
  DiscoveryProviderError,
  type DiscoveryProvider,
} from '../src/discovery/post-search-service.js';

const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];
const now = () => new Date('2026-10-23T08:00:00.000Z');

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

function provider(providerId: string, search: DiscoveryProvider['search']): DiscoveryProvider {
  return {
    providerId,
    providerType: 'EXTERNAL_DISCOVERY',
    name: `Provider ${providerId}`,
    supportedKinds: ['topic'],
    search,
  };
}

async function clientFor(providers: readonly DiscoveryProvider[] = []) {
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      discovery: createPostSearchService({ providers, now }),
      createRequestId: () => 'search-contract-request',
      now,
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm05-post-search-contract', version: '1.0.0' });
  clients.push(client);
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  await client.connect(transport);
  return client;
}

describe('M05.5 post search strict MCP contract', () => {
  it('registers exactly one read-only search tool, with no-provider state explicitly unavailable', async () => {
    const client = await clientFor();
    const { tools } = await client.listTools();
    const search = tools.filter((tool) => tool.name === 'linkedin.posts.search');
    expect(search).toHaveLength(1);
    const args = JSON.stringify(search[0]?.inputSchema);
    expect(args).not.toMatch(/accessToken|providerId|baseUrl|endpoint/i);
    const schema = search[0]?.inputSchema as Record<string, unknown> | undefined;
    expect(schema?.type).toBe('object');
    const alternatives = (schema?.oneOf ?? schema?.anyOf) as Array<Record<string, unknown>> | undefined;
    expect(alternatives).toHaveLength(5);
    for (const alternative of alternatives ?? []) {
      expect(alternative).toMatchObject({ type: 'object', additionalProperties: false });
      expect(alternative.required).toContain('kind');
    }
    const modes = (alternatives ?? []).map(
      (alternative) => (alternative.properties as { kind: { const?: string } })?.kind.const,
    );
    expect(modes.sort()).toEqual(['author', 'company', 'hashtag', 'recent', 'topic']);

    const answer = await client.callTool({
      name: 'linkedin.posts.search',
      arguments: { kind: 'topic', term: 'AI' },
    });
    expect(answer.isError).toBe(true);
    expect(answer.structuredContent).toMatchObject({
      status: 'unsupported',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      data: {
        status: 'unavailable',
        query: { kind: 'topic', term: 'AI', limit: 10 },
        providerOutcomes: [],
      },
    });
    expect(answer.structuredContent).toHaveProperty('data');
    expect((answer.structuredContent as { data: unknown }).data).not.toHaveProperty('posts');
    expect(answer.content[0]).toMatchObject({
      type: 'text',
      text: JSON.stringify(answer.structuredContent),
    });
    const capabilities = await client.callTool({ name: 'linkedin.capabilities', arguments: {} });
    const list = (
      capabilities.structuredContent as {
        data: { capabilities: Array<{ id: string; status: string; availability: string }> };
      }
    ).data.capabilities;
    expect(list.find((capability) => capability.id === 'posts.search')).toMatchObject({
      status: 'ACTIVE',
      availability: 'UNAVAILABLE',
    });
  });

  it('validates mode-specific input before any provider side effect', async () => {
    const search = vi.fn(() => Promise.resolve({ posts: [] }));
    const client = await clientFor([provider('legitimate', search)]);
    for (const args of [
      { kind: 'topic', term: 'AI', accessToken: 'secret' },
      { kind: 'topic', term: 'AI', providerId: 'legitimate' },
      { kind: 'topic', term: 'AI', endpoint: 'http://localhost/' },
      { kind: 'hashtag', term: 'AI', authorUrn: 'urn:li:person:x' },
      { kind: 'author', authorUrn: 'urn:li:person:a', organizationUrn: 'urn:li:organization:22' },
      { kind: 'recent', term: 'AI' },
      { kind: 'topic', term: 'AI', limit: 51 },
      { kind: 'topic', term: 'AI', since: '2026-10-01', until: '2026-10-02' },
    ]) {
      const operation = await client.callTool({ name: 'linkedin.posts.search', arguments: args });
      expect(operation.isError).toBe(true);
    }
    expect(search).not.toHaveBeenCalled();
  });

  it('classifies canonical validation failures as invalid_input rather than upstream provider failures', async () => {
    const search = vi.fn(() => Promise.resolve({ posts: [] }));
    const client = await clientFor([provider('legitimate', search)]);
    for (const args of [
      { kind: 'author', authorUrn: 'not-an-urn' },
      { kind: 'topic', term: '   ' },
      { kind: 'topic', term: 'AI', since: '2026-10-01' },
      { kind: 'topic', term: 'AI', since: '2026-10-22T00:00:00.000Z', until: '2026-10-01T00:00:00.000Z' },
    ]) {
      const result = await client.callTool({ name: 'linkedin.posts.search', arguments: args });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        status: 'failed',
        error: { code: 'invalid_input' },
      });
    }
    expect(search).not.toHaveBeenCalled();
  });

  it('preserves mixed-provider partial outcomes including a truly empty successful provider', async () => {
    const client = await clientFor([
      provider('empty', () => Promise.resolve({ posts: [] })),
      provider('limited', () => Promise.reject(new DiscoveryProviderError('rate_limited'))),
    ]);
    const result = await client.callTool({
      name: 'linkedin.posts.search',
      arguments: { kind: 'topic', term: 'AI' },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'partial',
      data: {
        status: 'partial',
        posts: [],
        providerOutcomes: [
          { providerId: 'empty', providerType: 'EXTERNAL_DISCOVERY', state: 'success', consulted: true },
          {
            providerId: 'limited',
            providerType: 'EXTERNAL_DISCOVERY',
            state: 'rate_limited',
            consulted: true,
          },
        ],
      },
    });
  });

  it('marks a consulted complete empty provider response successful, preserving source on real posts', async () => {
    const empty = await clientFor([provider('empty', () => Promise.resolve({ posts: [] }))]);
    const result = await empty.callTool({
      name: 'linkedin.posts.search',
      arguments: { kind: 'topic', term: 'AI' },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: { status: 'available', posts: [], providerOutcomes: [{ state: 'success' }] },
    });
  });

  it('keeps identical provider IDs separate while ignoring a provider attempt to spoof source authority', async () => {
    const client = await clientFor([
      provider('one', () =>
        Promise.resolve({
          posts: [
            {
              id: 'shared',
              text: 'AI first',
              source: {
                id: 'spoofed',
                name: 'LinkedIn',
                provider: 'OFFICIAL_API',
                retrievedAt: '1990-01-01',
              },
            },
          ],
        }),
      ),
      provider('two', () => Promise.resolve({ posts: [{ id: 'shared', text: 'AI second' }] })),
    ]);
    const result = await client.callTool({
      name: 'linkedin.posts.search',
      arguments: { kind: 'topic', term: 'AI' },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: {
        posts: [
          {
            id: 'shared',
            source: {
              id: 'one',
              name: 'Provider one',
              provider: 'EXTERNAL_DISCOVERY',
              retrievedAt: now().toISOString(),
            },
          },
          {
            id: 'shared',
            source: {
              id: 'two',
              name: 'Provider two',
              provider: 'EXTERNAL_DISCOVERY',
              retrievedAt: now().toISOString(),
            },
          },
        ],
      },
    });
    const output = result.structuredContent as { data: { posts: Array<Record<string, unknown>> } };
    for (const post of output.data.posts) {
      expect(post).not.toHaveProperty('canonicalUrl');
      expect(post).not.toHaveProperty('likes');
      expect(post).not.toHaveProperty('comments');
    }
    expect(result.content[0]).toMatchObject({ type: 'text', text: JSON.stringify(result.structuredContent) });
  });

  it.each([
    ['unavailable', 'unsupported'],
    ['permission_required', 'permission_required'],
    ['rate_limited', 'rate_limited'],
    ['failed', 'failed'],
  ] as const)('keeps %s provider-only outcome distinct, without inventing posts', async (state, status) => {
    const client = await clientFor([
      provider('blocked', () => Promise.reject(new DiscoveryProviderError(state))),
    ]);
    const result = await client.callTool({
      name: 'linkedin.posts.search',
      arguments: { kind: 'topic', term: 'AI' },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      status,
      data: { status: state, providerOutcomes: [{ state, consulted: true }] },
      error: { code: state },
    });
    const output = result.structuredContent as { data: Record<string, unknown> };
    expect(output.data).not.toHaveProperty('posts');
    expect(result.content[0]).toMatchObject({ type: 'text', text: JSON.stringify(result.structuredContent) });
  });

  it('keeps provider exceptions sanitized and does not leak provider strings', async () => {
    const client = await clientFor([
      provider('sensitive', () => Promise.reject(new Error('private-token-value token=secret'))),
    ]);
    const response = await client.callTool({
      name: 'linkedin.posts.search',
      arguments: { kind: 'topic', term: 'AI' },
    });
    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      status: 'failed',
      data: { status: 'failed', providerOutcomes: [{ state: 'failed' }] },
    });
    expect(JSON.stringify(response)).not.toMatch(/private-token-value|token=secret/);
  });
});

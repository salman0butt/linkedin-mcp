import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { request } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { parseConfig } from '../src/config.js';
import { createHttpServer } from '../src/http.js';
import { DiscoveryProviderError, type DiscoveryProvider } from '../src/discovery/post-search-service.js';
import type { AuthService } from '../src/auth/auth-service.js';
import { createLinkedInRuntime } from '../src/runtime.js';
import type { LinkedInPostsAdapter } from '../src/publishing/linkedin-posts.js';
import { createTrustedApprovalGrantStore } from '../src/publishing/trusted-approval-grants.js';

function getStatus(port: number, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        host: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'GET',
        headers,
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode ?? 0));
      },
    );
    outgoing.once('error', reject);
    outgoing.end();
  });
}

function postStatus(port: number, body: Buffer, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        host: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: {
          Host: `127.0.0.1:${port}`,
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode ?? 0));
      },
    );
    outgoing.once('error', reject);
    outgoing.end(body);
  });
}

describe('createHttpServer', () => {
  it.each([
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
    ['zero', 0],
    ['negative', -1],
    ['fractional', 0.5],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['over the 16 MiB maximum', 16_777_217],
  ])('rejects an invalid %s request body limit before opening HTTP', async (_description, limit) => {
    let opened: Awaited<ReturnType<typeof createHttpServer>> | undefined;
    let failure: unknown;
    try {
      opened = await createHttpServer({ host: '127.0.0.1', port: 0, requestBodyLimitBytes: limit });
    } catch (error) {
      failure = error;
    } finally {
      await opened?.close();
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/request body limit/i);
  });

  it.each([1, 1_048_576, 16_777_216])('allows finite valid body limit %i', async (limit) => {
    const server = await createHttpServer({
      host: '127.0.0.1',
      port: 0,
      requestBodyLimitBytes: limit,
    });
    await server.close();
  });

  it('enforces the environment request body limit when no explicit HTTP override is provided', async () => {
    vi.stubEnv('LINKEDIN_MCP_BODY_LIMIT_BYTES', '1');
    let server: Awaited<ReturnType<typeof createHttpServer>> | undefined;
    try {
      server = await createHttpServer({ host: '127.0.0.1', port: 0 });
      const body = Buffer.from(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'linkedin.health', arguments: {} },
        }),
      );
      expect(body.byteLength).toBeGreaterThan(1);
      expect(
        await postStatus(server.address.port, body, {
          Accept: 'application/json, text/event-stream',
        }),
      ).toBe(413);
    } finally {
      await server?.close();
      vi.unstubAllEnvs();
    }
  });

  it('honors an explicit HTTP request body limit over a smaller environment value', async () => {
    vi.stubEnv('LINKEDIN_MCP_BODY_LIMIT_BYTES', '1');
    let server: Awaited<ReturnType<typeof createHttpServer>> | undefined;
    try {
      server = await createHttpServer({
        host: '127.0.0.1',
        port: 0,
        requestBodyLimitBytes: 1_048_576,
      });
      const body = Buffer.from(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'linkedin.health', arguments: {} },
        }),
      );
      expect(
        await postStatus(server.address.port, body, {
          Accept: 'application/json, text/event-stream',
        }),
      ).toBe(200);
    } finally {
      await server?.close();
      vi.unstubAllEnvs();
    }
  });

  it('rejects oversized JSON-RPC IDs before dispatch and keeps the complete HTTP response bounded', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });
    const marker = 'A'.repeat(1_400);
    const draft = {
      title: 'Manual handoff',
      topic: 'Engineering',
      audience: 'Engineers',
      goal: 'Prepare content locally',
      research: { brief: 'Author notes', sources: [] },
      outline: [],
      blocks: Array.from({ length: 80 }, (_, index) => ({
        id: `block-${index}`,
        kind: 'paragraph',
        text: marker,
      })),
      review: { state: 'draft' },
    };
    try {
      const response = await fetch(`http://127.0.0.1:${server.address.port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'R'.repeat(14_000),
          method: 'tools/call',
          params: { name: 'linkedin.article.native.handoff', arguments: { draft } },
        }),
      });
      const wire = await response.text();
      expect(Buffer.byteLength(wire, 'utf8')).toBeLessThanOrEqual(262_144);
      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(JSON.parse(wire)).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request' },
      });
      expect(wire).not.toContain(marker);
    } finally {
      await server.close();
    }
  });

  it('preserves valid UTF-8 byte-bounded IDs, notifications and ordinary batches', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });
    const send = (body: unknown) =>
      fetch(`http://127.0.0.1:${server.address.port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify(body),
      });
    const health = (id: string) => ({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: 'linkedin.health', arguments: {} },
    });
    try {
      const unicodeId = '🌻'.repeat(32); // exactly 128 bytes
      const valid = await send(health(unicodeId));
      expect(valid.status).toBe(200);
      expect(valid.headers.get('content-type')).toContain('text/event-stream');
      const validWire = await valid.text();
      expect(Buffer.byteLength(validWire, 'utf8')).toBeLessThanOrEqual(262_144);
      expect(
        JSON.parse(
          validWire
            .split('\n')
            .find((line) => line.startsWith('data: '))!
            .slice(6),
        ),
      ).toMatchObject({
        jsonrpc: '2.0',
        id: unicodeId,
        result: { structuredContent: { status: 'succeeded' } },
      });

      const notification = await send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      expect(notification.status).toBe(202);
      expect(await notification.text()).toBe('');

      const batch = await send([health('first'), health('second')]);
      expect(batch.status).toBe(200);
      const batchWire = await batch.text();
      const ids = batchWire
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => (JSON.parse(line.slice(6)) as { id: string }).id);
      expect(ids).toEqual(['first', 'second']);
      expect(Buffer.byteLength(batchWire, 'utf8')).toBeLessThanOrEqual(262_144);

      const oversizedUnicode = await send(health('🌻'.repeat(33)));
      expect(oversizedUnicode.status).toBe(400);
      expect((await oversizedUnicode.json()) as unknown).toMatchObject({
        id: null,
        error: { code: -32600 },
      });
      const mixedBatch = await send([health('first'), health('X'.repeat(129))]);
      expect(mixedBatch.status).toBe(400);
      expect((await mixedBatch.json()) as unknown).toMatchObject({
        id: null,
        error: { code: -32600 },
      });
    } finally {
      await server.close();
    }
  });

  it('bounds an entire SSE response even when a batch would produce multiple large events', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });
    try {
      const response = await fetch(`http://127.0.0.1:${server.address.port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify(['first', 'second'].map((id) => ({ jsonrpc: '2.0', id, method: 'tools/list' }))),
      });
      const wire = await response.text();
      expect(response.status).toBe(502);
      expect(Buffer.byteLength(wire, 'utf8')).toBeLessThanOrEqual(262_144);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(JSON.parse(wire)).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'MCP response too large; operation outcome unknown.' },
      });
      expect(wire).not.toContain('linkedin.article.native.handoff');
    } finally {
      await server.close();
    }
  });

  it('uses only trusted runtime-injected discovery adapters across the real HTTP transport', async () => {
    class AuthorizedDiscovery implements DiscoveryProvider {
      readonly providerId = 'configured-discovery';
      readonly providerType = 'EXTERNAL_DISCOVERY' as const;
      readonly name = 'Configured independent discovery';
      readonly supportedKinds = ['topic'] as const;
      readonly calls: unknown[] = [];

      search(query: Parameters<DiscoveryProvider['search']>[0]) {
        this.calls.push(query);
        return Promise.resolve({ posts: [{ id: 'external-1', text: 'AI deployment overview' }] });
      }
    }
    const configured = new AuthorizedDiscovery();
    const runtime = createLinkedInRuntime(parseConfig(), {
      now: () => new Date('2026-10-23T09:00:00.000Z'),
      discoveryProviders: [configured],
    });
    const server = await createHttpServer({ host: '127.0.0.1', port: 0, runtime });
    const client = new Client({ name: 'trusted-discovery-http', version: '1.0.0' });
    try {
      const endpoint = new URL(`http://${server.address.host}:${server.address.port}/mcp`);
      await client.connect(new StreamableHTTPClientTransport(endpoint));
      const result = await client.callTool({
        name: 'linkedin.posts.search',
        arguments: { kind: 'topic', term: 'AI', limit: 1 },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        status: 'succeeded',
        provider: { type: 'LOCAL_ONLY' },
        data: {
          status: 'available',
          posts: [
            {
              id: 'external-1',
              source: {
                provider: 'EXTERNAL_DISCOVERY',
                id: 'configured-discovery',
                retrievedAt: '2026-10-23T09:00:00.000Z',
              },
            },
          ],
        },
      });
      expect(configured.calls).toHaveLength(1);
      expect(configured.calls[0]).toMatchObject({ kind: 'topic', term: 'AI', limit: 1 });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('preserves partial source results and error flags for two real loopback MCP clients', async () => {
    const runtime = createLinkedInRuntime(parseConfig(), {
      now: () => new Date('2026-10-23T09:00:00.000Z'),
      discoveryProviders: [
        {
          providerId: 'published',
          providerType: 'EXTERNAL_DISCOVERY',
          name: 'Published data source',
          supportedKinds: ['topic'],
          search: () => Promise.resolve({ posts: [{ id: 'p100', text: 'AI methods' }] }),
        },
        {
          providerId: 'limited',
          providerType: 'EXTERNAL_DISCOVERY',
          name: 'Rate limited source',
          supportedKinds: ['topic'],
          search: () => Promise.reject(new DiscoveryProviderError('rate_limited')),
        },
      ],
    });
    const server = await createHttpServer({ host: '127.0.0.1', port: 0, runtime });
    const endpoint = new URL(`http://${server.address.host}:${server.address.port}/mcp`);
    const clients = [
      new Client({ name: 'discovery-client-a', version: '1.0.0' }),
      new Client({ name: 'discovery-client-b', version: '1.0.0' }),
    ];
    try {
      for (const client of clients) {
        await client.connect(new StreamableHTTPClientTransport(endpoint));
        const result = await client.callTool({
          name: 'linkedin.posts.search',
          arguments: { kind: 'topic', term: 'AI' },
        });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({
          status: 'partial',
          data: {
            status: 'partial',
            posts: [{ id: 'p100', source: { id: 'published', provider: 'EXTERNAL_DISCOVERY' } }],
            providerOutcomes: [
              { providerId: 'published', state: 'success', consulted: true },
              { providerId: 'limited', state: 'rate_limited', consulted: true },
            ],
          },
        });
        expect(result.content[0]).toMatchObject({
          type: 'text',
          text: JSON.stringify(result.structuredContent),
        });
      }
    } finally {
      await Promise.all(clients.map((client) => client.close()));
      await server.close();
    }
  });

  it('shares injected approval and publishing state across real HTTP MCP clients', async () => {
    const now = () => new Date('2026-10-08T12:00:00.000Z');
    const grants = createTrustedApprovalGrantStore({ now });
    const directory = await mkdtemp(join(tmpdir(), 'm02-http-runtime-'));
    let postedInput: Parameters<LinkedInPostsAdapter['createTextPost']>[0] | undefined;
    const createTextPost = vi.fn((input: Parameters<LinkedInPostsAdapter['createTextPost']>[0]) => {
      postedInput = input;
      return Promise.resolve({ postUrn: 'urn:li:share:123456' });
    });
    const getTextPost = vi.fn((input: Parameters<LinkedInPostsAdapter['getTextPost']>[0]) =>
      Promise.resolve({
        postUrn: input.postUrn,
        author: postedInput?.author ?? '',
        commentary: postedInput?.payload.commentary ?? '',
        lifecycleState: 'PUBLISHED',
      }),
    );
    const getStatus = vi.fn(() =>
      Promise.resolve({
        state: 'connected' as const,
        provider: 'OFFICIAL_API' as const,
        scopes: ['openid', 'w_member_social'],
        refreshAvailable: false,
        subject: 'member-123',
      }),
    );
    const getProviderContext = vi.fn(() =>
      Promise.resolve({
        accessToken: 'http-fake-access-token',
        subject: 'member-123',
        scopes: ['openid', 'w_member_social', 'r_member_social'],
      }),
    );
    const authService = {
      getStatus,
      getProviderContext,
      markReauthRequired: vi.fn(() => Promise.resolve()),
    } as unknown as AuthService;
    const runtime = createLinkedInRuntime(
      parseConfig({
        LINKEDIN_MCP_API_VERSION: '202610',
        LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: join(directory, 'ledger.json'),
        LINKEDIN_MCP_MEMBER_POST_READ_ENABLED: 'true',
      }),
      { authService, posts: { createTextPost, getTextPost }, now, trustedApprovalGrants: grants.consumer },
    );
    const server = await createHttpServer({ host: '127.0.0.1', port: 0, runtime });
    const endpoint = new URL(`http://${server.address.host}:${server.address.port}/mcp`);
    const first = new Client({ name: 'http-m02-first', version: '1.0.0' });
    const second = new Client({ name: 'http-m02-second', version: '1.0.0' });
    try {
      await first.connect(new StreamableHTTPClientTransport(endpoint));
      await second.connect(new StreamableHTTPClientTransport(endpoint));
      const preview = await first.callTool({
        name: 'linkedin.post.preview.text',
        arguments: { text: 'shared http preview' },
      });
      const previewData = preview.structuredContent as { data: { payload: unknown; payloadHash: string } };
      expect(getStatus).not.toHaveBeenCalled();
      expect(getProviderContext).not.toHaveBeenCalled();
      expect(createTextPost).not.toHaveBeenCalled();
      expect(getTextPost).not.toHaveBeenCalled();
      expect(await readdir(directory)).toEqual([]);

      const trustedGrantId = grants.issuer.grant({
        subject: 'member-123',
        purpose: 'posts.text',
        payloadHash: previewData.data.payloadHash,
      });
      const approval = await first.callTool({
        name: 'linkedin.post.approve.text',
        arguments: {
          payload: previewData.data.payload,
          payloadHash: previewData.data.payloadHash,
          approved: true,
          trustedGrantId,
        },
      });
      const receipt = (approval.structuredContent as { data: { receiptId: string } }).data.receiptId;
      expect(approval.structuredContent).toMatchObject({
        status: 'succeeded',
        provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      });
      expect(getStatus).toHaveBeenCalledTimes(1);
      expect(getProviderContext).not.toHaveBeenCalled();
      expect(await readdir(directory)).toEqual([]);
      const publishArguments = {
        payload: previewData.data.payload,
        approvalReceiptId: receipt,
        idempotencyKey: 'http-shared-key',
      };
      const published = await second.callTool({
        name: 'linkedin.post.create.text',
        arguments: publishArguments,
      });
      const replay = await first.callTool({ name: 'linkedin.post.create.text', arguments: publishArguments });

      expect(published.structuredContent).toMatchObject({
        status: 'succeeded',
        provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
        data: {
          state: 'succeeded',
          provider: 'OFFICIAL_API',
          postUrn: 'urn:li:share:123456',
          replay: false,
          verification: { state: 'verified' },
        },
      });
      expect((published.structuredContent as { data: { replay: boolean } }).data.replay).toBe(false);
      expect((replay.structuredContent as { data: { replay: boolean } }).data.replay).toBe(true);
      expect(createTextPost).toHaveBeenCalledTimes(1);
      expect(getTextPost).toHaveBeenCalledTimes(2);
      expect(getStatus).toHaveBeenCalledTimes(1);
      expect(getProviderContext).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(published.structuredContent)).not.toContain(receipt);
      expect(JSON.stringify(published.structuredContent)).not.toContain('http-shared-key');
      expect(JSON.stringify(published.structuredContent)).not.toContain('http-fake-access-token');
      expect(published.content).toEqual([
        { type: 'text', text: JSON.stringify(published.structuredContent) },
      ]);
    } finally {
      await first.close();
      await second.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('binds an ephemeral loopback port and closes cleanly', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      expect(server.address.host).toBe('127.0.0.1');
      expect(server.address.port).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it('refuses to bind non-loopback interfaces', async () => {
    let server: Awaited<ReturnType<typeof createHttpServer>> | undefined;

    try {
      server = await createHttpServer({ host: '0.0.0.0', port: 0 });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/loopback/i);
      return;
    } finally {
      if (server !== undefined) await server.close();
    }

    throw new Error('Expected createHttpServer to reject a non-loopback bind host');
  });

  it('rejects an unapproved Host header before MCP handling', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      await expect(getStatus(server.address.port, { Host: 'evil.example' })).resolves.toBe(403);
    } finally {
      await server.close();
    }
  });

  it('requires browser Origins to match the loopback request origin while preserving origin-less MCP clients', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });
    const host = `127.0.0.1:${server.address.port}`;

    try {
      await expect(
        getStatus(server.address.port, {
          Host: host,
          Origin: 'https://evil.example',
        }),
      ).resolves.toBe(403);

      await expect(
        getStatus(server.address.port, {
          Host: host,
          Origin: `http://127.0.0.1:${server.address.port + 1}`,
        }),
      ).resolves.toBe(403);

      await expect(
        getStatus(server.address.port, {
          Host: host,
          Origin: `http://${host}`,
        }),
      ).resolves.not.toBe(403);

      await expect(getStatus(server.address.port, { Host: host })).resolves.not.toBe(403);
    } finally {
      await server.close();
    }
  });

  it('rejects request bodies larger than the default 1 MiB limit', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      await expect(postStatus(server.address.port, Buffer.alloc(1_048_577, 'a'))).resolves.toBe(413);
    } finally {
      await server.close();
    }
  });
});

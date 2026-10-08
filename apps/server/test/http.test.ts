import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { request } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { parseConfig } from '../src/config.js';
import { createHttpServer } from '../src/http.js';
import type { AuthService } from '../src/auth/auth-service.js';
import { createLinkedInRuntime } from '../src/runtime.js';
import type { LinkedInPostsAdapter } from '../src/publishing/linkedin-posts.js';

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

function postStatus(port: number, body: Buffer): Promise<number> {
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
  it('shares injected approval and publishing state across real HTTP MCP clients', async () => {
    const now = () => new Date('2026-10-08T12:00:00.000Z');
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
      { authService, posts: { createTextPost, getTextPost }, now },
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

      const approval = await first.callTool({
        name: 'linkedin.post.approve.text',
        arguments: {
          payload: previewData.data.payload,
          payloadHash: previewData.data.payloadHash,
          approved: true,
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

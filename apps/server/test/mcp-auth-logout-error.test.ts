import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';

import type { AuthService } from '../src/auth/auth-service.js';
import { createLinkedInMcpServer } from '../src/create-server.js';

function logoutFailureAuthService(): AuthService {
  return {
    startAuthorization() {
      throw new Error('unused');
    },
    getStatus() {
      return Promise.resolve({
        state: 'connected',
        provider: 'OFFICIAL_API',
        mode: 'confidential',
        subject: 'member-123',
        scopes: ['openid', 'profile'],
        expiresAt: '2026-10-07T13:00:00.000Z',
        refreshAvailable: false,
      });
    },
    completeAuthorization() {
      return Promise.reject(new Error('unused'));
    },
    getProfile() {
      return Promise.reject(new Error('unused'));
    },
    getProviderContext() {
      return Promise.resolve({
        accessToken: 'internal-test-access-token',
        subject: 'member-123',
        scopes: ['openid', 'profile'],
      });
    },
    markReauthRequired() {
      return Promise.resolve();
    },
    logout() {
      return Promise.reject(new Error('Credential clear failed provider-private-detail'));
    },
  };
}

describe('M01 MCP logout failure contract', () => {
  it('returns a sanitized failed result when local credential cleanup fails', async () => {
    const handler = createMcpHandler(() =>
      createLinkedInMcpServer({
        authService: logoutFailureAuthService(),
        createRequestId: () => 'req-logout-failure',
        now: () => new Date('2026-10-07T12:00:00.000Z'),
        version: '1.2.3',
      }),
    );
    const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    });
    const client = new Client({ name: 'linkedin-mcp-logout-error-test', version: '1.0.0' });

    try {
      await client.connect(transport);
      const result = await client.callTool({ name: 'linkedin.auth.logout', arguments: {} });

      expect(result.structuredContent).toMatchObject({
        status: 'failed',
        error: {
          code: 'provider_failure',
          retryable: false,
        },
        provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
        metadata: {
          requestId: 'req-logout-failure',
          timestamp: '2026-10-07T12:00:00.000Z',
        },
      });
      expect(JSON.stringify(result.structuredContent)).not.toContain('provider-private-detail');
    } finally {
      await client.close();
      await handler.close();
    }
  });
});

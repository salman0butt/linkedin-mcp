import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';

import type { AuthService } from '../src/auth/auth-service.js';
import { createLinkedInMcpServer } from '../src/create-server.js';

function connectedAuthService(): AuthService {
  return {
    startAuthorization() {
      return {
        authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization?safe=1',
        sessionId: 'session-id',
        scopes: ['openid', 'profile', 'email'],
        mode: 'confidential',
        expiresAt: '2026-10-07T12:05:00.000Z',
        provider: 'OFFICIAL_API',
      };
    },
    getStatus() {
      return Promise.resolve({
        state: 'connected',
        provider: 'OFFICIAL_API',
        mode: 'confidential',
        subject: 'member-123',
        scopes: ['openid', 'profile'],
        expiresAt: '2026-10-07T13:00:00.000Z',
        refreshAvailable: true,
      });
    },
    completeAuthorization() {
      return Promise.reject(new Error('MCP must not accept raw authorization codes'));
    },
    getProfile() {
      return Promise.resolve({
        sub: 'member-123',
        name: 'Example Member',
        email: 'member@example.test',
        emailVerified: true,
      });
    },
    logout() {
      return Promise.resolve({
        localCredentialsCleared: true,
        remoteRevocation: 'not_claimed',
        provider: 'OFFICIAL_API',
      });
    },
  };
}

async function withClient(
  authService: AuthService,
  run: (client: Client) => Promise<void>,
): Promise<void> {
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      authService,
      createRequestId: () => 'req-m01-auth',
      now: () => new Date('2026-10-07T12:00:00.000Z'),
      version: '1.2.3',
    }),
  );
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client({ name: 'linkedin-mcp-auth-test', version: '1.0.0' });

  try {
    await client.connect(transport);
    await run(client);
  } finally {
    await client.close();
    await handler.close();
  }
}

describe('M01 MCP auth/profile contract', () => {
  it('advertises the four M01 auth/profile tools with strict object schemas', async () => {
    await withClient(connectedAuthService(), async (client) => {
      const { tools } = await client.listTools();
      const authTools = tools.filter((tool) =>
        [
          'linkedin.auth.start',
          'linkedin.auth.status',
          'linkedin.profile.me',
          'linkedin.auth.logout',
        ].includes(tool.name),
      );

      expect(authTools.map((tool) => tool.name).sort()).toEqual([
        'linkedin.auth.logout',
        'linkedin.auth.start',
        'linkedin.auth.status',
        'linkedin.profile.me',
      ]);
      for (const tool of authTools) {
        expect(tool.inputSchema).toMatchObject({
          type: 'object',
          additionalProperties: false,
        });
        expect(tool.outputSchema).toMatchObject({ type: 'object' });
      }
    });
  });

  it('returns secret-safe official-provider results for start/status/profile/logout', async () => {
    await withClient(connectedAuthService(), async (client) => {
      const start = await client.callTool({ name: 'linkedin.auth.start', arguments: {} });
      expect(start.structuredContent).toMatchObject({
        status: 'human_action_required',
        data: {
          authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization?safe=1',
          sessionId: 'session-id',
          scopes: ['openid', 'profile', 'email'],
          mode: 'confidential',
          expiresAt: '2026-10-07T12:05:00.000Z',
          provider: 'OFFICIAL_API',
        },
        provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
        metadata: {
          requestId: 'req-m01-auth',
          timestamp: '2026-10-07T12:00:00.000Z',
        },
      });
      expect(JSON.stringify(start.structuredContent)).not.toMatch(/csrf-state|codeVerifier|access-token|refresh-token/i);

      const status = await client.callTool({ name: 'linkedin.auth.status', arguments: {} });
      expect(status.structuredContent).toMatchObject({
        status: 'succeeded',
        data: {
          state: 'connected',
          subject: 'member-123',
          scopes: ['openid', 'profile'],
          refreshAvailable: true,
        },
        provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
      });

      const profile = await client.callTool({ name: 'linkedin.profile.me', arguments: {} });
      expect(profile.structuredContent).toMatchObject({
        status: 'succeeded',
        data: {
          sub: 'member-123',
          name: 'Example Member',
          email: 'member@example.test',
          emailVerified: true,
        },
        provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
      });
      expect(JSON.stringify(profile.structuredContent)).not.toMatch(/access-token|refresh-token/i);

      const logout = await client.callTool({ name: 'linkedin.auth.logout', arguments: {} });
      expect(logout.structuredContent).toMatchObject({
        status: 'succeeded',
        data: {
          localCredentialsCleared: true,
          remoteRevocation: 'not_claimed',
          provider: 'OFFICIAL_API',
        },
        provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
      });
    });
  });

  it('projects profile.me as runtime AVAILABLE but not VERIFIED when a configured session is connected', async () => {
    await withClient(connectedAuthService(), async (client) => {
      const result = await client.callTool({ name: 'linkedin.capabilities', arguments: {} });
      const structured = result.structuredContent as
        | {
            data?: {
              capabilities?: Array<{
                id?: string;
                status?: string;
                availability?: string;
                provider?: string | null;
              }>;
            };
          }
        | undefined;
      const profile = structured?.data?.capabilities?.find((capability) => capability.id === 'profile.me');

      expect(profile).toMatchObject({
        id: 'profile.me',
        provider: 'OFFICIAL_API',
        status: 'ACTIVE',
        availability: 'AVAILABLE',
      });
      expect(profile?.status).not.toBe('VERIFIED');
    });
  });

  it('rejects unexpected arguments on the auth/profile tools', async () => {
    await withClient(connectedAuthService(), async (client) => {
      for (const name of [
        'linkedin.auth.start',
        'linkedin.auth.status',
        'linkedin.profile.me',
        'linkedin.auth.logout',
      ]) {
        const result = await client.callTool({ name, arguments: { unexpected: true } });
        expect(result.isError).toBe(true);
      }
    });
  });
});

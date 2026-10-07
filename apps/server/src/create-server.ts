import { randomUUID } from 'node:crypto';

import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { AuthService } from './auth/auth-service.js';
import {
  createCapabilitiesResult,
  createHealthResult,
  createLinkedInResult,
  createVersionResult,
} from './foundation.js';

export interface LinkedInMcpServerDeps {
  createRequestId?: () => string;
  now?: () => Date;
  version?: string;
  authService?: AuthService;
}

const emptyInputSchema = z.object({}).strict();
const metadataSchema = z.object({
  requestId: z.string(),
  timestamp: z.string(),
});
const healthOutputSchema = z.object({
  status: z.literal('succeeded'),
  data: z.object({
    ok: z.literal(true),
    service: z.literal('linkedin-mcp'),
    linkedinConnected: z.literal(false),
  }),
  provider: z.object({
    type: z.literal('LOCAL_ONLY'),
    name: z.literal('linkedin-mcp'),
  }),
  metadata: metadataSchema,
});
const versionOutputSchema = z.object({
  status: z.literal('succeeded'),
  data: z.object({
    name: z.literal('linkedin-mcp'),
    version: z.string(),
  }),
  provider: z.object({
    type: z.literal('LOCAL_ONLY'),
    name: z.literal('linkedin-mcp'),
  }),
  metadata: metadataSchema,
});
const capabilitiesOutputSchema = z.object({
  status: z.literal('succeeded'),
  data: z.object({
    capabilities: z.array(
      z.object({
        id: z.string(),
        desiredBehavior: z.string(),
        provider: z
          .enum(['OFFICIAL_API', 'PARTNER_API', 'EXTERNAL_DISCOVERY', 'BROWSER_INTERACTIVE', 'LOCAL_ONLY'])
          .nullable(),
        availability: z.enum(['AVAILABLE', 'UNAVAILABLE']),
        milestone: z.string(),
        status: z.enum(['PLANNED', 'ACTIVE', 'BLOCKED', 'VERIFIED', 'DEFERRED', 'REJECTED']),
        accessNote: z.string(),
        approvalRequired: z.boolean(),
        evidence: z.string().optional(),
      }),
    ),
  }),
  provider: z.object({
    type: z.literal('LOCAL_ONLY'),
    name: z.literal('linkedin-mcp'),
  }),
  metadata: metadataSchema,
});

const toolResultStatusSchema = z.enum([
  'succeeded',
  'requires_approval',
  'human_action_required',
  'unsupported',
  'permission_required',
  'partner_access_required',
  'restricted',
  'rate_limited',
  'duplicate',
  'partial',
  'failed',
]);
const linkedInProviderSchema = z.object({
  type: z.literal('OFFICIAL_API'),
  name: z.literal('LinkedIn'),
});
const linkedInErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});
const linkedInResultShape = {
  status: toolResultStatusSchema,
  provider: linkedInProviderSchema,
  warnings: z.array(z.string()).optional(),
  error: linkedInErrorSchema.optional(),
  metadata: metadataSchema,
};
const oauthModeSchema = z.enum(['confidential', 'native_pkce']);
const authStateSchema = z.enum([
  'not_configured',
  'disconnected',
  'authorization_pending',
  'connected',
  'expired',
  'reauth_required',
  'error',
]);
const authStartOutputSchema = z.object({
  ...linkedInResultShape,
  data: z
    .object({
      authorizationUrl: z.string(),
      sessionId: z.string(),
      scopes: z.array(z.string()),
      mode: oauthModeSchema,
      expiresAt: z.string(),
      provider: z.literal('OFFICIAL_API'),
    })
    .optional(),
});
const authStatusOutputSchema = z.object({
  ...linkedInResultShape,
  data: z
    .object({
      state: authStateSchema,
      provider: z.literal('OFFICIAL_API'),
      scopes: z.array(z.string()),
      refreshAvailable: z.boolean(),
      mode: oauthModeSchema.optional(),
      subject: z.string().optional(),
      expiresAt: z.string().optional(),
    })
    .optional(),
});
const profileOutputSchema = z.object({
  ...linkedInResultShape,
  data: z
    .object({
      sub: z.string(),
      name: z.string().optional(),
      givenName: z.string().optional(),
      familyName: z.string().optional(),
      picture: z.string().optional(),
      locale: z.string().optional(),
      email: z.string().optional(),
      emailVerified: z.boolean().optional(),
    })
    .optional(),
});
const logoutOutputSchema = z.object({
  ...linkedInResultShape,
  data: z
    .object({
      localCredentialsCleared: z.literal(true),
      remoteRevocation: z.literal('not_claimed'),
      provider: z.literal('OFFICIAL_API'),
    })
    .optional(),
});

export function createLinkedInMcpServer(deps: LinkedInMcpServerDeps = {}): McpServer {
  const createRequestId = deps.createRequestId ?? randomUUID;
  const now = deps.now ?? (() => new Date());
  const version = deps.version ?? '0.0.0';
  const server = new McpServer({ name: 'linkedin-mcp', version });

  server.registerTool(
    'linkedin.health',
    {
      description: 'Report local LinkedIn MCP server health without contacting LinkedIn.',
      inputSchema: emptyInputSchema,
      outputSchema: healthOutputSchema,
    },
    () => {
      const result = createHealthResult({ requestId: createRequestId(), now });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    },
  );

  server.registerTool(
    'linkedin.version',
    {
      description: 'Report local LinkedIn MCP server version metadata.',
      inputSchema: emptyInputSchema,
      outputSchema: versionOutputSchema,
    },
    () => {
      const result = createVersionResult({ requestId: createRequestId(), now, version });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    },
  );

  server.registerTool(
    'linkedin.capabilities',
    {
      description: 'Report truthful LinkedIn MCP capability state and provider provenance.',
      inputSchema: emptyInputSchema,
      outputSchema: capabilitiesOutputSchema,
    },
    async () => {
      const authStatus = deps.authService === undefined ? undefined : await deps.authService.getStatus();
      const result = createCapabilitiesResult({
        requestId: createRequestId(),
        now,
        profileAvailable: authStatus?.state === 'connected',
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    },
  );

  const authService = deps.authService;
  if (authService !== undefined) {
    server.registerTool(
      'linkedin.auth.start',
      {
        description: 'Start an explicit LinkedIn OAuth authorization attempt.',
        inputSchema: emptyInputSchema,
        outputSchema: authStartOutputSchema,
      },
      () => {
        const result = createLinkedInResult({
          status: 'human_action_required',
          data: authService.startAuthorization(),
          requestId: createRequestId(),
          now,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: { ...result },
        };
      },
    );

    server.registerTool(
      'linkedin.auth.status',
      {
        description: 'Report LinkedIn authentication state without exposing credentials.',
        inputSchema: emptyInputSchema,
        outputSchema: authStatusOutputSchema,
      },
      async () => {
        const result = createLinkedInResult({
          status: 'succeeded',
          data: await authService.getStatus(),
          requestId: createRequestId(),
          now,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: { ...result },
        };
      },
    );

    server.registerTool(
      'linkedin.profile.me',
      {
        description: 'Read the authenticated LinkedIn member identity through official OIDC userinfo.',
        inputSchema: emptyInputSchema,
        outputSchema: profileOutputSchema,
      },
      async () => {
        const result = createLinkedInResult({
          status: 'succeeded',
          data: await authService.getProfile(),
          requestId: createRequestId(),
          now,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: { ...result },
        };
      },
    );

    server.registerTool(
      'linkedin.auth.logout',
      {
        description: 'Clear local LinkedIn credentials without claiming remote token revocation.',
        inputSchema: emptyInputSchema,
        outputSchema: logoutOutputSchema,
      },
      async () => {
        const result = createLinkedInResult({
          status: 'succeeded',
          data: await authService.logout(),
          requestId: createRequestId(),
          now,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: { ...result },
        };
      },
    );
  }

  return server;
}

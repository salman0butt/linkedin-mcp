import { randomUUID } from 'node:crypto';

import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { AuthService } from './auth/auth-service.js';
import { createCapabilitiesResult, createHealthResult, createVersionResult } from './foundation.js';

export interface LinkedInMcpServerDeps {
  createRequestId?: () => string;
  now?: () => Date;
  version?: string;
  authService?: AuthService;
}

const emptyInputSchema = z.object({}).strict();
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
  metadata: z.object({
    requestId: z.string(),
    timestamp: z.string(),
  }),
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
  metadata: z.object({
    requestId: z.string(),
    timestamp: z.string(),
  }),
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
  metadata: z.object({
    requestId: z.string(),
    timestamp: z.string(),
  }),
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

  return server;
}

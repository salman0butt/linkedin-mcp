import { randomUUID } from 'node:crypto';

import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { createHealthResult, createVersionResult } from './foundation.js';

export interface LinkedInMcpServerDeps {
  createRequestId?: () => string;
  now?: () => Date;
  version?: string;
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

  return server;
}

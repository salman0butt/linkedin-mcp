import { randomUUID } from 'node:crypto';

import type { McpServer } from '@modelcontextprotocol/server';

import {
  createLinkedInMcpServer as createBaseLinkedInMcpServer,
  type LinkedInMcpServerDeps,
} from './create-server-base.js';
import { registerMediaPostTools } from './media-mcp.js';

export type { LinkedInMcpServerDeps } from './create-server-base.js';

export function createLinkedInMcpServer(deps: LinkedInMcpServerDeps = {}): McpServer {
  const createRequestId = deps.createRequestId ?? randomUUID;
  const now = deps.now ?? (() => new Date());
  const normalizedDeps: LinkedInMcpServerDeps = {
    ...deps,
    createRequestId,
    now,
  };
  const server = createBaseLinkedInMcpServer(normalizedDeps);

  registerMediaPostTools(server, {
    mediaPostService: normalizedDeps.publishing?.mediaPostService,
    createRequestId,
    now,
  });

  return server;
}

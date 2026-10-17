import { randomUUID } from 'node:crypto';

import type { McpServer } from '@modelcontextprotocol/server';

import {
  createLinkedInMcpServer as createBaseLinkedInMcpServer,
  type LinkedInMcpServerDeps as BaseLinkedInMcpServerDeps,
} from './create-server-base.js';
import { registerEngagementTools, type EngagementTools } from './engagement-mcp.js';
import { registerMediaPostTools } from './media-mcp.js';

export interface LinkedInMcpServerDeps extends BaseLinkedInMcpServerDeps {
  engagement?: EngagementTools;
}

export function createLinkedInMcpServer(deps: LinkedInMcpServerDeps = {}): McpServer {
  const createRequestId = deps.createRequestId ?? randomUUID;
  const now = deps.now ?? (() => new Date());
  const normalizedDeps: LinkedInMcpServerDeps = {
    ...deps,
    createRequestId,
    now,
  };
  const server = createBaseLinkedInMcpServer(normalizedDeps);
  const mediaPostService = normalizedDeps.publishing?.mediaPostService;

  registerMediaPostTools(server, {
    ...(mediaPostService === undefined ? {} : { mediaPostService }),
    createRequestId,
    now,
  });
  registerEngagementTools(server, {
    ...(normalizedDeps.engagement === undefined ? {} : { engagement: normalizedDeps.engagement }),
    createRequestId,
    now,
  });

  return server;
}

import { randomUUID } from 'node:crypto';

import type { McpServer } from '@modelcontextprotocol/server';

import {
  createLinkedInMcpServer as createBaseLinkedInMcpServer,
  type LinkedInMcpServerDeps as BaseLinkedInMcpServerDeps,
} from './create-server-base.js';
import { registerEngagementTools, type EngagementTools } from './engagement-mcp.js';
import { registerPostSearchTools } from './discovery-mcp.js';
import { registerMediaPostTools } from './media-mcp.js';
import type { PostSearchService } from './discovery/post-search-service.js';

export interface LinkedInMcpServerDeps extends BaseLinkedInMcpServerDeps {
  engagement?: EngagementTools;
  discovery?: PostSearchService;
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

  registerPostSearchTools(server, {
    ...(normalizedDeps.discovery === undefined ? {} : { discovery: normalizedDeps.discovery }),
    createRequestId,
    now,
  });

  return server;
}

import { randomUUID } from 'node:crypto';

import type { McpServer } from '@modelcontextprotocol/server';

import {
  createLinkedInMcpServer as createBaseLinkedInMcpServer,
  type LinkedInMcpServerDeps as BaseLinkedInMcpServerDeps,
} from './create-server-base.js';
import { registerEngagementTools, type EngagementTools } from './engagement-mcp.js';
import { registerPostSearchTools } from './discovery-mcp.js';
import { registerJobSearchTools } from './jobs-mcp.js';
import { registerJobIntelligenceTools } from './jobs-intelligence-mcp.js';
import { registerSavedJobTools, type LocalSavedJobsStore } from './jobs/job-saved-mcp.js';
import { registerMediaPostTools } from './media-mcp.js';
import type { PostSearchService } from './discovery/post-search-service.js';
import type { JobSearchService } from './jobs/job-search-service.js';

export interface LinkedInMcpServerDeps extends BaseLinkedInMcpServerDeps {
  engagement?: EngagementTools;
  discovery?: PostSearchService;
  jobs?: JobSearchService;
  jobStore?: LocalSavedJobsStore;
  transport?: 'stdio' | 'http';
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

  registerJobSearchTools(server, {
    ...(normalizedDeps.jobs === undefined ? {} : { jobs: normalizedDeps.jobs }),
    createRequestId,
    now,
  });

  registerJobIntelligenceTools(server, { createRequestId, now });

  registerSavedJobTools(server, {
    ...(normalizedDeps.jobStore === undefined ? {} : { jobStore: normalizedDeps.jobStore }),
    ...(normalizedDeps.transport === undefined ? {} : { transport: normalizedDeps.transport }),
    createRequestId,
    now,
  });

  return server;
}

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
import { registerArticleTools } from './article-mcp.js';
import { registerArticlePrompts } from './article-prompts.js';
import { registerResearchTools } from './research-mcp.js';
import { registerCalendarTools } from './calendar-mcp.js';
import { registerCalendarPlanTools } from './calendar-plan-mcp.js';
import type { LocalCalendarPlanStore } from './scheduling/calendar-plan-store.js';
import type { LocalArticleStore } from './articles/article-store.js';
import { registerSavedJobTools, type LocalSavedJobsStore } from './jobs/job-saved-mcp.js';
import { registerMediaPostTools } from './media-mcp.js';
import type { PostSearchService } from './discovery/post-search-service.js';
import type { JobSearchService } from './jobs/job-search-service.js';

export interface LinkedInMcpServerDeps extends BaseLinkedInMcpServerDeps {
  engagement?: EngagementTools;
  discovery?: PostSearchService;
  jobs?: JobSearchService;
  jobStore?: LocalSavedJobsStore;
  articleStore?: LocalArticleStore;
  calendarStore?: LocalCalendarPlanStore;
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
  registerResearchTools(server, { createRequestId, now });
  registerCalendarTools(server, { createRequestId, now });
  registerCalendarPlanTools(server, {
    ...(normalizedDeps.calendarStore === undefined ? {} : { calendarStore: normalizedDeps.calendarStore }),
    ...(normalizedDeps.transport === undefined ? {} : { transport: normalizedDeps.transport }),
    createRequestId,
    now,
  });

  registerArticlePrompts(server);
  registerArticleTools(server, {
    ...(normalizedDeps.articleStore === undefined ? {} : { articleStore: normalizedDeps.articleStore }),
    ...(normalizedDeps.transport === undefined ? {} : { transport: normalizedDeps.transport }),
    createRequestId,
    now,
  });

  registerSavedJobTools(server, {
    ...(normalizedDeps.jobStore === undefined ? {} : { jobStore: normalizedDeps.jobStore }),
    ...(normalizedDeps.transport === undefined ? {} : { transport: normalizedDeps.transport }),
    createRequestId,
    now,
  });

  return server;
}

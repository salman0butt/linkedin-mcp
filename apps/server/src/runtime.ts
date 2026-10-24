import { createAuthService, type AuthService } from './auth/auth-service.js';
import type { ServerConfig } from './config.js';
import {
  createPostSearchService,
  type DiscoveryProvider,
  type PostSearchService,
} from './discovery/post-search-service.js';
import {
  createJobSearchService,
  type JobProvider,
  type JobSearchService,
} from './jobs/job-search-service.js';
import { createLocalJobSaveStore } from './jobs/job-save-store.js';
import type { LocalSavedJobsStore } from './jobs/job-saved-mcp.js';
import {
  createEngagementReadService,
  type EngagementReadService,
} from './engagement/engagement-read-service.js';
import { createEngagementService, type EngagementService } from './engagement/engagement-service.js';
import { createLinkedInCommentsClient, type LinkedInCommentsClient } from './engagement/linkedin-comments.js';
import {
  createLinkedInReactionsClient,
  type LinkedInReactionsClient,
} from './engagement/linkedin-reactions.js';
import {
  createApprovalService,
  requireTrustedApprovalGrant,
  scopeApprovalService,
  type ApprovalService,
} from './publishing/approval-service.js';
import type { TrustedApprovalGrantConsumer } from './publishing/trusted-approval-grants.js';
import {
  createFileIdempotencyLedger,
  type IdempotencyLedger,
  type MediaIdempotencyLedger,
} from './publishing/idempotency-ledger.js';
import { createLinkedInImagesClient } from './publishing/linkedin-images.js';
import {
  createLinkedInPostsAdapter,
  type LinkedInPostsAdapter,
  type MediaLinkedInPostsAdapter,
} from './publishing/linkedin-posts.js';
import { MediaFileReader } from './publishing/media-file.js';
import { createMediaPostService, type MediaPostService } from './publishing/media-post-service.js';
import { createTextPostService, type TextPostService } from './publishing/text-post-service.js';

export interface LinkedInRuntime {
  version: string;
  authService: AuthService;
  discovery: PostSearchService;
  jobs: JobSearchService;
  transport: 'stdio' | 'http';
  jobStore?: LocalSavedJobsStore;
  publishing: {
    approvals: ApprovalService;
    textPostService?: TextPostService;
    mediaPostService?: MediaPostService;
  };
  engagement?: {
    reads: EngagementReadService;
    writes?: EngagementService;
  };
}

export interface LinkedInRuntimeOverrides {
  authService?: AuthService;
  approvals?: ApprovalService;
  trustedApprovalGrants?: TrustedApprovalGrantConsumer;
  ledger?: IdempotencyLedger;
  posts?: LinkedInPostsAdapter;
  comments?: LinkedInCommentsClient;
  reactions?: LinkedInReactionsClient;
  now?: () => Date;
  /** Trusted host-only adapters; never constructed from MCP arguments. Defaults to no providers. */
  discoveryProviders?: readonly DiscoveryProvider[];
  /** Authorized host-owned job search adapters; never supplied through MCP input. */
  jobProviders?: readonly JobProvider[];
}

function isMediaLedger(ledger: IdempotencyLedger): ledger is MediaIdempotencyLedger {
  return 'checkpointMedia' in ledger && typeof ledger.checkpointMedia === 'function';
}

function isMediaPostsAdapter(posts: LinkedInPostsAdapter): posts is MediaLinkedInPostsAdapter {
  return (
    'createImagePost' in posts &&
    typeof posts.createImagePost === 'function' &&
    'createMultiImagePost' in posts &&
    typeof posts.createMultiImagePost === 'function'
  );
}

export function createLinkedInRuntime(
  config: ServerConfig,
  overrides: LinkedInRuntimeOverrides = {},
): LinkedInRuntime {
  const authService =
    overrides.authService ??
    createAuthService(
      config.auth === undefined
        ? { ...(overrides.now === undefined ? {} : { now: overrides.now }) }
        : { config: config.auth, ...(overrides.now === undefined ? {} : { now: overrides.now }) },
    );
  const approvalStore = requireTrustedApprovalGrant(
    overrides.approvals ??
      createApprovalService({
        ...(overrides.now === undefined ? {} : { now: overrides.now }),
        ttlMs: config.publishingApprovalTtlMs,
      }),
    overrides.trustedApprovalGrants,
  );
  const textApprovals = scopeApprovalService(approvalStore, 'posts.text');

  let textPostService: TextPostService | undefined;
  let mediaPostService: MediaPostService | undefined;
  let ledger: IdempotencyLedger | undefined;
  if (config.linkedinApiVersion !== undefined && config.publishingLedgerPath !== undefined) {
    ledger =
      overrides.ledger ??
      createFileIdempotencyLedger({
        filePath: config.publishingLedgerPath,
        ...(overrides.now === undefined ? {} : { now: overrides.now }),
      });
    const posts = overrides.posts ?? createLinkedInPostsAdapter({ apiVersion: config.linkedinApiVersion });
    textPostService = createTextPostService({
      auth: authService,
      approvals: textApprovals,
      ledger,
      posts,
      memberPostReadEnabled: config.memberPostReadEnabled,
    });

    if (config.mediaRoot !== undefined && isMediaLedger(ledger) && isMediaPostsAdapter(posts)) {
      mediaPostService = createMediaPostService({
        auth: authService,
        approvals: scopeApprovalService(approvalStore, 'posts.media'),
        ledger,
        files: new MediaFileReader({
          root: config.mediaRoot,
          maxBytes: config.mediaMaxBytes,
        }),
        images: createLinkedInImagesClient({ apiVersion: config.linkedinApiVersion }),
        posts,
        imageStatusReadEnabled: config.imageStatusReadEnabled,
      });
    }
  }

  let engagement: LinkedInRuntime['engagement'];
  if (config.linkedinApiVersion !== undefined) {
    const comments =
      overrides.comments ?? createLinkedInCommentsClient({ apiVersion: config.linkedinApiVersion });
    const reads = createEngagementReadService({
      auth: authService,
      comments,
      enabled: config.engagementReadEnabled,
    });
    let writes: EngagementService | undefined;
    if (ledger !== undefined) {
      const reactions =
        overrides.reactions ?? createLinkedInReactionsClient({ apiVersion: config.linkedinApiVersion });
      writes = createEngagementService({
        auth: authService,
        approvals: approvalStore,
        ledger,
        comments,
        reactions,
      });
    }
    engagement = { reads, ...(writes === undefined ? {} : { writes }) };
  }

  const localJobStore =
    config.transport === 'stdio' && config.jobSavedPath !== undefined
      ? createLocalJobSaveStore({ transport: 'stdio', filePath: config.jobSavedPath })
      : null;
  return {
    version: config.serverVersion,
    transport: config.transport,
    authService,
    discovery: createPostSearchService({
      providers: overrides.discoveryProviders ?? [],
      ...(overrides.now === undefined ? {} : { now: overrides.now }),
    }),
    jobs: createJobSearchService({
      providers: overrides.jobProviders ?? [],
      ...(overrides.now === undefined ? {} : { now: overrides.now }),
    }),
    ...(localJobStore === null ? {} : { jobStore: localJobStore }),
    publishing: {
      approvals: textApprovals,
      ...(textPostService === undefined ? {} : { textPostService }),
      ...(mediaPostService === undefined ? {} : { mediaPostService }),
    },
    ...(engagement === undefined ? {} : { engagement }),
  };
}

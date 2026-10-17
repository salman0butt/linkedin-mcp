import { createAuthService, type AuthService } from './auth/auth-service.js';
import type { ServerConfig } from './config.js';
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
  scopeApprovalService,
  type ApprovalService,
} from './publishing/approval-service.js';
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
  ledger?: IdempotencyLedger;
  posts?: LinkedInPostsAdapter;
  comments?: LinkedInCommentsClient;
  reactions?: LinkedInReactionsClient;
  now?: () => Date;
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
  const approvalStore =
    overrides.approvals ??
    createApprovalService({
      ...(overrides.now === undefined ? {} : { now: overrides.now }),
      ttlMs: config.publishingApprovalTtlMs,
    });
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

  return {
    version: config.serverVersion,
    authService,
    publishing: {
      approvals: textApprovals,
      ...(textPostService === undefined ? {} : { textPostService }),
      ...(mediaPostService === undefined ? {} : { mediaPostService }),
    },
    ...(engagement === undefined ? {} : { engagement }),
  };
}

import { createAuthService, type AuthService } from './auth/auth-service.js';
import type { ServerConfig } from './config.js';
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
}

export interface LinkedInRuntimeOverrides {
  authService?: AuthService;
  approvals?: ApprovalService;
  ledger?: IdempotencyLedger;
  posts?: LinkedInPostsAdapter;
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
  if (config.linkedinApiVersion !== undefined && config.publishingLedgerPath !== undefined) {
    const ledger =
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

  return {
    version: config.serverVersion,
    authService,
    publishing: {
      approvals: textApprovals,
      ...(textPostService === undefined ? {} : { textPostService }),
      ...(mediaPostService === undefined ? {} : { mediaPostService }),
    },
  };
}

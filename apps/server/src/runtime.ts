import { createAuthService, type AuthService } from './auth/auth-service.js';
import type { ServerConfig } from './config.js';
import { createApprovalService, type ApprovalService } from './publishing/approval-service.js';
import { createFileIdempotencyLedger, type IdempotencyLedger } from './publishing/idempotency-ledger.js';
import { createLinkedInPostsAdapter, type LinkedInPostsAdapter } from './publishing/linkedin-posts.js';
import { createTextPostService, type TextPostService } from './publishing/text-post-service.js';

export interface LinkedInRuntime {
  version: string;
  authService: AuthService;
  publishing: {
    approvals: ApprovalService;
    textPostService?: TextPostService;
  };
}

export interface LinkedInRuntimeOverrides {
  authService?: AuthService;
  approvals?: ApprovalService;
  ledger?: IdempotencyLedger;
  posts?: LinkedInPostsAdapter;
  now?: () => Date;
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
  const approvals =
    overrides.approvals ??
    createApprovalService({
      ...(overrides.now === undefined ? {} : { now: overrides.now }),
      ttlMs: config.publishingApprovalTtlMs,
    });

  let textPostService: TextPostService | undefined;
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
      approvals,
      ledger,
      posts,
      memberPostReadEnabled: config.memberPostReadEnabled,
    });
  }

  return {
    version: config.serverVersion,
    authService,
    publishing: {
      approvals,
      ...(textPostService === undefined ? {} : { textPostService }),
    },
  };
}

import { randomUUID } from 'node:crypto';

import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { createTextPostPreview } from '../../../packages/core/dist/index.js';

import { AuthServiceError, type AuthService, type AuthStatus } from './auth/auth-service.js';
import {
  createCapabilitiesResult,
  createHealthResult,
  createLinkedInResult,
  createLocalAuditResult,
  createVersionResult,
} from './foundation.js';
import type { LinkedInRuntime } from './runtime.js';
import { ApprovalServiceError } from './publishing/approval-service.js';
import { isValidLinkedInPostUrn } from './publishing/linkedin-posts.js';
import { TextPostServiceError, type TextPostPublishResult } from './publishing/text-post-service.js';

export interface LinkedInMcpServerDeps {
  createRequestId?: () => string;
  now?: () => Date;
  version?: string;
  authService?: AuthService;
  publishing?: LinkedInRuntime['publishing'];
}

const emptyInputSchema = z.object({}).strict();
const metadataSchema = z.object({
  requestId: z.string(),
  timestamp: z.string(),
});
const auditMetadataSchema = z
  .object({
    requestId: z.string(),
    timestamp: z.string(),
    audit: z
      .object({
        operation: z.enum(['post.preview.text', 'post.approve.text', 'post.create.text']),
        payloadHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        replay: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();
const canonicalPayloadSchema = z
  .object({
    commentary: z
      .string()
      .max(3000)
      .refine((value) => value.trim().length > 0),
    visibility: z.enum(['PUBLIC', 'CONNECTIONS']),
    distribution: z
      .object({
        feedDistribution: z.literal('MAIN_FEED'),
        targetEntities: z.array(z.never()).length(0),
        thirdPartyDistributionChannels: z.array(z.never()).length(0),
      })
      .strict(),
    lifecycleState: z.literal('PUBLISHED'),
    isReshareDisabled: z.boolean(),
  })
  .strict();
const payloadDataSchema = z
  .object({
    ...canonicalPayloadSchema.shape,
  })
  .strict();
const previewDataSchema = z
  .object({
    payload: payloadDataSchema,
    canonicalJson: z.string(),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    provider: z.literal('OFFICIAL_API'),
    requiredScope: z.literal('w_member_social'),
  })
  .strict();
const approvalDataSchema = z
  .object({
    receiptId: z.string(),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.string(),
    provider: z.literal('LOCAL_ONLY'),
  })
  .strict();
const publishedDataSchema = z
  .object({
    state: z.literal('succeeded'),
    provider: z.literal('OFFICIAL_API'),
    postUrn: z
      .string()
      .regex(/^urn:li:(?:share|ugcPost):[0-9]+$/)
      .refine(isValidLinkedInPostUrn),
    replay: z.boolean(),
    verification: z.discriminatedUnion('state', [
      z.object({ state: z.literal('verified') }).strict(),
      z
        .object({ state: z.literal('created_unverified'), reason: z.literal('read_permission_unavailable') })
        .strict(),
      z
        .object({
          state: z.literal('verification_failed'),
          reason: z.enum([
            'post_mismatch',
            'reauth_required',
            'read_not_found',
            'rate_limited',
            'malformed_response',
            'provider_failure',
          ]),
        })
        .strict(),
    ]),
  })
  .strict();
const partialDataSchema = z.object({ state: z.literal('outcome_unknown') }).strict();
const textPostOutputSchema = z
  .object({
    status: z.enum([
      'succeeded',
      'requires_approval',
      'human_action_required',
      'permission_required',
      'rate_limited',
      'partial',
      'failed',
    ]),
    data: z.union([previewDataSchema, approvalDataSchema, publishedDataSchema, partialDataSchema]).optional(),
    provider: z.discriminatedUnion('type', [
      z.object({ type: z.literal('LOCAL_ONLY'), name: z.literal('linkedin-mcp') }).strict(),
      z.object({ type: z.literal('OFFICIAL_API'), name: z.literal('LinkedIn') }).strict(),
    ]),
    warnings: z.array(z.string()).optional(),
    error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).strict().optional(),
    metadata: auditMetadataSchema,
  })
  .strict();
const previewInputSchema = z
  .object({
    text: z
      .string()
      .max(3000)
      .refine((value) => value.trim().length > 0),
    visibility: z.enum(['PUBLIC', 'CONNECTIONS']).optional(),
    disableReshare: z.boolean().optional(),
  })
  .strict();
const approveInputSchema = z
  .object({
    payload: canonicalPayloadSchema,
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    approved: z.literal(true),
  })
  .strict();
const createInputSchema = z
  .object({
    payload: canonicalPayloadSchema,
    approvalReceiptId: z.unknown().optional(),
    idempotencyKey: z.string().refine((value) => value.trim().length > 0),
  })
  .strict();
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
  metadata: metadataSchema,
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
  metadata: metadataSchema,
});
const capabilitiesOutputSchema = z.object({
  status: z.literal('succeeded'),
  data: z.object({
    capabilities: z.array(
      z.object({
        id: z.string(),
        desiredBehavior: z.string(),
        provider: z
          .enum(['OFFICIAL_API', 'PARTNER_API', 'EXTERNAL_DISCOVERY', 'BROWSER_INTERACTIVE', 'LOCAL_ONLY'])
          .nullable(),
        availability: z.enum(['AVAILABLE', 'UNAVAILABLE']),
        milestone: z.string(),
        status: z.enum(['PLANNED', 'ACTIVE', 'BLOCKED', 'VERIFIED', 'DEFERRED', 'REJECTED']),
        accessNote: z.string(),
        approvalRequired: z.boolean(),
        evidence: z.string().optional(),
      }),
    ),
  }),
  provider: z.object({
    type: z.literal('LOCAL_ONLY'),
    name: z.literal('linkedin-mcp'),
  }),
  metadata: metadataSchema,
});

const toolResultStatusSchema = z.enum([
  'succeeded',
  'requires_approval',
  'human_action_required',
  'unsupported',
  'permission_required',
  'partner_access_required',
  'restricted',
  'rate_limited',
  'duplicate',
  'partial',
  'failed',
]);
const linkedInProviderSchema = z.object({
  type: z.literal('OFFICIAL_API'),
  name: z.literal('LinkedIn'),
});
const linkedInErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});
const linkedInResultShape = {
  status: toolResultStatusSchema,
  provider: linkedInProviderSchema,
  warnings: z.array(z.string()).optional(),
  error: linkedInErrorSchema.optional(),
  metadata: metadataSchema,
};
const oauthModeSchema = z.enum(['confidential', 'native_pkce']);
const authStateSchema = z.enum([
  'not_configured',
  'disconnected',
  'authorization_pending',
  'connected',
  'expired',
  'reauth_required',
  'error',
]);
const authStartOutputSchema = z.object({
  ...linkedInResultShape,
  data: z
    .object({
      authorizationUrl: z.string(),
      sessionId: z.string(),
      scopes: z.array(z.string()),
      mode: oauthModeSchema,
      expiresAt: z.string(),
      provider: z.literal('OFFICIAL_API'),
    })
    .optional(),
});
const authStatusOutputSchema = z.object({
  ...linkedInResultShape,
  data: z
    .object({
      state: authStateSchema,
      provider: z.literal('OFFICIAL_API'),
      scopes: z.array(z.string()),
      refreshAvailable: z.boolean(),
      mode: oauthModeSchema.optional(),
      subject: z.string().optional(),
      expiresAt: z.string().optional(),
    })
    .optional(),
});
const profileOutputSchema = z.object({
  ...linkedInResultShape,
  data: z
    .object({
      sub: z.string(),
      name: z.string().optional(),
      givenName: z.string().optional(),
      familyName: z.string().optional(),
      picture: z.string().optional(),
      locale: z.string().optional(),
      email: z.string().optional(),
      emailVerified: z.boolean().optional(),
    })
    .optional(),
});
const logoutOutputSchema = z.object({
  ...linkedInResultShape,
  data: z
    .object({
      localCredentialsCleared: z.literal(true),
      remoteRevocation: z.literal('not_claimed'),
      provider: z.literal('OFFICIAL_API'),
    })
    .optional(),
});

function authStatusResultStatus(state: AuthStatus['state']) {
  if (state === 'authorization_pending') return 'human_action_required' as const;
  if (state === 'error') return 'failed' as const;
  if (
    state === 'not_configured' ||
    state === 'disconnected' ||
    state === 'expired' ||
    state === 'reauth_required'
  ) {
    return 'permission_required' as const;
  }
  return 'succeeded' as const;
}

function createAuthErrorResult(error: unknown, requestId: string, now: () => Date) {
  if (error instanceof AuthServiceError) {
    const status =
      error.kind === 'rate_limited'
        ? ('rate_limited' as const)
        : error.kind === 'provider_failure'
          ? ('failed' as const)
          : ('permission_required' as const);

    return createLinkedInResult({
      status,
      error: {
        code: error.kind,
        message: 'LinkedIn authentication request did not complete.',
        retryable: error.retryable,
      },
      requestId,
      now,
    });
  }

  return createLinkedInResult({
    status: 'failed',
    error: {
      code: 'provider_failure',
      message: 'LinkedIn authentication request did not complete.',
      retryable: false,
    },
    requestId,
    now,
  });
}

export function createLinkedInMcpServer(deps: LinkedInMcpServerDeps = {}): McpServer {
  const createRequestId = deps.createRequestId ?? randomUUID;
  const now = deps.now ?? (() => new Date());
  const version = deps.version ?? '0.0.0';
  const server = new McpServer({ name: 'linkedin-mcp', version });

  const textPostResponse = (result: ReturnType<typeof createLocalAuditResult>) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: { ...result },
  });

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

  server.registerTool(
    'linkedin.post.preview.text',
    {
      description:
        'Build a local canonical preview for a text post; this does not publish or create an approval.',
      inputSchema: previewInputSchema,
      outputSchema: textPostOutputSchema,
    },
    (input) => {
      const preview = createTextPostPreview({
        text: input.text,
        ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
        ...(input.disableReshare === undefined ? {} : { disableReshare: input.disableReshare }),
      });
      const result = createLocalAuditResult({
        status: 'succeeded',
        data: preview,
        operation: 'post.preview.text',
        payloadHash: preview.payloadHash,
        requestId: createRequestId(),
        now,
      });
      return textPostResponse(result);
    },
  );

  server.registerTool(
    'linkedin.post.approve.text',
    {
      description:
        'Issue a short-lived receipt after explicit approval intent and local member-status checks.',
      inputSchema: approveInputSchema,
      outputSchema: textPostOutputSchema,
    },
    async (input) => {
      const requestId = createRequestId();
      const localFailure = (
        status: 'human_action_required' | 'permission_required' | 'failed',
        code: string,
        message: string,
        payloadHash?: string,
      ) =>
        createLocalAuditResult({
          status,
          provider: 'LOCAL_ONLY',
          operation: 'post.approve.text',
          ...(payloadHash === undefined ? {} : { payloadHash }),
          error: { code, message, retryable: false },
          requestId,
          now,
        });

      const computed = createTextPostPreview({
        text: input.payload.commentary,
        visibility: input.payload.visibility,
        disableReshare: input.payload.isReshareDisabled,
      });
      if (computed.payloadHash !== input.payloadHash) {
        return textPostResponse(
          localFailure(
            'failed',
            'payload_hash_mismatch',
            'Approval payload hash did not match.',
            computed.payloadHash,
          ),
        );
      }
      if (deps.authService === undefined || deps.publishing === undefined) {
        return textPostResponse(
          localFailure(
            'permission_required',
            'auth_unconfigured',
            'Local LinkedIn authorization is required.',
            computed.payloadHash,
          ),
        );
      }

      let status: AuthStatus;
      try {
        status = await deps.authService.getStatus();
      } catch {
        return textPostResponse(
          localFailure(
            'failed',
            'provider_failure',
            'Local authorization status could not be read.',
            computed.payloadHash,
          ),
        );
      }
      if (status.state === 'authorization_pending') {
        return textPostResponse(
          localFailure(
            'human_action_required',
            'authorization_pending',
            'Complete local LinkedIn authorization before approving.',
            computed.payloadHash,
          ),
        );
      }
      if (status.state === 'error') {
        return textPostResponse(
          localFailure(
            'failed',
            'provider_failure',
            'Local authorization status could not be read.',
            computed.payloadHash,
          ),
        );
      }
      if (
        status.state !== 'connected' ||
        typeof status.subject !== 'string' ||
        status.subject.trim() === ''
      ) {
        return textPostResponse(
          localFailure(
            'permission_required',
            status.state === 'connected' ? 'subject_unavailable' : status.state,
            'A connected LinkedIn member is required for approval.',
            computed.payloadHash,
          ),
        );
      }
      if (!status.scopes.includes('w_member_social')) {
        return textPostResponse(
          localFailure(
            'permission_required',
            'permission_required',
            'The member publishing permission is required.',
            computed.payloadHash,
          ),
        );
      }
      try {
        const receipt = deps.publishing.approvals.issue({
          payloadHash: computed.payloadHash,
          subject: status.subject,
        });
        const result = createLocalAuditResult({
          status: 'succeeded',
          data: receipt,
          operation: 'post.approve.text',
          payloadHash: computed.payloadHash,
          requestId,
          now,
        });
        return textPostResponse(result);
      } catch {
        return textPostResponse(
          localFailure(
            'failed',
            'approval_failure',
            'Approval could not be recorded locally.',
            computed.payloadHash,
          ),
        );
      }
    },
  );

  server.registerTool(
    'linkedin.post.create.text',
    {
      description:
        'Publish an approved text post with a receipt and idempotency key; receipt must be the string returned by the approval tool.',
      inputSchema: createInputSchema,
      outputSchema: textPostOutputSchema,
    },
    async (input) => {
      const requestId = createRequestId();
      const computed = createTextPostPreview({
        text: input.payload.commentary,
        visibility: input.payload.visibility,
        disableReshare: input.payload.isReshareDisabled,
      });
      const failure = (
        status:
          | 'requires_approval'
          | 'permission_required'
          | 'human_action_required'
          | 'rate_limited'
          | 'partial'
          | 'failed',
        code: string,
        message: string,
        data?: { state: 'outcome_unknown' },
      ) =>
        createLocalAuditResult({
          status,
          provider: 'OFFICIAL_API',
          operation: 'post.create.text',
          payloadHash: computed.payloadHash,
          ...(data === undefined ? {} : { data }),
          error: { code, message, retryable: false },
          requestId,
          now,
        });

      if (typeof input.approvalReceiptId !== 'string' || input.approvalReceiptId.trim() === '') {
        return textPostResponse(
          failure('requires_approval', 'approval_required', 'A valid approval receipt is required.'),
        );
      }
      if (deps.publishing?.textPostService === undefined) {
        return textPostResponse(
          failure('permission_required', 'publishing_not_configured', 'Text publishing is not configured.'),
        );
      }

      try {
        const published: TextPostPublishResult = await deps.publishing.textPostService.publish({
          payload: computed.payload,
          approvalReceiptId: input.approvalReceiptId,
          idempotencyKey: input.idempotencyKey,
        });
        const warnings =
          published.verification.state === 'verified'
            ? undefined
            : ['The post was created, but read confirmation is unavailable or did not match.'];
        const result = createLocalAuditResult({
          status: 'succeeded',
          provider: 'OFFICIAL_API',
          data: published,
          operation: 'post.create.text',
          payloadHash: computed.payloadHash,
          replay: published.replay,
          ...(warnings === undefined ? {} : { warnings }),
          requestId,
          now,
        });
        return textPostResponse(result);
      } catch (error: unknown) {
        if (error instanceof TextPostServiceError) {
          switch (error.kind) {
            case 'approval_mismatch':
            case 'approval_expired':
            case 'approval_not_found':
            case 'approval_consumed':
              return textPostResponse(
                failure('requires_approval', error.kind, 'A valid approval receipt is required.'),
              );
            case 'auth_unconfigured':
              return textPostResponse(
                failure(
                  'permission_required',
                  'auth_unconfigured',
                  'LinkedIn member authorization is not configured.',
                ),
              );
            case 'not_connected':
            case 'reauth_required':
            case 'permission_required':
              return textPostResponse(
                failure('permission_required', error.kind, 'LinkedIn member authorization is required.'),
              );
            case 'rate_limited':
              return textPostResponse(
                failure('rate_limited', 'rate_limited', 'LinkedIn rate limits prevented this operation.'),
              );
            case 'outcome_unknown':
              return textPostResponse(
                failure(
                  'partial',
                  'outcome_unknown',
                  'The post outcome is unknown; do not retry with a new key.',
                  { state: 'outcome_unknown' },
                ),
              );
            case 'invalid_payload':
            case 'idempotency_conflict':
            case 'storage_failure':
            case 'provider_conflict':
              return textPostResponse(failure('failed', error.kind, 'Text publishing did not complete.'));
          }
        }
        if (error instanceof ApprovalServiceError) {
          return textPostResponse(
            failure('requires_approval', 'approval_required', 'A valid approval receipt is required.'),
          );
        }
        if (error instanceof AuthServiceError) {
          return textPostResponse(
            failure(
              'permission_required',
              'permission_required',
              'LinkedIn member authorization is required.',
            ),
          );
        }
        return textPostResponse(failure('failed', 'provider_failure', 'Text publishing did not complete.'));
      }
    },
  );

  server.registerTool(
    'linkedin.capabilities',
    {
      description: 'Report truthful LinkedIn MCP capability state and provider provenance.',
      inputSchema: emptyInputSchema,
      outputSchema: capabilitiesOutputSchema,
    },
    async () => {
      const authStatus = deps.authService === undefined ? undefined : await deps.authService.getStatus();
      const result = createCapabilitiesResult({
        requestId: createRequestId(),
        now,
        profileAvailable: authStatus?.state === 'connected',
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    },
  );

  const authService = deps.authService;
  if (authService !== undefined) {
    server.registerTool(
      'linkedin.auth.start',
      {
        description: 'Start an explicit LinkedIn OAuth authorization attempt.',
        inputSchema: emptyInputSchema,
        outputSchema: authStartOutputSchema,
      },
      () => {
        const requestId = createRequestId();
        let result;
        try {
          result = createLinkedInResult({
            status: 'human_action_required',
            data: authService.startAuthorization(),
            requestId,
            now,
          });
        } catch (error: unknown) {
          result = createAuthErrorResult(error, requestId, now);
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: { ...result },
        };
      },
    );

    server.registerTool(
      'linkedin.auth.status',
      {
        description: 'Report LinkedIn authentication state without exposing credentials.',
        inputSchema: emptyInputSchema,
        outputSchema: authStatusOutputSchema,
      },
      async () => {
        const status = await authService.getStatus();
        const result = createLinkedInResult({
          status: authStatusResultStatus(status.state),
          data: status,
          requestId: createRequestId(),
          now,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: { ...result },
        };
      },
    );

    server.registerTool(
      'linkedin.profile.me',
      {
        description: 'Read the authenticated LinkedIn member identity through official OIDC userinfo.',
        inputSchema: emptyInputSchema,
        outputSchema: profileOutputSchema,
      },
      async () => {
        const requestId = createRequestId();
        let result;
        try {
          result = createLinkedInResult({
            status: 'succeeded',
            data: await authService.getProfile(),
            requestId,
            now,
          });
        } catch (error: unknown) {
          result = createAuthErrorResult(error, requestId, now);
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: { ...result },
        };
      },
    );

    server.registerTool(
      'linkedin.auth.logout',
      {
        description: 'Clear local LinkedIn credentials without claiming remote token revocation.',
        inputSchema: emptyInputSchema,
        outputSchema: logoutOutputSchema,
      },
      async () => {
        const requestId = createRequestId();
        let result;
        try {
          result = createLinkedInResult({
            status: 'succeeded',
            data: await authService.logout(),
            requestId,
            now,
          });
        } catch (error: unknown) {
          result = createAuthErrorResult(error, requestId, now);
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: { ...result },
        };
      },
    );
  }

  return server;
}

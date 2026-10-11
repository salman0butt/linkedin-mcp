import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { createLocalAuditResult } from './foundation.js';
import {
  MediaPostServiceError,
  type ImagePostDraft,
  type MediaPostService,
  type MultiImagePostDraft,
} from './publishing/media-post-service.js';
import { isValidLinkedInPostUrn } from './publishing/linkedin-posts.js';

interface RegisterMediaPostToolsDeps {
  mediaPostService?: MediaPostService;
  createRequestId: () => string;
  now: () => Date;
}

type MediaOperation =
  | 'post.preview.image'
  | 'post.approve.image'
  | 'post.create.image'
  | 'post.preview.multi_image'
  | 'post.approve.multi_image'
  | 'post.create.multi_image';

const payloadHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const mediaSourceSchema = z
  .object({
    sourcePath: z.string().refine((value) => value.trim().length > 0),
    altText: z.string().max(4086),
  })
  .strict();
const imageDraftSchema = z
  .object({
    text: z
      .string()
      .max(3000)
      .refine((value) => value.trim().length > 0),
    image: mediaSourceSchema,
    visibility: z.enum(['PUBLIC', 'CONNECTIONS']).optional(),
    disableReshare: z.boolean().optional(),
  })
  .strict();
const multiImageDraftSchema = z
  .object({
    text: z
      .string()
      .max(3000)
      .refine((value) => value.trim().length > 0),
    images: z.array(mediaSourceSchema).min(2).max(20),
    visibility: z.enum(['PUBLIC', 'CONNECTIONS']).optional(),
    disableReshare: z.boolean().optional(),
  })
  .strict();
const approveMediaInputSchema = z
  .object({
    payloadHash: payloadHashSchema,
    approved: z.literal(true),
  })
  .strict();
const createImageInputSchema = z
  .object({
    draft: imageDraftSchema,
    payloadHash: payloadHashSchema,
    approvalReceiptId: z.string().refine((value) => value.trim().length > 0),
    idempotencyKey: z.string().refine((value) => value.trim().length > 0),
  })
  .strict();
const createMultiImageInputSchema = z
  .object({
    draft: multiImageDraftSchema,
    payloadHash: payloadHashSchema,
    approvalReceiptId: z.string().refine((value) => value.trim().length > 0),
    idempotencyKey: z.string().refine((value) => value.trim().length > 0),
  })
  .strict();

const canonicalDistributionSchema = z
  .object({
    feedDistribution: z.literal('MAIN_FEED'),
    targetEntities: z.array(z.never()).length(0),
    thirdPartyDistributionChannels: z.array(z.never()).length(0),
  })
  .strict();
const canonicalImageDescriptorSchema = z
  .object({
    sourceName: z.string(),
    sha256: payloadHashSchema,
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/gif']),
    byteLength: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    frameCount: z.number().int().nonnegative().optional(),
    altText: z.string().max(4086),
  })
  .strict();
const canonicalPayloadBase = {
  commentary: z.string().max(3000),
  visibility: z.enum(['PUBLIC', 'CONNECTIONS']),
  distribution: canonicalDistributionSchema,
  lifecycleState: z.literal('PUBLISHED'),
  isReshareDisabled: z.boolean(),
};
const imagePreviewSchema = z
  .object({
    payload: z
      .object({
        contentKind: z.literal('image'),
        ...canonicalPayloadBase,
        media: canonicalImageDescriptorSchema,
      })
      .strict(),
    canonicalJson: z.string(),
    payloadHash: payloadHashSchema,
    provider: z.literal('OFFICIAL_API'),
    requiredScope: z.literal('w_member_social'),
    warnings: z.array(z.string()),
  })
  .strict();
const multiImagePreviewSchema = z
  .object({
    payload: z
      .object({
        contentKind: z.literal('multi_image'),
        ...canonicalPayloadBase,
        media: z.array(canonicalImageDescriptorSchema).min(2).max(20),
      })
      .strict(),
    canonicalJson: z.string(),
    payloadHash: payloadHashSchema,
    provider: z.literal('OFFICIAL_API'),
    requiredScope: z.literal('w_member_social'),
    warnings: z.array(z.string()),
  })
  .strict();
const approvalReceiptSchema = z
  .object({
    receiptId: z.string(),
    payloadHash: payloadHashSchema,
    expiresAt: z.string(),
    provider: z.literal('LOCAL_ONLY'),
  })
  .strict();
const processingSchema = z.enum([
  'available',
  'processing_failed',
  'pending',
  'verification_unavailable',
]);
const publishResultSchema = z
  .object({
    state: z.literal('succeeded'),
    provider: z.literal('OFFICIAL_API'),
    postUrn: z
      .string()
      .regex(/^urn:li:(?:share|ugcPost):[0-9]+$/)
      .refine(isValidLinkedInPostUrn),
    imageUrns: z
      .array(z.string().regex(/^urn:li:image:[A-Za-z0-9_-]+$/))
      .min(1)
      .max(20),
    processing: z.array(processingSchema).min(1).max(20),
    replay: z.boolean(),
  })
  .strict();
const partialResultSchema = z.object({ state: z.literal('outcome_unknown') }).strict();
const auditMetadataSchema = z
  .object({
    requestId: z.string(),
    timestamp: z.string(),
    audit: z
      .object({
        operation: z.enum([
          'post.preview.image',
          'post.approve.image',
          'post.create.image',
          'post.preview.multi_image',
          'post.approve.multi_image',
          'post.create.multi_image',
        ]),
        payloadHash: payloadHashSchema.optional(),
        replay: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();
const mediaOutputSchema = z
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
    data: z
      .union([
        imagePreviewSchema,
        multiImagePreviewSchema,
        approvalReceiptSchema,
        publishResultSchema,
        partialResultSchema,
      ])
      .optional(),
    provider: z.discriminatedUnion('type', [
      z.object({ type: z.literal('LOCAL_ONLY'), name: z.literal('linkedin-mcp') }).strict(),
      z.object({ type: z.literal('OFFICIAL_API'), name: z.literal('LinkedIn') }).strict(),
    ]),
    warnings: z.array(z.string()).optional(),
    error: z
      .object({ code: z.string(), message: z.string(), retryable: z.boolean() })
      .strict()
      .optional(),
    metadata: auditMetadataSchema,
  })
  .strict();

function response(result: ReturnType<typeof createLocalAuditResult>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: { ...result },
  };
}

function unavailable(
  operation: MediaOperation,
  provider: 'LOCAL_ONLY' | 'OFFICIAL_API',
  deps: RegisterMediaPostToolsDeps,
) {
  return response(
    createLocalAuditResult({
      status: 'permission_required',
      provider,
      operation,
      error: {
        code: 'publishing_not_configured',
        message: 'Media publishing is not configured.',
        retryable: false,
      },
      requestId: deps.createRequestId(),
      now: deps.now,
    }),
  );
}

function mapFailure(
  error: unknown,
  operation: MediaOperation,
  provider: 'LOCAL_ONLY' | 'OFFICIAL_API',
  deps: RegisterMediaPostToolsDeps,
  payloadHash?: string,
) {
  let status:
    | 'requires_approval'
    | 'human_action_required'
    | 'permission_required'
    | 'rate_limited'
    | 'partial'
    | 'failed' = 'failed';
  let code = 'provider_failure';
  let message = 'Media publishing did not complete.';
  let data: { state: 'outcome_unknown' } | undefined;

  if (error instanceof MediaPostServiceError) {
    code = error.kind;
    switch (error.kind) {
      case 'approval_mismatch':
      case 'approval_expired':
      case 'approval_not_found':
      case 'approval_consumed':
        status = 'requires_approval';
        message = 'A valid approval receipt is required.';
        break;
      case 'auth_unconfigured':
      case 'not_connected':
      case 'reauth_required':
      case 'permission_required':
        status = 'permission_required';
        message = 'LinkedIn member authorization is required.';
        break;
      case 'media_not_configured':
        status = 'permission_required';
        code = 'publishing_not_configured';
        message = 'Media publishing is not configured.';
        break;
      case 'rate_limited':
        status = 'rate_limited';
        message = 'LinkedIn rate limits prevented this operation.';
        break;
      case 'media_processing_pending':
        status = 'human_action_required';
        message = 'LinkedIn media processing is still pending; retry with the same idempotency key.';
        break;
      case 'outcome_unknown':
        status = 'partial';
        data = { state: 'outcome_unknown' };
        message = 'The remote outcome is unknown; do not retry with a new idempotency key.';
        break;
      default:
        status = 'failed';
        message = 'Media publishing did not complete.';
    }
  }

  return response(
    createLocalAuditResult({
      status,
      provider,
      operation,
      ...(payloadHash === undefined ? {} : { payloadHash }),
      ...(data === undefined ? {} : { data }),
      error: { code, message, retryable: false },
      requestId: deps.createRequestId(),
      now: deps.now,
    }),
  );
}

function imageDraft(input: z.infer<typeof imageDraftSchema>): ImagePostDraft {
  return {
    text: input.text,
    image: { ...input.image },
    ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
    ...(input.disableReshare === undefined ? {} : { disableReshare: input.disableReshare }),
  };
}

function multiImageDraft(input: z.infer<typeof multiImageDraftSchema>): MultiImagePostDraft {
  return {
    text: input.text,
    images: input.images.map((image) => ({ ...image })),
    ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
    ...(input.disableReshare === undefined ? {} : { disableReshare: input.disableReshare }),
  };
}

export function registerMediaPostTools(server: McpServer, deps: RegisterMediaPostToolsDeps): void {
  server.registerTool(
    'linkedin.post.preview.image',
    {
      description:
        'Build a local canonical preview for a single-image member post without publishing it.',
      inputSchema: imageDraftSchema,
      outputSchema: mediaOutputSchema,
    },
    async (input) => {
      if (deps.mediaPostService === undefined) {
        return unavailable('post.preview.image', 'LOCAL_ONLY', deps);
      }
      try {
        const preview = await deps.mediaPostService.previewImage(imageDraft(input));
        return response(
          createLocalAuditResult({
            status: 'succeeded',
            data: preview,
            operation: 'post.preview.image',
            payloadHash: preview.payloadHash,
            requestId: deps.createRequestId(),
            now: deps.now,
          }),
        );
      } catch (error: unknown) {
        return mapFailure(error, 'post.preview.image', 'LOCAL_ONLY', deps);
      }
    },
  );

  server.registerTool(
    'linkedin.post.approve.image',
    {
      description:
        'Issue a short-lived subject-bound approval receipt for a previously previewed image post.',
      inputSchema: approveMediaInputSchema,
      outputSchema: mediaOutputSchema,
    },
    async (input) => {
      if (deps.mediaPostService === undefined) {
        return unavailable('post.approve.image', 'LOCAL_ONLY', deps);
      }
      try {
        const receipt = await deps.mediaPostService.approve({ payloadHash: input.payloadHash });
        return response(
          createLocalAuditResult({
            status: 'succeeded',
            data: receipt,
            operation: 'post.approve.image',
            payloadHash: input.payloadHash,
            requestId: deps.createRequestId(),
            now: deps.now,
          }),
        );
      } catch (error: unknown) {
        return mapFailure(error, 'post.approve.image', 'LOCAL_ONLY', deps, input.payloadHash);
      }
    },
  );

  server.registerTool(
    'linkedin.post.create.image',
    {
      description:
        'Publish an approved single-image member post using the existing approval and idempotency boundaries.',
      inputSchema: createImageInputSchema,
      outputSchema: mediaOutputSchema,
    },
    async (input) => {
      if (deps.mediaPostService === undefined) {
        return unavailable('post.create.image', 'OFFICIAL_API', deps);
      }
      try {
        const draft = imageDraft(input.draft);
        const published = await deps.mediaPostService.createImage({
          draft,
          payloadHash: input.payloadHash,
          approvalReceiptId: input.approvalReceiptId,
          idempotencyKey: input.idempotencyKey,
        });
        return response(
          createLocalAuditResult({
            status: 'succeeded',
            provider: 'OFFICIAL_API',
            data: published,
            operation: 'post.create.image',
            payloadHash: input.payloadHash,
            replay: published.replay,
            requestId: deps.createRequestId(),
            now: deps.now,
          }),
        );
      } catch (error: unknown) {
        return mapFailure(error, 'post.create.image', 'OFFICIAL_API', deps, input.payloadHash);
      }
    },
  );

  server.registerTool(
    'linkedin.post.preview.multi_image',
    {
      description:
        'Build a local canonical preview for an ordered 2–20 image member post without publishing it.',
      inputSchema: multiImageDraftSchema,
      outputSchema: mediaOutputSchema,
    },
    async (input) => {
      if (deps.mediaPostService === undefined) {
        return unavailable('post.preview.multi_image', 'LOCAL_ONLY', deps);
      }
      try {
        const preview = await deps.mediaPostService.previewMultiImage(multiImageDraft(input));
        return response(
          createLocalAuditResult({
            status: 'succeeded',
            data: preview,
            operation: 'post.preview.multi_image',
            payloadHash: preview.payloadHash,
            requestId: deps.createRequestId(),
            now: deps.now,
          }),
        );
      } catch (error: unknown) {
        return mapFailure(error, 'post.preview.multi_image', 'LOCAL_ONLY', deps);
      }
    },
  );

  server.registerTool(
    'linkedin.post.approve.multi_image',
    {
      description:
        'Issue a short-lived subject-bound approval receipt for a previously previewed multi-image post.',
      inputSchema: approveMediaInputSchema,
      outputSchema: mediaOutputSchema,
    },
    async (input) => {
      if (deps.mediaPostService === undefined) {
        return unavailable('post.approve.multi_image', 'LOCAL_ONLY', deps);
      }
      try {
        const receipt = await deps.mediaPostService.approve({ payloadHash: input.payloadHash });
        return response(
          createLocalAuditResult({
            status: 'succeeded',
            data: receipt,
            operation: 'post.approve.multi_image',
            payloadHash: input.payloadHash,
            requestId: deps.createRequestId(),
            now: deps.now,
          }),
        );
      } catch (error: unknown) {
        return mapFailure(error, 'post.approve.multi_image', 'LOCAL_ONLY', deps, input.payloadHash);
      }
    },
  );

  server.registerTool(
    'linkedin.post.create.multi_image',
    {
      description:
        'Publish an approved ordered 2–20 image member post using approval and idempotency boundaries.',
      inputSchema: createMultiImageInputSchema,
      outputSchema: mediaOutputSchema,
    },
    async (input) => {
      if (deps.mediaPostService === undefined) {
        return unavailable('post.create.multi_image', 'OFFICIAL_API', deps);
      }
      try {
        const draft = multiImageDraft(input.draft);
        const published = await deps.mediaPostService.createMultiImage({
          draft,
          payloadHash: input.payloadHash,
          approvalReceiptId: input.approvalReceiptId,
          idempotencyKey: input.idempotencyKey,
        });
        return response(
          createLocalAuditResult({
            status: 'succeeded',
            provider: 'OFFICIAL_API',
            data: published,
            operation: 'post.create.multi_image',
            payloadHash: input.payloadHash,
            replay: published.replay,
            requestId: deps.createRequestId(),
            now: deps.now,
          }),
        );
      } catch (error: unknown) {
        return mapFailure(error, 'post.create.multi_image', 'OFFICIAL_API', deps, input.payloadHash);
      }
    },
  );
}

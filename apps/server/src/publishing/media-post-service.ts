import { createHash } from 'node:crypto';

import {
  createImagePostPreviewFromDescriptors,
  createMultiImagePostPreviewFromDescriptors,
  type CanonicalImageDescriptor,
  type ImagePostPreview,
  type MultiImagePostPreview,
} from '../../../../packages/core/dist/index.js';
import { AuthServiceError, type AuthService } from '../auth/auth-service.js';
import {
  ApprovalServiceError,
  type ApprovalReceipt,
  type ApprovalService,
} from './approval-service.js';
import {
  IdempotencyLedgerError,
  type MediaIdempotencyLedger,
  type MutationRecord,
  type ReserveMutationResult,
} from './idempotency-ledger.js';
import { LinkedInImagesError, type LinkedInImagesClient } from './linkedin-images.js';
import {
  isValidLinkedInPostUrn,
  LinkedInPostsError,
  type LinkedInPostCreateResult,
  type LinkedInPostsAdapter,
} from './linkedin-posts.js';
import {
  MediaFileError,
  type MediaFileErrorCode,
  type MediaFileReader,
  type ValidatedMediaFile,
} from './media-file.js';
import {
  verifyImageProcessing,
  type ImageProcessingVerification,
  type VerifyImageProcessingInput,
} from './media-verification.js';

export type MediaPostServiceErrorKind =
  | MediaFileErrorCode
  | 'invalid_payload'
  | 'auth_unconfigured'
  | 'not_connected'
  | 'reauth_required'
  | 'permission_required'
  | 'approval_mismatch'
  | 'approval_expired'
  | 'approval_not_found'
  | 'approval_consumed'
  | 'idempotency_conflict'
  | 'storage_failure'
  | 'media_changed'
  | 'media_upload_failed'
  | 'media_processing_failed'
  | 'media_processing_pending'
  | 'provider_conflict'
  | 'rate_limited'
  | 'outcome_unknown';

export class MediaPostServiceError extends Error {
  readonly kind: MediaPostServiceErrorKind;
  readonly retryable = false;

  constructor(kind: MediaPostServiceErrorKind) {
    super(`Media post publishing failed: ${kind}`);
    this.name = 'MediaPostServiceError';
    this.kind = kind;
  }
}

export interface MediaSourceInput {
  sourcePath: string;
  altText: string;
}

export interface ImagePostDraft {
  text: string;
  image: MediaSourceInput;
  visibility?: 'PUBLIC' | 'CONNECTIONS';
  disableReshare?: boolean;
}

export interface MultiImagePostDraft {
  text: string;
  images: readonly MediaSourceInput[];
  visibility?: 'PUBLIC' | 'CONNECTIONS';
  disableReshare?: boolean;
}

export interface ApproveMediaPostInput {
  payloadHash: string;
}

interface CreateMediaPostBaseInput {
  payloadHash: string;
  approvalReceiptId: string;
  idempotencyKey: string;
}

export interface CreateImagePostInput extends CreateMediaPostBaseInput {
  draft: ImagePostDraft;
}

export interface CreateMultiImagePostInput extends CreateMediaPostBaseInput {
  draft: MultiImagePostDraft;
}

export interface MediaPostPublishResult {
  state: 'succeeded';
  provider: 'OFFICIAL_API';
  postUrn: string;
  imageUrns: string[];
  processing: ImageProcessingVerification[];
  replay: boolean;
}

export interface MediaPostService {
  previewImage(draft: ImagePostDraft): Promise<ImagePostPreview>;
  previewMultiImage(draft: MultiImagePostDraft): Promise<MultiImagePostPreview>;
  approve(input: ApproveMediaPostInput): Promise<ApprovalReceipt>;
  createImage(input: CreateImagePostInput): Promise<MediaPostPublishResult>;
  createMultiImage(input: CreateMultiImagePostInput): Promise<MediaPostPublishResult>;
}

type MediaPostsAdapter = Pick<LinkedInPostsAdapter, 'createImagePost' | 'createMultiImagePost'>;
type AuthProvider = Pick<AuthService, 'getProviderContext' | 'markReauthRequired'>;
type MediaReader = Pick<MediaFileReader, 'read'>;
type VerifyImage = (input: VerifyImageProcessingInput) => Promise<ImageProcessingVerification>;

interface MediaPostServiceDeps {
  auth: AuthProvider;
  approvals: ApprovalService;
  ledger: MediaIdempotencyLedger;
  files: MediaReader;
  images: LinkedInImagesClient;
  posts: MediaPostsAdapter;
  imageStatusReadEnabled?: boolean;
  verifyImage?: VerifyImage;
}

interface ProviderContext {
  accessToken: string;
  subject: string;
  scopes: string[];
}

interface PreparedImageDraft {
  preview: ImagePostPreview;
  files: [ValidatedMediaFile];
}

interface PreparedMultiImageDraft {
  preview: MultiImagePostPreview;
  files: ValidatedMediaFile[];
}

interface ProcessedMedia {
  imageUrns: string[];
  processing: ImageProcessingVerification[];
  progressed: boolean;
}

const publishQueues = new WeakMap<MediaIdempotencyLedger, Promise<void>>();

function exactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => typeof key === 'string' && expected.includes(key))
  );
}

function validateSource(value: unknown): MediaSourceInput {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !exactKeys(value, ['sourcePath', 'altText'])
  ) {
    throw new MediaPostServiceError('invalid_payload');
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.sourcePath !== 'string' ||
    candidate.sourcePath.trim() === '' ||
    typeof candidate.altText !== 'string'
  ) {
    throw new MediaPostServiceError('invalid_payload');
  }
  return { sourcePath: candidate.sourcePath, altText: candidate.altText };
}

function descriptorFor(file: ValidatedMediaFile, altText: string): CanonicalImageDescriptor {
  return {
    sourceName: file.sourceName,
    sha256: file.sha256,
    mimeType: file.mimeType,
    byteLength: file.byteLength,
    width: file.width,
    height: file.height,
    ...(file.frameCount === undefined ? {} : { frameCount: file.frameCount }),
    altText,
  };
}

function mapPreviewError(error: unknown): MediaPostServiceError {
  if (error instanceof MediaFileError) return new MediaPostServiceError(error.code);
  if (error instanceof MediaPostServiceError) return error;
  return new MediaPostServiceError('invalid_payload');
}

async function prepareImageDraft(
  files: MediaReader,
  draft: ImagePostDraft,
): Promise<PreparedImageDraft> {
  if (
    draft === null ||
    typeof draft !== 'object' ||
    Array.isArray(draft) ||
    !exactKeys(draft, [
      'text',
      'image',
      ...(draft.visibility === undefined ? [] : ['visibility']),
      ...(draft.disableReshare === undefined ? [] : ['disableReshare']),
    ])
  ) {
    throw new MediaPostServiceError('invalid_payload');
  }

  try {
    const source = validateSource(draft.image);
    const file = await files.read(source.sourcePath);
    const preview = createImagePostPreviewFromDescriptors({
      text: draft.text,
      image: descriptorFor(file, source.altText),
      ...(draft.visibility === undefined ? {} : { visibility: draft.visibility }),
      ...(draft.disableReshare === undefined ? {} : { disableReshare: draft.disableReshare }),
    });
    return { preview, files: [file] };
  } catch (error: unknown) {
    throw mapPreviewError(error);
  }
}

async function prepareMultiImageDraft(
  files: MediaReader,
  draft: MultiImagePostDraft,
): Promise<PreparedMultiImageDraft> {
  if (
    draft === null ||
    typeof draft !== 'object' ||
    Array.isArray(draft) ||
    !exactKeys(draft, [
      'text',
      'images',
      ...(draft.visibility === undefined ? [] : ['visibility']),
      ...(draft.disableReshare === undefined ? [] : ['disableReshare']),
    ]) ||
    !Array.isArray(draft.images) ||
    draft.images.length < 2 ||
    draft.images.length > 20
  ) {
    throw new MediaPostServiceError('invalid_payload');
  }

  try {
    const sources = draft.images.map((source) => validateSource(source));
    const validatedFiles: ValidatedMediaFile[] = [];
    for (const source of sources) validatedFiles.push(await files.read(source.sourcePath));
    const preview = createMultiImagePostPreviewFromDescriptors({
      text: draft.text,
      images: validatedFiles.map((file, index) => descriptorFor(file, sources[index]?.altText ?? '')),
      ...(draft.visibility === undefined ? {} : { visibility: draft.visibility }),
      ...(draft.disableReshare === undefined ? {} : { disableReshare: draft.disableReshare }),
    });
    return { preview, files: validatedFiles };
  } catch (error: unknown) {
    throw mapPreviewError(error);
  }
}

function authError(error: unknown): MediaPostServiceError {
  if (error instanceof AuthServiceError) {
    if (error.kind === 'not_configured') return new MediaPostServiceError('auth_unconfigured');
    if (error.kind === 'expired' || error.kind === 'reauth_required') {
      return new MediaPostServiceError('reauth_required');
    }
    if (error.kind === 'permission_required') return new MediaPostServiceError('permission_required');
  }
  return new MediaPostServiceError('not_connected');
}

async function providerContext(deps: MediaPostServiceDeps): Promise<ProviderContext> {
  let context: ProviderContext;
  try {
    context = await deps.auth.getProviderContext();
  } catch (error: unknown) {
    throw authError(error);
  }
  if (
    typeof context.accessToken !== 'string' ||
    context.accessToken.trim() === '' ||
    typeof context.subject !== 'string' ||
    context.subject.trim() === '' ||
    !Array.isArray(context.scopes)
  ) {
    throw new MediaPostServiceError('not_connected');
  }
  if (!context.scopes.includes('w_member_social')) {
    throw new MediaPostServiceError('permission_required');
  }
  return context;
}

function approvalError(error: unknown): MediaPostServiceError {
  if (error instanceof ApprovalServiceError) {
    if (error.kind === 'mismatch') return new MediaPostServiceError('approval_mismatch');
    if (error.kind === 'expired') return new MediaPostServiceError('approval_expired');
    if (error.kind === 'not_found') return new MediaPostServiceError('approval_not_found');
    if (error.kind === 'already_consumed') return new MediaPostServiceError('approval_consumed');
  }
  return new MediaPostServiceError('storage_failure');
}

function ledgerError(error: unknown): MediaPostServiceError {
  if (error instanceof IdempotencyLedgerError && error.kind === 'conflict') {
    return new MediaPostServiceError('idempotency_conflict');
  }
  return new MediaPostServiceError('storage_failure');
}

function terminalError(record: MutationRecord): MediaPostServiceError {
  switch (record.result?.errorCode) {
    case 'reauth_required':
      return new MediaPostServiceError('reauth_required');
    case 'permission_required':
      return new MediaPostServiceError('permission_required');
    case 'provider_conflict':
      return new MediaPostServiceError('provider_conflict');
    case 'rate_limited':
      return new MediaPostServiceError('rate_limited');
    case 'media_upload_failed':
      return new MediaPostServiceError('media_upload_failed');
    case 'media_processing_failed':
      return new MediaPostServiceError('media_processing_failed');
    case 'approval_consumed':
      return new MediaPostServiceError('approval_consumed');
    default:
      return new MediaPostServiceError('outcome_unknown');
  }
}

async function bestEffortReauth(deps: MediaPostServiceDeps, context: ProviderContext): Promise<void> {
  try {
    await deps.auth.markReauthRequired({
      accessToken: context.accessToken,
      subject: context.subject,
    });
  } catch {
    // Provider evidence is preserved even if local credential marking fails.
  }
}

async function completeFailure(
  deps: MediaPostServiceDeps,
  idempotencyKey: string,
  mutationHash: string,
  state: 'failed_terminal' | 'outcome_unknown',
  errorCode: string,
): Promise<never> {
  let completed: MutationRecord;
  try {
    completed = await deps.ledger.complete({
      idempotencyKey,
      payloadHash: mutationHash,
      state,
      result: { errorCode },
    });
  } catch {
    throw new MediaPostServiceError('outcome_unknown');
  }
  if (completed.state === 'failed_terminal') throw terminalError(completed);
  throw new MediaPostServiceError('outcome_unknown');
}

async function failImageMutation(
  deps: MediaPostServiceDeps,
  context: ProviderContext,
  idempotencyKey: string,
  mutationHash: string,
  error: unknown,
): Promise<never> {
  if (error instanceof LinkedInImagesError) {
    if (error.kind === 'reauthentication_required') {
      await bestEffortReauth(deps, context);
      return completeFailure(deps, idempotencyKey, mutationHash, 'failed_terminal', 'reauth_required');
    }
    if (error.kind === 'permission_required') {
      return completeFailure(
        deps,
        idempotencyKey,
        mutationHash,
        'failed_terminal',
        'permission_required',
      );
    }
    if (error.kind === 'rate_limited') {
      return completeFailure(deps, idempotencyKey, mutationHash, 'failed_terminal', 'rate_limited');
    }
    if (error.kind === 'provider_failure') {
      return completeFailure(
        deps,
        idempotencyKey,
        mutationHash,
        'failed_terminal',
        'media_upload_failed',
      );
    }
  }
  return completeFailure(
    deps,
    idempotencyKey,
    mutationHash,
    'outcome_unknown',
    'media_remote_outcome_unknown',
  );
}

function restoredResult(record: MutationRecord): {
  imageUrns: string[];
  processing: ImageProcessingVerification[];
} {
  const imageUrns: string[] = [];
  const processing: ImageProcessingVerification[] = [];
  for (const checkpoint of record.media ?? []) {
    if (checkpoint.imageUrn === undefined) throw new MediaPostServiceError('outcome_unknown');
    if (checkpoint.uploadState === 'available') processing.push('available');
    else if (checkpoint.uploadState === 'verification_unavailable') {
      processing.push('verification_unavailable');
    } else {
      throw new MediaPostServiceError('outcome_unknown');
    }
    imageUrns.push(checkpoint.imageUrn);
  }
  return { imageUrns, processing };
}

async function processMedia(
  deps: MediaPostServiceDeps,
  context: ProviderContext,
  idempotencyKey: string,
  mutationHash: string,
  reservation: ReserveMutationResult,
  descriptors: readonly CanonicalImageDescriptor[],
  files: readonly ValidatedMediaFile[],
): Promise<ProcessedMedia> {
  let record = reservation.record;
  let progressed = reservation.status === 'reserved';
  const imageUrns: string[] = [];
  const processing: ImageProcessingVerification[] = [];
  const verify = deps.verifyImage ?? verifyImageProcessing;

  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    const file = files[index];
    if (descriptor === undefined || file === undefined || descriptor.sha256 !== file.sha256) {
      throw new MediaPostServiceError('media_changed');
    }

    let checkpoint = record.media?.[index];
    if (checkpoint !== undefined && checkpoint.sha256 !== descriptor.sha256) {
      throw new MediaPostServiceError('idempotency_conflict');
    }

    if (checkpoint?.uploadState === 'pending') {
      return completeFailure(
        deps,
        idempotencyKey,
        mutationHash,
        'outcome_unknown',
        'interrupted_upload_unknown',
      );
    }

    if (checkpoint === undefined) {
      let initialized;
      try {
        initialized = await deps.images.initializeUpload({
          accessToken: context.accessToken,
          ownerUrn: `urn:li:person:${context.subject}`,
        });
      } catch (error: unknown) {
        return failImageMutation(deps, context, idempotencyKey, mutationHash, error);
      }

      try {
        record = await deps.ledger.checkpointMedia({
          idempotencyKey,
          payloadHash: mutationHash,
          index,
          checkpoint: {
            sha256: descriptor.sha256,
            imageUrn: initialized.imageUrn,
            uploadState: 'pending',
          },
        });
      } catch {
        return completeFailure(
          deps,
          idempotencyKey,
          mutationHash,
          'outcome_unknown',
          'checkpoint_after_initialize_failed',
        );
      }

      try {
        await deps.images.upload({
          accessToken: context.accessToken,
          uploadUrl: initialized.uploadUrl,
          bytes: file.bytes,
          mimeType: file.mimeType,
        });
      } catch (error: unknown) {
        return failImageMutation(deps, context, idempotencyKey, mutationHash, error);
      }

      try {
        record = await deps.ledger.checkpointMedia({
          idempotencyKey,
          payloadHash: mutationHash,
          index,
          checkpoint: {
            sha256: descriptor.sha256,
            imageUrn: initialized.imageUrn,
            uploadState: 'uploaded',
          },
        });
      } catch {
        throw new MediaPostServiceError('outcome_unknown');
      }
      checkpoint = record.media?.[index];
      progressed = true;
    }

    if (checkpoint?.uploadState === 'uploaded') {
      let verification: ImageProcessingVerification;
      try {
        verification = await verify({
          readsEnabled: deps.imageStatusReadEnabled === true,
          client: deps.images,
          accessToken: context.accessToken,
          imageUrn: checkpoint.imageUrn as string,
        });
      } catch (error: unknown) {
        if (error instanceof LinkedInImagesError && error.kind === 'reauthentication_required') {
          await bestEffortReauth(deps, context);
          return completeFailure(
            deps,
            idempotencyKey,
            mutationHash,
            'failed_terminal',
            'reauth_required',
          );
        }
        verification = 'verification_unavailable';
      }

      if (verification === 'processing_failed') {
        return completeFailure(
          deps,
          idempotencyKey,
          mutationHash,
          'failed_terminal',
          'media_processing_failed',
        );
      }
      if (verification === 'pending') {
        throw new MediaPostServiceError('media_processing_pending');
      }

      const uploadState = verification === 'available' ? 'available' : 'verification_unavailable';
      try {
        record = await deps.ledger.checkpointMedia({
          idempotencyKey,
          payloadHash: mutationHash,
          index,
          checkpoint: {
            sha256: descriptor.sha256,
            imageUrn: checkpoint.imageUrn,
            uploadState,
          },
        });
      } catch (error: unknown) {
        throw ledgerError(error);
      }
      checkpoint = record.media?.[index];
      progressed = true;
    }

    if (checkpoint?.imageUrn === undefined) throw new MediaPostServiceError('outcome_unknown');
    if (checkpoint.uploadState === 'available') processing.push('available');
    else if (checkpoint.uploadState === 'verification_unavailable') {
      processing.push('verification_unavailable');
    } else {
      throw new MediaPostServiceError('outcome_unknown');
    }
    imageUrns.push(checkpoint.imageUrn);
  }

  return { imageUrns, processing, progressed };
}

function serializeByLedger<T>(ledger: MediaIdempotencyLedger, action: () => Promise<T>): Promise<T> {
  const previous = publishQueues.get(ledger) ?? Promise.resolve();
  const result = previous.then(action, action);
  publishQueues.set(
    ledger,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

function mutationHash(operation: string, author: string, payloadHash: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ operation, author, payloadHash }))
    .digest('hex');
}

async function handlePostError(
  deps: MediaPostServiceDeps,
  context: ProviderContext,
  idempotencyKey: string,
  hash: string,
  error: unknown,
): Promise<never> {
  if (error instanceof LinkedInPostsError) {
    if (error.kind === 'reauthentication_required') {
      await bestEffortReauth(deps, context);
      return completeFailure(deps, idempotencyKey, hash, 'failed_terminal', 'reauth_required');
    }
    if (error.kind === 'permission_required') {
      return completeFailure(deps, idempotencyKey, hash, 'failed_terminal', 'permission_required');
    }
    if (error.kind === 'conflict') {
      return completeFailure(deps, idempotencyKey, hash, 'failed_terminal', 'provider_conflict');
    }
    if (error.kind === 'rate_limited') {
      return completeFailure(deps, idempotencyKey, hash, 'failed_terminal', 'rate_limited');
    }
  }
  return completeFailure(deps, idempotencyKey, hash, 'outcome_unknown', 'post_outcome_unknown');
}

export function createMediaPostService(deps: MediaPostServiceDeps): MediaPostService {
  async function approve(input: ApproveMediaPostInput): Promise<ApprovalReceipt> {
    const context = await providerContext(deps);
    try {
      return deps.approvals.issue({ payloadHash: input.payloadHash, subject: context.subject });
    } catch {
      throw new MediaPostServiceError('invalid_payload');
    }
  }

  async function execute(
    operation: 'post.create.image' | 'post.create.multi_image',
    input: CreateMediaPostBaseInput,
    payloadHash: string,
    descriptors: readonly CanonicalImageDescriptor[],
    files: readonly ValidatedMediaFile[],
    createPost: (context: ProviderContext, imageUrns: string[]) => Promise<LinkedInPostCreateResult>,
  ): Promise<MediaPostPublishResult> {
    if (payloadHash !== input.payloadHash) throw new MediaPostServiceError('media_changed');

    return serializeByLedger(deps.ledger, async () => {
      const context = await providerContext(deps);
      try {
        deps.approvals.consume({
          receiptId: input.approvalReceiptId,
          payloadHash,
          subject: context.subject,
          idempotencyKey: input.idempotencyKey,
        });
      } catch (error: unknown) {
        throw approvalError(error);
      }

      const author = `urn:li:person:${context.subject}`;
      const hash = mutationHash(operation, author, payloadHash);
      let reservation: ReserveMutationResult;
      try {
        reservation = await deps.ledger.reserve({
          idempotencyKey: input.idempotencyKey,
          payloadHash: hash,
        });
      } catch (error: unknown) {
        throw ledgerError(error);
      }

      if (reservation.status === 'replay' && reservation.record.state !== 'reserved') {
        if (reservation.record.state === 'succeeded') {
          if (!isValidLinkedInPostUrn(reservation.record.result?.postUrn)) {
            throw new MediaPostServiceError('outcome_unknown');
          }
          const restored = restoredResult(reservation.record);
          return {
            state: 'succeeded',
            provider: 'OFFICIAL_API',
            postUrn: reservation.record.result.postUrn,
            imageUrns: restored.imageUrns,
            processing: restored.processing,
            replay: true,
          };
        }
        if (reservation.record.state === 'failed_terminal') throw terminalError(reservation.record);
        throw new MediaPostServiceError('outcome_unknown');
      }

      const processed = await processMedia(
        deps,
        context,
        input.idempotencyKey,
        hash,
        reservation,
        descriptors,
        files,
      );

      if (reservation.status === 'replay' && !processed.progressed) {
        return completeFailure(
          deps,
          input.idempotencyKey,
          hash,
          'outcome_unknown',
          'interrupted_post_unknown',
        );
      }

      let created: LinkedInPostCreateResult;
      try {
        created = await createPost(context, processed.imageUrns);
        if (!isValidLinkedInPostUrn(created.postUrn)) {
          throw new LinkedInPostsError('malformed_success');
        }
      } catch (error: unknown) {
        return handlePostError(deps, context, input.idempotencyKey, hash, error);
      }

      let completed: MutationRecord;
      try {
        completed = await deps.ledger.complete({
          idempotencyKey: input.idempotencyKey,
          payloadHash: hash,
          state: 'succeeded',
          result: { postUrn: created.postUrn },
        });
      } catch {
        throw new MediaPostServiceError('outcome_unknown');
      }
      if (completed.state !== 'succeeded' || !isValidLinkedInPostUrn(completed.result?.postUrn)) {
        throw new MediaPostServiceError('outcome_unknown');
      }

      return {
        state: 'succeeded',
        provider: 'OFFICIAL_API',
        postUrn: completed.result.postUrn,
        imageUrns: processed.imageUrns,
        processing: processed.processing,
        replay: false,
      };
    });
  }

  return {
    previewImage(draft) {
      return prepareImageDraft(deps.files, draft).then((prepared) => prepared.preview);
    },

    previewMultiImage(draft) {
      return prepareMultiImageDraft(deps.files, draft).then((prepared) => prepared.preview);
    },

    approve,

    async createImage(input) {
      const prepared = await prepareImageDraft(deps.files, input.draft);
      const descriptor = prepared.preview.payload.media;
      return execute(
        'post.create.image',
        input,
        prepared.preview.payloadHash,
        [descriptor],
        prepared.files,
        (context, imageUrns) =>
          deps.posts.createImagePost({
            accessToken: context.accessToken,
            author: `urn:li:person:${context.subject}`,
            payload: prepared.preview.payload,
            imageUrn: imageUrns[0] as string,
          }),
      );
    },

    async createMultiImage(input) {
      const prepared = await prepareMultiImageDraft(deps.files, input.draft);
      return execute(
        'post.create.multi_image',
        input,
        prepared.preview.payloadHash,
        prepared.preview.payload.media,
        prepared.files,
        (context, imageUrns) =>
          deps.posts.createMultiImagePost({
            accessToken: context.accessToken,
            author: `urn:li:person:${context.subject}`,
            payload: prepared.preview.payload,
            imageUrns,
          }),
      );
    },
  };
}

import { createHash } from 'node:crypto';

import { textPostVisibilities, type TextPostVisibility } from './text-post.js';

export const supportedImageMimes = ['image/jpeg', 'image/png', 'image/gif'] as const;

export type SupportedImageMime = (typeof supportedImageMimes)[number];

export interface CanonicalImageDescriptor {
  sourceName: string;
  sha256: string;
  mimeType: SupportedImageMime;
  byteLength: number;
  width: number;
  height: number;
  frameCount?: number;
  altText: string;
}

export interface ImagePostPreviewInput {
  text: string;
  image: CanonicalImageDescriptor;
  visibility?: TextPostVisibility;
  disableReshare?: boolean;
}

export interface MultiImagePostPreviewInput {
  text: string;
  images: readonly CanonicalImageDescriptor[];
  visibility?: TextPostVisibility;
  disableReshare?: boolean;
}

interface MediaPostBasePayload {
  commentary: string;
  visibility: TextPostVisibility;
  distribution: {
    feedDistribution: 'MAIN_FEED';
    targetEntities: readonly [];
    thirdPartyDistributionChannels: readonly [];
  };
  lifecycleState: 'PUBLISHED';
  isReshareDisabled: boolean;
}

export interface ImagePostPayload extends MediaPostBasePayload {
  contentKind: 'image';
  media: CanonicalImageDescriptor;
}

export interface MultiImagePostPayload extends MediaPostBasePayload {
  contentKind: 'multi_image';
  media: readonly CanonicalImageDescriptor[];
}

export interface ImagePostPreview {
  payload: ImagePostPayload;
  canonicalJson: string;
  payloadHash: string;
  provider: 'OFFICIAL_API';
  requiredScope: 'w_member_social';
  warnings: readonly string[];
}

export interface MultiImagePostPreview {
  payload: MultiImagePostPayload;
  canonicalJson: string;
  payloadHash: string;
  provider: 'OFFICIAL_API';
  requiredScope: 'w_member_social';
  warnings: readonly string[];
}

const maxCommentaryLength = 3000;
const maxAltTextLength = 4086;
const recommendedAltTextLength = 120;
const maxImagePixelsExclusive = 36_152_320;
const maxGifFrames = 250;
const allowedSingleInputKeys = new Set(['text', 'image', 'visibility', 'disableReshare']);
const allowedMultiInputKeys = new Set(['text', 'images', 'visibility', 'disableReshare']);
const allowedDescriptorKeys = new Set([
  'sourceName',
  'sha256',
  'mimeType',
  'byteLength',
  'width',
  'height',
  'frameCount',
  'altText',
]);

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) throw new Error(`Unsupported ${label} field: ${key}`);
  }
}

function validateCommonPostFields(record: Record<string, unknown>): {
  text: string;
  visibility: TextPostVisibility;
  disableReshare: boolean;
} {
  if (typeof record.text !== 'string' || record.text.trim().length === 0) {
    throw new Error('Media post text must be a non-empty string');
  }
  if (record.text.length > maxCommentaryLength) {
    throw new Error(`Media post text length must not exceed ${maxCommentaryLength} characters`);
  }
  if (
    record.visibility !== undefined &&
    !textPostVisibilities.includes(record.visibility as TextPostVisibility)
  ) {
    throw new Error('Unsupported media post visibility');
  }
  if (record.disableReshare !== undefined && typeof record.disableReshare !== 'boolean') {
    throw new Error('Media post reshare setting must be a boolean');
  }

  return {
    text: record.text,
    visibility: (record.visibility as TextPostVisibility | undefined) ?? 'PUBLIC',
    disableReshare: (record.disableReshare as boolean | undefined) ?? false,
  };
}

function canonicalizeDescriptor(value: unknown): CanonicalImageDescriptor {
  const record = requireRecord(value, 'Image descriptor');
  rejectUnknownKeys(record, allowedDescriptorKeys, 'image descriptor');

  if (typeof record.sourceName !== 'string' || record.sourceName.trim().length === 0) {
    throw new Error('Image sourceName must be a non-empty string');
  }
  if (record.sourceName.includes('/') || record.sourceName.includes('\\')) {
    throw new Error('Image sourceName must not contain path separators');
  }
  if (typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) {
    throw new Error('Image sha256 must be a lowercase 64-character hexadecimal digest');
  }
  if (!supportedImageMimes.includes(record.mimeType as SupportedImageMime)) {
    throw new Error('Unsupported image MIME type');
  }
  if (!Number.isSafeInteger(record.byteLength) || (record.byteLength as number) <= 0) {
    throw new Error('Image byteLength must be a positive safe integer');
  }
  if (!Number.isSafeInteger(record.width) || (record.width as number) <= 0) {
    throw new Error('Image width must be a positive safe integer');
  }
  if (!Number.isSafeInteger(record.height) || (record.height as number) <= 0) {
    throw new Error('Image height must be a positive safe integer');
  }

  const pixelCount = (record.width as number) * (record.height as number);
  if (!Number.isSafeInteger(pixelCount) || pixelCount >= maxImagePixelsExclusive) {
    throw new Error(`Image pixel count must be less than ${maxImagePixelsExclusive}`);
  }

  if (record.frameCount !== undefined) {
    if (!Number.isSafeInteger(record.frameCount) || (record.frameCount as number) <= 0) {
      throw new Error('Image frameCount must be a positive safe integer');
    }
    if ((record.frameCount as number) > maxGifFrames) {
      throw new Error(`GIF frameCount must not exceed ${maxGifFrames}`);
    }
    if (record.mimeType !== 'image/gif') {
      throw new Error('frameCount is supported only for GIF images');
    }
  }

  if (typeof record.altText !== 'string' || record.altText.trim().length === 0) {
    throw new Error('Image alt text must be a non-empty string');
  }
  if (record.altText.length > maxAltTextLength) {
    throw new Error(`Image alt text length must not exceed ${maxAltTextLength} characters`);
  }

  const descriptor: CanonicalImageDescriptor = {
    sourceName: record.sourceName,
    sha256: record.sha256,
    mimeType: record.mimeType as SupportedImageMime,
    byteLength: record.byteLength as number,
    width: record.width as number,
    height: record.height as number,
    altText: record.altText,
  };
  if (record.frameCount !== undefined) descriptor.frameCount = record.frameCount as number;
  return descriptor;
}

function commonPayload(input: {
  text: string;
  visibility: TextPostVisibility;
  disableReshare: boolean;
}): MediaPostBasePayload {
  return {
    commentary: input.text,
    visibility: input.visibility,
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabled: input.disableReshare,
  };
}

function hashPayload(payload: ImagePostPayload | MultiImagePostPayload): {
  canonicalJson: string;
  payloadHash: string;
} {
  const canonicalJson = JSON.stringify(payload);
  return {
    canonicalJson,
    payloadHash: createHash('sha256').update(canonicalJson).digest('hex'),
  };
}

export function createImagePostPreviewFromDescriptors(input: ImagePostPreviewInput): ImagePostPreview {
  const record = requireRecord(input, 'Image post input');
  rejectUnknownKeys(record, allowedSingleInputKeys, 'image post');
  const common = validateCommonPostFields(record);
  const image = canonicalizeDescriptor(record.image);
  const payload: ImagePostPayload = {
    contentKind: 'image',
    ...commonPayload(common),
    media: image,
  };
  const { canonicalJson, payloadHash } = hashPayload(payload);
  const warnings =
    image.altText.length > recommendedAltTextLength
      ? ["Image alt text exceeds LinkedIn's recommended 120 characters."]
      : [];

  return {
    payload,
    canonicalJson,
    payloadHash,
    provider: 'OFFICIAL_API',
    requiredScope: 'w_member_social',
    warnings,
  };
}

export function createMultiImagePostPreviewFromDescriptors(
  input: MultiImagePostPreviewInput,
): MultiImagePostPreview {
  const record = requireRecord(input, 'Multi-image post input');
  rejectUnknownKeys(record, allowedMultiInputKeys, 'multi-image post');
  const common = validateCommonPostFields(record);
  if (!Array.isArray(record.images) || record.images.length < 2 || record.images.length > 20) {
    throw new Error('Multi-image post image count must be between 2 and 20');
  }

  const images = record.images.map((image) => canonicalizeDescriptor(image));
  const payload: MultiImagePostPayload = {
    contentKind: 'multi_image',
    ...commonPayload(common),
    media: images,
  };
  const { canonicalJson, payloadHash } = hashPayload(payload);
  const warnings = images.flatMap((image, index) =>
    image.altText.length > recommendedAltTextLength
      ? [`Image ${index + 1} alt text exceeds LinkedIn's recommended 120 characters.`]
      : [],
  );

  return {
    payload,
    canonicalJson,
    payloadHash,
    provider: 'OFFICIAL_API',
    requiredScope: 'w_member_social',
    warnings,
  };
}

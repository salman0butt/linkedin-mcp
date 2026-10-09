import type { SupportedImageMime } from '../../../../packages/core/dist/index.js';

const IMAGES_ENDPOINT = 'https://api.linkedin.com/rest/images';
const IMAGE_URN_PATTERN = /^urn:li:image:[A-Za-z0-9_-]+$/;
const MEMBER_URN_PATTERN = /^urn:li:person:[^\s]+$/;
const SUPPORTED_MIME_TYPES = new Set<SupportedImageMime>(['image/jpeg', 'image/png', 'image/gif']);
const IMAGE_STATUSES = new Set<LinkedInImageStatus>([
  'WAITING_UPLOAD',
  'PROCESSING',
  'PROCESSING_FAILED',
  'AVAILABLE',
]);

export type LinkedInImagesErrorKind =
  | 'reauthentication_required'
  | 'permission_required'
  | 'rate_limited'
  | 'provider_failure'
  | 'malformed_success'
  | 'not_found'
  | 'malformed_response'
  | 'outcome_unknown';

export type LinkedInImageStatus = 'WAITING_UPLOAD' | 'PROCESSING' | 'PROCESSING_FAILED' | 'AVAILABLE';

export class LinkedInImagesError extends Error {
  readonly kind: LinkedInImagesErrorKind;
  readonly retryable: boolean;

  constructor(kind: LinkedInImagesErrorKind, retryable = false) {
    super(`LinkedIn Images request failed: ${kind}`);
    this.name = 'LinkedInImagesError';
    this.kind = kind;
    this.retryable = retryable;
  }
}

export interface LinkedInImagesConfig {
  apiVersion: string;
}

export interface InitializeImageUploadInput {
  accessToken: string;
  ownerUrn: string;
}

export interface InitializeImageUploadResult {
  imageUrn: string;
  uploadUrl: string;
  uploadUrlExpiresAt: number;
}

export interface UploadImageInput {
  accessToken: string;
  uploadUrl: string;
  bytes: Uint8Array;
  mimeType: SupportedImageMime;
}

export interface GetImageStatusInput {
  accessToken: string;
  imageUrn: string;
}

export interface LinkedInImagesClient {
  initializeUpload(input: InitializeImageUploadInput): Promise<InitializeImageUploadResult>;
  upload(input: UploadImageInput): Promise<void>;
  getStatus(input: GetImageStatusInput): Promise<LinkedInImageStatus>;
}

interface LinkedInImagesClientDeps {
  fetch?: typeof globalThis.fetch;
}

function validateApiVersion(value: string): void {
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error('LinkedIn API version must use YYYYMM format');
  }
}

function validateAccessToken(value: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('LinkedIn access token is required');
  }
}

export function isValidLinkedInImageUrn(value: unknown): value is string {
  return typeof value === 'string' && IMAGE_URN_PATTERN.test(value);
}

function validateInitializeInput(input: InitializeImageUploadInput): void {
  validateAccessToken(input.accessToken);
  if (!MEMBER_URN_PATTERN.test(input.ownerUrn)) {
    throw new Error('LinkedIn image owner must be a member person URN');
  }
}

function validateStatusInput(input: GetImageStatusInput): void {
  validateAccessToken(input.accessToken);
  if (!isValidLinkedInImageUrn(input.imageUrn)) {
    throw new Error('LinkedIn image URN is invalid');
  }
}

function isLinkedInControlledUploadUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.username === '' &&
    parsed.password === '' &&
    (parsed.hostname === 'linkedin.com' || parsed.hostname.endsWith('.linkedin.com'))
  );
}

function validateUploadInput(input: UploadImageInput): void {
  validateAccessToken(input.accessToken);
  if (!isLinkedInControlledUploadUrl(input.uploadUrl)) {
    throw new Error('LinkedIn image upload URL is invalid');
  }
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) {
    throw new Error('LinkedIn image upload bytes are required');
  }
  if (!SUPPORTED_MIME_TYPES.has(input.mimeType)) {
    throw new Error('LinkedIn image MIME type is invalid');
  }
}

function classifyHttpError(status: number, allowNotFound = false): LinkedInImagesError {
  if (status === 401) return new LinkedInImagesError('reauthentication_required');
  if (status === 403) return new LinkedInImagesError('permission_required');
  if (allowNotFound && status === 404) return new LinkedInImagesError('not_found');
  if (status === 429) return new LinkedInImagesError('rate_limited');
  return new LinkedInImagesError('provider_failure');
}

function versionedHeaders(accessToken: string, apiVersion: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    'linkedin-version': apiVersion,
    'x-restli-protocol-version': '2.0.0',
  };
}

function parseInitializeSuccess(value: unknown): InitializeImageUploadResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LinkedInImagesError('malformed_success');
  }
  const envelope = value as Record<string, unknown>;
  if (envelope.value === null || typeof envelope.value !== 'object' || Array.isArray(envelope.value)) {
    throw new LinkedInImagesError('malformed_success');
  }
  const payload = envelope.value as Record<string, unknown>;
  if (
    !isValidLinkedInImageUrn(payload.image) ||
    !isLinkedInControlledUploadUrl(payload.uploadUrl) ||
    typeof payload.uploadUrlExpiresAt !== 'number' ||
    !Number.isFinite(payload.uploadUrlExpiresAt) ||
    payload.uploadUrlExpiresAt <= 0
  ) {
    throw new LinkedInImagesError('malformed_success');
  }
  return {
    imageUrn: payload.image,
    uploadUrl: payload.uploadUrl,
    uploadUrlExpiresAt: payload.uploadUrlExpiresAt,
  };
}

export function createLinkedInImagesClient(
  config: LinkedInImagesConfig,
  deps: LinkedInImagesClientDeps = {},
): LinkedInImagesClient {
  validateApiVersion(config.apiVersion);
  const fetchImpl = deps.fetch ?? globalThis.fetch;

  return {
    async initializeUpload(input) {
      validateInitializeInput(input);

      let response: Response;
      try {
        response = await fetchImpl(`${IMAGES_ENDPOINT}?action=initializeUpload`, {
          method: 'POST',
          headers: {
            ...versionedHeaders(input.accessToken, config.apiVersion),
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            initializeUploadRequest: { owner: input.ownerUrn },
          }),
        });
      } catch {
        throw new LinkedInImagesError('outcome_unknown');
      }

      if (response.status < 200 || response.status >= 300) {
        throw classifyHttpError(response.status);
      }

      let value: unknown;
      try {
        value = await response.json();
      } catch {
        throw new LinkedInImagesError('malformed_success');
      }
      return parseInitializeSuccess(value);
    },

    async upload(input) {
      validateUploadInput(input);

      let response: Response;
      try {
        response = await fetchImpl(input.uploadUrl, {
          method: 'PUT',
          headers: {
            authorization: `Bearer ${input.accessToken}`,
            'content-type': input.mimeType,
          },
          body: input.bytes,
          redirect: 'error',
        });
      } catch {
        throw new LinkedInImagesError('outcome_unknown');
      }

      if (response.status < 200 || response.status >= 300) {
        throw classifyHttpError(response.status);
      }
    },

    async getStatus(input) {
      validateStatusInput(input);

      let response: Response;
      try {
        response = await fetchImpl(`${IMAGES_ENDPOINT}/${encodeURIComponent(input.imageUrn)}`, {
          method: 'GET',
          headers: versionedHeaders(input.accessToken, config.apiVersion),
        });
      } catch {
        throw new LinkedInImagesError('provider_failure');
      }

      if (response.status !== 200) {
        throw classifyHttpError(response.status, true);
      }

      let value: unknown;
      try {
        value = await response.json();
      } catch {
        throw new LinkedInImagesError('malformed_response');
      }
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new LinkedInImagesError('malformed_response');
      }
      const status = (value as Record<string, unknown>).status;
      if (typeof status !== 'string' || !IMAGE_STATUSES.has(status as LinkedInImageStatus)) {
        throw new LinkedInImagesError('malformed_response');
      }
      return status as LinkedInImageStatus;
    },
  };
}

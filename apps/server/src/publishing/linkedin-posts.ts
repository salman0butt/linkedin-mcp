import type {
  ImagePostPayload,
  MultiImagePostPayload,
  TextPostPayload,
} from '../../../../packages/core/dist/index.js';

const POSTS_ENDPOINT = 'https://api.linkedin.com/rest/posts';
const IMAGE_URN_PATTERN = /^urn:li:image:[A-Za-z0-9_-]+$/;

export type LinkedInPostsErrorKind =
  | 'reauthentication_required'
  | 'permission_required'
  | 'conflict'
  | 'rate_limited'
  | 'provider_failure'
  | 'malformed_success'
  | 'not_found'
  | 'malformed_response'
  | 'outcome_unknown';

export class LinkedInPostsError extends Error {
  readonly kind: LinkedInPostsErrorKind;
  readonly retryable: boolean;

  constructor(kind: LinkedInPostsErrorKind, retryable = false) {
    super(`LinkedIn Posts request failed: ${kind}`);
    this.name = 'LinkedInPostsError';
    this.kind = kind;
    this.retryable = retryable;
  }
}

export interface LinkedInPostsConfig {
  apiVersion: string;
}

export interface CreateTextPostInput {
  accessToken: string;
  author: string;
  payload: TextPostPayload;
}

export interface CreateImagePostInput {
  accessToken: string;
  author: string;
  payload: ImagePostPayload;
  imageUrn: string;
}

export interface CreateMultiImagePostInput {
  accessToken: string;
  author: string;
  payload: MultiImagePostPayload;
  imageUrns: readonly string[];
}

export interface LinkedInPostCreateResult {
  postUrn: string;
}

export interface GetTextPostInput {
  accessToken: string;
  postUrn: string;
}

export interface LinkedInPostReadResult {
  postUrn: string;
  author: string;
  commentary: string;
  lifecycleState: string;
}

export interface LinkedInPostsAdapter {
  createTextPost(input: CreateTextPostInput): Promise<LinkedInPostCreateResult>;
  getTextPost(input: GetTextPostInput): Promise<LinkedInPostReadResult>;
}

export interface MediaLinkedInPostsAdapter extends LinkedInPostsAdapter {
  createImagePost(input: CreateImagePostInput): Promise<LinkedInPostCreateResult>;
  createMultiImagePost(input: CreateMultiImagePostInput): Promise<LinkedInPostCreateResult>;
}

interface LinkedInPostsAdapterDeps {
  fetch?: typeof globalThis.fetch;
}

interface PostBodyBase {
  author: string;
  commentary: string;
  visibility: TextPostPayload['visibility'];
  distribution: TextPostPayload['distribution'];
  lifecycleState: TextPostPayload['lifecycleState'];
  isReshareDisabled: boolean;
}

function validateApiVersion(value: string): void {
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error('LinkedIn API version must use YYYYMM format');
  }
}

function validateCreateInput(input: { accessToken: string; author: string }): void {
  if (input.accessToken.trim() === '') throw new Error('LinkedIn access token is required');
  if (!/^urn:li:person:[^\s]+$/.test(input.author)) {
    throw new Error('LinkedIn member author must be a person URN');
  }
}

function validateImageUrn(value: string): void {
  if (!IMAGE_URN_PATTERN.test(value)) throw new Error('LinkedIn image URN is invalid');
}

function validateGetInput(input: GetTextPostInput): void {
  if (typeof input.accessToken !== 'string' || input.accessToken.trim() === '') {
    throw new Error('LinkedIn access token is required');
  }
  if (!isValidLinkedInPostUrn(input.postUrn)) throw new Error('LinkedIn post URN is invalid');
}

function classifyHttpError(status: number): LinkedInPostsError {
  if (status === 401) return new LinkedInPostsError('reauthentication_required');
  if (status === 403) return new LinkedInPostsError('permission_required');
  if (status === 409) return new LinkedInPostsError('conflict');
  if (status === 429) return new LinkedInPostsError('rate_limited');
  return new LinkedInPostsError('provider_failure');
}

export function isValidLinkedInPostUrn(value: unknown): value is string {
  return typeof value === 'string' && /^urn:li:(?:share|ugcPost):[0-9]+$/.test(value);
}

function postBodyBase(
  author: string,
  payload: TextPostPayload | ImagePostPayload | MultiImagePostPayload,
): PostBodyBase {
  return {
    author,
    commentary: payload.commentary,
    visibility: payload.visibility,
    distribution: payload.distribution,
    lifecycleState: payload.lifecycleState,
    isReshareDisabled: payload.isReshareDisabled,
  };
}

export function createLinkedInPostsAdapter(
  config: LinkedInPostsConfig,
  deps: LinkedInPostsAdapterDeps = {},
): MediaLinkedInPostsAdapter {
  validateApiVersion(config.apiVersion);
  const fetchImpl = deps.fetch ?? globalThis.fetch;

  async function createPost(body: object, accessToken: string) {
    let response: Response;
    try {
      response = await fetchImpl(POSTS_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          'linkedin-version': config.apiVersion,
          'x-restli-protocol-version': '2.0.0',
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new LinkedInPostsError('outcome_unknown');
    }

    if (response.status !== 201) throw classifyHttpError(response.status);

    const postUrn = response.headers.get('x-restli-id');
    if (!isValidLinkedInPostUrn(postUrn)) throw new LinkedInPostsError('malformed_success');
    return { postUrn };
  }

  return {
    async createTextPost(input) {
      validateCreateInput(input);
      return createPost(postBodyBase(input.author, input.payload), input.accessToken);
    },

    async createImagePost(input) {
      validateCreateInput(input);
      validateImageUrn(input.imageUrn);
      if (input.payload.contentKind !== 'image') throw new Error('LinkedIn image payload is invalid');

      return createPost(
        {
          ...postBodyBase(input.author, input.payload),
          content: {
            media: {
              id: input.imageUrn,
              altText: input.payload.media.altText,
            },
          },
        },
        input.accessToken,
      );
    },

    async createMultiImagePost(input) {
      validateCreateInput(input);
      if (input.payload.contentKind !== 'multi_image') {
        throw new Error('LinkedIn multi-image payload is invalid');
      }
      if (
        input.imageUrns.length !== input.payload.media.length ||
        input.imageUrns.length < 2 ||
        input.imageUrns.length > 20
      ) {
        throw new Error('LinkedIn multi-image URNs must match the payload image count');
      }
      for (const imageUrn of input.imageUrns) validateImageUrn(imageUrn);

      return createPost(
        {
          ...postBodyBase(input.author, input.payload),
          content: {
            multiImage: {
              images: input.imageUrns.map((id, index) => ({
                id,
                altText: input.payload.media[index]?.altText,
              })),
            },
          },
        },
        input.accessToken,
      );
    },

    async getTextPost(input) {
      validateGetInput(input);

      let response: Response;
      try {
        response = await fetchImpl(`${POSTS_ENDPOINT}/${encodeURIComponent(input.postUrn)}`, {
          method: 'GET',
          headers: {
            authorization: `Bearer ${input.accessToken}`,
            'linkedin-version': config.apiVersion,
            'x-restli-protocol-version': '2.0.0',
          },
        });
      } catch {
        throw new LinkedInPostsError('provider_failure');
      }

      if (response.status !== 200) {
        if (response.status === 401) throw new LinkedInPostsError('reauthentication_required');
        if (response.status === 403) throw new LinkedInPostsError('permission_required');
        if (response.status === 404) throw new LinkedInPostsError('not_found');
        if (response.status === 429) throw new LinkedInPostsError('rate_limited');
        throw new LinkedInPostsError('provider_failure');
      }

      let value: unknown;
      try {
        value = await response.json();
      } catch {
        throw new LinkedInPostsError('malformed_response');
      }
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new LinkedInPostsError('malformed_response');
      }
      const post = value as Record<string, unknown>;
      if (
        !isValidLinkedInPostUrn(post.id) ||
        typeof post.author !== 'string' ||
        !/^(?:urn:li:person:[^\s]+|urn:li:organization:\d+)$/.test(post.author) ||
        typeof post.commentary !== 'string' ||
        post.commentary.trim() === '' ||
        typeof post.lifecycleState !== 'string' ||
        post.lifecycleState.trim() === ''
      ) {
        throw new LinkedInPostsError('malformed_response');
      }

      return {
        postUrn: post.id,
        author: post.author,
        commentary: post.commentary,
        lifecycleState: post.lifecycleState,
      };
    },
  };
}

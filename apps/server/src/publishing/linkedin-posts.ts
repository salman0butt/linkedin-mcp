import type { TextPostPayload } from '../../../../packages/core/dist/index.js';

const POSTS_ENDPOINT = 'https://api.linkedin.com/rest/posts';

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

interface LinkedInPostsAdapterDeps {
  fetch?: typeof globalThis.fetch;
}

function validateApiVersion(value: string): void {
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error('LinkedIn API version must use YYYYMM format');
  }
}

function validateCreateInput(input: CreateTextPostInput): void {
  if (input.accessToken.trim() === '') throw new Error('LinkedIn access token is required');
  if (!/^urn:li:person:[^\s]+$/.test(input.author)) {
    throw new Error('LinkedIn member author must be a person URN');
  }
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

export function createLinkedInPostsAdapter(
  config: LinkedInPostsConfig,
  deps: LinkedInPostsAdapterDeps = {},
): LinkedInPostsAdapter {
  validateApiVersion(config.apiVersion);
  const fetchImpl = deps.fetch ?? globalThis.fetch;

  return {
    async createTextPost(input) {
      validateCreateInput(input);

      let response: Response;
      try {
        response = await fetchImpl(POSTS_ENDPOINT, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${input.accessToken}`,
            'content-type': 'application/json',
            'linkedin-version': config.apiVersion,
            'x-restli-protocol-version': '2.0.0',
          },
          body: JSON.stringify({
            author: input.author,
            commentary: input.payload.commentary,
            visibility: input.payload.visibility,
            distribution: input.payload.distribution,
            lifecycleState: input.payload.lifecycleState,
            isReshareDisabled: input.payload.isReshareDisabled,
          }),
        });
      } catch {
        throw new LinkedInPostsError('outcome_unknown');
      }

      if (response.status !== 201) throw classifyHttpError(response.status);

      const postUrn = response.headers.get('x-restli-id');
      if (!isValidLinkedInPostUrn(postUrn)) throw new LinkedInPostsError('malformed_success');

      return { postUrn };
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

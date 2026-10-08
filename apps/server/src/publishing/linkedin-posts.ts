import type { TextPostPayload } from '../../../../packages/core/dist/index.js';

const POSTS_ENDPOINT = 'https://api.linkedin.com/rest/posts';

export type LinkedInPostsErrorKind =
  | 'reauthentication_required'
  | 'permission_required'
  | 'conflict'
  | 'rate_limited'
  | 'provider_failure'
  | 'malformed_success'
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

export interface LinkedInPostsAdapter {
  createTextPost(input: CreateTextPostInput): Promise<LinkedInPostCreateResult>;
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

function classifyHttpError(status: number): LinkedInPostsError {
  if (status === 401) return new LinkedInPostsError('reauthentication_required');
  if (status === 403) return new LinkedInPostsError('permission_required');
  if (status === 409) return new LinkedInPostsError('conflict');
  if (status === 429) return new LinkedInPostsError('rate_limited');
  return new LinkedInPostsError('provider_failure');
}

function validPostUrn(value: string | null): value is string {
  return value !== null && /^urn:li:[^:\s]+:.+$/.test(value);
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
      if (!validPostUrn(postUrn)) throw new LinkedInPostsError('malformed_success');

      return { postUrn };
    },
  };
}

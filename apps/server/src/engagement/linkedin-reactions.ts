import {
  parseCommentTarget,
  type CommentTarget,
  type ReactionType,
} from '../../../../packages/core/dist/index.js';

const ENDPOINT = 'https://api.linkedin.com/rest/reactions';
const MAX_RESPONSE_BYTES = 64 * 1024;
const ACTOR_PATTERN = /^urn:li:person:[^\s,()]+$/;
const ALLOWED_REACTIONS: ReadonlySet<string> = new Set([
  'LIKE',
  'PRAISE',
  'EMPATHY',
  'INTEREST',
  'APPRECIATION',
  'ENTERTAINMENT',
]);

export type LinkedInReactionsErrorKind =
  | 'reauthentication_required'
  | 'permission_required'
  | 'rate_limited'
  | 'malformed_success'
  | 'outcome_unknown';

export class LinkedInReactionsError extends Error {
  readonly kind: LinkedInReactionsErrorKind;
  readonly retryable = false;

  constructor(kind: LinkedInReactionsErrorKind) {
    super(`LinkedIn Reactions request failed: ${kind}`);
    this.name = 'LinkedInReactionsError';
    this.kind = kind;
  }
}

export interface LinkedInReactionsConfig {
  apiVersion: string;
}

export interface AddReactionInput {
  accessToken: string;
  actorUrn: string;
  targetUrn: CommentTarget;
  reactionType: ReactionType;
}

export interface RemoveReactionInput {
  accessToken: string;
  actorUrn: string;
  targetUrn: CommentTarget;
}

export interface CanonicalReaction {
  id: string;
  actorUrn: string;
  rootUrn: CommentTarget;
  reactionType: ReactionType;
  createdAt: string;
  lastModifiedAt: string;
}

export interface LinkedInReactionsClient {
  addReaction(input: AddReactionInput): Promise<CanonicalReaction>;
  removeReaction(input: RemoveReactionInput): Promise<void>;
}

interface ClientDeps {
  fetch?: typeof globalThis.fetch;
}

function validateVersion(version: string): void {
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(version)) {
    throw new Error('LinkedIn API version must use YYYYMM format');
  }
}

function validateInput(
  input: RemoveReactionInput,
): { actorUrn: string; targetUrn: CommentTarget } {
  if (typeof input.accessToken !== 'string' || input.accessToken.trim() === '') {
    throw new Error('LinkedIn access token is required');
  }
  if (typeof input.actorUrn !== 'string' || !ACTOR_PATTERN.test(input.actorUrn)) {
    throw new Error('LinkedIn reaction actor must be a member person URN');
  }
  let targetUrn: CommentTarget;
  try {
    targetUrn = parseCommentTarget(input.targetUrn);
  } catch {
    throw new Error('LinkedIn reaction target is invalid');
  }
  return { actorUrn: input.actorUrn, targetUrn };
}

function validateReactionType(value: unknown): ReactionType {
  if (typeof value !== 'string' || !ALLOWED_REACTIONS.has(value)) {
    throw new Error('Unsupported reaction type');
  }
  return value as ReactionType;
}

function headers(accessToken: string, apiVersion: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    'linkedin-version': apiVersion,
    'x-restli-protocol-version': '2.0.0',
  };
}

function classifyError(status: number): LinkedInReactionsError {
  if (status === 401) return new LinkedInReactionsError('reauthentication_required');
  if (status === 403) return new LinkedInReactionsError('permission_required');
  if (status === 429) return new LinkedInReactionsError('rate_limited');
  return new LinkedInReactionsError('outcome_unknown');
}

async function readBoundedSuccess(response: Response): Promise<unknown> {
  if (!response.body) throw new LinkedInReactionsError('malformed_success');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new LinkedInReactionsError('malformed_success');
      }
      chunks.push(value);
    }
  } catch (error: unknown) {
    if (error instanceof LinkedInReactionsError) throw error;
    throw new LinkedInReactionsError('malformed_success');
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new LinkedInReactionsError('malformed_success');
  }
}

function parseTimestamp(value: unknown, actorUrn: string): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LinkedInReactionsError('malformed_success');
  }
  const data = value as Record<string, unknown>;
  if (
    data.actor !== actorUrn ||
    !Number.isSafeInteger(data.time) ||
    (data.time as number) < 0
  ) {
    throw new LinkedInReactionsError('malformed_success');
  }
  const date = new Date(data.time as number);
  if (!Number.isFinite(date.getTime())) throw new LinkedInReactionsError('malformed_success');
  return date.toISOString();
}

function parseReaction(value: unknown, input: AddReactionInput): CanonicalReaction {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LinkedInReactionsError('malformed_success');
  }
  const record = value as Record<string, unknown>;
  const expectedId = `urn:li:reaction:(${input.actorUrn},${input.targetUrn})`;
  if (
    record.id !== expectedId ||
    record.root !== input.targetUrn ||
    record.reactionType !== input.reactionType
  ) {
    throw new LinkedInReactionsError('malformed_success');
  }
  return {
    id: expectedId,
    actorUrn: input.actorUrn,
    rootUrn: input.targetUrn,
    reactionType: input.reactionType,
    createdAt: parseTimestamp(record.created, input.actorUrn),
    lastModifiedAt: parseTimestamp(record.lastModified, input.actorUrn),
  };
}

export function createLinkedInReactionsClient(
  config: LinkedInReactionsConfig,
  deps: ClientDeps = {},
): LinkedInReactionsClient {
  validateVersion(config.apiVersion);
  const fetchImpl = deps.fetch ?? globalThis.fetch;

  return {
    async addReaction(input) {
      const { actorUrn, targetUrn } = validateInput(input);
      const reactionType = validateReactionType(input.reactionType);
      let response: Response;
      try {
        response = await fetchImpl(`${ENDPOINT}?actor=${encodeURIComponent(actorUrn)}`, {
          method: 'POST',
          headers: {
            ...headers(input.accessToken, config.apiVersion),
            'content-type': 'application/json',
          },
          body: JSON.stringify({ root: targetUrn, reactionType }),
        });
      } catch {
        throw new LinkedInReactionsError('outcome_unknown');
      }
      if (response.status !== 201) throw classifyError(response.status);
      const parsed = await readBoundedSuccess(response);
      return parseReaction(parsed, { ...input, actorUrn, targetUrn, reactionType });
    },

    async removeReaction(input) {
      const { actorUrn, targetUrn } = validateInput(input);
      let response: Response;
      try {
        response = await fetchImpl(
          `${ENDPOINT}/(actor:${encodeURIComponent(actorUrn)},entity:${encodeURIComponent(targetUrn)})`,
          {
            method: 'DELETE',
            headers: headers(input.accessToken, config.apiVersion),
          },
        );
      } catch {
        throw new LinkedInReactionsError('outcome_unknown');
      }
      if (response.status !== 204) throw classifyError(response.status);
    },
  };
}

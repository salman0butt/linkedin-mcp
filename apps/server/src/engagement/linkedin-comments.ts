import {
  matchesReplyIdentity,
  parseCommentTarget,
  type CanonicalComment,
  type CommentPage,
  type CommentTarget,
} from '../../../../packages/core/dist/index.js';

const SOCIAL_ACTIONS_ENDPOINT = 'https://api.linkedin.com/rest/socialActions';
const MAX_PROVIDER_JSON_BYTES = 256 * 1024;
const COMMENT_URN_PATTERN = /^urn:li:comment:\(urn:li:(?:share|ugcPost|activity):\d+,\d+\)$/;
const ACTOR_URN_PATTERN = /^urn:li:(?:person:[^\s]+|organization:\d+|organizationBrand:\d+)$/;
const MEMBER_ACTOR_URN_PATTERN = /^urn:li:person:[^\s]+$/;

export type LinkedInCommentsErrorKind =
  | 'reauthentication_required'
  | 'permission_required'
  | 'rate_limited'
  | 'provider_failure'
  | 'not_found'
  | 'malformed_response'
  | 'malformed_success'
  | 'outcome_unknown';

export class LinkedInCommentsError extends Error {
  readonly kind: LinkedInCommentsErrorKind;
  readonly retryable: boolean;

  constructor(kind: LinkedInCommentsErrorKind, retryable = false) {
    super(`LinkedIn Comments request failed: ${kind}`);
    this.name = 'LinkedInCommentsError';
    this.kind = kind;
    this.retryable = retryable;
  }
}

export interface LinkedInCommentsConfig {
  apiVersion: string;
}

export interface GetCommentInput {
  accessToken: string;
  targetUrn: CommentTarget;
  commentId: string;
}

export interface ListCommentsInput {
  accessToken: string;
  targetUrn: CommentTarget;
  start?: number;
  count?: number;
}

export interface CreateReplyInput {
  accessToken: string;
  targetUrn: CommentTarget;
  actorUrn: string;
  objectUrn: CommentTarget;
  parentCommentUrn: string;
  text: string;
}

export interface LinkedInCommentsClient {
  getComment(input: GetCommentInput): Promise<CanonicalComment>;
  listComments(input: ListCommentsInput): Promise<CommentPage>;
  createReply(input: CreateReplyInput): Promise<CanonicalComment>;
}

interface LinkedInCommentsClientDeps {
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

function validateTargetUrn(value: unknown): CommentTarget {
  if (typeof value !== 'string') throw new Error('LinkedIn comment target is invalid');
  try {
    return parseCommentTarget(value);
  } catch {
    throw new Error('LinkedIn comment target is invalid');
  }
}

function validateCommentId(value: unknown): string {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error('LinkedIn comment id must be numeric');
  }
  return value;
}

function validateMemberActorUrn(value: unknown): string {
  if (typeof value !== 'string' || !MEMBER_ACTOR_URN_PATTERN.test(value)) {
    throw new Error('LinkedIn comment actor must be a member person URN');
  }
  return value;
}

function validateParentCommentUrn(value: unknown): string {
  if (typeof value !== 'string' || !COMMENT_URN_PATTERN.test(value)) {
    throw new Error('LinkedIn parent comment must be a canonical comment URN');
  }
  return value;
}

function validateReplyText(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('LinkedIn reply text must be non-empty');
  }
  return value;
}

function validateStart(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error('LinkedIn comment page start must be a non-negative safe integer');
  }
  return value as number;
}

function validateCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) {
    throw new Error('LinkedIn comment page count must be between 1 and 100');
  }
  return value as number;
}

function versionedHeaders(accessToken: string, apiVersion: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    'linkedin-version': apiVersion,
    'x-restli-protocol-version': '2.0.0',
  };
}

function classifyHttpError(status: number): LinkedInCommentsError {
  if (status === 401) return new LinkedInCommentsError('reauthentication_required');
  if (status === 403) return new LinkedInCommentsError('permission_required');
  if (status === 404) return new LinkedInCommentsError('not_found');
  if (status === 429) return new LinkedInCommentsError('rate_limited');
  return new LinkedInCommentsError('provider_failure');
}

function classifyCreateHttpError(status: number): LinkedInCommentsError {
  if (status === 401) return new LinkedInCommentsError('reauthentication_required');
  if (status === 403) return new LinkedInCommentsError('permission_required');
  if (status === 429) return new LinkedInCommentsError('rate_limited');
  return new LinkedInCommentsError('outcome_unknown');
}

async function readBoundedJson(
  response: Response,
  malformedKind: 'malformed_response' | 'malformed_success' = 'malformed_response',
): Promise<unknown> {
  const body = response.body;
  if (body === null) throw new LinkedInCommentsError(malformedKind);

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > MAX_PROVIDER_JSON_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new LinkedInCommentsError(malformedKind);
      }
      chunks.push(value);
    }
  } catch (error: unknown) {
    if (error instanceof LinkedInCommentsError) throw error;
    throw new LinkedInCommentsError(malformedKind);
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
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new LinkedInCommentsError(malformedKind);
  }
}

function parseActorUrn(value: unknown): string {
  if (typeof value !== 'string' || !ACTOR_URN_PATTERN.test(value)) {
    throw new LinkedInCommentsError('malformed_response');
  }
  return value;
}

function parseCommentUrn(value: unknown): string {
  if (typeof value !== 'string' || !COMMENT_URN_PATTERN.test(value)) {
    throw new LinkedInCommentsError('malformed_response');
  }
  return value;
}

function conflictsWithSameFamilyRoot(left: string, right: string): boolean {
  const rootOf = (urn: string): string =>
    /^urn:li:comment:\((urn:li:(?:share|ugcPost|activity):\d+),\d+\)$/.exec(urn)?.[1] ?? urn;
  const leftRoot = rootOf(left);
  const rightRoot = rootOf(right);
  const leftFamily = /^urn:li:(share|ugcPost|activity):\d+$/.exec(leftRoot)?.[1];
  const rightFamily = /^urn:li:(share|ugcPost|activity):\d+$/.exec(rightRoot)?.[1];
  return leftFamily !== undefined && leftFamily === rightFamily && leftRoot !== rightRoot;
}

function parseTimestampContainer(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LinkedInCommentsError('malformed_response');
  }
  const candidate = value as Record<string, unknown>;
  parseActorUrn(candidate.actor);
  if (!Number.isSafeInteger(candidate.time) || (candidate.time as number) < 0) {
    throw new LinkedInCommentsError('malformed_response');
  }
  const date = new Date(candidate.time as number);
  if (!Number.isFinite(date.getTime())) throw new LinkedInCommentsError('malformed_response');
  return date.toISOString();
}

function parseTotalLikes(value: unknown): number {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LinkedInCommentsError('malformed_response');
  }
  const totalLikes = (value as Record<string, unknown>).totalLikes;
  if (!Number.isSafeInteger(totalLikes) || (totalLikes as number) < 0) {
    throw new LinkedInCommentsError('malformed_response');
  }
  return totalLikes as number;
}

function parseMessageText(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LinkedInCommentsError('malformed_response');
  }
  const text = (value as Record<string, unknown>).text;
  if (typeof text !== 'string' || text.trim() === '') {
    throw new LinkedInCommentsError('malformed_response');
  }
  return text;
}

function parseCanonicalComment(value: unknown, allowMissingLikesSummary = false): CanonicalComment {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LinkedInCommentsError('malformed_response');
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || !/^\d+$/.test(candidate.id)) {
    throw new LinkedInCommentsError('malformed_response');
  }

  let objectUrn: CommentTarget;
  try {
    objectUrn = validateTargetUrn(candidate.object);
  } catch {
    throw new LinkedInCommentsError('malformed_response');
  }

  const parentCommentUrn =
    candidate.parentComment === undefined ? undefined : parseCommentUrn(candidate.parentComment);
  const parsedCommentUrn = parseCommentUrn(candidate.commentUrn);
  if (parsedCommentUrn.slice(parsedCommentUrn.lastIndexOf(',') + 1, -1) !== candidate.id) {
    throw new LinkedInCommentsError('malformed_response');
  }
  if (conflictsWithSameFamilyRoot(parsedCommentUrn, objectUrn)) {
    throw new LinkedInCommentsError('malformed_response');
  }
  if (
    parentCommentUrn !== undefined &&
    (conflictsWithSameFamilyRoot(parsedCommentUrn, parentCommentUrn) ||
      conflictsWithSameFamilyRoot(objectUrn, parentCommentUrn))
  ) {
    throw new LinkedInCommentsError('malformed_response');
  }

  return {
    id: candidate.id,
    commentUrn: parsedCommentUrn,
    actorUrn: parseActorUrn(candidate.actor),
    objectUrn,
    ...(parentCommentUrn === undefined ? {} : { parentCommentUrn }),
    text: parseMessageText(candidate.message),
    createdAt: parseTimestampContainer(candidate.created),
    lastModifiedAt: parseTimestampContainer(candidate.lastModified),
    ...(allowMissingLikesSummary && candidate.likesSummary === undefined
      ? {}
      : { totalLikes: parseTotalLikes(candidate.likesSummary) }),
  };
}

function parseReplySuccess(
  value: unknown,
  expected: Omit<CreateReplyInput, 'accessToken'>,
): CanonicalComment {
  let comment: CanonicalComment;
  try {
    comment = parseCanonicalComment(value, true);
  } catch {
    throw new LinkedInCommentsError('malformed_success');
  }
  if (
    comment.actorUrn !== expected.actorUrn ||
    comment.objectUrn !== expected.objectUrn ||
    comment.parentCommentUrn !== expected.parentCommentUrn ||
    comment.text !== expected.text ||
    !matchesReplyIdentity(comment.commentUrn, comment.id, expected.parentCommentUrn, expected.objectUrn)
  ) {
    throw new LinkedInCommentsError('malformed_success');
  }
  return comment;
}

function parsePaging(value: unknown): CommentPage['paging'] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LinkedInCommentsError('malformed_response');
  }
  const candidate = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(candidate.start) ||
    (candidate.start as number) < 0 ||
    !Number.isSafeInteger(candidate.count) ||
    (candidate.count as number) < 1 ||
    (candidate.total !== undefined &&
      (!Number.isSafeInteger(candidate.total) || (candidate.total as number) < 0))
  ) {
    throw new LinkedInCommentsError('malformed_response');
  }

  const start = candidate.start as number;
  const count = candidate.count as number;
  const total = candidate.total as number | undefined;
  if (!Number.isSafeInteger(start + count)) throw new LinkedInCommentsError('malformed_response');
  const nextStart = total !== undefined && start + count < total ? start + count : undefined;

  return {
    start,
    count,
    ...(total === undefined ? {} : { total }),
    ...(nextStart === undefined ? {} : { nextStart }),
  };
}

function parseCommentPage(value: unknown): CommentPage {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LinkedInCommentsError('malformed_response');
  }
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.elements)) throw new LinkedInCommentsError('malformed_response');

  return {
    elements: candidate.elements.map((element) => parseCanonicalComment(element)),
    paging: parsePaging(candidate.paging),
    provider: 'OFFICIAL_API',
  };
}

export function createLinkedInCommentsClient(
  config: LinkedInCommentsConfig,
  deps: LinkedInCommentsClientDeps = {},
): LinkedInCommentsClient {
  validateApiVersion(config.apiVersion);
  const fetchImpl = deps.fetch ?? globalThis.fetch;

  return {
    async getComment(input) {
      validateAccessToken(input.accessToken);
      const targetUrn = validateTargetUrn(input.targetUrn);
      const commentId = validateCommentId(input.commentId);

      let response: Response;
      try {
        response = await fetchImpl(
          `${SOCIAL_ACTIONS_ENDPOINT}/${encodeURIComponent(targetUrn)}/comments/${commentId}`,
          {
            method: 'GET',
            headers: versionedHeaders(input.accessToken, config.apiVersion),
          },
        );
      } catch {
        throw new LinkedInCommentsError('provider_failure');
      }

      if (response.status !== 200) throw classifyHttpError(response.status);
      const comment = parseCanonicalComment(await readBoundedJson(response));
      if (
        comment.id !== commentId ||
        conflictsWithSameFamilyRoot(targetUrn, comment.commentUrn) ||
        conflictsWithSameFamilyRoot(targetUrn, comment.objectUrn)
      ) {
        throw new LinkedInCommentsError('malformed_response');
      }
      return comment;
    },

    async listComments(input) {
      validateAccessToken(input.accessToken);
      const targetUrn = validateTargetUrn(input.targetUrn);
      const start = input.start === undefined ? 0 : validateStart(input.start);
      const count = input.count === undefined ? 10 : validateCount(input.count);

      let response: Response;
      try {
        response = await fetchImpl(
          `${SOCIAL_ACTIONS_ENDPOINT}/${encodeURIComponent(targetUrn)}/comments?start=${start}&count=${count}`,
          {
            method: 'GET',
            headers: versionedHeaders(input.accessToken, config.apiVersion),
          },
        );
      } catch {
        throw new LinkedInCommentsError('provider_failure');
      }

      if (response.status !== 200) throw classifyHttpError(response.status);
      const page = parseCommentPage(await readBoundedJson(response));
      if (
        page.paging.start !== start ||
        page.paging.count > count ||
        page.elements.length > page.paging.count ||
        page.elements.some(
          (comment) =>
            conflictsWithSameFamilyRoot(targetUrn, comment.commentUrn) ||
            conflictsWithSameFamilyRoot(targetUrn, comment.objectUrn),
        )
      ) {
        throw new LinkedInCommentsError('malformed_response');
      }
      return page;
    },

    async createReply(input) {
      validateAccessToken(input.accessToken);
      const targetUrn = validateTargetUrn(input.targetUrn);
      const actorUrn = validateMemberActorUrn(input.actorUrn);
      const objectUrn = validateTargetUrn(input.objectUrn);
      if (COMMENT_URN_PATTERN.test(objectUrn)) {
        throw new Error('LinkedIn reply root object must be a post or activity URN');
      }
      const parentCommentUrn = validateParentCommentUrn(input.parentCommentUrn);
      const text = validateReplyText(input.text);
      if (!COMMENT_URN_PATTERN.test(targetUrn) || parentCommentUrn !== targetUrn) {
        throw new Error('LinkedIn reply target must match its parent comment');
      }

      let response: Response;
      try {
        response = await fetchImpl(`${SOCIAL_ACTIONS_ENDPOINT}/${encodeURIComponent(targetUrn)}/comments`, {
          method: 'POST',
          headers: {
            ...versionedHeaders(input.accessToken, config.apiVersion),
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            actor: actorUrn,
            object: objectUrn,
            message: { text },
            parentComment: parentCommentUrn,
          }),
        });
      } catch {
        throw new LinkedInCommentsError('outcome_unknown');
      }

      if (response.status !== 201) throw classifyCreateHttpError(response.status);
      const returnedId = response.headers.get('x-restli-id');
      if (returnedId === null || !/^\d+$/.test(returnedId)) {
        throw new LinkedInCommentsError('malformed_success');
      }

      const comment = parseReplySuccess(await readBoundedJson(response, 'malformed_success'), {
        targetUrn,
        actorUrn,
        objectUrn,
        parentCommentUrn,
        text,
      });
      if (comment.id !== returnedId) throw new LinkedInCommentsError('malformed_success');
      return comment;
    },
  };
}

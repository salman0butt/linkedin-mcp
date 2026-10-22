import { createHash } from 'node:crypto';

export const reactionTypes = [
  'LIKE',
  'PRAISE',
  'EMPATHY',
  'INTEREST',
  'APPRECIATION',
  'ENTERTAINMENT',
] as const;

export type ReactionType = (typeof reactionTypes)[number];
export type CommentTarget = string;

export interface CanonicalComment {
  id: string;
  commentUrn: string;
  actorUrn: string;
  objectUrn: CommentTarget;
  parentCommentUrn?: string;
  text: string;
  createdAt: string;
  lastModifiedAt: string;
  totalLikes?: number;
}

export interface CommentPaging {
  start: number;
  count: number;
  total?: number;
  nextStart?: number;
}

export interface CommentPage {
  elements: readonly CanonicalComment[];
  paging: CommentPaging;
  provider: 'OFFICIAL_API';
}

export type EngagementReadAvailability<T> =
  | {
      status: 'disabled';
      provider: 'OFFICIAL_API';
      requiredScope: 'r_member_social_feed';
    }
  | {
      status: 'permission_required';
      provider: 'OFFICIAL_API';
      requiredScope: 'r_member_social_feed';
    }
  | {
      status: 'available';
      provider: 'OFFICIAL_API';
      value: T;
    };

export interface ReplyDraft {
  targetUrn: CommentTarget;
  rootUrn: CommentTarget;
  parentCommentUrn: string;
  text: string;
}

export interface ReplyPreview {
  payload: ReplyDraft;
  canonicalJson: string;
  payloadHash: string;
  provider: 'OFFICIAL_API';
  requiredScope: 'w_member_social_feed';
  warnings: readonly string[];
}

export type ReactionDraft =
  | {
      operation: 'add';
      targetUrn: CommentTarget;
      reactionType: ReactionType;
    }
  | {
      operation: 'remove';
      targetUrn: CommentTarget;
    };

export interface ReactionPreview {
  payload: ReactionDraft;
  canonicalJson: string;
  payloadHash: string;
  provider: 'OFFICIAL_API';
  requiredScope: 'w_member_social_feed';
  warnings: readonly string[];
}

const simpleTargetPattern = /^urn:li:(?:share|ugcPost|activity):\d+$/;
const commentTargetPattern = /^urn:li:comment:\(urn:li:(?:share|ugcPost|activity):\d+,\d+\)$/;

function conflictsWithSameFamilyReplyRoot(parentCommentUrn: string, rootUrn: string): boolean {
  const parent = /^urn:li:comment:\((urn:li:(share|ugcPost|activity):\d+),\d+\)$/.exec(parentCommentUrn);
  return parent !== null && rootUrn.startsWith(`urn:li:${parent[2]}:`) && parent[1] !== rootUrn;
}

export function matchesReplyIdentity(
  commentUrn: string,
  commentId: string,
  parentCommentUrn: string,
  rootUrn?: string,
): boolean {
  if (!/^\d+$/.test(commentId) || !commentTargetPattern.test(commentUrn)) return false;
  const parent = /^urn:li:comment:\((urn:li:(?:share|ugcPost|activity):\d+),\d+\)$/.exec(parentCommentUrn);
  if (parent === null) return false;
  if (rootUrn !== undefined && conflictsWithSameFamilyReplyRoot(parentCommentUrn, rootUrn)) {
    return false;
  }
  return (
    commentUrn === `urn:li:comment:(${parent[1]},${commentId})` ||
    (rootUrn !== undefined &&
      simpleTargetPattern.test(rootUrn) &&
      commentUrn === `urn:li:comment:(${rootUrn},${commentId})`)
  );
}
const replyKeys = new Set(['targetUrn', 'rootUrn', 'parentCommentUrn', 'text']);
const reactionKeys = new Set(['operation', 'targetUrn', 'reactionType']);

function hashCanonicalJson(canonicalJson: string): string {
  return createHash('sha256').update(canonicalJson).digest('hex');
}

function assertExactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unsupported ${label} field: ${key}`);
  }
}

export function parseCommentTarget(value: string): CommentTarget {
  if (typeof value !== 'string' || (!simpleTargetPattern.test(value) && !commentTargetPattern.test(value))) {
    throw new Error('Comment target must be a canonical LinkedIn share, ugcPost, activity, or comment URN');
  }
  return value;
}

function parseCommentUrn(value: string, label: string): string {
  if (typeof value !== 'string' || !commentTargetPattern.test(value)) {
    throw new Error(`${label} must be a canonical LinkedIn comment URN`);
  }
  return value;
}

export function createReplyPreview(input: ReplyDraft): ReplyPreview {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Reply input must be an object');
  }
  const record = input as unknown as Record<string, unknown>;
  assertExactKeys(record, replyKeys, 'reply');

  const payload: ReplyDraft = {
    targetUrn: parseCommentTarget(record.targetUrn as string),
    rootUrn: (() => {
      const value = record.rootUrn;
      if (typeof value !== 'string' || !simpleTargetPattern.test(value)) {
        throw new Error('Reply root must be a share, ugcPost, or activity URN');
      }
      return value;
    })(),
    parentCommentUrn: parseCommentUrn(record.parentCommentUrn as string, 'Parent comment'),
    text: record.text as string,
  };
  if (typeof record.text !== 'string' || record.text.trim().length === 0) {
    throw new Error('Reply text must be a non-empty string');
  }

  if (payload.targetUrn !== payload.parentCommentUrn) {
    throw new Error('Reply target must match parent comment');
  }
  if (conflictsWithSameFamilyReplyRoot(payload.parentCommentUrn, payload.rootUrn)) {
    throw new Error('Reply root must match parent comment thread');
  }

  const canonicalJson = JSON.stringify(payload);
  return {
    payload,
    canonicalJson,
    payloadHash: hashCanonicalJson(canonicalJson),
    provider: 'OFFICIAL_API',
    requiredScope: 'w_member_social_feed',
    warnings: [],
  };
}

export function createReactionPreview(input: ReactionDraft): ReactionPreview {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Reaction input must be an object');
  }
  const record = input as unknown as Record<string, unknown>;
  assertExactKeys(record, reactionKeys, 'reaction');
  const targetUrn = parseCommentTarget(record.targetUrn as string);

  let payload: ReactionDraft;
  if (record.operation === 'add') {
    if (!reactionTypes.includes(record.reactionType as ReactionType)) {
      throw new Error('Unsupported reaction type');
    }
    payload = {
      operation: 'add',
      targetUrn,
      reactionType: record.reactionType as ReactionType,
    };
  } else if (record.operation === 'remove') {
    if (record.reactionType !== undefined) {
      throw new Error('Unsupported reaction field: reactionType');
    }
    payload = { operation: 'remove', targetUrn };
  } else {
    throw new Error('Unsupported reaction operation');
  }

  const canonicalJson = JSON.stringify(payload);
  return {
    payload,
    canonicalJson,
    payloadHash: hashCanonicalJson(canonicalJson),
    provider: 'OFFICIAL_API',
    requiredScope: 'w_member_social_feed',
    warnings: [],
  };
}

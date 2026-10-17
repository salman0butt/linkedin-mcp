import type {
  CanonicalComment,
  CommentPage,
  EngagementReadAvailability,
} from '../../../../packages/core/dist/index.js';

const THREAD_URN_PATTERN = /^urn:li:(?:share|ugcPost|activity):\d+$/;
const MAX_THREAD_ROOTS = 20;
const PAGE_SIZE = 100;
const MAX_PAGES_PER_TARGET = 3;
const MAX_PROVIDER_CALLS = 100;

export type CommentInboxErrorKind = 'invalid_input' | 'limit_exceeded';

export class CommentInboxError extends Error {
  readonly kind: CommentInboxErrorKind;

  constructor(kind: CommentInboxErrorKind) {
    super(`Comment inbox derivation failed: ${kind}`);
    this.name = 'CommentInboxError';
    this.kind = kind;
  }
}

export interface CommentInboxListCommentsInput {
  targetUrn: string;
  start: number;
  count: number;
}

export type CommentInboxListComments = (
  input: CommentInboxListCommentsInput,
) => Promise<EngagementReadAvailability<CommentPage>>;

export interface CommentInboxInput {
  subject: string;
  threadUrns: readonly string[];
}

export interface UnansweredCommentInboxItem {
  threadUrn: string;
  commentUrn: string;
  actorUrn: string;
  text: string;
  createdAt: string;
  lastModifiedAt: string;
  replyTargetUrn: string;
}

export type UnansweredCommentInboxResult = EngagementReadAvailability<readonly UnansweredCommentInboxItem[]>;

interface CommentInboxDeps {
  listComments: CommentInboxListComments;
}

function validateInput(input: CommentInboxInput): void {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new CommentInboxError('invalid_input');
  }
  if (typeof input.subject !== 'string' || input.subject.trim() === '') {
    throw new CommentInboxError('invalid_input');
  }
  if (
    !Array.isArray(input.threadUrns) ||
    input.threadUrns.length < 1 ||
    input.threadUrns.length > MAX_THREAD_ROOTS
  ) {
    throw new CommentInboxError('invalid_input');
  }

  const seen = new Set<string>();
  for (const threadUrn of input.threadUrns) {
    if (typeof threadUrn !== 'string' || !THREAD_URN_PATTERN.test(threadUrn) || seen.has(threadUrn)) {
      throw new CommentInboxError('invalid_input');
    }
    seen.add(threadUrn);
  }
}

function unavailableResult(
  result: Exclude<EngagementReadAvailability<CommentPage>, { status: 'available' }>,
): UnansweredCommentInboxResult {
  return {
    status: result.status,
    provider: 'OFFICIAL_API',
    requiredScope: 'r_member_social_feed',
  };
}

export async function deriveUnansweredCommentInbox(
  input: CommentInboxInput,
  deps: CommentInboxDeps,
): Promise<UnansweredCommentInboxResult> {
  validateInput(input);
  if (deps === null || typeof deps !== 'object' || typeof deps.listComments !== 'function') {
    throw new CommentInboxError('invalid_input');
  }

  let providerCalls = 0;
  const listAll = async (
    targetUrn: string,
  ): Promise<EngagementReadAvailability<readonly CanonicalComment[]>> => {
    let start = 0;
    const elements: CanonicalComment[] = [];

    for (let pageNumber = 1; pageNumber <= MAX_PAGES_PER_TARGET; pageNumber += 1) {
      providerCalls += 1;
      if (providerCalls > MAX_PROVIDER_CALLS) throw new CommentInboxError('limit_exceeded');

      const result = await deps.listComments({ targetUrn, start, count: PAGE_SIZE });
      if (result.status !== 'available') return unavailableResult(result);

      elements.push(...result.value.elements);
      const nextStart = result.value.paging.nextStart;
      if (nextStart === undefined) {
        return { status: 'available', provider: 'OFFICIAL_API', value: elements };
      }
      if (!Number.isSafeInteger(nextStart) || nextStart <= start || pageNumber === MAX_PAGES_PER_TARGET) {
        throw new CommentInboxError('limit_exceeded');
      }
      start = nextStart;
    }

    throw new CommentInboxError('limit_exceeded');
  };

  const selfActorUrn = `urn:li:person:${input.subject}`;
  const unanswered: UnansweredCommentInboxItem[] = [];

  for (const threadUrn of input.threadUrns) {
    const topLevelResult = await listAll(threadUrn);
    if (topLevelResult.status !== 'available') return unavailableResult(topLevelResult);

    const topLevelByUrn = new Map<string, CanonicalComment>();
    for (const comment of topLevelResult.value) {
      if (comment.parentCommentUrn === undefined) topLevelByUrn.set(comment.commentUrn, comment);
    }

    for (const comment of topLevelByUrn.values()) {
      const repliesResult = await listAll(comment.commentUrn);
      if (repliesResult.status !== 'available') return unavailableResult(repliesResult);

      const answered = repliesResult.value.some(
        (reply) => reply.parentCommentUrn === comment.commentUrn && reply.actorUrn === selfActorUrn,
      );
      if (answered) continue;

      unanswered.push({
        threadUrn,
        commentUrn: comment.commentUrn,
        actorUrn: comment.actorUrn,
        text: comment.text,
        createdAt: comment.createdAt,
        lastModifiedAt: comment.lastModifiedAt,
        replyTargetUrn: comment.commentUrn,
      });
    }
  }

  unanswered.sort((left, right) => {
    const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
    if (byCreatedAt !== 0) return byCreatedAt;
    return left.commentUrn.localeCompare(right.commentUrn);
  });

  return {
    status: 'available',
    provider: 'OFFICIAL_API',
    value: unanswered,
  };
}

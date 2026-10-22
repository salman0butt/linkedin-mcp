import type {
  CanonicalComment,
  CommentPage,
  EngagementReadAvailability,
} from '../../../../packages/core/dist/index.js';
import { AuthServiceError, type AuthService } from '../auth/auth-service.js';
import { deriveUnansweredCommentInbox, type UnansweredCommentInboxItem } from './comment-inbox.js';
import { LinkedInCommentsError, type LinkedInCommentsClient } from './linkedin-comments.js';

const requiredScope = 'r_member_social_feed' as const;

export interface EngagementReadService {
  getComment(input: {
    targetUrn: string;
    commentId: string;
  }): Promise<EngagementReadAvailability<CanonicalComment>>;
  listComments(input: {
    targetUrn: string;
    start?: number;
    count?: number;
  }): Promise<EngagementReadAvailability<CommentPage>>;
  inbox(input: {
    threadUrns: readonly string[];
  }): Promise<EngagementReadAvailability<readonly UnansweredCommentInboxItem[]>>;
}

interface EngagementReadServiceDeps {
  auth: Pick<AuthService, 'getProviderContext'>;
  comments: Pick<LinkedInCommentsClient, 'getComment' | 'listComments'>;
  enabled: boolean;
}

interface ReadContext {
  accessToken: string;
  subject: string;
}

function disabled<T>(): EngagementReadAvailability<T> {
  return { status: 'disabled', provider: 'OFFICIAL_API', requiredScope };
}

function permissionRequired<T>(): EngagementReadAvailability<T> {
  return { status: 'permission_required', provider: 'OFFICIAL_API', requiredScope };
}

function isPermissionError(error: unknown): boolean {
  if (error instanceof AuthServiceError) {
    return (
      error.kind === 'not_configured' ||
      error.kind === 'disconnected' ||
      error.kind === 'authorization_pending' ||
      error.kind === 'expired' ||
      error.kind === 'reauth_required' ||
      error.kind === 'permission_required'
    );
  }
  return (
    error instanceof LinkedInCommentsError &&
    (error.kind === 'reauthentication_required' || error.kind === 'permission_required')
  );
}

async function readContext(deps: EngagementReadServiceDeps): Promise<ReadContext | undefined> {
  try {
    const context = await deps.auth.getProviderContext();
    if (
      typeof context.accessToken !== 'string' ||
      context.accessToken.trim() === '' ||
      typeof context.subject !== 'string' ||
      context.subject.trim() === '' ||
      !Array.isArray(context.scopes) ||
      !context.scopes.includes(requiredScope)
    ) {
      return undefined;
    }
    return { accessToken: context.accessToken, subject: context.subject };
  } catch (error: unknown) {
    if (isPermissionError(error)) return undefined;
    throw error;
  }
}

async function available<T>(operation: () => Promise<T>): Promise<EngagementReadAvailability<T>> {
  try {
    return { status: 'available', provider: 'OFFICIAL_API', value: await operation() };
  } catch (error: unknown) {
    if (isPermissionError(error)) return permissionRequired<T>();
    throw error;
  }
}

export function createEngagementReadService(deps: EngagementReadServiceDeps): EngagementReadService {
  return {
    async getComment(input) {
      if (!deps.enabled) return disabled();
      const context = await readContext(deps);
      if (context === undefined) return permissionRequired();
      return available(() =>
        deps.comments.getComment({
          accessToken: context.accessToken,
          targetUrn: input.targetUrn,
          commentId: input.commentId,
        }),
      );
    },

    async listComments(input) {
      if (!deps.enabled) return disabled();
      const context = await readContext(deps);
      if (context === undefined) return permissionRequired();
      const request = {
        accessToken: context.accessToken,
        targetUrn: input.targetUrn,
        ...(input.start === undefined ? {} : { start: input.start }),
        ...(input.count === undefined ? {} : { count: input.count }),
      };
      return available(() => deps.comments.listComments(request));
    },

    async inbox(input) {
      if (!deps.enabled) return disabled();
      const context = await readContext(deps);
      if (context === undefined) return permissionRequired();
      return deriveUnansweredCommentInbox(
        { subject: context.subject, threadUrns: input.threadUrns },
        {
          listComments: async (pageInput) =>
            available(() =>
              deps.comments.listComments({
                accessToken: context.accessToken,
                targetUrn: pageInput.targetUrn,
                start: pageInput.start,
                count: pageInput.count,
              }),
            ),
        },
      );
    },
  };
}

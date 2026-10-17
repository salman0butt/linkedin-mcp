import { describe, expect, it, vi } from 'vitest';

import type { AuthService } from '../src/auth/auth-service.js';
import { parseConfig } from '../src/config.js';
import type { LinkedInCommentsClient } from '../src/engagement/linkedin-comments.js';
import { createLinkedInRuntime } from '../src/runtime.js';

const targetUrn = 'urn:li:share:6305471423242596352';
const commentId = '6636062862760562688';
const commentUrn = `urn:li:comment:(${targetUrn},${commentId})`;
const comment = {
  id: commentId,
  commentUrn,
  actorUrn: 'urn:li:person:member-456',
  objectUrn: targetUrn,
  text: 'Runtime comment',
  createdAt: '2026-10-17T12:00:00.000Z',
  lastModifiedAt: '2026-10-17T12:00:00.000Z',
  totalLikes: 0,
};

function runtimeEngagement(runtime: ReturnType<typeof createLinkedInRuntime>) {
  return (
    runtime as unknown as {
      engagement?: {
        reads: {
          getComment(input: { targetUrn: string; commentId: string }): Promise<unknown>;
          listComments(input: { targetUrn: string; start?: number; count?: number }): Promise<unknown>;
          inbox(input: { threadUrns: readonly string[] }): Promise<unknown>;
        };
        writes?: unknown;
      };
    }
  ).engagement;
}

function authWithScopes(scopes: string[]) {
  const getProviderContext = vi.fn(() =>
    Promise.resolve({
      accessToken: 'runtime-token',
      subject: 'member-123',
      scopes,
    }),
  );
  return {
    getProviderContext,
    authService: { getProviderContext } as unknown as AuthService,
  };
}

describe('M04 engagement runtime wiring', () => {
  it('keeps restricted reads disabled without probing auth or LinkedIn', async () => {
    const getProviderContext = vi.fn(() => Promise.reject(new Error('must not probe auth')));
    const getComment = vi.fn(() => Promise.reject(new Error('must not call provider')));
    const authService = { getProviderContext } as unknown as AuthService;
    const comments = { getComment } as unknown as LinkedInCommentsClient;

    const runtime = createLinkedInRuntime(parseConfig({ LINKEDIN_MCP_API_VERSION: '202610' }), {
      authService,
      comments,
    } as never);
    const engagement = runtimeEngagement(runtime);

    expect(engagement).toBeDefined();
    await expect(engagement?.reads.getComment({ targetUrn, commentId })).resolves.toEqual({
      status: 'disabled',
      provider: 'OFFICIAL_API',
      requiredScope: 'r_member_social_feed',
    });
    expect(getProviderContext).not.toHaveBeenCalled();
    expect(getComment).not.toHaveBeenCalled();
    expect(engagement?.writes).toBeUndefined();
  });

  it('fails closed before the provider when the restricted read scope is absent', async () => {
    const { authService, getProviderContext } = authWithScopes(['w_member_social_feed']);
    const getComment = vi.fn(() => Promise.reject(new Error('must not call provider')));
    const comments = { getComment } as unknown as LinkedInCommentsClient;

    const runtime = createLinkedInRuntime(
      parseConfig({
        LINKEDIN_MCP_API_VERSION: '202610',
        LINKEDIN_MCP_ENGAGEMENT_READ_ENABLED: 'true',
      }),
      { authService, comments } as never,
    );
    const engagement = runtimeEngagement(runtime);

    await expect(engagement?.reads.getComment({ targetUrn, commentId })).resolves.toEqual({
      status: 'permission_required',
      provider: 'OFFICIAL_API',
      requiredScope: 'r_member_social_feed',
    });
    expect(getProviderContext).toHaveBeenCalledTimes(1);
    expect(getComment).not.toHaveBeenCalled();
  });

  it('uses authenticated provider context for an explicitly enabled restricted read', async () => {
    const { authService } = authWithScopes(['r_member_social_feed']);
    const getComment = vi.fn(() => Promise.resolve(comment));
    const comments = { getComment } as unknown as LinkedInCommentsClient;

    const runtime = createLinkedInRuntime(
      parseConfig({
        LINKEDIN_MCP_API_VERSION: '202610',
        LINKEDIN_MCP_ENGAGEMENT_READ_ENABLED: 'true',
      }),
      { authService, comments } as never,
    );
    const engagement = runtimeEngagement(runtime);

    await expect(engagement?.reads.getComment({ targetUrn, commentId })).resolves.toEqual({
      status: 'available',
      provider: 'OFFICIAL_API',
      value: comment,
    });
    expect(getComment).toHaveBeenCalledWith({
      accessToken: 'runtime-token',
      targetUrn,
      commentId,
    });
    expect(engagement?.writes).toBeUndefined();
  });

  it('forwards only explicit bounded paging to the comments list adapter', async () => {
    const { authService } = authWithScopes(['r_member_social_feed']);
    const page = {
      elements: [comment],
      paging: { start: 10, count: 25, total: 1 },
      provider: 'OFFICIAL_API' as const,
    };
    const listComments = vi.fn(() => Promise.resolve(page));
    const comments = { listComments } as unknown as LinkedInCommentsClient;

    const runtime = createLinkedInRuntime(
      parseConfig({
        LINKEDIN_MCP_API_VERSION: '202610',
        LINKEDIN_MCP_ENGAGEMENT_READ_ENABLED: 'true',
      }),
      { authService, comments } as never,
    );
    const engagement = runtimeEngagement(runtime);

    await expect(engagement?.reads.listComments({ targetUrn, start: 10, count: 25 })).resolves.toEqual({
      status: 'available',
      provider: 'OFFICIAL_API',
      value: page,
    });
    expect(listComments).toHaveBeenCalledWith({
      accessToken: 'runtime-token',
      targetUrn,
      start: 10,
      count: 25,
    });
  });

  it('derives the inbox from explicit roots using the authenticated member subject', async () => {
    const { authService, getProviderContext } = authWithScopes(['r_member_social_feed']);
    const listComments = vi
      .fn()
      .mockResolvedValueOnce({
        elements: [comment],
        paging: { start: 0, count: 100, total: 1 },
        provider: 'OFFICIAL_API' as const,
      })
      .mockResolvedValueOnce({
        elements: [],
        paging: { start: 0, count: 100, total: 0 },
        provider: 'OFFICIAL_API' as const,
      });
    const comments = { listComments } as unknown as LinkedInCommentsClient;

    const runtime = createLinkedInRuntime(
      parseConfig({
        LINKEDIN_MCP_API_VERSION: '202610',
        LINKEDIN_MCP_ENGAGEMENT_READ_ENABLED: 'true',
      }),
      { authService, comments } as never,
    );
    const engagement = runtimeEngagement(runtime);

    await expect(engagement?.reads.inbox({ threadUrns: [targetUrn] })).resolves.toEqual({
      status: 'available',
      provider: 'OFFICIAL_API',
      value: [
        {
          threadUrn: targetUrn,
          commentUrn,
          actorUrn: comment.actorUrn,
          text: comment.text,
          createdAt: comment.createdAt,
          lastModifiedAt: comment.lastModifiedAt,
          replyTargetUrn: commentUrn,
        },
      ],
    });
    expect(getProviderContext).toHaveBeenCalledTimes(1);
    expect(listComments).toHaveBeenNthCalledWith(1, {
      accessToken: 'runtime-token',
      targetUrn,
      start: 0,
      count: 100,
    });
    expect(listComments).toHaveBeenNthCalledWith(2, {
      accessToken: 'runtime-token',
      targetUrn: commentUrn,
      start: 0,
      count: 100,
    });
  });
});

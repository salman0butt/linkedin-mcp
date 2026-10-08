import { describe, expect, it } from 'vitest';

import type { TextPostPayload } from '../../../packages/core/dist/index.js';
import { LinkedInPostsError, createLinkedInPostsAdapter } from '../src/publishing/linkedin-posts.js';

const payload: TextPostPayload = {
  commentary: 'Ship safely',
  visibility: 'PUBLIC',
  distribution: {
    feedDistribution: 'MAIN_FEED',
    targetEntities: [],
    thirdPartyDistributionChannels: [],
  },
  lifecycleState: 'PUBLISHED',
  isReshareDisabled: false,
};

function recorder(response: Response): {
  calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }>;
  fetch: typeof fetch;
} {
  const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
  return {
    calls,
    fetch: (input, init) => {
      calls.push({ input, init });
      return Promise.resolve(response);
    },
  };
}

function throwingRecorder(): {
  calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }>;
  fetch: typeof fetch;
} {
  const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
  return {
    calls,
    fetch: (input, init) => {
      calls.push({ input, init });
      return Promise.reject(new Error('network detail access-token-secret'));
    },
  };
}

describe('official LinkedIn Posts adapter', () => {
  it('creates exactly one member text post with the documented endpoint, headers, and body', async () => {
    const recorded = recorder(
      new Response(null, {
        status: 201,
        headers: { 'x-restli-id': 'urn:li:share:123' },
      }),
    );
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    await expect(
      adapter.createTextPost({
        accessToken: 'access-token-secret',
        author: 'urn:li:person:member-123',
        payload,
      }),
    ).resolves.toEqual({ postUrn: 'urn:li:share:123' });

    expect(recorded.calls).toHaveLength(1);
    expect(recorded.calls[0]?.input).toBe('https://api.linkedin.com/rest/posts');
    expect(recorded.calls[0]?.init).toEqual({
      method: 'POST',
      headers: {
        authorization: 'Bearer access-token-secret',
        'content-type': 'application/json',
        'linkedin-version': '202510',
        'x-restli-protocol-version': '2.0.0',
      },
      body: JSON.stringify({
        author: 'urn:li:person:member-123',
        commentary: 'Ship safely',
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabled: false,
      }),
    });
    const requestInput = recorded.calls[0]?.input;
    if (typeof requestInput !== 'string') throw new Error('Expected Posts request URL string');
    expect(requestInput).not.toContain('access-token-secret');
  });

  it.each([
    undefined,
    '',
    'not-a-post-urn',
    'urn:li:share:123 456',
    'urn:li:organization:123',
    'urn:li:share:abc',
  ])('rejects HTTP 201 with invalid x-restli-id %s as malformed success', async (postUrn) => {
    const recorded = recorder(
      new Response(null, {
        status: 201,
        ...(postUrn === undefined ? {} : { headers: { 'x-restli-id': postUrn } }),
      }),
    );
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    await expect(
      adapter.createTextPost({
        accessToken: 'access-token-secret',
        author: 'urn:li:person:member-123',
        payload,
      }),
    ).rejects.toMatchObject({ kind: 'malformed_success', retryable: false });
  });

  it('rejects a malformed post identifier with internal whitespace instead of accepting the header', async () => {
    const recorded = recorder(
      new Response(null, {
        status: 201,
        headers: { 'x-restli-id': 'urn:li:share:123 456' },
      }),
    );
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    await expect(
      adapter.createTextPost({
        accessToken: 'access-token-secret',
        author: 'urn:li:person:member-123',
        payload,
      }),
    ).rejects.toMatchObject({ kind: 'malformed_success', retryable: false });
    expect(recorded.calls).toHaveLength(1);
  });

  it('accepts a documented ugcPost identifier with a decimal identifier', async () => {
    const recorded = recorder(
      new Response(null, {
        status: 201,
        headers: { 'x-restli-id': 'urn:li:ugcPost:987654321' },
      }),
    );
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    await expect(
      adapter.createTextPost({
        accessToken: 'access-token-secret',
        author: 'urn:li:person:member-123',
        payload,
      }),
    ).resolves.toEqual({ postUrn: 'urn:li:ugcPost:987654321' });
  });

  it.each([
    [401, 'reauthentication_required'],
    [403, 'permission_required'],
    [409, 'conflict'],
    [429, 'rate_limited'],
    [500, 'provider_failure'],
  ] as const)('classifies HTTP %i without leaking provider or token details', async (status, kind) => {
    const recorded = recorder(
      new Response(
        JSON.stringify({
          message: 'provider-private-detail access-token-secret',
        }),
        { status, headers: { 'content-type': 'application/json' } },
      ),
    );
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    let error: unknown;
    try {
      await adapter.createTextPost({
        accessToken: 'access-token-secret',
        author: 'urn:li:person:member-123',
        payload,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(LinkedInPostsError);
    expect(error).toMatchObject({ kind, retryable: false });
    expect((error as Error).message).not.toContain('access-token-secret');
    expect((error as Error).message).not.toContain('provider-private-detail');
    expect(recorded.calls).toHaveLength(1);
  });

  it('classifies a transport failure as outcome_unknown and never retries', async () => {
    const recorded = throwingRecorder();
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    let error: unknown;
    try {
      await adapter.createTextPost({
        accessToken: 'access-token-secret',
        author: 'urn:li:person:member-123',
        payload,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(LinkedInPostsError);
    expect(error).toMatchObject({ kind: 'outcome_unknown', retryable: false });
    expect((error as Error).message).not.toContain('access-token-secret');
    expect(recorded.calls).toHaveLength(1);
  });
});

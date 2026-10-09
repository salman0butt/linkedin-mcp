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
  const validReadBody = {
    id: 'urn:li:share:123',
    author: 'urn:li:person:member-123',
    commentary: 'Ship safely',
    lifecycleState: 'PUBLISHED',
  };

  it('reads one encoded post with the official GET headers and normalizes only required fields', async () => {
    const recorded = recorder(
      new Response(
        JSON.stringify({
          id: 'urn:li:share:123',
          author: 'urn:li:person:member-123',
          commentary: 'Ship safely',
          lifecycleState: 'PUBLISHED',
          benignExtra: 'ignored',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    await expect(
      adapter.getTextPost({ accessToken: 'access-token-secret', postUrn: 'urn:li:share:123' }),
    ).resolves.toEqual({
      postUrn: 'urn:li:share:123',
      author: 'urn:li:person:member-123',
      commentary: 'Ship safely',
      lifecycleState: 'PUBLISHED',
    });
    expect(recorded.calls).toHaveLength(1);
    expect(recorded.calls[0]?.input).toBe('https://api.linkedin.com/rest/posts/urn%3Ali%3Ashare%3A123');
    expect(recorded.calls[0]?.init).toEqual({
      method: 'GET',
      headers: {
        authorization: 'Bearer access-token-secret',
        'linkedin-version': '202510',
        'x-restli-protocol-version': '2.0.0',
      },
    });
    const requestUrl = recorded.calls[0]?.input;
    expect(requestUrl).toBeTypeOf('string');
    if (typeof requestUrl === 'string') expect(requestUrl).not.toContain('access-token-secret');
  });

  it.each([
    ['missing ID', 'id', undefined, true],
    ['invalid ID type', 'id', 123, false],
    ['invalid ID syntax', 'id', 'urn:li:share:1?x=1', false],
    ['missing author', 'author', undefined, true],
    ['invalid author type', 'author', 12, false],
    ['invalid author URN', 'author', 'member-123', false],
    ['malformed organization URN', 'author', 'urn:li:organization:abc', false],
    ['blank author', 'author', '  ', false],
    ['missing commentary', 'commentary', undefined, true],
    ['invalid commentary type', 'commentary', 12, false],
    ['blank commentary', 'commentary', '  ', false],
    ['missing lifecycle', 'lifecycleState', undefined, true],
    ['invalid lifecycle type', 'lifecycleState', null, false],
    ['blank lifecycle', 'lifecycleState', '  ', false],
  ] as const)(
    'rejects %s independently when all other successful response fields are valid',
    async (_label, field, value, omit) => {
      const body: Record<string, unknown> = { ...validReadBody };
      if (omit) delete body[field];
      else body[field] = value;
      const recorded = recorder(Response.json(body));
      const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

      await expect(
        adapter.getTextPost({ accessToken: 'access-token-secret', postUrn: 'urn:li:share:1' }),
      ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
      expect(recorded.calls).toHaveLength(1);
    },
  );

  it.each([new Response('{', { status: 200 }), Response.json([])])(
    'rejects invalid JSON/object response shapes with a static malformed response',
    async (response) => {
      const recorded = recorder(response);
      const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

      await expect(
        adapter.getTextPost({ accessToken: 'access-token-secret', postUrn: 'urn:li:share:1' }),
      ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
      expect(recorded.calls).toHaveLength(1);
    },
  );

  it('normalizes a valid ugcPost GET response and fully encodes its identifier', async () => {
    const recorded = recorder(Response.json({ ...validReadBody, id: 'urn:li:ugcPost:987654321' }));
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    await expect(
      adapter.getTextPost({ accessToken: 'access-token-secret', postUrn: 'urn:li:ugcPost:987654321' }),
    ).resolves.toMatchObject({ postUrn: 'urn:li:ugcPost:987654321' });
    expect(recorded.calls).toHaveLength(1);
    expect(recorded.calls[0]?.input).toBe(
      'https://api.linkedin.com/rest/posts/urn%3Ali%3AugcPost%3A987654321',
    );
  });

  it.each(['', '  ', null])('rejects invalid GET token %s before fetch', async (accessToken) => {
    const recorded = recorder(Response.json(validReadBody));
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    await expect(
      adapter.getTextPost({ accessToken, postUrn: 'urn:li:share:1' } as unknown as {
        accessToken: string;
        postUrn: string;
      }),
    ).rejects.toThrow();
    expect(recorded.calls).toHaveLength(0);
  });

  it.each([
    [401, 'reauthentication_required'],
    [403, 'permission_required'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'provider_failure'],
  ] as const)('classifies GET HTTP %i without reading its private body', async (status, kind) => {
    let bodyRead = false;
    const response = new Response('private provider body access-token-secret', { status });
    const originalText = response.text.bind(response);
    response.text = () => {
      bodyRead = true;
      return originalText();
    };
    response.json = () => {
      bodyRead = true;
      return Promise.reject(new Error('must not parse'));
    };
    const recorded = recorder(response);
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    let caught: unknown;
    try {
      await adapter.getTextPost({ accessToken: 'access-token-secret', postUrn: 'urn:li:share:1' });
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LinkedInPostsError);
    expect(caught).toMatchObject({ kind, retryable: false });
    expect((caught as Error).message).not.toContain('private provider body');
    expect((caught as Error).message).not.toContain('access-token-secret');
    expect(bodyRead).toBe(false);
  });

  it.each(['', 'urn:li:share:1?x=1', 'urn:li:organization:1'])(
    'rejects invalid GET input %s before fetch',
    async (postUrn) => {
      const recorded = recorder(Response.json({}));
      const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

      await expect(adapter.getTextPost({ accessToken: 'access-token-secret', postUrn })).rejects.toThrow();
      expect(recorded.calls).toHaveLength(0);
    },
  );

  it('classifies GET transport failures as sanitized provider failures without retrying', async () => {
    const recorded = throwingRecorder();
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    await expect(
      adapter.getTextPost({ accessToken: 'access-token-secret', postUrn: 'urn:li:share:1' }),
    ).rejects.toMatchObject({ kind: 'provider_failure', retryable: false });
    expect(recorded.calls).toHaveLength(1);
  });

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

  it('keeps organization authors invalid for POST even though GET can normalize them', async () => {
    const recorded = recorder(
      new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:123' } }),
    );
    const adapter = createLinkedInPostsAdapter({ apiVersion: '202510' }, { fetch: recorded.fetch });

    await expect(
      adapter.createTextPost({
        accessToken: 'access-token-secret',
        author: 'urn:li:organization:987',
        payload,
      }),
    ).rejects.toThrow('LinkedIn member author must be a person URN');
    expect(recorded.calls).toHaveLength(0);
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

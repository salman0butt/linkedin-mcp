import { describe, expect, it } from 'vitest';

import { LinkedInImagesError, createLinkedInImagesClient } from '../src/publishing/linkedin-images.js';

interface RecordedCall {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
}

function recorder(...responses: Response[]): {
  calls: RecordedCall[];
  fetch: typeof fetch;
} {
  const calls: RecordedCall[] = [];
  return {
    calls,
    fetch: (input, init) => {
      calls.push({ input, init });
      const response = responses.shift();
      if (!response) return Promise.reject(new Error('No queued response'));
      return Promise.resolve(response);
    },
  };
}

function throwingRecorder(): {
  calls: RecordedCall[];
  fetch: typeof fetch;
} {
  const calls: RecordedCall[] = [];
  return {
    calls,
    fetch: (input, init) => {
      calls.push({ input, init });
      return Promise.reject(new Error('private transport detail access-token-secret'));
    },
  };
}

function unreadableErrorResponse(status: number): { response: Response; wasRead: () => boolean } {
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
  return { response, wasRead: () => bodyRead };
}

const initializeBody = {
  value: {
    uploadUrl: 'https://www.linkedin.com/dms-uploads/C4E10AQ/upload?ca=vector',
    image: 'urn:li:image:C4E10AQHqQ1',
    uploadUrlExpiresAt: 1_800_000_000_000,
  },
};

const config = { apiVersion: '202610' };

describe('official LinkedIn Images client', () => {
  it('initializes exactly one member image with official endpoint, headers, and body', async () => {
    const recorded = recorder(Response.json(initializeBody));
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    await expect(
      client.initializeUpload({
        accessToken: 'access-token-secret',
        ownerUrn: 'urn:li:person:member-123',
      }),
    ).resolves.toEqual({
      imageUrn: 'urn:li:image:C4E10AQHqQ1',
      uploadUrl: 'https://www.linkedin.com/dms-uploads/C4E10AQ/upload?ca=vector',
      uploadUrlExpiresAt: 1_800_000_000_000,
    });

    expect(recorded.calls).toHaveLength(1);
    expect(recorded.calls[0]?.input).toBe(
      'https://api.linkedin.com/rest/images?action=initializeUpload',
    );
    expect(recorded.calls[0]?.init).toEqual({
      method: 'POST',
      headers: {
        authorization: 'Bearer access-token-secret',
        'content-type': 'application/json',
        'linkedin-version': '202610',
        'x-restli-protocol-version': '2.0.0',
      },
      body: JSON.stringify({
        initializeUploadRequest: { owner: 'urn:li:person:member-123' },
      }),
    });
    expect(String(recorded.calls[0]?.input)).not.toContain('access-token-secret');
  });

  it.each([
    [{ value: { ...initializeBody.value, image: 'urn:li:image:' } }, 'invalid image URN'],
    [{ value: { ...initializeBody.value, uploadUrl: 'http://www.linkedin.com/upload' } }, 'non-HTTPS URL'],
    [
      { value: { ...initializeBody.value, uploadUrl: 'https://www.linkedin.com.evil.example/upload' } },
      'spoofed host',
    ],
    [{ value: { ...initializeBody.value, uploadUrlExpiresAt: 0 } }, 'invalid expiry'],
    [{ value: { image: 'urn:li:image:C4E10AQHqQ1' } }, 'missing fields'],
  ])('rejects malformed initialize success: %s', async (body) => {
    const recorded = recorder(Response.json(body));
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    await expect(
      client.initializeUpload({
        accessToken: 'access-token-secret',
        ownerUrn: 'urn:li:person:member-123',
      }),
    ).rejects.toMatchObject({ kind: 'malformed_success', retryable: false });
  });

  it.each([
    [401, 'reauthentication_required'],
    [403, 'permission_required'],
    [429, 'rate_limited'],
    [500, 'provider_failure'],
  ] as const)('classifies initialize HTTP %i without reading private body', async (status, kind) => {
    const { response, wasRead } = unreadableErrorResponse(status);
    const recorded = recorder(response);
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    let caught: unknown;
    try {
      await client.initializeUpload({
        accessToken: 'access-token-secret',
        ownerUrn: 'urn:li:person:member-123',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LinkedInImagesError);
    expect(caught).toMatchObject({ kind, retryable: false });
    expect((caught as Error).message).not.toContain('access-token-secret');
    expect((caught as Error).message).not.toContain('private provider body');
    expect(wasRead()).toBe(false);
  });

  it('treats initialize transport failure as an unknown mutation outcome without retrying', async () => {
    const recorded = throwingRecorder();
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    await expect(
      client.initializeUpload({
        accessToken: 'access-token-secret',
        ownerUrn: 'urn:li:person:member-123',
      }),
    ).rejects.toMatchObject({ kind: 'outcome_unknown', retryable: false });
    expect(recorded.calls).toHaveLength(1);
  });

  it.each(['', '  ', 'urn:li:organization:123', 'person-123'])(
    'rejects invalid initialize owner %j before fetch',
    async (ownerUrn) => {
      const recorded = recorder(Response.json(initializeBody));
      const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

      await expect(
        client.initializeUpload({ accessToken: 'access-token-secret', ownerUrn }),
      ).rejects.toThrow();
      expect(recorded.calls).toHaveLength(0);
    },
  );

  it('uploads exact bytes once without redirects and keeps the token in headers', async () => {
    const recorded = recorder(new Response(null, { status: 201 }));
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

    await expect(
      client.upload({
        accessToken: 'access-token-secret',
        uploadUrl: 'https://www.linkedin.com/dms-uploads/C4E10AQ/upload?ca=vector',
        bytes,
        mimeType: 'image/jpeg',
      }),
    ).resolves.toBeUndefined();

    expect(recorded.calls).toHaveLength(1);
    expect(recorded.calls[0]?.input).toBe(
      'https://www.linkedin.com/dms-uploads/C4E10AQ/upload?ca=vector',
    );
    expect(recorded.calls[0]?.init).toEqual({
      method: 'PUT',
      headers: {
        authorization: 'Bearer access-token-secret',
        'content-type': 'image/jpeg',
      },
      body: bytes,
      redirect: 'error',
    });
    expect(String(recorded.calls[0]?.input)).not.toContain('access-token-secret');
  });

  it.each([
    'http://www.linkedin.com/dms-uploads/x',
    'https://linkedin.com.evil.example/dms-uploads/x',
    'https://example.com/upload',
  ])('rejects unsafe upload URL %s before fetch', async (uploadUrl) => {
    const recorded = recorder(new Response(null, { status: 201 }));
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    await expect(
      client.upload({
        accessToken: 'access-token-secret',
        uploadUrl,
        bytes: Uint8Array.from([1]),
        mimeType: 'image/png',
      }),
    ).rejects.toThrow();
    expect(recorded.calls).toHaveLength(0);
  });

  it.each([
    [401, 'reauthentication_required'],
    [403, 'permission_required'],
    [429, 'rate_limited'],
    [500, 'provider_failure'],
  ] as const)('classifies upload HTTP %i without reading private body', async (status, kind) => {
    const { response, wasRead } = unreadableErrorResponse(status);
    const recorded = recorder(response);
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    let caught: unknown;
    try {
      await client.upload({
        accessToken: 'access-token-secret',
        uploadUrl: 'https://www.linkedin.com/dms-uploads/C4E10AQ/upload?secret=url-detail',
        bytes: Uint8Array.from([1, 2, 3]),
        mimeType: 'image/png',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LinkedInImagesError);
    expect(caught).toMatchObject({ kind, retryable: false });
    expect((caught as Error).message).not.toContain('access-token-secret');
    expect((caught as Error).message).not.toContain('url-detail');
    expect((caught as Error).message).not.toContain('private provider body');
    expect(wasRead()).toBe(false);
  });

  it('treats upload transport failure as an unknown mutation outcome without retrying', async () => {
    const recorded = throwingRecorder();
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    await expect(
      client.upload({
        accessToken: 'access-token-secret',
        uploadUrl: 'https://www.linkedin.com/dms-uploads/C4E10AQ/upload',
        bytes: Uint8Array.from([1, 2, 3]),
        mimeType: 'image/gif',
      }),
    ).rejects.toMatchObject({ kind: 'outcome_unknown', retryable: false });
    expect(recorded.calls).toHaveLength(1);
  });

  it.each(['WAITING_UPLOAD', 'PROCESSING', 'PROCESSING_FAILED', 'AVAILABLE'] as const)(
    'reads image status %s with official versioned GET',
    async (status) => {
      const recorded = recorder(Response.json({ status }));
      const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

      await expect(
        client.getStatus({
          accessToken: 'access-token-secret',
          imageUrn: 'urn:li:image:C4E10AQHqQ1',
        }),
      ).resolves.toBe(status);
      expect(recorded.calls).toHaveLength(1);
      expect(recorded.calls[0]?.input).toBe(
        'https://api.linkedin.com/rest/images/urn%3Ali%3Aimage%3AC4E10AQHqQ1',
      );
      expect(recorded.calls[0]?.init).toEqual({
        method: 'GET',
        headers: {
          authorization: 'Bearer access-token-secret',
          'linkedin-version': '202610',
          'x-restli-protocol-version': '2.0.0',
        },
      });
    },
  );

  it.each([
    [401, 'reauthentication_required'],
    [403, 'permission_required'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'provider_failure'],
  ] as const)('classifies status GET HTTP %i without reading private body', async (status, kind) => {
    const { response, wasRead } = unreadableErrorResponse(status);
    const recorded = recorder(response);
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    await expect(
      client.getStatus({
        accessToken: 'access-token-secret',
        imageUrn: 'urn:li:image:C4E10AQHqQ1',
      }),
    ).rejects.toMatchObject({ kind, retryable: false });
    expect(wasRead()).toBe(false);
  });

  it.each([
    new Response('{', { status: 200 }),
    Response.json([]),
    Response.json({ status: 'UNKNOWN_STATUS' }),
  ])('rejects malformed image status success', async (response) => {
    const recorded = recorder(response);
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    await expect(
      client.getStatus({
        accessToken: 'access-token-secret',
        imageUrn: 'urn:li:image:C4E10AQHqQ1',
      }),
    ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
  });

  it('classifies status transport failure as a sanitized provider failure', async () => {
    const recorded = throwingRecorder();
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    await expect(
      client.getStatus({
        accessToken: 'access-token-secret',
        imageUrn: 'urn:li:image:C4E10AQHqQ1',
      }),
    ).rejects.toMatchObject({ kind: 'provider_failure', retryable: false });
    expect(recorded.calls).toHaveLength(1);
  });

  it.each(['', 'urn:li:image:', 'urn:li:image:C4E?bad', 'urn:li:share:123'])(
    'rejects invalid image URN %j before status fetch',
    async (imageUrn) => {
      const recorded = recorder(Response.json({ status: 'AVAILABLE' }));
      const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

      await expect(
        client.getStatus({ accessToken: 'access-token-secret', imageUrn }),
      ).rejects.toThrow();
      expect(recorded.calls).toHaveLength(0);
    },
  );

  it.each(['', '  ', 'not-a-token'])('validates required token syntax only for nonblank values', (token) => {
    if (token === 'not-a-token') return;
    const client = createLinkedInImagesClient(config, { fetch: recorder(Response.json({})).fetch });
    expect(
      client.initializeUpload({
        accessToken: token,
        ownerUrn: 'urn:li:person:member-123',
      }),
    ).rejects.toThrow();
  });

  it.each(['2026-10', '20261', '202600', '202613'])(
    'rejects invalid API version %s at construction',
    (apiVersion) => {
      expect(() => createLinkedInImagesClient({ apiVersion })).toThrow(/YYYYMM/i);
    },
  );
});

import { describe, expect, it } from 'vitest';

import { LinkedInImagesError, createLinkedInImagesClient } from '../src/publishing/linkedin-images.js';

interface RecordedCall {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
}

interface RecordedFetch {
  calls: RecordedCall[];
  fetch: typeof fetch;
}

function recorder(...responses: Response[]): RecordedFetch {
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

function throwingRecorder(): RecordedFetch {
  const calls: RecordedCall[] = [];
  return {
    calls,
    fetch: (input, init) => {
      calls.push({ input, init });
      return Promise.reject(new Error('private transport detail access-token-secret'));
    },
  };
}

interface UnreadableErrorResponse {
  response: Response;
  wasRead: () => boolean;
}

function unreadableErrorResponse(status: number): UnreadableErrorResponse {
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

const config = { apiVersion: '202610' };
const validImageUrn = 'urn:li:image:C4E10AQHqQ1';
const validUploadUrl = 'https://www.linkedin.com/dms-uploads/C4E10AQ/upload?ca=vector';
const initializeBody = {
  value: {
    uploadUrl: validUploadUrl,
    image: validImageUrn,
    uploadUrlExpiresAt: 1_800_000_000_000,
  },
};

describe('official LinkedIn Images client', () => {
  it('initializes one image with the official request contract', async () => {
    const recorded = recorder(Response.json(initializeBody));
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    await expect(
      client.initializeUpload({
        accessToken: 'access-token-secret',
        ownerUrn: 'urn:li:person:member-123',
      }),
    ).resolves.toEqual({
      imageUrn: validImageUrn,
      uploadUrl: validUploadUrl,
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

  it('rejects malformed initialize success values', async () => {
    const invalidBodies = [
      { value: { ...initializeBody.value, image: 'urn:li:image:' } },
      { value: { ...initializeBody.value, uploadUrl: 'http://www.linkedin.com/upload' } },
      {
        value: {
          ...initializeBody.value,
          uploadUrl: 'https://www.linkedin.com.evil.example/upload',
        },
      },
      { value: { ...initializeBody.value, uploadUrlExpiresAt: 0 } },
      { value: { image: validImageUrn } },
    ];

    for (const body of invalidBodies) {
      const recorded = recorder(Response.json(body));
      const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });
      await expect(
        client.initializeUpload({
          accessToken: 'access-token-secret',
          ownerUrn: 'urn:li:person:member-123',
        }),
      ).rejects.toMatchObject({ kind: 'malformed_success', retryable: false });
    }
  });

  it('classifies initialize HTTP errors without reading private bodies', async () => {
    const cases = [
      [401, 'reauthentication_required'],
      [403, 'permission_required'],
      [429, 'rate_limited'],
      [500, 'provider_failure'],
    ] as const;

    for (const [status, kind] of cases) {
      const errorResponse = unreadableErrorResponse(status);
      const recorded = recorder(errorResponse.response);
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
      expect(errorResponse.wasRead()).toBe(false);
    }
  });

  it('treats initialize transport failure as outcome unknown', async () => {
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

  it('rejects invalid initialize input before fetch', async () => {
    const recorded = recorder(Response.json(initializeBody));
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    await expect(
      client.initializeUpload({
        accessToken: 'access-token-secret',
        ownerUrn: 'urn:li:organization:123',
      }),
    ).rejects.toThrow();
    await expect(
      client.initializeUpload({ accessToken: '', ownerUrn: 'urn:li:person:member-123' }),
    ).rejects.toThrow();
    expect(recorded.calls).toHaveLength(0);
  });

  it('uploads exact bytes once without following redirects', async () => {
    const recorded = recorder(new Response(null, { status: 201 }));
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

    await expect(
      client.upload({
        accessToken: 'access-token-secret',
        uploadUrl: validUploadUrl,
        bytes,
        mimeType: 'image/jpeg',
      }),
    ).resolves.toBeUndefined();

    expect(recorded.calls).toHaveLength(1);
    expect(recorded.calls[0]?.input).toBe(validUploadUrl);
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

  it('rejects unsafe upload URLs before fetch', async () => {
    const unsafeUrls = [
      'http://www.linkedin.com/dms-uploads/x',
      'https://linkedin.com.evil.example/dms-uploads/x',
      'https://example.com/upload',
    ];

    for (const uploadUrl of unsafeUrls) {
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
    }
  });

  it('classifies upload errors without leaking provider data', async () => {
    const cases = [
      [401, 'reauthentication_required'],
      [403, 'permission_required'],
      [429, 'rate_limited'],
      [500, 'provider_failure'],
    ] as const;

    for (const [status, kind] of cases) {
      const errorResponse = unreadableErrorResponse(status);
      const recorded = recorder(errorResponse.response);
      const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });
      let caught: unknown;
      try {
        await client.upload({
          accessToken: 'access-token-secret',
          uploadUrl: `${validUploadUrl}&secret=url-detail`,
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
      expect(errorResponse.wasRead()).toBe(false);
    }
  });

  it('treats upload transport failure as outcome unknown', async () => {
    const recorded = throwingRecorder();
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    await expect(
      client.upload({
        accessToken: 'access-token-secret',
        uploadUrl: validUploadUrl,
        bytes: Uint8Array.from([1, 2, 3]),
        mimeType: 'image/gif',
      }),
    ).rejects.toMatchObject({ kind: 'outcome_unknown', retryable: false });
    expect(recorded.calls).toHaveLength(1);
  });

  it('reads every documented image status with the official GET contract', async () => {
    const statuses = ['WAITING_UPLOAD', 'PROCESSING', 'PROCESSING_FAILED', 'AVAILABLE'] as const;

    for (const status of statuses) {
      const recorded = recorder(Response.json({ status }));
      const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });
      await expect(
        client.getStatus({ accessToken: 'access-token-secret', imageUrn: validImageUrn }),
      ).resolves.toBe(status);
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
    }
  });

  it('rejects malformed image status responses', async () => {
    const responses = [
      new Response('{', { status: 200 }),
      Response.json([]),
      Response.json({ status: 'UNKNOWN_STATUS' }),
    ];

    for (const response of responses) {
      const recorded = recorder(response);
      const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });
      await expect(
        client.getStatus({ accessToken: 'access-token-secret', imageUrn: validImageUrn }),
      ).rejects.toMatchObject({ kind: 'malformed_response', retryable: false });
    }
  });

  it('classifies status GET errors without reading private bodies', async () => {
    const cases = [
      [401, 'reauthentication_required'],
      [403, 'permission_required'],
      [404, 'not_found'],
      [429, 'rate_limited'],
      [500, 'provider_failure'],
    ] as const;

    for (const [status, kind] of cases) {
      const errorResponse = unreadableErrorResponse(status);
      const recorded = recorder(errorResponse.response);
      const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });
      await expect(
        client.getStatus({ accessToken: 'access-token-secret', imageUrn: validImageUrn }),
      ).rejects.toMatchObject({ kind, retryable: false });
      expect(errorResponse.wasRead()).toBe(false);
    }
  });

  it('classifies status transport failure as provider failure', async () => {
    const recorded = throwingRecorder();
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    await expect(
      client.getStatus({ accessToken: 'access-token-secret', imageUrn: validImageUrn }),
    ).rejects.toMatchObject({ kind: 'provider_failure', retryable: false });
    expect(recorded.calls).toHaveLength(1);
  });

  it('rejects invalid status input and API versions before provider calls', async () => {
    const recorded = recorder(Response.json({ status: 'AVAILABLE' }));
    const client = createLinkedInImagesClient(config, { fetch: recorded.fetch });

    await expect(
      client.getStatus({ accessToken: 'access-token-secret', imageUrn: 'urn:li:share:123' }),
    ).rejects.toThrow();
    expect(recorded.calls).toHaveLength(0);
    expect(() => createLinkedInImagesClient({ apiVersion: '2026-10' })).toThrow(/YYYYMM/i);
  });
});

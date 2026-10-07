import { describe, expect, it } from 'vitest';

import { LinkedInIdentityError, fetchLinkedInIdentity } from '../src/auth/linkedin-identity.js';

function recorder(response: Response): { calls: Array<{ input: RequestInfo | URL; init?: RequestInit }>; fetch: typeof fetch } {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  return {
    calls,
    fetch: (input, init) => {
      calls.push({ input, init });
      return Promise.resolve(response);
    },
  };
}

describe('official LinkedIn OIDC userinfo identity', () => {
  it('maps documented userinfo claims and sends the token only as a bearer header', async () => {
    const recorded = recorder(
      new Response(
        JSON.stringify({
          sub: 'member-123',
          name: 'Example Member',
          given_name: 'Example',
          family_name: 'Member',
          picture: 'https://example.test/avatar.png',
          locale: 'en-US',
          email: 'member@example.test',
          email_verified: true,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(fetchLinkedInIdentity('access-token-secret', { fetch: recorded.fetch })).resolves.toEqual({
      sub: 'member-123',
      name: 'Example Member',
      givenName: 'Example',
      familyName: 'Member',
      picture: 'https://example.test/avatar.png',
      locale: 'en-US',
      email: 'member@example.test',
      emailVerified: true,
    });

    expect(recorded.calls).toHaveLength(1);
    expect(recorded.calls[0]?.input).toBe('https://api.linkedin.com/v2/userinfo');
    expect(recorded.calls[0]?.init).toEqual({
      method: 'GET',
      headers: { authorization: 'Bearer access-token-secret' },
    });
    expect(String(recorded.calls[0]?.input)).not.toContain('access-token-secret');
  });

  it('keeps optional email claims absent when LinkedIn omits them', async () => {
    const recorded = recorder(
      new Response(JSON.stringify({ sub: 'member-123', name: 'Example Member' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(fetchLinkedInIdentity('access-token-secret', { fetch: recorded.fetch })).resolves.toEqual({
      sub: 'member-123',
      name: 'Example Member',
    });
  });

  it('rejects missing or invalid subject claims as sanitized provider failures', async () => {
    for (const payload of [{ name: 'No Subject' }, { sub: '' }, { sub: 123 }]) {
      const recorded = recorder(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await expect(fetchLinkedInIdentity('access-token-secret', { fetch: recorded.fetch })).rejects.toMatchObject({
        kind: 'provider_failure',
        retryable: false,
      });
    }
  });

  it.each([
    [401, 'permission_required', false],
    [429, 'rate_limited', true],
    [500, 'provider_failure', true],
  ] as const)('classifies HTTP %i without echoing provider or token secrets', async (status, kind, retryable) => {
    const recorded = recorder(
      new Response(
        JSON.stringify({
          error: 'provider_error',
          message: 'echo access-token-secret provider-private-detail',
        }),
        { status, headers: { 'content-type': 'application/json' } },
      ),
    );

    let error: unknown;
    try {
      await fetchLinkedInIdentity('access-token-secret', { fetch: recorded.fetch });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(LinkedInIdentityError);
    expect(error).toMatchObject({ kind, retryable });
    expect((error as Error).message).not.toContain('access-token-secret');
    expect((error as Error).message).not.toContain('provider-private-detail');
  });
});

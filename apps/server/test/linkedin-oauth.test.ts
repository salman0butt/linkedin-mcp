import { describe, expect, it } from 'vitest';

import type { LinkedInAuthConfig } from '../src/config.js';
import type { AuthorizationSession, ConsumedAuthorizationCode } from '../src/auth/oauth-session.js';
import { LinkedInOAuthError, createLinkedInOAuthAdapter } from '../src/auth/linkedin-oauth.js';

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function config(mode: 'confidential' | 'native_pkce'): LinkedInAuthConfig {
  return {
    mode,
    clientId: 'client-id',
    ...(mode === 'confidential' ? { clientSecret: 'client-secret' } : {}),
    redirectUri: 'http://127.0.0.1:17890/oauth/callback',
    scopes: ['openid', 'profile', 'email'],
    credentialStorePath: '/tmp/linkedin-mcp-credentials.json',
    tokenEncryptionKey: Buffer.alloc(32, 7).toString('base64'),
  };
}

function session(mode: 'confidential' | 'native_pkce'): AuthorizationSession {
  return {
    id: 'session-id',
    state: 'csrf-state',
    scopes: ['openid', 'profile', 'email'],
    createdAt: '2026-10-07T08:00:00.000Z',
    expiresAt: '2026-10-07T08:05:00.000Z',
    redirectUri: 'http://127.0.0.1:17890/oauth/callback',
    mode,
    ...(mode === 'native_pkce'
      ? {
          codeVerifier: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~',
          codeChallenge: 'pkce-challenge',
        }
      : {}),
  };
}

function consumed(mode: 'confidential' | 'native_pkce'): ConsumedAuthorizationCode {
  return {
    code: 'authorization-code-secret',
    redirectUri: 'http://127.0.0.1:17890/oauth/callback',
    scopes: ['openid', 'profile', 'email'],
    mode,
    ...(mode === 'native_pkce'
      ? { codeVerifier: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~' }
      : {}),
  };
}

function createFetchRecorder(response: () => Response): {
  calls: FetchCall[];
  fetch: typeof globalThis.fetch;
} {
  const calls: FetchCall[] = [];
  const fetchImpl: typeof globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return Promise.resolve(response());
  };
  return { calls, fetch: fetchImpl };
}

function successfulTokenResponse(): Response {
  return new Response(
    JSON.stringify({
      access_token: 'access-token-secret',
      expires_in: 3600,
      refresh_token: 'refresh-token-secret',
      refresh_token_expires_in: 86400,
      scope: 'openid profile',
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function formBody(call: FetchCall): URLSearchParams {
  expect(call.init?.body).toBeInstanceOf(URLSearchParams);
  return call.init?.body as URLSearchParams;
}

describe('official LinkedIn OAuth adapter', () => {
  it('preserves an omitted token response scope for the authorized-scope fallback', async () => {
    const recorder = createFetchRecorder(() =>
      Response.json({ access_token: 'access-token-secret', expires_in: 3600 }),
    );
    const adapter = createLinkedInOAuthAdapter(config('confidential'), { fetch: recorder.fetch });

    await expect(adapter.exchangeAuthorizationCode(consumed('confidential'))).resolves.toMatchObject({
      scopes: [],
    });
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '   \t'],
    ['non-string', 12],
  ])('rejects an explicitly present %s scope as a sanitized provider failure', async (_name, scope) => {
    const recorder = createFetchRecorder(() =>
      Response.json({ access_token: 'access-token-secret', expires_in: 3600, scope }),
    );
    const adapter = createLinkedInOAuthAdapter(config('confidential'), { fetch: recorder.fetch });

    await expect(adapter.exchangeAuthorizationCode(consumed('confidential'))).rejects.toMatchObject({
      kind: 'provider_failure',
      retryable: false,
    });
  });

  it('builds the confidential authorization URL without PKCE or client secret material', () => {
    const adapter = createLinkedInOAuthAdapter(config('confidential'));

    const authorizationUrl = new URL(adapter.buildAuthorizationUrl(session('confidential')));

    expect(`${authorizationUrl.origin}${authorizationUrl.pathname}`).toBe(
      'https://www.linkedin.com/oauth/v2/authorization',
    );
    expect(Object.fromEntries(authorizationUrl.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'client-id',
      redirect_uri: 'http://127.0.0.1:17890/oauth/callback',
      state: 'csrf-state',
      scope: 'openid profile email',
    });
    expect(authorizationUrl.toString()).not.toContain('client-secret');
    expect(authorizationUrl.searchParams.has('code_challenge')).toBe(false);
    expect(authorizationUrl.searchParams.has('code_challenge_method')).toBe(false);
  });

  it('builds the native PKCE authorization URL with S256 challenge but never the verifier', () => {
    const adapter = createLinkedInOAuthAdapter(config('native_pkce'));
    const nativeSession = session('native_pkce');

    const authorizationUrl = new URL(adapter.buildAuthorizationUrl(nativeSession));

    expect(`${authorizationUrl.origin}${authorizationUrl.pathname}`).toBe(
      'https://www.linkedin.com/oauth/native-pkce/authorization',
    );
    expect(Object.fromEntries(authorizationUrl.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'client-id',
      redirect_uri: 'http://127.0.0.1:17890/oauth/callback',
      state: 'csrf-state',
      scope: 'openid profile email',
      code_challenge: 'pkce-challenge',
      code_challenge_method: 'S256',
    });
    expect(authorizationUrl.toString()).not.toContain(nativeSession.codeVerifier ?? '');
  });

  it('exchanges a confidential authorization code with exactly the documented secret-bearing fields', async () => {
    const recorder = createFetchRecorder(successfulTokenResponse);
    const adapter = createLinkedInOAuthAdapter(config('confidential'), { fetch: recorder.fetch });

    await expect(adapter.exchangeAuthorizationCode(consumed('confidential'))).resolves.toEqual({
      accessToken: 'access-token-secret',
      expiresInSeconds: 3600,
      refreshToken: 'refresh-token-secret',
      refreshTokenExpiresInSeconds: 86400,
      scopes: ['openid', 'profile'],
    });

    expect(recorder.calls).toHaveLength(1);
    const [call] = recorder.calls;
    expect(call?.url).toBe('https://www.linkedin.com/oauth/v2/accessToken');
    expect(call?.init?.method).toBe('POST');
    expect(call?.init?.headers).toEqual({
      'content-type': 'application/x-www-form-urlencoded',
    });
    expect(Object.fromEntries(formBody(call as FetchCall))).toEqual({
      grant_type: 'authorization_code',
      code: 'authorization-code-secret',
      client_id: 'client-id',
      client_secret: 'client-secret',
      redirect_uri: 'http://127.0.0.1:17890/oauth/callback',
    });
  });

  it('exchanges a native authorization code with the verifier and no client secret', async () => {
    const recorder = createFetchRecorder(successfulTokenResponse);
    const adapter = createLinkedInOAuthAdapter(config('native_pkce'), { fetch: recorder.fetch });

    await adapter.exchangeAuthorizationCode(consumed('native_pkce'));

    expect(recorder.calls).toHaveLength(1);
    const body = formBody(recorder.calls[0] as FetchCall);
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'authorization_code',
      code: 'authorization-code-secret',
      redirect_uri: 'http://127.0.0.1:17890/oauth/callback',
      client_id: 'client-id',
      code_verifier: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~',
    });
    expect(body.has('client_secret')).toBe(false);
  });

  it('skips programmatic refresh when no refresh token exists or native PKCE is configured', async () => {
    const confidentialRecorder = createFetchRecorder(successfulTokenResponse);
    const confidential = createLinkedInOAuthAdapter(config('confidential'), {
      fetch: confidentialRecorder.fetch,
    });
    const nativeRecorder = createFetchRecorder(successfulTokenResponse);
    const native = createLinkedInOAuthAdapter(config('native_pkce'), { fetch: nativeRecorder.fetch });

    await expect(confidential.refreshAccessToken(undefined)).resolves.toBeNull();
    await expect(native.refreshAccessToken('refresh-token-secret')).resolves.toBeNull();
    expect(confidentialRecorder.calls).toHaveLength(0);
    expect(nativeRecorder.calls).toHaveLength(0);
  });

  it('uses the partner-gated confidential refresh-token request only when a real token exists', async () => {
    const recorder = createFetchRecorder(successfulTokenResponse);
    const adapter = createLinkedInOAuthAdapter(config('confidential'), { fetch: recorder.fetch });

    await expect(adapter.refreshAccessToken('refresh-token-secret')).resolves.toMatchObject({
      accessToken: 'access-token-secret',
      refreshToken: 'refresh-token-secret',
    });

    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]?.url).toBe('https://www.linkedin.com/oauth/v2/accessToken');
    expect(Object.fromEntries(formBody(recorder.calls[0] as FetchCall))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-token-secret',
      client_id: 'client-id',
      client_secret: 'client-secret',
    });
  });

  it.each([
    [400, 'permission_required', false],
    [401, 'permission_required', false],
    [429, 'rate_limited', true],
    [500, 'provider_failure', true],
  ] as const)(
    'classifies HTTP %i without echoing provider or request secrets',
    async (status, kind, retryable) => {
      const recorder = createFetchRecorder(
        () =>
          new Response(
            JSON.stringify({
              error: 'provider_error',
              error_description:
                'echo authorization-code-secret client-secret refresh-token-secret provider-private-detail',
            }),
            { status, headers: { 'content-type': 'application/json' } },
          ),
      );
      const adapter = createLinkedInOAuthAdapter(config('confidential'), { fetch: recorder.fetch });

      let error: unknown;
      try {
        await adapter.exchangeAuthorizationCode(consumed('confidential'));
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(LinkedInOAuthError);
      expect((error as LinkedInOAuthError).kind).toBe(kind);
      expect((error as LinkedInOAuthError).retryable).toBe(retryable);
      expect((error as Error).message).not.toContain('authorization-code-secret');
      expect((error as Error).message).not.toContain('client-secret');
      expect((error as Error).message).not.toContain('refresh-token-secret');
      expect((error as Error).message).not.toContain('provider-private-detail');
    },
  );
});

import type { LinkedInAuthConfig } from '../config.js';
import type { AuthorizationSession, ConsumedAuthorizationCode } from './oauth-session.js';

const CONFIDENTIAL_AUTHORIZATION_ENDPOINT = 'https://www.linkedin.com/oauth/v2/authorization';
const CONFIDENTIAL_TOKEN_ENDPOINT = 'https://www.linkedin.com/oauth/v2/accessToken';
const NATIVE_AUTHORIZATION_ENDPOINT = 'https://www.linkedin.com/oauth/native-pkce/authorization';
const NATIVE_TOKEN_ENDPOINT = 'https://www.linkedin.com/oauth/native-pkce/accessToken';

export type LinkedInOAuthErrorKind = 'permission_required' | 'rate_limited' | 'provider_failure';

export class LinkedInOAuthError extends Error {
  readonly kind: LinkedInOAuthErrorKind;
  readonly retryable: boolean;

  constructor(kind: LinkedInOAuthErrorKind, retryable: boolean) {
    super(`LinkedIn OAuth request failed: ${kind}`);
    this.name = 'LinkedInOAuthError';
    this.kind = kind;
    this.retryable = retryable;
  }
}

export interface LinkedInTokenResult {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken?: string;
  refreshTokenExpiresInSeconds?: number;
  scopes: string[];
}

export interface LinkedInOAuthAdapter {
  buildAuthorizationUrl(session: AuthorizationSession): string;
  exchangeAuthorizationCode(code: ConsumedAuthorizationCode): Promise<LinkedInTokenResult>;
  refreshAccessToken(refreshToken: string | undefined): Promise<LinkedInTokenResult | null>;
}

interface LinkedInOAuthAdapterDeps {
  fetch?: typeof globalThis.fetch;
}

function authorizationEndpoint(mode: LinkedInAuthConfig['mode']): string {
  return mode === 'native_pkce' ? NATIVE_AUTHORIZATION_ENDPOINT : CONFIDENTIAL_AUTHORIZATION_ENDPOINT;
}

function tokenEndpoint(mode: LinkedInAuthConfig['mode']): string {
  return mode === 'native_pkce' ? NATIVE_TOKEN_ENDPOINT : CONFIDENTIAL_TOKEN_ENDPOINT;
}

function classifyProviderError(status: number): LinkedInOAuthError {
  if (status === 400 || status === 401 || status === 403) {
    return new LinkedInOAuthError('permission_required', false);
  }
  if (status === 429) return new LinkedInOAuthError('rate_limited', true);
  return new LinkedInOAuthError('provider_failure', status >= 500);
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeTokenResponse(value: unknown): LinkedInTokenResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LinkedInOAuthError('provider_failure', false);
  }

  const token = value as Record<string, unknown>;
  const accessToken = typeof token.access_token === 'string' ? token.access_token : '';
  const expiresInSeconds = positiveNumber(token.expires_in);
  if (accessToken === '' || expiresInSeconds === undefined) {
    throw new LinkedInOAuthError('provider_failure', false);
  }

  const refreshToken =
    typeof token.refresh_token === 'string' && token.refresh_token !== '' ? token.refresh_token : undefined;
  const refreshTokenExpiresInSeconds = positiveNumber(token.refresh_token_expires_in);
  const scopes =
    typeof token.scope === 'string'
      ? token.scope
          .trim()
          .split(/\s+/)
          .filter(Boolean)
      : [];

  return {
    accessToken,
    expiresInSeconds,
    ...(refreshToken === undefined ? {} : { refreshToken }),
    ...(refreshTokenExpiresInSeconds === undefined ? {} : { refreshTokenExpiresInSeconds }),
    scopes,
  };
}

async function requestToken(
  fetchImpl: typeof globalThis.fetch,
  endpoint: string,
  body: URLSearchParams,
): Promise<LinkedInTokenResult> {
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    throw new LinkedInOAuthError('provider_failure', true);
  }

  if (!response.ok) throw classifyProviderError(response.status);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LinkedInOAuthError('provider_failure', false);
  }
  return normalizeTokenResponse(payload);
}

export function createLinkedInOAuthAdapter(
  config: LinkedInAuthConfig,
  deps: LinkedInOAuthAdapterDeps = {},
): LinkedInOAuthAdapter {
  const fetchImpl = deps.fetch ?? globalThis.fetch;

  return {
    buildAuthorizationUrl(session) {
      if (session.mode !== config.mode) {
        throw new Error('OAuth session mode does not match configured LinkedIn OAuth mode');
      }

      const url = new URL(authorizationEndpoint(config.mode));
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', session.redirectUri);
      url.searchParams.set('state', session.state);
      url.searchParams.set('scope', session.scopes.join(' '));

      if (config.mode === 'native_pkce') {
        if (session.codeChallenge === undefined || session.codeChallenge === '') {
          throw new Error('Native PKCE authorization requires a code challenge');
        }
        url.searchParams.set('code_challenge', session.codeChallenge);
        url.searchParams.set('code_challenge_method', 'S256');
      }

      return url.toString();
    },

    exchangeAuthorizationCode(code) {
      if (code.mode !== config.mode) {
        return Promise.reject(
          new Error('Authorization code mode does not match configured LinkedIn OAuth mode'),
        );
      }

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code.code,
        client_id: config.clientId,
        redirect_uri: code.redirectUri,
      });

      if (config.mode === 'confidential') {
        if (config.clientSecret === undefined) {
          return Promise.reject(new Error('Confidential OAuth requires a client secret'));
        }
        body.set('client_secret', config.clientSecret);
      } else {
        if (code.codeVerifier === undefined || code.codeVerifier === '') {
          return Promise.reject(new Error('Native PKCE token exchange requires a code verifier'));
        }
        body.set('code_verifier', code.codeVerifier);
      }

      return requestToken(fetchImpl, tokenEndpoint(config.mode), body);
    },

    refreshAccessToken(refreshToken) {
      if (config.mode !== 'confidential' || refreshToken === undefined || refreshToken === '') {
        return Promise.resolve(null);
      }
      if (config.clientSecret === undefined) {
        return Promise.reject(new Error('Confidential OAuth requires a client secret'));
      }

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });
      return requestToken(fetchImpl, CONFIDENTIAL_TOKEN_ENDPOINT, body);
    },
  };
}

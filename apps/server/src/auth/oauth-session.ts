import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from 'node:crypto';

import type { LinkedInAuthConfig } from '../config.js';

const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1_000;

export interface AuthorizationSession {
  id: string;
  state: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  redirectUri: string;
  mode: LinkedInAuthConfig['mode'];
  codeVerifier?: string;
  codeChallenge?: string;
}

export interface ConsumedAuthorizationCode {
  code: string;
  codeVerifier?: string;
  redirectUri: string;
  scopes: string[];
  mode: LinkedInAuthConfig['mode'];
}

export interface AuthorizationCallbackInput {
  sessionId: string;
  state?: string;
  code: string;
}

export interface ProviderErrorCallbackInput {
  sessionId: string;
  state?: string;
}

export interface OAuthSessionCoordinator {
  start(): AuthorizationSession;
  peek(): AuthorizationSession | null;
  consumeCallback(input: AuthorizationCallbackInput): ConsumedAuthorizationCode;
  consumeProviderError(input: ProviderErrorCallbackInput): void;
  cancel(sessionId?: string): void;
}

interface OAuthSessionCoordinatorDeps {
  now?: () => Date;
  randomBytes?: (size: number) => Buffer;
  ttlMs?: number;
}

function opaqueValue(randomBytes: (size: number) => Buffer, size: number): string {
  return randomBytes(size).toString('base64url');
}

function copySession(session: AuthorizationSession): AuthorizationSession {
  return {
    id: session.id,
    state: session.state,
    scopes: [...session.scopes],
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    redirectUri: session.redirectUri,
    mode: session.mode,
    ...(session.codeVerifier === undefined ? {} : { codeVerifier: session.codeVerifier }),
    ...(session.codeChallenge === undefined ? {} : { codeChallenge: session.codeChallenge }),
  };
}

function stateMatches(expected: string, actual: string | undefined): boolean {
  if (actual === undefined) return false;

  const expectedBytes = Buffer.from(expected, 'utf8');
  const actualBytes = Buffer.from(actual, 'utf8');
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export function buildPkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function createOAuthSessionCoordinator(
  config: LinkedInAuthConfig,
  deps: OAuthSessionCoordinatorDeps = {},
): OAuthSessionCoordinator {
  const now = deps.now ?? (() => new Date());
  const randomBytes = deps.randomBytes ?? nodeRandomBytes;
  const ttlMs = deps.ttlMs ?? DEFAULT_SESSION_TTL_MS;

  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error('OAuth session TTL must be a positive number');
  }

  let pending: AuthorizationSession | null = null;

  function isExpired(session: AuthorizationSession): boolean {
    return now().getTime() >= new Date(session.expiresAt).getTime();
  }

  function consumeSession(sessionId: string, state: string | undefined): AuthorizationSession {
    const current = pending;
    if (current === null || current.id !== sessionId) {
      throw new Error('No matching pending OAuth authorization session');
    }

    if (isExpired(current)) {
      pending = null;
      throw new Error('OAuth authorization session expired');
    }

    pending = null;
    if (!stateMatches(current.state, state)) {
      throw new Error('OAuth callback state did not match pending session');
    }

    return current;
  }

  return {
    start() {
      const createdAt = now();
      const codeVerifier = config.mode === 'native_pkce' ? opaqueValue(randomBytes, 32) : undefined;
      const session: AuthorizationSession = {
        id: opaqueValue(randomBytes, 24),
        state: opaqueValue(randomBytes, 32),
        scopes: [...config.scopes],
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + ttlMs).toISOString(),
        redirectUri: config.redirectUri,
        mode: config.mode,
        ...(codeVerifier === undefined
          ? {}
          : { codeVerifier, codeChallenge: buildPkceChallenge(codeVerifier) }),
      };

      pending = session;
      return copySession(session);
    },

    peek() {
      if (pending !== null && isExpired(pending)) pending = null;
      return pending === null ? null : copySession(pending);
    },

    consumeCallback(input) {
      const session = consumeSession(input.sessionId, input.state);
      if (input.code.trim() === '') {
        throw new Error('OAuth callback did not include an authorization code');
      }

      return {
        code: input.code,
        redirectUri: session.redirectUri,
        scopes: [...session.scopes],
        mode: session.mode,
        ...(session.codeVerifier === undefined ? {} : { codeVerifier: session.codeVerifier }),
      };
    },

    consumeProviderError(input) {
      consumeSession(input.sessionId, input.state);
    },

    cancel(sessionId) {
      if (pending !== null && (sessionId === undefined || pending.id === sessionId)) {
        pending = null;
      }
    },
  };
}

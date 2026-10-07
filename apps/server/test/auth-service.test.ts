import { describe, expect, it } from 'vitest';

import type { AuthenticatedIdentity, StoredCredential } from '../../../../packages/core/src/auth.js';
import type { CredentialStore } from '../src/auth/credential-store.js';
import { LinkedInIdentityError } from '../src/auth/linkedin-identity.js';
import type { LinkedInOAuthAdapter, LinkedInTokenResult } from '../src/auth/linkedin-oauth.js';
import type {
  AuthorizationSession,
  ConsumedAuthorizationCode,
  OAuthSessionCoordinator,
} from '../src/auth/oauth-session.js';
import { AuthServiceError, createAuthService } from '../src/auth/auth-service.js';
import type { LinkedInAuthConfig } from '../src/config.js';

const NOW = new Date('2026-10-07T12:00:00.000Z');

function config(): LinkedInAuthConfig {
  return {
    mode: 'confidential',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'http://127.0.0.1:17890/oauth/callback',
    scopes: ['openid', 'profile', 'email'],
    credentialStorePath: '/tmp/linkedin-mcp-credentials.json',
    tokenEncryptionKey: Buffer.alloc(32, 7).toString('base64'),
  };
}

function authorizationSession(): AuthorizationSession {
  return {
    id: 'session-id',
    state: 'csrf-state-secret',
    scopes: ['openid', 'profile', 'email'],
    createdAt: '2026-10-07T12:00:00.000Z',
    expiresAt: '2026-10-07T12:05:00.000Z',
    redirectUri: 'http://127.0.0.1:17890/oauth/callback',
    mode: 'confidential',
  };
}

function consumedCode(): ConsumedAuthorizationCode {
  return {
    code: 'authorization-code-secret',
    redirectUri: 'http://127.0.0.1:17890/oauth/callback',
    scopes: ['openid', 'profile', 'email'],
    mode: 'confidential',
  };
}

function createCoordinator(): {
  coordinator: OAuthSessionCoordinator;
  getCancelCount(): number;
} {
  let pending: AuthorizationSession | null = null;
  let cancelCount = 0;

  return {
    coordinator: {
      start() {
        pending = authorizationSession();
        return { ...pending, scopes: [...pending.scopes] };
      },
      peek() {
        return pending === null ? null : { ...pending, scopes: [...pending.scopes] };
      },
      consumeCallback() {
        throw new Error('not used by auth-service tests');
      },
      consumeProviderError() {
        throw new Error('not used by auth-service tests');
      },
      cancel() {
        cancelCount += 1;
        pending = null;
      },
    },
    getCancelCount: () => cancelCount,
  };
}

function copyCredential(value: StoredCredential): StoredCredential {
  return { ...value, scopes: [...value.scopes] };
}

function createStore(initial: StoredCredential | null): {
  store: CredentialStore;
  getValue(): StoredCredential | null;
  getClearCount(): number;
} {
  let value = initial;
  let clearCount = 0;

  return {
    store: {
      load() {
        return Promise.resolve(value === null ? null : copyCredential(value));
      },
      save(next) {
        value = copyCredential(next);
        return Promise.resolve();
      },
      clear() {
        clearCount += 1;
        value = null;
        return Promise.resolve();
      },
    },
    getValue: () => (value === null ? null : copyCredential(value)),
    getClearCount: () => clearCount,
  };
}

function createOAuthAdapter(overrides: Partial<LinkedInOAuthAdapter> = {}): LinkedInOAuthAdapter {
  return {
    buildAuthorizationUrl: () => 'https://www.linkedin.com/oauth/v2/authorization?safe=1',
    exchangeAuthorizationCode: (): Promise<LinkedInTokenResult> =>
      Promise.resolve({
        accessToken: 'access-token-secret',
        expiresInSeconds: 3600,
        refreshToken: 'refresh-token-secret',
        refreshTokenExpiresInSeconds: 86_400,
        scopes: ['openid', 'profile'],
      }),
    refreshAccessToken: () => Promise.resolve(null),
    ...overrides,
  };
}

function identity(sub = 'member-123'): AuthenticatedIdentity {
  return { sub, name: 'Example Member' };
}

describe('M01 auth lifecycle service', () => {
  it('reports not_configured without constructing fake LinkedIn availability', async () => {
    const service = createAuthService({ now: () => NOW });

    await expect(service.getStatus()).resolves.toEqual({
      state: 'not_configured',
      provider: 'OFFICIAL_API',
      scopes: [],
      refreshAvailable: false,
    });
  });

  it('moves from disconnected to authorization_pending without exposing state or verifier secrets', async () => {
    const { coordinator } = createCoordinator();
    const { store } = createStore(null);
    const service = createAuthService({
      config: config(),
      coordinator,
      oauth: createOAuthAdapter(),
      store,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    await expect(service.getStatus()).resolves.toMatchObject({
      state: 'disconnected',
      provider: 'OFFICIAL_API',
      mode: 'confidential',
      scopes: [],
      refreshAvailable: false,
    });

    const started = service.startAuthorization();
    expect(started).toEqual({
      authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization?safe=1',
      sessionId: 'session-id',
      scopes: ['openid', 'profile', 'email'],
      mode: 'confidential',
      expiresAt: '2026-10-07T12:05:00.000Z',
      provider: 'OFFICIAL_API',
    });
    expect(JSON.stringify(started)).not.toContain('csrf-state-secret');
    expect(JSON.stringify(started)).not.toContain('codeVerifier');

    await expect(service.getStatus()).resolves.toMatchObject({
      state: 'authorization_pending',
      mode: 'confidential',
      scopes: ['openid', 'profile', 'email'],
      expiresAt: '2026-10-07T12:05:00.000Z',
    });
  });

  it('exchanges a consumed code, resolves official identity, and persists a connected credential', async () => {
    const { coordinator } = createCoordinator();
    const stored = createStore(null);
    const service = createAuthService({
      config: config(),
      coordinator,
      oauth: createOAuthAdapter(),
      store: stored.store,
      fetchIdentity: (accessToken) => {
        expect(accessToken).toBe('access-token-secret');
        return Promise.resolve(identity());
      },
      now: () => NOW,
    });

    await expect(service.completeAuthorization(consumedCode())).resolves.toMatchObject({
      state: 'connected',
      subject: 'member-123',
      scopes: ['openid', 'profile'],
      expiresAt: '2026-10-07T13:00:00.000Z',
      refreshAvailable: true,
    });
    expect(stored.getValue()).toEqual({
      accessToken: 'access-token-secret',
      refreshToken: 'refresh-token-secret',
      expiresAt: '2026-10-07T13:00:00.000Z',
      refreshExpiresAt: '2026-10-08T12:00:00.000Z',
      scopes: ['openid', 'profile'],
      subject: 'member-123',
      mode: 'confidential',
    });
  });

  it('reports connected and expired states from persisted credential truth', async () => {
    const connected = createStore({
      accessToken: 'access-token-secret',
      refreshToken: 'refresh-token-secret',
      expiresAt: '2026-10-07T13:00:00.000Z',
      refreshExpiresAt: '2026-10-08T12:00:00.000Z',
      scopes: ['openid', 'profile'],
      subject: 'member-123',
      mode: 'confidential',
    });
    const { coordinator } = createCoordinator();
    const service = createAuthService({
      config: config(),
      coordinator,
      oauth: createOAuthAdapter(),
      store: connected.store,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    await expect(service.getStatus()).resolves.toEqual({
      state: 'connected',
      provider: 'OFFICIAL_API',
      mode: 'confidential',
      subject: 'member-123',
      scopes: ['openid', 'profile'],
      expiresAt: '2026-10-07T13:00:00.000Z',
      refreshAvailable: true,
    });

    const expired = createStore({
      accessToken: 'expired-token-secret',
      expiresAt: '2026-10-07T11:59:59.000Z',
      scopes: ['openid', 'profile'],
      subject: 'member-123',
      mode: 'confidential',
    });
    const expiredService = createAuthService({
      config: config(),
      coordinator: createCoordinator().coordinator,
      oauth: createOAuthAdapter(),
      store: expired.store,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    await expect(expiredService.getStatus()).resolves.toMatchObject({
      state: 'expired',
      subject: 'member-123',
      refreshAvailable: false,
    });
  });

  it('refreshes only when an actual eligible refresh token exists before fetching profile', async () => {
    const stored = createStore({
      accessToken: 'expired-token-secret',
      refreshToken: 'refresh-token-secret',
      expiresAt: '2026-10-07T11:59:59.000Z',
      refreshExpiresAt: '2026-10-08T12:00:00.000Z',
      scopes: ['openid', 'profile'],
      subject: 'member-123',
      mode: 'confidential',
    });
    let refreshCalls = 0;
    const oauth = createOAuthAdapter({
      refreshAccessToken(refreshToken) {
        refreshCalls += 1;
        expect(refreshToken).toBe('refresh-token-secret');
        return Promise.resolve({
          accessToken: 'refreshed-access-token-secret',
          expiresInSeconds: 3600,
          refreshToken: 'rotated-refresh-token-secret',
          refreshTokenExpiresInSeconds: 86_400,
          scopes: ['openid', 'profile'],
        });
      },
    });
    const service = createAuthService({
      config: config(),
      coordinator: createCoordinator().coordinator,
      oauth,
      store: stored.store,
      fetchIdentity: (accessToken) => {
        expect(accessToken).toBe('refreshed-access-token-secret');
        return Promise.resolve(identity());
      },
      now: () => NOW,
    });

    await expect(service.getProfile()).resolves.toEqual(identity());
    expect(refreshCalls).toBe(1);
    expect(stored.getValue()).toMatchObject({
      accessToken: 'refreshed-access-token-secret',
      refreshToken: 'rotated-refresh-token-secret',
      expiresAt: '2026-10-07T13:00:00.000Z',
      refreshExpiresAt: '2026-10-08T12:00:00.000Z',
    });

    const withoutRefresh = createStore({
      accessToken: 'expired-token-secret',
      expiresAt: '2026-10-07T11:59:59.000Z',
      scopes: ['openid', 'profile'],
      subject: 'member-123',
      mode: 'confidential',
    });
    let forbiddenRefreshCalls = 0;
    const withoutRefreshService = createAuthService({
      config: config(),
      coordinator: createCoordinator().coordinator,
      oauth: createOAuthAdapter({
        refreshAccessToken() {
          forbiddenRefreshCalls += 1;
          return Promise.resolve(null);
        },
      }),
      store: withoutRefresh.store,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    await expect(withoutRefreshService.getProfile()).rejects.toMatchObject({
      kind: 'reauth_required',
      retryable: false,
    });
    expect(forbiddenRefreshCalls).toBe(0);
  });

  it('turns a provider 401 into reauth_required, clears the credential, and never retries identity', async () => {
    const stored = createStore({
      accessToken: 'access-token-secret',
      expiresAt: '2026-10-07T13:00:00.000Z',
      scopes: ['openid', 'profile'],
      subject: 'member-123',
      mode: 'confidential',
    });
    let identityCalls = 0;
    const service = createAuthService({
      config: config(),
      coordinator: createCoordinator().coordinator,
      oauth: createOAuthAdapter(),
      store: stored.store,
      fetchIdentity: () => {
        identityCalls += 1;
        return Promise.reject(new LinkedInIdentityError('permission_required', false));
      },
      now: () => NOW,
    });

    await expect(service.getProfile()).rejects.toBeInstanceOf(AuthServiceError);
    await expect(service.getProfile()).rejects.toMatchObject({
      kind: 'reauth_required',
      retryable: false,
    });
    expect(identityCalls).toBe(1);
    expect(stored.getClearCount()).toBe(1);
    await expect(service.getStatus()).resolves.toMatchObject({ state: 'reauth_required' });
  });

  it('reports store failures as error and logout clears only local auth state without claiming remote revocation', async () => {
    const coordinatorState = createCoordinator();
    coordinatorState.coordinator.start();
    let clearCount = 0;
    const failingStore: CredentialStore = {
      load() {
        return Promise.reject(new Error('private filesystem detail'));
      },
      save() {
        return Promise.reject(new Error('not used'));
      },
      clear() {
        clearCount += 1;
        return Promise.resolve();
      },
    };
    const service = createAuthService({
      config: config(),
      coordinator: coordinatorState.coordinator,
      oauth: createOAuthAdapter(),
      store: failingStore,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    await expect(service.getStatus()).resolves.toMatchObject({
      state: 'authorization_pending',
    });
    coordinatorState.coordinator.cancel();
    await expect(service.getStatus()).resolves.toEqual({
      state: 'error',
      provider: 'OFFICIAL_API',
      mode: 'confidential',
      scopes: [],
      refreshAvailable: false,
    });

    await expect(service.logout()).resolves.toEqual({
      localCredentialsCleared: true,
      remoteRevocation: 'not_claimed',
      provider: 'OFFICIAL_API',
    });
    expect(clearCount).toBe(1);
    expect(coordinatorState.getCancelCount()).toBe(2);
  });
});

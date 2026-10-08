import { describe, expect, it } from 'vitest';

import type { AuthenticatedIdentity, StoredCredential } from '../../../packages/core/src/auth.js';
import { AuthServiceError, createAuthService } from '../src/auth/auth-service.js';
import type { CredentialStore } from '../src/auth/credential-store.js';
import type { LinkedInOAuthAdapter, LinkedInTokenResult } from '../src/auth/linkedin-oauth.js';
import type { ConsumedAuthorizationCode, OAuthSessionCoordinator } from '../src/auth/oauth-session.js';
import type { LinkedInAuthConfig } from '../src/config.js';

const NOW = new Date('2026-10-08T10:30:00.000Z');

function config(): LinkedInAuthConfig {
  return {
    mode: 'confidential',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'http://127.0.0.1:17890/oauth/callback',
    scopes: ['openid', 'profile', 'email', 'w_member_social'],
    credentialStorePath: '/tmp/linkedin-mcp-provider-context.json',
    tokenEncryptionKey: Buffer.alloc(32, 9).toString('base64'),
  };
}

function coordinator(): OAuthSessionCoordinator {
  return {
    start() {
      throw new Error('not used');
    },
    peek() {
      return null;
    },
    consumeCallback() {
      throw new Error('not used');
    },
    consumeProviderError() {
      throw new Error('not used');
    },
    cancel() {},
  };
}

function oauth(): LinkedInOAuthAdapter {
  return {
    buildAuthorizationUrl() {
      throw new Error('not used');
    },
    exchangeAuthorizationCode(): Promise<LinkedInTokenResult> {
      throw new Error('not used');
    },
    refreshAccessToken() {
      return Promise.resolve(null);
    },
  };
}

function store(initial: StoredCredential | null): {
  value(): StoredCredential | null;
  clearCount(): number;
  store: CredentialStore;
} {
  let current = initial === null ? null : { ...initial, scopes: [...initial.scopes] };
  let clears = 0;

  return {
    value: () => (current === null ? null : { ...current, scopes: [...current.scopes] }),
    clearCount: () => clears,
    store: {
      load() {
        return Promise.resolve(current === null ? null : { ...current, scopes: [...current.scopes] });
      },
      save(next) {
        current = { ...next, scopes: [...next.scopes] };
        return Promise.resolve();
      },
      clear() {
        clears += 1;
        current = null;
        return Promise.resolve();
      },
    },
  };
}

function credential(overrides: Partial<StoredCredential> = {}): StoredCredential {
  return {
    accessToken: 'access-token-secret',
    expiresAt: '2026-10-08T11:30:00.000Z',
    scopes: ['openid', 'profile', 'w_member_social'],
    subject: 'member-123',
    mode: 'confidential',
    ...overrides,
  };
}

function credentialWithoutSubject(): StoredCredential {
  const value = credential();
  delete value.subject;
  return value;
}

function identity(): AuthenticatedIdentity {
  return { sub: 'member-123', name: 'Example Member' };
}

describe('AuthService internal provider context', () => {
  it('returns the connected provider credential context without exposing it through status', async () => {
    const stored = store(credential());
    const service = createAuthService({
      config: config(),
      coordinator: coordinator(),
      oauth: oauth(),
      store: stored.store,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    await expect(service.getProviderContext()).resolves.toEqual({
      accessToken: 'access-token-secret',
      subject: 'member-123',
      scopes: ['openid', 'profile', 'w_member_social'],
    });
    await expect(service.getStatus()).resolves.not.toHaveProperty('accessToken');
  });

  it('resolves and persists a missing subject before returning provider context', async () => {
    const stored = store(credentialWithoutSubject());
    let identityCalls = 0;
    const service = createAuthService({
      config: config(),
      coordinator: coordinator(),
      oauth: oauth(),
      store: stored.store,
      fetchIdentity: (accessToken) => {
        identityCalls += 1;
        expect(accessToken).toBe('access-token-secret');
        return Promise.resolve(identity());
      },
      now: () => NOW,
    });

    await expect(service.getProviderContext()).resolves.toMatchObject({
      accessToken: 'access-token-secret',
      subject: 'member-123',
    });
    expect(identityCalls).toBe(1);
    expect(stored.value()?.subject).toBe('member-123');
  });

  it('marks provider credentials reauthorization-required and clears the stored token', async () => {
    const stored = store(credential());
    const service = createAuthService({
      config: config(),
      coordinator: coordinator(),
      oauth: oauth(),
      store: stored.store,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    await service.markReauthRequired();

    expect(stored.clearCount()).toBe(1);
    expect(stored.value()).toBeNull();
    await expect(service.getStatus()).resolves.toMatchObject({
      state: 'reauth_required',
      scopes: [],
    });
    await expect(service.getProviderContext()).rejects.toMatchObject({
      kind: 'reauth_required',
      retryable: false,
    });
  });

  it('refreshes an expired credential only when refresh credentials are eligible and returns granted scopes', async () => {
    const stored = store(
      credential({
        accessToken: 'expired-access-token',
        expiresAt: '2026-10-08T10:00:00.000Z',
        refreshToken: 'refresh-token-secret',
        refreshExpiresAt: '2026-10-08T12:00:00.000Z',
      }),
    );
    const service = createAuthService({
      config: config(),
      coordinator: coordinator(),
      oauth: {
        ...oauth(),
        refreshAccessToken: (refreshToken) => {
          expect(refreshToken).toBe('refresh-token-secret');
          return Promise.resolve({
            accessToken: 'new-access-token',
            expiresInSeconds: 3600,
            scopes: ['openid', 'w_member_social'],
          });
        },
      },
      store: stored.store,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    await expect(service.getProviderContext()).resolves.toEqual({
      accessToken: 'new-access-token',
      subject: 'member-123',
      scopes: ['openid', 'w_member_social'],
    });
    expect(stored.value()?.accessToken).toBe('new-access-token');
  });

  it('rejects provider context while authorization is pending', async () => {
    const stored = store(credential());
    const pendingCoordinator = {
      ...coordinator(),
      peek: () => ({ pending: true }),
    } as unknown as OAuthSessionCoordinator;
    const service = createAuthService({
      config: config(),
      coordinator: pendingCoordinator,
      oauth: oauth(),
      store: stored.store,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    await expect(service.getProviderContext()).rejects.toMatchObject({
      kind: 'authorization_pending',
      retryable: false,
    });
  });

  it('does not clear a replacement credential after a delayed rejection for an older token', async () => {
    const stored = store(credential({ accessToken: 'replacement-token', subject: 'member-123' }));
    const service = createAuthService({
      config: config(),
      coordinator: coordinator(),
      oauth: oauth(),
      store: stored.store,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    await service.markReauthRequired({ accessToken: 'old-token', subject: 'member-123' });

    expect(stored.clearCount()).toBe(0);
    expect(stored.value()?.accessToken).toBe('replacement-token');
  });

  it('sanitizes a failed subject persistence operation', async () => {
    const base = store(credentialWithoutSubject());
    const failingStore: CredentialStore = {
      ...base.store,
      save: () => Promise.reject(new Error('save leaked access-token-secret')),
    };
    const service = createAuthService({
      config: config(),
      coordinator: coordinator(),
      oauth: oauth(),
      store: failingStore,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    let caught: unknown;
    try {
      await service.getProviderContext();
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AuthServiceError);
    expect((caught as Error).message).not.toContain('access-token-secret');
    expect(caught).toMatchObject({ kind: 'provider_failure', retryable: false });
  });

  it('rejects provider context when AuthService is unconfigured', async () => {
    const service = createAuthService({ now: () => NOW });

    await expect(service.getProviderContext()).rejects.toMatchObject({
      kind: 'not_configured',
      retryable: false,
    });
  });

  it('rejects provider context when no credential is connected', async () => {
    const stored = store(null);
    const service = createAuthService({
      config: config(),
      coordinator: coordinator(),
      oauth: oauth(),
      store: stored.store,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    await expect(service.getProviderContext()).rejects.toMatchObject({
      kind: 'disconnected',
      retryable: false,
    });
  });

  it.each([
    ['without a refresh token', { expiresAt: '2026-10-08T10:00:00.000Z' }],
    [
      'with an expired refresh token',
      {
        expiresAt: '2026-10-08T10:00:00.000Z',
        refreshToken: 'refresh-token-secret',
        refreshExpiresAt: '2026-10-08T10:00:00.000Z',
      },
    ],
  ] as const)('does not refresh expired credentials %s', async (_label, overrides) => {
    const stored = store(credential(overrides));
    let refreshCalls = 0;
    const service = createAuthService({
      config: config(),
      coordinator: coordinator(),
      oauth: {
        ...oauth(),
        refreshAccessToken() {
          refreshCalls += 1;
          return Promise.resolve(null);
        },
      },
      store: stored.store,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    await expect(service.getProviderContext()).rejects.toMatchObject({
      kind: 'expired',
      retryable: false,
    });
    expect(refreshCalls).toBe(0);
  });

  it('sanitizes provider-context credential load errors', async () => {
    const base = store(credential());
    const failingStore: CredentialStore = {
      ...base.store,
      load: () => Promise.reject(new Error('load private token sentinel')),
    };
    const service = createAuthService({
      config: config(),
      coordinator: coordinator(),
      oauth: oauth(),
      store: failingStore,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    let caught: unknown;
    try {
      await service.getProviderContext();
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AuthServiceError);
    expect(caught).toMatchObject({ kind: 'provider_failure', retryable: false });
    expect((caught as Error).message).not.toContain('load private token sentinel');
  });

  it('sanitizes a credential save failure after an eligible refresh', async () => {
    const base = store(
      credential({
        expiresAt: '2026-10-08T10:00:00.000Z',
        refreshToken: 'refresh-token-secret',
        refreshExpiresAt: '2026-10-08T12:00:00.000Z',
      }),
    );
    const failingStore: CredentialStore = {
      ...base.store,
      save: () => Promise.reject(new Error('refresh save private token sentinel')),
    };
    const service = createAuthService({
      config: config(),
      coordinator: coordinator(),
      oauth: {
        ...oauth(),
        refreshAccessToken: () =>
          Promise.resolve({ accessToken: 'new-token', expiresInSeconds: 3600, scopes: ['openid'] }),
      },
      store: failingStore,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    let caught: unknown;
    try {
      await service.getProviderContext();
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AuthServiceError);
    expect(caught).toMatchObject({ kind: 'provider_failure', retryable: false });
    expect((caught as Error).message).not.toContain('refresh save private token sentinel');
  });

  it('sanitizes credential clear failures while keeping reauthorization required', async () => {
    const base = store(credential());
    const failingStore: CredentialStore = {
      ...base.store,
      clear: () => Promise.reject(new Error('clear private token sentinel')),
    };
    const service = createAuthService({
      config: config(),
      coordinator: coordinator(),
      oauth: oauth(),
      store: failingStore,
      fetchIdentity: () => Promise.resolve(identity()),
      now: () => NOW,
    });

    let caught: unknown;
    try {
      await service.markReauthRequired();
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AuthServiceError);
    expect(caught).toMatchObject({ kind: 'provider_failure', retryable: false });
    expect((caught as Error).message).not.toContain('clear private token sentinel');
    await expect(service.getStatus()).resolves.toMatchObject({ state: 'reauth_required' });
  });

  it('keeps a replacement credential when it overlaps a delayed old-token invalidation', async () => {
    const stored = store(credential());
    let beginIdentity!: () => void;
    const identityStarted = new Promise<void>((resolve) => {
      beginIdentity = resolve;
    });
    let finishIdentity!: () => void;
    const identityGate = new Promise<void>((resolve) => {
      finishIdentity = resolve;
    });
    const service = createAuthService({
      config: config(),
      coordinator: coordinator(),
      oauth: {
        ...oauth(),
        exchangeAuthorizationCode: () =>
          Promise.resolve({ accessToken: 'replacement-token', expiresInSeconds: 3600, scopes: ['openid'] }),
      },
      store: stored.store,
      fetchIdentity: async () => {
        beginIdentity();
        await identityGate;
        return identity();
      },
      now: () => NOW,
    });
    const code: ConsumedAuthorizationCode = {
      code: 'authorization-code-secret',
      redirectUri: config().redirectUri,
      scopes: ['openid'],
      mode: 'confidential',
    };

    const replacement = service.completeAuthorization(code);
    await identityStarted;
    const invalidation = service.markReauthRequired({
      accessToken: 'access-token-secret',
      subject: 'member-123',
    });
    finishIdentity();
    await Promise.all([replacement, invalidation]);

    expect(stored.value()?.accessToken).toBe('replacement-token');
    expect(stored.clearCount()).toBe(0);
  });
});

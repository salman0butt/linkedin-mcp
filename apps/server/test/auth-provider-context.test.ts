import { describe, expect, it } from 'vitest';

import type { AuthenticatedIdentity, StoredCredential } from '../../../packages/core/src/auth.js';
import { createAuthService } from '../src/auth/auth-service.js';
import type { CredentialStore } from '../src/auth/credential-store.js';
import type { LinkedInOAuthAdapter, LinkedInTokenResult } from '../src/auth/linkedin-oauth.js';
import type { OAuthSessionCoordinator } from '../src/auth/oauth-session.js';
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
    const stored = store(credential({ subject: undefined }));
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
});

import { describe, expect, it } from 'vitest';

import type { CredentialStore } from '../src/auth/credential-store.js';
import type { OAuthCallbackListener, OAuthCallbackListenerOptions } from '../src/auth/callback-listener.js';
import type { LinkedInOAuthAdapter } from '../src/auth/linkedin-oauth.js';
import type {
  AuthorizationSession,
  ConsumedAuthorizationCode,
  OAuthSessionCoordinator,
} from '../src/auth/oauth-session.js';
import { createAuthService } from '../src/auth/auth-service.js';
import type { LinkedInAuthConfig } from '../src/config.js';

function config(): LinkedInAuthConfig {
  return {
    mode: 'confidential',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'http://127.0.0.1:17890/oauth/callback',
    scopes: ['openid', 'profile', 'email'],
    credentialStorePath: '/tmp/linkedin-mcp-callback-credentials.json',
    tokenEncryptionKey: Buffer.alloc(32, 9).toString('base64'),
  };
}

function session(): AuthorizationSession {
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

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('M01 auth callback orchestration review', () => {
  it('arms the configured loopback listener and completes authorization after its validated result', async () => {
    let pending: AuthorizationSession | null = null;
    const coordinator: OAuthSessionCoordinator = {
      start() {
        pending = session();
        return { ...pending, scopes: [...pending.scopes] };
      },
      peek() {
        return pending === null ? null : { ...pending, scopes: [...pending.scopes] };
      },
      consumeCallback() {
        throw new Error('listener owns callback validation in this test');
      },
      consumeProviderError() {
        throw new Error('listener owns callback validation in this test');
      },
      cancel() {
        pending = null;
      },
    };

    let storedSubject: string | undefined;
    let storedCredential: Parameters<CredentialStore['save']>[0] | null = null;
    const store: CredentialStore = {
      load() {
        return Promise.resolve(
          storedCredential === null ? null : { ...storedCredential, scopes: [...storedCredential.scopes] },
        );
      },
      save(value) {
        storedCredential = { ...value, scopes: [...value.scopes] };
        storedSubject = value.subject;
        return Promise.resolve();
      },
      clear() {
        storedCredential = null;
        storedSubject = undefined;
        return Promise.resolve();
      },
    };

    const oauth: LinkedInOAuthAdapter = {
      buildAuthorizationUrl: () => 'https://www.linkedin.com/oauth/v2/authorization?safe=1',
      exchangeAuthorizationCode: () =>
        Promise.resolve({
          accessToken: 'access-token-secret',
          expiresInSeconds: 3600,
          scopes: ['openid', 'profile'],
        }),
      refreshAccessToken: () => Promise.resolve(null),
    };

    let callbackOptions: OAuthCallbackListenerOptions | undefined;
    let resolveCallback!: (value: ConsumedAuthorizationCode) => void;
    let closeCalls = 0;
    const callbackResult = new Promise<ConsumedAuthorizationCode>((resolve) => {
      resolveCallback = resolve;
    });
    const listener: OAuthCallbackListener = {
      result: callbackResult,
      close() {
        closeCalls += 1;
        return Promise.resolve();
      },
    };

    const service = createAuthService({
      config: config(),
      coordinator,
      oauth,
      store,
      fetchIdentity: () => Promise.resolve({ sub: 'member-123', name: 'Example Member' }),
      now: () => new Date('2026-10-07T12:00:00.000Z'),
      startCallbackListener: (options: OAuthCallbackListenerOptions) => {
        callbackOptions = options;
        return Promise.resolve(listener);
      },
    });

    const started = service.startAuthorization();
    expect(started).toMatchObject({ sessionId: 'session-id', provider: 'OFFICIAL_API' });
    expect(callbackOptions).toMatchObject({
      redirectUri: 'http://127.0.0.1:17890/oauth/callback',
      sessionId: 'session-id',
      coordinator,
    });

    pending = null;
    resolveCallback(consumedCode());
    await nextTurn();
    await nextTurn();

    expect(storedSubject).toBe('member-123');
    await expect(service.getStatus()).resolves.toMatchObject({
      state: 'connected',
      subject: 'member-123',
    });

    await service.logout();
    expect(closeCalls).toBe(0);
  });

  it('surfaces terminal callback failure as error without exposing provider details', async () => {
    let pending: AuthorizationSession | null = null;
    const coordinator: OAuthSessionCoordinator = {
      start() {
        pending = session();
        return { ...pending, scopes: [...pending.scopes] };
      },
      peek() {
        return pending === null ? null : { ...pending, scopes: [...pending.scopes] };
      },
      consumeCallback() {
        throw new Error('not used');
      },
      consumeProviderError() {
        throw new Error('not used');
      },
      cancel() {
        pending = null;
      },
    };

    const store: CredentialStore = {
      load: () => Promise.resolve(null),
      save: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    };
    const oauth: LinkedInOAuthAdapter = {
      buildAuthorizationUrl: () => 'https://www.linkedin.com/oauth/v2/authorization?safe=1',
      exchangeAuthorizationCode: () => Promise.reject(new Error('not used')),
      refreshAccessToken: () => Promise.resolve(null),
    };

    let rejectCallback!: (error: Error) => void;
    const callbackResult = new Promise<ConsumedAuthorizationCode>((_resolve, reject) => {
      rejectCallback = reject;
    });
    const service = createAuthService({
      config: config(),
      coordinator,
      oauth,
      store,
      fetchIdentity: () => Promise.reject(new Error('not used')),
      now: () => new Date('2026-10-07T12:00:00.000Z'),
      startCallbackListener: () =>
        Promise.resolve({
          result: callbackResult,
          close: () => Promise.resolve(),
        }),
    });

    service.startAuthorization();
    pending = null;
    rejectCallback(new Error('provider-private-detail access-token-secret'));
    await nextTurn();

    const status = await service.getStatus();
    expect(status).toEqual({
      state: 'error',
      provider: 'OFFICIAL_API',
      mode: 'confidential',
      scopes: [],
      refreshAvailable: false,
    });
    expect(JSON.stringify(status)).not.toContain('provider-private-detail');
    expect(JSON.stringify(status)).not.toContain('access-token-secret');
  });
});

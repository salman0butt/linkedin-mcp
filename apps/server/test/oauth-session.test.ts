import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { LinkedInAuthConfig } from '../src/config.js';
import { buildPkceChallenge, createOAuthSessionCoordinator } from '../src/auth/oauth-session.js';

const nowIso = '2026-10-06T15:00:00.000Z';

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

function deterministicRandomBytes() {
  let value = 1;
  return (size: number): Buffer => Buffer.alloc(size, value++);
}

describe('OAuth session coordinator', () => {
  it('creates a five-minute native PKCE session with S256 challenge and configured scopes', () => {
    const now = new Date(nowIso);
    const coordinator = createOAuthSessionCoordinator(config('native_pkce'), {
      now: () => now,
      randomBytes: deterministicRandomBytes(),
    });

    const session = coordinator.start();

    expect(session.id).not.toBe(session.state);
    expect(session.scopes).toEqual(['openid', 'profile', 'email']);
    expect(session.createdAt).toBe(nowIso);
    expect(session.expiresAt).toBe('2026-10-06T15:05:00.000Z');
    expect(session.codeVerifier).toHaveLength(43);
    expect(session.codeChallenge).toBe(
      createHash('sha256')
        .update(session.codeVerifier ?? '')
        .digest('base64url'),
    );
    expect(buildPkceChallenge(session.codeVerifier ?? '')).toBe(session.codeChallenge);
    expect(coordinator.peek()?.id).toBe(session.id);
  });

  it('omits PKCE material for confidential authorization', () => {
    const coordinator = createOAuthSessionCoordinator(config('confidential'), {
      now: () => new Date(nowIso),
      randomBytes: deterministicRandomBytes(),
    });

    const session = coordinator.start();

    expect(session.codeVerifier).toBeUndefined();
    expect(session.codeChallenge).toBeUndefined();
  });

  it('consumes a valid callback exactly once and returns the verifier only internally', () => {
    const coordinator = createOAuthSessionCoordinator(config('native_pkce'), {
      now: () => new Date(nowIso),
      randomBytes: deterministicRandomBytes(),
    });
    const session = coordinator.start();

    expect(
      coordinator.consumeCallback({
        sessionId: session.id,
        state: session.state,
        code: 'authorization-code',
      }),
    ).toEqual({
      code: 'authorization-code',
      codeVerifier: session.codeVerifier,
      redirectUri: session.redirectUri,
      scopes: ['openid', 'profile', 'email'],
      mode: 'native_pkce',
    });
    expect(coordinator.peek()).toBeNull();
    expect(() =>
      coordinator.consumeCallback({
        sessionId: session.id,
        state: session.state,
        code: 'authorization-code',
      }),
    ).toThrow(/pending|session/i);
  });

  it('rejects missing or wrong state and clears the terminal session without leaking state', () => {
    const coordinator = createOAuthSessionCoordinator(config('confidential'), {
      now: () => new Date(nowIso),
      randomBytes: deterministicRandomBytes(),
    });
    const first = coordinator.start();

    expect(() => coordinator.consumeCallback({ sessionId: first.id, code: 'authorization-code' })).toThrow(
      /state/i,
    );
    expect(coordinator.peek()).toBeNull();

    const second = coordinator.start();
    let error: unknown;
    try {
      coordinator.consumeCallback({
        sessionId: second.id,
        state: 'attacker-state',
        code: 'authorization-code',
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/state/i);
    expect((error as Error).message).not.toContain('attacker-state');
    expect((error as Error).message).not.toContain(second.state);
    expect(coordinator.peek()).toBeNull();
  });

  it('does not expose an expired pending session through peek', () => {
    let now = new Date(nowIso);
    const coordinator = createOAuthSessionCoordinator(config('confidential'), {
      now: () => now,
      randomBytes: deterministicRandomBytes(),
    });
    coordinator.start();
    now = new Date('2026-10-06T15:05:00.001Z');

    expect(coordinator.peek()).toBeNull();
    expect(coordinator.peek()).toBeNull();
  });

  it('rejects expired sessions and clears them', () => {
    let now = new Date(nowIso);
    const coordinator = createOAuthSessionCoordinator(config('confidential'), {
      now: () => now,
      randomBytes: deterministicRandomBytes(),
    });
    const session = coordinator.start();
    now = new Date('2026-10-06T15:05:00.001Z');

    expect(() =>
      coordinator.consumeCallback({
        sessionId: session.id,
        state: session.state,
        code: 'authorization-code',
      }),
    ).toThrow(/expired/i);
    expect(coordinator.peek()).toBeNull();
  });
});

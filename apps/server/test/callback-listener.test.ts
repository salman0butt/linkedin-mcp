import { createServer } from 'node:net';

import { describe, expect, it } from 'vitest';

import type { LinkedInAuthConfig } from '../src/config.js';
import { startOAuthCallbackListener } from '../src/auth/callback-listener.js';
import { createOAuthSessionCoordinator } from '../src/auth/oauth-session.js';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected TCP listener address');
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

function config(redirectUri: string): LinkedInAuthConfig {
  return {
    mode: 'native_pkce',
    clientId: 'client-id',
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
    credentialStorePath: '/tmp/linkedin-mcp-credentials.json',
    tokenEncryptionKey: Buffer.alloc(32, 7).toString('base64'),
  };
}

function coordinatorFor(redirectUri: string) {
  let randomValue = 1;
  return createOAuthSessionCoordinator(config(redirectUri), {
    now: () => new Date('2026-10-06T15:00:00.000Z'),
    randomBytes: (size) => Buffer.alloc(size, randomValue++),
  });
}

describe('OAuth callback listener', () => {
  it('accepts the exact loopback callback, resolves once, and closes after success', async () => {
    const port = await freePort();
    const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
    const coordinator = coordinatorFor(redirectUri);
    const session = coordinator.start();
    const listener = await startOAuthCallbackListener({
      redirectUri,
      sessionId: session.id,
      coordinator,
      timeoutMs: 2_000,
    });

    const response = await fetch(
      `${redirectUri}?code=authorization-code&state=${encodeURIComponent(session.state)}`,
    );

    expect(response.status).toBe(200);
    expect(await listener.result).toEqual({
      code: 'authorization-code',
      codeVerifier: session.codeVerifier,
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
      mode: 'native_pkce',
    });
    await expect(fetch(redirectUri)).rejects.toThrow();
  });

  it('rejects a different callback path without consuming the pending session', async () => {
    const port = await freePort();
    const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
    const coordinator = coordinatorFor(redirectUri);
    const session = coordinator.start();
    const listener = await startOAuthCallbackListener({
      redirectUri,
      sessionId: session.id,
      coordinator,
      timeoutMs: 2_000,
    });

    const response = await fetch(`http://127.0.0.1:${port}/wrong-path`);

    expect(response.status).toBe(404);
    expect(coordinator.peek()?.id).toBe(session.id);
    await listener.close();
  });

  it('refuses non-loopback binding before opening a listener', async () => {
    const coordinator = coordinatorFor('http://0.0.0.0:17890/oauth/callback');
    const session = coordinator.start();

    await expect(
      startOAuthCallbackListener({
        redirectUri: 'http://0.0.0.0:17890/oauth/callback',
        sessionId: session.id,
        coordinator,
      }),
    ).rejects.toThrow(/loopback/i);
  });

  it('treats wrong state as terminal, sanitizes the error, and closes', async () => {
    const port = await freePort();
    const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
    const coordinator = coordinatorFor(redirectUri);
    const session = coordinator.start();
    const listener = await startOAuthCallbackListener({
      redirectUri,
      sessionId: session.id,
      coordinator,
      timeoutMs: 2_000,
    });

    const response = await fetch(`${redirectUri}?code=authorization-code&state=attacker-state`);
    expect(response.status).toBe(400);

    let error: unknown;
    try {
      await listener.result;
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/state/i);
    expect((error as Error).message).not.toContain('attacker-state');
    expect((error as Error).message).not.toContain(session.state);
    await expect(fetch(redirectUri)).rejects.toThrow();
  });

  it('handles provider denial as terminal without echoing provider description', async () => {
    const port = await freePort();
    const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
    const coordinator = coordinatorFor(redirectUri);
    const session = coordinator.start();
    const listener = await startOAuthCallbackListener({
      redirectUri,
      sessionId: session.id,
      coordinator,
      timeoutMs: 2_000,
    });

    const response = await fetch(
      `${redirectUri}?error=access_denied&error_description=provider-secret-detail&state=${encodeURIComponent(session.state)}`,
    );
    expect(response.status).toBe(400);

    let error: unknown;
    try {
      await listener.result;
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('access_denied');
    expect((error as Error).message).not.toContain('provider-secret-detail');
    await expect(fetch(redirectUri)).rejects.toThrow();
  });

  it('closes and rejects when the callback window expires', async () => {
    const port = await freePort();
    const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
    const coordinator = coordinatorFor(redirectUri);
    const session = coordinator.start();
    const listener = await startOAuthCallbackListener({
      redirectUri,
      sessionId: session.id,
      coordinator,
      timeoutMs: 20,
    });

    await expect(listener.result).rejects.toThrow(/timed out/i);
    await expect(fetch(redirectUri)).rejects.toThrow();
  });
});

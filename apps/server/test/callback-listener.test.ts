import { connect, createServer, type Socket } from 'node:net';

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

async function heldIncompleteRequest(port: number): Promise<Socket> {
  const blocker = connect(port, '127.0.0.1');
  blocker.on('error', () => undefined);
  await new Promise<void>((resolve, reject) => {
    blocker.once('connect', resolve);
    blocker.once('error', reject);
  });
  blocker.write(`GET /oauth/callback HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nX-Stall: `);
  return blocker;
}

async function settleWithin<T>(operation: Promise<T>, milliseconds = 600): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Callback settlement blocked')), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

describe('OAuth callback listener', () => {
  it('settles a valid callback despite an unrelated half-open loopback HTTP connection', async () => {
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
    const blocker = await heldIncompleteRequest(port);

    try {
      const response = await fetch(
        `${redirectUri}?code=authorization-code&state=${encodeURIComponent(session.state)}`,
        { headers: { connection: 'close' } },
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('OAuth authorization received');

      await expect(settleWithin(listener.result)).resolves.toMatchObject({
        code: 'authorization-code',
        codeVerifier: session.codeVerifier,
      });
      await expect(fetch(redirectUri)).rejects.toThrow();
    } finally {
      blocker.destroy();
      await listener.close();
    }
  });

  it.each([
    { name: 'wrong state', query: '?code=authorization-code&state=attacker-state', message: /state/i },
    {
      name: 'provider denial',
      query: '?error=access_denied&error_description=PROVIDER_PRIVATE_VALUE&state=VALID_STATE',
      message: /access_denied/i,
    },
  ])('settles a terminal $name with an unrelated half-open connection', async ({ query, message }) => {
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
    const blocker = await heldIncompleteRequest(port);
    try {
      const response = await fetch(`${redirectUri}${query.replace('VALID_STATE', session.state)}`, {
        headers: { connection: 'close' },
      });
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).not.toContain('PROVIDER_PRIVATE_VALUE');
      expect(text).not.toContain(session.state);
      await expect(settleWithin(listener.result)).rejects.toThrow(message);
      expect(coordinator.peek()).toBeNull();
      await expect(fetch(redirectUri)).rejects.toThrow();
    } finally {
      blocker.destroy();
      await listener.close();
    }
  });

  it('closes a held incomplete request when the callback times out or is explicitly closed', async () => {
    for (const mode of ['timeout', 'close'] as const) {
      const port = await freePort();
      const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
      const coordinator = coordinatorFor(redirectUri);
      const session = coordinator.start();
      const listener = await startOAuthCallbackListener({
        redirectUri,
        sessionId: session.id,
        coordinator,
        timeoutMs: mode === 'timeout' ? 60 : 2_000,
      });
      const blocker = await heldIncompleteRequest(port);
      try {
        if (mode === 'timeout') {
          await expect(settleWithin(listener.result)).rejects.toThrow(/timed out/i);
        } else {
          await settleWithin(listener.close());
        }
        expect(coordinator.peek()).toBeNull();
        await expect(fetch(redirectUri)).rejects.toThrow();
      } finally {
        blocker.destroy();
        await listener.close();
      }
    }
  });

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

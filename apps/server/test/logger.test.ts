import { describe, expect, it } from 'vitest';

import { createLogger } from '../src/logger.js';

describe('createLogger', () => {
  it('writes structured JSON and recursively redacts secret-like fields', () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));

    logger.info(
      {
        user: 'salman',
        clientId: 'safe-client-id',
        authorization: 'Bearer secret',
        oauthState: 'state-secret',
        codeVerifier: 'verifier-secret',
        authorizationCode: 'authorization-code-secret',
        nested: {
          access_token: 'access-secret',
          refreshToken: 'refresh-secret',
          tokenEncryptionKey: 'encryption-secret',
          password: 'password-secret',
          cookie: 'cookie-secret',
          clientSecret: 'client-secret',
        },
      },
      'safe message',
    );

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('safe message');
    expect(entry.user).toBe('salman');
    expect(entry.clientId).toBe('safe-client-id');
    expect(entry.authorization).toBe('[REDACTED]');
    expect(entry.oauthState).toBe('[REDACTED]');
    expect(entry.codeVerifier).toBe('[REDACTED]');
    expect(entry.authorizationCode).toBe('[REDACTED]');
    expect(entry.nested).toEqual({
      access_token: '[REDACTED]',
      refreshToken: '[REDACTED]',
      tokenEncryptionKey: '[REDACTED]',
      password: '[REDACTED]',
      cookie: '[REDACTED]',
      clientSecret: '[REDACTED]',
    });
  });
});

import { describe, expect, it } from 'vitest';

import { createLogger } from '../src/logger.js';

describe('createLogger', () => {
  it('writes structured JSON and recursively redacts secret-like fields', () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));

    logger.info(
      {
        user: 'salman',
        authorization: 'Bearer secret',
        nested: {
          access_token: 'access-secret',
          refreshToken: 'refresh-secret',
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
    expect(entry.authorization).toBe('[REDACTED]');
    expect(entry.nested).toEqual({
      access_token: '[REDACTED]',
      refreshToken: '[REDACTED]',
      password: '[REDACTED]',
      cookie: '[REDACTED]',
      clientSecret: '[REDACTED]',
    });
  });
});

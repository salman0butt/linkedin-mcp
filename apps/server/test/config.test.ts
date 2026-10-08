import { describe, expect, it } from 'vitest';

import { parseConfig } from '../src/config.js';

const encryptionKey = Buffer.alloc(32, 7).toString('base64');

function nativePkceEnv(tokenEncryptionKey: string) {
  return {
    LINKEDIN_MCP_OAUTH_MODE: 'native_pkce',
    LINKEDIN_MCP_CLIENT_ID: 'client-id',
    LINKEDIN_MCP_REDIRECT_URI: 'http://127.0.0.1:17890/oauth/callback',
    LINKEDIN_MCP_OAUTH_SCOPES: 'openid profile email',
    LINKEDIN_MCP_CREDENTIAL_STORE_PATH: '/tmp/linkedin-mcp-credentials.json',
    LINKEDIN_MCP_TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
  } as const;
}

describe('parseConfig', () => {
  it('uses conservative production-safe defaults', () => {
    expect(parseConfig({})).toEqual({
      transport: 'stdio',
      httpHost: '127.0.0.1',
      httpPort: 3000,
      logLevel: 'info',
      serverName: 'linkedin-mcp',
      serverVersion: '0.0.0',
      requestBodyLimitBytes: 1_048_576,
    });
  });

  it('accepts an explicit LinkedIn API version only in YYYYMM form', () => {
    expect(parseConfig({ LINKEDIN_MCP_API_VERSION: '202510' })).toMatchObject({
      linkedinApiVersion: '202510',
    });
  });

  it.each(['2025-10', '20251', '2025101', '202500', '202513', ' 202510 '])(
    'rejects invalid LinkedIn API version %s',
    (apiVersion) => {
      expect(() => parseConfig({ LINKEDIN_MCP_API_VERSION: apiVersion })).toThrow(/api version.*yyyymm/i);
    },
  );

  it('parses confidential OAuth configuration only when required values exist', () => {
    const config = parseConfig({
      LINKEDIN_MCP_OAUTH_MODE: 'confidential',
      LINKEDIN_MCP_CLIENT_ID: 'client-id',
      LINKEDIN_MCP_CLIENT_SECRET: 'client-secret',
      LINKEDIN_MCP_REDIRECT_URI: 'http://127.0.0.1:17890/oauth/callback',
      LINKEDIN_MCP_OAUTH_SCOPES: 'openid profile email',
      LINKEDIN_MCP_CREDENTIAL_STORE_PATH: '/tmp/linkedin-mcp-credentials.json',
      LINKEDIN_MCP_TOKEN_ENCRYPTION_KEY: encryptionKey,
    });

    expect(config.auth).toEqual({
      mode: 'confidential',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'http://127.0.0.1:17890/oauth/callback',
      scopes: ['openid', 'profile', 'email'],
      credentialStorePath: '/tmp/linkedin-mcp-credentials.json',
      tokenEncryptionKey: encryptionKey,
    });
  });

  it('parses native PKCE configuration without requiring a client secret', () => {
    const config = parseConfig(nativePkceEnv(encryptionKey));

    expect(config.auth).toEqual({
      mode: 'native_pkce',
      clientId: 'client-id',
      redirectUri: 'http://127.0.0.1:17890/oauth/callback',
      scopes: ['openid', 'profile', 'email'],
      credentialStorePath: '/tmp/linkedin-mcp-credentials.json',
      tokenEncryptionKey: encryptionKey,
    });
  });

  it('requires the token encryption key to be canonical base64 for exactly 32 bytes', () => {
    for (const tokenEncryptionKey of [
      'not-base64',
      Buffer.alloc(31, 7).toString('base64'),
      Buffer.alloc(33, 7).toString('base64'),
      Buffer.alloc(32, 7).toString('base64url'),
    ]) {
      expect(() => parseConfig(nativePkceEnv(tokenEncryptionKey))).toThrow(/32-byte|base64/i);
    }
  });

  it('rejects non-loopback redirect URI for native PKCE mode', () => {
    expect(() =>
      parseConfig({
        LINKEDIN_MCP_OAUTH_MODE: 'native_pkce',
        LINKEDIN_MCP_CLIENT_ID: 'client-id',
        LINKEDIN_MCP_REDIRECT_URI: 'https://example.com/oauth/callback',
        LINKEDIN_MCP_OAUTH_SCOPES: 'openid profile email',
        LINKEDIN_MCP_CREDENTIAL_STORE_PATH: '/tmp/linkedin-mcp-credentials.json',
        LINKEDIN_MCP_TOKEN_ENCRYPTION_KEY: encryptionKey,
      }),
    ).toThrow(/loopback/i);
  });

  it('requires openid in configured OAuth scopes', () => {
    expect(() =>
      parseConfig({
        LINKEDIN_MCP_OAUTH_MODE: 'confidential',
        LINKEDIN_MCP_CLIENT_ID: 'client-id',
        LINKEDIN_MCP_CLIENT_SECRET: 'client-secret',
        LINKEDIN_MCP_REDIRECT_URI: 'http://127.0.0.1:17890/oauth/callback',
        LINKEDIN_MCP_OAUTH_SCOPES: 'profile email',
        LINKEDIN_MCP_CREDENTIAL_STORE_PATH: '/tmp/linkedin-mcp-credentials.json',
        LINKEDIN_MCP_TOKEN_ENCRYPTION_KEY: encryptionKey,
      }),
    ).toThrow(/openid/i);
  });

  it('rejects partial OAuth configuration instead of silently disabling auth', () => {
    expect(() => parseConfig({ LINKEDIN_MCP_CLIENT_ID: 'client-id' })).toThrow(/oauth/i);
  });

  it.each([
    [{ LINKEDIN_MCP_TRANSPORT: 'ftp' }, /transport/i],
    [{ LINKEDIN_MCP_HTTP_HOST: '0.0.0.0' }, /loopback/i],
    [{ LINKEDIN_MCP_HTTP_PORT: '0' }, /port/i],
    [{ LINKEDIN_MCP_HTTP_PORT: '70000' }, /port/i],
    [{ LINKEDIN_MCP_LOG_LEVEL: 'verbose' }, /log level/i],
    [{ LINKEDIN_MCP_BODY_LIMIT_BYTES: '0' }, /body limit/i],
  ])('rejects invalid configuration %j', (env, expected) => {
    expect(() => parseConfig(env)).toThrow(expected);
  });
});

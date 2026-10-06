import { describe, expect, it } from 'vitest';

import { parseConfig } from '../src/config.js';

const encryptionKey = Buffer.alloc(32, 7).toString('base64');

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
    const config = parseConfig({
      LINKEDIN_MCP_OAUTH_MODE: 'native_pkce',
      LINKEDIN_MCP_CLIENT_ID: 'client-id',
      LINKEDIN_MCP_REDIRECT_URI: 'http://127.0.0.1:17890/oauth/callback',
      LINKEDIN_MCP_OAUTH_SCOPES: 'openid profile email',
      LINKEDIN_MCP_CREDENTIAL_STORE_PATH: '/tmp/linkedin-mcp-credentials.json',
      LINKEDIN_MCP_TOKEN_ENCRYPTION_KEY: encryptionKey,
    });

    expect(config.auth).toEqual({
      mode: 'native_pkce',
      clientId: 'client-id',
      redirectUri: 'http://127.0.0.1:17890/oauth/callback',
      scopes: ['openid', 'profile', 'email'],
      credentialStorePath: '/tmp/linkedin-mcp-credentials.json',
      tokenEncryptionKey: encryptionKey,
    });
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

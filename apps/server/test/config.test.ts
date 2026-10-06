import { describe, expect, it } from 'vitest';

import { parseConfig } from '../src/config.js';

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

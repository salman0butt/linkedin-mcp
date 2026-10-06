import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const serverPackage = '@linkedin-mcp/server';

const clientScript = `
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpServer } from './dist/http.js';

const server = await createHttpServer({ host: '127.0.0.1', port: 0 });
const transport = new StreamableHTTPClientTransport(
  new URL(\`http://\${server.address.host}:\${server.address.port}/mcp\`),
);
const client = new Client({ name: 'linkedin-mcp-http-smoke', version: '1.0.0' });

try {
  await client.connect(transport);
  const result = await client.callTool({ name: 'linkedin.health', arguments: {} });
  process.stdout.write(JSON.stringify(result.structuredContent));
} finally {
  await client.close();
  await server.close();
}
`;

function callBuiltHttpServer(): unknown {
  const stdout = execFileSync(
    'pnpm',
    ['--filter', serverPackage, 'exec', 'node', '--input-type=module', '--eval', clientScript],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
    },
  );

  return JSON.parse(stdout) as unknown;
}

describe('built HTTP server', () => {
  it('is callable through a real loopback StreamableHTTPClientTransport', () => {
    expect(callBuiltHttpServer()).toMatchObject({
      status: 'succeeded',
      data: {
        ok: true,
        service: 'linkedin-mcp',
        linkedinConnected: false,
      },
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
    });
  });
});

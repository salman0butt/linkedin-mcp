import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { describe, expect, it } from 'vitest';

import { createHttpServer } from '../../apps/server/src/http.js';

describe('HTTP transport smoke', () => {
  it('calls linkedin.health through a real loopback StreamableHTTPClientTransport', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://${server.address.host}:${server.address.port}/mcp`),
    );
    const client = new Client({ name: 'linkedin-mcp-http-smoke', version: '1.0.0' });

    try {
      await client.connect(transport);
      const result = await client.callTool({ name: 'linkedin.health', arguments: {} });

      expect(result.structuredContent).toMatchObject({
        status: 'succeeded',
        data: {
          ok: true,
          service: 'linkedin-mcp',
          linkedinConnected: false,
        },
        provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});

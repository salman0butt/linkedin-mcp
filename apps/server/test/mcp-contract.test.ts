import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';

describe('LinkedIn MCP server contract', () => {
  it('lists and calls linkedin.health through a real MCP client', async () => {
    const handler = createMcpHandler(() =>
      createLinkedInMcpServer({
        createRequestId: () => 'req-mcp-health',
        now: () => new Date('2026-10-05T12:00:00.000Z'),
        version: '1.2.3',
      }),
    );
    const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    });
    const client = new Client({ name: 'linkedin-mcp-test', version: '1.0.0' });

    try {
      await client.connect(transport);

      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toContain('linkedin.health');

      const result = await client.callTool({ name: 'linkedin.health', arguments: {} });
      expect(result.structuredContent).toEqual({
        status: 'succeeded',
        data: {
          ok: true,
          service: 'linkedin-mcp',
          linkedinConnected: false,
        },
        provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
        metadata: {
          requestId: 'req-mcp-health',
          timestamp: '2026-10-05T12:00:00.000Z',
        },
      });
    } finally {
      await client.close();
      await handler.close();
    }
  });
});

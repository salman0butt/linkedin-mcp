import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';

interface CapabilityContract {
  id: string;
  status: string;
  availability: string;
}

interface CapabilitiesStructuredContent {
  status?: string;
  provider?: { type?: string; name?: string };
  metadata?: { requestId?: string; timestamp?: string };
  data?: { capabilities?: CapabilityContract[] };
}

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

  it('lists and calls linkedin.version through a real MCP client', async () => {
    const handler = createMcpHandler(() =>
      createLinkedInMcpServer({
        createRequestId: () => 'req-mcp-version',
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
      expect(tools.map((tool) => tool.name)).toContain('linkedin.version');

      const result = await client.callTool({ name: 'linkedin.version', arguments: {} });
      expect(result.structuredContent).toEqual({
        status: 'succeeded',
        data: {
          name: 'linkedin-mcp',
          version: '1.2.3',
        },
        provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
        metadata: {
          requestId: 'req-mcp-version',
          timestamp: '2026-10-05T12:00:00.000Z',
        },
      });
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('lists and calls linkedin.capabilities without upgrading future LinkedIn access', async () => {
    const handler = createMcpHandler(() =>
      createLinkedInMcpServer({
        createRequestId: () => 'req-mcp-capabilities',
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
      expect(tools.map((tool) => tool.name)).toContain('linkedin.capabilities');

      const result = await client.callTool({ name: 'linkedin.capabilities', arguments: {} });
      const structured = result.structuredContent as CapabilitiesStructuredContent | undefined;

      expect(structured).toMatchObject({
        status: 'succeeded',
        provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
        metadata: {
          requestId: 'req-mcp-capabilities',
          timestamp: '2026-10-05T12:00:00.000Z',
        },
      });

      const capabilities = structured?.data?.capabilities ?? [];
      expect(capabilities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'profile.me',
            status: 'ACTIVE',
            availability: 'UNAVAILABLE',
          }),
        ]),
      );
      expect(
        capabilities
          .filter(
            (capability) =>
              !capability.id.startsWith('linkedin.') &&
              !['jobs.analyze', 'jobs.compare', 'article.draft'].includes(capability.id),
          )
          .every((capability) => capability.status !== 'VERIFIED'),
      ).toBe(true);
      for (const id of ['jobs.analyze', 'jobs.compare', 'article.draft']) {
        expect(capabilities.find((capability) => capability.id === id)).toMatchObject({
          provider: 'LOCAL_ONLY',
          status: 'VERIFIED',
          availability: 'AVAILABLE',
        });
      }
      expect(capabilities.find((capability) => capability.id === 'article.native.publish')).toMatchObject({
        status: 'PLANNED',
        availability: 'UNAVAILABLE',
      });
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('advertises foundation, publishing, engagement and discovery tools before authentication', async () => {
    const handler = createMcpHandler(() => createLinkedInMcpServer({ version: '1.2.3' }));
    const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    });
    const client = new Client({ name: 'linkedin-mcp-test', version: '1.0.0' });

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();

      expect(tools.map((tool) => tool.name).sort()).toEqual([
        'linkedin.article.draft.companion',
        'linkedin.article.draft.preview',
        'linkedin.article.draft.validate',
        'linkedin.article.projects.create',
        'linkedin.article.projects.get',
        'linkedin.article.projects.list',
        'linkedin.article.projects.remove',
        'linkedin.article.projects.update',
        'linkedin.capabilities',
        'linkedin.comments.get',
        'linkedin.comments.inbox',
        'linkedin.comments.list',
        'linkedin.comments.reply.approve',
        'linkedin.comments.reply.create',
        'linkedin.comments.reply.preview',
        'linkedin.health',
        'linkedin.jobs.analyze',
        'linkedin.jobs.compare',
        'linkedin.jobs.get',
        'linkedin.jobs.saved.get',
        'linkedin.jobs.saved.list',
        'linkedin.jobs.saved.remove',
        'linkedin.jobs.saved.save',
        'linkedin.jobs.saved_searches.get',
        'linkedin.jobs.saved_searches.list',
        'linkedin.jobs.saved_searches.remove',
        'linkedin.jobs.saved_searches.save',
        'linkedin.jobs.search',
        'linkedin.post.approve.image',
        'linkedin.post.approve.multi_image',
        'linkedin.post.approve.text',
        'linkedin.post.create.image',
        'linkedin.post.create.multi_image',
        'linkedin.post.create.text',
        'linkedin.post.preview.image',
        'linkedin.post.preview.multi_image',
        'linkedin.post.preview.text',
        'linkedin.posts.search',
        'linkedin.reactions.add',
        'linkedin.reactions.add.approve',
        'linkedin.reactions.add.preview',
        'linkedin.reactions.remove',
        'linkedin.reactions.remove.approve',
        'linkedin.reactions.remove.preview',
        'linkedin.version',
      ]);
      for (const tool of tools) {
        expect(tool.inputSchema).toMatchObject({ type: 'object' });
        expect(tool.outputSchema).toMatchObject({ type: 'object' });
      }
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('rejects unexpected tool arguments through MCP input validation', async () => {
    const handler = createMcpHandler(() => createLinkedInMcpServer({ version: '1.2.3' }));
    const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    });
    const client = new Client({ name: 'linkedin-mcp-test', version: '1.0.0' });

    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: 'linkedin.health',
        arguments: { unexpected: true },
      });

      expect(result.isError).toBe(true);
      const firstContent = result.content[0];
      expect(firstContent?.type).toBe('text');
      if (firstContent?.type !== 'text') {
        throw new Error('Expected MCP validation error as text content');
      }
      expect(firstContent.text).toMatch(/input validation error.*unrecognized key.*unexpected/i);
    } finally {
      await client.close();
      await handler.close();
    }
  });
});

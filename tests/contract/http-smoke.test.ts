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
  const health = await client.callTool({ name: 'linkedin.health', arguments: {} });
  const authStatus = await client.callTool({ name: 'linkedin.auth.status', arguments: {} });
  const { tools } = await client.listTools();
  const preview = await client.callTool({ name: 'linkedin.post.preview.text', arguments: { text: 'HTTP smoke preview' } });
  const previewData = preview.structuredContent.data;
  const approval = await client.callTool({ name: 'linkedin.post.approve.text', arguments: {
    payload: previewData.payload, payloadHash: previewData.payloadHash, approved: true,
  } });
  const publish = await client.callTool({ name: 'linkedin.post.create.text', arguments: {
    payload: previewData.payload, idempotencyKey: 'http-smoke-key',
  } });
  const capabilities = await client.callTool({ name: 'linkedin.capabilities', arguments: {} });
  process.stdout.write(JSON.stringify({
    health: health.structuredContent,
    authStatus: authStatus.structuredContent,
    toolNames: tools.map((tool) => tool.name),
    toolCount: tools.length,
    preview: preview.structuredContent,
    approval: approval.structuredContent,
    publish: publish.structuredContent,
    capabilities: capabilities.structuredContent,
  }));
} finally {
  await client.close();
  await server.close();
}
`;

function callBuiltHttpServer(): unknown {
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('LINKEDIN_MCP_')),
  );
  const stdout = execFileSync(
    'pnpm',
    ['--filter', serverPackage, 'exec', 'node', '--input-type=module', '--eval', clientScript],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: cleanEnv,
    },
  );

  return JSON.parse(stdout) as unknown;
}

describe('built HTTP server', () => {
  it('exposes local health and the M01 auth status contract through real loopback HTTP', () => {
    const result = callBuiltHttpServer() as {
      toolNames: string[];
      toolCount: number;
      capabilities: { data: { capabilities: Array<{ id: string; availability: string }> } };
      health: unknown;
      authStatus: unknown;
      preview: unknown;
      approval: unknown;
      publish: unknown;
    };
    expect(result).toMatchObject({
      health: {
        status: 'succeeded',
        data: {
          ok: true,
          service: 'linkedin-mcp',
          linkedinConnected: false,
        },
        provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      },
      authStatus: {
        status: 'permission_required',
        data: {
          state: 'not_configured',
          provider: 'OFFICIAL_API',
          scopes: [],
          refreshAvailable: false,
        },
        provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
      },
      toolCount: 10,
      preview: {
        status: 'succeeded',
        provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
        data: { provider: 'OFFICIAL_API', payload: { commentary: 'HTTP smoke preview' } },
      },
      approval: {
        status: 'permission_required',
        provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      },
      publish: {
        status: 'requires_approval',
        provider: { type: 'OFFICIAL_API', name: 'LinkedIn' },
        error: { code: 'approval_required' },
      },
    });
    expect(result.toolNames).toContain('linkedin.post.preview.text');
    expect(result.toolNames).toContain('linkedin.post.approve.text');
    expect(result.toolNames).toContain('linkedin.post.create.text');
    expect(
      result.capabilities.data.capabilities.find((capability) => capability.id === 'post.create.text')
        ?.availability,
    ).toBe('UNAVAILABLE');
  });
});

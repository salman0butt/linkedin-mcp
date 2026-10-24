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
  const mediaPreview = await client.callTool({
    name: 'linkedin.post.preview.image',
    arguments: {
      text: 'HTTP media preview',
      image: { sourcePath: 'missing.png', altText: 'Missing HTTP image' },
    },
  });
  const capabilities = await client.callTool({ name: 'linkedin.capabilities', arguments: {} });
  const postSearch = await client.callTool({ name: 'linkedin.posts.search', arguments: { kind: 'topic', term: 'AI' } });
  const jobSearch = await client.callTool({ name: 'linkedin.jobs.search', arguments: { keywords: 'TypeScript' } });
  const jobGet = await client.callTool({ name: 'linkedin.jobs.get', arguments: { sourceId: 'missing', jobId: '123' } });
  const analysis = await client.callTool({ name: 'linkedin.jobs.analyze', arguments: {
    job: {
      id: 'local-1', title: 'TypeScript Engineer', companyName: 'Sample',
      source: { provider: 'EXTERNAL_DISCOVERY', id: 'local', name: 'Unverified', retrievedAt: '2026-10-24T09:00:00Z' },
      postingDate: { state: 'unknown' }, description: 'Must have TypeScript.',
    },
    candidate: { skills: ['TypeScript'] },
  } });
  const comparison = await client.callTool({ name: 'linkedin.jobs.compare', arguments: {
    jobs: [
      { id: 'local-1', title: 'TypeScript Engineer', companyName: 'Sample',
        source: { provider: 'EXTERNAL_DISCOVERY', id: 'local', name: 'Fake Talent Source', retrievedAt: '2026-10-24T09:00:00Z' },
        postingDate: { state: 'unknown' }, description: 'Must have TypeScript.' },
      { id: 'local-2', title: 'AWS Engineer', companyName: 'Sample',
        source: { provider: 'EXTERNAL_DISCOVERY', id: 'local', name: 'Fake Talent Source', retrievedAt: '2026-10-24T09:00:00Z' },
        postingDate: { state: 'unknown' }, description: 'Must have AWS.' },
    ], candidate: { skills: ['TypeScript'] },
  } });
  process.stdout.write(JSON.stringify({
    health: health.structuredContent,
    authStatus: authStatus.structuredContent,
    toolNames: tools.map((tool) => tool.name),
    toolCount: tools.length,
    preview: preview.structuredContent,
    approval: approval.structuredContent,
    publish: publish.structuredContent,
    mediaPreview: mediaPreview.structuredContent,
    capabilities: capabilities.structuredContent,
    postSearch: postSearch.structuredContent,
    postSearchIsError: postSearch.isError,
    jobSearch: jobSearch.structuredContent,
    jobSearchIsError: jobSearch.isError,
    jobGet: jobGet.structuredContent,
    jobGetIsError: jobGet.isError,
    analysis: analysis.structuredContent,
    analysisIsError: analysis.isError,
    comparison: comparison.structuredContent,
    comparisonIsError: comparison.isError,
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
  it('exposes foundation, publishing, engagement and unavailable post search through loopback HTTP', () => {
    const result = callBuiltHttpServer() as {
      toolNames: string[];
      toolCount: number;
      capabilities: { data: { capabilities: Array<{ id: string; availability: string }> } };
      health: unknown;
      authStatus: unknown;
      preview: unknown;
      approval: unknown;
      publish: unknown;
      mediaPreview: unknown;
      postSearch: unknown;
      postSearchIsError: boolean;
      jobSearch: unknown;
      jobSearchIsError: boolean;
      jobGet: unknown;
      jobGetIsError: boolean;
      analysis: unknown;
      analysisIsError?: boolean;
      comparison: unknown;
      comparisonIsError?: boolean;
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
      toolCount: 41,
      postSearch: {
        status: 'unsupported',
        data: { status: 'unavailable', providerOutcomes: [] },
      },
      postSearchIsError: true,
      jobSearch: { status: 'unsupported', data: { status: 'unavailable', providerOutcomes: [] } },
      jobGet: { status: 'unsupported', data: { status: 'unavailable' } },
      jobSearchIsError: true,
      jobGetIsError: true,
      analysis: {
        status: 'succeeded',
        data: {
          status: 'available',
          analysis: {
            sourceTrust: 'caller_supplied',
            fit: { status: 'evaluated', score: 100 },
          },
        },
      },
      comparison: {
        status: 'succeeded',
        data: {
          status: 'available',
          analyses: [
            {
              ref: { jobId: 'local-1' },
              sourceTrust: 'caller_supplied',
              source: { name: 'Unverified user-supplied snapshot' },
            },
            {
              ref: { jobId: 'local-2' },
              sourceTrust: 'caller_supplied',
              source: { name: 'Unverified user-supplied snapshot' },
            },
          ],
        },
      },
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
      mediaPreview: {
        status: 'permission_required',
        provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
        error: { code: 'publishing_not_configured' },
      },
    });
    expect(result.toolNames).toContain('linkedin.post.preview.text');
    expect(result.toolNames).toContain('linkedin.post.approve.text');
    expect(result.toolNames).toContain('linkedin.post.create.text');
    expect(result.toolNames).toEqual(
      expect.arrayContaining([
        'linkedin.post.preview.image',
        'linkedin.post.approve.image',
        'linkedin.post.create.image',
        'linkedin.post.preview.multi_image',
        'linkedin.post.approve.multi_image',
        'linkedin.post.create.multi_image',
        'linkedin.comments.get',
        'linkedin.comments.list',
        'linkedin.comments.inbox',
        'linkedin.comments.reply.preview',
        'linkedin.comments.reply.approve',
        'linkedin.comments.reply.create',
        'linkedin.reactions.add.preview',
        'linkedin.reactions.add.approve',
        'linkedin.reactions.add',
        'linkedin.reactions.remove.preview',
        'linkedin.reactions.remove.approve',
        'linkedin.reactions.remove',
        'linkedin.posts.search',
        'linkedin.jobs.search',
        'linkedin.jobs.get',
        'linkedin.jobs.analyze',
        'linkedin.jobs.compare',
        'linkedin.jobs.saved.list',
        'linkedin.jobs.saved.get',
        'linkedin.jobs.saved.save',
        'linkedin.jobs.saved.remove',
        'linkedin.jobs.saved_searches.list',
        'linkedin.jobs.saved_searches.get',
        'linkedin.jobs.saved_searches.save',
        'linkedin.jobs.saved_searches.remove',
      ]),
    );
    expect(
      result.capabilities.data.capabilities.find((capability) => capability.id === 'post.create.text')
        ?.availability,
    ).toBe('UNAVAILABLE');
    expect(
      result.capabilities.data.capabilities.find((capability) => capability.id === 'post.create.image')
        ?.availability,
    ).toBe('UNAVAILABLE');
    expect(
      result.capabilities.data.capabilities.find((capability) => capability.id === 'posts.search')
        ?.availability,
    ).toBe('UNAVAILABLE');
    expect(
      result.capabilities.data.capabilities.find((capability) => capability.id === 'jobs.search')
        ?.availability,
    ).toBe('UNAVAILABLE');
    expect(result.analysisIsError).not.toBe(true);
    expect(result.comparisonIsError).not.toBe(true);
    expect(result.capabilities.data.capabilities.find((c) => c.id === 'jobs.analyze')?.availability).toBe(
      'AVAILABLE',
    );
    expect(result.capabilities.data.capabilities.find((c) => c.id === 'jobs.compare')?.availability).toBe(
      'AVAILABLE',
    );
  });
});

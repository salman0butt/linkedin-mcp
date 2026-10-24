import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const serverPackage = '@linkedin-mcp/server';
const builtEntry = resolve(process.cwd(), 'apps/server/dist/stdio.js');

const savedClientScript = `
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolve } from 'node:path';
const client = new Client({ name: 'linkedin-saved-stdio-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(process.cwd(), 'dist/stdio.js')], env: process.env });
try {
  await client.connect(transport);
  const job = {
    id: 'job-1', title: 'TypeScript engineer', companyName: 'Example Company',
    source: { id: 'sample', provider: 'EXTERNAL_DISCOVERY', name: 'Sample', retrievedAt: '2026-10-23T10:00:00.000Z' },
    postingDate: { state: 'unknown' },
  };
  const save = await client.callTool({ name: 'linkedin.jobs.saved.save', arguments: { job } });
  const jobs = await client.callTool({ name: 'linkedin.jobs.saved.list', arguments: {} });
  const searchSave = await client.callTool({ name: 'linkedin.jobs.saved_searches.save', arguments: { query: { keywords: 'TypeScript' } } });
  const searches = await client.callTool({ name: 'linkedin.jobs.saved_searches.list', arguments: {} });
  process.stdout.write(JSON.stringify({
    save: save.structuredContent, saveError: save.isError,
    jobs: jobs.structuredContent, jobsError: jobs.isError,
    searchSave: searchSave.structuredContent, searchError: searchSave.isError,
    searches: searches.structuredContent, searchesError: searches.isError,
  }));
} finally { await client.close(); }
`;

const clientScript = `
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolve } from 'node:path';

const client = new Client({ name: 'linkedin-mcp-stdio-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(process.cwd(), 'dist/stdio.js')],
});

try {
  await client.connect(transport);
  const health = await client.callTool({ name: 'linkedin.health', arguments: {} });
  const authStatus = await client.callTool({ name: 'linkedin.auth.status', arguments: {} });
  const { tools } = await client.listTools();
  const preview = await client.callTool({ name: 'linkedin.post.preview.text', arguments: { text: 'Smoke preview' } });
  const previewData = preview.structuredContent.data;
  const approval = await client.callTool({ name: 'linkedin.post.approve.text', arguments: {
    payload: previewData.payload, payloadHash: previewData.payloadHash, approved: true,
  } });
  const publish = await client.callTool({ name: 'linkedin.post.create.text', arguments: {
    payload: previewData.payload, idempotencyKey: 'stdio-smoke-key',
  } });
  const mediaPreview = await client.callTool({
    name: 'linkedin.post.preview.image',
    arguments: {
      text: 'Smoke media preview',
      image: { sourcePath: 'missing.png', altText: 'Missing smoke image' },
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
}
`;

function callBuiltServer(): unknown {
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

describe('built stdio server', () => {
  it('persists opt-in local saved jobs and searches across real STDIO process restarts', async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'linkedin-mcp-stdio-saved-')));
    const filePath = join(directory, 'saved.json');
    try {
      const env = {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([key]) => !key.startsWith('LINKEDIN_MCP_')),
        ),
        LINKEDIN_MCP_JOB_SAVED_PATH: filePath,
      };
      const run = () =>
        JSON.parse(
          execFileSync(
            'pnpm',
            ['--filter', serverPackage, 'exec', 'node', '--input-type=module', '--eval', savedClientScript],
            { cwd: process.cwd(), encoding: 'utf8', env },
          ),
        ) as {
          save: { status: string; data: { key: string; savedAt: string } };
          saveError?: boolean;
          jobs: { status: string; data: Array<{ key: string }> };
          jobsError?: boolean;
          searchSave: { status: string; data: { id: string } };
          searchError?: boolean;
          searches: { status: string; data: Array<{ id: string }> };
          searchesError?: boolean;
        };
      const first = run();
      const reopened = run();
      expect(first.save.status).toBe('succeeded');
      expect(first.jobs.status).toBe('succeeded');
      expect(first.searchSave.status).toBe('succeeded');
      expect(first.searches.status).toBe('succeeded');
      expect(first.jobs.data).toHaveLength(1);
      expect(first.searches.data).toHaveLength(1);
      expect(reopened.jobs.data).toEqual(first.jobs.data);
      expect(reopened.searches.data).toEqual(first.searches.data);
      expect(reopened.save.data.savedAt).toBe(first.save.data.savedAt);
      expect(reopened.saveError).not.toBe(true);
      expect(reopened.jobsError).not.toBe(true);
      expect(reopened.searchError).not.toBe(true);
      expect(reopened.searchesError).not.toBe(true);
      expect((await readFile(filePath, 'utf8')).includes('job-1')).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
  it('exposes foundation, publishing, engagement and unavailable post search through real stdio', () => {
    const result = callBuiltServer() as {
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
        data: { provider: 'OFFICIAL_API', payload: { commentary: 'Smoke preview' } },
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

  it('does not write startup logs or other non-protocol text to stdout', () => {
    const result = spawnSync(process.execPath, [builtEntry], {
      cwd: process.cwd(),
      encoding: 'utf8',
      input: '',
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('LINKEDIN_MCP_')),
      ),
    });

    expect(result.stdout).toBe('');
  });
});

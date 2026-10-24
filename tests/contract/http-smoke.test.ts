import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  const articleDraft = {
    title: 'HTTP article smoke', topic: 'Secure local drafts', audience: 'Developers',
    goal: 'Demonstrate review-only authoring.',
    research: { brief: 'Author input', sources: [{ id: 's1', title: 'Unverified reference', url: 'https://example.org/research' }] },
    outline: [{ id: 'o1', heading: 'Main ideas' }],
    blocks: [{ id: 'b1', kind: 'paragraph', text: '<img src=x onerror=alert(1)>', sourceIds: ['s1'] }],
    seo: { description: 'HTTP draft review' },
    companionPost: 'A suggested companion',
    review: { state: 'draft' },
  };
  const promptNames = (await client.listPrompts()).prompts.map((entry) => entry.name);
  const promptContents = await Promise.all([
    'linkedin.article.research_brief', 'linkedin.article.outline', 'linkedin.article.review',
  ].map(async (name) => JSON.stringify((await client.getPrompt({
    name, arguments: { topic: 'HTTP article research topic' },
  })).messages)));
  const articleValidation = await client.callTool({ name: 'linkedin.article.draft.validate', arguments: { draft: articleDraft } });
  const articlePreview = await client.callTool({ name: 'linkedin.article.draft.preview', arguments: { draft: articleDraft } });
  const articleCompanion = await client.callTool({ name: 'linkedin.article.draft.companion', arguments: { draft: articleDraft } });
  const privateList = await client.callTool({ name: 'linkedin.article.projects.list', arguments: {} });
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
    promptNames, promptContents,
    articleValidation: articleValidation.structuredContent,
    articleValidationIsError: articleValidation.isError,
    articlePreview: articlePreview.structuredContent,
    articlePreviewIsError: articlePreview.isError,
    articleCompanion: articleCompanion.structuredContent,
    articleCompanionIsError: articleCompanion.isError,
    privateList: privateList.structuredContent,
    privateListIsError: privateList.isError,
  }));
} finally {
  await client.close();
  await server.close();
}
`;

const injectedRuntimeScript = `
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpServer } from './dist/http.js';
import { createLinkedInRuntime } from './dist/runtime.js';
import { parseConfig } from './dist/config.js';

// This intentionally supplies a STDIO runtime containing an articleStore to
// the real loopback HTTP server, exercising the transport boundary itself.
const runtime = createLinkedInRuntime({ ...parseConfig(), transport: 'stdio' });
if (!runtime.articleStore) throw new Error('Missing configured injected STDIO articleStore');
const draft = {
  title: 'SENSITIVE PRIVATE HTTP DRAFT',
  topic: 'Local private drafts', audience: 'Developers', goal: 'Never leak HTTP storage',
  research: { brief: '', sources: [] },
  outline: [], blocks: [], review: { state: 'draft' },
};
const seeded = await runtime.articleStore.create({
  draft, idempotencyKey: 'seeded-before-http-requests',
});
const before = await runtime.articleStore.list();
const server = await createHttpServer({ host: '127.0.0.1', port: 0, runtime });
const client = new Client({ name: 'linkedin-http-injected-article-store', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(
  new URL('http://' + server.address.host + ':' + server.address.port + '/mcp'),
);
try {
  await client.connect(transport);
  const id = seeded.id;
  const requests = [
    { name: 'linkedin.article.projects.create', arguments: { draft, idempotencyKey: 'injected-http-store-test' } },
    { name: 'linkedin.article.projects.list', arguments: {} },
    { name: 'linkedin.article.projects.get', arguments: { id } },
    { name: 'linkedin.article.projects.update', arguments: { id, expectedRevision: 1, draft } },
    { name: 'linkedin.article.projects.remove', arguments: { id, expectedRevision: 1 } },
  ];
  const outcomes = [];
  for (const request of requests) {
    const result = await client.callTool(request);
    outcomes.push({ name: request.name, isError: result.isError, response: result.structuredContent });
  }
  const after = await runtime.articleStore.list();
  process.stdout.write(JSON.stringify({ outcomes, before, after }));
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
  it('rejects all private article project operations over actual HTTP even with an injected STDIO runtime/store', async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'linkedin-mcp-http-article-')));
    const filePath = join(directory, 'private', 'articles.json');
    try {
      const env = {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([key]) => !key.startsWith('LINKEDIN_MCP_')),
        ),
        LINKEDIN_MCP_ARTICLE_STORE_PATH: filePath,
      };
      const outcome = JSON.parse(
        execFileSync(
          'pnpm',
          ['--filter', serverPackage, 'exec', 'node', '--input-type=module', '--eval', injectedRuntimeScript],
          { cwd: process.cwd(), encoding: 'utf8', env },
        ),
      ) as {
        before: Array<{ id: string; title: string; revision: number }>;
        after: Array<{ id: string; title: string; revision: number }>;
        outcomes: Array<{
          name: string;
          isError?: boolean;
          response: { status: string; error: { code: string }; data?: unknown };
        }>;
      };
      expect(outcome.outcomes.map((item) => item.name)).toEqual([
        'linkedin.article.projects.create',
        'linkedin.article.projects.list',
        'linkedin.article.projects.get',
        'linkedin.article.projects.update',
        'linkedin.article.projects.remove',
      ]);
      for (const operation of outcome.outcomes) {
        expect(operation.isError).toBe(true);
        expect(operation.response).toMatchObject({
          status: 'unsupported',
          error: { code: 'local_store_not_available' },
        });
        expect(operation.response.data).toBeUndefined();
      }
      expect(JSON.stringify(outcome.outcomes)).not.toContain('SENSITIVE PRIVATE HTTP DRAFT');
      expect(outcome.before).toHaveLength(1);
      expect(outcome.after).toEqual(outcome.before);
      expect(outcome.after[0]).toMatchObject({
        title: 'SENSITIVE PRIVATE HTTP DRAFT',
        revision: 1,
      });
      expect(await readFile(filePath, 'utf8')).toContain('SENSITIVE PRIVATE HTTP DRAFT');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

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
      promptNames: string[];
      promptContents: string[];
      articleValidation: { status: string; provider: { type: string }; data: { readyForReview: boolean } };
      articleValidationIsError?: boolean;
      articlePreview: {
        status: string;
        provider: { type: string };
        data: { publicationStatus: string; sourceVerification: string; markdown: string };
      };
      articlePreviewIsError?: boolean;
      articleCompanion: {
        status: string;
        provider: { type: string };
        data: { status: string; text: string };
      };
      articleCompanionIsError?: boolean;
      privateList: { status: string; error: { code: string } };
      privateListIsError?: boolean;
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
      toolCount: 49,
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
    expect(result.toolNames).toEqual(
      expect.arrayContaining([
        'linkedin.article.draft.validate',
        'linkedin.article.draft.preview',
        'linkedin.article.draft.companion',
        'linkedin.article.projects.create',
        'linkedin.article.projects.list',
        'linkedin.article.projects.get',
      ]),
    );
    expect(result.promptNames).toEqual(
      expect.arrayContaining([
        'linkedin.article.research_brief',
        'linkedin.article.outline',
        'linkedin.article.review',
      ]),
    );
    expect(result.promptContents).toHaveLength(3);
    for (const prompt of result.promptContents) {
      expect(prompt).toContain('HTTP article research topic');
      expect(prompt).toMatch(/unverified|not verified|do not (?:assume|invent|claim)/i);
      expect(prompt).toMatch(/do not publish|not publish/i);
    }
    expect(result.articleValidation).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY' },
      data: { readyForReview: true },
    });
    expect(result.articlePreview).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY' },
      data: { publicationStatus: 'not_published', sourceVerification: 'user_supplied_unverified' },
    });
    expect(result.articlePreview.data.markdown).toContain('&lt;img');
    expect(result.articlePreview.data.markdown).not.toContain('<img');
    expect(result.articleCompanion).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY' },
      data: { status: 'draft_only' },
    });
    expect(result.articleCompanion.data.text).toContain('HTTP article smoke');
    expect(result.privateList).toMatchObject({
      status: 'unsupported',
      error: { code: 'local_store_not_available' },
    });
    expect(result.articleValidationIsError).not.toBe(true);
    expect(result.articlePreviewIsError).not.toBe(true);
    expect(result.articleCompanionIsError).not.toBe(true);
    expect(result.privateListIsError).toBe(true);
  });
});

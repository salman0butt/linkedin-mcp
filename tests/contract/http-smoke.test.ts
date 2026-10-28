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
  const research = await client.callTool({ name: 'linkedin.research.analyze', arguments: {
    topic: 'Agentic systems', focusTerms: ['RAG'],
    sources: [
      { id: 'one', title: 'First caller note', url: 'https://research.example.org/one', body: '🤖 Agentic systems use RAG.' },
      { id: 'two', title: 'Second caller note', url: 'https://research.example.org/two', body: 'No matching terms in this note.' },
    ],
  } });
  const themeGrouping = await client.callTool({ name: 'linkedin.research.group_themes', arguments: {
    topic: 'Agentic systems',
    themes: [
      { id: 'agents', label: 'Caller-defined automation theme', phrases: ['Agentic systems'] },
      { id: 'retrieval', label: 'Caller-defined retrieval theme', phrases: ['RAG'] },
    ],
    sources: [
      { id: 'one', title: 'First caller note', url: 'https://research.example.org/one', body: '🤖 Agentic systems use RAG.' },
      { id: 'two', title: 'Second caller note', url: 'https://research.example.org/two', body: 'No matching terms in this note.' },
    ],
  } });
  const referenceIndex = await client.callTool({ name: 'linkedin.research.index_references', arguments: {
    sources: [
      { id: 'alpha', title: 'Caller A', url: 'https://RESEARCH.example.org/report', body: 'PRIVATE FIRST INDEX BODY' },
      { id: 'beta', title: 'Caller B', url: 'https://research.example.org/report', body: 'PRIVATE SECOND INDEX BODY' },
      { id: 'gamma', title: 'Caller C', url: 'https://research.example.org/other', body: 'PRIVATE THIRD INDEX BODY' },
    ],
  } });
  const cohortComparison = await client.callTool({ name: 'linkedin.research.compare_cohorts', arguments: {
    topic: 'Unverified comparison', focusTerms: ['RAG', 'SQL'],
    sources: [
      { id: 'cohort-a', title: 'A note', url: 'https://research.example.org/cohort-a', body: '🤖 RAG in group A. PRIVATE UNMATCHED CONTENT' },
      { id: 'cohort-b', title: 'B note', url: 'https://research.example.org/cohort-b', body: 'SQL in group B.' },
      { id: 'cohort-u', title: 'Unmatched', url: 'https://research.example.org/cohort-u', body: 'RAG SQL outside groups.' },
    ],
    cohorts: [
      { id: 'first', label: 'Caller first', sourceIds: ['cohort-a'] },
      { id: 'second', label: 'Caller second', sourceIds: ['cohort-b'] },
    ],
    unmatchedSourceIds: ['cohort-u'],
  } });
  const repurposingEvidence = await client.callTool({ name: 'linkedin.research.prepare_repurposing', arguments: {
    topic: 'Selected unverified evidence',
    sources: [
      { id: 'curated-a', title: 'Caller source A', url: 'https://RESEARCH.example.org/curated-a', body: '🤖 RAG\tworks. PRIVATE_UNSELECTED_BODY' },
      { id: 'curated-b', title: 'Caller source B', url: 'https://research.example.org/curated-b', body: 'SQL queues require validation.' },
      { id: 'curated-u', title: 'PRIVATE_UNSELECTED_TITLE', url: 'https://research.example.org/PRIVATE_UNSELECTED_URL', body: 'PRIVATE_UNSELECTED_ALL' },
    ],
    targets: [
      { id: 'post', label: 'Post evidence', format: 'post', selections: [{sourceId:'curated-a', start:3, end:12}] },
      { id: 'article', label: 'Article evidence', format: 'article', selections: [{sourceId:'curated-b', start:0, end:3}] },
    ],
  } });
  const calendarPreview = await client.callTool({ name: 'linkedin.calendar.preview', arguments: {
    referenceUtc: '2026-10-27T10:00:00.000Z',
    items: [
      { id: 'second', label: 'Image later', kind: 'image_post', plannedAtUtc: '2026-10-29T12:00:00.000Z' },
      { id: 'first', label: 'Text first', kind: 'text_post', plannedAtUtc: '2026-10-28T12:00:00.000Z' },
      { id: 'manual', label: 'Article handoff', kind: 'manual_article_handoff', plannedAtUtc: '2026-10-28T12:00:00.000Z' },
    ],
  } });
  const rawResearchResponse = await fetch(
    'http://' + server.address.host + ':' + server.address.port + '/mcp',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'm10-research-wire', method: 'tools/call',
        params: { name: 'linkedin.research.analyze', arguments: {
          topic: 'Bounded evidence',
          sources: Array.from({ length: 4 }, (_, i) => ({
            id: 'raw-' + i, title: 'Original note',
            url: 'https://research.example.org/raw-' + i,
            body: 'Bounded evidence ' + 'A'.repeat(49000) + i,
          })),
        } },
      }),
    },
  );
  const rawResearchWire = await rawResearchResponse.text();
  const rawResearchEvent = rawResearchWire.split(String.fromCharCode(10)).find((line) => line.startsWith('data: '));
  const rawResearchResult = rawResearchEvent ? JSON.parse(rawResearchEvent.slice(6)) : null;
  const rawThemeResponse = await fetch(
    'http://' + server.address.host + ':' + server.address.port + '/mcp',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'm10-themes-wire', method: 'tools/call',
        params: { name: 'linkedin.research.group_themes', arguments: {
          topic: 'Bounded evidence',
          themes: [{ id: 'theme', label: 'Caller-defined bound', phrases: ['Bounded evidence'] }],
          sources: Array.from({ length: 4 }, (_, i) => ({
            id: 'raw-' + i, title: 'Original note',
            url: 'https://research.example.org/theme-' + i,
            body: 'Bounded evidence ' + 'A'.repeat(49000) + i,
          })),
        } },
      }),
    },
  );
  const rawThemeWire = await rawThemeResponse.text();
  const rawThemeEvent = rawThemeWire.split(String.fromCharCode(10)).find((line) => line.startsWith('data: '));
  const rawThemeResult = rawThemeEvent ? JSON.parse(rawThemeEvent.slice(6)) : null;
  const rawReferenceResponse = await fetch(
    'http://' + server.address.host + ':' + server.address.port + '/mcp',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'm10-references-wire', method: 'tools/call',
        params: { name: 'linkedin.research.index_references', arguments: {
          sources: Array.from({ length: 4 }, (_, i) => ({
            id: 'raw-' + i, title: 'Caller reference',
            url: i % 2 === 0 ? 'https://RESEARCH.example.org/same' : 'https://research.example.org/same',
            body: 'A'.repeat(49000) + i,
          })),
        } },
      }),
    },
  );
  const rawReferenceWire = await rawReferenceResponse.text();
  const rawReferenceEvent = rawReferenceWire.split(String.fromCharCode(10)).find((line) => line.startsWith('data: '));
  const rawReferenceResult = rawReferenceEvent ? JSON.parse(rawReferenceEvent.slice(6)) : null;
  const rawCohortResponse = await fetch(
    'http://' + server.address.host + ':' + server.address.port + '/mcp',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'm10-cohorts-wire', method: 'tools/call',
        params: { name: 'linkedin.research.compare_cohorts', arguments: {
          topic: 'Bounded evidence', focusTerms: ['Bounded evidence'],
          sources: Array.from({ length: 4 }, (_, i) => ({
            id: 'cohort-raw-' + i, title: 'Caller cohort note',
            url: 'https://research.example.org/cohort-raw-' + i,
            body: 'Bounded evidence ' + 'C'.repeat(49000) + i,
          })),
          cohorts: [
            { id: 'first', label: 'Caller first', sourceIds: ['cohort-raw-0','cohort-raw-1'] },
            { id: 'second', label: 'Caller second', sourceIds: ['cohort-raw-2','cohort-raw-3'] },
          ],
          unmatchedSourceIds: [],
        } },
      }),
    },
  );
  const rawCohortWire = await rawCohortResponse.text();
  const rawCohortEvent = rawCohortWire.split(String.fromCharCode(10)).find((line) => line.startsWith('data: '));
  const rawCohortResult = rawCohortEvent ? JSON.parse(rawCohortEvent.slice(6)) : null;
  const rawRepurposingResponse = await fetch(
    'http://' + server.address.host + ':' + server.address.port + '/mcp',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'm10-repurpose-wire', method: 'tools/call',
        params: { name: 'linkedin.research.prepare_repurposing', arguments: {
          topic: 'Caller-curated huge corpus',
          sources: Array.from({ length: 4 }, (_, i) => ({
            id: 'r' + i, title: i % 2 ? 'PRIVATE_UNSELECTED_TITLE' : 'Selected reference',
            url: 'https://research.example.org/r' + i,
            body: 'EVIDENCE ' + 'X'.repeat(49000) + i,
          })),
          targets: [
            { id: 'post', label: 'Caller post evidence', format: 'post', selections: [{sourceId:'r0',start:0,end:8}] },
            { id: 'carousel', label: 'Caller carousel evidence', format: 'carousel', selections: [{sourceId:'r2',start:0,end:8}] },
          ],
        } },
      }),
    },
  );
  const rawRepurposingWire = await rawRepurposingResponse.text();
  const rawRepurposingEvent = rawRepurposingWire.split(String.fromCharCode(10)).find((line) => line.startsWith('data: '));
  const rawRepurposingResult = rawRepurposingEvent ? JSON.parse(rawRepurposingEvent.slice(6)) : null;
  const rawCalendarResponse = await fetch(
    'http://' + server.address.host + ':' + server.address.port + '/mcp',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'm11-calendar-wire', method: 'tools/call',
        params: { name: 'linkedin.calendar.preview', arguments: {
          referenceUtc: '2026-10-27T10:00:00.000Z',
          items: Array.from({length:20},(_,i)=>({
            id:'item-'+i, label:'🙂'.repeat(60),
            kind:'text_post', plannedAtUtc:'2026-10-28T12:00:00.000Z',
          })),
        } },
      }),
    },
  );
  const rawCalendarWire = await rawCalendarResponse.text();
  const rawCalendarEvent = rawCalendarWire.split(String.fromCharCode(10)).find((line) => line.startsWith('data: '));
  const rawCalendarResult = rawCalendarEvent ? JSON.parse(rawCalendarEvent.slice(6)) : null;
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
  const nativeArticleHandoff = await client.callTool({ name: 'linkedin.article.native.handoff', arguments: { draft: articleDraft } });
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
    research: research.structuredContent,
    researchIsError: research.isError,
    themeGrouping: themeGrouping.structuredContent,
    themeGroupingIsError: themeGrouping.isError,
    referenceIndex: referenceIndex.structuredContent,
    referenceIndexIsError: referenceIndex.isError,
    cohortComparison: cohortComparison.structuredContent,
    cohortComparisonIsError: cohortComparison.isError,
    repurposingEvidence: repurposingEvidence.structuredContent,
    repurposingEvidenceIsError: repurposingEvidence.isError,
    calendarPreview: calendarPreview.structuredContent,
    calendarPreviewIsError: calendarPreview.isError,
    rawCalendarStatus: rawCalendarResponse.status,
    rawCalendarWireBytes: Buffer.byteLength(rawCalendarWire,'utf8'),
    rawCalendarResult,
    rawRepurposingStatus: rawRepurposingResponse.status,
    rawRepurposingWireBytes: Buffer.byteLength(rawRepurposingWire,'utf8'),
    rawRepurposingResult,
    rawRepurposingBodyEcho: rawRepurposingWire.includes('XXXXXXXXXXXX'),
    rawRepurposingUnselectedEcho: rawRepurposingWire.includes('PRIVATE_UNSELECTED_TITLE'),
    rawCohortStatus: rawCohortResponse.status,
    rawCohortWireBytes: Buffer.byteLength(rawCohortWire, 'utf8'),
    rawCohortResult,
    rawCohortBodyEcho: rawCohortWire.includes('CCCCCCCCCCCC'),
    rawReferenceStatus: rawReferenceResponse.status,
    rawReferenceWireBytes: Buffer.byteLength(rawReferenceWire, 'utf8'),
    rawReferenceResult,
    rawReferenceBodyEcho: rawReferenceWire.includes('AAAAAAA'),
    rawThemeStatus: rawThemeResponse.status,
    rawThemeWireBytes: Buffer.byteLength(rawThemeWire, 'utf8'),
    rawThemeResult,
    rawThemeBodyEcho: rawThemeWire.includes('AAAAAAA'),
    rawResearchStatus: rawResearchResponse.status,
    rawResearchWireBytes: Buffer.byteLength(rawResearchWire, 'utf8'),
    rawResearchResult,
    rawResearchBodyEcho: rawResearchWire.includes('AAAAAAA'),
    promptNames, promptContents,
    articleValidation: articleValidation.structuredContent,
    articleValidationIsError: articleValidation.isError,
    articlePreview: articlePreview.structuredContent,
    articlePreviewIsError: articlePreview.isError,
    articleCompanion: articleCompanion.structuredContent,
    articleCompanionIsError: articleCompanion.isError,
    nativeArticleHandoff: nativeArticleHandoff.structuredContent,
    nativeArticleHandoffIsError: nativeArticleHandoff.isError,
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
      research: {
        status: string;
        provider: { type: string };
        data: {
          sourceTrust: string;
          termCoverage: Array<{
            term: string;
            evidence: Array<{ sourceId: string; quote: string; start: number; end: number }>;
          }>;
        };
      };
      researchIsError?: boolean;
      themeGrouping: {
        status: string;
        provider: { type: string };
        data: {
          themeOrigin: string;
          sourceTrust: string;
          themeGroups: Array<{
            id: string;
            sourceIds: string[];
            phrases: Array<{
              term: string;
              evidence: Array<{ sourceId: string; quote: string; start: number; end: number }>;
            }>;
          }>;
        };
      };
      themeGroupingIsError?: boolean;
      referenceIndex: {
        status: string;
        provider: { type: string };
        data: {
          kind: string;
          referenceOrigin: string;
          sourceTrust: string;
          repeatedUrlGroups: Array<{ url: string; sourceIds: string[] }>;
          singleUrlSourceIds: string[];
        };
      };
      referenceIndexIsError?: boolean;
      cohortComparison: {
        status: string;
        provider: { type: string };
        data: {
          kind: string;
          sourceTrust: string;
          verification: string;
          unmatchedSourceIds: string[];
          cohorts: Array<{
            id: string;
            sourceIds: string[];
            termObservations: Array<{
              term: string;
              state: string;
              evidence: Array<{ sourceId: string; quote: string; start: number; end: number }>;
            }>;
          }>;
        };
      };
      cohortComparisonIsError?: boolean;
      repurposingEvidence: {
        status: string;
        provider: { type: string };
        data: {
          kind: string;
          sourceTrust: string;
          verification: string;
          sourceSummaries: Array<{ id: string; url: string }>;
          targets: Array<{
            id: string;
            format: string;
            excerpts: Array<{ sourceId: string; quote: string; start: number; end: number }>;
          }>;
        };
      };
      repurposingEvidenceIsError?: boolean;
      calendarPreview: {
        status: string;
        provider: { type: string };
        data: {
          kind: string;
          persistence: string;
          execution: string;
          publication: string;
          days: Array<{ utcDate: string; items: Array<{ id: string; manualOnly: boolean }> }>;
          collisions: Array<{ plannedAtUtc: string; itemIds: string[] }>;
        };
      };
      calendarPreviewIsError?: boolean;
      rawCalendarStatus: number;
      rawCalendarWireBytes: number;
      rawCalendarResult: {
        result: { structuredContent: { status: string; data: { kind: string; collisions: unknown[] } } };
      };
      rawRepurposingStatus: number;
      rawRepurposingWireBytes: number;
      rawRepurposingResult: {
        result: { structuredContent: { status: string; data: { kind: string; targets: unknown[] } } };
      };
      rawRepurposingBodyEcho: boolean;
      rawRepurposingUnselectedEcho: boolean;
      rawCohortStatus: number;
      rawCohortWireBytes: number;
      rawCohortResult: {
        result: { structuredContent: { status: string; data: { kind: string; cohorts: unknown[] } } };
      };
      rawCohortBodyEcho: boolean;
      rawReferenceStatus: number;
      rawReferenceWireBytes: number;
      rawReferenceResult: {
        result: {
          structuredContent: {
            status: string;
            data: { kind: string; repeatedUrlGroups: Array<{ sourceIds: string[] }> };
          };
        };
      };
      rawReferenceBodyEcho: boolean;
      rawThemeStatus: number;
      rawThemeWireBytes: number;
      rawThemeResult: {
        result: { structuredContent: { status: string; data: { kind: string; themeOrigin: string } } };
      };
      rawThemeBodyEcho: boolean;
      rawResearchStatus: number;
      rawResearchWireBytes: number;
      rawResearchResult: { result: { structuredContent: { status: string; data: { sourceTrust: string } } } };
      rawResearchBodyEcho: boolean;
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
      nativeArticleHandoff: {
        status: string;
        data: { kind: string; publicationStatus: string; nativePublishAvailability: string };
      };
      nativeArticleHandoffIsError?: boolean;
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
      toolCount: 67,
      themeGrouping: {
        status: 'succeeded',
        provider: { type: 'LOCAL_ONLY' },
        data: {
          themeOrigin: 'caller_defined',
          sourceTrust: 'caller_supplied_unverified',
          themeGroups: [
            { id: 'agents', sourceIds: ['one'] },
            { id: 'retrieval', sourceIds: ['one'] },
          ],
        },
      },
      research: {
        status: 'succeeded',
        provider: { type: 'LOCAL_ONLY' },
        data: {
          sourceTrust: 'caller_supplied_unverified',
          termCoverage: [{ term: 'Agentic systems' }, { term: 'RAG' }],
        },
      },
      nativeArticleHandoff: {
        status: 'succeeded',
        data: {
          kind: 'manual_editor_handoff',
          publicationStatus: 'not_published',
          nativePublishAvailability: 'UNAVAILABLE',
        },
      },
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
    expect(result.researchIsError).not.toBe(true);
    expect(result.themeGroupingIsError).not.toBe(true);
    expect(result.referenceIndexIsError).not.toBe(true);
    expect(result.cohortComparisonIsError).not.toBe(true);
    expect(result.repurposingEvidenceIsError).not.toBe(true);
    expect(result.toolNames).toContain('linkedin.research.prepare_repurposing');
    expect(result.toolNames).toContain('linkedin.calendar.preview');
    for (const action of ['create', 'update', 'get', 'list', 'remove']) {
      expect(result.toolNames).toContain(`linkedin.calendar.plans.${action}`);
    }
    expect(result.calendarPreviewIsError).not.toBe(true);
    expect(result.calendarPreview).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY' },
      data: {
        kind: 'local_content_calendar_preview',
        persistence: 'none',
        execution: 'not_queued',
        publication: 'not_attempted',
        days: [
          {
            utcDate: '2026-10-28',
            items: [
              { id: 'first', manualOnly: false },
              { id: 'manual', manualOnly: true },
            ],
          },
          { utcDate: '2026-10-29', items: [{ id: 'second', manualOnly: false }] },
        ],
        collisions: [{ plannedAtUtc: '2026-10-28T12:00:00.000Z', itemIds: ['first', 'manual'] }],
      },
    });
    expect(result.rawCalendarStatus).toBe(200);
    expect(result.rawCalendarWireBytes).toBeLessThanOrEqual(256 * 1024);
    expect(result.rawCalendarResult).toMatchObject({
      result: {
        structuredContent: { status: 'succeeded', data: { kind: 'local_content_calendar_preview' } },
      },
    });
    expect(result.repurposingEvidence).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY' },
      data: {
        kind: 'local_caller_curated_repurposing_evidence',
        sourceTrust: 'caller_supplied_unverified',
        verification: 'not_performed',
        sourceSummaries: [
          { id: 'curated-a', url: 'https://research.example.org/curated-a' },
          { id: 'curated-b' },
        ],
        targets: [
          {
            id: 'post',
            format: 'post',
            excerpts: [{ sourceId: 'curated-a', start: 3, end: 12, quote: 'RAG\tworks' }],
          },
          {
            id: 'article',
            format: 'article',
            excerpts: [{ sourceId: 'curated-b', start: 0, end: 3, quote: 'SQL' }],
          },
        ],
      },
    });
    for (const canary of [
      'PRIVATE_UNSELECTED_BODY',
      'PRIVATE_UNSELECTED_TITLE',
      'PRIVATE_UNSELECTED_URL',
      'PRIVATE_UNSELECTED_ALL',
    ])
      expect(JSON.stringify(result.repurposingEvidence)).not.toContain(canary);
    expect(result.rawRepurposingStatus).toBe(200);
    expect(result.rawRepurposingWireBytes).toBeLessThanOrEqual(256 * 1024);
    expect(result.rawRepurposingBodyEcho).toBe(false);
    expect(result.rawRepurposingUnselectedEcho).toBe(false);
    expect(result.rawRepurposingResult).toMatchObject({
      result: {
        structuredContent: {
          status: 'succeeded',
          data: { kind: 'local_caller_curated_repurposing_evidence' },
        },
      },
    });
    expect(result.toolNames).toContain('linkedin.research.compare_cohorts');
    expect(result.cohortComparison).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY' },
      data: {
        kind: 'local_caller_defined_corpus_comparison',
        sourceTrust: 'caller_supplied_unverified',
        verification: 'not_performed',
        unmatchedSourceIds: ['cohort-u'],
        cohorts: [
          {
            id: 'first',
            termObservations: [
              {
                term: 'RAG',
                state: 'observed_in_supplied_cohort',
                evidence: [expect.objectContaining({ sourceId: 'cohort-a', quote: 'RAG', start: 3, end: 6 })],
              },
              { term: 'SQL', state: 'not_observed_in_supplied_cohort', evidence: [] },
            ],
          },
          {
            id: 'second',
            termObservations: [
              { term: 'RAG', state: 'not_observed_in_supplied_cohort', evidence: [] },
              {
                term: 'SQL',
                state: 'observed_in_supplied_cohort',
                evidence: [expect.objectContaining({ sourceId: 'cohort-b', quote: 'SQL' })],
              },
            ],
          },
        ],
      },
    });
    expect(result.rawCohortStatus).toBe(200);
    expect(result.rawCohortWireBytes).toBeLessThanOrEqual(256 * 1024);
    expect(result.rawCohortBodyEcho).toBe(false);
    expect(result.rawCohortResult).toMatchObject({
      result: {
        structuredContent: {
          status: 'succeeded',
          data: { kind: 'local_caller_defined_corpus_comparison' },
        },
      },
    });
    expect(result.toolNames).toContain('linkedin.research.index_references');
    expect(result.referenceIndex).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY' },
      data: {
        kind: 'local_reference_register',
        referenceOrigin: 'caller_supplied',
        sourceTrust: 'caller_supplied_unverified',
        repeatedUrlGroups: [{ url: 'https://research.example.org/report', sourceIds: ['alpha', 'beta'] }],
        singleUrlSourceIds: ['gamma'],
      },
    });
    expect(JSON.stringify(result.referenceIndex)).not.toContain('PRIVATE FIRST INDEX BODY');
    expect(result.rawReferenceStatus).toBe(200);
    expect(result.rawReferenceWireBytes).toBeLessThanOrEqual(256 * 1024);
    expect(result.rawReferenceBodyEcho).toBe(false);
    expect(result.rawReferenceResult).toMatchObject({
      id: 'm10-references-wire',
      result: {
        structuredContent: {
          status: 'succeeded',
          data: {
            kind: 'local_reference_register',
            repeatedUrlGroups: [{ sourceIds: ['raw-0', 'raw-1', 'raw-2', 'raw-3'] }],
          },
        },
      },
    });
    expect(result.toolNames).toContain('linkedin.research.group_themes');
    expect(result.themeGrouping.data.themeGroups[0]?.phrases[0]?.evidence).toEqual([
      expect.objectContaining({ sourceId: 'one', quote: 'Agentic systems', start: 3, end: 18 }),
    ]);
    expect(result.rawThemeStatus).toBe(200);
    expect(result.rawThemeWireBytes).toBeLessThanOrEqual(256 * 1024);
    expect(result.rawThemeBodyEcho).toBe(false);
    expect(result.rawThemeResult).toMatchObject({
      result: {
        structuredContent: {
          status: 'succeeded',
          data: { kind: 'local_caller_defined_theme_grouping', themeOrigin: 'caller_defined' },
        },
      },
    });
    expect(result.research.data.termCoverage[0]?.evidence).toEqual([
      expect.objectContaining({ sourceId: 'one', quote: 'Agentic systems', start: 3, end: 18 }),
    ]);
    expect(result.rawResearchStatus).toBe(200);
    expect(result.rawResearchWireBytes).toBeLessThanOrEqual(256 * 1024);
    expect(result.rawResearchBodyEcho).toBe(false);
    expect(result.rawResearchResult).toMatchObject({
      result: {
        structuredContent: {
          status: 'succeeded',
          data: { sourceTrust: 'caller_supplied_unverified' },
        },
      },
    });
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
        'linkedin.article.native.handoff',
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
  }, 30_000);
});

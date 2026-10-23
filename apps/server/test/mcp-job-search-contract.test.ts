import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';
import {
  createJobSearchService,
  JobProviderError,
  type JobProvider,
} from '../src/jobs/job-search-service.js';

const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];
const now = () => new Date('2026-10-23T10:00:00Z');

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

function provider(id: string, search: JobProvider['search'], extra: Partial<JobProvider> = {}): JobProvider {
  return {
    providerId: id,
    providerType: 'EXTERNAL_DISCOVERY',
    name: `Source ${id}`,
    supportsSearch: true,
    supportsDetails: false,
    search,
    ...extra,
  };
}

function success(id: string) {
  return Promise.resolve({
    jobs: [
      {
        id,
        title: 'TypeScript engineer',
        companyName: 'Sample company',
        source: { id: 'forged', provider: 'OFFICIAL_API' },
      },
    ],
    coverage: {
      complete: true,
      hasMore: false,
      honoredFilters: ['keywords'] as const,
      honoredSort: 'recent' as const,
      verifiedDateCoverage: false,
    },
  });
}

async function clientFor(providers: readonly JobProvider[] = []) {
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      jobs: createJobSearchService({ providers, now }),
      now,
      createRequestId: () => 'job-contract-test',
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm06-job-contract', version: '1.0.0' });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  return client;
}

describe('M06.4 strict job discovery MCP contract', () => {
  it('registers jobs search and get, with honest default unavailability', async () => {
    const client = await clientFor();
    const { tools } = await client.listTools();
    const search = tools.find((tool) => tool.name === 'linkedin.jobs.search');
    const details = tools.find((tool) => tool.name === 'linkedin.jobs.get');
    expect(search?.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(details?.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(JSON.stringify(search?.inputSchema)).not.toMatch(/token|endpoint|baseUrl|providerId|actor/i);
    const searchResult = await client.callTool({
      name: 'linkedin.jobs.search',
      arguments: { keywords: 'TypeScript' },
    });
    expect(searchResult.isError).toBe(true);
    expect(searchResult.structuredContent).toMatchObject({
      status: 'unsupported',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      data: { status: 'unavailable', providerOutcomes: [] },
    });
    expect((searchResult.structuredContent as { data: unknown }).data).not.toHaveProperty('jobs');
    const detailResult = await client.callTool({
      name: 'linkedin.jobs.get',
      arguments: { sourceId: 'absent', jobId: '123' },
    });
    expect(detailResult.isError).toBe(true);
    expect(detailResult.structuredContent).toMatchObject({ status: 'unsupported' });
    const caps = await client.callTool({ name: 'linkedin.capabilities', arguments: {} });
    const capabilities = (
      caps.structuredContent as {
        data: { capabilities: Array<{ id: string; status: string; availability: string }> };
      }
    ).data.capabilities;
    expect(capabilities.find((c) => c.id === 'jobs.search')).toMatchObject({
      status: 'ACTIVE',
      availability: 'UNAVAILABLE',
    });
  });

  it('rejects invalid canonical queries and caller overrides without a provider side effect', async () => {
    const search = vi.fn(() => success('a'));
    const client = await clientFor([provider('a', search)]);
    for (const args of [
      { keywords: 'TypeScript', accessToken: 'secret' },
      { keywords: 'TypeScript', providerId: 'a' },
      { keywords: 'TypeScript', endpoint: 'http://localhost/' },
      { keywords: '  ' },
      { keywords: 'TypeScript', postedSince: '2026-10-22' },
      { keywords: 'TypeScript', limit: 51 },
    ]) {
      const result = await client.callTool({ name: 'linkedin.jobs.search', arguments: args });
      expect(result.isError).toBe(true);
      if ('postedSince' in args) {
        expect(result.structuredContent).toMatchObject({
          status: 'failed',
          error: { code: 'invalid_input' },
        });
      }
    }
    expect(search).not.toHaveBeenCalled();
  });

  it('keeps configured source identities and partial provider failures separate', async () => {
    const client = await clientFor([
      provider('source-a', () => success('shared')),
      provider('source-b', () => Promise.reject(new JobProviderError('rate_limited'))),
    ]);
    const result = await client.callTool({
      name: 'linkedin.jobs.search',
      arguments: { keywords: 'TypeScript' },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'partial',
      data: {
        status: 'partial',
        jobs: [{ id: 'shared', source: { id: 'source-a', provider: 'EXTERNAL_DISCOVERY' } }],
        providerOutcomes: [{ state: 'success' }, { state: 'rate_limited' }],
      },
    });
    expect(JSON.stringify(result)).not.toContain('accessToken');
  });

  it('never returns unapproved provider coverage fields or secret-bearing metadata', async () => {
    const client = await clientFor([
      provider('a', () =>
        Promise.resolve({
          jobs: [{ id: 'a1', title: 'TypeScript engineer', companyName: 'Sample company' }],
          coverage: {
            complete: false,
            hasMore: true,
            honoredFilters: ['keywords'],
            honoredSort: 'recent',
            verifiedDateCoverage: false,
            accessToken: 'never-expose-provider-secret',
          },
        }),
      ),
    ]);
    const result = await client.callTool({
      name: 'linkedin.jobs.search',
      arguments: { keywords: 'TypeScript' },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ status: 'partial', data: { jobs: [{ id: 'a1' }] } });
    expect(JSON.stringify(result)).not.toContain('never-expose-provider-secret');
    expect(JSON.stringify(result)).not.toContain('accessToken');
  });

  it('routes details by trusted source ID, rejects URL injection, and never contacts a different provider', async () => {
    const detailsA = vi.fn((id: string) =>
      Promise.resolve({ id, title: 'TypeScript engineer', companyName: 'A' }),
    );
    const detailsB = vi.fn((id: string) =>
      Promise.resolve({ id, title: 'TypeScript engineer', companyName: 'B' }),
    );
    const client = await clientFor([
      provider('a', () => success('123'), { supportsDetails: true, getDetails: detailsA }),
      provider('b', () => success('123'), { supportsDetails: true, getDetails: detailsB }),
    ]);
    const result = await client.callTool({
      name: 'linkedin.jobs.get',
      arguments: { sourceId: 'b', jobId: '123' },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: { status: 'available', job: { id: '123', companyName: 'B', source: { id: 'b' } } },
    });
    expect(detailsA).not.toHaveBeenCalled();
    expect(detailsB).toHaveBeenCalledTimes(1);
    const invalid = await client.callTool({
      name: 'linkedin.jobs.get',
      arguments: { sourceId: 'a', jobId: '123', url: 'https://localhost/' },
    });
    expect(invalid.isError).toBe(true);
    expect(detailsA).not.toHaveBeenCalled();
  });
});

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';
import { parseConfig } from '../src/config.js';
import { createHttpServer } from '../src/http.js';
import { createLinkedInRuntime } from '../src/runtime.js';

const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await Promise.all(handlers.splice(0).map((h) => h.close()));
});

const sample = {
  id: 'job-1',
  title: 'TypeScript engineer',
  companyName: 'Example Company',
  source: {
    id: 'trusted-a',
    name: 'Authorized provider',
    provider: 'EXTERNAL_DISCOVERY',
    retrievedAt: '2026-10-23T10:00:00.000Z',
  },
  postingDate: { state: 'unknown' },
};
const query = { keywords: 'TypeScript' };

function mockStore() {
  const savedJob = {
    key: JSON.stringify(['trusted-a', 'job-1']),
    savedAt: '2026-10-23T10:00:00.000Z',
    job: sample,
  };
  const savedSearch = {
    id: 'search-1',
    savedAt: '2026-10-23T10:00:00.000Z',
    query: { ...query, limit: 10, sort: 'recent' },
  };
  return {
    listJobs: vi.fn(() => Promise.resolve([savedJob])),
    getJob: vi.fn(() => Promise.resolve(savedJob)),
    saveJob: vi.fn(() => Promise.resolve(savedJob)),
    removeJob: vi.fn(() => Promise.resolve(true)),
    listSearches: vi.fn(() => Promise.resolve([savedSearch])),
    getSearch: vi.fn(() => Promise.resolve(savedSearch)),
    saveSearch: vi.fn(() => Promise.resolve(savedSearch)),
    removeSearch: vi.fn(() => Promise.resolve(true)),
  };
}

async function clientFor(jobStore: ReturnType<typeof mockStore> | undefined, transport: 'stdio' | 'http') {
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      ...(jobStore === undefined ? {} : { jobStore }),
      transport,
      now: () => new Date('2026-10-23T10:00:00.000Z'),
      createRequestId: () => 'saved-contract',
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm06-saved-contract', version: '1.0.0' });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  return client;
}

const names = [
  'linkedin.jobs.saved.list',
  'linkedin.jobs.saved.get',
  'linkedin.jobs.saved.save',
  'linkedin.jobs.saved.remove',
  'linkedin.jobs.saved_searches.list',
  'linkedin.jobs.saved_searches.get',
  'linkedin.jobs.saved_searches.save',
  'linkedin.jobs.saved_searches.remove',
];

describe('M06.5 private saved jobs and searches MCP ownership boundary', () => {
  it('registers eight local operations but stays unavailable when not configured', async () => {
    const client = await clientFor(undefined, 'stdio');
    const { tools } = await client.listTools();
    const capabilities = await client.callTool({ name: 'linkedin.capabilities', arguments: {} });
    const entries = (
      capabilities.structuredContent as {
        data: { capabilities: Array<{ id: string; status: string; availability: string }> };
      }
    ).data.capabilities;
    expect(entries.find((entry) => entry.id === 'jobs.saved')).toMatchObject({
      status: 'ACTIVE',
      availability: 'UNAVAILABLE',
    });
    for (const name of names) {
      expect(tools.map((t) => t.name)).toContain(name);
      const response = await client.callTool({
        name,
        arguments:
          name.endsWith('.get') || name.endsWith('.remove')
            ? name.includes('searches')
              ? { id: 'search-1' }
              : { sourceId: 'trusted-a', jobId: 'job-1' }
            : name.endsWith('.save')
              ? name.includes('searches')
                ? { query }
                : { job: sample }
              : {},
      });
      expect(response.isError).toBe(true);
      expect(response.structuredContent).toMatchObject({
        status: 'unsupported',
        provider: { type: 'LOCAL_ONLY' },
      });
    }
  });

  it('never reads or mutates a configured local store through HTTP', async () => {
    const store = mockStore();
    const client = await clientFor(store, 'http');
    for (const name of names) {
      const args = name.endsWith('.list')
        ? {}
        : name.endsWith('.save')
          ? name.includes('searches')
            ? { query }
            : { job: sample }
          : name.includes('searches')
            ? { id: 'search-1' }
            : { sourceId: 'trusted-a', jobId: 'job-1' };
      const answer = await client.callTool({ name, arguments: args });
      expect(answer.isError).toBe(true);
      expect(answer.structuredContent).toMatchObject({ status: 'unsupported' });
    }
    for (const method of Object.values(store)) expect(method).not.toHaveBeenCalled();
  });

  it('isolates two actual loopback HTTP clients even when a STDIO runtime contains a private store', async () => {
    const store = mockStore();
    const runtime = {
      ...createLinkedInRuntime(parseConfig({})),
      transport: 'stdio' as const,
      jobStore: store,
    };
    const server = await createHttpServer({ host: '127.0.0.1', port: 0, runtime });
    try {
      const clientsForServer = await Promise.all(
        ['A', 'B'].map(async (name) => {
          const client = new Client({ name: `m06-http-client-${name}`, version: '1.0.0' });
          clients.push(client);
          await client.connect(
            new StreamableHTTPClientTransport(
              new URL(`http://${server.address.host}:${server.address.port}/mcp`),
            ),
          );
          return client;
        }),
      );
      for (const client of clientsForServer) {
        const read = await client.callTool({ name: 'linkedin.jobs.saved.list', arguments: {} });
        const write = await client.callTool({ name: 'linkedin.jobs.saved.save', arguments: { job: sample } });
        expect(read.structuredContent).toMatchObject({ status: 'unsupported' });
        expect(write.structuredContent).toMatchObject({ status: 'unsupported' });
        expect(read.isError).toBe(true);
        expect(write.isError).toBe(true);
      }
      for (const method of Object.values(store)) expect(method).not.toHaveBeenCalled();
    } finally {
      await Promise.all(clients.splice(0).map((client) => client.close()));
      await server.close();
    }
  });

  it('performs explicit local stdio saves, lists, reads and removals without network effects', async () => {
    const store = mockStore();
    const client = await clientFor(store, 'stdio');
    const commands = [
      { name: names[2]!, arguments: { job: sample } },
      { name: names[0]!, arguments: {} },
      { name: names[1]!, arguments: { sourceId: 'trusted-a', jobId: 'job-1' } },
      { name: names[3]!, arguments: { sourceId: 'trusted-a', jobId: 'job-1' } },
      { name: names[6]!, arguments: { query } },
      { name: names[4]!, arguments: {} },
      { name: names[5]!, arguments: { id: 'search-1' } },
      { name: names[7]!, arguments: { id: 'search-1' } },
    ];
    for (const command of commands) {
      const response = await client.callTool(command);
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({
        status: 'succeeded',
        provider: { type: 'LOCAL_ONLY' },
      });
    }
    for (const method of Object.values(store)) expect(method).toHaveBeenCalledTimes(1);
  });

  it('rejects caller-selected paths, owners and tokens before touching the local store', async () => {
    const store = mockStore();
    const client = await clientFor(store, 'stdio');
    for (const args of [
      { job: sample, filePath: '/tmp/elsewhere' },
      { job: sample, owner: 'another-user' },
      { job: sample, accessToken: 'secret' },
    ]) {
      const result = await client.callTool({ name: 'linkedin.jobs.saved.save', arguments: args });
      expect(result.isError).toBe(true);
    }
    expect(store.saveJob).not.toHaveBeenCalled();
  });
});

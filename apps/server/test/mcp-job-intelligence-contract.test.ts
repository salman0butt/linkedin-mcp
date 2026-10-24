import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';

const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];

const job = (id = 'job-1', description = 'Must have TypeScript. Nice to have AWS.') => ({
  id,
  title: 'Senior TypeScript Developer',
  companyName: 'Sample Ltd',
  source: {
    provider: 'EXTERNAL_DISCOVERY',
    id: 'external-a',
    name: 'Impersonated Talent Partner',
    retrievedAt: '2026-10-24T09:00:00Z',
  },
  postingDate: { state: 'unknown' },
  description,
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

async function clientFor() {
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      now: () => new Date('2026-10-24T10:00:00Z'),
      createRequestId: () => 'm07-contract',
      transport: 'http',
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm07-test', version: '1.0.0' });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  return client;
}

describe('M07.6 read-only job intelligence MCP tools', () => {
  it('registers exactly named locally available tools and capabilities with no discovery provider', async () => {
    const client = await clientFor();
    const { tools } = await client.listTools();
    for (const name of ['linkedin.jobs.analyze', 'linkedin.jobs.compare']) {
      const tool = tools.find((t) => t.name === name);
      expect(tool?.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
      expect(JSON.stringify(tool?.inputSchema)).not.toMatch(/accessToken|endpoint|actor|secret|providerUrl/i);
    }
    const capabilities = await client.callTool({ name: 'linkedin.capabilities', arguments: {} });
    const descriptors = (
      capabilities.structuredContent as {
        data: { capabilities: Array<{ id: string; provider: string; availability: string }> };
      }
    ).data.capabilities;
    for (const id of ['jobs.analyze', 'jobs.compare']) {
      expect(descriptors.find((x) => x.id === id)).toMatchObject({
        id,
        provider: 'LOCAL_ONLY',
        availability: 'AVAILABLE',
      });
    }
    expect(descriptors.find((x) => x.id === 'jobs.score')).toBeUndefined();
    expect(descriptors.find((x) => x.id === 'jobs.search')?.availability).toBe('UNAVAILABLE');
  });

  it('returns grounded analysis even without a configured external jobs provider', async () => {
    const client = await clientFor();
    const result = await client.callTool({
      name: 'linkedin.jobs.analyze',
      arguments: {
        job: job(),
        candidate: { skills: ['TypeScript'] },
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      data: {
        status: 'available',
        analysis: {
          sourceTrust: 'caller_supplied',
          source: { name: 'Unverified user-supplied snapshot' },
          fit: { status: 'evaluated', score: 75 },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('Impersonated Talent Partner');
  });

  it('compares safely and rejects source overrides, forged evidence, excessive and duplicate jobs', async () => {
    const client = await clientFor();
    const good = await client.callTool({
      name: 'linkedin.jobs.compare',
      arguments: {
        jobs: [job('one'), job('two')],
        candidate: { skills: ['TypeScript', 'AWS'] },
      },
    });
    expect(good.isError).not.toBe(true);
    expect(good.structuredContent).toMatchObject({
      status: 'succeeded',
      data: { analyses: [{ ref: { jobId: 'one' } }, { ref: { jobId: 'two' } }] },
    });
    for (const input of [
      { jobs: [job('one'), job('one')] },
      { jobs: [job('one')] },
      { jobs: [job('one'), job('two')], accessToken: 'secret' },
      { jobs: [job('one'), job('two')], candidate: { skills: ['TypeScript'], passport: 'secret' } },
      { jobs: [job('one'), { ...job('two'), source: { ...job('two').source, provider: 'PARTNER_API' } }] },
    ]) {
      const result = await client.callTool({ name: 'linkedin.jobs.compare', arguments: input });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain('secret');
    }
    const invalidDate = await client.callTool({
      name: 'linkedin.jobs.analyze',
      arguments: {
        job: {
          ...job(),
          postingDate: {
            state: 'verified',
            postedAt: '2026-10-22T00:00:00Z',
            checkedAt: '2026-10-24T00:00:00Z',
            verifiedBy: 'forged',
            method: 'official_posting_api',
            evidenceUrl: 'https://jobs.example.org/proof',
          },
        },
      },
    });
    expect(invalidDate.isError).toBe(true);
  });

  it('keeps private saved-state unavailable through HTTP alongside local analysis', async () => {
    const client = await clientFor();
    const save = await client.callTool({ name: 'linkedin.jobs.saved.list', arguments: {} });
    expect(save.isError).toBe(true);
    const analyze = await client.callTool({ name: 'linkedin.jobs.analyze', arguments: { job: job() } });
    expect(analyze.isError).not.toBe(true);
  });

  it('advertises strict typed evidence and provenance output contracts', async () => {
    const client = await clientFor();
    const { tools } = await client.listTools();
    for (const name of ['linkedin.jobs.analyze', 'linkedin.jobs.compare']) {
      const schema = JSON.stringify(tools.find((tool) => tool.name === name)?.outputSchema);
      expect(schema).toContain('sourceTrust');
      expect(schema).toContain('sourceSpan');
      expect(schema).toContain('offsetUnit');
      expect(schema).toContain('scoreCoverage');
      expect(schema).toContain('EXTERNAL_DISCOVERY');
      expect(schema).not.toContain('PARTNER_API');
    }
  });

  it('bounds the complete serialized MCP reply including its envelope', async () => {
    const client = await clientFor();
    const description = Array.from(
      { length: 50 },
      (_, i) => `Required: Bachelor degree ${'a'.repeat(10)} ${i}.`,
    ).join(' ');
    const jobs = Array.from({ length: 10 }, (_, index) => ({
      id: `job-${index}`,
      title: 'T'.repeat(300),
      companyName: 'C'.repeat(16),
      source: {
        provider: 'EXTERNAL_DISCOVERY',
        id: 's',
        name: 'Fake partner',
        retrievedAt: '2026-10-24T09:00:00Z',
      },
      postingDate: { state: 'unknown' },
      description,
    }));
    const result = await client.callTool({ name: 'linkedin.jobs.compare', arguments: { jobs } });
    const text = result.content.find((item) => item.type === 'text');
    expect(text?.type).toBe('text');
    if (text?.type === 'text') {
      expect(Buffer.byteLength(text.text, 'utf8')).toBeLessThanOrEqual(262_144);
    }
    if (result.isError) {
      expect(result.structuredContent).toMatchObject({
        status: 'failed',
        error: { code: 'output_too_large' },
      });
    }
  });
});

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';

const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];

const corpus = () => ({
  topic: 'Agentic AI',
  focusTerms: ['RAG', 'blockchain'],
  sources: [
    { id: 'one', title: 'Note', url: 'https://research.example.org/a', body: 'RAG works in some AI agents.' },
    {
      id: 'two',
      title: 'Note 2',
      url: 'https://research.example.net/b',
      body: 'This text also discusses RAG.',
    },
  ],
});

async function clientFor(createRequestId: () => string = () => 'm10-contract') {
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      transport: 'http',
      now: () => new Date('2026-10-25T00:00:00Z'),
      createRequestId,
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm10-test', version: '1.0.0' });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  return client;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((x) => x.close()));
  await Promise.all(handlers.splice(0).map((x) => x.close()));
});

describe('M10 local research MCP contract', () => {
  it('exposes one stateless typed read-only analyze tool and truthful capability', async () => {
    const client = await clientFor();
    const { tools } = await client.listTools();
    const tool = tools.find((x) => x.name === 'linkedin.research.analyze');
    expect(tool?.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(tool?.outputSchema).toMatchObject({ type: 'object' });
    expect(tools.find((x) => x.name === 'linkedin.research.topic')).toBeUndefined();
    const caps = await client.callTool({ name: 'linkedin.capabilities', arguments: {} });
    const descriptors = (
      caps.structuredContent as {
        data: { capabilities: Array<{ id: string; provider: string; availability: string }> };
      }
    ).data.capabilities;
    expect(descriptors.find((x) => x.id === 'research.analyze')).toMatchObject({
      provider: 'LOCAL_ONLY',
      availability: 'AVAILABLE',
    });
    expect(descriptors.find((x) => x.id === 'research.topic')).toMatchObject({
      provider: 'EXTERNAL_DISCOVERY',
      availability: 'UNAVAILABLE',
    });
  });

  it('returns grounded unverified observations through real MCP client', async () => {
    const client = await clientFor();
    const result = await client.callTool({ name: 'linkedin.research.analyze', arguments: corpus() });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      data: {
        kind: 'local_corpus_analysis',
        status: 'available',
        sourceTrust: 'caller_supplied_unverified',
        verification: 'not_performed',
        termCoverage: [
          { term: 'Agentic AI', state: 'not_observed_in_supplied_corpus', evidence: [] },
          { term: 'RAG', state: 'observed_in_supplied_corpus' },
          { term: 'blockchain', state: 'not_observed_in_supplied_corpus', evidence: [] },
        ],
      },
    });
    const data = (
      result.structuredContent as { data: { sourceSummaries: Array<{ publicationDate: { state: string } }> } }
    ).data;
    expect(data.sourceSummaries).toHaveLength(2);
    expect(data.sourceSummaries[0]?.publicationDate.state).toBe('unknown');
  });

  it('fails closed on fake provider trust, secret URLs and invalid inputs with sanitized errors', async () => {
    const client = await clientFor();
    for (const data of [
      { ...corpus(), provider: 'OFFICIAL_API' },
      {
        ...corpus(),
        sources: [{ ...corpus().sources[0], url: 'https://research.example.org/?Access-Code=secret-canary' }],
      },
      { ...corpus(), sources: [{ ...corpus().sources[0], body: 'malformed-\ud800' }] },
    ]) {
      const result = await client.callTool({ name: 'linkedin.research.analyze', arguments: data });
      expect(result.isError).toBe(true);
      if ('provider' in data) {
        // MCP SDK rejects unknown top-level fields at the schema boundary,
        // before the tool callback can create a structured result.
        expect(result.structuredContent).toBeUndefined();
      } else {
        expect(result.structuredContent).toMatchObject({
          status: 'failed',
          error: { code: 'invalid_input', retryable: false },
        });
      }
      expect(JSON.stringify(result)).not.toContain('secret-canary');
    }
  });

  it('does not echo secret-bearing unexpected property names rejected by the SDK', async () => {
    const client = await clientFor();
    const secretKey = 'private-SECRET-DO-NOT-LEAK-CANARY';
    for (const argumentsValue of [
      { ...corpus(), [secretKey]: 'hidden' },
      {
        ...corpus(),
        sources: [{ ...corpus().sources[0], [secretKey]: 'hidden' }],
      },
    ]) {
      const result = await client.callTool({
        name: 'linkedin.research.analyze',
        arguments: argumentsValue,
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain(secretKey);
      expect(JSON.stringify(result)).not.toContain('hidden');
    }
  });

  it('rejects URLs expanded beyond the output schema without sending invalid_output', async () => {
    const client = await clientFor();
    const sample = corpus();
    sample.sources[0]!.url = 'https://research.example.org/' + 'é'.repeat(800);
    const result = await client.callTool({ name: 'linkedin.research.analyze', arguments: sample });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'failed',
      error: { code: 'invalid_input', retryable: false },
    });
    expect(JSON.stringify(result)).not.toContain('é'.repeat(20));
  });

  it('bounds untrusted-length injected request metadata even on oversized fallback', async () => {
    const client = await clientFor(() => 'R'.repeat(270_000));
    const result = await client.callTool({ name: 'linkedin.research.analyze', arguments: corpus() });
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(256 * 1024);
    expect(
      (result.structuredContent as { metadata: { requestId: string } }).metadata.requestId.length,
    ).toBeLessThanOrEqual(128);
  });

  it('returns sanitized analysis_too_large for a valid corpus whose pure report exceeds 96 KiB', async () => {
    const client = await clientFor();
    const topic = 'Topic ' + 'Q'.repeat(153);
    const focusTerms = Array.from(
      { length: 12 },
      (_, i) => 'term' + String(i).padStart(2, '0') + 'X'.repeat(74),
    );
    const large = {
      topic,
      focusTerms,
      sources: Array.from({ length: 20 }, (_, i) => ({
        id: 'source' + String(i).padStart(2, '0') + 's'.repeat(71),
        title: 'T'.repeat(240),
        url: 'https://research.example.org/' + 'p'.repeat(1930) + i,
        body: [topic, ...focusTerms].join(' '),
      })),
    };
    const result = await client.callTool({ name: 'linkedin.research.analyze', arguments: large });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'failed',
      error: { code: 'analysis_too_large', retryable: false },
      provider: { type: 'LOCAL_ONLY' },
    });
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(256 * 1024);
    expect(JSON.stringify(result)).not.toContain('X'.repeat(74));
  });

  it('does not repeat huge caller bodies and remains below the combined MCP wire budget', async () => {
    const client = await clientFor();
    const large = {
      topic: 'Evidence',
      sources: Array.from({ length: 4 }, (_, i) => ({
        id: 's' + i,
        title: 'Reference',
        url: 'https://research.example.org/' + i,
        body: 'narrow evidence ' + 'A'.repeat(49000) + i,
      })),
    };
    const result = await client.callTool({ name: 'linkedin.research.analyze', arguments: large });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: { kind: 'local_corpus_analysis', verification: 'not_performed' },
    });
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
    expect(JSON.stringify(result)).not.toContain('AAAAAAA');
  });
});

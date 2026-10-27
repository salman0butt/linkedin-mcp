import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';

const TOOL = 'linkedin.research.prepare_repurposing';
const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];

function input() {
  return {
    topic: 'Caller notes',
    sources: [
      {
        id: 'first',
        title: 'First caller note',
        url: 'https://research.example.org/first',
        body: '🤖 RAG evidence. PRIVATE_FIRST_BODY_CANARY',
        publishedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'second',
        title: 'Second caller note',
        url: 'https://research.example.org/second',
        body: 'SQL excerpt. PRIVATE_SECOND_BODY_CANARY',
      },
      {
        id: 'unused',
        title: 'Unused caller note',
        url: 'https://research.example.org/unused',
        body: 'PRIVATE_UNUSED_BODY_CANARY',
      },
    ],
    targets: [
      {
        id: 'post-1',
        label: 'Human post evidence',
        format: 'post',
        selections: [
          { sourceId: 'first', start: 3, end: 6 },
          { sourceId: 'second', start: 0, end: 3 },
        ],
      },
      {
        id: 'carousel-1',
        label: 'Human carousel evidence',
        format: 'carousel',
        selections: [{ sourceId: 'first', start: 0, end: 2 }],
      },
    ],
  };
}

async function clientFor(
  createRequestId: () => string = () => 'm10-repurposing-contract',
  privateDeps: Partial<NonNullable<Parameters<typeof createLinkedInMcpServer>[0]>> = {},
) {
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      ...privateDeps,
      transport: 'http',
      now: () => new Date('2026-10-27T00:00:00Z'),
      createRequestId,
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm10-repurposing-test', version: '1.0.0' });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  return client;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

describe('M10.4 local caller-curated repurposing evidence MCP contract', () => {
  it('registers a strictly typed read-only tool, without enabling external research or publishing', async () => {
    const client = await clientFor();
    const { tools } = await client.listTools();
    const toolsMatching = tools.filter((tool) => tool.name === TOOL);
    expect(toolsMatching).toHaveLength(1);
    expect(toolsMatching[0]?.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(toolsMatching[0]?.outputSchema).toMatchObject({ type: 'object' });
    expect(tools.find((tool) => tool.name === 'linkedin.research.compare_cohorts')).toBeDefined();
    expect(tools.find((tool) => tool.name === 'linkedin.research.topic')).toBeUndefined();
  });

  it('returns exactly caller-selected UTF-16 excerpts in a bounded LOCAL_ONLY text/structured reply', async () => {
    const client = await clientFor();
    const sample = input();
    const result = await client.callTool({ name: TOOL, arguments: sample });
    expect(result.isError).not.toBe(true);
    const envelope = result.structuredContent as {
      status: string;
      provider: { type: string; name: string };
      metadata: { requestId: string; timestamp: string };
      data: {
        kind: string;
        status: string;
        selectionOrigin: string;
        sourceTrust: string;
        verification: string;
        topic: string;
        sourceSummaries: Array<{ id: string; publicationDate: { state: string; sourceClaim?: string } }>;
        targets: Array<{
          id: string;
          label: string;
          format: string;
          excerpts: Array<{
            sourceId: string;
            field: string;
            start: number;
            end: number;
            offsetUnit: string;
            endExclusive: boolean;
            quote: string;
          }>;
        }>;
        warnings: string[];
      };
    };
    expect(envelope).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      metadata: { requestId: 'm10-repurposing-contract', timestamp: '2026-10-27T00:00:00.000Z' },
      data: {
        kind: 'local_caller_curated_repurposing_evidence',
        status: 'available',
        selectionOrigin: 'caller_defined_utf16_offsets',
        sourceTrust: 'caller_supplied_unverified',
        verification: 'not_performed',
        topic: sample.topic,
        targets: [
          { id: 'post-1', label: 'Human post evidence', format: 'post' },
          { id: 'carousel-1', label: 'Human carousel evidence', format: 'carousel' },
        ],
      },
    });
    expect(envelope.data.sourceSummaries.map((source) => source.id)).toEqual(['first', 'second']);
    expect(envelope.data.sourceSummaries[0]?.publicationDate).toEqual({
      state: 'reported',
      publishedAt: '2026-10-01T00:00:00Z',
      sourceClaim: 'caller_reported',
    });
    expect(envelope.data.targets[0]?.excerpts).toEqual([
      {
        sourceId: 'first',
        field: 'body',
        start: 3,
        end: 6,
        offsetUnit: 'utf16',
        endExclusive: true,
        quote: 'RAG',
      },
      {
        sourceId: 'second',
        field: 'body',
        start: 0,
        end: 3,
        offsetUnit: 'utf16',
        endExclusive: true,
        quote: 'SQL',
      },
    ]);
    expect(envelope.data.targets[1]?.excerpts).toEqual([
      {
        sourceId: 'first',
        field: 'body',
        start: 0,
        end: 2,
        offsetUnit: 'utf16',
        endExclusive: true,
        quote: '🤖',
      },
    ]);
    for (const target of envelope.data.targets) {
      for (const excerpt of target.excerpts) {
        const source = sample.sources.find((item) => item.id === excerpt.sourceId);
        expect(source?.body.slice(excerpt.start, excerpt.end)).toBe(excerpt.quote);
      }
    }
    expect(envelope.data.warnings).toEqual([
      'caller_sources_unverified',
      'selections_caller_defined_only',
      'evidence_is_excerpt_only',
      'human_review_required',
      'dates_caller_reported_only',
    ]);
    expect(result.content[0]).toMatchObject({ type: 'text', text: JSON.stringify(envelope) });
    const wire = JSON.stringify(result);
    expect(wire).not.toContain('PRIVATE_FIRST_BODY_CANARY');
    expect(wire).not.toContain('PRIVATE_SECOND_BODY_CANARY');
    expect(wire).not.toContain('PRIVATE_UNUSED_BODY_CANARY');
    expect(wire).not.toContain('articleDraft');
    expect(Buffer.byteLength(wire, 'utf8')).toBeLessThanOrEqual(262_144);
  });

  it('rejects unknown root, target, selection and source keys without echoing secret keys or values', async () => {
    const client = await clientFor();
    const sample = input();
    const key = 'PRIVATE_UNKNOWN_SECRET_KEY_CANARY';
    const secret = 'PRIVATE_UNKNOWN_SECRET_VALUE_CANARY';
    for (const bad of [
      { ...sample, [key]: secret },
      { ...sample, provider: secret },
      { ...sample, verified: true, sourceTrust: 'verified' },
      { ...sample, targets: [{ ...sample.targets[0], [key]: secret }, sample.targets[1]] },
      { ...sample, targets: [{ ...sample.targets[0], draft: secret }, sample.targets[1]] },
      {
        ...sample,
        targets: [
          { ...sample.targets[0], selections: [{ ...sample.targets[0]!.selections[0], [key]: secret }] },
          sample.targets[1],
        ],
      },
      {
        ...sample,
        targets: [
          { ...sample.targets[0], selections: [{ ...sample.targets[0]!.selections[0], quote: secret }] },
          sample.targets[1],
        ],
      },
      { ...sample, sources: [{ ...sample.sources[0], [key]: secret }, ...sample.sources.slice(1)] },
      { ...sample, sources: [{ ...sample.sources[0], retrievedAt: secret }, ...sample.sources.slice(1)] },
      { ...sample, sources: [{ ...sample.sources[0], verified: true }, ...sample.sources.slice(1)] },
    ]) {
      const result = await client.callTool({ name: TOOL, arguments: bad });
      expect(result.isError).toBe(true);
      const wire = JSON.stringify(result);
      expect(wire).not.toContain(key);
      expect(wire).not.toContain(secret);
      expect(wire).not.toContain('PRIVATE_FIRST_BODY_CANARY');
      expect(Buffer.byteLength(wire, 'utf8')).toBeLessThanOrEqual(262_144);
    }
  });

  it('fails closed on invalid selections, targets, bad offsets, unsafe sources and excessive total selection count', async () => {
    const client = await clientFor();
    const sample = input();
    const first = sample.targets[0];
    for (const bad of [
      { ...sample, targets: [] },
      { ...sample, targets: [first, first, first, first] },
      { ...sample, targets: [{ ...first, format: 'newsletter' }] },
      { ...sample, targets: [{ ...first, selections: [] }] },
      { ...sample, targets: [{ ...first, selections: [{ sourceId: 'missing', start: 0, end: 2 }] }] },
      { ...sample, targets: [{ ...first, selections: [{ sourceId: 'first', start: 1, end: 2 }] }] },
      { ...sample, targets: [{ ...first, selections: [{ sourceId: 'first', start: 4, end: 4 }] }] },
      { ...sample, targets: [{ ...first, selections: [{ sourceId: 'first', start: -1, end: 2 }] }] },
      { ...sample, targets: [{ ...first, selections: [{ sourceId: 'first', start: 0, end: 5000 }] }] },
      { ...sample, targets: [first, { ...first, id: 'POST-1' }] },
      {
        ...sample,
        targets: [
          {
            ...first,
            selections: Array.from({ length: 13 }, () => ({ sourceId: 'first', start: 3, end: 6 })),
          },
        ],
      },
      {
        ...sample,
        targets: [
          {
            ...first,
            selections: Array.from({ length: 7 }, (_, i) => ({ sourceId: 'first', start: i, end: i + 1 })),
          },
          {
            ...sample.targets[1],
            selections: Array.from({ length: 6 }, (_, i) => ({ sourceId: 'second', start: i, end: i + 1 })),
          },
        ],
      },
      {
        ...sample,
        sources: [
          { ...sample.sources[0], url: 'https://research.example.org/?api_key=PRIVATE_URL_SECRET_CANARY' },
          ...sample.sources.slice(1),
        ],
      },
    ]) {
      const result = await client.callTool({ name: TOOL, arguments: bad });
      expect(result.isError).toBe(true);
      if (result.structuredContent) {
        expect(result.structuredContent).toMatchObject({
          status: 'failed',
          provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
          error: { code: 'invalid_input', retryable: false },
        });
      }
      const wire = JSON.stringify(result);
      expect(wire).not.toContain('PRIVATE_URL_SECRET_CANARY');
      expect(wire).not.toContain('PRIVATE_FIRST_BODY_CANARY');
      expect(Buffer.byteLength(wire, 'utf8')).toBeLessThanOrEqual(262_144);
    }
  });

  it('bounds hostile 270k host request IDs in successful and failed dual-copy replies', async () => {
    const client = await clientFor(() => 'R'.repeat(270_000));
    const sample = input();
    for (const argumentsValue of [
      sample,
      {
        ...sample,
        targets: [{ ...sample.targets[0], selections: [{ sourceId: 'first', start: 3, end: 3 }] }],
      },
    ]) {
      const result = await client.callTool({ name: TOOL, arguments: argumentsValue });
      expect((result.structuredContent as { metadata: { requestId: string } }).metadata.requestId).toBe(
        'invalid-request-id',
      );
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
    }
  });

  it('does not read injected private article or saved-job stores over HTTP', async () => {
    const accesses: string[] = [];
    const privateStore = new Proxy(
      {},
      {
        get: (_target, property) => {
          accesses.push(String(property));
          throw new Error('PRIVATE_STORE_READ_CANARY');
        },
      },
    );
    const client = await clientFor(undefined, {
      articleStore: privateStore as never,
      jobStore: privateStore as never,
    });
    const result = await client.callTool({ name: TOOL, arguments: input() });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
    });
    expect(accesses).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_STORE_READ_CANARY');
  });

  it('handles a near-200KiB source corpus without echo and rejects a corpus over 200KiB', async () => {
    const client = await clientFor();
    const sample = input();
    const sources = Array.from({ length: 4 }, (_, i) => ({
      id: 'source' + i,
      title: 'Caller ' + i,
      url: 'https://research.example.org/big' + i,
      body: 'RAG. ' + 'A'.repeat(48_000) + i,
    }));
    const large = {
      ...sample,
      sources,
      targets: [
        {
          id: 'post',
          label: 'Human selection',
          format: 'post',
          selections: [{ sourceId: 'source0', start: 0, end: 3 }],
        },
      ],
    };
    const result = await client.callTool({ name: TOOL, arguments: large });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: {
        kind: 'local_caller_curated_repurposing_evidence',
        targets: [{ excerpts: [{ quote: 'RAG' }] }],
      },
    });
    expect(JSON.stringify(result)).not.toContain('AAAAAAAAAAAAAAAA');
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
    const exceeded = await client.callTool({
      name: TOOL,
      arguments: { ...large, sources: [...sources, { ...sources[0], id: 'source4' }] },
    });
    expect(exceeded.isError).toBe(true);
    expect(exceeded.structuredContent).toMatchObject({
      status: 'failed',
      error: { code: 'invalid_input', retryable: false },
    });
    expect(JSON.stringify(exceeded)).not.toContain('AAAAAAAAAAAAAAAA');
  });
});

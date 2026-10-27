import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';

const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];

function cohortInput() {
  return {
    topic: 'Source notes',
    focusTerms: ['RAG', 'SQL'],
    sources: [
      { id: 'a1', title: 'Caller A1', url: 'https://research.example.org/a1', body: '🤖 RAG in this note.' },
      { id: 'a2', title: 'Caller A2', url: 'https://research.example.org/a2', body: 'Unrelated notes.' },
      { id: 'b1', title: 'Caller B1', url: 'https://research.example.org/b1', body: 'SQL is here.' },
      { id: 'unused', title: 'Unused', url: 'https://research.example.org/u', body: 'RAG and SQL are here.' },
    ],
    cohorts: [
      { id: 'a', label: 'Draft A', sourceIds: ['a2', 'a1'] },
      { id: 'b', label: 'Draft B', sourceIds: ['b1'] },
    ],
    unmatchedSourceIds: ['unused'],
  };
}

async function clientFor(createRequestId: () => string = () => 'm10-cohort-contract') {
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      transport: 'http',
      now: () => new Date('2026-10-27T00:00:00Z'),
      createRequestId,
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm10-cohort-test', version: '1.0.0' });
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

describe('M10.3 caller-defined two-cohort comparison MCP contract', () => {
  it('registers a separately typed LOCAL_ONLY tool without activating provider-backed research', async () => {
    const client = await clientFor();
    const { tools } = await client.listTools();
    const comparisons = tools.filter((tool) => tool.name === 'linkedin.research.compare_cohorts');
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]?.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(comparisons[0]?.outputSchema).toMatchObject({ type: 'object' });
    expect(tools.find((tool) => tool.name === 'linkedin.research.analyze')).toBeDefined();
    expect(tools.find((tool) => tool.name === 'linkedin.research.group_themes')).toBeDefined();
    expect(tools.find((tool) => tool.name === 'linkedin.research.index_references')).toBeDefined();
    expect(tools.find((tool) => tool.name === 'linkedin.research.topic')).toBeUndefined();
  });

  it('returns caller-only cohort observations with exact original UTF-16 evidence and text/structured parity', async () => {
    const client = await clientFor();
    const sample = cohortInput();
    const result = await client.callTool({
      name: 'linkedin.research.compare_cohorts',
      arguments: sample,
    });
    expect(result.isError).not.toBe(true);
    const envelope = result.structuredContent as {
      status: string;
      provider: { type: string; name: string };
      metadata: { requestId: string; timestamp: string };
      data: {
        kind: string;
        status: string;
        comparisonOrigin: string;
        sourceTrust: string;
        verification: string;
        topic: string;
        focusTerms: string[];
        sourceSummaries: Array<{ id: string; publicationDate: { state: string } }>;
        cohorts: Array<{
          id: string;
          label: string;
          sourceIds: string[];
          termObservations: Array<{
            term: string;
            state: string;
            evidence: Array<{
              sourceId: string;
              field: string;
              start: number;
              end: number;
              offsetUnit: string;
              endExclusive: boolean;
              quote: string;
            }>;
          }>;
        }>;
        unmatchedSourceIds: string[];
        warnings: string[];
      };
    };
    expect(envelope).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      metadata: { requestId: 'm10-cohort-contract', timestamp: '2026-10-27T00:00:00.000Z' },
      data: {
        kind: 'local_caller_defined_corpus_comparison',
        status: 'available',
        comparisonOrigin: 'caller_defined_cohorts',
        sourceTrust: 'caller_supplied_unverified',
        verification: 'not_performed',
        topic: sample.topic,
        focusTerms: ['RAG', 'SQL'],
        unmatchedSourceIds: ['unused'],
        cohorts: [
          { id: 'a', label: 'Draft A', sourceIds: ['a1', 'a2'] },
          { id: 'b', label: 'Draft B', sourceIds: ['b1'] },
        ],
      },
    });
    expect(envelope.data.sourceSummaries.map((source) => source.id)).toEqual(['a1', 'a2', 'b1', 'unused']);
    expect(envelope.data.cohorts[0]?.termObservations).toEqual([
      {
        term: 'RAG',
        state: 'observed_in_supplied_cohort',
        evidence: [
          {
            sourceId: 'a1',
            field: 'body',
            start: 3,
            end: 6,
            offsetUnit: 'utf16',
            endExclusive: true,
            quote: 'RAG',
          },
        ],
      },
      { term: 'SQL', state: 'not_observed_in_supplied_cohort', evidence: [] },
    ]);
    expect(envelope.data.cohorts[1]?.termObservations).toEqual([
      { term: 'RAG', state: 'not_observed_in_supplied_cohort', evidence: [] },
      {
        term: 'SQL',
        state: 'observed_in_supplied_cohort',
        evidence: [
          {
            sourceId: 'b1',
            field: 'body',
            start: 0,
            end: 3,
            offsetUnit: 'utf16',
            endExclusive: true,
            quote: 'SQL',
          },
        ],
      },
    ]);
    expect(envelope.data.warnings).toEqual([
      'caller_sources_unverified',
      'comparison_is_corpus_only',
      'cohorts_caller_defined_only',
      'single_source_cohort',
      'unmatched_sources_excluded',
    ]);
    for (const cohort of envelope.data.cohorts) {
      for (const term of cohort.termObservations) {
        for (const span of term.evidence) {
          const original = sample.sources.find((source) => source.id === span.sourceId);
          expect(original?.body.slice(span.start, span.end)).toBe(span.quote);
          expect(span).toMatchObject({ field: 'body', offsetUnit: 'utf16', endExclusive: true });
        }
      }
    }
    expect(result.content[0]).toMatchObject({ type: 'text', text: JSON.stringify(envelope) });
    const wire = JSON.stringify(result);
    expect(Buffer.byteLength(wire, 'utf8')).toBeLessThanOrEqual(262_144);
    expect(wire).not.toContain('RAG and SQL are here.');
    expect(wire).not.toContain('Unrelated notes.');
  });

  it('does not echo root, cohort or source secret-bearing unknown key names or values from SDK validation', async () => {
    const client = await clientFor();
    const sample = cohortInput();
    const secretKey = 'private-SECRET-CANARY-UNKNOWN-FIELD';
    const secretValue = 'SECRET-DO-NOT-ECHO-CANARY';
    for (const input of [
      { ...sample, [secretKey]: secretValue },
      { ...sample, provider: secretValue },
      { ...sample, sourceTrust: 'verified', verified: true },
      { ...sample, cohorts: [{ ...sample.cohorts[0], [secretKey]: secretValue }, sample.cohorts[1]] },
      { ...sample, cohorts: [sample.cohorts[0], { ...sample.cohorts[1], provider: secretValue }] },
      {
        ...sample,
        sources: [{ ...sample.sources[0], [secretKey]: secretValue }, ...sample.sources.slice(1)],
      },
      {
        ...sample,
        sources: [{ ...sample.sources[0], retrievedAt: secretValue }, ...sample.sources.slice(1)],
      },
      { ...sample, sources: [{ ...sample.sources[0], verified: true }, ...sample.sources.slice(1)] },
    ]) {
      const result = await client.callTool({ name: 'linkedin.research.compare_cohorts', arguments: input });
      expect(result.isError).toBe(true);
      const returned = JSON.stringify(result);
      expect(returned).not.toContain(secretKey);
      expect(returned).not.toContain(secretValue);
      expect(returned).not.toContain('RAG and SQL are here.');
      expect(Buffer.byteLength(returned, 'utf8')).toBeLessThanOrEqual(262_144);
    }
  });

  it('rejects invalid disjoint partition, unsafe URLs and Unicode collisions with sanitized error statuses', async () => {
    const client = await clientFor();
    const sample = cohortInput();
    for (const input of [
      { ...sample, unmatchedSourceIds: [] },
      { ...sample, cohorts: [{ ...sample.cohorts[0], sourceIds: ['a1', 'b1'] }, sample.cohorts[1]] },
      { ...sample, cohorts: [sample.cohorts[0], { ...sample.cohorts[1], sourceIds: ['missing'] }] },
      { ...sample, cohorts: [{ ...sample.cohorts[0], sourceIds: [] }, sample.cohorts[1]] },
      { ...sample, cohorts: [sample.cohorts[0]] },
      { ...sample, focusTerms: [] },
      { ...sample, focusTerms: ['s', 'ſ'] },
      { ...sample, topic: 'İ', focusTerms: ['i\u0307'] },
      {
        ...sample,
        sources: [
          { ...sample.sources[0], url: 'https://research.example.org/?AWSAccessKeyId=SECRET-URL-CANARY' },
          ...sample.sources.slice(1),
        ],
      },
      { ...sample, sources: [{ ...sample.sources[0], body: 'bad\ud800' }, ...sample.sources.slice(1)] },
      {
        ...sample,
        sources: [{ ...sample.sources[0], publishedAt: '2026-02-30T00:00:00Z' }, ...sample.sources.slice(1)],
      },
    ]) {
      const result = await client.callTool({ name: 'linkedin.research.compare_cohorts', arguments: input });
      expect(result.isError).toBe(true);
      const envelope = result.structuredContent;
      if (envelope !== undefined) {
        expect(envelope).toMatchObject({
          status: 'failed',
          provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
          error: { code: 'invalid_input', retryable: false },
        });
      }
      const wire = JSON.stringify(result);
      expect(wire).not.toContain('SECRET-URL-CANARY');
      expect(wire).not.toContain('RAG and SQL are here.');
      expect(Buffer.byteLength(wire, 'utf8')).toBeLessThanOrEqual(262_144);
    }
  });

  it('bounds an injected 270k host request ID for both successful and failed tool replies', async () => {
    const client = await clientFor(() => 'R'.repeat(270_000));
    const sample = cohortInput();
    for (const input of [sample, { ...sample, unmatchedSourceIds: ['a1', 'unused'] }]) {
      const result = await client.callTool({ name: 'linkedin.research.compare_cohorts', arguments: input });
      expect(result.structuredContent).toMatchObject({
        provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      });
      expect(
        (result.structuredContent as { metadata: { requestId: string } }).metadata.requestId.length,
      ).toBeLessThanOrEqual(128);
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
    }
  });

  it('keeps near-200KiB caller bodies bounded without full-body echo and fails closed above the input limit', async () => {
    const client = await clientFor();
    const sample = cohortInput();
    const sources = Array.from({ length: 4 }, (_, i) => ({
      id: 'source' + i,
      title: 'Unverified source ' + i,
      url: 'https://research.example.org/large' + i,
      body: 'RAG and SQL. ' + 'A'.repeat(48_000) + i,
    }));
    const input = {
      ...sample,
      sources,
      cohorts: [
        { id: 'c1', label: 'Caller C1', sourceIds: ['source0', 'source1'] },
        { id: 'c2', label: 'Caller C2', sourceIds: ['source2'] },
      ],
      unmatchedSourceIds: ['source3'],
    };
    const result = await client.callTool({ name: 'linkedin.research.compare_cohorts', arguments: input });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: {
        kind: 'local_caller_defined_corpus_comparison',
        cohorts: [{ sourceIds: ['source0', 'source1'] }, { sourceIds: ['source2'] }],
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('AAAAAAAA');
    expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThanOrEqual(262_144);

    const exceeded = await client.callTool({
      name: 'linkedin.research.compare_cohorts',
      arguments: {
        ...input,
        sources: [...sources, { ...sources[0], id: 'source4' }],
        unmatchedSourceIds: ['source3', 'source4'],
      },
    });
    expect(exceeded.isError).toBe(true);
    expect(exceeded.structuredContent).toMatchObject({
      status: 'failed',
      error: { code: 'invalid_input', retryable: false },
    });
    expect(JSON.stringify(exceeded)).not.toContain('AAAAAAAA');
  });

  it('reuses topic evidence for matcher-equivalent focus terms without inventing a new match', async () => {
    const client = await clientFor();
    const sample = cohortInput();
    const response = await client.callTool({
      name: 'linkedin.research.compare_cohorts',
      arguments: {
        ...sample,
        topic: 'RAG',
        focusTerms: ['rag'],
      },
    });
    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({
      status: 'succeeded',
      data: {
        focusTerms: ['rag'],
        cohorts: [
          {
            termObservations: [
              {
                term: 'rag',
                state: 'observed_in_supplied_cohort',
                evidence: [{ sourceId: 'a1', start: 3, end: 6, quote: 'RAG' }],
              },
            ],
          },
          {
            termObservations: [
              {
                term: 'rag',
                state: 'not_observed_in_supplied_cohort',
                evidence: [],
              },
            ],
          },
        ],
      },
    });
  });

  it('reports analysis_too_large without returning a partial comparison or leaking a large valid corpus', async () => {
    const client = await clientFor();
    const focusTerms = Array.from(
      { length: 12 },
      (_, i) => 'term' + String(i).padStart(2, '0') + 'X'.repeat(74),
    );
    const topic = 'Topic ' + 'Q'.repeat(153);
    const sources = Array.from({ length: 20 }, (_, i) => ({
      id: 'source' + String(i).padStart(2, '0') + 's'.repeat(71),
      title: 'T'.repeat(240),
      url: 'https://research.example.org/' + 'p'.repeat(1930) + i,
      body: [topic, ...focusTerms].join(' '),
    }));
    const response = await client.callTool({
      name: 'linkedin.research.compare_cohorts',
      arguments: {
        topic,
        focusTerms,
        sources,
        cohorts: [
          { id: 'first', label: 'First', sourceIds: sources.slice(0, 10).map((source) => source.id) },
          { id: 'second', label: 'Second', sourceIds: sources.slice(10).map((source) => source.id) },
        ],
        unmatchedSourceIds: [],
      },
    });
    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      status: 'failed',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      error: { code: 'analysis_too_large', retryable: false },
    });
    const wire = JSON.stringify(response);
    expect(wire).not.toContain('X'.repeat(74));
    expect(wire).not.toContain('p'.repeat(1930));
    expect(Buffer.byteLength(wire, 'utf8')).toBeLessThanOrEqual(262_144);
  });
});

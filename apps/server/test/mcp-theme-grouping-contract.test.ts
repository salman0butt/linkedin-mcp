import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';

const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];

function input() {
  return {
    topic: 'Remote teams',
    themes: [
      { id: 'workflow', label: 'Workflow', phrases: ['remote teams', 'RAG'] },
      { id: 'data', label: 'Data', phrases: ['SQL'] },
    ],
    sources: [
      {
        id: 'one',
        title: 'Unverified note',
        url: 'https://research.example.org/one',
        body: '🧑‍💻 Remote   teams use RAG and SQL.',
        publishedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'two',
        title: 'Another excerpt',
        url: 'https://research.example.net/two',
        body: 'RAG is a focus here.',
      },
    ],
  };
}

async function clientFor(createRequestId: () => string = () => 'm10-theme-contract') {
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      transport: 'http',
      now: () => new Date('2026-10-26T00:00:00Z'),
      createRequestId,
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm10-theme-test', version: '1.0.0' });
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

describe('M10.1 caller-defined theme grouping MCP contract', () => {
  it('registers a separate strict typed read-only LOCAL_ONLY tool without altering research.analyze', async () => {
    const client = await clientFor();
    const { tools } = await client.listTools();
    expect(tools.filter((tool) => tool.name === 'linkedin.research.group_themes')).toHaveLength(1);
    const grouping = tools.find((tool) => tool.name === 'linkedin.research.group_themes');
    expect(grouping?.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(grouping?.outputSchema).toMatchObject({ type: 'object' });
    expect(tools.find((tool) => tool.name === 'linkedin.research.analyze')).toBeDefined();
    expect(tools.find((tool) => tool.name === 'linkedin.research.topic')).toBeUndefined();
  });

  it('returns ordered literal source-grounded groups and identical text/structured envelopes', async () => {
    const client = await clientFor();
    const sample = input();
    const result = await client.callTool({
      name: 'linkedin.research.group_themes',
      arguments: sample,
    });
    expect(result.isError).not.toBe(true);
    const envelope = result.structuredContent as {
      status: string;
      provider: { type: string; name: string };
      data: {
        kind: string;
        status: string;
        themeOrigin: string;
        sourceTrust: string;
        verification: string;
        warnings: string[];
        sourceSummaries: Array<{
          id: string;
          sourceTrust: string;
          publicationDate: { state: string; sourceClaim?: string };
        }>;
        themeGroups: Array<{
          id: string;
          label: string;
          sourceIds: string[];
          phrases: Array<{
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
      };
    };
    expect(envelope).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      data: {
        kind: 'local_caller_defined_theme_grouping',
        status: 'available',
        themeOrigin: 'caller_defined',
        sourceTrust: 'caller_supplied_unverified',
        verification: 'not_performed',
        unmatchedSourceIds: [],
        themeGroups: [
          { id: 'workflow', label: 'Workflow', sourceIds: ['one', 'two'] },
          { id: 'data', label: 'Data', sourceIds: ['one'] },
        ],
      },
    });
    expect(envelope.data.themeGroups.map((group) => group.phrases.map((phrase) => phrase.term))).toEqual([
      ['remote teams', 'RAG'],
      ['SQL'],
    ]);
    expect(envelope.data.themeGroups[0]?.phrases[0]?.evidence[0]?.quote).toBe('Remote   teams');
    expect(envelope.data.sourceSummaries[0]?.publicationDate).toEqual({
      state: 'reported',
      publishedAt: '2026-10-01T00:00:00Z',
      sourceClaim: 'caller_reported',
    });
    expect(envelope.data.sourceSummaries[1]?.publicationDate).toEqual({ state: 'unknown' });
    expect(envelope.data.warnings).toContain('themes_caller_defined_only');
    for (const group of envelope.data.themeGroups) {
      for (const phrase of group.phrases) {
        for (const evidence of phrase.evidence) {
          const source = sample.sources.find((source) => source.id === evidence.sourceId);
          expect(source?.body.slice(evidence.start, evidence.end)).toBe(evidence.quote);
          expect(evidence).toMatchObject({ field: 'body', offsetUnit: 'utf16', endExclusive: true });
        }
      }
    }
    expect(result.content[0]).toMatchObject({ type: 'text', text: JSON.stringify(envelope) });
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
    expect(JSON.stringify(result)).not.toContain('use RAG and SQL.');
  });

  it('maps a topic-equivalent phrase and reports single-source sufficiency without fabricated evidence', async () => {
    const client = await clientFor();
    const sample = input();
    const result = await client.callTool({
      name: 'linkedin.research.group_themes',
      arguments: {
        topic: sample.topic,
        themes: [{ id: 'a', label: 'Caller grouping only', phrases: ['REMOTE TEAMS', 'missing phrase'] }],
        sources: [sample.sources[0]],
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: {
        status: 'insufficient_evidence',
        themeOrigin: 'caller_defined',
        warnings: [
          'caller_sources_unverified',
          'coverage_is_corpus_only',
          'insufficient_sources',
          'dates_caller_reported_only',
          'themes_caller_defined_only',
        ],
        themeGroups: [
          {
            sourceIds: ['one'],
            phrases: [
              { term: 'REMOTE TEAMS', state: 'observed_in_supplied_corpus' },
              { term: 'missing phrase', state: 'not_observed_in_supplied_corpus', evidence: [] },
            ],
          },
        ],
      },
    });
  });

  it('fails closed without echoing secret-bearing unknown fields at every nested MCP boundary', async () => {
    const client = await clientFor();
    const sample = input();
    const canaryKey = 'secret-CANARY-PRIVATE-FIELD';
    const secret = 'SECRET-DO-NOT-ECHO-VALUE';
    for (const malicious of [
      { ...sample, [canaryKey]: secret },
      { ...sample, provider: secret },
      { ...sample, focusTerms: [secret] },
      { ...sample, themes: [{ ...sample.themes[0], [canaryKey]: secret }] },
      { ...sample, themes: [{ ...sample.themes[0], phrases: [secret], [canaryKey]: secret }] },
      { ...sample, sources: [{ ...sample.sources[0], [canaryKey]: secret }] },
    ]) {
      const result = await client.callTool({
        name: 'linkedin.research.group_themes',
        arguments: malicious,
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain(canaryKey);
      expect(JSON.stringify(result)).not.toContain(secret);
    }
    for (const malicious of [
      { ...sample, themes: [{ ...sample.themes[0], phrases: ['bad\ud800'] }] },
      { ...sample, themes: [{ ...sample.themes[0], phrases: ['RAG', 'rag'] }] },
      {
        ...sample,
        sources: [{ ...sample.sources[0], url: 'https://research.example.org/?AWSAccessKeyId=canary' }],
      },
      { ...sample, themes: [{ ...sample.themes[0], label: 'unsafe\u009b' }] },
    ]) {
      const result = await client.callTool({ name: 'linkedin.research.group_themes', arguments: malicious });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        status: 'failed',
        error: { code: 'invalid_input', retryable: false },
      });
      expect(JSON.stringify(result)).not.toContain('AWSAccessKeyId');
    }
  });

  it('caps 270k injected request IDs even for successful and failed grouping responses', async () => {
    const client = await clientFor(() => 'R'.repeat(270_000));
    for (const argumentsValue of [
      input(),
      { ...input(), themes: [{ ...input().themes[0], phrases: ['bad\ud800'] }] },
    ]) {
      const result = await client.callTool({
        name: 'linkedin.research.group_themes',
        arguments: argumentsValue,
      });
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
      expect(
        (result.structuredContent as { metadata: { requestId: string } }).metadata.requestId.length,
      ).toBeLessThanOrEqual(128);
    }
  });

  it('reports sanitized analysis_too_large instead of returning a partial group for valid large input', async () => {
    const client = await clientFor();
    const topic = 'Topic ' + 'Q'.repeat(153);
    const phrases = Array.from(
      { length: 12 },
      (_, i) => 'term' + String(i).padStart(2, '0') + 'X'.repeat(74),
    );
    const large = {
      topic,
      themes: Array.from({ length: 4 }, (_, i) => ({
        id: 'group' + i,
        label: 'Caller theme ' + i,
        phrases: phrases.slice(i * 3, (i + 1) * 3),
      })),
      sources: Array.from({ length: 20 }, (_, i) => ({
        id: 'source' + String(i).padStart(2, '0') + 's'.repeat(71),
        title: 'T'.repeat(240),
        url: 'https://research.example.org/' + 'p'.repeat(1930) + i,
        body: [topic, ...phrases].join(' '),
      })),
    };
    const result = await client.callTool({ name: 'linkedin.research.group_themes', arguments: large });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'failed',
      error: { code: 'analysis_too_large', retryable: false },
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
    });
    expect(JSON.stringify(result)).not.toContain('X'.repeat(74));
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
  });

  it('handles near-200KiB corpus without copying full bodies into response', async () => {
    const client = await clientFor();
    const sample = input();
    const large = {
      topic: 'Literal coverage',
      themes: [{ id: 'source', label: 'Caller-defined research', phrases: ['specific match'] }],
      sources: Array.from({ length: 4 }, (_, i) => ({
        id: 'source-' + i,
        title: 'Reference ' + i,
        url: 'https://research.example.org/source-' + i,
        body: 'specific match ' + 'A'.repeat(48_500) + i,
      })),
    };
    const result = await client.callTool({ name: 'linkedin.research.group_themes', arguments: large });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: {
        themeGroups: [{ sourceIds: ['source-0', 'source-1', 'source-2', 'source-3'] }],
      },
    });
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
    expect(JSON.stringify(result)).not.toContain('AAAAAAA');
    const analyze = await client.callTool({
      name: 'linkedin.research.analyze',
      arguments: { topic: sample.topic, sources: sample.sources },
    });
    expect(analyze.isError).not.toBe(true);
    expect(analyze.structuredContent).toMatchObject({ data: { kind: 'local_corpus_analysis' } });
  });
});

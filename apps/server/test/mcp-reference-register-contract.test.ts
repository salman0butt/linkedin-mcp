import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';

const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];

function referenceInput() {
  return {
    sources: [
      {
        id: 'alpha',
        title: 'First unverified note',
        url: 'https://Research.Example.org:443/old/../report',
        body: 'Caller-provided A — never include full body in a reference index.',
        publishedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'beta',
        title: 'Second unverified note',
        url: 'https://research.example.org/report',
        body: 'Different caller-provided B, not corroborating the first.',
      },
      {
        id: 'gamma',
        title: 'Third unverified note',
        url: 'https://research.example.org/another',
        body: 'Third caller-provided body, not fetched or independently verified.',
      },
    ],
  };
}

async function clientFor(createRequestId: () => string = () => 'm10-reference-contract') {
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      transport: 'http',
      now: () => new Date('2026-10-26T00:00:00Z'),
      createRequestId,
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm10-reference-test', version: '1.0.0' });
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

describe('M10.2 ephemeral caller-supplied reference index MCP contract', () => {
  it('registers one separate strict read-only LOCAL_ONLY reference tool without external topic research', async () => {
    const client = await clientFor();
    const { tools } = await client.listTools();
    const references = tools.filter((tool) => tool.name === 'linkedin.research.index_references');
    expect(references).toHaveLength(1);
    expect(references[0]?.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(references[0]?.outputSchema).toMatchObject({ type: 'object' });
    expect(tools.some((tool) => tool.name === 'linkedin.research.analyze')).toBe(true);
    expect(tools.some((tool) => tool.name === 'linkedin.research.group_themes')).toBe(true);
    expect(tools.some((tool) => tool.name === 'linkedin.research.topic')).toBe(false);
  });

  it('returns stable canonical-URL groups and reported-only caller provenance without source bodies', async () => {
    const client = await clientFor();
    const input = referenceInput();
    const result = await client.callTool({
      name: 'linkedin.research.index_references',
      arguments: input,
    });
    expect(result.isError).not.toBe(true);
    const envelope = result.structuredContent as {
      status: string;
      provider: { type: string; name: string };
      data: {
        kind: string;
        status: string;
        referenceOrigin: string;
        sourceTrust: string;
        verification: string;
        sourceSummaries: Array<{
          id: string;
          title: string;
          url: string;
          publicationDate: { state: string; sourceClaim?: string; publishedAt?: string };
          sourceTrust: string;
        }>;
        repeatedUrlGroups: Array<{ url: string; sourceIds: string[] }>;
        singleUrlSourceIds: string[];
        warnings: string[];
      };
    };
    expect(envelope).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      data: {
        kind: 'local_reference_register',
        status: 'available',
        referenceOrigin: 'caller_supplied',
        sourceTrust: 'caller_supplied_unverified',
        verification: 'not_performed',
        repeatedUrlGroups: [{ url: 'https://research.example.org/report', sourceIds: ['alpha', 'beta'] }],
        singleUrlSourceIds: ['gamma'],
        warnings: [
          'caller_sources_unverified',
          'same_url_not_independent_confirmation',
          'dates_caller_reported_only',
        ],
      },
    });
    expect(envelope.data.sourceSummaries.map((source) => source.id)).toEqual(['alpha', 'beta', 'gamma']);
    expect(envelope.data.sourceSummaries[0]?.publicationDate).toEqual({
      state: 'reported',
      publishedAt: '2026-10-01T00:00:00Z',
      sourceClaim: 'caller_reported',
    });
    expect(envelope.data.sourceSummaries[1]?.publicationDate).toEqual({ state: 'unknown' });
    expect(
      envelope.data.sourceSummaries.every((source) => source.sourceTrust === 'caller_supplied_unverified'),
    ).toBe(true);
    expect(result.content[0]).toMatchObject({ type: 'text', text: JSON.stringify(envelope) });
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
    const complete = JSON.stringify(result);
    for (const source of input.sources) {
      expect(complete).not.toContain(source.body);
    }
    expect(complete).not.toContain('retrievedAt');
    expect(complete).not.toContain('contentAnalysis');
    expect(complete).not.toContain('verifiedAt');
  });

  it('reports a single supplied reference without inventing independent corroboration', async () => {
    const client = await clientFor();
    const input = referenceInput();
    const result = await client.callTool({
      name: 'linkedin.research.index_references',
      arguments: { sources: [input.sources[0]] },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: {
        status: 'available',
        repeatedUrlGroups: [],
        singleUrlSourceIds: ['alpha'],
        sourceSummaries: [{ id: 'alpha', sourceTrust: 'caller_supplied_unverified' }],
      },
    });
  });

  it('does not merge distinct query orders, encoded path segments, or same-body different-URL sources', async () => {
    const client = await clientFor();
    const input = referenceInput();
    const body = 'Identical caller prose remains unverified.';
    const result = await client.callTool({
      name: 'linkedin.research.index_references',
      arguments: {
        sources: [
          { ...input.sources[0], id: 'a', url: 'https://research.example.org/a%2Fb', body },
          { ...input.sources[1], id: 'b', url: 'https://research.example.org/a/b', body },
          { ...input.sources[2], id: 'c', url: 'https://research.example.org/?a=1&b=2', body },
          { ...input.sources[2], id: 'd', url: 'https://research.example.org/?b=2&a=1', body },
        ],
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: { repeatedUrlGroups: [], singleUrlSourceIds: ['a', 'b', 'c', 'd'] },
    });
  });

  it('retains all 20 caller IDs at one canonical URL without treating repeated references as corroboration', async () => {
    const client = await clientFor();
    const seed = referenceInput().sources[0];
    const sources = Array.from({ length: 20 }, (_, i) => ({
      ...seed,
      id: i === 0 ? 'constructor' : 'ref-' + i,
      title: 'Caller assertion ' + i,
      url: i % 2 === 0 ? 'https://RESEARCH.example.org:443/a/../paper' : 'https://research.example.org/paper',
      body: 'Different unverified caller body ' + i,
      ...(i % 2 ? {} : { publishedAt: '2026-10-01T00:00:00Z' }),
    }));
    const result = await client.callTool({
      name: 'linkedin.research.index_references',
      arguments: { sources },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: {
        referenceOrigin: 'caller_supplied',
        repeatedUrlGroups: [
          {
            url: 'https://research.example.org/paper',
            sourceIds: sources.map((source) => source.id),
          },
        ],
        singleUrlSourceIds: [],
      },
    });
    const envelope = result.structuredContent as {
      data: { sourceSummaries: Array<{ id: string }> };
    };
    expect(envelope.data.sourceSummaries.map((source) => source.id)).toEqual(
      sources.map((source) => source.id),
    );
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
  });

  it('fails closed on unknown provider/trust fields at root and nested source boundaries without echoing secrets', async () => {
    const client = await clientFor();
    const input = referenceInput();
    const canaryKey = 'secret-CANARY-UNKNOWN-FIELD';
    const canaryValue = 'SECRET-DO-NOT-ECHO-VALUE';
    for (const malicious of [
      { ...input, [canaryKey]: canaryValue },
      { ...input, provider: canaryValue },
      { ...input, topic: canaryValue },
      { ...input, sources: [{ ...input.sources[0], [canaryKey]: canaryValue }] },
      { ...input, sources: [{ ...input.sources[0], sourceTrust: 'verified' }] },
      { ...input, sources: [{ ...input.sources[0], retrievedAt: canaryValue }] },
      { ...input, sources: [{ ...input.sources[0], verified: true }] },
    ]) {
      const result = await client.callTool({
        name: 'linkedin.research.index_references',
        arguments: malicious,
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain(canaryKey);
      expect(JSON.stringify(result)).not.toContain(canaryValue);
    }
  });

  it('rejects unsafe URLs and malformed inputs without echoing attacker content', async () => {
    const client = await clientFor();
    const input = referenceInput();
    for (const data of [
      {
        ...input,
        sources: [{ ...input.sources[0], url: 'https://research.example.org/?Access-Code=TOPSECRET' }],
      },
      {
        ...input,
        sources: [{ ...input.sources[0], url: 'https://research.example.org/?AWSAccessKeyId=TOPSECRET' }],
      },
      {
        ...input,
        sources: [{ ...input.sources[0], url: 'https://research.example.org/?t%2569cket=TOPSECRET' }],
      },
      {
        ...input,
        sources: [{ ...input.sources[0], url: 'https://username:password@research.example.org/path' }],
      },
      { ...input, sources: [{ ...input.sources[0], url: 'https://127.0.0.1/resource' }] },
      { ...input, sources: [{ ...input.sources[0], body: 'malformed-\ud800' }] },
      { ...input, sources: [{ ...input.sources[0], publishedAt: '2026-02-30T00:00:00Z' }] },
      { ...input, sources: [] },
      { ...input, sources: Array.from({ length: 21 }, (_, i) => ({ ...input.sources[0], id: 'id' + i })) },
    ]) {
      const result = await client.callTool({
        name: 'linkedin.research.index_references',
        arguments: data,
      });
      expect(result.isError).toBe(true);
      const responseText = JSON.stringify(result);
      expect(responseText).not.toContain('TOPSECRET');
      expect(responseText).not.toContain('password@');
      if (result.structuredContent !== undefined) {
        expect(result.structuredContent).toMatchObject({
          status: 'failed',
          provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
          error: { code: 'invalid_input', retryable: false },
        });
      }
    }
  });

  it('bounds injected request IDs for success and failure without changing provider truth', async () => {
    const client = await clientFor(() => 'R'.repeat(270_000));
    const valid = referenceInput();
    for (const input of [
      valid,
      { ...valid, sources: [{ ...valid.sources[0], url: 'https://portal.internal/secret' }] },
    ]) {
      const result = await client.callTool({ name: 'linkedin.research.index_references', arguments: input });
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
      expect(result.structuredContent).toMatchObject({
        provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      });
      expect(
        (result.structuredContent as { metadata: { requestId: string } }).metadata.requestId.length,
      ).toBeLessThanOrEqual(128);
    }
  });

  it('keeps a near-200KiB valid caller corpus compact and fails safely above the input bound', async () => {
    const client = await clientFor();
    const source = referenceInput().sources[0];
    const sources = Array.from({ length: 4 }, (_, i) => ({
      ...source,
      id: 'near' + i,
      url: 'https://research.example.org/large-' + i,
      body: 'A'.repeat(48_000) + i,
    }));
    const result = await client.callTool({
      name: 'linkedin.research.index_references',
      arguments: { sources },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      data: {
        repeatedUrlGroups: [],
        singleUrlSourceIds: ['near0', 'near1', 'near2', 'near3'],
      },
    });
    expect(JSON.stringify(result)).not.toContain('AAAAAAA');
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);

    const exceeded = await client.callTool({
      name: 'linkedin.research.index_references',
      arguments: {
        sources: Array.from({ length: 5 }, (_, i) => ({ ...sources[0], id: 'over' + i })),
      },
    });
    expect(exceeded.isError).toBe(true);
    expect(exceeded.structuredContent).toMatchObject({
      status: 'failed',
      error: { code: 'invalid_input', retryable: false },
    });
    expect(JSON.stringify(exceeded)).not.toContain('AAAAAAA');
  });
});

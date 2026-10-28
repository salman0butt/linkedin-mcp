import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';

const TOOL = 'linkedin.analytics.compare_snapshots';
const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];

function args() {
  return {
    contentId: 'local-001',
    contentKind: 'post',
    snapshots: [
      {
        capturedAtUtc: '2026-10-25T12:00:00.000Z',
        metrics: {
          impressions: 100,
          reactions: 12,
          comments: null,
          reposts: 3,
        },
      },
      {
        capturedAtUtc: '2026-10-27T12:00:00.000Z',
        metrics: {
          impressions: 95,
          reactions: 13,
          comments: 2,
          reposts: 3,
        },
      },
    ],
  };
}

function connect(requestId?: () => string) {
  const wire: string[] = [];
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      createRequestId: requestId ?? (() => 'analytics-local-safe-id'),
      now: () => new Date('2026-10-28T12:00:00.000Z'),
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm12-local-analytics', version: '1.0.0' });
  clients.push(client);
  const connected = client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: async (url, init) => {
        const request = new Request(url, init);
        const isCall = request.method === 'POST' && (await request.clone().text()).includes('"tools/call"');
        const response = await handler.fetch(request);
        if (isCall) wire.push(await response.clone().text());
        return response;
      },
    }),
  );
  return { client, connected, wire };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

describe('M12.0 real typed SDK LOCAL_ONLY analytics comparison', () => {
  it('registers one strict typed tool; provider analytics remain unconfigured', async () => {
    const { client, connected } = connect();
    await connected;
    const { tools } = await client.listTools();
    const selected = tools.find((tool) => tool.name === TOOL);
    expect(selected?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['contentId', 'contentKind', 'snapshots'],
    });
    expect(selected?.outputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(tools.filter((tool) => tool.name === TOOL)).toHaveLength(1);
    expect(tools.some((tool) => tool.name === 'linkedin.analytics.post')).toBe(false);
    expect(tools.some((tool) => tool.name === 'linkedin.schedule.create')).toBe(false);
  });

  it('round-trips exact counters, null unavailability, provenance and no invented rates', async () => {
    const { client, connected, wire } = connect();
    await connected;
    const response = await client.callTool({ name: TOOL, arguments: args() });
    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      data: {
        kind: 'local_content_metric_snapshot_comparison',
        provenance: 'caller_supplied_unverified',
        verification: 'not_performed',
        providerData: 'not_fetched',
        accountAuthorization: 'not_evaluated',
        metrics: {
          impressions: { state: 'comparable', previous: 100, current: 95, delta: -5 },
          comments: { state: 'unavailable', previous: null, current: 2, delta: null },
        },
      },
    });
    const textBody = response.content.find((part) => part.type === 'text');
    expect(textBody?.text).toBe(JSON.stringify(response.structuredContent));
    expect(JSON.stringify(response)).not.toMatch(/engagementRate|clickThroughRate|estimatedImpressions/u);
    expect(Buffer.byteLength(wire.at(-1) ?? '', 'utf8')).toBeLessThanOrEqual(262_144);
  });

  it('rejects secret-bearing unknown fields and forged provider metadata before invoking local analysis', async () => {
    const { client, connected, wire } = connect();
    await connected;
    const invalid = [
      { ...args(), PRIVATE_TOKEN: 'sk_live_SECRET_VALUE' },
      { ...args(), provider: 'OFFICIAL_API', verified: true },
      {
        ...args(),
        snapshots: [
          {
            ...args().snapshots[0],
            metrics: {
              ...args().snapshots[0]!.metrics,
              accessToken: 'sk_live_SECRET_VALUE',
            },
          },
          args().snapshots[1],
        ],
      },
      {
        ...args(),
        snapshots: [
          args().snapshots[0],
          {
            ...args().snapshots[1],
            metrics: {
              ...args().snapshots[1]!.metrics,
              impressions: -1,
            },
          },
        ],
      },
    ];
    for (const value of invalid) {
      const response = await client.callTool({ name: TOOL, arguments: value });
      expect(response.isError).toBe(true);
      expect(JSON.stringify(response)).not.toMatch(/sk_live_SECRET_VALUE|PRIVATE_TOKEN|accessToken/u);
      expect(Buffer.byteLength(wire.at(-1) ?? '', 'utf8')).toBeLessThanOrEqual(262_144);
    }
  });

  it('returns sanitized error for malformed civil dates, missing metrics and reversed captures', async () => {
    const { client, connected } = connect();
    await connected;
    for (const bad of [
      {
        ...args(),
        snapshots: [
          args().snapshots[0],
          {
            ...args().snapshots[1],
            capturedAtUtc: '2026-02-30T12:00:00.000Z',
          },
        ],
      },
      { ...args(), snapshots: [args().snapshots[1], args().snapshots[0]] },
      {
        ...args(),
        snapshots: [
          args().snapshots[0],
          {
            ...args().snapshots[1],
            metrics: {
              impressions: null,
              reactions: null,
              comments: null,
              reposts: null,
            },
          },
        ],
      },
    ]) {
      const response = await client.callTool({ name: TOOL, arguments: bad });
      expect(response.isError).toBe(true);
      expect(response.structuredContent).toMatchObject({
        status: 'failed',
        error: { code: 'invalid_input', retryable: false },
      });
    }
  });

  it('bounds injected 270,000 character host request ID on success and handled error', async () => {
    const { client, connected, wire } = connect(() => 'HOST_SECRET'.repeat(30_000));
    await connected;
    const ok = await client.callTool({ name: TOOL, arguments: args() });
    expect(ok.structuredContent).toMatchObject({ metadata: { requestId: 'invalid-request-id' } });
    const bad = await client.callTool({
      name: TOOL,
      arguments: {
        ...args(),
        snapshots: [args().snapshots[1], args().snapshots[0]],
      },
    });
    expect(bad.structuredContent).toMatchObject({ metadata: { requestId: 'invalid-request-id' } });
    expect(JSON.stringify([ok, bad])).not.toContain('HOST_SECRET');
    expect(wire.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
  });
});

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';
import { registerAnalyticsSeriesTools } from '../src/analytics-series-mcp.js';

const TOOL = 'linkedin.analytics.compare_snapshot_series';
const BEFORE = '2026-10-25T09:00:00.000Z';
const MIDDLE = '2026-10-26T09:00:00.000Z';
const AFTER = '2026-10-27T09:00:00.000Z';
const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];

function capture(capturedAtUtc: string, impressions: number | null, comments: number | null) {
  return {
    capturedAtUtc,
    metrics: { impressions, reactions: 4, comments, reposts: 1 },
  };
}

function args() {
  return {
    contentId: 'caller-post-01',
    contentKind: 'post',
    snapshots: [capture(BEFORE, 100, null), capture(MIDDLE, 95, 0), capture(AFTER, 103, 3)],
  };
}

function connect(createRequestId?: () => string, now?: () => Date) {
  const frames: string[] = [];
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      createRequestId: createRequestId ?? (() => 'm12-series-safe-id'),
      now: now ?? (() => new Date('2026-10-28T12:00:00.000Z')),
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm12-series-contract', version: '1.0.0' });
  clients.push(client);
  const connected = client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: async (url, init) => {
        const request = new Request(url, init);
        const isCall = request.method === 'POST' && (await request.clone().text()).includes('"tools/call"');
        const response = await handler.fetch(request);
        if (isCall) frames.push(await response.clone().text());
        return response;
      },
    }),
  );
  return { client, connected, frames, handler };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

describe('M12.2 real SDK local caller observation series', () => {
  it('independently registers a callable tool with real SDK and no provider or private store', async () => {
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: 'independent-series-test', version: '1.0.0' });
      registerAnalyticsSeriesTools(server, {
        createRequestId: () => 'independent-request',
        now: () => new Date('2026-10-28T12:00:00.000Z'),
      });
      return server;
    });
    handlers.push(handler);
    const client = new Client({ name: 'independent-series-client', version: '1.0.0' });
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
        fetch: (url, init) => handler.fetch(new Request(url, init)),
      }),
    );
    const tools = (await client.listTools()).tools;
    expect(tools.map((tool) => tool.name)).toEqual([TOOL]);
    const result = await client.callTool({ name: TOOL, arguments: args() });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY' },
      metadata: { requestId: 'independent-request' },
      data: { counts: { captures: 3, intervals: 2 } },
    });
    expect(result.content.find((part) => part.type === 'text')?.text).toBe(
      JSON.stringify(result.structuredContent),
    );
  });

  it('registers exactly one strictly typed series tool; official analytics remain unavailable', async () => {
    const { client, connected } = connect();
    await connected;
    const { tools } = await client.listTools();
    const selected = tools.find((tool) => tool.name === TOOL);
    expect(tools.filter((tool) => tool.name === TOOL)).toHaveLength(1);
    expect(selected?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['contentId', 'contentKind', 'snapshots'],
      properties: {
        snapshots: { type: 'array', minItems: 3, maxItems: 10 },
      },
    });
    expect(selected?.outputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(tools.some((tool) => tool.name === 'linkedin.analytics.post')).toBe(false);
    expect(tools.some((tool) => tool.name === 'linkedin.schedule.create')).toBe(false);
  });

  it('returns complete signed adjacent intervals, null unavailability and truthful LOCAL_ONLY claims', async () => {
    const { client, connected, frames } = connect();
    await connected;
    const response = await client.callTool({ name: TOOL, arguments: args() });
    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      data: {
        kind: 'local_caller_metric_observation_series',
        status: 'observations_only',
        provenance: 'caller_supplied_unverified',
        verification: 'not_performed',
        providerData: 'not_fetched',
        accountAuthorization: 'not_evaluated',
        publication: 'not_attempted',
        contentId: 'caller-post-01',
        contentKind: 'post',
        capturesUtc: [BEFORE, MIDDLE, AFTER],
        counts: { captures: 3, intervals: 2 },
        intervals: [
          {
            fromUtc: BEFORE,
            toUtc: MIDDLE,
            metrics: {
              impressions: { state: 'comparable', previous: 100, current: 95, delta: -5 },
              comments: { state: 'unavailable', previous: null, current: 0, delta: null },
            },
          },
          {
            fromUtc: MIDDLE,
            toUtc: AFTER,
            metrics: {
              impressions: { state: 'comparable', previous: 95, current: 103, delta: 8 },
              comments: { state: 'comparable', previous: 0, current: 3, delta: 3 },
            },
          },
        ],
        warnings: [
          'caller_metrics_unverified',
          'capture_intervals_not_provider_windows',
          'no_rates_or_performance_inferred',
          'missing_metrics_not_zero',
          'negative_delta_may_reflect_counter_revisions',
        ],
      },
    });
    expect(response.content.find((part) => part.type === 'text')?.text).toBe(
      JSON.stringify(response.structuredContent),
    );
    expect(JSON.stringify(response)).not.toMatch(
      /engagementRate|estimatedTrend|performanceScore|OFFICIAL_API/u,
    );
    expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
  });

  it('supports exactly ten observations without truncation and bounds full raw HTTP SSE', async () => {
    const { client, connected, frames } = connect();
    await connected;
    const observations = Array.from({ length: 10 }, (_, index) =>
      capture(`2026-10-${String(index + 10).padStart(2, '0')}T09:00:00.000Z`, index, index),
    );
    const response = await client.callTool({
      name: TOOL,
      arguments: { contentId: 'series-max-10', contentKind: 'article', snapshots: observations },
    });
    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({
      data: { counts: { captures: 10, intervals: 9 }, capturesUtc: observations.map((x) => x.capturedAtUtc) },
    });
    expect(response.content.find((part) => part.type === 'text')?.text).toBe(
      JSON.stringify(response.structuredContent),
    );
    expect(Buffer.byteLength(frames.at(-1) ?? '', 'utf8')).toBeLessThanOrEqual(262_144);
  });

  it('rejects unknown secret field names and values before calling the tool handler', async () => {
    let handled = 0;
    const { client, connected, frames } = connect(() => {
      handled++;
      return 'safe-id';
    });
    await connected;
    const base = args();
    const invalid = [
      { ...base, SECRET_ACCESS_KEY: 'sk_live_NEVER_ECHO_THIS' },
      { ...base, provider: 'OFFICIAL_API', verified: true, accountToken: 'sk_live_NEVER_ECHO_THIS' },
      {
        ...base,
        snapshots: [
          { ...base.snapshots[0], token_credential: 'sk_live_NEVER_ECHO_THIS' },
          ...base.snapshots.slice(1),
        ],
      },
      {
        ...base,
        snapshots: [
          ...base.snapshots.slice(0, 2),
          {
            ...base.snapshots[2],
            metrics: { ...base.snapshots[2]!.metrics, API_SECRET: 'sk_live_NEVER_ECHO_THIS' },
          },
        ],
      },
      {
        ...base,
        snapshots: [
          ...base.snapshots.slice(0, 2),
          {
            ...base.snapshots[2],
            metrics: { ...base.snapshots[2]!.metrics, '🔑_SESSION_SECRET': 'sk_live_NEVER_ECHO_THIS' },
          },
        ],
      },
    ];
    for (const value of invalid) {
      const response = await client.callTool({ name: TOOL, arguments: value });
      expect(response.isError).toBe(true);
      expect(JSON.stringify(response)).not.toMatch(
        /sk_live_NEVER_ECHO_THIS|SECRET_ACCESS_KEY|token_credential|API_SECRET|SESSION_SECRET/u,
      );
      expect(Buffer.byteLength(frames.at(-1) ?? '', 'utf8')).toBeLessThanOrEqual(262_144);
    }
    expect(handled).toBe(0);
  });

  it('fails closed on invalid dates, capture cardinality, missing keys, counter bounds and URLs', async () => {
    const { client, connected, frames } = connect();
    await connected;
    const base = args();
    const invalid = [
      { ...base, snapshots: base.snapshots.slice(0, 2) },
      {
        ...base,
        snapshots: Array.from({ length: 11 }, (_, i) =>
          capture(`2026-10-${String(i + 10)}T09:00:00.000Z`, i, i),
        ),
      },
      { ...base, snapshots: [base.snapshots[1], base.snapshots[0], base.snapshots[2]] },
      { ...base, snapshots: [base.snapshots[0], base.snapshots[0], base.snapshots[2]] },
      {
        ...base,
        snapshots: [base.snapshots[0], capture('2026-02-30T09:00:00.000Z', 1, 0), base.snapshots[2]],
      },
      { ...base, snapshots: [base.snapshots[0], capture(MIDDLE, 1_000_000_001, 0), base.snapshots[2]] },
      { ...base, snapshots: [base.snapshots[0], capture(MIDDLE, -1, 0), base.snapshots[2]] },
      { ...base, snapshots: [base.snapshots[0], capture(MIDDLE, 0.5, 0), base.snapshots[2]] },
      {
        ...base,
        snapshots: [
          base.snapshots[0],
          { capturedAtUtc: MIDDLE, metrics: { impressions: 1, reactions: 0, reposts: 1 } },
          base.snapshots[2],
        ],
      },
      {
        ...base,
        snapshots: [
          base.snapshots[0],
          {
            capturedAtUtc: MIDDLE,
            metrics: { impressions: null, reactions: null, comments: null, reposts: null },
          },
          base.snapshots[2],
        ],
      },
      { ...base, contentId: 'https://linkedin.com/posts/1' },
    ];
    for (const value of invalid) {
      const response = await client.callTool({ name: TOOL, arguments: value });
      expect(response.isError).toBe(true);
      expect(Buffer.byteLength(frames.at(-1) ?? '', 'utf8')).toBeLessThanOrEqual(262_144);
    }
  });

  it('sanitizes 330k hostile host request IDs on success and handled failure', async () => {
    const { client, connected, frames } = connect(() => 'HOST_SECRET'.repeat(30_000));
    await connected;
    const succeeded = await client.callTool({ name: TOOL, arguments: args() });
    const failed = await client.callTool({
      name: TOOL,
      arguments: { ...args(), snapshots: [args().snapshots[2], args().snapshots[1], args().snapshots[0]] },
    });
    expect(succeeded.structuredContent).toMatchObject({ metadata: { requestId: 'invalid-request-id' } });
    expect(failed.structuredContent).toMatchObject({
      status: 'failed',
      error: {
        code: 'invalid_input',
        message: 'Local metric observation series could not be safely compared.',
        retryable: false,
      },
      metadata: { requestId: 'invalid-request-id' },
    });
    expect(succeeded.isError).not.toBe(true);
    expect(failed.isError).toBe(true);
    expect(JSON.stringify([succeeded, failed])).not.toContain('HOST_SECRET');
    expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
  });

  it('ignores poisoned host Date objects and hostile toISOString implementations', async () => {
    const date = new Date('2026-10-28T10:00:00.000Z');
    let getterReads = 0;
    Object.defineProperty(date, 'toISOString', {
      get() {
        getterReads++;
        throw new Error('SECRET_HOST_CLOCK_GETTER');
      },
    });
    class HostileDate extends Date {
      override toISOString(): string {
        return 'SECRET_HOST_CLOCK'.repeat(30_000);
      }
    }
    const hostileClocks: Array<{ now: () => Date; expected: string }> = [
      { now: () => date, expected: '2026-10-28T10:00:00.000Z' },
      { now: () => new HostileDate('2026-10-28T10:00:00.000Z'), expected: '2026-10-28T10:00:00.000Z' },
      {
        now: () => ({ toISOString: () => 'SECRET_HOST_CLOCK'.repeat(30_000) }) as unknown as Date,
        expected: '1970-01-01T00:00:00.000Z',
      },
      {
        now: () =>
          new Proxy(new Date(), {
            get: () => {
              throw new Error('SECRET_HOST_CLOCK_PROXY');
            },
          }),
        expected: '1970-01-01T00:00:00.000Z',
      },
      { now: () => new Date(NaN), expected: '1970-01-01T00:00:00.000Z' },
      {
        now: () => {
          throw new Error('SECRET_HOST_CLOCK_THROW');
        },
        expected: '1970-01-01T00:00:00.000Z',
      },
    ];
    for (const { now, expected } of hostileClocks) {
      const { client, connected, frames } = connect(undefined, now);
      await connected;
      const response = await client.callTool({ name: TOOL, arguments: args() });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ metadata: { timestamp: expected } });
      expect(JSON.stringify(response)).not.toContain('SECRET_HOST_CLOCK');
      expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
    }
    expect(getterReads).toBe(0);
  });
});

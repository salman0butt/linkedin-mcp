import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';

const TOOL = 'linkedin.analytics.rank_snapshot_changes';
const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];

function entry(id: string, previous: number | null, current: number | null) {
  return {
    contentId: id,
    contentKind: 'post',
    snapshots: [
      {
        capturedAtUtc: '2026-10-20T10:00:00.000Z',
        metrics: { impressions: previous, reactions: 1, comments: 0, reposts: 0 },
      },
      {
        capturedAtUtc: '2026-10-27T10:00:00.000Z',
        metrics: { impressions: current, reactions: 1, comments: 0, reposts: 0 },
      },
    ],
  };
}
const args = () => ({
  targetMetric: 'impressions',
  entries: [entry('down', 100, 90), entry('up', 10, 20), entry('missing', null, 10)],
});

function connect(requestId?: () => string, now?: () => Date) {
  const frames: string[] = [];
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      createRequestId: requestId ?? (() => 'm12-rank-safe-id'),
      now: now ?? (() => new Date('2026-10-28T12:00:00.000Z')),
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm12-local-rank', version: '1.0.0' });
  clients.push(client);
  const connected = client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: async (url, init) => {
        const req = new Request(url, init);
        const isCall = req.method === 'POST' && (await req.clone().text()).includes('"tools/call"');
        const res = await handler.fetch(req);
        if (isCall) frames.push(await res.clone().text());
        return res;
      },
    }),
  );
  return { client, connected, frames };
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

describe('M12.1 real SDK local-only caller metric delta ranking', () => {
  it('advertises one new strict tool, no LinkedIn provider analytics', async () => {
    const { client, connected } = connect();
    await connected;
    const { tools } = await client.listTools();
    expect(tools.find((x) => x.name === TOOL)?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['targetMetric', 'entries'],
    });
    expect(tools.filter((x) => x.name === TOOL)).toHaveLength(1);
    expect(tools.some((x) => x.name === 'linkedin.analytics.post')).toBe(false);
    expect(tools.some((x) => x.name === 'linkedin.schedule.create')).toBe(false);
  });
  it('returns only caller arithmetic, stable sorted rank, missing separately and bounded dual SSE', async () => {
    const { client, connected, frames } = connect();
    await connected;
    const res = await client.callTool({ name: TOOL, arguments: args() });
    expect(res.isError).not.toBe(true);
    expect(res.structuredContent).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      data: {
        kind: 'local_caller_metric_delta_ranking',
        provenance: 'caller_supplied_unverified',
        verification: 'not_performed',
        providerData: 'not_fetched',
        ranked: [
          { contentId: 'up', delta: 10 },
          { contentId: 'down', delta: -10 },
        ],
        unavailable: [{ contentId: 'missing', previous: null, current: 10 }],
        counts: { compared: 3, ranked: 2, unavailable: 1 },
      },
    });
    const body = res.content.find((x) => x.type === 'text');
    expect(body?.text).toBe(JSON.stringify(res.structuredContent));
    expect(frames.every((x) => Buffer.byteLength(x, 'utf8') <= 262_144)).toBe(true);
    expect(JSON.stringify(res)).not.toMatch(/engagementRate|estimatedWinner|OFFICIAL_API/u);
  });
  it('rejects root and nested secret key names and values, forged provider details', async () => {
    const { client, connected, frames } = connect();
    await connected;
    for (const bad of [
      { ...args(), PRIVATE_SECRET: 'sk_live_VALUE' },
      { ...args(), provider: 'OFFICIAL_API', verified: true },
      {
        ...args(),
        entries: [{ ...entry('one', 0, 1), PRIVATE_SECRET: 'sk_live_VALUE' }, entry('two', 1, 2)],
      },
      {
        ...args(),
        entries: [
          entry('one', 0, 1),
          {
            ...entry('two', 1, 2),
            snapshots: [
              {
                ...entry('two', 1, 2).snapshots[0],
                metrics: { ...entry('two', 1, 2).snapshots[0]!.metrics, accessToken: 'sk_live_VALUE' },
              },
              entry('two', 1, 2).snapshots[1],
            ],
          },
        ],
      },
    ]) {
      const res = await client.callTool({ name: TOOL, arguments: bad });
      expect(res.isError).toBe(true);
      expect(JSON.stringify(res)).not.toMatch(/sk_live_VALUE|PRIVATE_SECRET|accessToken/u);
      expect(Buffer.byteLength(frames.at(-1) ?? '', 'utf8')).toBeLessThanOrEqual(262_144);
    }
  });
  it('rejects duplicate IDs, inconsistent snapshot instants, invalid metrics without claims', async () => {
    const { client, connected } = connect();
    await connected;
    const mismatch = entry('two', 1, 2);
    mismatch.snapshots[1]!.capturedAtUtc = '2026-10-28T10:00:00.000Z';
    for (const bad of [
      { targetMetric: 'engagementRate', entries: [entry('one', 1, 2), entry('two', 2, 3)] },
      { targetMetric: 'impressions', entries: [entry('one', 1, 2), entry('one', 2, 3)] },
      { targetMetric: 'impressions', entries: [entry('one', 1, 2), mismatch] },
      { targetMetric: 'impressions', entries: [entry('one', 1, 2), entry('two', -1, 3)] },
    ]) {
      const res = await client.callTool({ name: TOOL, arguments: bad });
      expect(res.isError).toBe(true);
    }
  });
  it('bounds hostile host request ID on success and failures', async () => {
    const { client, connected, frames } = connect(() => 'HOST_SECRET'.repeat(30_000));
    await connected;
    const good = await client.callTool({ name: TOOL, arguments: args() });
    expect(good.structuredContent).toMatchObject({ metadata: { requestId: 'invalid-request-id' } });
    const bad = await client.callTool({
      name: TOOL,
      arguments: { targetMetric: 'impressions', entries: [entry('dup', 1, 2), entry('dup', 2, 3)] },
    });
    expect(bad.structuredContent).toMatchObject({ metadata: { requestId: 'invalid-request-id' } });
    expect(JSON.stringify([good, bad])).not.toContain('HOST_SECRET');
    expect(frames.every((x) => Buffer.byteLength(x, 'utf8') <= 262_144)).toBe(true);
  });

  it('sanitizes hostile host timestamps without returning unbounded metadata', async () => {
    const fakeNow = () => ({ toISOString: () => 'SECRET_HOST_TIMESTAMP'.repeat(30_000) }) as unknown as Date;
    const { client, connected, frames } = connect(undefined, fakeNow);
    await connected;
    const success = await client.callTool({ name: TOOL, arguments: args() });
    expect(success.isError).not.toBe(true);
    expect(success.structuredContent).toMatchObject({
      metadata: { timestamp: '1970-01-01T00:00:00.000Z' },
    });
    expect(JSON.stringify(success)).not.toContain('SECRET_HOST_TIMESTAMP');
    expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
  });
});

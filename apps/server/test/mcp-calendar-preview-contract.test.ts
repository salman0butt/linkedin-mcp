import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';

const TOOL = 'linkedin.calendar.preview';
const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];

function input() {
  return {
    referenceUtc: '2026-10-27T00:00:00.000Z',
    items: [
      { id: 'next-day', label: 'Next day', kind: 'text_post', plannedAtUtc: '2026-10-29T12:30:00.000Z' },
      {
        id: 'first',
        label: 'Human article handoff',
        kind: 'manual_article_handoff',
        plannedAtUtc: '2026-10-28T08:15:00.000Z',
      },
      { id: 'collision', label: 'Image ideas', kind: 'image_post', plannedAtUtc: '2026-10-28T08:15:00.000Z' },
      {
        id: 'other',
        label: 'Multi-image ideas',
        kind: 'multi_image_post',
        plannedAtUtc: '2026-10-28T09:30:00.000Z',
      },
    ],
  };
}

function capturedClient(
  options: {
    createRequestId?: () => string;
    privateDeps?: Partial<NonNullable<Parameters<typeof createLinkedInMcpServer>[0]>>;
  } = {},
) {
  const frames: string[] = [];
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      ...options.privateDeps,
      transport: 'http',
      now: () => new Date('2026-10-27T00:00:00.000Z'),
      createRequestId: options.createRequestId ?? (() => 'm11-calendar-preview'),
    }),
  );
  handlers.push(handler);
  const client = new Client({ name: 'm11-calendar-contract', version: '1.0.0' });
  clients.push(client);
  const connect = client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: async (url, init) => {
        const request = new Request(url, init);
        const isToolCall =
          request.method === 'POST' && (await request.clone().text()).includes('"tools/call"');
        const response = await handler.fetch(request);
        if (isToolCall) frames.push(await response.clone().text());
        return response;
      },
    }),
  );
  return { client, connect, frames };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

describe('M11.0 typed stateless LOCAL_ONLY calendar preview MCP contract', () => {
  it('registers exactly one typed read-only calendar tool; no executor or provider-backed research', async () => {
    const { client, connect } = capturedClient();
    await connect;
    const { tools } = await client.listTools();
    // The M11.0 calendar preview is still one stateless tool; five M11.1
    // private-plan methods raise the default in-memory inventory to 57.
    expect(tools).toHaveLength(57);
    const matches = tools.filter((tool) => tool.name === TOOL);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['referenceUtc', 'items'],
    });
    expect(matches[0]?.outputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(tools.some((tool) => tool.name === 'linkedin.research.prepare_repurposing')).toBe(true);
    expect(tools.some((tool) => tool.name === 'linkedin.schedule.create')).toBe(false);
    expect(tools.some((tool) => tool.name === 'linkedin.research.topic')).toBe(false);
    expect(tools.some((tool) => tool.name === 'linkedin.article.native.publish')).toBe(false);
  });

  it('emits exact caller chronology, collisions, manualOnly and unqueued status with text/structured parity', async () => {
    const { client, connect, frames } = capturedClient();
    await connect;
    const result = await client.callTool({ name: TOOL, arguments: input() });
    expect(result.isError).not.toBe(true);
    const envelope = result.structuredContent as Record<string, unknown> & {
      data: { days: Array<{ utcDate: string; items: Array<{ id: string; manualOnly: boolean }> }> };
    };
    expect(envelope).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      metadata: { requestId: 'm11-calendar-preview', timestamp: '2026-10-27T00:00:00.000Z' },
      data: {
        kind: 'local_content_calendar_preview',
        status: 'planning_only',
        origin: 'caller_defined',
        persistence: 'none',
        execution: 'not_queued',
        approval: 'not_evaluated',
        publication: 'not_attempted',
        referenceUtc: input().referenceUtc,
        collisions: [{ plannedAtUtc: '2026-10-28T08:15:00.000Z', itemIds: ['first', 'collision'] }],
        warnings: [
          'caller_planned_only',
          'no_scheduling_or_publishing',
          'approval_not_evaluated',
          'same_minute_collision',
          'manual_article_handoff_only',
        ],
      },
    });
    expect(envelope.data.days.map((day) => day.utcDate)).toEqual(['2026-10-28', '2026-10-29']);
    expect(envelope.data.days[0]?.items.map((item) => [item.id, item.manualOnly])).toEqual([
      ['first', true],
      ['collision', false],
      ['other', false],
    ]);
    expect(envelope.data.days[1]?.items.map((item) => item.id)).toEqual(['next-day']);
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(envelope) }]);
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
    const serialized = JSON.stringify(result);
    for (const field of ['queuedAt', 'publishedAt', 'approvalReceiptId', 'idempotencyKey', 'postUrn']) {
      expect(serialized).not.toContain(field);
    }
  });

  it('rejects unknown secret key names and values at root and items before callback without echo', async () => {
    const { client, connect, frames } = capturedClient();
    await connect;
    const request = input();
    const key = 'PRIVATE_SECRET_FIELD_CANARY';
    const secret = 'PRIVATE_SECRET_VALUE_CANARY';
    for (const bad of [
      { ...request, [key]: secret },
      { ...request, approvalReceiptId: secret },
      { ...request, trustedGrantId: secret, approved: true },
      { ...request, provider: 'OFFICIAL_API' },
      { ...request, scheduleNow: true },
      { ...request, items: [{ ...request.items[0], [key]: secret }, ...request.items.slice(1)] },
      { ...request, items: [{ ...request.items[0], token: secret }, ...request.items.slice(1)] },
      { ...request, items: [{ ...request.items[0], retry: true }, ...request.items.slice(1)] },
    ]) {
      const result = await client.callTool({ name: TOOL, arguments: bad });
      expect(result.isError).toBe(true);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(key);
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain('OFFICIAL_API');
      expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThanOrEqual(262_144);
    }
    expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
    expect(frames.join('')).not.toContain(secret);
    expect(frames.join('')).not.toContain(key);
  });

  it('fails closed on invalid raw identifiers, formats, dates, duplicate IDs and malformed count', async () => {
    const { client, connect } = capturedClient();
    await connect;
    const request = input();
    for (const bad of [
      { ...request, items: [] },
      { ...request, items: Array.from({ length: 21 }, (_, i) => ({ ...request.items[0], id: 'id' + i })) },
      { ...request, items: [{ ...request.items[0], id: ' next-day ' }] },
      { ...request, items: [{ ...request.items[0], label: '  Padded label  ' }] },
      { ...request, items: [{ ...request.items[0], kind: 'native_article_publish' }] },
      {
        ...request,
        items: [{ ...request.items[0], id: 'FIRST' }, request.items[1], request.items[2], request.items[3]],
      },
      { ...request, referenceUtc: '2026-02-30T00:00:00.000Z' },
      { ...request, referenceUtc: '2026-10-27T00:00:00Z' },
      { ...request, items: [{ ...request.items[0], plannedAtUtc: '2026-10-28T08:15:00+00:00' }] },
      { ...request, items: [{ ...request.items[0], plannedAtUtc: '2027-03-01T08:15:00.000Z' }] },
      { ...request, items: [{ ...request.items[0], plannedAtUtc: '2026-10-27T00:00:00.000Z' }] },
    ]) {
      const response = await client.callTool({ name: TOOL, arguments: bad });
      expect(response.isError).toBe(true);
      if (response.structuredContent) {
        expect(response.structuredContent).toMatchObject({
          status: 'failed',
          provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
          error: { code: 'invalid_input', retryable: false },
        });
      }
      expect(Buffer.byteLength(JSON.stringify(response), 'utf8')).toBeLessThanOrEqual(262_144);
    }
  });

  it('bounds injected 270k host request ID in successful and handled-invalid replies', async () => {
    const { client, connect } = capturedClient({ createRequestId: () => 'R'.repeat(270_000) });
    await connect;
    for (const request of [
      input(),
      { ...input(), items: [{ ...input().items[0], plannedAtUtc: '2026-10-32T12:30:00.000Z' }] },
    ]) {
      const response = await client.callTool({ name: TOOL, arguments: request });
      expect((response.structuredContent as { metadata: { requestId: string } }).metadata.requestId).toBe(
        'invalid-request-id',
      );
      expect(Buffer.byteLength(JSON.stringify(response), 'utf8')).toBeLessThanOrEqual(262_144);
    }
  });

  it('accepts 20 bounded caller items and rejects overlong labels without reflecting them', async () => {
    const { client, connect, frames } = capturedClient();
    await connect;
    const sample = input();
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: 'item' + i,
      label: 'Plan ' + i,
      kind: 'text_post',
      plannedAtUtc: `2026-10-28T${String(i).padStart(2, '0')}:00:00.000Z`,
    }));
    const accepted = await client.callTool({ name: TOOL, arguments: { ...sample, items } });
    expect(accepted.isError).not.toBe(true);
    expect(accepted.structuredContent).toMatchObject({ status: 'succeeded' });
    expect(Buffer.byteLength(JSON.stringify(accepted), 'utf8')).toBeLessThanOrEqual(262_144);
    const secret = 'OVERSIZED_CALENDAR_LABEL_CANARY';
    const tooLarge = items.map((item) => ({ ...item, label: secret + 'q'.repeat(120) }));
    const rejected = await client.callTool({ name: TOOL, arguments: { ...sample, items: tooLarge } });
    expect(rejected.isError).toBe(true);
    expect(JSON.stringify(rejected)).not.toContain(secret);
    expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
  });

  it('never accesses injected private article or job stores', async () => {
    const accesses: string[] = [];
    const store = new Proxy(
      {},
      {
        get(_target, property) {
          accesses.push(String(property));
          throw new Error('PRIVATE_STORE_ACCESS_CANARY');
        },
      },
    );
    const { client, connect } = capturedClient({
      privateDeps: { articleStore: store as never, jobStore: store as never },
    });
    await connect;
    const result = await client.callTool({ name: TOOL, arguments: input() });
    expect(result.isError).not.toBe(true);
    expect(accesses).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_STORE_ACCESS_CANARY');
  });
});

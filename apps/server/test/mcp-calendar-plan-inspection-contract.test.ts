import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerCalendarPlanTools } from '../src/calendar-plan-mcp.js';
import { createLinkedInMcpServer } from '../src/create-server-base.js';

const TOOL = 'linkedin.calendar.plans.inspect';
const ID = '123e4567-e89b-42d3-a456-426614174000';
const AS_OF = '2026-10-28T09:00:00.000Z';
const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];

function storedPlan() {
  return {
    id: ID,
    revision: 2,
    createdAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T01:00:00.000Z',
    calendar: {
      referenceUtc: '2026-10-27T00:00:00.000Z',
      items: [
        {
          id: 'later',
          label: 'PRIVATE_LABEL_CANARY_🌍',
          kind: 'text_post',
          plannedAtUtc: '2026-10-29T10:00:00.000Z',
        },
        {
          id: 'human',
          label: 'PRIVATE_HUMAN_LABEL_🤖',
          kind: 'manual_article_handoff',
          plannedAtUtc: AS_OF,
        },
        {
          id: 'tie',
          label: 'PRIVATE_TIE_LABEL_🌻',
          kind: 'image_post',
          plannedAtUtc: AS_OF,
        },
      ],
    },
  };
}

function fakeStore() {
  return {
    get: vi.fn((input: { id: string }) => Promise.resolve(input.id === ID ? storedPlan() : null)),
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
  };
}

function connect(
  options: {
    transport?: 'stdio' | 'http';
    calendarStore?: unknown;
    requestId?: () => string;
  } = {},
) {
  const frames: string[] = [];
  const handler = createMcpHandler(() => {
    const server = createLinkedInMcpServer();
    registerCalendarPlanTools(server, {
      transport: options.transport ?? 'stdio',
      ...(options.calendarStore === undefined ? {} : { calendarStore: options.calendarStore as never }),
      createRequestId: options.requestId ?? (() => 'm11-plan-inspection'),
      now: () => new Date('2026-10-27T00:00:00.000Z'),
    });
    return server;
  });
  handlers.push(handler);
  const client = new Client({ name: 'm11-2-plan-inspection-contract', version: '1.0.0' });
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
  return { client, connected, frames };
}

const args = () => ({ id: ID, expectedRevision: 2, asOfUtc: AS_OF });

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

describe('M11.2 typed read-only private calendar plan inspection', () => {
  it('lists one new strict typed inspection tool in real MCP SDK; no scheduler or provider', async () => {
    const { client, connected } = connect();
    await connected;
    const { tools } = await client.listTools();
    const found = tools.find((tool) => tool.name === TOOL);
    expect(found).toBeDefined();
    expect(found?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['id', 'expectedRevision', 'asOfUtc'],
    });
    expect(found?.outputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(tools.filter((tool) => tool.name.startsWith('linkedin.calendar.plans.'))).toHaveLength(7);
    for (const name of ['linkedin.schedule.create', 'linkedin.article.native.publish'])
      expect(tools.some((tool) => tool.name === name)).toBe(false);
  });

  it('inspects the exact persisted revision once, partitions ties at asOf, and never reveals stored labels', async () => {
    const store = fakeStore();
    const { client, connected, frames } = connect({ calendarStore: store });
    await connected;
    const response = await client.callTool({ name: TOOL, arguments: args() });
    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      planning: {
        persistence: 'private_local',
        execution: 'not_queued',
        approval: 'not_evaluated',
        publication: 'not_attempted',
      },
      data: {
        kind: 'local_saved_plan_inspection',
        status: 'planning_only',
        origin: 'caller_defined',
        persistence: 'private_local',
        execution: 'not_queued',
        approval: 'not_evaluated',
        publication: 'not_attempted',
        id: ID,
        revision: 2,
        asOfUtc: AS_OF,
        referenceUtc: '2026-10-27T00:00:00.000Z',
        pastAsOf: [
          { id: 'human', manualOnly: true, plannedAtUtc: AS_OF },
          { id: 'tie', manualOnly: false, plannedAtUtc: AS_OF },
        ],
        futureAsOf: [{ id: 'later', manualOnly: false, plannedAtUtc: '2026-10-29T10:00:00.000Z' }],
        counts: { pastAsOf: 2, futureAsOf: 1 },
        collisions: [{ plannedAtUtc: AS_OF, itemIds: ['human', 'tie'] }],
      },
    });
    expect((response.structuredContent as { data: { planDigest: string } }).data.planDigest).toMatch(
      /^[a-f0-9]{64}$/u,
    );
    expect(store.get).toHaveBeenCalledTimes(1);
    expect(store.get).toHaveBeenCalledWith({ id: ID });
    for (const method of ['create', 'update', 'list', 'remove'] as const)
      expect(store[method]).not.toHaveBeenCalled();
    const serialized = JSON.stringify(response);
    for (const secret of ['PRIVATE_LABEL_CANARY', 'PRIVATE_HUMAN_LABEL', 'PRIVATE_TIE_LABEL'])
      expect(serialized).not.toContain(secret);
    expect(response.content).toEqual([{ type: 'text', text: JSON.stringify(response.structuredContent) }]);
    expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
  });

  it('denies unconfigured STDIO and HTTP without dereferencing poisoned private-store methods', async () => {
    let accesses = 0;
    const poisoned = Object.defineProperty({}, 'get', {
      get() {
        accesses += 1;
        throw Error('PRIVATE_GETTER_CANARY');
      },
    });
    for (const options of [
      { transport: 'stdio' as const },
      { transport: 'http' as const, calendarStore: poisoned },
    ]) {
      const { client, connected, frames } = connect(options);
      await connected;
      const response = await client.callTool({ name: TOOL, arguments: args() });
      expect(response).toMatchObject({
        isError: true,
        structuredContent: { status: 'unsupported', error: { code: 'local_store_not_available' } },
      });
      expect(frames.join('')).not.toContain('PRIVATE_GETTER_CANARY');
    }
    expect(accesses).toBe(0);
  });

  it('returns sanitized not_found and revision_conflict without mutating private store', async () => {
    const store = fakeStore();
    store.get.mockResolvedValueOnce(null);
    const { client, connected } = connect({ calendarStore: store });
    await connected;
    const missing = await client.callTool({ name: TOOL, arguments: args() });
    expect(missing).toMatchObject({
      isError: true,
      structuredContent: { status: 'failed', error: { code: 'not_found' } },
    });
    const stale = await client.callTool({ name: TOOL, arguments: { ...args(), expectedRevision: 1 } });
    expect(stale).toMatchObject({
      isError: true,
      structuredContent: { status: 'failed', error: { code: 'revision_conflict' } },
    });
    expect(store.get).toHaveBeenCalledTimes(2);
    for (const method of ['create', 'update', 'list', 'remove'] as const)
      expect(store[method]).not.toHaveBeenCalled();
  });

  it('rejects noncanonical UTC, missing arguments, forged approval and unknown secret keys before read', async () => {
    const store = fakeStore();
    const { client, connected, frames } = connect({ calendarStore: store });
    await connected;
    const secretKey = 'SECRET_PRIVATE_FIELD_KEY';
    const secretValue = 'SECRET_PRIVATE_FIELD_VALUE';
    for (const input of [
      { id: ID, expectedRevision: 2 },
      { id: 'bad', expectedRevision: 2, asOfUtc: AS_OF },
      { ...args(), expectedRevision: 0 },
      { ...args(), expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
      { ...args(), asOfUtc: '2026-02-30T09:00:00.000Z' },
      { ...args(), asOfUtc: '2026-10-28T09:00:00+00:00' },
      { ...args(), approved: true },
      { ...args(), [secretKey]: secretValue },
    ]) {
      const response = await client.callTool({ name: TOOL, arguments: input });
      expect(response.isError).toBe(true);
      expect(JSON.stringify(response)).not.toContain(secretKey);
      expect(JSON.stringify(response)).not.toContain(secretValue);
    }
    expect(store.get).not.toHaveBeenCalled();
    expect(frames.join('')).not.toContain(secretKey);
    expect(frames.join('')).not.toContain(secretValue);
  });

  it('fails closed on forged malformed store output without echoing private fields', async () => {
    const store = fakeStore();
    store.get.mockResolvedValueOnce({
      ...storedPlan(),
      calendar: {
        ...storedPlan().calendar,
        items: [{ ...storedPlan().calendar.items[0], label: 'SECRET_STORE_CANARY', approved: true }],
      },
    } as never);
    const { client, connected } = connect({ calendarStore: store });
    await connected;
    const response = await client.callTool({ name: TOOL, arguments: args() });
    expect(response).toMatchObject({
      isError: true,
      structuredContent: { status: 'failed', error: { code: 'invalid_output' } },
    });
    expect(JSON.stringify(response)).not.toContain('SECRET_STORE_CANARY');
    expect(store.get).toHaveBeenCalledTimes(1);
  });

  it('rejects accessor and Proxy stored snapshots without invoking caller-controlled getters', async () => {
    const store = fakeStore();
    let accessed = 0;
    const forged = Object.defineProperty({ ...storedPlan() }, 'calendar', {
      enumerable: true,
      get() {
        accessed++;
        throw Error('PRIVATE_ACCESSOR_SECRET_CANARY');
      },
    });
    store.get.mockResolvedValueOnce(forged);
    store.get.mockResolvedValueOnce(new Proxy(storedPlan(), {}));
    const { client, connected, frames } = connect({ calendarStore: store });
    await connected;
    for (const index of [1, 2]) {
      const result = await client.callTool({ name: TOOL, arguments: args() });
      expect(result).toMatchObject({
        isError: true,
        structuredContent: { status: 'failed', error: { code: 'invalid_output' } },
      });
      expect(JSON.stringify(result)).not.toContain('PRIVATE_ACCESSOR_SECRET_CANARY');
      expect(store.get).toHaveBeenCalledTimes(index);
    }
    expect(accessed).toBe(0);
    expect(frames.join('')).not.toContain('PRIVATE_ACCESSOR_SECRET_CANARY');
  });

  it('keeps plan-only digest constant across changed asOf times while never claiming execution', async () => {
    const store = fakeStore();
    const { client, connected } = connect({ calendarStore: store });
    await connected;
    const early = await client.callTool({
      name: TOOL,
      arguments: { ...args(), asOfUtc: '2026-10-27T12:00:00.000Z' },
    });
    const late = await client.callTool({
      name: TOOL,
      arguments: { ...args(), asOfUtc: '2026-10-29T10:00:00.000Z' },
    });
    expect(early.isError).not.toBe(true);
    expect(late.isError).not.toBe(true);
    const first = early.structuredContent as {
      data: { planDigest: string; counts: { pastAsOf: number; futureAsOf: number } };
    };
    const second = late.structuredContent as typeof first;
    expect(first.data.planDigest).toBe(second.data.planDigest);
    expect(first.data.counts).toEqual({ pastAsOf: 0, futureAsOf: 3 });
    expect(second.data.counts).toEqual({ pastAsOf: 3, futureAsOf: 0 });
    expect(store.get).toHaveBeenCalledTimes(2);
    for (const result of [early, late]) {
      expect(JSON.stringify(result)).not.toContain('PRIVATE_LABEL_CANARY');
      expect(result.structuredContent).toMatchObject({
        data: { status: 'planning_only', execution: 'not_queued', publication: 'not_attempted' },
      });
    }
  });

  it('bounds hostile host request IDs and complete MCP/SSE frames', async () => {
    const { client, connected, frames } = connect({
      calendarStore: fakeStore(),
      requestId: () => 'R'.repeat(270_000),
    });
    await connected;
    for (const input of [args(), { ...args(), expectedRevision: 1 }]) {
      const response = await client.callTool({ name: TOOL, arguments: input });
      expect(response.structuredContent).toMatchObject({ metadata: { requestId: 'invalid-request-id' } });
      expect(Buffer.byteLength(JSON.stringify(response), 'utf8')).toBeLessThanOrEqual(262_144);
    }
    expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
  });
});

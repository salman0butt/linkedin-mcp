import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerCalendarPlanTools } from '../src/calendar-plan-mcp.js';
import { createLinkedInMcpServer } from '../src/create-server-base.js';

const TOOL = 'linkedin.calendar.plans.compare_slots';
const FIRST = '123e4567-e89b-42d3-a456-426614174000';
const SECOND = '123e4567-e89b-42d3-a456-426614174001';
const MATCH = '2026-10-29T09:00:00.000Z';
const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];

function plan(id: string) {
  return {
    id,
    revision: id === FIRST ? 2 : 3,
    createdAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T01:00:00.000Z',
    calendar: {
      referenceUtc: '2026-10-27T00:00:00.000Z',
      items:
        id === FIRST
          ? [
              {
                id: 'later',
                label: 'SECRET_PRIVATE_LABEL_ALPHA 🌻',
                kind: 'text_post',
                plannedAtUtc: '2026-10-30T08:00:00.000Z',
              },
              {
                id: 'shared',
                label: 'SECRET_PRIVATE_LABEL_BETA 🌎',
                kind: 'manual_article_handoff',
                plannedAtUtc: MATCH,
              },
              { id: 'tied', label: 'SECRET_PRIVATE_LABEL_GAMMA 🐛', kind: 'image_post', plannedAtUtc: MATCH },
            ]
          : [
              {
                id: 'shared',
                label: 'SECRET_PRIVATE_LABEL_DELTA 🫥',
                kind: 'multi_image_post',
                plannedAtUtc: MATCH,
              },
              {
                id: 'other',
                label: 'SECRET_PRIVATE_LABEL_EPSILON 🍃',
                kind: 'text_post',
                plannedAtUtc: '2026-10-31T10:00:00.000Z',
              },
            ],
    },
  };
}

function fakeStore() {
  return {
    get: vi.fn(
      (input: { id: string }): Promise<unknown> =>
        Promise.resolve(input.id === FIRST || input.id === SECOND ? plan(input.id) : null),
    ),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
  };
}

function connect(
  options: { transport?: 'stdio' | 'http'; calendarStore?: unknown; requestId?: () => string } = {},
) {
  const frames: string[] = [];
  const handler = createMcpHandler(() => {
    const server = createLinkedInMcpServer();
    registerCalendarPlanTools(server, {
      transport: options.transport ?? 'stdio',
      ...(options.calendarStore === undefined ? {} : { calendarStore: options.calendarStore as never }),
      createRequestId: options.requestId ?? (() => 'm11-cross-plan-comparison'),
      now: () => new Date('2026-10-27T00:00:00.000Z'),
    });
    return server;
  });
  handlers.push(handler);
  const client = new Client({ name: 'm11-3-plan-comparison', version: '1.0.0' });
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

const args = () => ({
  plans: [
    { id: FIRST, expectedRevision: 2 },
    { id: SECOND, expectedRevision: 3 },
  ],
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

describe('M11.3 private read-only cross-plan UTC comparison MCP', () => {
  it('registers exactly one additional strict typed MCP SDK tool without a scheduler or publisher', async () => {
    const { client, connected } = connect();
    await connected;
    const { tools } = await client.listTools();
    expect(tools.find((tool) => tool.name === TOOL)).toMatchObject({
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['plans'],
        properties: { plans: { type: 'array', minItems: 2, maxItems: 2 } },
      },
      outputSchema: { type: 'object', additionalProperties: false },
    });
    expect(tools.filter((tool) => tool.name.startsWith('linkedin.calendar.plans.'))).toHaveLength(7);
    expect(tools.some((tool) => tool.name === 'linkedin.schedule.create')).toBe(false);
    expect(tools.some((tool) => tool.name === 'linkedin.article.native.publish')).toBe(false);
  });

  it('reads each selected revision exactly once and reports only metadata and non-atomic status', async () => {
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
        kind: 'local_cross_plan_utc_slot_comparison',
        status: 'planning_only',
        origin: 'caller_defined',
        persistence: 'private_local',
        execution: 'not_queued',
        approval: 'not_evaluated',
        publication: 'not_attempted',
        snapshotConsistency: 'independent_revisions_not_atomic',
        plans: [
          { id: FIRST, revision: 2, itemCount: 3 },
          { id: SECOND, revision: 3, itemCount: 2 },
        ],
        collisions: [
          {
            plannedAtUtc: MATCH,
            items: [
              { planId: FIRST, itemId: 'shared', kind: 'manual_article_handoff', manualOnly: true },
              { planId: FIRST, itemId: 'tied', kind: 'image_post', manualOnly: false },
              { planId: SECOND, itemId: 'shared', kind: 'multi_image_post', manualOnly: false },
            ],
          },
        ],
        counts: { comparedPlans: 2, collisionMinutes: 1, collisionItems: 3 },
        warnings: [
          'caller_planned_only',
          'independent_revisions_not_atomic',
          'no_scheduling_or_publishing',
          'approval_not_evaluated',
          'cross_plan_same_minute_collision',
        ],
      },
    });
    expect(store.get).toHaveBeenCalledTimes(2);
    expect(store.get.mock.calls).toEqual([[{ id: FIRST }], [{ id: SECOND }]]);
    for (const other of ['create', 'update', 'remove', 'list'] as const)
      expect(store[other]).not.toHaveBeenCalled();
    for (const privateValue of ['SECRET_PRIVATE_LABEL', 'SECRET_PRIVATE_FIELD', 'approved:true'])
      expect(JSON.stringify(response)).not.toContain(privateValue);
    expect(response.content).toEqual([{ type: 'text', text: JSON.stringify(response.structuredContent) }]);
    expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
  });

  it('returns no conflicts when minutes differ and preserves caller plan ordering when reversed', async () => {
    const store = fakeStore();
    const originalGet = store.get.getMockImplementation()!;
    store.get.mockImplementation((input) =>
      input.id === SECOND
        ? Promise.resolve({
            ...plan(SECOND),
            calendar: {
              ...plan(SECOND).calendar,
              items: [
                {
                  id: 'unshared',
                  label: 'PRIVATE_NONCOLLIDING_LABEL',
                  kind: 'text_post',
                  plannedAtUtc: '2026-11-01T11:00:00.000Z',
                },
              ],
            },
          })
        : originalGet(input),
    );
    const { client, connected } = connect({ calendarStore: store });
    await connected;
    const result = await client.callTool({
      name: TOOL,
      arguments: { plans: [args().plans[1], args().plans[0]] },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      data: {
        plans: [
          { id: SECOND, revision: 3 },
          { id: FIRST, revision: 2 },
        ],
        collisions: [],
        counts: { comparedPlans: 2, collisionMinutes: 0, collisionItems: 0 },
        warnings: [
          'caller_planned_only',
          'independent_revisions_not_atomic',
          'no_scheduling_or_publishing',
          'approval_not_evaluated',
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_NONCOLLIDING_LABEL');
    expect(store.get.mock.calls).toEqual([[{ id: SECOND }], [{ id: FIRST }]]);
  });

  it('rejects HTTP and unconfigured STDIO before touching a poisoned injected private store getter', async () => {
    let getterCalls = 0;
    const poisoned = Object.defineProperty({}, 'get', {
      get() {
        getterCalls++;
        throw Error('PRIVATE_STORE_GETTER_SECRET');
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
      expect(frames.join('')).not.toContain('PRIVATE_STORE_GETTER_SECRET');
    }
    expect(getterCalls).toBe(0);
  });

  it('pre-handler rejects malformed pair, duplicate IDs, extra secret keys and invalid revisions with zero reads', async () => {
    const store = fakeStore();
    const { client, connected, frames } = connect({ calendarStore: store });
    await connected;
    const secretKey = 'PRIVATE_SECRET_FIELD_KEY_8844';
    const secretValue = 'PRIVATE_SECRET_FIELD_VALUE_8844';
    const invalid = [
      {},
      { plans: [] },
      { plans: [args().plans[0]] },
      { plans: [...args().plans, args().plans[0]] },
      { plans: [args().plans[0], args().plans[0]] },
      { plans: [{ id: FIRST, expectedRevision: 0 }, args().plans[1]] },
      { plans: [{ id: FIRST, expectedRevision: Number.MAX_SAFE_INTEGER + 1 }, args().plans[1]] },
      { plans: [{ id: 'not-uuid', expectedRevision: 1 }, args().plans[1]] },
      { ...args(), approved: true },
      { ...args(), [secretKey]: secretValue },
      { plans: [{ ...args().plans[0], [secretKey]: secretValue }, args().plans[1]] },
    ];
    for (const candidate of invalid) {
      const response = await client.callTool({ name: TOOL, arguments: candidate });
      expect(response.isError).toBe(true);
      expect(JSON.stringify(response)).not.toContain(secretKey);
      expect(JSON.stringify(response)).not.toContain(secretValue);
    }
    expect(frames.join('')).not.toContain(secretKey);
    expect(frames.join('')).not.toContain(secretValue);
    expect(store.get).not.toHaveBeenCalled();
  });

  it('sanitizes missing plans, revision mismatches and malicious underlying store errors', async () => {
    const store = fakeStore();
    store.get.mockResolvedValueOnce(null);
    const { client, connected } = connect({ calendarStore: store });
    await connected;
    const notFound = await client.callTool({ name: TOOL, arguments: args() });
    expect(notFound).toMatchObject({
      isError: true,
      structuredContent: { status: 'failed', error: { code: 'not_found' } },
    });
    expect(store.get).toHaveBeenCalledTimes(1);
    store.get.mockClear();
    const stale = await client.callTool({
      name: TOOL,
      arguments: { plans: [{ id: FIRST, expectedRevision: 1 }, args().plans[1]] },
    });
    expect(stale).toMatchObject({
      isError: true,
      structuredContent: { status: 'failed', error: { code: 'revision_conflict' } },
    });
    expect(store.get).toHaveBeenCalledTimes(2);
    store.get.mockRejectedValueOnce(Object.assign(Error('SECRET_STORE_PATH_992'), { kind: 'unsafe_store' }));
    const unsafe = await client.callTool({ name: TOOL, arguments: args() });
    expect(unsafe).toMatchObject({
      isError: true,
      structuredContent: { status: 'failed', error: { code: 'unsafe_store' } },
    });
    expect(JSON.stringify([notFound, stale, unsafe])).not.toContain('SECRET_STORE_PATH_992');
  });

  it('fails closed on malformed private snapshots without leaking labels, including proxies and accessors', async () => {
    const store = fakeStore();
    let accessed = 0;
    const accessor = Object.defineProperty({ ...plan(FIRST) }, 'calendar', {
      enumerable: true,
      get() {
        accessed++;
        throw Error('PRIVATE_ACCESSOR_SECRET_CANARY');
      },
    });
    const invalid = [
      { ...plan(FIRST), calendar: { ...plan(FIRST).calendar, secret: 'SECRET_STORED_LABEL_123' } },
      accessor,
      new Proxy(plan(FIRST), {}),
      {
        ...plan(FIRST),
        calendar: {
          ...plan(FIRST).calendar,
          items: [
            { ...plan(FIRST).calendar.items[0], id: 'DUPE' },
            { ...plan(FIRST).calendar.items[1], id: 'dupe' },
          ],
        },
      },
    ];
    const { client, connected } = connect({ calendarStore: store });
    await connected;
    for (const snapshot of invalid) {
      store.get.mockResolvedValueOnce(snapshot);
      const response = await client.callTool({ name: TOOL, arguments: args() });
      expect(response).toMatchObject({
        isError: true,
        structuredContent: { status: 'failed', error: { code: 'invalid_output' } },
      });
      expect(JSON.stringify(response)).not.toContain('SECRET_STORED_LABEL_123');
      expect(JSON.stringify(response)).not.toContain('PRIVATE_ACCESSOR_SECRET_CANARY');
    }
    expect(accessed).toBe(0);
  });

  it('bounds hostile 270k request IDs and complete raw SSE on success and error', async () => {
    const { client, connected, frames } = connect({
      calendarStore: fakeStore(),
      requestId: () => 'S'.repeat(270_000),
    });
    await connected;
    for (const candidate of [
      args(),
      { plans: [args().plans[0], { ...args().plans[1], expectedRevision: 1 }] },
    ]) {
      const response = await client.callTool({ name: TOOL, arguments: candidate });
      expect(response.structuredContent).toMatchObject({ metadata: { requestId: 'invalid-request-id' } });
      expect(Buffer.byteLength(JSON.stringify(response), 'utf8')).toBeLessThanOrEqual(262_144);
    }
    expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
  });
});

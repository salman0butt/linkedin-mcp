import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerCalendarPlanTools } from '../src/calendar-plan-mcp.js';
import { createLinkedInMcpServer } from '../src/create-server-base.js';

const PREFIX = 'linkedin.calendar.plans.';
const ID = '123e4567-e89b-42d3-a456-426614174000';
const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];

function calendar() {
  return {
    referenceUtc: '2026-10-27T00:00:00.000Z',
    items: [
      {
        id: 'human',
        label: 'Publish manually 🌻',
        kind: 'manual_article_handoff',
        plannedAtUtc: '2026-10-28T09:00:00.000Z',
      },
      { id: 'text', label: 'Text idea', kind: 'text_post', plannedAtUtc: '2026-10-28T09:00:00.000Z' },
    ],
  };
}

function project() {
  return {
    id: ID,
    revision: 1,
    createdAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
    calendar: calendar(),
  };
}

function fakeStore() {
  return {
    create: vi.fn(() => Promise.resolve(project())),
    update: vi.fn(() => Promise.resolve({ ...project(), revision: 2 })),
    get: vi.fn(() => Promise.resolve(project())),
    list: vi.fn(() =>
      Promise.resolve([
        {
          id: ID,
          revision: 1,
          createdAt: project().createdAt,
          updatedAt: project().updatedAt,
          referenceUtc: calendar().referenceUtc,
          itemCount: 2,
        },
      ]),
    ),
    remove: vi.fn(() => Promise.resolve(true)),
  };
}

function clientFor(
  options: {
    transport?: 'stdio' | 'http';
    calendarStore?: ReturnType<typeof fakeStore> | object;
    requestId?: () => string;
  } = {},
) {
  const frames: string[] = [];
  const handler = createMcpHandler(() => {
    const server = createLinkedInMcpServer();
    registerCalendarPlanTools(server, {
      transport: options.transport ?? 'stdio',
      ...(options.calendarStore === undefined ? {} : { calendarStore: options.calendarStore as never }),
      createRequestId: options.requestId ?? (() => 'calendar-m11-1'),
      now: () => new Date('2026-10-27T00:00:00.000Z'),
    });
    return server;
  });
  handlers.push(handler);
  const client = new Client({ name: 'calendar-plans-contract', version: '1.0.0' });
  clients.push(client);
  const connected = client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: async (url, init) => {
        const request = new Request(url, init);
        const isToolCall =
          request.method === 'POST' && (await request.clone().text()).includes('"tools/call"');
        const response = await handler.fetch(request);
        if (isToolCall) {
          frames.push(await response.clone().text());
        }
        return response;
      },
    }),
  );
  return { client, connected, frames };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

describe('M11.1 private planning-only calendar MCP contracts', () => {
  it('registers seven strictly typed private calendar operations over the real SDK; no scheduling or publication', async () => {
    const { client, connected } = clientFor();
    await connected;
    const { tools } = await client.listTools();
    for (const method of ['compare_slots', 'create', 'update', 'get', 'inspect', 'list', 'remove']) {
      expect(tools.find((tool) => tool.name === `${PREFIX}${method}`)).toMatchObject({
        inputSchema: { type: 'object', additionalProperties: false },
        outputSchema: { type: 'object', additionalProperties: false },
      });
    }
    expect(tools.filter((tool) => tool.name.startsWith(PREFIX))).toHaveLength(7);
    expect(tools.some((tool) => tool.name === 'linkedin.schedule.create')).toBe(false);
    expect(tools.some((tool) => tool.name === 'linkedin.article.native.publish')).toBe(false);
  });

  it('fails closed for every method without STDIO opt-in and for HTTP even with an injected private store', async () => {
    const store = fakeStore();
    const actions = [
      { name: `${PREFIX}create`, arguments: { idempotencyKey: 'idempotency-plan-1', calendar: calendar() } },
      { name: `${PREFIX}update`, arguments: { id: ID, expectedRevision: 1, calendar: calendar() } },
      { name: `${PREFIX}get`, arguments: { id: ID } },
      { name: `${PREFIX}list`, arguments: {} },
      { name: `${PREFIX}remove`, arguments: { id: ID, expectedRevision: 1 } },
    ];
    for (const opts of [
      { transport: 'stdio' as const },
      { transport: 'http' as const, calendarStore: store },
    ]) {
      const { client, connected, frames } = clientFor(opts);
      await connected;
      for (const action of actions) {
        const response = await client.callTool(action);
        expect(response).toMatchObject({
          isError: true,
          structuredContent: { status: 'unsupported', error: { code: 'local_store_not_available' } },
        });
        expect(JSON.stringify(response)).not.toContain('Publish manually');
      }
      expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
    }
    for (const method of Object.values(store)) expect(method).not.toHaveBeenCalled();
  });

  it('returns private planning-only provenance through create/update/get/list/remove with dual response parity', async () => {
    const store = fakeStore();
    const { client, connected, frames } = clientFor({ calendarStore: store });
    await connected;
    for (const [method, args] of [
      ['create', { idempotencyKey: 'idempotency-plan-1', calendar: calendar() }],
      ['update', { id: ID, expectedRevision: 1, calendar: calendar() }],
      ['get', { id: ID }],
      ['list', {}],
      ['remove', { id: ID, expectedRevision: 1 }],
    ] as const) {
      const result = await client.callTool({ name: `${PREFIX}${method}`, arguments: args });
      expect(result.isError).not.toBe(true);
      const value = result.structuredContent as Record<string, unknown>;
      expect(value).toMatchObject({
        status: 'succeeded',
        provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      });
      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(value) }]);
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(262_144);
      if (method === 'create' || method === 'update' || method === 'get') {
        expect(value.data).toMatchObject({
          persistence: 'private_local',
          execution: 'not_queued',
          approval: 'not_evaluated',
          publication: 'not_attempted',
          calendar: { referenceUtc: calendar().referenceUtc },
        });
        expect(
          (value.data as { calendar: { items: Array<{ label: string }> } }).calendar.items[0]?.label,
        ).toBe('Publish manually 🌻');
      }
      if (method === 'list') {
        expect(value.data).toEqual([
          {
            id: ID,
            revision: 1,
            createdAt: project().createdAt,
            updatedAt: project().updatedAt,
            referenceUtc: calendar().referenceUtc,
            itemCount: 2,
          },
        ]);
        expect(JSON.stringify(value)).not.toContain('Publish manually');
      }
    }
    expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
    expect(store.create).toHaveBeenCalledWith({ idempotencyKey: 'idempotency-plan-1', calendar: calendar() });
  });

  it('rejects unknown key names and secret values before calling the store, including nested calendar/items', async () => {
    const store = fakeStore();
    const { client, connected, frames } = clientFor({ calendarStore: store });
    await connected;
    const secretKey = 'SECRET_PRIVATE_ACCESS_KEY_CANARY';
    const secretValue = 'SECRET_PRIVATE_ACCESS_VALUE_CANARY';
    const variants = [
      { idempotencyKey: 'idempotency-plan-1', calendar: calendar(), [secretKey]: secretValue },
      { idempotencyKey: 'idempotency-plan-1', calendar: { ...calendar(), [secretKey]: secretValue } },
      {
        idempotencyKey: 'idempotency-plan-1',
        calendar: { ...calendar(), items: [{ ...calendar().items[0], [secretKey]: secretValue }] },
      },
      { idempotencyKey: 'idempotency-plan-1', calendar: calendar(), approved: true },
      { idempotencyKey: 'idempotency-plan-1', calendar: calendar(), publishNow: true },
    ];
    for (const args of variants) {
      const result = await client.callTool({ name: `${PREFIX}create`, arguments: args });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain(secretKey);
      expect(JSON.stringify(result)).not.toContain(secretValue);
    }
    expect(frames.join('')).not.toContain(secretKey);
    expect(frames.join('')).not.toContain(secretValue);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('bounds a hostile 270KiB host ID on success and failure', async () => {
    const { client, connected, frames } = clientFor({
      calendarStore: fakeStore(),
      requestId: () => 'R'.repeat(270_000),
    });
    await connected;
    for (const args of [{ id: ID }, { id: 'invalid' }]) {
      const response = await client.callTool({ name: `${PREFIX}get`, arguments: args });
      if (response.structuredContent)
        expect(response.structuredContent).toMatchObject({ metadata: { requestId: 'invalid-request-id' } });
      expect(Buffer.byteLength(JSON.stringify(response), 'utf8')).toBeLessThanOrEqual(262_144);
    }
    expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
  });

  it('maps revision conflicts and uncertain commit outcomes to sanitized fixed errors', async () => {
    const store = fakeStore();
    store.update.mockRejectedValueOnce(
      Object.assign(new Error('PRIVATE_RAW_PATH_CANARY'), { kind: 'revision_conflict' }),
    );
    store.update.mockRejectedValueOnce(
      Object.assign(new Error('PRIVATE_RAW_PATH_CANARY'), { kind: 'outcome_unknown' }),
    );
    const { client, connected } = clientFor({ calendarStore: store });
    await connected;
    const request = {
      name: `${PREFIX}update`,
      arguments: { id: ID, expectedRevision: 1, calendar: calendar() },
    };
    const stale = await client.callTool(request);
    expect(stale).toMatchObject({
      isError: true,
      structuredContent: { status: 'failed', error: { code: 'revision_conflict', retryable: false } },
    });
    const ambiguous = await client.callTool(request);
    expect(ambiguous).toMatchObject({
      isError: true,
      structuredContent: { status: 'partial', error: { code: 'outcome_unknown', retryable: true } },
    });
    expect(JSON.stringify([stale, ambiguous])).not.toContain('PRIVATE_RAW_PATH_CANARY');
  });

  it('fails safely on an overlarge or malicious store result after mutation without leaking it', async () => {
    const store = fakeStore();
    store.create.mockResolvedValueOnce({
      ...project(),
      calendar: {
        ...calendar(),
        items: [{ ...calendar().items[0], label: 'SECRET_STORE_CANARY' + 'x'.repeat(270_000) }],
      },
    } as never);
    const { client, connected, frames } = clientFor({ calendarStore: store });
    await connected;
    const result = await client.callTool({
      name: `${PREFIX}create`,
      arguments: { idempotencyKey: 'idempotency-plan-1', calendar: calendar() },
    });
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { status: 'partial', error: { code: 'outcome_unknown' } },
    });
    expect(JSON.stringify(result)).not.toContain('SECRET_STORE_CANARY');
    expect(frames.every((frame) => Buffer.byteLength(frame, 'utf8') <= 262_144)).toBe(true);
  });

  it('does not return a structurally valid but semantically corrupt stored calendar', async () => {
    const store = fakeStore();
    store.create.mockResolvedValueOnce({
      ...project(),
      calendar: {
        ...calendar(),
        items: [
          { ...calendar().items[0], id: 'DUPLICATE', label: 'PRIVATE_CORRUPTION_CANARY' },
          { ...calendar().items[1], id: 'duplicate' },
        ],
      },
    } as never);
    const { client, connected, frames } = clientFor({ calendarStore: store });
    await connected;
    const result = await client.callTool({
      name: `${PREFIX}create`,
      arguments: { idempotencyKey: 'idempotency-plan-1', calendar: calendar() },
    });
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { status: 'partial', error: { code: 'outcome_unknown' } },
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CORRUPTION_CANARY');
    expect(frames.join('')).not.toContain('PRIVATE_CORRUPTION_CANARY');
  });
});

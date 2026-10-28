import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkedInMcpServer } from '../src/create-server.js';
import { registerOrganizationEditorialHandoffTools } from '../src/organization-handoff-mcp.js';

const TOOL = 'linkedin.organization.content_handoff.prepare';
const ERROR = 'Organization editorial handoff could not be safely prepared.';
const LIMIT = 262_144;
const clients: Client[] = [];
const handlers: Array<ReturnType<typeof createMcpHandler>> = [];

function request() {
  return {
    organizationUrn: 'urn:li:organization:987654321',
    drafts: [{ id: 'draft-1', text: '  Launch update 📣\n#Product #Team  ' }],
  };
}

function connect({
  createRequestId = () => 'm13-organization-safe-id',
  now = () => new Date('2026-10-28T10:00:00.000Z'),
  independent = false,
}: {
  createRequestId?: () => string;
  now?: () => Date;
  independent?: boolean;
} = {}) {
  const frames: string[] = [];
  const handler = createMcpHandler(() => {
    if (!independent) return createLinkedInMcpServer({ createRequestId, now });
    const server = new McpServer({ name: 'm13-independent', version: '1.0.0' });
    registerOrganizationEditorialHandoffTools(server, { createRequestId, now });
    return server;
  });
  handlers.push(handler);
  const client = new Client({ name: 'm13-editorial-handoff-client', version: '1.0.0' });
  clients.push(client);
  const connected = client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: async (url, init) => {
        const incoming = new Request(url, init);
        const isCall = incoming.method === 'POST' && (await incoming.clone().text()).includes('"tools/call"');
        const response = await handler.fetch(incoming);
        if (isCall) frames.push(await response.clone().text());
        return response;
      },
    }),
  );
  return { client, connected, frames, handler };
}

function checkBounded(frames: readonly string[]) {
  expect(frames.length).toBeGreaterThan(0);
  for (const frame of frames) expect(Buffer.byteLength(frame, 'utf8')).toBeLessThanOrEqual(LIMIT);
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

describe('M13.0 real SDK organization editorial handoff', () => {
  it('registers once in integrated server, advertises exact strict typed schemas and no official org publisher', async () => {
    const { client, connected } = connect();
    await connected;
    const { tools } = await client.listTools();
    const matches = tools.filter((tool) => tool.name === TOOL);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['organizationUrn', 'drafts'],
        properties: { drafts: { type: 'array', minItems: 1, maxItems: 5 } },
      },
      outputSchema: { type: 'object', additionalProperties: false },
    });
    const itemSchema = (
      matches[0]!.inputSchema.properties!.drafts as { items: { additionalProperties: boolean } }
    ).items;
    expect(itemSchema.additionalProperties).toBe(false);
    expect(tools.some((tool) => tool.name === 'linkedin.organization.post.create')).toBe(false);
    expect(tools.some((tool) => tool.name === 'linkedin.organization.roles.verify')).toBe(false);
  });

  it('registers and works independently with a bare real SDK server and no provider, auth, or store', async () => {
    const { client, connected, frames } = connect({ independent: true });
    await connected;
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([TOOL]);
    const response = await client.callTool({ name: TOOL, arguments: request() });
    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      data: {
        kind: 'local_organization_editorial_handoff',
        status: 'manual_editorial_handoff_only',
        provenance: 'caller_supplied_unverified',
        organizationUrn: request().organizationUrn,
      },
    });
    expect(response.content).toEqual([{ type: 'text', text: JSON.stringify(response.structuredContent) }]);
    checkBounded(frames);
  });

  it('returns exact manual-only provenance and preserves Unicode, hashtags, whitespace and ordered drafts', async () => {
    const { client, connected, frames } = connect();
    await connected;
    const drafts = [
      { id: 'launch-1', text: '  Hello #World 📣\nNext line\t  ' },
      { id: 'release-2', text: 'مرحبا ✨ 日本語\n#Launch' },
    ];
    const response = await client.callTool({
      name: TOOL,
      arguments: { organizationUrn: 'urn:li:organization:1', drafts },
    });
    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY', name: 'linkedin-mcp' },
      data: {
        kind: 'local_organization_editorial_handoff',
        status: 'manual_editorial_handoff_only',
        provenance: 'caller_supplied_unverified',
        organizationUrn: 'urn:li:organization:1',
        organizationAuthorization: 'not_evaluated',
        organizationRole: 'not_verified',
        scopes: 'not_checked',
        approval: 'not_issued',
        publication: 'not_attempted',
        schedule: 'not_created',
        providerData: 'not_fetched',
        drafts,
        warnings: ['organization_claim_unverified', 'manual_copy_only', 'no_org_permissions_or_publication'],
      },
      metadata: { requestId: 'm13-organization-safe-id', timestamp: '2026-10-28T10:00:00.000Z' },
    });
    const actual = response.structuredContent as { data: Record<string, unknown> };
    expect(Object.keys(actual.data).sort()).toEqual([
      'approval',
      'drafts',
      'kind',
      'organizationAuthorization',
      'organizationRole',
      'organizationUrn',
      'provenance',
      'providerData',
      'publication',
      'schedule',
      'scopes',
      'status',
      'warnings',
    ]);
    expect(response.content).toEqual([{ type: 'text', text: JSON.stringify(response.structuredContent) }]);
    expect(JSON.stringify(response)).not.toMatch(
      /w_organization_social|ADMINISTRATOR|OFFICIAL_API|lifecycleState|postUrn|payloadHash/u,
    );
    checkBounded(frames);
  });

  it('returns five complete maximum-length drafts without truncated dual content or oversized SSE', async () => {
    const { client, connected, frames } = connect();
    await connected;
    const drafts = Array.from({ length: 5 }, (_, index) => ({
      id: 'draft-' + index,
      text: 'x'.repeat(3_000),
    }));
    const result = await client.callTool({
      name: TOOL,
      arguments: { organizationUrn: 'urn:li:organization:123', drafts },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ data: { drafts } });
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }]);
    const parsed = result.structuredContent as { data: object };
    expect(Buffer.byteLength(JSON.stringify(parsed.data), 'utf8')).toBeLessThanOrEqual(32_768);
    checkBounded(frames);
  });

  it('rejects secret-bearing unknown root/draft fields pre-handler with no key or value echo', async () => {
    let invocationCount = 0;
    const { client, connected, frames } = connect({
      createRequestId: () => {
        invocationCount++;
        return 'safe';
      },
    });
    await connected;
    const base = request();
    const cases = [
      { ...base, SECRET_ACCESS_KEY: 'TOKEN_NEVER_ECHO' },
      { ...base, role: 'ADMINISTRATOR', scopes: ['w_organization_social'], credential: 'TOKEN_NEVER_ECHO' },
      { ...base, drafts: [{ ...base.drafts[0], PRIVATE_ORGANIZATION_SECRET: 'TOKEN_NEVER_ECHO' }] },
      { ...base, drafts: [{ ...base.drafts[0], '🔐_SECRET_FIELD': 'TOKEN_NEVER_ECHO' }] },
      { ...base, drafts: [{ ...base.drafts[0], token: 'TOKEN_NEVER_ECHO' }] },
    ];
    for (const candidate of cases) {
      const response = await client.callTool({ name: TOOL, arguments: candidate });
      expect(response.isError).toBe(true);
      expect(JSON.stringify(response)).not.toMatch(
        /SECRET_ACCESS_KEY|TOKEN_NEVER_ECHO|PRIVATE_ORGANIZATION_SECRET|SECRET_FIELD|credential|w_organization_social/u,
      );
      checkBounded(frames);
    }
    expect(invocationCount).toBe(0);
  });

  it('rejects malformed organization identity, blank/long/missing/duplicate draft fields and cardinality', async () => {
    const { client, connected, frames } = connect();
    await connected;
    const base = request();
    const cases = [
      { ...base, organizationUrn: 'urn:li:person:1' },
      { ...base, organizationUrn: 'urn:li:organization:0' },
      { ...base, organizationUrn: 'urn:li:organization:01' },
      { ...base, organizationUrn: 'urn:li:organization:12345678901234567890' },
      { ...base, organizationUrn: 'https://linkedin.com/company/acme' },
      { ...base, drafts: [] },
      { ...base, drafts: Array.from({ length: 6 }, (_, i) => ({ id: 'item-' + i, text: 'text' })) },
      { ...base, drafts: [{ id: '_invalid', text: 'text' }] },
      { ...base, drafts: [{ id: 'valid', text: ' \t\n ' }] },
      { ...base, drafts: [{ id: 'valid', text: 'x'.repeat(3_001) }] },
      {
        ...base,
        drafts: [
          { id: 'valid', text: 'hello' },
          { id: 'valid', text: 'again' },
        ],
      },
      { ...base, drafts: [{ id: 'valid', text: '\uD800' }] },
      { ...base, drafts: [{ id: 'valid' }] },
    ];
    for (const candidate of cases) {
      const response = await client.callTool({ name: TOOL, arguments: candidate });
      expect(response.isError).toBe(true);
      checkBounded(frames);
    }
  });

  it('enforces the 16 KiB UTF-8 input ceiling even for Zod-valid 5-draft text arrays', async () => {
    const { client, connected, frames } = connect();
    await connected;
    const input = {
      organizationUrn: 'urn:li:organization:77',
      drafts: Array.from({ length: 5 }, (_, i) => ({
        id: 'unicode-' + i,
        text: '界'.repeat(3_000),
      })),
    };
    const response = await client.callTool({ name: TOOL, arguments: input });
    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      status: 'failed',
      error: { code: 'invalid_input', message: ERROR, retryable: false },
      provider: { type: 'LOCAL_ONLY' },
    });
    expect(response.content).toEqual([{ type: 'text', text: JSON.stringify(response.structuredContent) }]);
    expect(JSON.stringify(response)).not.toContain('界');
    checkBounded(frames);
  });

  it('neutralizes a 330k hostile host request ID on successful and failed replies', async () => {
    const { client, connected, frames } = connect({
      createRequestId: () => 'HOST_SECRET_CANARY'.repeat(20_000),
    });
    await connected;
    const ok = await client.callTool({ name: TOOL, arguments: request() });
    const bad = await client.callTool({
      name: TOOL,
      arguments: {
        ...request(),
        drafts: [
          { id: 'dup', text: '1' },
          { id: 'dup', text: '2' },
        ],
      },
    });
    expect(ok.isError).not.toBe(true);
    expect(bad.isError).toBe(true);
    expect(ok.structuredContent).toMatchObject({ metadata: { requestId: 'invalid-request-id' } });
    expect(bad.structuredContent).toMatchObject({
      status: 'failed',
      metadata: { requestId: 'invalid-request-id' },
      error: { code: 'invalid_input', message: ERROR, retryable: false },
    });
    expect(JSON.stringify([ok, bad])).not.toContain('HOST_SECRET_CANARY');
    checkBounded(frames);
  });

  it('is resilient to poisoned clocks, invalid Date subclasses/proxies and thrown host callbacks', async () => {
    const date = new Date('2026-10-28T10:00:00.000Z');
    let gettersRead = 0;
    Object.defineProperty(date, 'toISOString', {
      get() {
        gettersRead++;
        throw new Error('HOST_CLOCK_PRIVATE_VALUE');
      },
    });
    class HostileDate extends Date {
      override toISOString() {
        return 'HOST_CLOCK_PRIVATE_VALUE'.repeat(30_000);
      }
    }
    const clocks: Array<{ now: () => Date; expected: string }> = [
      { now: () => date, expected: '2026-10-28T10:00:00.000Z' },
      { now: () => new HostileDate('2026-10-28T10:00:00.000Z'), expected: '2026-10-28T10:00:00.000Z' },
      {
        now: () => ({ toISOString: () => 'HOST_CLOCK_PRIVATE_VALUE'.repeat(30_000) }) as unknown as Date,
        expected: '1970-01-01T00:00:00.000Z',
      },
      {
        now: () =>
          new Proxy(new Date(), {
            get() {
              throw new Error('HOST_CLOCK_PRIVATE_VALUE');
            },
          }),
        expected: '1970-01-01T00:00:00.000Z',
      },
      { now: () => new Date(NaN), expected: '1970-01-01T00:00:00.000Z' },
      {
        now: () => {
          throw new Error('HOST_CLOCK_PRIVATE_VALUE');
        },
        expected: '1970-01-01T00:00:00.000Z',
      },
    ];
    for (const { now, expected } of clocks) {
      const { client, connected, frames } = connect({ now });
      await connected;
      const response = await client.callTool({ name: TOOL, arguments: request() });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ metadata: { timestamp: expected } });
      expect(JSON.stringify(response)).not.toContain('HOST_CLOCK_PRIVATE_VALUE');
      checkBounded(frames);
    }
    expect(gettersRead).toBe(0);
  });

  it('keeps raw JSON-RPC/SSE under 256 KiB with a 128-byte escaped client request ID', async () => {
    const { handler } = connect({ independent: true });
    const id = '\u0000'.repeat(128);
    const raw = await handler.fetch(
      new Request('http://test.local/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name: TOOL, arguments: request() },
        }),
      }),
    );
    const wire = await raw.text();
    expect(raw.status).toBe(200);
    expect(Buffer.byteLength(wire, 'utf8')).toBeLessThanOrEqual(LIMIT);
    const event: unknown = JSON.parse(
      wire
        .split('\n')
        .find((line) => line.startsWith('data: '))!
        .slice(6),
    );
    const parsed = event as {
      id: string;
      result: { structuredContent: unknown; content: Array<{ type: string; text: string }> };
    };
    expect(parsed.id).toBe(id);
    expect(parsed.result.structuredContent).toMatchObject({
      status: 'succeeded',
      provider: { type: 'LOCAL_ONLY' },
    });
    expect(parsed.result.content[0]?.text).toBe(JSON.stringify(parsed.result.structuredContent));
  });
});

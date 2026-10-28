import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { describe, expect, it } from 'vitest';

import { createHttpServer } from '../src/http.js';

const MAX_WIRE_BYTES = 262_144;

type ToolPage = {
  tools: Array<{ name: string; inputSchema: object; outputSchema?: object }>;
  nextCursor?: string;
};

async function rawPage(url: string, id: string, cursor?: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/list',
      params: cursor === undefined ? {} : { cursor },
    }),
  });
  const wire = await response.text();
  const frames = wire.split('\n').filter((line) => line.startsWith('data: '));
  const event = frames.length === 1 ? (JSON.parse(frames[0]!.slice(6)) as Record<string, unknown>) : null;
  return { response, wire, frames, event, result: event?.result as ToolPage | undefined };
}

describe('M12.3 real HTTP MCP paginated tool inventory', () => {
  it('paginates all 66 tools into bounded stable raw SSE responses, with full SDK aggregation', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });
    const url = `http://127.0.0.1:${server.address.port}/mcp`;
    const client = new Client({ name: 'm12-tool-pagination', version: '1.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(url)));
      const aggregate = await client.listTools();
      expect(aggregate.tools).toHaveLength(66);
      const withMeta = await client.listTools({ _meta: { progressToken: 'safe-progress' } });
      expect(withMeta.tools.map((tool) => tool.name)).toEqual(aggregate.tools.map((tool) => tool.name));
      const originalNames = aggregate.tools.map((tool) => tool.name);

      const seen = new Set<string>();
      const pages: ToolPage[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 20; i++) {
        const raw = await rawPage(url, '💚'.repeat(32), cursor); // 128-byte legal JSON-RPC ID
        expect(raw.response.status).toBe(200);
        expect(raw.response.headers.get('content-type')).toContain('text/event-stream');
        expect(Buffer.byteLength(raw.wire, 'utf8')).toBeLessThanOrEqual(MAX_WIRE_BYTES);
        expect(Buffer.byteLength(raw.wire, 'utf8')).toBeLessThanOrEqual(98_304);
        expect(raw.frames).toHaveLength(1);
        expect(raw.event?.id).toBe('💚'.repeat(32));
        const page = raw.result;
        expect(page?.tools.length).toBeGreaterThan(0);
        expect(page?.tools.length).toBeLessThan(66);
        for (const tool of page?.tools ?? []) {
          expect(seen.has(tool.name)).toBe(false);
          seen.add(tool.name);
          expect(tool.inputSchema).toBeDefined();
        }
        pages.push(page!);
        cursor = page?.nextCursor;
        if (cursor === undefined) break;
      }
      expect(pages.length).toBeGreaterThan(1);
      expect(pages.at(-1)?.nextCursor).toBeUndefined();
      expect([...pages.flatMap((p) => p.tools.map((tool) => tool.name))]).toEqual(originalNames);
      expect(seen.size).toBe(66);

      const first = await rawPage(url, 'repeat', undefined);
      expect(first.result).toEqual({ ...pages[0], nextCursor: pages[0]!.nextCursor });
      const explicit = await client.listTools({ cursor: pages[0]!.nextCursor! });
      expect(explicit.tools.map((tool) => tool.name)).toEqual(pages[1]!.tools.map((tool) => tool.name));

      const callable = await client.callTool({ name: 'linkedin.health', arguments: {} });
      expect(callable.structuredContent).toMatchObject({ status: 'succeeded' });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('rejects malformed, forged and oversized cursors without echoing values or issuing incomplete success', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });
    const url = `http://127.0.0.1:${server.address.port}/mcp`;
    try {
      const first = await rawPage(url, 'first');
      expect(first.result?.nextCursor).toBeDefined();
      for (const bad of [
        'SECRET_TOKEN_VALUE',
        '💚'.repeat(200),
        first.result!.nextCursor! + 'tamper',
        '',
        '0',
        'x'.repeat(40_000),
      ]) {
        const result = await rawPage(url, 'negative', bad);
        expect(result.response.status).toBeLessThan(500);
        expect(Buffer.byteLength(result.wire, 'utf8')).toBeLessThanOrEqual(MAX_WIRE_BYTES);
        expect(result.event?.error).toBeDefined();
        expect(result.event?.result).toBeUndefined();
        if (bad.length >= 16) expect(result.wire).not.toContain(bad.slice(0, 30));
        expect(result.wire).not.toContain('SECRET_TOKEN_VALUE');
      }
    } finally {
      await server.close();
    }
  });

  it('handles legal 128-byte JSON-escaped IDs without a 502 or any missing tool', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });
    const url = `http://127.0.0.1:${server.address.port}/mcp`;
    try {
      for (const id of ['\u0000'.repeat(128), '\n'.repeat(128), '\\'.repeat(128), '"'.repeat(128)]) {
        const page = await rawPage(url, id);
        expect(page.response.status).toBe(200);
        expect(page.event?.id).toBe(id);
        expect(Buffer.byteLength(page.wire, 'utf8')).toBeLessThanOrEqual(98_304);
        expect(page.result?.tools.length).toBeGreaterThan(0);
        expect(page.result?.nextCursor).toBeDefined();
      }
    } finally {
      await server.close();
    }
  });
});

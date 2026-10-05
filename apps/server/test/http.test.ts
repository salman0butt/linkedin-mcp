import { request } from 'node:http';

import { describe, expect, it } from 'vitest';

import { createHttpServer } from '../src/http.js';

function getStatus(port: number, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        host: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'GET',
        headers,
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode ?? 0));
      },
    );
    outgoing.once('error', reject);
    outgoing.end();
  });
}

describe('createHttpServer', () => {
  it('binds an ephemeral loopback port and closes cleanly', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      expect(server.address.host).toBe('127.0.0.1');
      expect(server.address.port).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it('rejects an unapproved Host header before MCP handling', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      await expect(getStatus(server.address.port, { Host: 'evil.example' })).resolves.toBe(403);
    } finally {
      await server.close();
    }
  });
});

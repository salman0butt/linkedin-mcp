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

function postStatus(port: number, body: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        host: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: {
          Host: `127.0.0.1:${port}`,
          'Content-Type': 'application/json',
        },
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode ?? 0));
      },
    );
    outgoing.once('error', reject);
    outgoing.end(body);
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

  it('rejects browser Origin headers while preserving origin-less MCP clients', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      await expect(
        getStatus(server.address.port, {
          Host: `127.0.0.1:${server.address.port}`,
          Origin: 'https://evil.example',
        }),
      ).resolves.toBe(403);

      await expect(
        getStatus(server.address.port, { Host: `127.0.0.1:${server.address.port}` }),
      ).resolves.not.toBe(403);
    } finally {
      await server.close();
    }
  });

  it('rejects request bodies larger than the default 1 MiB limit', async () => {
    const server = await createHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      await expect(postStatus(server.address.port, Buffer.alloc(1_048_577, 'a'))).resolves.toBe(413);
    } finally {
      await server.close();
    }
  });
});

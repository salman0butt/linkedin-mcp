import { describe, expect, it } from 'vitest';

import { createHttpServer } from '../src/http.js';

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
});

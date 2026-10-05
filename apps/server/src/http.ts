import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { createMcpHandler } from '@modelcontextprotocol/server';

import { createLinkedInMcpServer } from './create-server.js';

export interface HttpServerOptions {
  host?: string;
  port?: number;
}

export interface RunningHttpServer {
  address: {
    host: string;
    port: number;
  };
  close(): Promise<void>;
}

function toHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function readBody(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks);
}

async function toRequest(request: IncomingMessage, host: string): Promise<Request> {
  const body = await readBody(request);
  const init: RequestInit = {
    method: request.method ?? 'GET',
    headers: toHeaders(request),
  };
  if (body !== undefined) init.body = body;

  return new Request(`http://${request.headers.host ?? host}${request.url ?? '/'}`, init);
}

async function writeResponse(response: Response, target: ServerResponse): Promise<void> {
  target.statusCode = response.status;
  response.headers.forEach((value, name) => target.setHeader(name, value));
  target.end(Buffer.from(await response.arrayBuffer()));
}

export async function createHttpServer(options: HttpServerOptions = {}): Promise<RunningHttpServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3000;
  const handler = createMcpHandler(() => createLinkedInMcpServer());

  const server = createServer((request, response) => {
    void (async () => {
      const webRequest = await toRequest(request, host);
      const webResponse = await handler.fetch(webRequest);
      await writeResponse(webResponse, response);
    })().catch(() => {
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    await handler.close();
    server.close();
    throw new Error('HTTP server did not expose a TCP address');
  }

  return {
    address: { host, port: address.port },
    async close() {
      await handler.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
  };
}

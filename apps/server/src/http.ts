import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { createMcpHandler } from '@modelcontextprotocol/server';

import { createLinkedInMcpServer } from './create-server.js';

export interface HttpServerOptions {
  host?: string;
  port?: number;
  requestBodyLimitBytes?: number;
}

export interface RunningHttpServer {
  address: {
    host: string;
    port: number;
  };
  close(): Promise<void>;
}

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);
const DEFAULT_REQUEST_BODY_LIMIT_BYTES = 1_048_576;

class PayloadTooLargeError extends Error {}

function isAllowedHost(hostHeader: string | undefined): boolean {
  if (hostHeader === undefined) return false;

  try {
    const parsed = new URL(`http://${hostHeader}`);
    return (
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      LOOPBACK_HOSTNAMES.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function isAllowedOrigin(originHeader: string | undefined): boolean {
  if (originHeader === undefined) return true;

  try {
    const parsed = new URL(originHeader);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      LOOPBACK_HOSTNAMES.has(parsed.hostname)
    );
  } catch {
    return false;
  }
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

async function readBody(
  request: IncomingMessage,
  requestBodyLimitBytes: number,
): Promise<Buffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let payloadTooLarge = false;

  for await (const rawChunk of request) {
    const chunk: unknown = rawChunk;
    let buffer: Buffer;
    if (typeof chunk === 'string') {
      buffer = Buffer.from(chunk);
    } else if (chunk instanceof Uint8Array) {
      buffer = Buffer.from(chunk);
    } else {
      throw new TypeError('Unexpected HTTP request body chunk');
    }

    totalBytes += buffer.byteLength;
    if (totalBytes > requestBodyLimitBytes) {
      payloadTooLarge = true;
      continue;
    }
    if (!payloadTooLarge) chunks.push(buffer);
  }

  if (payloadTooLarge) throw new PayloadTooLargeError('HTTP request body exceeds configured limit');
  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks);
}

async function toRequest(
  request: IncomingMessage,
  host: string,
  requestBodyLimitBytes: number,
): Promise<Request> {
  const body = await readBody(request, requestBodyLimitBytes);
  const init: RequestInit = {
    method: request.method ?? 'GET',
    headers: toHeaders(request),
  };
  if (body !== undefined) init.body = Uint8Array.from(body);

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
  const requestBodyLimitBytes = options.requestBodyLimitBytes ?? DEFAULT_REQUEST_BODY_LIMIT_BYTES;
  const handler = createMcpHandler(() => createLinkedInMcpServer());

  const server = createServer((request, response) => {
    if (!isAllowedHost(request.headers.host) || !isAllowedOrigin(request.headers.origin)) {
      response.statusCode = 403;
      response.end();
      return;
    }

    void (async () => {
      const webRequest = await toRequest(request, host, requestBodyLimitBytes);
      const webResponse = await handler.fetch(webRequest);
      await writeResponse(webResponse, response);
    })().catch((error: unknown) => {
      if (!response.headersSent) {
        response.statusCode = error instanceof PayloadTooLargeError ? 413 : 500;
      }
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

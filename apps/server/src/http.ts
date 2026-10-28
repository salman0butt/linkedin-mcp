import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { createMcpHandler } from '@modelcontextprotocol/server';

import { parseConfig } from './config.js';
import { createLinkedInMcpServer } from './create-server.js';
import { createLinkedInRuntime, type LinkedInRuntime } from './runtime.js';
import { InvalidToolListPage, paginateToolInventory } from './transport/tool-list-pagination.js';

export interface HttpServerOptions {
  host?: string;
  port?: number;
  requestBodyLimitBytes?: number;
  runtime?: LinkedInRuntime;
}

export interface RunningHttpServer {
  address: {
    host: string;
    port: number;
  };
  close(): Promise<void>;
}

const LOOPBACK_BIND_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);
const DEFAULT_REQUEST_BODY_LIMIT_BYTES = 1_048_576;
const MAX_JSON_RPC_ID_BYTES = 128;
const MAX_HTTP_RESPONSE_BYTES = 256 * 1024;

interface ToolListRequest {
  id: string | number;
  cursor: unknown;
}

async function getToolListRequest(request: Request): Promise<ToolListRequest | undefined> {
  if (request.method !== 'POST') return undefined;
  try {
    const value: unknown = await request.clone().json();
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const json = value as Record<string, unknown>;
    if (json.jsonrpc !== '2.0' || json.method !== 'tools/list') return undefined;
    if (typeof json.id !== 'string' && typeof json.id !== 'number') return undefined;
    const params = json.params;
    if (params === undefined) return { id: json.id, cursor: undefined };
    if (params === null || typeof params !== 'object' || Array.isArray(params))
      return { id: json.id, cursor: null };
    const keys = Object.keys(params);
    // MCP's standard paginated params permit _meta (progress/trace data).
    // Do not mistake compliant metadata for an invalid pagination cursor.
    if (keys.some((key) => key !== 'cursor' && key !== '_meta')) return { id: json.id, cursor: null };
    return { id: json.id, cursor: (params as Record<string, unknown>).cursor };
  } catch {
    return undefined; // Malformed requests retain existing SDK protocol behavior.
  }
}

function paginatedSseResponse(
  source: Response,
  id: string | number,
  result?: unknown,
  error?: string,
): Response {
  const envelope =
    error === undefined
      ? { jsonrpc: '2.0', id, result }
      : { jsonrpc: '2.0', id, error: { code: -32602, message: error } };
  const headers = new Headers(source.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');
  headers.set('Content-Type', 'text/event-stream');
  headers.set('Cache-Control', 'no-cache');
  return new Response(`event: message\ndata: ${JSON.stringify(envelope)}\n\n`, {
    status: 200,
    headers,
  });
}

/** A narrow HTTP adapter; STDIO and the SDK's tool registry remain unchanged. */
async function paginateHttpToolList(
  response: Response,
  request: ToolListRequest,
  secret: Uint8Array,
): Promise<Response> {
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/event-stream'))
    return response;
  const wire = await response.text();
  const frames = wire.trim().split(/\r?\n\r?\n/u);
  if (frames.length !== 1)
    return paginatedSseResponse(response, request.id, undefined, 'Tool inventory could not be safely read.');
  const dataLines = frames[0]!.split(/\r?\n/u).filter((line) => line.startsWith('data: '));
  if (dataLines.length !== 1)
    return paginatedSseResponse(response, request.id, undefined, 'Tool inventory could not be safely read.');
  try {
    const envelope: unknown = JSON.parse(dataLines[0]!.slice(6));
    if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope))
      throw new InvalidToolListPage();
    const payload = envelope as Record<string, unknown>;
    if (
      payload.jsonrpc !== '2.0' ||
      payload.id !== request.id ||
      payload.result === null ||
      typeof payload.result !== 'object' ||
      Array.isArray(payload.result)
    )
      throw new InvalidToolListPage();
    const result = payload.result as Record<string, unknown>;
    const page = paginateToolInventory(result.tools, request.cursor, secret);
    return paginatedSseResponse(response, request.id, { ...result, ...page });
  } catch {
    return paginatedSseResponse(response, request.id, undefined, 'Invalid tool inventory cursor.');
  }
}

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

function isAllowedOrigin(originHeader: string | undefined, hostHeader: string | undefined): boolean {
  if (originHeader === undefined) return true;
  if (hostHeader === undefined) return false;

  try {
    const origin = new URL(originHeader);
    const target = new URL(`http://${hostHeader}`);
    return (
      origin.protocol === 'http:' &&
      origin.username === '' &&
      origin.password === '' &&
      origin.pathname === '/' &&
      origin.search === '' &&
      origin.hash === '' &&
      LOOPBACK_HOSTNAMES.has(origin.hostname) &&
      origin.origin === target.origin
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

function hasOversizedJsonRpcId(body: Buffer | undefined): boolean {
  if (body === undefined) return false;
  let decoded: unknown;
  try {
    decoded = JSON.parse(body.toString('utf8'));
  } catch {
    // Leave malformed JSON to the MCP protocol handler.
    return false;
  }
  const requests: readonly unknown[] = Array.isArray(decoded) ? decoded : [decoded];
  return requests.some((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item) || !Object.hasOwn(item, 'id')) {
      return false;
    }
    const id: unknown = (item as Record<string, unknown>).id;
    return typeof id === 'string' && Buffer.byteLength(id, 'utf8') > MAX_JSON_RPC_ID_BYTES;
  });
}

function jsonRpcError(target: ServerResponse, status: number, code: number, message: string): void {
  target.statusCode = status;
  target.setHeader('Content-Type', 'application/json; charset=utf-8');
  target.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code, message } }));
}

async function toRequest(
  request: IncomingMessage,
  host: string,
  requestBodyLimitBytes: number,
): Promise<{ webRequest: Request; oversizedJsonRpcId: boolean }> {
  const body = await readBody(request, requestBodyLimitBytes);
  const init: RequestInit = {
    method: request.method ?? 'GET',
    headers: toHeaders(request),
  };
  if (body !== undefined) init.body = Uint8Array.from(body);

  return {
    webRequest: new Request(`http://${request.headers.host ?? host}${request.url ?? '/'}`, init),
    oversizedJsonRpcId: request.method === 'POST' && hasOversizedJsonRpcId(body),
  };
}

async function writeResponse(response: Response, target: ServerResponse): Promise<void> {
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > MAX_HTTP_RESPONSE_BYTES) {
    // A handler may have performed a write; its outcome cannot safely be represented as a retryable failure.
    jsonRpcError(target, 502, -32000, 'MCP response too large; operation outcome unknown.');
    return;
  }
  target.statusCode = response.status;
  response.headers.forEach((value, name) => target.setHeader(name, value));
  target.end(body);
}

export async function createHttpServer(options: HttpServerOptions = {}): Promise<RunningHttpServer> {
  const host = options.host ?? '127.0.0.1';
  if (!LOOPBACK_BIND_HOSTS.has(host.toLowerCase())) {
    throw new Error('HTTP server host must be a loopback address');
  }

  const port = options.port ?? 3000;
  const requestBodyLimitBytes = options.requestBodyLimitBytes ?? DEFAULT_REQUEST_BODY_LIMIT_BYTES;
  const config = parseConfig();
  const runtime = options.runtime ?? createLinkedInRuntime({ ...config, transport: 'http' });
  const toolListSecret = randomBytes(32);
  // Build an explicit safe allowlist: never even read any injected private-store
  // properties/getters when constructing an HTTP MCP server.
  const handler = createMcpHandler(() =>
    createLinkedInMcpServer({
      version: runtime.version,
      authService: runtime.authService,
      discovery: runtime.discovery,
      jobs: runtime.jobs,
      publishing: runtime.publishing,
      ...(runtime.engagement === undefined ? {} : { engagement: runtime.engagement }),
      transport: 'http',
    }),
  );

  const server = createServer((request, response) => {
    if (
      !isAllowedHost(request.headers.host) ||
      !isAllowedOrigin(request.headers.origin, request.headers.host)
    ) {
      response.statusCode = 403;
      response.end();
      return;
    }

    void (async () => {
      const { webRequest, oversizedJsonRpcId } = await toRequest(request, host, requestBodyLimitBytes);
      if (oversizedJsonRpcId) {
        jsonRpcError(response, 400, -32600, 'Invalid Request');
        return;
      }
      const pagination = await getToolListRequest(webRequest);
      const webResponse = await handler.fetch(webRequest);
      await writeResponse(
        pagination === undefined
          ? webResponse
          : await paginateHttpToolList(webResponse, pagination, toolListSecret),
        response,
      );
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

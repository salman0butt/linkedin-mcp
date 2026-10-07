import { createServer, type Server, type ServerResponse } from 'node:http';

import type { ConsumedAuthorizationCode, OAuthSessionCoordinator } from './oauth-session.js';

const DEFAULT_CALLBACK_TIMEOUT_MS = 5 * 60 * 1_000;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1']);

export interface OAuthCallbackListenerOptions {
  redirectUri: string;
  sessionId: string;
  coordinator: OAuthSessionCoordinator;
  timeoutMs?: number;
}

export interface OAuthCallbackListener {
  result: Promise<ConsumedAuthorizationCode>;
  close(): Promise<void>;
}

function normalizeHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

function writeResponse(response: ServerResponse, status: number, body: string): void {
  response.statusCode = status;
  response.setHeader('content-type', 'text/plain; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(body);
}

function safeProviderErrorCode(value: string | null): string {
  if (value !== null && /^[A-Za-z0-9._-]{1,64}$/.test(value)) return value;
  return 'provider_error';
}

export async function startOAuthCallbackListener(
  options: OAuthCallbackListenerOptions,
): Promise<OAuthCallbackListener> {
  let redirect: URL;
  try {
    redirect = new URL(options.redirectUri);
  } catch {
    throw new Error('OAuth callback redirect URI must be a valid URL');
  }

  const host = normalizeHostname(redirect.hostname);
  if (
    redirect.protocol !== 'http:' ||
    !LOOPBACK_HOSTS.has(host) ||
    redirect.username !== '' ||
    redirect.password !== ''
  ) {
    throw new Error('OAuth callback listener must bind to an HTTP loopback address');
  }

  const port = redirect.port === '' ? 80 : Number(redirect.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error('OAuth callback redirect URI must include a valid TCP port');
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('OAuth callback timeout must be a positive number');
  }

  let settled = false;
  let timeout: NodeJS.Timeout | undefined;
  let resolveResult!: (value: ConsumedAuthorizationCode) => void;
  let rejectResult!: (error: Error) => void;

  const result = new Promise<ConsumedAuthorizationCode>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  void result.catch(() => undefined);

  function clearCallbackTimeout(): void {
    if (timeout !== undefined) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  }

  const server = createServer((request, response) => {
    if (settled) {
      writeResponse(response, 410, 'OAuth callback is no longer active.');
      return;
    }

    let callback: URL;
    try {
      callback = new URL(request.url ?? '/', redirect.origin);
    } catch {
      writeResponse(response, 400, 'Invalid OAuth callback request.');
      return;
    }

    if (callback.pathname !== redirect.pathname) {
      writeResponse(response, 404, 'Not found.');
      return;
    }

    if (request.method !== 'GET') {
      writeResponse(response, 405, 'Method not allowed.');
      return;
    }

    const state = callback.searchParams.get('state') ?? undefined;
    const providerError = callback.searchParams.get('error');

    if (providerError !== null) {
      let terminalError: Error;
      try {
        options.coordinator.consumeProviderError({
          sessionId: options.sessionId,
          ...(state === undefined ? {} : { state }),
        });
        terminalError = new Error(
          `LinkedIn OAuth authorization failed: ${safeProviderErrorCode(providerError)}`,
        );
      } catch (error: unknown) {
        terminalError = error instanceof Error ? error : new Error('OAuth callback validation failed');
      }

      settled = true;
      clearCallbackTimeout();
      writeResponse(response, 400, 'OAuth authorization was not completed.');
      void closeHttpServer(server).then(
        () => rejectResult(terminalError),
        () => rejectResult(new Error('OAuth callback listener failed to close')),
      );
      return;
    }

    try {
      const consumed = options.coordinator.consumeCallback({
        sessionId: options.sessionId,
        ...(state === undefined ? {} : { state }),
        code: callback.searchParams.get('code') ?? '',
      });
      settled = true;
      clearCallbackTimeout();
      writeResponse(response, 200, 'OAuth authorization received. You may close this window.');
      void closeHttpServer(server).then(
        () => resolveResult(consumed),
        () => rejectResult(new Error('OAuth callback listener failed to close')),
      );
    } catch (error: unknown) {
      settled = true;
      clearCallbackTimeout();
      const terminalError = error instanceof Error ? error : new Error('OAuth callback validation failed');
      writeResponse(response, 400, 'OAuth callback validation failed.');
      void closeHttpServer(server).then(
        () => rejectResult(terminalError),
        () => rejectResult(new Error('OAuth callback listener failed to close')),
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    options.coordinator.cancel(options.sessionId);
    void closeHttpServer(server).then(
      () => rejectResult(new Error('OAuth callback listener timed out')),
      () => rejectResult(new Error('OAuth callback listener failed to close')),
    );
  }, timeoutMs);
  timeout.unref();

  async function close(): Promise<void> {
    clearCallbackTimeout();
    options.coordinator.cancel(options.sessionId);
    await closeHttpServer(server);
  }

  return { result, close };
}

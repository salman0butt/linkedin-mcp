import { resolve } from 'node:path';

import type { OAuthMode } from '../../../packages/core/dist/index.js';

export type TransportMode = 'stdio' | 'http';
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LinkedInAuthConfig {
  mode: OAuthMode;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string[];
  credentialStorePath: string;
  tokenEncryptionKey: string;
}

export interface ServerConfig {
  transport: TransportMode;
  httpHost: string;
  httpPort: number;
  logLevel: LogLevel;
  serverName: string;
  serverVersion: string;
  requestBodyLimitBytes: number;
  linkedinApiVersion?: string;
  publishingLedgerPath?: string;
  publishingApprovalTtlMs: number;
  memberPostReadEnabled: boolean;
  auth?: LinkedInAuthConfig;
}

type Env = Readonly<Record<string, string | undefined>>;

const TRANSPORTS = new Set<TransportMode>(['stdio', 'http']);
const LOG_LEVELS = new Set<LogLevel>(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const OAUTH_MODES = new Set<OAuthMode>(['confidential', 'native_pkce']);
const AUTH_ENV_KEYS = [
  'LINKEDIN_MCP_OAUTH_MODE',
  'LINKEDIN_MCP_CLIENT_ID',
  'LINKEDIN_MCP_CLIENT_SECRET',
  'LINKEDIN_MCP_REDIRECT_URI',
  'LINKEDIN_MCP_OAUTH_SCOPES',
  'LINKEDIN_MCP_CREDENTIAL_STORE_PATH',
  'LINKEDIN_MCP_TOKEN_ENCRYPTION_KEY',
] as const;

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  label: string,
  max?: number,
): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || (max !== undefined && parsed > max)) {
    throw new Error(
      `${label} must be a positive integer${max === undefined ? '' : ` no greater than ${max}`}`,
    );
  }
  return parsed;
}

function parseLinkedInApiVersion(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error('LinkedIn API version must use YYYYMM format');
  }
  return value;
}

function requireOAuthValue(env: Env, key: (typeof AUTH_ENV_KEYS)[number], label: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`OAuth ${label} is required when OAuth is configured`);
  return value;
}

function validateTokenEncryptionKey(value: string): void {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64') !== value) {
    throw new Error('OAuth token encryption key must be canonical base64 for exactly 32 bytes');
  }
}

function parseAuthConfig(env: Env): LinkedInAuthConfig | undefined {
  const authConfigured = AUTH_ENV_KEYS.some((key) => Boolean(env[key]?.trim()));
  if (!authConfigured) return undefined;

  const modeValue = requireOAuthValue(env, 'LINKEDIN_MCP_OAUTH_MODE', 'mode') as OAuthMode;
  if (!OAUTH_MODES.has(modeValue)) {
    throw new Error('OAuth mode must be one of: confidential, native_pkce');
  }

  const clientId = requireOAuthValue(env, 'LINKEDIN_MCP_CLIENT_ID', 'client ID');
  const redirectUri = requireOAuthValue(env, 'LINKEDIN_MCP_REDIRECT_URI', 'redirect URI');
  const credentialStorePath = requireOAuthValue(
    env,
    'LINKEDIN_MCP_CREDENTIAL_STORE_PATH',
    'credential store path',
  );
  const tokenEncryptionKey = requireOAuthValue(
    env,
    'LINKEDIN_MCP_TOKEN_ENCRYPTION_KEY',
    'token encryption key',
  );
  validateTokenEncryptionKey(tokenEncryptionKey);

  const scopes = (env.LINKEDIN_MCP_OAUTH_SCOPES ?? 'openid profile email')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!scopes.includes('openid')) {
    throw new Error('OAuth scopes must include openid');
  }

  let parsedRedirectUri: URL;
  try {
    parsedRedirectUri = new URL(redirectUri);
  } catch {
    throw new Error('OAuth redirect URI must be a valid URL');
  }

  if (modeValue === 'native_pkce') {
    const loopbackHosts = new Set(['127.0.0.1', '::1', '[::1]']);
    if (parsedRedirectUri.protocol !== 'http:' || !loopbackHosts.has(parsedRedirectUri.hostname)) {
      throw new Error('Native PKCE OAuth redirect URI must use an HTTP loopback address');
    }
  }

  if (modeValue === 'confidential') {
    return {
      mode: modeValue,
      clientId,
      clientSecret: requireOAuthValue(env, 'LINKEDIN_MCP_CLIENT_SECRET', 'client secret'),
      redirectUri,
      scopes,
      credentialStorePath,
      tokenEncryptionKey,
    };
  }

  return {
    mode: modeValue,
    clientId,
    redirectUri,
    scopes,
    credentialStorePath,
    tokenEncryptionKey,
  };
}

export function parseConfig(env: Env = process.env): ServerConfig {
  const transport = (env.LINKEDIN_MCP_TRANSPORT ?? 'stdio') as TransportMode;
  if (!TRANSPORTS.has(transport)) throw new Error('Transport must be one of: stdio, http');

  const httpHost = env.LINKEDIN_MCP_HTTP_HOST ?? '127.0.0.1';
  if (!LOOPBACK_HOSTS.has(httpHost)) {
    throw new Error('HTTP host must be a loopback address in M00');
  }

  const logLevel = (env.LINKEDIN_MCP_LOG_LEVEL ?? 'info') as LogLevel;
  if (!LOG_LEVELS.has(logLevel)) {
    throw new Error('Log level must be one of: trace, debug, info, warn, error, fatal');
  }

  const auth = parseAuthConfig(env);
  const linkedinApiVersion = parseLinkedInApiVersion(env.LINKEDIN_MCP_API_VERSION);
  const ledgerPathValue = env.LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH;
  if (ledgerPathValue !== undefined && ledgerPathValue.trim() === '') {
    throw new Error('Publishing ledger path must be a nonblank local path');
  }
  const publishingLedgerPath = ledgerPathValue === undefined ? undefined : resolve(ledgerPathValue);
  if (
    publishingLedgerPath !== undefined &&
    auth !== undefined &&
    publishingLedgerPath === resolve(auth.credentialStorePath)
  ) {
    throw new Error('Publishing ledger path must differ from the credential store path');
  }
  const ttlValue = env.LINKEDIN_MCP_APPROVAL_TTL_MS;
  if (ttlValue === '') throw new Error('Publishing approval TTL must be a positive integer');
  const publishingApprovalTtlMs = parsePositiveInteger(ttlValue, 300_000, 'Publishing approval TTL', 600_000);
  const readValue = env.LINKEDIN_MCP_MEMBER_POST_READ_ENABLED;
  if (readValue !== undefined && readValue !== 'true' && readValue !== 'false') {
    throw new Error('Member post read flag must be exactly true or false');
  }

  return {
    transport,
    httpHost,
    httpPort: parsePositiveInteger(env.LINKEDIN_MCP_HTTP_PORT, 3000, 'HTTP port', 65_535),
    logLevel,
    serverName: env.LINKEDIN_MCP_SERVER_NAME ?? 'linkedin-mcp',
    serverVersion: env.LINKEDIN_MCP_SERVER_VERSION ?? '0.0.0',
    requestBodyLimitBytes: parsePositiveInteger(
      env.LINKEDIN_MCP_BODY_LIMIT_BYTES,
      1_048_576,
      'Request body limit',
    ),
    publishingApprovalTtlMs,
    memberPostReadEnabled: readValue === 'true',
    ...(publishingLedgerPath === undefined ? {} : { publishingLedgerPath }),
    ...(linkedinApiVersion === undefined ? {} : { linkedinApiVersion }),
    ...(auth === undefined ? {} : { auth }),
  };
}

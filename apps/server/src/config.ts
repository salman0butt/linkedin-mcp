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

function requireOAuthValue(env: Env, key: (typeof AUTH_ENV_KEYS)[number], label: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`OAuth ${label} is required when OAuth is configured`);
  return value;
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
    ...(auth === undefined ? {} : { auth }),
  };
}

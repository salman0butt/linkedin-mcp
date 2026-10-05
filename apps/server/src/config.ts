export type TransportMode = 'stdio' | 'http';
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface ServerConfig {
  transport: TransportMode;
  httpHost: string;
  httpPort: number;
  logLevel: LogLevel;
  serverName: string;
  serverVersion: string;
  requestBodyLimitBytes: number;
}

type Env = Readonly<Record<string, string | undefined>>;

const TRANSPORTS = new Set<TransportMode>(['stdio', 'http']);
const LOG_LEVELS = new Set<LogLevel>(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function parsePositiveInteger(value: string | undefined, fallback: number, label: string, max?: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || (max !== undefined && parsed > max)) {
    throw new Error(`${label} must be a positive integer${max === undefined ? '' : ` no greater than ${max}`}`);
  }
  return parsed;
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
  };
}

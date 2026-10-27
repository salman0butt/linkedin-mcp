import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

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
  imageStatusReadEnabled: boolean;
  engagementReadEnabled: boolean;
  mediaRoot?: string;
  mediaMaxBytes: number;
  jobSavedPath?: string;
  articleStorePath?: string;
  calendarStorePath?: string;
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
const MIB = 1_048_576;
const DEFAULT_MEDIA_MAX_BYTES = 20 * MIB;
const MIN_MEDIA_MAX_BYTES = MIB;
const MAX_MEDIA_MAX_BYTES = 50 * MIB;

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

function parseMediaMaxBytes(value: string | undefined): number {
  if (value === undefined) return DEFAULT_MEDIA_MAX_BYTES;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < MIN_MEDIA_MAX_BYTES || parsed > MAX_MEDIA_MAX_BYTES) {
    throw new Error(
      `Media max bytes must be an integer between ${MIN_MEDIA_MAX_BYTES} and ${MAX_MEDIA_MAX_BYTES}`,
    );
  }
  return parsed;
}

function parseMediaRoot(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed || !isAbsolute(trimmed)) {
    throw new Error('Media root must be an existing absolute directory');
  }
  try {
    const canonical = realpathSync(trimmed);
    if (!statSync(canonical).isDirectory()) {
      throw new Error('not-directory');
    }
    return canonical;
  } catch {
    throw new Error('Media root must be an existing absolute directory');
  }
}

function isSameOrInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

interface PrivatePathIdentity {
  readonly name: string;
  readonly insensitive: boolean;
  readonly existingIdentity?: string;
}

function errno(error: unknown, code: string): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === code;
}

/**
 * Only reads existing ancestors. In particular, do not create probe files or
 * resolve an absent leaf as if it already exists. A symlinked ancestor is
 * resolved before any comparison of prospective private-store filenames.
 */
function privatePathIdentity(path: string): PrivatePathIdentity {
  let ancestor = resolve(path);
  const missing: string[] = [];
  let realAncestor: string;
  for (;;) {
    try {
      realAncestor = realpathSync(ancestor);
      break;
    } catch (error) {
      if (!errno(error, 'ENOENT') && !errno(error, 'ENOTDIR')) {
        throw new Error('Private store path identity could not be verified');
      }
      const parent = dirname(ancestor);
      if (parent === ancestor) throw new Error('Private store path identity could not be verified');
      missing.push(basename(ancestor));
      ancestor = parent;
    }
  }

  const stat = statSync(realAncestor);
  if (missing.length > 0 && !stat.isDirectory()) {
    throw new Error('Private store path ancestor must be a directory');
  }
  const name = resolve(realAncestor, ...missing.reverse());

  // macOS can use either case-sensitive or case-insensitive volumes. Detect
  // the latter by a read-only case variation of an existing ancestor on the
  // same device; don't assume that every Darwin filesystem folds case.
  let insensitive = false;
  if (process.platform === 'darwin') {
    let component = realAncestor;
    let foundEvidence = false;
    while (dirname(component) !== component) {
      const current = statSync(component);
      if (current.dev !== stat.dev) break;
      const parent = dirname(component);
      let parentDevice: number;
      try {
        parentDevice = statSync(parent).dev;
      } catch {
        throw new Error('Private store path case could not be verified');
      }
      // A mountpoint's name is looked up on its PARENT filesystem.
      // Its alternate casing cannot establish whether the mounted child
      // device is sensitive. Only probe a name resolved on this SAME device.
      if (parentDevice !== current.dev) break;
      const namePart = basename(component);
      const varied = namePart.replace(/[A-Za-z]/u, (letter) =>
        letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase(),
      );
      if (varied !== namePart) {
        foundEvidence = true;
        try {
          const alias = statSync(join(parent, varied));
          insensitive = alias.dev === current.dev && alias.ino === current.ino;
        } catch (error) {
          if (!errno(error, 'ENOENT')) throw new Error('Private store path case could not be verified');
        }
        break;
      }
      component = parent;
    }
    // A case-less ancestor name does not prove that its volume distinguishes
    // case: be conservative if no read-only evidence can be obtained.
    if (!foundEvidence) insensitive = true;
  }

  return {
    name,
    insensitive,
    ...(missing.length === 0 ? { existingIdentity: `${stat.dev}:${stat.ino}` } : {}),
  };
}

function privatePathsOverlap(
  a: string,
  b: string,
  identities: Map<string, PrivatePathIdentity> = new Map(),
): boolean {
  const identify = (path: string): PrivatePathIdentity => {
    const cached = identities.get(path);
    if (cached !== undefined) return cached;
    const result = privatePathIdentity(path);
    identities.set(path, result);
    return result;
  };
  const first = identify(a);
  const second = identify(b);
  if (first.existingIdentity !== undefined && first.existingIdentity === second.existingIdentity) {
    return true;
  }
  // APFS on macOS preserves canonical Unicode equivalence even on
  // case-SENSITIVE volumes. Case folding is a distinct, volume-specific rule.
  // Linux paths remain byte/case/normalization distinct unless an existing
  // physical inode/ancestor proves an alias.
  const compareFolded = process.platform === 'darwin' && (first.insensitive || second.insensitive);
  const canonical = (name: string): string => {
    if (process.platform !== 'darwin') return name;
    const decomposed = name.normalize('NFD');
    return compareFolded ? decomposed.toLowerCase().normalize('NFD') : decomposed;
  };
  const left = canonical(first.name);
  const right = canonical(second.name);
  return isSameOrInside(left, right) || isSameOrInside(right, left);
}

function privateCompanions(path: string): string[] {
  const name = resolve(path);
  return [
    name,
    name + '.lock',
    name + '.initialized',
    name + '.ready',
    join(dirname(name), '.' + basename(name) + '.lock'),
  ];
}

function privateCompanionsOverlap(
  a: string,
  b: string,
  identities: Map<string, PrivatePathIdentity> = new Map(),
): boolean {
  return privateCompanions(a).some((first) =>
    privateCompanions(b).some((second) => privatePathsOverlap(first, second, identities)),
  );
}

type PrivateStoreKind = 'calendar' | 'article' | 'job' | 'ledger' | 'oauth';

/**
 * Configured private files (and all store-owned sidecars) are mutually
 * exclusive with each other and with the media directory. Check EVERY pair,
 * including job/ledger/OAuth configurations without an article or calendar.
 * None of these read-only checks creates a file or directory.
 */
function assertPrivatePathIsolation(
  files: readonly { readonly kind: PrivateStoreKind; readonly path: string }[],
  mediaRoot?: string,
): void {
  const identities = new Map<string, PrivatePathIdentity>();
  const mediaOverlapError: Record<PrivateStoreKind, string> = {
    calendar: 'Calendar store path must not overlap the media root or its companions',
    article: 'Article store path must not overlap the media root or its companions',
    job: 'Saved job store path must not overlap the media root',
    ledger: 'Publishing ledger must not be inside the media root or overlap its companions',
    oauth: 'OAuth credential store must not be inside the media root or overlap its companions',
  };

  for (const current of files) {
    if (
      mediaRoot !== undefined &&
      privateCompanions(current.path).some((companion) =>
        privatePathsOverlap(mediaRoot, companion, identities),
      )
    ) {
      throw new Error(mediaOverlapError[current.kind]);
    }
  }

  for (let i = 0; i < files.length; i++) {
    const first = files[i]!;
    for (let j = i + 1; j < files.length; j++) {
      const second = files[j]!;
      if (!privateCompanionsOverlap(first.path, second.path, identities)) continue;
      const kinds = [first.kind, second.kind];
      if (kinds.includes('calendar')) {
        throw new Error('Calendar store path must not overlap other private stores or companions');
      }
      if (kinds.includes('article')) {
        throw new Error('Article store path must not overlap private stores, secrets or companions');
      }
      if (kinds.includes('ledger') && kinds.includes('oauth')) {
        throw new Error('Publishing ledger path must differ from the credential store path');
      }
      throw new Error('Private store paths must not overlap other private stores or companions');
    }
  }
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
  const mediaRoot = parseMediaRoot(env.LINKEDIN_MCP_MEDIA_ROOT);
  const mediaMaxBytes = parseMediaMaxBytes(env.LINKEDIN_MCP_MEDIA_MAX_BYTES);

  const ttlValue = env.LINKEDIN_MCP_APPROVAL_TTL_MS;
  if (ttlValue === '') throw new Error('Publishing approval TTL must be a positive integer');
  const publishingApprovalTtlMs = parsePositiveInteger(ttlValue, 300_000, 'Publishing approval TTL', 600_000);
  const readValue = env.LINKEDIN_MCP_MEMBER_POST_READ_ENABLED;
  if (readValue !== undefined && readValue !== 'true' && readValue !== 'false') {
    throw new Error('Member post read flag must be exactly true or false');
  }
  const imageStatusReadValue = env.LINKEDIN_MCP_IMAGE_STATUS_READ_ENABLED;
  if (
    imageStatusReadValue !== undefined &&
    imageStatusReadValue !== 'true' &&
    imageStatusReadValue !== 'false'
  ) {
    throw new Error('Image status read flag must be exactly true or false');
  }
  const engagementReadValue = env.LINKEDIN_MCP_ENGAGEMENT_READ_ENABLED;
  if (
    engagementReadValue !== undefined &&
    engagementReadValue !== 'true' &&
    engagementReadValue !== 'false'
  ) {
    throw new Error('Engagement read flag must be exactly true or false');
  }

  const jobSavedPath = env.LINKEDIN_MCP_JOB_SAVED_PATH;
  if (
    jobSavedPath !== undefined &&
    (!isAbsolute(jobSavedPath) ||
      jobSavedPath.trim() !== jobSavedPath ||
      jobSavedPath.length > 2048 ||
      jobSavedPath.split(/[\\/]/u).some((segment) => segment === '.' || segment === '..') ||
      jobSavedPath.endsWith('/'))
  ) {
    throw new Error('Saved job store path must be an absolute canonical host path');
  }

  const articleStorePath = env.LINKEDIN_MCP_ARTICLE_STORE_PATH;
  if (
    articleStorePath !== undefined &&
    (!isAbsolute(articleStorePath) ||
      articleStorePath.trim() !== articleStorePath ||
      articleStorePath.length > 2048 ||
      articleStorePath.split(/[\\/]/u).some((segment) => segment === '.' || segment === '..') ||
      articleStorePath.endsWith('/'))
  ) {
    throw new Error('Article store path must be a canonical absolute host path');
  }
  const calendarStorePath = env.LINKEDIN_MCP_CALENDAR_STORE_PATH;
  if (
    calendarStorePath !== undefined &&
    (!isAbsolute(calendarStorePath) ||
      calendarStorePath.trim() !== calendarStorePath ||
      calendarStorePath.length > 2048 ||
      resolve(calendarStorePath) !== calendarStorePath ||
      calendarStorePath.split(/[\\/]/u).some((segment) => segment === '.' || segment === '..') ||
      calendarStorePath.endsWith('/'))
  ) {
    throw new Error('Calendar store path must be a canonical absolute host path');
  }
  if (calendarStorePath !== undefined) {
    const isInsensitive = privatePathIdentity(calendarStorePath).insensitive;
    const suffixPath = isInsensitive ? calendarStorePath.toLowerCase() : calendarStorePath;
    if (['.lock', '.initialized', '.ready'].some((suffix) => suffixPath.endsWith(suffix))) {
      throw new Error('Calendar store path must not be a private-store companion path');
    }
  }

  const privateStores: Array<{ kind: PrivateStoreKind; path: string }> = [];
  if (calendarStorePath !== undefined) privateStores.push({ kind: 'calendar', path: calendarStorePath });
  if (articleStorePath !== undefined) privateStores.push({ kind: 'article', path: articleStorePath });
  if (jobSavedPath !== undefined) privateStores.push({ kind: 'job', path: jobSavedPath });
  if (publishingLedgerPath !== undefined) privateStores.push({ kind: 'ledger', path: publishingLedgerPath });
  if (auth !== undefined) privateStores.push({ kind: 'oauth', path: auth.credentialStorePath });
  assertPrivatePathIsolation(privateStores, mediaRoot);

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
    imageStatusReadEnabled: imageStatusReadValue === 'true',
    engagementReadEnabled: engagementReadValue === 'true',
    mediaMaxBytes,
    ...(mediaRoot === undefined ? {} : { mediaRoot }),
    ...(publishingLedgerPath === undefined ? {} : { publishingLedgerPath }),
    ...(linkedinApiVersion === undefined ? {} : { linkedinApiVersion }),
    ...(auth === undefined ? {} : { auth }),
    ...(jobSavedPath === undefined ? {} : { jobSavedPath }),
    ...(articleStorePath === undefined ? {} : { articleStorePath }),
    ...(calendarStorePath === undefined ? {} : { calendarStorePath }),
  };
}

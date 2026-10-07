import type {
  AuthConnectionState,
  AuthenticatedIdentity,
  OAuthMode,
  StoredCredential,
} from '../../../../packages/core/dist/index.js';
import type { LinkedInAuthConfig } from '../config.js';
import { createFileCredentialStore, type CredentialStore } from './credential-store.js';
import {
  fetchLinkedInIdentity,
  LinkedInIdentityError,
} from './linkedin-identity.js';
import {
  createLinkedInOAuthAdapter,
  LinkedInOAuthError,
  type LinkedInOAuthAdapter,
  type LinkedInTokenResult,
} from './linkedin-oauth.js';
import {
  createOAuthSessionCoordinator,
  type ConsumedAuthorizationCode,
  type OAuthSessionCoordinator,
} from './oauth-session.js';

const provider = 'OFFICIAL_API' as const;

export type AuthServiceErrorKind =
  | 'not_configured'
  | 'disconnected'
  | 'reauth_required'
  | 'rate_limited'
  | 'provider_failure';

export class AuthServiceError extends Error {
  readonly kind: AuthServiceErrorKind;
  readonly retryable: boolean;

  constructor(kind: AuthServiceErrorKind, retryable: boolean) {
    super(`LinkedIn authentication failed: ${kind}`);
    this.name = 'AuthServiceError';
    this.kind = kind;
    this.retryable = retryable;
  }
}

export interface AuthStatus {
  state: AuthConnectionState;
  provider: typeof provider;
  scopes: string[];
  refreshAvailable: boolean;
  mode?: OAuthMode;
  subject?: string;
  expiresAt?: string;
}

export interface AuthorizationStartResult {
  authorizationUrl: string;
  sessionId: string;
  scopes: string[];
  mode: OAuthMode;
  expiresAt: string;
  provider: typeof provider;
}

export interface LogoutResult {
  localCredentialsCleared: true;
  remoteRevocation: 'not_claimed';
  provider: typeof provider;
}

export interface AuthService {
  startAuthorization(): AuthorizationStartResult;
  getStatus(): Promise<AuthStatus>;
  completeAuthorization(code: ConsumedAuthorizationCode): Promise<AuthStatus>;
  getProfile(): Promise<AuthenticatedIdentity>;
  logout(): Promise<LogoutResult>;
}

interface AuthServiceDeps {
  config?: LinkedInAuthConfig;
  coordinator?: OAuthSessionCoordinator;
  oauth?: LinkedInOAuthAdapter;
  store?: CredentialStore;
  fetchIdentity?: (accessToken: string) => Promise<AuthenticatedIdentity>;
  now?: () => Date;
}

interface ConfiguredDeps {
  config: LinkedInAuthConfig;
  coordinator: OAuthSessionCoordinator;
  oauth: LinkedInOAuthAdapter;
  store: CredentialStore;
  fetchIdentity: (accessToken: string) => Promise<AuthenticatedIdentity>;
}

function addSeconds(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1_000).toISOString();
}

function isExpired(value: string, now: Date): boolean {
  return new Date(value).getTime() <= now.getTime();
}

function canRefresh(credential: StoredCredential, now: Date): boolean {
  return (
    credential.mode === 'confidential' &&
    credential.refreshToken !== undefined &&
    credential.refreshToken !== '' &&
    (credential.refreshExpiresAt === undefined || !isExpired(credential.refreshExpiresAt, now))
  );
}

function statusForCredential(credential: StoredCredential, now: Date): AuthStatus {
  return {
    state: isExpired(credential.expiresAt, now) ? 'expired' : 'connected',
    provider,
    mode: credential.mode,
    ...(credential.subject === undefined ? {} : { subject: credential.subject }),
    scopes: [...credential.scopes],
    expiresAt: credential.expiresAt,
    refreshAvailable: canRefresh(credential, now),
  };
}

function configuredDeps(deps: AuthServiceDeps): ConfiguredDeps | null {
  if (deps.config === undefined) return null;

  return {
    config: deps.config,
    coordinator: deps.coordinator ?? createOAuthSessionCoordinator(deps.config),
    oauth: deps.oauth ?? createLinkedInOAuthAdapter(deps.config),
    store:
      deps.store ??
      createFileCredentialStore({
        filePath: deps.config.credentialStorePath,
        encryptionKey: deps.config.tokenEncryptionKey,
      }),
    fetchIdentity: deps.fetchIdentity ?? fetchLinkedInIdentity,
  };
}

function mapIdentityError(error: unknown): AuthServiceError {
  if (error instanceof LinkedInIdentityError) {
    if (error.kind === 'permission_required') {
      return new AuthServiceError('reauth_required', false);
    }
    if (error.kind === 'rate_limited') {
      return new AuthServiceError('rate_limited', error.retryable);
    }
    return new AuthServiceError('provider_failure', error.retryable);
  }
  return new AuthServiceError('provider_failure', false);
}

function mapOAuthError(error: unknown): AuthServiceError {
  if (error instanceof LinkedInOAuthError) {
    if (error.kind === 'permission_required') {
      return new AuthServiceError('reauth_required', false);
    }
    if (error.kind === 'rate_limited') {
      return new AuthServiceError('rate_limited', error.retryable);
    }
    return new AuthServiceError('provider_failure', error.retryable);
  }
  return new AuthServiceError('provider_failure', false);
}

function refreshedCredential(
  current: StoredCredential,
  token: LinkedInTokenResult,
  now: Date,
): StoredCredential {
  const refreshToken = token.refreshToken ?? current.refreshToken;
  const refreshExpiresAt =
    token.refreshTokenExpiresInSeconds === undefined
      ? current.refreshExpiresAt
      : addSeconds(now, token.refreshTokenExpiresInSeconds);

  return {
    accessToken: token.accessToken,
    ...(refreshToken === undefined ? {} : { refreshToken }),
    expiresAt: addSeconds(now, token.expiresInSeconds),
    ...(refreshExpiresAt === undefined ? {} : { refreshExpiresAt }),
    scopes: token.scopes.length === 0 ? [...current.scopes] : [...token.scopes],
    ...(current.subject === undefined ? {} : { subject: current.subject }),
    mode: current.mode,
  };
}

export function createAuthService(deps: AuthServiceDeps = {}): AuthService {
  const now = deps.now ?? (() => new Date());
  const configured = configuredDeps(deps);
  let reauthRequired = false;

  function requireConfigured(): ConfiguredDeps {
    if (configured === null) throw new AuthServiceError('not_configured', false);
    return configured;
  }

  async function transitionToReauth(store: CredentialStore): Promise<never> {
    reauthRequired = true;
    await store.clear();
    throw new AuthServiceError('reauth_required', false);
  }

  async function loadCredential(store: CredentialStore): Promise<StoredCredential | null> {
    try {
      return await store.load();
    } catch {
      throw new AuthServiceError('provider_failure', false);
    }
  }

  return {
    startAuthorization() {
      const current = requireConfigured();
      const session = current.coordinator.start();
      const authorizationUrl = current.oauth.buildAuthorizationUrl(session);

      return {
        authorizationUrl,
        sessionId: session.id,
        scopes: [...session.scopes],
        mode: session.mode,
        expiresAt: session.expiresAt,
        provider,
      };
    },

    async getStatus() {
      if (configured === null) {
        return {
          state: 'not_configured',
          provider,
          scopes: [],
          refreshAvailable: false,
        };
      }

      const pending = configured.coordinator.peek();
      if (pending !== null) {
        return {
          state: 'authorization_pending',
          provider,
          mode: pending.mode,
          scopes: [...pending.scopes],
          expiresAt: pending.expiresAt,
          refreshAvailable: false,
        };
      }

      if (reauthRequired) {
        return {
          state: 'reauth_required',
          provider,
          mode: configured.config.mode,
          scopes: [],
          refreshAvailable: false,
        };
      }

      let credential: StoredCredential | null;
      try {
        credential = await configured.store.load();
      } catch {
        return {
          state: 'error',
          provider,
          mode: configured.config.mode,
          scopes: [],
          refreshAvailable: false,
        };
      }

      if (credential === null) {
        return {
          state: 'disconnected',
          provider,
          mode: configured.config.mode,
          scopes: [],
          refreshAvailable: false,
        };
      }

      return statusForCredential(credential, now());
    },

    async completeAuthorization(code) {
      const current = requireConfigured();
      let token: LinkedInTokenResult;
      try {
        token = await current.oauth.exchangeAuthorizationCode(code);
      } catch (error: unknown) {
        throw mapOAuthError(error);
      }

      let identity: AuthenticatedIdentity;
      try {
        identity = await current.fetchIdentity(token.accessToken);
      } catch (error: unknown) {
        const mapped = mapIdentityError(error);
        if (mapped.kind === 'reauth_required') return transitionToReauth(current.store);
        throw mapped;
      }

      const currentTime = now();
      const allowRefresh = current.config.mode === 'confidential';
      const credential: StoredCredential = {
        accessToken: token.accessToken,
        ...(allowRefresh && token.refreshToken !== undefined
          ? { refreshToken: token.refreshToken }
          : {}),
        expiresAt: addSeconds(currentTime, token.expiresInSeconds),
        ...(allowRefresh && token.refreshTokenExpiresInSeconds !== undefined
          ? { refreshExpiresAt: addSeconds(currentTime, token.refreshTokenExpiresInSeconds) }
          : {}),
        scopes: token.scopes.length === 0 ? [...code.scopes] : [...token.scopes],
        subject: identity.sub,
        mode: current.config.mode,
      };

      await current.store.save(credential);
      reauthRequired = false;
      return statusForCredential(credential, currentTime);
    },

    async getProfile() {
      const current = requireConfigured();
      if (reauthRequired) throw new AuthServiceError('reauth_required', false);

      let credential = await loadCredential(current.store);
      if (credential === null) throw new AuthServiceError('disconnected', false);

      const currentTime = now();
      if (isExpired(credential.expiresAt, currentTime)) {
        if (!canRefresh(credential, currentTime)) {
          reauthRequired = true;
          throw new AuthServiceError('reauth_required', false);
        }

        let token: LinkedInTokenResult | null;
        try {
          token = await current.oauth.refreshAccessToken(credential.refreshToken);
        } catch (error: unknown) {
          const mapped = mapOAuthError(error);
          if (mapped.kind === 'reauth_required') return transitionToReauth(current.store);
          throw mapped;
        }

        if (token === null) return transitionToReauth(current.store);
        credential = refreshedCredential(credential, token, currentTime);
        await current.store.save(credential);
      }

      try {
        return await current.fetchIdentity(credential.accessToken);
      } catch (error: unknown) {
        const mapped = mapIdentityError(error);
        if (mapped.kind === 'reauth_required') return transitionToReauth(current.store);
        throw mapped;
      }
    },

    async logout() {
      reauthRequired = false;
      if (configured !== null) {
        configured.coordinator.cancel();
        await configured.store.clear();
      }

      return {
        localCredentialsCleared: true,
        remoteRevocation: 'not_claimed',
        provider,
      };
    },
  };
}

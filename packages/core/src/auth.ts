export const oauthModes = ['confidential', 'native_pkce'] as const;

export type OAuthMode = (typeof oauthModes)[number];

export const authConnectionStates = [
  'not_configured',
  'disconnected',
  'authorization_pending',
  'connected',
  'expired',
  'reauth_required',
  'error',
] as const;

export type AuthConnectionState = (typeof authConnectionStates)[number];

export interface AuthenticatedIdentity {
  sub: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  locale?: string;
  email?: string;
  emailVerified?: boolean;
}

export interface StoredCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  refreshExpiresAt?: string;
  scopes: string[];
  subject?: string;
  mode: OAuthMode;
}

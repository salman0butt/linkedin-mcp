import type { AuthenticatedIdentity } from '../../../../packages/core/dist/index.js';

const LINKEDIN_USERINFO_ENDPOINT = 'https://api.linkedin.com/v2/userinfo';

export type LinkedInIdentityErrorKind = 'permission_required' | 'rate_limited' | 'provider_failure';

export class LinkedInIdentityError extends Error {
  readonly kind: LinkedInIdentityErrorKind;
  readonly retryable: boolean;

  constructor(kind: LinkedInIdentityErrorKind, retryable: boolean) {
    super(`LinkedIn identity request failed: ${kind}`);
    this.name = 'LinkedInIdentityError';
    this.kind = kind;
    this.retryable = retryable;
  }
}

interface LinkedInIdentityDeps {
  fetch?: typeof globalThis.fetch;
}

function classifyProviderError(status: number): LinkedInIdentityError {
  if (status === 401 || status === 403) {
    return new LinkedInIdentityError('permission_required', false);
  }
  if (status === 429) return new LinkedInIdentityError('rate_limited', true);
  return new LinkedInIdentityError('provider_failure', status >= 500);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeIdentity(value: unknown): AuthenticatedIdentity {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LinkedInIdentityError('provider_failure', false);
  }

  const claims = value as Record<string, unknown>;
  if (typeof claims.sub !== 'string' || claims.sub === '') {
    throw new LinkedInIdentityError('provider_failure', false);
  }

  const name = optionalString(claims.name);
  const givenName = optionalString(claims.given_name);
  const familyName = optionalString(claims.family_name);
  const picture = optionalString(claims.picture);
  const locale = optionalString(claims.locale);
  const email = optionalString(claims.email);
  const emailVerified = typeof claims.email_verified === 'boolean' ? claims.email_verified : undefined;

  return {
    sub: claims.sub,
    ...(name === undefined ? {} : { name }),
    ...(givenName === undefined ? {} : { givenName }),
    ...(familyName === undefined ? {} : { familyName }),
    ...(picture === undefined ? {} : { picture }),
    ...(locale === undefined ? {} : { locale }),
    ...(email === undefined ? {} : { email }),
    ...(emailVerified === undefined ? {} : { emailVerified }),
  };
}

export async function fetchLinkedInIdentity(
  accessToken: string,
  deps: LinkedInIdentityDeps = {},
): Promise<AuthenticatedIdentity> {
  if (accessToken === '') throw new LinkedInIdentityError('permission_required', false);

  const fetchImpl = deps.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchImpl(LINKEDIN_USERINFO_ENDPOINT, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new LinkedInIdentityError('provider_failure', true);
  }

  if (!response.ok) throw classifyProviderError(response.status);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LinkedInIdentityError('provider_failure', false);
  }

  return normalizeIdentity(payload);
}

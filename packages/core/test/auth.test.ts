import { describe, expect, it } from 'vitest';

import { authConnectionStates, oauthModes } from '../src/auth.js';
import type { AuthenticatedIdentity, StoredCredential } from '../src/auth.js';

describe('M01 auth domain contracts', () => {
  it('defines explicit OAuth modes and auth connection states', () => {
    expect(oauthModes).toEqual(['confidential', 'native_pkce']);
    expect(authConnectionStates).toEqual([
      'not_configured',
      'disconnected',
      'authorization_pending',
      'connected',
      'expired',
      'reauth_required',
      'error',
    ]);
  });

  it('keeps identity output separate from internal credential secrets', () => {
    const identity: AuthenticatedIdentity = {
      sub: 'member-123',
      name: 'Example Member',
      email: 'member@example.test',
      emailVerified: false,
    };
    const credential: StoredCredential = {
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      expiresAt: '2026-12-01T00:00:00.000Z',
      refreshExpiresAt: '2027-10-01T00:00:00.000Z',
      scopes: ['openid', 'profile', 'email'],
      subject: 'member-123',
      mode: 'confidential',
    };

    expect(identity).toEqual({
      sub: 'member-123',
      name: 'Example Member',
      email: 'member@example.test',
      emailVerified: false,
    });
    expect(credential.scopes).toEqual(['openid', 'profile', 'email']);
  });
});

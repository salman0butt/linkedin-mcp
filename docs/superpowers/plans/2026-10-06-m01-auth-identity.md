# M01 Authentication & Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add truthful LinkedIn OAuth/OIDC authentication, encrypted local credential persistence, identity inspection, auth status/logout tools, and capability projection without exposing secrets or pretending partner-gated features are universally available.

**Architecture:** A server-local auth service coordinates one pending OAuth session, a temporary loopback callback listener, an official LinkedIn OAuth/identity adapter, and an AES-256-GCM file credential store. `packages/core` owns provider-neutral auth types; `apps/server/src/auth/*` owns LinkedIn/local runtime behavior; `create-server.ts` exposes only secret-safe MCP contracts.

**Tech Stack:** Node.js 24 built-in crypto/fetch/http/fs, TypeScript 5.9, Zod v4, MCP TypeScript SDK, Vitest, pnpm 12.

**Spec:** `docs/superpowers/specs/2026-10-06-m01-auth-identity-design.md`

## Global Constraints

- Default identity scopes are exactly `openid profile email`; `openid` is mandatory.
- `confidential` mode uses the standard LinkedIn authorization-code flow and configured client secret.
- `native_pkce` uses LinkedIn's native PKCE authorization endpoint, S256, loopback redirect, and no client secret in token exchange.
- OAuth state is cryptographically random, mandatory, single-use, and compared safely.
- Native PKCE callbacks bind only to `127.0.0.1` or `[::1]`, validate the exact configured callback path, and close after success, terminal failure, or timeout.
- Startup remains valid when auth is unconfigured; auth-backed tools report explicit configuration/auth state.
- No access token, refresh token, client secret, encryption key, authorization code, OAuth state, or PKCE verifier may appear in MCP output, logs, errors, or snapshots.
- Credential persistence uses AES-256-GCM with a base64-encoded 32-byte external key, fresh 96-bit IV, authenticated ciphertext, restrictive permissions, and atomic replacement.
- Programmatic refresh support is conditional on an actual refresh token; never claim universal LinkedIn refresh-token availability.
- Local logout clears local credentials; remote revocation is not claimed without a documented and verified provider operation.
- `profile.me` provider provenance is `OFFICIAL_API`; mocked CI proves implementation, not live LinkedIn account availability.
- No LinkedIn publishing, organization operations, browser automation, CAPTCHA/security-challenge bypass, or bulk behavior enters M01.

## Review Focus

1. Replayed, missing, wrong, or expired OAuth state fails before token exchange and never leaks supplied state.
2. Callback listeners never bind non-loopback interfaces or accept a different callback path.
3. Malformed or tampered credential ciphertext and wrong encryption keys fail closed without destroying the last valid file.
4. Provider 401 after a previously valid token transitions to `reauth_required` and never enters a retry loop.
5. Optional userinfo email fields remain optional.
6. PKCE and refresh entitlement limits are surfaced explicitly rather than silently falling back or claiming support.

---

### Task 1: Auth configuration, contracts, and redaction

**Files:**

- Create: `packages/core/src/auth.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/src/logger.ts`
- Test: `packages/core/test/auth.test.ts`
- Test: `apps/server/test/config.test.ts`
- Test: `apps/server/test/logger.test.ts`

**Interfaces:**

- Produces `OAuthMode`, `AuthConnectionState`, `AuthenticatedIdentity`, `StoredCredential`, and optional `ServerConfig.auth`.
- Consumes M00 result/provider and config/logger patterns.

- [ ] Write tests first for both OAuth modes, partial-config rejection, `openid` scope requirement, native-PKCE loopback redirect validation, and M01 secret redaction.
- [ ] Run exact-head CI and confirm the Test step fails because M01 auth code is missing.
- [ ] Implement only the minimum auth types/config/redaction needed by those tests.
- [ ] Re-run exact-head CI; require format, tests, lint, typecheck, and build green before continuing.
- [ ] Record RED/GREEN SHAs and advance durable state to M01.3.

### Task 2: OAuth session, PKCE, and callback listener

**Files:**

- Create: `apps/server/src/auth/oauth-session.ts`
- Create: `apps/server/src/auth/callback-listener.ts`
- Test: `apps/server/test/oauth-session.test.ts`
- Test: `apps/server/test/callback-listener.test.ts`

**Interfaces:**

- Produces single-use pending authorization sessions, S256 challenges, callback-code consumption, and a bounded temporary loopback listener.

- [ ] RED tests cover random session/state values, PKCE verifier/challenge, five-minute expiry, wrong/missing/replayed state, and confidential mode omitting PKCE fields.
- [ ] RED listener tests cover loopback-only bind, exact path validation, provider error callbacks, one terminal result, timeout, and listener close behavior.
- [ ] Implement with injected randomness/clock where practical and constant-time equal-length state comparison.
- [ ] Verify focused GREEN plus full suite.

### Task 3: Encrypted credential store

**Files:**

- Create: `apps/server/src/auth/credential-store.ts`
- Test: `apps/server/test/credential-store.test.ts`

**Interfaces:**

- `CredentialStore.load(): Promise<StoredCredential | null>`
- `CredentialStore.save(value): Promise<void>`
- `CredentialStore.clear(): Promise<void>`

- [ ] RED tests cover AES-256-GCM roundtrip, random IV, wrong-key failure, tamper detection, `0600` where supported, atomic replacement, and idempotent clear.
- [ ] Implement a versioned envelope using Node crypto and atomic same-directory temp-file rename.
- [ ] Verify focused GREEN plus full suite.

### Task 4: Official LinkedIn OAuth adapter

**Files:**

- Create: `apps/server/src/auth/linkedin-oauth.ts`
- Test: `apps/server/test/linkedin-oauth.test.ts`

**Interfaces:**

- Produces authorization URLs, authorization-code exchange, optional refresh when a real refresh token exists, and sanitized provider-error classification.

- [ ] RED tests assert confidential and native-PKCE endpoints and exact form fields.
- [ ] RED tests prove native exchange excludes `client_secret`, confidential exchange excludes `code_verifier`, and missing refresh tokens disable refresh.
- [ ] RED tests classify 400/401/429/5xx without echoing request secrets.
- [ ] Implement injected-fetch adapter with `application/x-www-form-urlencoded` bodies.
- [ ] Verify focused GREEN plus full suite.

### Task 5: Official OIDC userinfo identity

**Files:**

- Create: `apps/server/src/auth/linkedin-identity.ts`
- Test: `apps/server/test/linkedin-identity.test.ts`

**Interfaces:**

- Produces `fetchLinkedInIdentity(accessToken, deps): Promise<AuthenticatedIdentity>` against `https://api.linkedin.com/v2/userinfo`.

- [ ] RED tests cover documented claim mapping, missing optional email claims, invalid/missing `sub`, 401, 429, and sanitized provider failures.
- [ ] Implement bearer-token request with the token only in the Authorization header.
- [ ] Verify focused GREEN plus full suite.

### Task 6: Auth lifecycle service

**Files:**

- Create: `apps/server/src/auth/auth-service.ts`
- Test: `apps/server/test/auth-service.test.ts`

**Interfaces:**

- `startAuthorization()`
- `getStatus()`
- `completeAuthorization()`
- `getProfile()`
- `logout()`

- [ ] RED tests cover unconfigured, disconnected, pending, connected, expired, and `reauth_required` states.
- [ ] RED tests prove refresh is attempted only with a legitimate refresh token, 401 triggers reauth without retry loops, and logout clears local/pending state without claiming remote revocation.
- [ ] Implement dependency-injected state orchestration.
- [ ] Verify focused GREEN plus full suite.

### Task 7: MCP auth/profile tools and capability projection

**Files:**

- Modify: `apps/server/src/create-server.ts`
- Modify: `apps/server/src/foundation.ts`
- Modify: `packages/core/src/capabilities.ts`
- Test: `apps/server/test/mcp-contract.test.ts`
- Test: `packages/core/test/capabilities.test.ts`

**Interfaces:**

- Adds `linkedin.auth.start`, `linkedin.auth.status`, `linkedin.profile.me`, and `linkedin.auth.logout`.
- Adds dynamic runtime projection for `profile.me` while keeping static/live availability conservative.

- [ ] RED real-client tests prove tool discovery, strict input validation, secret-free output, official provenance, and conservative unavailable state without configured auth.
- [ ] Register tools through injected `AuthService` while preserving M00 stdio/HTTP defaults.
- [ ] Verify GREEN including real stdio and HTTP transport smoke tests.

### Task 8: Security review and closeout

**Files:**

- Modify durable M01 state, traceability, capability matrix, status, and known issues as evidence requires.
- Create `docs/superpowers/evidence/2026-10-06-m01-auth-identity-closeout.md` only when evidence exists.

- [ ] Run `pnpm format:check`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- [ ] Perform skeptical/security review for token leakage, callback/state replay, PKCE correctness, callback binding/path safety, credential-file attacks, provider-error leakage, 401 lifecycle, scope overreach, false refresh/revocation claims, provenance, and transport compatibility.
- [ ] Critical/Important findings receive genuine regression RED -> GREEN cycles.
- [ ] Reconcile exact branch/PR/SHA/CI state; mocked CI must not mark live LinkedIn access verified.
- [ ] Require exact-final-head green CI, zero unresolved Critical/Important findings, clean review threads, stable remote head, mergeability, and current traceability before marking PR ready.
- [ ] Squash merge under repository policy, verify push CI on the exact new `main` SHA, then activate M02 and continue.

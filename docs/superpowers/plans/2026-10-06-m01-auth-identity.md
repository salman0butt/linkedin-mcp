# M01 Authentication & Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add truthful LinkedIn OAuth/OIDC authentication, encrypted local credential persistence, identity inspection, auth status/logout tools, and capability projection without exposing secrets or pretending partner-gated features are universally available.

**Architecture:** A server-local auth service coordinates one pending OAuth session, an official LinkedIn OAuth/identity adapter, and an AES-256-GCM file credential store. `packages/core` owns provider-neutral auth types; `apps/server/src/auth/*` owns LinkedIn/local runtime behavior; `create-server.ts` exposes only secret-safe MCP contracts.

**Tech Stack:** Node.js 24 built-in crypto/fetch/http/fs, TypeScript 5.9, Zod v4, MCP TypeScript SDK, Vitest, pnpm 12.

**Spec:** `docs/superpowers/specs/2026-10-06-m01-auth-identity-design.md`

## Global Constraints

- Default identity scopes are exactly `openid profile email`; `openid` is mandatory.
- `confidential` mode uses the standard LinkedIn authorization-code flow and configured client secret.
- `native_pkce` uses LinkedIn's native PKCE authorization endpoint, S256, loopback redirect, and no client secret in token exchange.
- OAuth state is cryptographically random, mandatory, single-use, and compared safely.
- Startup remains valid when auth is unconfigured; auth-backed tools report explicit configuration/auth state.
- No access token, refresh token, client secret, encryption key, authorization code, OAuth state, or PKCE verifier may appear in MCP output/logs/errors/snapshots.
- Credential persistence uses AES-256-GCM with a base64-encoded 32-byte external key, fresh 96-bit IV, authenticated ciphertext, restrictive permissions, and atomic replacement.
- Programmatic refresh support is conditional on an actual refresh token; never claim universal LinkedIn refresh-token availability.
- Local logout clears local credentials; remote revocation is not claimed without a documented and verified provider operation.
- `profile.me` provider provenance is `OFFICIAL_API`; mocked CI proves implementation, not live LinkedIn account availability.
- No LinkedIn publishing, organization operations, browser automation, CAPTCHA/security-challenge bypass, or bulk behavior enters M01.

## Review Focus

1. Replayed/wrong OAuth state must fail before token exchange and must never leak the supplied state.
2. Malformed/tampered credential ciphertext or a wrong encryption key must fail closed without destroying the last valid file.
3. Provider 401 after a previously valid token must transition to `reauth_required` and must not enter a retry loop.
4. Optional userinfo email fields must remain optional; absence must not make an otherwise valid identity fail.
5. A configured app without PKCE/refresh entitlement must report the limitation explicitly rather than silently falling back or claiming support.

---

## File map

- `packages/core/src/auth.ts` — provider-neutral auth state, identity, token metadata and OAuth mode types.
- `packages/core/src/index.ts` — export auth types.
- `apps/server/src/config.ts` — validated optional LinkedIn auth configuration.
- `apps/server/src/logger.ts` — extend redaction coverage for M01 secrets.
- `apps/server/src/auth/oauth-session.ts` — random state/session/PKCE construction and single-use pending session lifecycle.
- `apps/server/src/auth/linkedin-oauth.ts` — authorization URL, code exchange, optional refresh and provider error normalization.
- `apps/server/src/auth/credential-store.ts` — encrypted atomic one-account credential persistence.
- `apps/server/src/auth/linkedin-identity.ts` — official OIDC userinfo request and identity normalization.
- `apps/server/src/auth/auth-service.ts` — auth state machine, credential lifecycle, logout and identity orchestration.
- `apps/server/src/create-server.ts` — MCP auth/profile tools and dynamic capability projection dependency.
- `apps/server/test/*` — focused RED/GREEN behavior tests.
- `docs/*` state/traceability/capability files — durable activation and verification state.

### Task 1: Activate M01 and define auth configuration/contracts

**Files:**
- Create: `packages/core/src/auth.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/src/logger.ts`
- Test: `packages/core/test/auth.test.ts`
- Test: `apps/server/test/config.test.ts`
- Test: `apps/server/test/logger.test.ts`
- Modify: `docs/progress/project-state.json`
- Modify: `docs/progress/STATUS.md`
- Modify: `docs/milestones/CURRENT.md`
- Modify: `docs/milestones/M01-auth-identity.md`
- Modify: `docs/requirements/TRACEABILITY.md`

**Interfaces:**
- Produces: `OAuthMode = 'confidential' | 'native_pkce'`; `AuthConnectionState`; `AuthenticatedIdentity`; `StoredCredential`; `AuthConfig` on `ServerConfig` as optional validated auth configuration.
- Consumes: M00 `ProviderType`, `ToolResult`, logger/config patterns.

- [ ] **Step 1: Write failing core/config/logger tests**

Add tests named:
- `defines secret-free auth domain contracts`;
- `parses confidential OAuth configuration only when all required fields exist`;
- `parses native PKCE configuration without requiring a client secret`;
- `rejects non-loopback redirect URI for native PKCE mode`;
- `requires openid in configured OAuth scopes`;
- `redacts M01 OAuth and encryption secret field names`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm test -- packages/core/test/auth.test.ts apps/server/test/config.test.ts apps/server/test/logger.test.ts`

Expected: FAIL because M01 auth types/config/redaction do not exist.

- [ ] **Step 3: Implement minimal auth types/config/redaction**

Define exact public types in `packages/core/src/auth.ts`:

```ts
export type OAuthMode = 'confidential' | 'native_pkce';
export type AuthConnectionState =
  | 'not_configured'
  | 'disconnected'
  | 'authorization_pending'
  | 'connected'
  | 'expired'
  | 'reauth_required'
  | 'error';

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
```

`StoredCredential` contains token strings internally plus expiry/scope/subject/provider mode metadata; it is never an MCP output type.

Extend `ServerConfig` with `auth?: LinkedInAuthConfig`, validating the exact environment keys in the spec.

- [ ] **Step 4: Verify GREEN and broader static compatibility**

Run: `pnpm test -- packages/core/test/auth.test.ts apps/server/test/config.test.ts apps/server/test/logger.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Reconcile activation docs and commit**

Set M01/M01.1 active on `feat/m01-auth-identity`, record post-M00 `main` SHA `dde9bde5b136b0c352a864fadce08f02cab32938` and push CI `37469308840`, point traceability to the M01 spec/plan, and set exactly one next action to Task 2.

Commit message: `feat(m01): define auth configuration contracts`

### Task 2: OAuth state and PKCE authorization session

**Files:**
- Create: `apps/server/src/auth/oauth-session.ts`
- Test: `apps/server/test/oauth-session.test.ts`

**Interfaces:**
- Consumes: `OAuthMode`, validated auth config.
- Produces: `createAuthorizationSession(config, deps): AuthorizationSession`; `consumeAuthorizationCallback(sessionId, callback): ConsumedAuthorizationCode`; `buildPkceChallenge(verifier): string`.

- [ ] **Step 1: Write failing session tests**

Cover cryptographic state/session generation, 43–128 character verifier, S256 challenge, exact configured scopes, five-minute default expiry, wrong/missing state, replay, expired session, and confidential mode omitting PKCE fields.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- apps/server/test/oauth-session.test.ts`

Expected: FAIL because OAuth session functions do not exist.

- [ ] **Step 3: Implement the in-memory single-session coordinator**

Use injected randomness/clock in tests. Never persist state/verifier. Constant-time compare equal-length state values before consuming the session.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test -- apps/server/test/oauth-session.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(m01): add OAuth state and PKCE sessions`

### Task 3: Encrypted credential store

**Files:**
- Create: `apps/server/src/auth/credential-store.ts`
- Test: `apps/server/test/credential-store.test.ts`

**Interfaces:**
- Consumes: `StoredCredential`.
- Produces: `CredentialStore` interface with `load(): Promise<StoredCredential | null>`, `save(value): Promise<void>`, `clear(): Promise<void>` and `createFileCredentialStore(options): CredentialStore`.

- [ ] **Step 1: Write failing storage tests**

Cover AES-256-GCM roundtrip, random IV changing ciphertext, wrong-key failure, byte tamper detection, mode `0600` where supported, atomic replacement preserving a prior valid file when replacement fails, and idempotent clear.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- apps/server/test/credential-store.test.ts`

Expected: FAIL because the credential store does not exist.

- [ ] **Step 3: Implement versioned encrypted envelope**

Use Node `crypto` and `fs/promises`; validate the decoded key is exactly 32 bytes; write temp file in the same directory then rename atomically.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test -- apps/server/test/credential-store.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(m01): encrypt local LinkedIn credentials`

### Task 4: Official LinkedIn OAuth exchange and token lifecycle

**Files:**
- Create: `apps/server/src/auth/linkedin-oauth.ts`
- Test: `apps/server/test/linkedin-oauth.test.ts`

**Interfaces:**
- Consumes: validated auth config and consumed authorization code/session.
- Produces: `buildAuthorizationUrl(config, session): URL`; `exchangeAuthorizationCode(input, deps): Promise<StoredCredential>`; `refreshAccessToken(credential, config, deps): Promise<StoredCredential>`.

- [ ] **Step 1: Write failing adapter tests**

Assert confidential authorization URL/token form fields; native-PKCE native endpoint plus `code_challenge_method=S256`; native exchange includes `code_verifier` and excludes `client_secret`; confidential exchange includes `client_secret` and excludes verifier; scopes and expiry normalize correctly; refresh is rejected when no refresh token exists; provider 401/400/429/5xx are classified without echoing request secrets.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- apps/server/test/linkedin-oauth.test.ts`

Expected: FAIL because LinkedIn OAuth adapter does not exist.

- [ ] **Step 3: Implement minimal injected-fetch adapter**

Use `application/x-www-form-urlencoded`; never log body/credentials. Preserve optional `refresh_token` only when LinkedIn actually returns it.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test -- apps/server/test/linkedin-oauth.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(m01): add official LinkedIn OAuth adapter`

### Task 5: Official OIDC userinfo identity client

**Files:**
- Create: `apps/server/src/auth/linkedin-identity.ts`
- Test: `apps/server/test/linkedin-identity.test.ts`

**Interfaces:**
- Consumes: a valid internal access token.
- Produces: `fetchLinkedInIdentity(accessToken, deps): Promise<AuthenticatedIdentity>`.

- [ ] **Step 1: Write failing identity tests**

Cover documented userinfo claim mapping, absent email/email_verified, malformed response, 401 classification, 429, and sanitization of provider response errors.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- apps/server/test/linkedin-identity.test.ts`

Expected: FAIL because identity client does not exist.

- [ ] **Step 3: Implement `/v2/userinfo` client**

Bearer token exists only in the Authorization header. Parse only documented fields and reject missing/invalid `sub`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test -- apps/server/test/linkedin-identity.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(m01): add official LinkedIn identity client`

### Task 6: Auth service state machine and logout

**Files:**
- Create: `apps/server/src/auth/auth-service.ts`
- Test: `apps/server/test/auth-service.test.ts`

**Interfaces:**
- Consumes: OAuth session coordinator, OAuth adapter, credential store, identity client.
- Produces: `AuthService` with `startAuthorization()`, `getStatus()`, `completeAuthorization()`, `getProfile()`, `logout()`.

- [ ] **Step 1: Write failing service tests**

Cover unconfigured/disconnected/pending/connected/expired/reauth-required states, pre-request expiry handling, optional refresh only when refresh token exists, provider 401 transition to `reauth_required`, no retry loop, local logout clearing pending and persisted state, and secret-free returned objects.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- apps/server/test/auth-service.test.ts`

Expected: FAIL because auth service does not exist.

- [ ] **Step 3: Implement minimal state machine**

Inject dependencies; keep provider errors normalized. Logout reports local clear truth and explicitly does not claim remote revocation.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test -- apps/server/test/auth-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(m01): orchestrate auth lifecycle`

### Task 7: MCP auth/profile tools and truthful capability projection

**Files:**
- Modify: `apps/server/src/create-server.ts`
- Modify: `packages/core/src/capabilities.ts`
- Modify: `apps/server/src/foundation.ts`
- Test: `apps/server/test/mcp-contract.test.ts`
- Test: `packages/core/test/capabilities.test.ts`

**Interfaces:**
- Consumes: `AuthService`.
- Produces MCP tools: `linkedin.auth.start`, `linkedin.auth.status`, `linkedin.profile.me`, `linkedin.auth.logout`; dynamic `profile.me` runtime capability projection.

- [ ] **Step 1: Write failing real-client contract tests**

Assert tool discovery, strict inputs, secret-free auth-start/status/profile/logout structured output, `profile.me` official provenance, and conservative `UNAVAILABLE` capability when auth is not configured/connected.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- apps/server/test/mcp-contract.test.ts packages/core/test/capabilities.test.ts`

Expected: FAIL because M01 tools/projection are absent.

- [ ] **Step 3: Register tools and capability projection**

Inject `AuthService` through `LinkedInMcpServerDeps`; preserve M00 defaults so existing tests/stdio/http remain valid without auth configuration.

- [ ] **Step 4: Verify GREEN and all transport contracts**

Run: `pnpm test -- apps/server/test/mcp-contract.test.ts packages/core/test/capabilities.test.ts tests/contract/stdio-smoke.test.ts tests/contract/http-smoke.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(m01): expose auth and identity MCP tools`

### Task 8: Full verification, skeptical/security review and durable closeout state

**Files:**
- Modify: `docs/milestones/M01-auth-identity.md`
- Modify: `docs/progress/project-state.json`
- Modify: `docs/progress/STATUS.md`
- Modify: `docs/progress/KNOWN-ISSUES.md` if new external/access blockers are proven
- Modify: `docs/requirements/TRACEABILITY.md`
- Modify: `docs/product/CAPABILITY-MATRIX.md`
- Create: `docs/superpowers/evidence/2026-10-06-m01-auth-identity-closeout.md` only when evidence exists

**Interfaces:**
- Consumes: all M01 implementation and test evidence.
- Produces: exact durable milestone state and one next work action.

- [ ] **Step 1: Run the complete local/CI-equivalent verification commands**

Run in order:

```bash
pnpm format:check
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all exit 0 with no hidden failures.

- [ ] **Step 2: Perform skeptical and security review**

Review specifically for token leakage, callback/state replay, PKCE correctness, credential-file attacks, filesystem permissions, provider error leakage, 401 lifecycle correctness, scope overreach, false refresh/revocation claims, capability provenance, and compatibility with stdio/HTTP transports.

Critical/Important findings must receive a genuine regression RED -> GREEN cycle before closeout.

- [ ] **Step 3: Reconcile durable state**

Record actual branch/PR/head SHA/CI only. Keep `profile.me` static availability conservative unless a live LinkedIn call has actually verified configured access. If live credentials/PKCE entitlement are unavailable, record the exact live-verification blocker rather than marking implementation failure.

- [ ] **Step 4: Verify exact final head CI and merge gates**

Required: exact-head green CI, zero unresolved Critical/Important findings, no blocking review threads, stable remote head, mergeable PR, current traceability/state.

- [ ] **Step 5: Squash merge, verify post-merge `main`, and continue**

After merge, verify push CI on the exact new `main` SHA before activating M02.

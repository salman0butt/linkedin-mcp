# LinkedIn MCP — M01 Authentication & Identity Design

Date: 2026-10-06
Status: DESIGN — APPROVED UNDER STANDING OWNER AUTHORIZATION

## 1. Goal

Implement the first real LinkedIn-backed capability family without overstating access: OAuth member authorization, authenticated identity, granted-scope inspection, secret-safe credential persistence, explicit token health/expiry behavior, and safe local logout.

M01 must make it possible for later milestones to depend on a single authenticated-member boundary rather than handling tokens directly.

## 2. Product intent

M01 serves a local MCP user who wants to connect one LinkedIn member account deliberately and understand exactly what the configured LinkedIn application can access.

Success means:

- authorization is initiated explicitly by the user;
- CSRF state is mandatory and single-use;
- PKCE is used when the configured LinkedIn application has native-PKCE access;
- the standard confidential authorization-code flow remains available for ordinary server-side applications;
- identity is obtained from LinkedIn's official OpenID Connect `userinfo` endpoint using `openid profile email` where those permissions are provisioned;
- tokens are never returned by MCP tools, logs, errors, docs, or test snapshots;
- persisted credentials are encrypted at rest;
- expiry, missing permission, revocation/401, and partner-gated refresh behavior are explicit;
- `profile.me` remains truthful about provider provenance and availability.

## 3. External-access facts that constrain the design

Current official LinkedIn documentation establishes the following constraints:

1. Sign In with LinkedIn uses OpenID Connect and introduces `openid`, `profile`, and `email` scopes.
2. The official OIDC userinfo endpoint is `https://api.linkedin.com/v2/userinfo`.
3. Standard member authorization uses the 3-legged authorization-code flow and requires a client secret at token exchange.
4. LinkedIn documents a separate native-client PKCE flow using S256 and loopback callbacks; PKCE enablement is access-dependent and may require LinkedIn enablement for the application.
5. Programmatic refresh tokens are not universal; LinkedIn documents them for approved Marketing Developer Platform partners.
6. LinkedIn access tokens can become invalid before nominal expiry, including member revocation and permission changes; downstream 401 must therefore be treated as an authentication-state transition, not a generic transient error.
7. No generic remote OAuth token-revocation endpoint is assumed by this design. Local logout must never be presented as verified remote revocation.

Primary references:

- https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow-native
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access

## 4. Approaches considered

### A. Native PKCE only

Strong local-client security and no distributed client secret, but LinkedIn's documented PKCE flow is not universally enabled. Making it the only path would incorrectly turn an access-dependent feature into a baseline requirement.

### B. Confidential authorization-code flow only

Broadly aligned with the ordinary 3-legged OAuth documentation, but ignores the repository's PKCE security requirement and is a poor fit when the MCP is acting as a local/native client.

### C. Provider-owned two-mode OAuth coordinator — selected

Create one official LinkedIn OAuth provider with explicit modes:

- `confidential`: standard authorization-code flow, mandatory state, configured client secret;
- `native_pkce`: LinkedIn native-PKCE endpoint, mandatory state, S256 verifier/challenge, loopback-only redirect, no client secret in token exchange.

Both modes converge on the same token/identity/storage contracts. Capability metadata records the configured mode and never implies unavailable partner features.

## 5. Architecture

```text
MCP tool
  -> Auth service
     -> OAuth coordinator
        -> LinkedIn official OAuth adapter
        -> pending-auth session store (memory only)
        -> callback listener (loopback only, temporary)
     -> encrypted credential store
     -> LinkedIn identity client (`/v2/userinfo`)
     -> auth/capability projection
```

The MCP server never exposes raw access tokens or refresh tokens.

### Domain boundaries

`packages/core` owns provider-neutral auth types and capability truth rules.

`apps/server/src/auth` owns local orchestration and LinkedIn-specific HTTP behavior for M01. If a second runtime/provider needs the same implementation later, extraction into a package is justified then; M01 should not create speculative packages.

## 6. Public MCP surface

### `linkedin.auth.start`

Purpose: start an explicit OAuth authorization attempt.

Input:

- optional requested scopes constrained to the configured/allowed scope set;
- no client secret or encryption key input.

Output:

- authorization URL;
- authorization-session identifier safe for display;
- requested scopes;
- flow mode (`confidential` or `native_pkce`);
- expiry timestamp;
- provider `OFFICIAL_API`.

It never opens a browser itself and never returns verifier/state secrets.

### `linkedin.auth.status`

Purpose: expose connection state without leaking credentials.

States should distinguish at least:

- `not_configured`;
- `disconnected`;
- `authorization_pending`;
- `connected`;
- `expired`;
- `reauth_required`;
- `error`.

When connected, return subject identifier, granted scopes, access-token expiry and refresh capability classification. Do not return tokens.

### `linkedin.profile.me`

Purpose: return the authenticated member identity from the official OIDC userinfo endpoint.

Fields are limited to documented userinfo claims. `email` and `email_verified` are optional. Provider provenance is `OFFICIAL_API`.

On 401, atomically transition stored auth state to reauthorization-required and return an authentication-specific structured status.

### `linkedin.auth.logout`

Purpose: delete local persisted credentials and in-memory authorization state.

Output must distinguish:

- local credentials cleared;
- remote revocation not claimed/verified unless a documented provider operation is later added and actually succeeds.

Local logout is safe to execute without a consequential LinkedIn write approval because it removes local access rather than modifying LinkedIn content.

## 7. OAuth session model

Only one active authorization session is allowed per local account/store in M01.

A pending session contains in memory only:

- random opaque session id;
- cryptographically random state;
- requested scopes;
- created/expiry times;
- redirect URI;
- OAuth mode;
- PKCE verifier only in native-PKCE mode.

Pending session data is never persisted. It expires after a short bounded window (default five minutes) and is consumed once.

Callback rules:

- listener binds only to `127.0.0.1` or `[::1]`;
- redirect path must exactly match configured path;
- returned state must match using constant-time comparison;
- callback code/error is accepted only for a live pending session;
- callback response contains no token or identity data;
- callback listener closes after success, terminal failure, or timeout.

## 8. Scope policy

Default identity scopes are exactly:

```text
openid profile email
```

M01 does not request publishing or organization scopes.

The configuration may reduce scopes, but `openid` is mandatory for the OIDC identity flow. Requested scopes must be a subset of the configured allowlist. The effective granted scope set comes from the token response when available and is stored explicitly.

Capability checks use granted scope truth, never the requested-scope list alone.

## 9. Configuration

Extend server configuration with validated optional auth settings:

- `LINKEDIN_MCP_OAUTH_MODE=confidential|native_pkce`;
- `LINKEDIN_MCP_CLIENT_ID`;
- `LINKEDIN_MCP_CLIENT_SECRET` for confidential mode only;
- `LINKEDIN_MCP_REDIRECT_URI`;
- `LINKEDIN_MCP_OAUTH_SCOPES` default `openid profile email`;
- `LINKEDIN_MCP_CREDENTIAL_STORE_PATH`;
- `LINKEDIN_MCP_TOKEN_ENCRYPTION_KEY` as a base64-encoded 32-byte key.

MCP startup remains possible with auth unconfigured. Auth-backed tools report `not_configured` / `permission_required` rather than making the entire local foundation server unusable.

Secrets must be covered by the structured logger redaction policy.

## 10. Credential persistence

M01 uses a narrow file-backed encrypted credential-store interface with an implementation suitable for one local account.

Encryption:

- AES-256-GCM using Node's cryptographic primitives;
- fresh random 96-bit IV for every write;
- authentication tag stored with ciphertext;
- versioned envelope so encryption format can evolve;
- key supplied externally through configuration and never written to the credential file.

Persist only what is required:

- access token;
- optional refresh token;
- token expiry;
- optional refresh expiry;
- granted scopes;
- OIDC subject;
- provider/mode metadata needed for safe lifecycle handling.

Do not persist profile email/name merely as a convenience cache in M01.

Writes use restrictive filesystem permissions where the platform supports them and atomic replace semantics to avoid partial credential files.

## 11. Token lifecycle

Before an authenticated request:

1. load/decrypt credentials;
2. validate expiry;
3. if valid, use the access token;
4. if expired and a legitimate refresh token is present, use the documented refresh-token flow;
5. if refresh is unavailable/expired/fails with authentication semantics, require reauthorization;
6. never assume refresh-token support solely because OAuth is configured.

A LinkedIn 401 from userinfo invalidates the usable-session projection and requires reauthorization. Retry loops may not mask this state.

## 12. Provider result and error semantics

M01 should reuse the M00 `ToolResult` boundary rather than inventing a second envelope.

Representative mappings:

- auth not configured -> `permission_required`;
- authorization still pending -> `human_action_required`;
- missing app product/scope -> `permission_required`;
- partner-only refresh unavailable -> explicit warning/metadata, not fake support;
- LinkedIn 429 -> `rate_limited`;
- LinkedIn 401/invalid grant -> `permission_required` and reauth state;
- network/5xx -> `failed` with retryability based on cause;
- successful identity read -> `succeeded`, provider `OFFICIAL_API`.

Raw LinkedIn error bodies must be sanitized before surfacing because providers can echo sensitive request material.

## 13. Capability truth

`profile.me` progresses from `PLANNED/UNAVAILABLE` to implementation state during M01, but it must not become `AVAILABLE/VERIFIED` merely because mocked tests pass.

Two different facts are tracked:

- implementation verification: code behavior is covered by deterministic tests/CI;
- configured account availability: a real LinkedIn application/member session has the required product/scopes and a live identity request succeeds.

The runtime `linkedin.capabilities` result may project configured availability dynamically. The static product matrix should remain conservative until live verification evidence exists.

## 14. Security and privacy requirements

- OAuth state required, unpredictable and single-use.
- PKCE verifier/challenge uses S256 and cryptographic randomness when native-PKCE mode is selected.
- callback binds loopback only.
- client secret, encryption key, access token, refresh token, authorization code, state and PKCE verifier are redacted as secrets.
- no token in URL after the authorization callback; token exchange uses form body.
- credential file encrypted/authenticated and permission-restricted.
- identity output contains only documented userinfo claims.
- email is optional and never assumed verified unless LinkedIn says so.
- no browser automation, credential scraping, CAPTCHA handling or security-challenge bypass.
- no LinkedIn write capability is introduced in M01.

## 15. Testing strategy

All meaningful behavior follows real RED -> GREEN -> REFACTOR.

Required deterministic coverage:

1. configuration validation for both modes and secret redaction;
2. PKCE verifier/challenge RFC-compatible construction and state generation;
3. authorization URL construction with exact scopes and redirect URI;
4. callback rejects wrong/missing/replayed state before token exchange;
5. confidential and native-PKCE token exchanges send only expected fields;
6. token responses are normalized without exposing tokens in tool output;
7. AES-GCM store roundtrip, wrong-key failure, tamper detection, atomic overwrite and deletion;
8. userinfo identity mapping including absent optional email;
9. downstream 401 transitions auth state to `reauth_required`;
10. refresh path only activates when an actual refresh token exists;
11. MCP real-client contracts for auth status/profile/logout without secret leakage;
12. capability output remains conservative when no live LinkedIn credentials exist.

Ordinary CI uses fake local HTTP providers/injected fetch; no real LinkedIn secrets are required.

Live LinkedIn verification, when credentials/product access are available, is a separate explicit integration gate and must never expose its tokens in Actions logs.

## 16. Iteration plan

- **M01.1** — activation, design/plan, state/traceability reconciliation.
- **M01.2** — auth configuration + provider-neutral auth contracts.
- **M01.3** — OAuth authorization session + state + PKCE URL construction.
- **M01.4** — secure encrypted credential store.
- **M01.5** — code exchange + token lifecycle/optional refresh handling.
- **M01.6** — official OIDC userinfo identity client + `linkedin.profile.me`.
- **M01.7** — MCP auth start/status/logout integration and dynamic capability projection.
- **M01.8** — security/skeptical review, live-access assessment, exact-head CI and closeout.

## 17. Out of scope

- publishing scopes or writes;
- organization/page identity;
- post/job/content search;
- browser automation;
- arbitrary multi-account storage;
- hosted OAuth callback service;
- speculative database/Redis infrastructure;
- claiming remote token revocation without a documented and verified provider operation.

## 18. Expected external blocker boundary

Implementation and deterministic CI do not require real LinkedIn credentials.

Full live M01 availability verification does require a LinkedIn developer application with the appropriate Sign In with LinkedIn product/scopes. Native-PKCE verification additionally depends on LinkedIn enabling that flow for the application. Programmatic refresh verification additionally depends on eligible partner access.

If those external permissions are absent, durable state must say exactly which live-verification gate is blocked while retaining all safely verified implementation progress.

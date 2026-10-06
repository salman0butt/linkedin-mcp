# Project Status

Last reconciled: 2026-10-06. Actual Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M01 — Authentication & Identity — **ACTIVE**.

Active task: M01.2 auth configuration + provider-neutral auth contracts complete; next is M01.3 OAuth session, CSRF state, PKCE, and temporary loopback callback listener.

Active branch: `feat/m01-auth-identity`.
Active PR: #2 — `Build M01 authentication and identity` (draft).
Latest verified M01 SHA: `30ec5b4ac6d867b7cd50b7f2e2d7e7ad007386bc`.
M01 CI: GREEN — PR run `37482919464` passed frozen install, format, all tests, lint, typecheck, and build on that exact SHA.
Verified base `main`: `dde9bde5b136b0c352a864fadce08f02cab32938`; post-M00 push CI `37469308840` GREEN.
Critical findings: 0 unresolved.
Important findings: 0 unresolved.

## M01.2 RED→GREEN

RED: `a696c10466072fdefbbd0d897a9a4e752fae08bf`, CI `37482043713`. Formatting passed and Test failed for the intended missing behavior: missing core auth module, absent OAuth config parsing/validation, and unredacted OAuth state.

GREEN: `30ec5b4ac6d867b7cd50b7f2e2d7e7ad007386bc`, CI `37482919464`. Frozen install, format, full tests, lint, typecheck, and build all passed.

Implemented surface:

- provider-neutral OAuth mode/auth-state/identity/credential contracts;
- optional LinkedIn auth configuration that preserves M00 startup when auth is absent;
- explicit confidential and native-PKCE modes;
- `openid` scope requirement and native-PKCE HTTP loopback redirect enforcement;
- rejection of partial OAuth configuration;
- M01 OAuth state/verifier/code and token/encryption secret redaction while keeping non-secret client ID observable.

## M01 Architecture

- Official LinkedIn OAuth/OIDC only for identity.
- Default identity scopes: `openid profile email`.
- Standard confidential authorization-code mode and access-dependent native-PKCE mode are explicit rather than silently interchangeable.
- OAuth state is mandatory and single-use; native PKCE uses S256 and loopback-only callbacks.
- Credentials will be encrypted locally with AES-256-GCM using an externally supplied 32-byte key.
- Programmatic refresh-token support remains conditional on actual provider entitlement/token response.
- Local logout will clear local credentials without claiming remote revocation.
- `profile.me` remains `OFFICIAL_API` and must not be marked live-available from mocked CI alone.

## Plan Self-Review Ruling

The first M01 plan draft omitted the temporary loopback OAuth callback listener even though the spec requires it. Ruling: implement and test `apps/server/src/auth/callback-listener.ts` as part of M01.3 before credential persistence. The listener must bind loopback only, validate the configured callback path, reject invalid/replayed state through the session coordinator, and close on success, terminal failure, or timeout. Cost if wrong: OAuth could be unusable from stdio mode or expose an unsafe callback surface.

## Known Carryover

The M00 private package-boundary debt remains Minor and deferred. Interactive local container cloning is currently rate-limited, so exact-head GitHub Actions is the authoritative RED/GREEN execution environment for this run.

## Blockers

No M01 implementation blocker is currently proven. Live LinkedIn verification will eventually require a configured LinkedIn developer application/product access; native PKCE and programmatic refresh are access-dependent and will not be claimed without evidence.

Exact next work: execute the M01.3 OAuth session and loopback callback RED on PR #2.

# Project Status

Last reconciled: 2026-10-06. Actual Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M01 — Authentication & Identity — **ACTIVE**.

Active task: M01.1 activation/design/plan complete; next is M01.2 auth configuration and provider-neutral auth contracts RED.

Active branch: `feat/m01-auth-identity`.
Active PR: #2 — `Build M01 authentication and identity` (draft).
Verified base `main`: `dde9bde5b136b0c352a864fadce08f02cab32938`.
Post-M00 main CI: GREEN — push run `37469308840` passed on that exact SHA.
Current M01 branch CI: PENDING after activation reconciliation.
Critical findings: 0 unresolved.
Important findings: 0 unresolved.

## M01 Architecture

- Official LinkedIn OAuth/OIDC only for identity.
- Default identity scopes: `openid profile email`.
- Standard confidential authorization-code mode and access-dependent native-PKCE mode are explicit rather than silently interchangeable.
- OAuth state is mandatory and single-use; native PKCE uses S256 and loopback-only callbacks.
- Credentials will be encrypted locally with AES-256-GCM using an externally supplied 32-byte key.
- Programmatic refresh-token support remains conditional on actual provider entitlement/token response.
- Local logout will clear local credentials without claiming remote revocation.
- `profile.me` remains `OFFICIAL_API` and unavailable until legitimate configured access exists.

## Plan Self-Review Ruling

The first M01 plan draft omitted the temporary loopback OAuth callback listener even though the spec requires it. Ruling: implement and test `apps/server/src/auth/callback-listener.ts` as part of the OAuth-session work before credential persistence. The listener must bind loopback only, validate the configured callback path, reject invalid/replayed state through the session coordinator, and close on success, terminal failure, or timeout. Cost if wrong: OAuth could be unusable from stdio mode or expose an unsafe callback surface.

## Known Carryover

The M00 private package-boundary debt remains Minor and deferred. Interactive local container cloning is currently rate-limited, so exact-head GitHub Actions is the authoritative RED/GREEN execution environment for this run.

## Blockers

No M01 implementation blocker is currently proven. Live LinkedIn verification will eventually require a configured LinkedIn developer application/product access; native PKCE and programmatic refresh are access-dependent and will not be claimed without evidence.

Exact next work: execute the M01.2 auth configuration/contracts RED by adding failing tests on PR #2.

# M01 — Authentication & Identity

Status: **ACTIVE — M01.2 auth configuration/contracts verified**

## Goal

Implement LinkedIn OAuth identity, scope/capability inspection, encrypted credential persistence, auth health and logout/revocation semantics without overstating provider access.

## Dependencies

M00 complete and post-merge `main` CI green — VERIFIED at `dde9bde5b136b0c352a864fadce08f02cab32938`, push CI `37469308840`.

## In Scope

OAuth flow, profile/me, scopes, token lifecycle, secret-safe persistence, capability refresh.

## Out of Scope

Publishing, search, browser automation, organization posting.

## Acceptance Criteria

Authenticated identity works with minimal scopes; credentials are protected; expiry/revocation are explicit; capability state is truthful.

## Design / Plan

Design: `docs/superpowers/specs/2026-10-06-m01-auth-identity-design.md`.
Plan: `docs/superpowers/plans/2026-10-06-m01-auth-identity.md`.
Branch: `feat/m01-auth-identity`.
PR: #2 — `Build M01 authentication and identity` (draft).

## Tasks / Iterations

1. **COMPLETE** — M01.1 activation, current LinkedIn OAuth/OIDC investigation, design and implementation plan.
2. **COMPLETE** — M01.2 auth configuration + provider-neutral auth contracts.
3. **NEXT** — M01.3 OAuth authorization session, callback listener, CSRF state and PKCE URL construction.
4. **PLANNED** — M01.4 encrypted credential store.
5. **PLANNED** — M01.5 code exchange + token lifecycle/conditional refresh.
6. **PLANNED** — M01.6 official OIDC userinfo identity + `linkedin.profile.me`.
7. **PLANNED** — M01.7 MCP auth start/status/logout + dynamic capability projection.
8. **PLANNED** — M01.8 security/skeptical review, live-access assessment, exact-head CI and closeout.

## Rulings

- M01.1 Ruling: support both `confidential` and `native_pkce` OAuth modes because LinkedIn documents PKCE as an access-dependent native flow while ordinary 3-legged OAuth uses a client secret. `state` is mandatory in both; S256 PKCE is mandatory when `native_pkce` is selected. Cost if wrong: an app may require a different LinkedIn product configuration; capability truth must remain explicit rather than silently falling back.
- M01.1 Ruling: the first implementation-plan draft omitted the temporary loopback OAuth callback listener required by the spec. Fold `apps/server/src/auth/callback-listener.ts` and its lifecycle/security tests into M01.3 before credential persistence. Cost if wrong: OAuth could be unusable from stdio mode or expose an unsafe callback surface.
- M01.1 Ruling: mocked CI proves implementation behavior only. It does not make `profile.me` live-available/VERIFIED without a real configured LinkedIn application/member call. Cost if wrong: capability metadata could falsely imply provider access.

## TDD Evidence

### M01.2 auth configuration/contracts

RED: `a696c10466072fdefbbd0d897a9a4e752fae08bf`, CI `37482043713` — formatting passed; Test failed for the intended missing behavior: core auth module absent, auth configuration not parsed/validated, and OAuth state not redacted.

GREEN: `30ec5b4ac6d867b7cd50b7f2e2d7e7ad007386bc`, CI `37482919464` — frozen install, format, full tests, lint, typecheck, and build passed.

## Integration Test Evidence

Existing M00 real stdio/HTTP MCP transport smokes remained green in the M01.2 full suite.

## Security Review

M01.2 adds no token exchange or provider network call. Partial OAuth configuration fails closed; native-PKCE redirects are restricted to HTTP loopback addresses; `openid` is mandatory; OAuth state/verifier/code and token/encryption secret field names are redacted.

Required future focus: OAuth state/PKCE/CSRF, callback loopback/path safety, token encryption/redaction, minimal scopes, 401 lifecycle, refresh entitlement truth, and local logout vs remote revocation semantics.

## Code Review Findings

No Critical or Important finding is open from M01.2. Full milestone skeptical review remains required in M01.8.

## Fresh Verification Results

M00 dependency gate: post-merge main CI `37469308840` GREEN on `dde9bde5b136b0c352a864fadce08f02cab32938`.
M01.2 implementation: CI `37482919464` GREEN on `30ec5b4ac6d867b7cd50b7f2e2d7e7ad007386bc`.

## Durable Recovery Sources

Git/PR/CI > source/tests > `project-state.json` > `STATUS.md`/`CURRENT.md`/this ledger > M01 spec/plan > PRD/traceability/capability matrix.

## Completion Checklist

- [x] M00 post-merge dependency gate verified.
- [x] M01 design committed.
- [x] M01 implementation plan committed/self-reviewed.
- [x] M01.2 auth config/contracts RED→GREEN verified.
- [ ] Acceptance criteria verified.
- [ ] Critical/Important findings resolved at milestone closeout.
- [ ] Exact-final-head and post-merge CI green.

## Exact Next Work

Execute M01.3 OAuth session and loopback callback RED on PR #2.

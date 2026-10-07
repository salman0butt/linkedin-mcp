# M01 — Authentication & Identity

Status: **ACTIVE — M01.3 OAuth session/callback verified**

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
3. **COMPLETE** — M01.3 OAuth authorization session, loopback callback listener, CSRF state and PKCE primitives.
4. **NEXT** — M01.4 encrypted credential store.
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

### M01.3 OAuth session/callback

Primary RED: `b0a08d7a80114a630b8e77452b08548334a554cc`, CI `37584050659` — formatting passed; the OAuth session and callback listener suites failed because the production modules did not yet exist.

Initial GREEN: `8861b4a69de4186468b76da16a6c72ca78cbaabc`, CI `37584942934` — frozen install, format, full tests, lint, typecheck, and build passed.

Skeptical/security review found two Important gaps: expired pending sessions remained visible through `peek()`, and token-encryption keys were not constrained to canonical standard base64 for exactly 32 bytes. Review RED: `65e0e26c518707eec02895556edeefe165dece22`, CI `37585164683` — both regression tests failed as intended. Review GREEN: `9035cebcaba485429d77efd0c487de811296051e`, CI `37585523117` — the full quality pipeline passed.

## Integration Test Evidence

Existing real stdio and loopback Streamable HTTP MCP transport smokes remained green. M01.3 also exercises the callback listener through real loopback HTTP requests for success, wrong path, wrong state, provider denial, and timeout behavior.

## Security Review

M01.3 uses cryptographically random session IDs/state, constant-time equal-length state comparison, terminal wrong/missing-state consumption, single-use callback consumption, S256 PKCE for native mode, exact configured callback paths, and loopback-only HTTP listener binding. Provider error descriptions and state values are not echoed. Expired pending sessions are cleared during inspection as well as consumption. Token-encryption configuration requires canonical standard base64 representing exactly 32 bytes.

Full milestone security review remains required in M01.8 for encrypted storage, provider exchange/errors, 401 lifecycle, refresh entitlement truth, capability provenance, and logout semantics.

## Code Review Findings

Two Important M01.3 findings were identified and resolved through genuine RED→GREEN cycles: expired-session visibility and non-canonical/incorrect-length token-encryption keys. Zero Critical or Important findings remain open from M01.3.

## Fresh Verification Results

M00 dependency gate: post-merge main CI `37469308840` GREEN on `dde9bde5b136b0c352a864fadce08f02cab32938`.
M01.2 implementation: CI `37482919464` GREEN on `30ec5b4ac6d867b7cd50b7f2e2d7e7ad007386bc`.
M01.3 reviewed implementation: CI `37585523117` GREEN on `9035cebcaba485429d77efd0c487de811296051e`.

## Durable Recovery Sources

Git/PR/CI > source/tests > `project-state.json` > `STATUS.md`/`CURRENT.md`/this ledger > M01 spec/plan > PRD/traceability/capability matrix.

## Completion Checklist

- [x] M00 post-merge dependency gate verified.
- [x] M01 design committed.
- [x] M01 implementation plan committed/self-reviewed.
- [x] M01.2 auth config/contracts RED→GREEN verified.
- [x] M01.3 OAuth session/callback RED→GREEN and review regressions verified.
- [ ] Acceptance criteria verified.
- [ ] Critical/Important findings resolved at milestone closeout.
- [ ] Exact-final-head and post-merge CI green.

## Exact Next Work

Execute M01.4 encrypted credential store RED on PR #2.

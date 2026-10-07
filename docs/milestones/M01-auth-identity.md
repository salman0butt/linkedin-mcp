# M01 — Authentication & Identity

Status: **ACTIVE — M01.6 official OIDC identity verified**

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
4. **COMPLETE** — M01.4 encrypted credential store.
5. **COMPLETE** — M01.5 code exchange + token lifecycle/conditional refresh.
6. **COMPLETE** — M01.6 official OIDC userinfo identity client.
7. **NEXT** — M01.7 auth lifecycle service + MCP auth/profile tools + dynamic capability projection.
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

### M01.4 encrypted credential store

Primary RED: `6a5c7a12d2712761e25d4c5805b7c03f43c30199`, CI `37586614199` — formatting passed; the credential-store suite failed because the production module did not exist while all 62 existing tests passed.

Initial GREEN: `3b9b4b9f5dc5e85c7e3c8c955ca6045253562ca3`, CI `37587358269` — format, 70 tests, lint, typecheck, and build passed.

Skeptical/privacy review found one Important data-minimization gap: the store serialized structurally wider values wholesale, allowing unrelated profile fields to survive persistence. Review RED: `f4680c67211ec4c65a22105ddec93b8c21d09afa`, CI `37587657472` — formatting passed; 70 existing tests passed and the regression failed because `email` and `name` survived. Review GREEN: `9fcb2c8cf1e18df72217affe0f854fc798303e65`, CI `37588029054` — format, 71 tests, lint, typecheck, and build passed.

### M01.5 official LinkedIn OAuth adapter

Primary RED: `2b6646cd2fae558d729035b75659373e8fdbaba1`, CI `37592679866` — formatting passed; Test failed for the intended missing behavior because `apps/server/src/auth/linkedin-oauth.ts` did not exist while all 71 existing tests passed.

GREEN: `faedaf2f53b3b7f000bc702650421c2e348b057a`, CI `37593107489` — frozen install, format, full tests, lint, typecheck, and build passed. Confidential exchange sends the documented secret-bearing fields; native PKCE exchange sends the verifier without a client secret; refresh is disabled without an actual refresh token and for native PKCE; provider HTTP failures are classified without echoing provider/request secrets. The temporary pinned-Prettier diagnostic workflow was removed before this GREEN verification.

### M01.6 official OIDC userinfo identity

Primary RED: `d2b03afb3f57bd3141be9136afe244bace219292`, CI `37593529777` — formatting passed; Test failed for the intended missing behavior because `apps/server/src/auth/linkedin-identity.ts` did not exist while all 81 existing tests passed.

Initial production implementation at `b512c2edf4dc3af1fa96b64fb047506e0b9bd26e` made all 87 tests pass, then CI correctly exposed lint-only test-fixture typing. The first fixture correction at `aa134c83df9961757ebb849b7fda605fc8f1049b` made formatting/tests/lint green and exposed the stricter `exactOptionalPropertyTypes` fixture mismatch at typecheck. Those failures did not change or weaken production behavior assertions.

GREEN: `e9f138d4286dd99eab64bd1170132c4a69b57a1c`, CI `37612551536` — frozen install, format, all 87 tests, lint, typecheck, and build passed. The official userinfo request uses the access token only in the Authorization header; documented claims are mapped; optional email claims remain optional; missing/invalid `sub`, 401/403, 429, network failures, malformed success payloads, and provider failures are sanitized without provider-body/token leakage.

## Integration Test Evidence

Existing real stdio and loopback Streamable HTTP MCP transport smokes remain green. M01.3 exercises the callback listener through real loopback HTTP requests. M01.4 exercises real filesystem persistence using temporary directories, authenticated encryption, permission checks, atomic replacement failure, and tamper/wrong-key behavior. M01.5/M01.6 use injected fetch with deterministic provider responses so ordinary CI requires no LinkedIn secret or live account.

## Security Review

M01.3 uses cryptographically random session IDs/state, constant-time equal-length state comparison, terminal wrong/missing-state consumption, single-use callback consumption, S256 PKCE for native mode, exact configured callback paths, and loopback-only HTTP listener binding. Provider error descriptions and state values are not echoed. Expired pending sessions are cleared during inspection as well as consumption. Token-encryption configuration requires canonical standard base64 representing exactly 32 bytes.

M01.4 uses a versioned AES-256-GCM envelope, fresh 96-bit IVs, authenticated AAD/tags, canonical 32-byte key validation, owner-only temp-file permissions, and same-directory atomic replacement. Wrong keys and tampering fail closed without destroying the file; failed replacements preserve the prior valid credential and clean temporary residue. Save/load reconstruct only the credential allowlist, so unrelated profile fields are not persisted or returned.

M01.5/M01.6 keep OAuth/token and userinfo provider errors sanitized, keep authorization codes/client secrets/verifiers/access tokens out of error messages, and do not read/echo provider error bodies. M01.6 was checked against current official LinkedIn OIDC documentation: `userinfo` is `https://api.linkedin.com/v2/userinfo`; supported profile claims match the implementation; `email` and `email_verified` are optional. This deterministic implementation verification does not claim live LinkedIn account availability.

Full milestone security review remains required in M01.8 for 401 lifecycle transition, refresh entitlement truth, capability provenance, logout semantics, and integrated transport behavior.

## Code Review Findings

Two Important M01.3 findings were identified and resolved through genuine RED→GREEN cycles: expired-session visibility and non-canonical/incorrect-length token-encryption keys.

One Important M01.4 finding was identified and resolved through a genuine regression RED→GREEN cycle: credential over-persistence of unrelated profile fields.

No Critical or Important finding was identified in the M01.5 OAuth adapter or M01.6 identity client review. Zero Critical or Important findings remain open through M01.6.

## Fresh Verification Results

M00 dependency gate: post-merge main CI `37469308840` GREEN on `dde9bde5b136b0c352a864fadce08f02cab32938`.
M01.2 implementation: CI `37482919464` GREEN on `30ec5b4ac6d867b7cd50b7f2e2d7e7ad007386bc`.
M01.3 reviewed implementation: CI `37585523117` GREEN on `9035cebcaba485429d77efd0c487de811296051e`.
M01.4 reviewed implementation: CI `37588029054` GREEN on `9fcb2c8cf1e18df72217affe0f854fc798303e65`.
M01.5 implementation: CI `37593107489` GREEN on `faedaf2f53b3b7f000bc702650421c2e348b057a`.
M01.6 implementation: CI `37612551536` GREEN on `e9f138d4286dd99eab64bd1170132c4a69b57a1c`.

## Durable Recovery Sources

Git/PR/CI > source/tests > `project-state.json` > `STATUS.md`/`CURRENT.md`/this ledger > M01 spec/plan > PRD/traceability/capability matrix.

## Completion Checklist

- [x] M00 post-merge dependency gate verified.
- [x] M01 design committed.
- [x] M01 implementation plan committed/self-reviewed.
- [x] M01.2 auth config/contracts RED→GREEN verified.
- [x] M01.3 OAuth session/callback RED→GREEN and review regressions verified.
- [x] M01.4 encrypted credential store RED→GREEN and privacy regression verified.
- [x] M01.5 OAuth adapter RED→GREEN verified.
- [x] M01.6 OIDC identity RED→GREEN verified.
- [ ] M01.7 lifecycle/MCP integration verified.
- [ ] Acceptance criteria verified.
- [ ] Critical/Important findings resolved at milestone closeout.
- [ ] Exact-final-head and post-merge CI green.

## Exact Next Work

Execute the M01.7 auth lifecycle service RED on PR #2 as the first M01.7 integration subtask.

# Project Status

Last reconciled: 2026-10-07. Actual Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M01 — Authentication & Identity — **ACTIVE**.

Active task: M01.6 official OIDC userinfo identity complete; next is M01.7 auth lifecycle service and MCP integration.

Active branch: `feat/m01-auth-identity`.
Active PR: #2 — `Build M01 authentication and identity` (draft).
Latest verified M01 implementation SHA: `e9f138d4286dd99eab64bd1170132c4a69b57a1c`.
M01 implementation CI: GREEN — PR run `37612551536` passed frozen install, format, all 87 tests, lint, typecheck, and build on that exact SHA.
Verified base `main`: `dde9bde5b136b0c352a864fadce08f02cab32938`; post-M00 push CI `37469308840` GREEN.
Critical findings: 0 unresolved.
Important findings: 0 unresolved.

## M01.2 RED→GREEN

RED: `a696c10466072fdefbbd0d897a9a4e752fae08bf`, CI `37482043713`. Formatting passed and Test failed for the intended missing behavior: missing core auth module, absent OAuth config parsing/validation, and unredacted OAuth state.

GREEN: `30ec5b4ac6d867b7cd50b7f2e2d7e7ad007386bc`, CI `37482919464`. Frozen install, format, full tests, lint, typecheck, and build all passed.

## M01.3 RED→GREEN + Review Fixes

Primary RED: `b0a08d7a80114a630b8e77452b08548334a554cc`, CI `37584050659`. Formatting passed; the OAuth session/callback suites failed because the production modules did not yet exist.

Initial GREEN: `8861b4a69de4186468b76da16a6c72ca78cbaabc`, CI `37584942934`. Format, full tests, lint, typecheck, and build passed.

Skeptical/security review found two Important gaps: expired pending sessions remained visible through `peek()`, and token-encryption keys were not constrained to canonical standard base64 for exactly 32 bytes. Review RED: `65e0e26c518707eec02895556edeefe165dece22`, CI `37585164683`. Review GREEN: `9035cebcaba485429d77efd0c487de811296051e`, CI `37585523117`.

## M01.4 RED→GREEN + Privacy Review

Primary RED: `6a5c7a12d2712761e25d4c5805b7c03f43c30199`, CI `37586614199`. Formatting passed and Test failed because the encrypted credential-store production module did not yet exist; all 62 existing tests passed.

Initial GREEN: `3b9b4b9f5dc5e85c7e3c8c955ca6045253562ca3`, CI `37587358269`. Format, 70 tests, lint, typecheck, and build passed.

Skeptical/privacy review found one Important gap: the store serialized structurally wider values wholesale. Review RED: `f4680c67211ec4c65a22105ddec93b8c21d09afa`, CI `37587657472`. Review GREEN: `9fcb2c8cf1e18df72217affe0f854fc798303e65`, CI `37588029054`.

Implemented M01.4 surface includes versioned AES-256-GCM credential envelopes, fresh IVs, canonical 32-byte external keys, fail-closed wrong-key/tamper handling, restrictive same-directory atomic replacement, idempotent clear, and credential-field allowlisting.

## M01.5 RED→GREEN

Primary RED: `2b6646cd2fae558d729035b75659373e8fdbaba1`, CI `37592679866`. Formatting passed and Test failed for the intended missing OAuth-adapter module while all 71 existing tests passed.

GREEN: `faedaf2f53b3b7f000bc702650421c2e348b057a`, CI `37593107489`. Frozen install, format, full tests, lint, typecheck, and build passed. Confidential/native-PKCE exchange fields stay distinct, refresh remains conditional on actual confidential refresh-token support, and provider failures are sanitized.

## M01.6 RED→GREEN

Primary RED: `d2b03afb3f57bd3141be9136afe244bace219292`, CI `37593529777`. Formatting passed; Test failed for the intended missing `apps/server/src/auth/linkedin-identity.ts` module while all 81 existing tests passed.

The initial implementation at `b512c2edf4dc3af1fa96b64fb047506e0b9bd26e` made all 87 tests pass and exposed only a lint issue in the test recorder. `aa134c83df9961757ebb849b7fda605fc8f1049b` resolved lint while strict typecheck exposed an `exactOptionalPropertyTypes` fixture mismatch. Both were corrected without weakening production assertions.

GREEN: `e9f138d4286dd99eab64bd1170132c4a69b57a1c`, CI `37612551536`. Frozen install, format, all 87 tests, lint, typecheck, and build passed. The identity client calls official LinkedIn OIDC `userinfo`, uses the token only in the Authorization header, maps documented claims, keeps email claims optional, and sanitizes 401/403/429/network/malformed/provider failures without reading or echoing provider error bodies.

## M01 Architecture

- Official LinkedIn OAuth/OIDC only for identity.
- Default identity scopes: `openid profile email`.
- Standard confidential authorization-code mode and access-dependent native-PKCE mode remain explicit rather than silently interchangeable.
- OAuth state is mandatory/single-use; native PKCE uses S256 and loopback-only callbacks.
- Credentials are encrypted locally with AES-256-GCM using the externally supplied validated 32-byte key.
- Programmatic refresh-token support remains conditional on actual provider entitlement/token response.
- Local logout will clear local credentials without claiming remote revocation.
- `profile.me` is `OFFICIAL_API`; deterministic implementation is verified, but live capability availability must not be marked VERIFIED without real configured-account evidence.

## Known Carryover

The M00 private package-boundary debt remains Minor and deferred. GitHub Actions remains the authoritative execution environment for exact-head dependency/quality verification in this connector session.

## Blockers

No M01 implementation blocker is currently proven. Live LinkedIn availability verification requires a configured LinkedIn developer application/product access; native PKCE and programmatic refresh remain access-dependent and will not be claimed without evidence.

Exact next work: execute the M01.7 auth lifecycle service RED on PR #2 as the first M01.7 integration subtask.

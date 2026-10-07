# Project Status

Last reconciled: 2026-10-07. Actual Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M01 — Authentication & Identity — **ACTIVE**.

Active task: M01.3 OAuth session, CSRF state, PKCE, and temporary loopback callback listener complete; next is M01.4 encrypted credential storage.

Active branch: `feat/m01-auth-identity`.
Active PR: #2 — `Build M01 authentication and identity` (draft).
Latest verified M01 SHA: `9035cebcaba485429d77efd0c487de811296051e`.
M01 CI: GREEN — PR run `37585523117` passed frozen install, format, all tests, lint, typecheck, and build on that exact SHA.
Verified base `main`: `dde9bde5b136b0c352a864fadce08f02cab32938`; post-M00 push CI `37469308840` GREEN.
Critical findings: 0 unresolved.
Important findings: 0 unresolved.

## M01.2 RED→GREEN

RED: `a696c10466072fdefbbd0d897a9a4e752fae08bf`, CI `37482043713`. Formatting passed and Test failed for the intended missing behavior: missing core auth module, absent OAuth config parsing/validation, and unredacted OAuth state.

GREEN: `30ec5b4ac6d867b7cd50b7f2e2d7e7ad007386bc`, CI `37482919464`. Frozen install, format, full tests, lint, typecheck, and build all passed.

## M01.3 RED→GREEN + Review Fixes

Primary RED: `b0a08d7a80114a630b8e77452b08548334a554cc`, CI `37584050659`. Formatting passed; the two new OAuth session/callback suites failed because the production modules did not yet exist.

Initial GREEN: `8861b4a69de4186468b76da16a6c72ca78cbaabc`, CI `37584942934`. Format, full tests, lint, typecheck, and build passed.

Skeptical/security review then found two Important gaps: expired pending sessions remained visible through `peek()`, and token-encryption keys were not constrained to canonical standard base64 for exactly 32 bytes. Review RED: `65e0e26c518707eec02895556edeefe165dece22`, CI `37585164683`, with both regressions failing as intended. Review GREEN: `9035cebcaba485429d77efd0c487de811296051e`, CI `37585523117`, with the full quality pipeline green.

Implemented surface:

- one in-memory pending OAuth session with a five-minute default lifetime;
- cryptographically random session ID and mandatory single-use state;
- native-PKCE verifier/challenge generation using S256;
- confidential mode without PKCE material;
- constant-time equal-length state comparison and replay rejection;
- temporary HTTP callback listener bound only to `127.0.0.1` or `::1` and the configured callback path;
- terminal close on success, provider denial, invalid state, or timeout without echoing provider descriptions/secrets;
- expired sessions disappear from inspection as well as callback consumption;
- token-encryption configuration now requires canonical standard base64 representing exactly 32 bytes.

## M01 Architecture

- Official LinkedIn OAuth/OIDC only for identity.
- Default identity scopes: `openid profile email`.
- Standard confidential authorization-code mode and access-dependent native-PKCE mode are explicit rather than silently interchangeable.
- OAuth state is mandatory and single-use; native PKCE uses S256 and loopback-only callbacks.
- Credentials will be encrypted locally with AES-256-GCM using the externally supplied validated 32-byte key.
- Programmatic refresh-token support remains conditional on actual provider entitlement/token response.
- Local logout will clear local credentials without claiming remote revocation.
- `profile.me` remains `OFFICIAL_API` and must not be marked live-available from mocked CI alone.

## Known Carryover

The M00 private package-boundary debt remains Minor and deferred. Interactive local container cloning/package access is unreliable, so exact-head GitHub Actions remains the authoritative RED/GREEN execution environment.

## Blockers

No M01 implementation blocker is currently proven. Live LinkedIn verification will eventually require a configured LinkedIn developer application/product access; native PKCE and programmatic refresh are access-dependent and will not be claimed without evidence.

Exact next work: execute the M01.4 encrypted credential store RED on PR #2.

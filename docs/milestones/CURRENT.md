# Current Milestone

Milestone: M01 — Authentication & Identity
Status: ACTIVE — M01.2 auth configuration/contracts verified
Iteration: M01.2
Branch: `feat/m01-auth-identity`
PR: #2 — draft
Design: `docs/superpowers/specs/2026-10-06-m01-auth-identity-design.md`
Plan: `docs/superpowers/plans/2026-10-06-m01-auth-identity.md`
Ledger: `docs/milestones/M01-auth-identity.md`

## Recovery

M00 is merged at `dde9bde5b136b0c352a864fadce08f02cab32938`; post-merge `main` push CI `37469308840` is green on that exact SHA.

M01.2 RED was proven at `a696c10466072fdefbbd0d897a9a4e752fae08bf`, CI `37482043713`: formatting passed and tests failed for missing auth contracts/config/redaction. M01.2 GREEN is `30ec5b4ac6d867b7cd50b7f2e2d7e7ad007386bc`, CI `37482919464`, with frozen install, format, full tests, lint, typecheck, and build all green.

M01 continues to use official LinkedIn OAuth/OIDC identity only. Standard confidential OAuth, access-dependent native PKCE, and partner-gated programmatic refresh remain explicit capability boundaries. `profile.me` must not be marked live-available from mocked CI alone.

Plan self-review ruling: implement/test the temporary loopback OAuth callback listener during M01.3 before credential persistence.

Exact next work: execute M01.3 OAuth session and loopback callback RED on PR #2.

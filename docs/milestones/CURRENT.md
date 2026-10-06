# Current Milestone

Milestone: M01 — Authentication & Identity
Status: ACTIVE — M01.1 activation/design/plan complete
Iteration: M01.1
Branch: `feat/m01-auth-identity`
PR: #2 — draft
Design: `docs/superpowers/specs/2026-10-06-m01-auth-identity-design.md`
Plan: `docs/superpowers/plans/2026-10-06-m01-auth-identity.md`
Ledger: `docs/milestones/M01-auth-identity.md`

## Recovery

M00 is merged at `dde9bde5b136b0c352a864fadce08f02cab32938`. Post-merge `main` push CI run `37469308840` completed successfully on that exact SHA, satisfying the M00 post-merge gate.

M01 uses official LinkedIn OAuth/OIDC identity only. The committed design/plan preserve explicit access boundaries for standard confidential OAuth, access-dependent native PKCE, and partner-gated programmatic refresh tokens. `profile.me` must not be marked live-available from mocked CI alone.

Plan self-review ruling: the temporary loopback OAuth callback listener was omitted from the first plan draft; implement/test it during OAuth-session work before credential persistence.

Exact next work: execute M01.2 auth configuration/contracts RED on PR #2.

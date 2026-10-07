# Current Milestone

Milestone: M01 — Authentication & Identity
Status: ACTIVE — M01.3 OAuth session/callback verified
Iteration: M01.3
Branch: `feat/m01-auth-identity`
PR: #2 — draft
Design: `docs/superpowers/specs/2026-10-06-m01-auth-identity-design.md`
Plan: `docs/superpowers/plans/2026-10-06-m01-auth-identity.md`
Ledger: `docs/milestones/M01-auth-identity.md`

## Recovery

M00 is merged at `dde9bde5b136b0c352a864fadce08f02cab32938`; post-merge `main` push CI `37469308840` is green on that exact SHA.

M01.2 config/contracts are verified at `30ec5b4ac6d867b7cd50b7f2e2d7e7ad007386bc`, CI `37482919464`.

M01.3 primary RED was `b0a08d7a80114a630b8e77452b08548334a554cc`, CI `37584050659`, for the absent OAuth session/callback modules. Initial GREEN was `8861b4a69de4186468b76da16a6c72ca78cbaabc`, CI `37584942934`. Skeptical/security review found expired-session visibility and non-canonical encryption-key acceptance; review RED was `65e0e26c518707eec02895556edeefe165dece22`, CI `37585164683`, and review GREEN is `9035cebcaba485429d77efd0c487de811296051e`, CI `37585523117`.

M01 continues to use official LinkedIn OAuth/OIDC identity only. Standard confidential OAuth, access-dependent native PKCE, and partner-gated programmatic refresh remain explicit capability boundaries. `profile.me` must not be marked live-available from mocked CI alone.

Exact next work: execute M01.4 encrypted credential store RED on PR #2.

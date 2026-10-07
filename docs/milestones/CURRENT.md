# Current Milestone

Milestone: M01 — Authentication & Identity
Status: ACTIVE — M01.5 official OAuth adapter verified
Iteration: M01.6
Branch: `feat/m01-auth-identity`
PR: #2 — draft
Design: `docs/superpowers/specs/2026-10-06-m01-auth-identity-design.md`
Plan: `docs/superpowers/plans/2026-10-06-m01-auth-identity.md`
Ledger: `docs/milestones/M01-auth-identity.md`

## Recovery

M00 is merged at `dde9bde5b136b0c352a864fadce08f02cab32938`; post-merge `main` push CI `37469308840` is green on that exact SHA.

M01.2 config/contracts are verified at `30ec5b4ac6d867b7cd50b7f2e2d7e7ad007386bc`, CI `37482919464`.

M01.3 reviewed OAuth session/callback implementation is verified at `9035cebcaba485429d77efd0c487de811296051e`, CI `37585523117` after resolving expired-session visibility and encryption-key validation findings.

M01.4 primary credential-store RED was `6a5c7a12d2712761e25d4c5805b7c03f43c30199`, CI `37586614199`, for the absent encrypted-store module. Initial GREEN was `3b9b4b9f5dc5e85c7e3c8c955ca6045253562ca3`, CI `37587358269`. Privacy review found over-persistence of unrelated profile fields; review RED was `f4680c67211ec4c65a22105ddec93b8c21d09afa`, CI `37587657472`, and review GREEN is `9fcb2c8cf1e18df72217affe0f854fc798303e65`, CI `37588029054`.

M01.5 OAuth adapter RED was `2b6646cd2fae558d729035b75659373e8fdbaba1`, CI `37592679866`: formatting passed and Test failed because `apps/server/src/auth/linkedin-oauth.ts` did not exist while all 71 existing tests passed. GREEN is `faedaf2f53b3b7f000bc702650421c2e348b057a`, CI `37593107489`: frozen install, format, all tests, lint, typecheck, and build passed. The temporary format-diagnostic workflow used to obtain pinned Prettier output was removed before GREEN verification.

M01 continues to use official LinkedIn OAuth/OIDC identity only. Standard confidential OAuth, access-dependent native PKCE, and partner-gated programmatic refresh remain explicit capability boundaries. `profile.me` must not be marked live-available from mocked CI alone.

Exact next work: execute M01.6 official OIDC userinfo identity RED on PR #2.

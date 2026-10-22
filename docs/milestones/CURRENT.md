# Current Milestone

Milestone: M05 — Post Search
Status: ACTIVE — M05.1 canonical discovery contracts
Iteration: M05.1
Branch: `feat/m05-post-search`
PR: #8 — draft
Base/main: `800bf943cf047215bc434206dab1e5b6e2175c10`
Verified post-merge main CI: `39740297020` — 583/583 tests in 66 files, frozen install, formatting, lint, typecheck and build.
Design: `docs/superpowers/specs/2026-10-22-m05-post-discovery-design.md`
Plan: `docs/superpowers/plans/2026-10-22-m05-post-discovery.md`
Ledger: `docs/milestones/M05-post-search.md`

## Authority and restrictions

M04 is COMPLETE: PR #6 merged (squash) at `800bf943cf047215bc434206dab1e5b6e2175c10`; exact-post-merge main CI `39740297020` succeeded. M04 has zero verified unresolved Critical/Important findings. Live LinkedIn Community Management entitlements and a hosted approval UI remain unverified; default approval entrypoints fail closed.

M05 global keyword/hashtag search is **not** a normal documented official LinkedIn API feature. External discovery requires legitimate configured third-party/partner access. The documented official Posts API finder is narrowly author-scoped with restricted permissions. The default no-provider state must be explicitly `unavailable`, not fake empty success.

Exact next work: **Persist M05.1 canonical contracts to draft PR #8, verify exact-head CI and continue M05.2 deterministic filtering/dedupe.**

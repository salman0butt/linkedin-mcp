# Current Milestone

Milestone: M06 — Job Search
Status: ACTIVE — M06.1 job query, freshness and provenance contract
Iteration: M06.1
Branch: `feat/m06-job-search`
PR: pending — draft PR to be created on first durable milestone checkpoint
Base/main: `01fb37d3b762f2b1775c8845daba61c98054d6ed`
Verified post-merge main CI: `39920255603` on exact SHA `01fb37d3b762f2b1775c8845daba61c98054d6ed` — 647 tests across 71 files and all required quality gates.
Design: `docs/superpowers/specs/2026-10-23-m06-job-search-design.md`
Plan: `docs/superpowers/plans/2026-10-23-m06-job-search.md`
Ledger: `docs/milestones/M06-job-search.md`

## Authority and restrictions

M05 Post Search is COMPLETE: PR #8 squash-merged at `01fb37d3b762f2b1775c8845daba61c98054d6ed`; post-merge main CI `39920255603` passed. An independent M05.6 security/provenance review reported two Important issues, both RED→GREEN regression-fixed, then no additional confirmed Critical/Important issues. No live post-discovery provider or restricted official author resolver is configured.

M06 is scoped to structured job search, freshness evidence, truthful source identity and opt-in local saved data. Standard LinkedIn OAuth does not grant unrestricted Talent/Jobs search or an entitlement to sponsored job data. No real job provider is bundled. Missing provider access must return `unavailable`, not a fabricated zero-results claim.

Exact next work: **Implement M06.1 core job query, source normalization and posting-date evidence with real RED→GREEN tests, then open the single draft M06 PR and verify CI.**

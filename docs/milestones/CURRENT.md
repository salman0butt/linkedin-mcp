# Current Milestone

Milestone: M06 — Job Search
Status: REVIEW — M06.1–5 implemented; M06.6 follow-up fixes locally GREEN, exact-final-head CI pending
Iteration: M06.6
Branch: `feat/m06-job-search`
PR: #9 — draft
Base/main: `01fb37d3b762f2b1775c8845daba61c98054d6ed`
Verified post-merge main CI: `39920255603` on exact SHA `01fb37d3b762f2b1775c8845daba61c98054d6ed` — 647 tests across 71 files and all required quality gates.
Design: `docs/superpowers/specs/2026-10-23-m06-job-search-design.md`
Plan: `docs/superpowers/plans/2026-10-23-m06-job-search.md`
Ledger: `docs/milestones/M06-job-search.md`

## Authority and restrictions

M05 Post Search is COMPLETE: PR #8 squash-merged at `01fb37d3b762f2b1775c8845daba61c98054d6ed`; post-merge main CI `39920255603` passed. An independent M05.6 security/provenance review reported two Important issues, both RED→GREEN regression-fixed, then no additional confirmed Critical/Important issues. No live post-discovery provider or restricted official author resolver is configured.

M06 is scoped to structured job search, freshness evidence, truthful source identity and opt-in local saved data. Standard LinkedIn OAuth does not grant unrestricted Talent/Jobs search or an entitlement to sponsored job data. No real job provider is bundled. Missing provider access must return `unavailable`, not a fabricated zero-results claim.

Exact next work: **Obtain independent M06.6 re-review closure, push review fixes to PR #9, verify exact-final-head CI, then merge and verify main.** Previous PR head `954fc4a` CI `39942712314` GREEN. Additional Important regressions cover semantic/sparse provider-attested matches, getter-backed adapter metadata and unverified user-supplied saved snapshot provenance. Full local **713/713 tests across 77 files** plus real STDIO/HTTP, Prettier, lint and TypeScript GREEN. Saved-state is opt-in single-OS-user STDIO; HTTP remains unavailable. No live jobs provider or Talent entitlement is configured.

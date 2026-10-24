# Current Milestone

Milestone: M07 — Job Intelligence
Status: IMPLEMENTING — M07.1 strict contracts locally GREEN; M07.2 requirement extraction next
Iteration: M07.2
Branch: `feat/m07-job-intelligence`
PR: #10 — draft
Base/main: `0ff384ae5deb03b504259dc3f5519c8209c3e8f8`
Verified post-merge main CI: `40077809706` on exact SHA `0ff384ae5deb03b504259dc3f5519c8209c3e8f8` — 713/713 tests across 77 files and all required quality gates.
Design: `docs/superpowers/specs/2026-10-24-m07-job-intelligence-design.md`
Plan: `docs/superpowers/plans/2026-10-24-m07-job-intelligence.md`
Ledger: `docs/milestones/M07-job-intelligence.md`

## Authority and restrictions

M06 Job Search is COMPLETE: PR #9 squash-merged at `0ff384ae5deb03b504259dc3f5519c8209c3e8f8`, post-merge main CI `40077809706` passed. Independent M06.6 whole-branch review closed all verified Critical/Important findings. Both M05 and M06 preserve the lack of a configured external/partner discovery provider; no live LinkedIn Talent entitlement is claimed.

M07 builds only source-anchored job analysis from safe unverified caller snapshots. It must distinguish explicit evidence, missing information and inference for requirements, candidate fit, company data, relocation and visa sponsorship. No applicant eligibility, official API access, model-suggested employer facts or automatic submission is inferred. M07.1 strict input contracts are locally implemented; M07 extraction, fit, signals, comparison and MCP tools are not yet available.

Exact next work: **Checkpoint the independently reviewed 724-test RED→GREEN M07.1 parser on draft PR #10, verify its exact-head CI, then implement M07.2 sourced requirement extraction beginning with failing tests.**

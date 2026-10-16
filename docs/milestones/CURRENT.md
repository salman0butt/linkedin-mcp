# Current Milestone

Milestone: M04 — Comments & Engagement
Status: ACTIVE — M04.4 reaction add/remove flow
Iteration: M04.4
Branch: `feat/m04-comments-engagement`
PR: #6 — draft
Design: `docs/superpowers/specs/2026-10-11-m04-comments-engagement-design.md`
Plan: `docs/superpowers/plans/2026-10-11-m04-comments-engagement.md`
Ledger: `docs/milestones/M04-comments-engagement.md`

## Recovery

M03 is verified on current main `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0` after hotfix PR #7; post-hotfix CI `38153987423` passed 427/427 tests across 46 files plus frozen install, format, lint, typecheck and build.

M04.1 contracts/access policy GREEN: `2b80391f943907218a29fd39d4d6535cf0837e8f`, CI `38155192287` — 439/439 tests across 47 files plus all quality gates.

M04.2 Comments read adapter GREEN: `26ecce969e4d4935ddcd7babd93c6b46085a03b1`, CI `38160896542` — 450/450 tests across 49 files plus all quality gates. The adapter uses canonical target encoding, bounded paging, 64 KiB success-response limits, sanitized access/provider failures, unread HTTP error bodies, no BATCH_GET and no retries.

M04.3 nested reply flow GREEN: `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9`, CI `38902517595` — 483/483 tests across 53 files plus frozen install, format, lint, typecheck and build. Review fixes cover pre-approval target/parent integrity, terminal `outcome_unknown` persistence after malformed provider success, composite reply identity including legacy replay, and create responses that legitimately omit `likesSummary`. Scoped correctness/security review has 0 unresolved Critical/Important findings.

M04 provider access remains entitlement-sensitive: member writes use `w_member_social_feed`; member reads use restricted `r_member_social_feed`; Community Management is vetted and Development tier disallows BATCH_GET. Deterministic CI does not represent live entitlement as verified.

Exact next work: **Write M04.4 reaction add/remove behavioral RED tests for official POST/DELETE contracts, authenticated actor derivation, approval/idempotency, success/error taxonomy and uncertain transport, then verify intended RED.**

# Current Milestone

Milestone: M04 — Comments & Engagement
Status: ACTIVE — M04.5 explicit-thread unanswered inbox/context derivation
Iteration: M04.5
Branch: `feat/m04-comments-engagement`
PR: #6 — draft
Design: `docs/superpowers/specs/2026-10-11-m04-comments-engagement-design.md`
Plan: `docs/superpowers/plans/2026-10-11-m04-comments-engagement.md`
Ledger: `docs/milestones/M04-comments-engagement.md`

## Recovery

M03 is verified on current main `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`; post-hotfix CI `38153987423` passed 427/427 tests plus all quality gates.

M04.1 contracts/access policy GREEN: `2b80391f943907218a29fd39d4d6535cf0837e8f`, CI `38155192287` — 439/439 tests.

M04.2 Comments read adapter GREEN: `26ecce969e4d4935ddcd7babd93c6b46085a03b1`, CI `38160896542` — 450/450 tests.

M04.3 nested reply flow GREEN: `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9`, CI `38902517595` — 483/483 tests; scoped review 0 Critical/Important findings.

M04.4 reaction add/remove flow GREEN: `642359aa8caab4a2dd1c15ab22e64e07927e2688`, CI `39034345652` — 514/514 tests across 55 files plus frozen install, format, lint, typecheck and build. Initial adapter RED: `5f1c5e3adb683730ea85266e1f3b13db05aed9130` / CI `39030219764`. Service-only RED after adapter: `42119b100a951e1628f043682dbb4088b34e9e78` / CI `39034035608`, with 21 adapter tests green and exactly 10 missing-service-method failures. Two independent scoped reviews found 0 Critical and 0 Important findings.

M04 provider access remains entitlement-sensitive: member writes use `w_member_social_feed`; member reads use restricted `r_member_social_feed`; Community Management is vetted and Development tier disallows BATCH_GET. Deterministic CI does not represent live entitlement as verified.

Exact next work: **Write M04.5 explicit-thread unanswered-inbox behavioral RED tests covering answered/unanswered classification, authenticated-member replies, 1–20 explicit-root bounds, page/call ceilings, restricted-read propagation and deterministic ordering; verify intended RED.**

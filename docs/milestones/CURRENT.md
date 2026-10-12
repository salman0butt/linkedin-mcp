# Current Milestone

Milestone: M04 — Comments & Engagement
Status: ACTIVE — M04.3 approval/idempotency-gated nested reply flow
Iteration: M04.3
Branch: `feat/m04-comments-engagement`
PR: #6 — draft
Design: `docs/superpowers/specs/2026-10-11-m04-comments-engagement-design.md`
Plan: `docs/superpowers/plans/2026-10-11-m04-comments-engagement.md`
Ledger: `docs/milestones/M04-comments-engagement.md`

## Recovery

M03 is verified on current main `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0` after hotfix PR #7; post-hotfix CI `38153987423` passed 427/427 tests across 46 files plus frozen install, format, lint, typecheck and build.

M04.1 contracts/access policy GREEN: `2b80391f943907218a29fd39d4d6535cf0837e8f`, CI `38155192287` — 439/439 tests across 47 files plus all quality gates.

M04.2 Comments read adapter behavioral RED: `5b035386e10f2704964d6313984080c38ec51873`, CI `38160678343` — formatting passed, all 439 existing tests remained green and the two new suites failed only because the adapter module was absent.

M04.2 final GREEN: `26ecce969e4d4935ddcd7babd93c6b46085a03b1`, CI `38160896542` — 450/450 tests across 49 files plus frozen install, format, lint, typecheck and build passed. The adapter uses canonical target encoding, bounded paging, 64 KiB streamed success-response limits, sanitized access/provider failures, unread HTTP error bodies, no BATCH_GET and no retries. Scoped review has 0 unresolved Critical/Important findings.

M04.3 prerequisite lock regression resolved at `cbcc2c72124299a548f0caf5d7ba41a445c8288d`, exact-head CI `38312220154` — 474/474 tests across 52 files, frozen install, format, lint, typecheck and build green. Completion-only bounded `EEXIST` retry preserves reservation/media fail-closed behavior; no external mutation retries.

M04 provider access remains entitlement-sensitive: member writes use `w_member_social_feed`; member reads use restricted `r_member_social_feed`; Community Management is vetted and Development tier disallows BATCH_GET. Deterministic CI must not represent those live entitlements as verified.

M04.3 scoped review has **2 unresolved Important findings**: reply composite URN/ID inconsistency and nonterminal reservation after malformed provider success. The behavioral RED test write was blocked by connector safety checks. Do not mark M04.3 complete or merge until fixed and verified.

Exact next work: **Add RED regressions for both reply-identity/outcome-persistence findings and implement verified fixes.**

# Project Status

Last reconciled: 2026-10-12. Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M04 — Comments & Engagement — **ACTIVE, M04.3 approval/idempotency-gated nested reply flow**.

Active branch: `feat/m04-comments-engagement`. Draft PR #6 is the milestone integration boundary.
Base/main: `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`.
Design: `docs/superpowers/specs/2026-10-11-m04-comments-engagement-design.md`.
Plan: `docs/superpowers/plans/2026-10-11-m04-comments-engagement.md`.

## Latest Verified Checkpoint

M04.2 — bounded official Comments get/list adapter — **GREEN** at `26ecce969e4d4935ddcd7babd93c6b46085a03b1`.
CI `38160896542`: **450/450 tests across 49 files**, frozen install, format, lint, typecheck and build passed.
Behavioral RED was verified at `5b035386e10f2704964d6313984080c38ec51873`, CI `38160678343`: formatting passed, all 439 pre-existing tests stayed green, and only the two new Comments suites failed because `linkedin-comments` was absent.
The implementation uses versioned official GET requests, canonical encoded targets, bounded paging, a 64 KiB streamed success-body limit, sanitized 401/403/404/429/provider taxonomy, unread HTTP error bodies, no BATCH_GET and no automatic retries.
Scoped correctness/security review found 0 unresolved Critical findings and 0 unresolved Important findings.

M04.1 — canonical engagement contracts and access policy — **GREEN** at `2b80391f943907218a29fd39d4d6535cf0837e8f`, CI `38155192287`.
M04 keeps all remote engagement capabilities live-unverified until legitimate Community Management evidence exists.

## Latest Verified Mainline

M03 — Media Publishing — merged through PR #4, with the discovered cross-runtime final-media ownership defect repaired through hotfix PR #7.
Current verified main: `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`.
Post-hotfix main CI `38153987423`: **427/427 tests across 46 files**, frozen install, format, lint, typecheck and build passed.
No live LinkedIn media access is claimed.

## M04 Provider Reality

Current LinkedIn Community Management documentation exposes comments and reactions through versioned official APIs. Member writes require `w_member_social_feed`; member reads require restricted `r_member_social_feed`. Community Management is vetted and Development tier disallows BATCH_GET. M04 therefore defaults member engagement reads OFF, never equates 403/restricted access with an empty result, and never claims live Community Management availability from deterministic CI.

## Findings / Blockers

Unresolved Critical findings: 0.
Unresolved Important findings: 0.
Active branch HEAD `733e37cb549b75701953c21f5a51d5fa4bd0569b` failed CI run `38162905039` (471 passed, 1 failed): transient `EEXIST` contention in idempotency completion-lock handoff. Local completion-only bounded retry and regression tests passed 474/474 tests plus format/lint/typecheck/build under Node 24.11.1/pnpm 12.9.1, but source persistence was rejected by GitHub connector safety checks. The branch therefore remains red; do not merge. Legitimate Community Management product/scope access remains an external live-verification gate.

## Handoff

Exact next work: **Persist the locally verified completion-only bounded `EEXIST` retry and three regression tests through an authorized GitHub write on the existing branch, obtain exact-head green CI, then resume M04.3.**

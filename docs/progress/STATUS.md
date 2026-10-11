# Project Status

Last reconciled: 2026-10-11. Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M04 — Comments & Engagement — **ACTIVE, M04.2 bounded official Comments read adapter**.

Active branch: `feat/m04-comments-engagement`. Draft PR #6 is the milestone integration boundary.
Base/main: `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`.
Design: `docs/superpowers/specs/2026-10-11-m04-comments-engagement-design.md`.
Plan: `docs/superpowers/plans/2026-10-11-m04-comments-engagement.md`.

## Latest Verified Checkpoint

M04.1 — canonical engagement contracts and access policy — **GREEN** at `2b80391f943907218a29fd39d4d6535cf0837e8f`.
CI `38155192287`: **439/439 tests across 47 files**, frozen install, format, lint, typecheck and build passed.
Behavioral RED was verified at `b1c746ff87dba531d091c3172e4888d2be7f7ba4`, CI `38154909898`: formatting passed; failures were limited to the absent engagement contracts, trusted read gate and M04 capability metadata.
M04.1 keeps all remote engagement capabilities `UNAVAILABLE` until legitimate live Community Management evidence exists.

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
No repository blocker is active. Legitimate Community Management product/scope access is an external live-verification gate, not a blocker for deterministic implementation.

## Handoff

Exact next work: **Establish M04.2 behavioral RED for the bounded official Comments get/list adapter, then implement the minimum versioned read client without BATCH_GET or retries.**

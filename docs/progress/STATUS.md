# Project Status

Last reconciled: 2026-10-17. Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M04 — Comments & Engagement — **ACTIVE, M04.5 explicit-thread unanswered
inbox/context derivation**.

Active branch: `feat/m04-comments-engagement`. Draft PR #6 remains the milestone
integration boundary.
Base/main: `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`.
Design: `docs/superpowers/specs/2026-10-11-m04-comments-engagement-design.md`.
Plan: `docs/superpowers/plans/2026-10-11-m04-comments-engagement.md`.

## Latest Verified Checkpoint

M04.4 — approval/idempotency-gated reaction add/remove flow — **GREEN** at
`642359aa8caab4a2dd1c15ab22e64e07927e2688`.
CI `39034345652`: **514/514 tests across 55 files**, frozen install, format,
lint, typecheck and build passed.

M04.4 genuine TDD evidence:

- adapter RED at `5f1c5e3adb683730ea85266e1f3b13db05aed9130`, CI `39030219764`:
  483 existing tests passed and both new reaction suites failed because the
  adapter was absent;
- service RED at `42119b100a951e1628f043682dbb4088b34e9e78`, CI `39034035608`:
  all 21 adapter tests passed and exactly 10 reaction-service tests failed
  because the six service methods were absent;
- GREEN at `642359aa8caab4a2dd1c15ab22e64e07927e2688`, CI `39034345652`:
  514/514 tests plus all quality gates.

Two independent scoped correctness/security reviews reported **0 Critical
findings and 0 Important findings**. One reviewer recorded only two
nonblocking Minor observations: stale Task 4 checkboxes and incomplete
positive coverage of every allowed reaction enum value.

M04.4 derives actor identity only from the authenticated subject, requires
`w_member_social_feed`, binds preview/approval/idempotency to canonical
operation/actor/payload, reserves before provider mutation, validates durable
replay, bounds successful response bodies, sanitizes provider/transport
failures, and never automatically retries uncertain POST/DELETE outcomes.

M04.3 nested reply flow: GREEN at
`4c9a5bd418b33d588d0b61b09ce3003532e8dcf9`, CI `38902517595`
(483/483 tests).
M04.2 bounded official Comments read adapter: GREEN at
`26ecce969e4d4935ddcd7babd93c6b46085a03b1`, CI `38160896542`
(450/450 tests).
M04.1 canonical engagement contracts/access policy: GREEN at
`2b80391f943907218a29fd39d4d6535cf0837e8f`, CI `38155192287`
(439/439 tests).

## Latest Verified Mainline

M03 — Media Publishing — merged through PR #4, with the cross-runtime
final-media ownership repair through hotfix PR #7.
Current verified main: `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`.
Post-hotfix main CI `38153987423`: **427/427 tests across 46 files**, frozen
install, format, lint, typecheck and build passed.

## M04 Provider Reality

LinkedIn Community Management comments/reactions use versioned official APIs.
Member writes require `w_member_social_feed`; member reads require restricted
`r_member_social_feed`. Community Management is vetted and Development tier
disallows BATCH_GET. Deterministic repository verification does **not** prove
live product/scope entitlement. No live Community Management read or write is
claimed.

## Findings / Blockers

Unresolved Critical findings: 0 for completed M04.1–M04.4 scoped work.
Unresolved Important findings: 0 for completed M04.1–M04.4 scoped work.
Live Community Management entitlement remains an external verification gate;
it is not represented as verified capability availability.

## Handoff

Exact next work: **Write M04.5 explicit-thread unanswered-inbox behavioral RED
tests for answered/unanswered classification, authenticated-member reply
detection, 1–20 explicit-root bounds, page/call ceilings, restricted-read
propagation and deterministic ordering; verify intended RED.**

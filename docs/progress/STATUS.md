# Project Status

Last reconciled: 2026-10-18. Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M04 — Comments & Engagement — **ACTIVE, M04.7 whole-milestone review and closeout**.

Active branch: `feat/m04-comments-engagement`. Draft PR #6 remains the milestone integration boundary.
Base/main: `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`.
Design: `docs/superpowers/specs/2026-10-11-m04-comments-engagement-design.md`.
Plan: `docs/superpowers/plans/2026-10-11-m04-comments-engagement.md`.

## M04.6 Strict MCP/Transport Integration — GREEN

Behavioral RED: `656d1b819358ffa9feaa403646d35d4365a4e2c6`, CI `39038187921`: 524 existing tests passed, nine engagement MCP contract tests failed because the twelve engagement tools were not registered.

Latest exact-head GREEN: `79bd4bf19d06e3cc41ccc9c6fd15c00b6d173148`, CI `39058125153`: **539/539 tests across 59 files**, frozen install, format, lint, typecheck and build passed. The twelve strict engagement tools are registered in the shared runtime, and real stdio/loopback HTTP transport smoke suites pass with 28 tools. Restricted reads preserve disabled/permission-required states, and provider read rate-limit errors remain explicit and sanitized. Live Community Management entitlement is still unverified.

M04.7 whole-milestone skeptical/security/provenance review, documentation reconciliation, exact-final-head CI and merge/post-merge verification remain pending.

## M04.7 Active Important Finding — Comments Read Identity Integrity

The Comments read adapter accepts a successful `getComment` response with a returned numeric id that differs from the requested id. The shared read parser also accepts a composite `commentUrn` whose numeric id differs from the response `id`, including inside paginated lists. This is **1 unresolved Important finding**, blocking PR #6 merge. Three focused regression cases were prepared but are **not committed and RED has not been verified**: self-consistent wrong get ID, mismatched composite ID, and malformed identity in a list.

On 2026-10-18, GitHub's connected source-file `update_file` was rejected by OpenAI safety checks. The source remains unchanged; do not bypass that control. The latest observed GREEN source/doc baseline before the present reconciliation is `ab69eeef955bca8c00521b0bbd0ace6b28adfeb3`, CI `39112967968`: 539/539 tests across 59 files plus frozen install, format, lint, typecheck and build. Passing existing tests does not resolve this Important finding. Live Community Management entitlement remains unverified.

## M04.5 Historical Verified Checkpoint

M04.5 — explicit-thread unanswered inbox/context derivation — **GREEN** at `788a252f6ec9e285df0420869af6e39ca728975b`.
CI `39037380577`: **524/524 tests across 57 files**, frozen install, format, lint, typecheck and build passed.

M04.5 genuine TDD evidence:

- clean behavioral RED at `8d9f74ce00b55de1c9b5bfd2808ff541c6e15528`, CI `39037076502`: 517 executable tests passed and only `comment-inbox.test.ts` failed because `comment-inbox.ts` was absent;
- GREEN at `788a252f6ec9e285df0420869af6e39ca728975b`, CI `39037380577`: 524/524 tests across 57 files plus all quality gates.

The inbox accepts only 1–20 explicit share/ugcPost/activity roots, uses bounded 100-item pages with at most three pages per target and a global provider-call ceiling, propagates disabled/permission-required states without fabricating emptiness, treats only a direct authenticated-member child as an answer, and returns deterministic chronological ordering. Scoped correctness/security review found **0 unresolved Critical findings and 0 unresolved Important findings**.

## M04.4 Reaction Checkpoint and Security Follow-up

M04.4 reaction add/remove behavior first reached GREEN at `642359aa8caab4a2dd1c15ab22e64e07927e2688`, CI `39034345652`: **514/514 tests across 55 files** plus all quality gates.

A later fresh security review found one Important shared approval-boundary defect: approval receipts were bound to authenticated subject and payload hash but not to mutation purpose, allowing a deliberately reused hash to cross named approval flows. The regression was reproduced before the fix. The shared approval service now namespaces its internal hash by stable purpose while preserving the public receipt shape; text posts, media posts, comments.reply, reactions.add and reactions.remove are isolated. Focused cross-purpose engagement regressions pass, provider mutation count remains zero on rejected cross-purpose receipts, and the fix is included in exact-head GREEN `788a252f6ec9e285df0420869af6e39ca728975b` / CI `39037380577`.

M04.4 TDD checkpoints before the follow-up:

- adapter RED `5f1c5e3adb683730ea85266e1f3b13db05aed9130`, CI `39030219764`;
- service RED `42119b100a951e1628f043682dbb4088b34e9e78`, CI `39034035608`;
- reaction GREEN `642359aa8caab4a2dd1c15ab22e64e07927e2688`, CI `39034345652`.

M04.3 nested reply flow: GREEN `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9`, CI `38902517595` (483/483 tests).
M04.2 bounded official Comments read adapter: GREEN `26ecce969e4d4935ddcd7babd93c6b46085a03b1`, CI `38160896542` (450/450 tests).
M04.1 canonical engagement contracts/access policy: GREEN `2b80391f943907218a29fd39d4d6535cf0837e8f`, CI `38155192287` (439/439 tests).

## Latest Verified Mainline

M03 — Media Publishing — merged through PR #4, with the cross-runtime final-media ownership repair through hotfix PR #7.
Current verified main: `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`.
Post-hotfix main CI `38153987423`: **427/427 tests across 46 files**, frozen install, format, lint, typecheck and build passed.

## M04 Provider Reality

LinkedIn Community Management comments/reactions use versioned official APIs. Member writes require `w_member_social_feed`; member reads require restricted `r_member_social_feed`. Community Management is vetted and Development tier disallows BATCH_GET. Deterministic repository verification does **not** prove live product/scope entitlement. No live Community Management read or write is claimed.

## Findings / Blockers

Unresolved Critical findings: 0 currently identified.
Unresolved Important findings: 1 in M04.7 (Comments read identity integrity); earlier M04.1–M04.5 scoped findings remain resolved.
Live Community Management entitlement remains an external verification gate; it is not represented as verified capability availability.

## Handoff

Exact next work: **Persist three Comments read identity-integrity regression tests on the existing M04 branch through an authorized write path and verify behavioral RED.**

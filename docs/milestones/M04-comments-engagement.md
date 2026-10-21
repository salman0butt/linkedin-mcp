# M04 — Comments & Engagement

Status: **ACTIVE — M04.7 whole-milestone review and closeout**

## Goal

Support capability-aware member comment reading/replies, reactions and bounded contextual engagement workflows.

## Dependencies

M03 merged and post-merge verified, including cross-runtime final-media ownership hotfix PR #7. Current verified main is `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`, CI `38153987423`.

## In Scope

Comment get/list/reply when permitted, reaction add/remove, bounded unanswered inbox over explicit thread roots, reply context, strict MCP/transport integration and truthful provider/access provenance.

## Out of Scope

Organization engagement, broad feed discovery, BATCH_GET, comment edit/delete/images/mentions, browser fallback and bulk engagement/outreach.

## Acceptance Criteria

- Restricted member reads default disabled and require `r_member_social_feed` plus explicit trusted local opt-in.
- Read permission/access failures remain explicit and never masquerade as empty results.
- Member replies/reactions derive actor from authenticated subject and require `w_member_social_feed`.
- Consequential writes use preview/approval/durable idempotency and fail closed on uncertain outcomes/replay.
- Provider bodies, paging and inbox traversal are bounded.
- Unanswered inbox accepts only 1–20 explicit thread roots; no broad feed discovery.
- Strict MCP schemas expose no token, actor override, provider URL, read-gate or admin controls.
- Deterministic CI does not claim Community Management product/scope entitlement.

## Tasks / Iterations

1. **GREEN** — M04.1 canonical contracts, capability/access policy and trusted read configuration.
2. **GREEN** — M04.2 official bounded Comments read adapter.
3. **GREEN** — M04.3 approval/idempotency-gated nested reply flow.
4. **GREEN** — M04.4 reaction add/remove flow, including post-checkpoint approval-purpose isolation repair.
5. **GREEN** — M04.5 explicit-thread unanswered inbox/context derivation.
6. **GREEN** — M04.6 strict MCP/stdio/HTTP integration.
7. **ACTIVE** — M04.7 whole-milestone review, exact-head CI, merge and post-merge verification.

## TDD Evidence

M04.1 behavioral RED: `b1c746ff87dba531d091c3172e4888d2be7f7ba4`, CI `38154909898`. GREEN: `2b80391f943907218a29fd39d4d6535cf0837e8f`, CI `38155192287` — 439/439 tests.

M04.2 behavioral RED: `5b035386e10f2704964d6313984080c38ec51873`, CI `38160678343`. GREEN: `26ecce969e4d4935ddcd7babd93c6b46085a03b1`, CI `38160896542` — 450/450 tests.

M04.3 nested reply flow GREEN: `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9`, CI `38902517595` — 483/483 tests across 53 files plus all quality gates after the recorded RED cycles for completion-lock recovery, target/parent integrity, malformed provider success, composite identity/legacy replay and create-response optionality.

M04.4 adapter RED: `5f1c5e3adb683730ea85266e1f3b13db05aed9130`, CI `39030219764`. Service RED: `42119b100a951e1628f043682dbb4088b34e9e78`, CI `39034035608`. Reaction behavior GREEN: `642359aa8caab4a2dd1c15ab22e64e07927e2688`, CI `39034345652` — 514/514 tests across 55 files plus all quality gates.

A later fresh security review found one Important shared approval-purpose isolation defect. A cross-purpose receipt was reproduced as accepted before the fix. The approval layer now namespaces internal hashes by stable purpose while preserving public receipt hashes; text, media, reply, reaction-add and reaction-remove approval flows are isolated. Focused cross-purpose regressions pass with zero provider mutation on rejected receipts. The repair is included in exact-head GREEN `788a252f6ec9e285df0420869af6e39ca728975b`, CI `39037380577`.

M04.5 clean behavioral RED: `8d9f74ce00b55de1c9b5bfd2808ff541c6e15528`, CI `39037076502` — 517 executable tests passed and only `comment-inbox.test.ts` failed because `comment-inbox.ts` was absent. GREEN: `788a252f6ec9e285df0420869af6e39ca728975b`, CI `39037380577` — **524/524 tests across 57 files** plus frozen install, format, lint, typecheck and build.

M04.6 behavioral RED: `656d1b819358ffa9feaa403646d35d4365a4e2c6`, CI `39038187921` — 524 existing tests passed, nine new engagement MCP contract failures due to missing tool registrations. Final implementation GREEN: `79bd4bf19d06e3cc41ccc9c6fd15c00b6d173148`, CI `39058125153` — **539/539 tests across 59 files**, frozen install, format, lint, typecheck and build.

M04.7 read identity-integrity finding RED: `d906d730617e8931945478d187bc784c200a622a`, CI `39392445179` — three intended failures detecting requested-ID and composite comment URN mismatches. GREEN: `92a8ca816ca4c300c624360acde0afd6599512bf`, CI `39392843550` — 542/542 tests across 60 files and all quality gates. The scoped Important finding was regression-fixed. Whole-milestone skeptical review, durable traceability and final merge gates remain pending.

M04.7 further response-integrity RED: six locally executed tests on previous source `dd8f1b802d4cc3104b4969049838252fcdb31adf` failed by accepting unrelated same-family activity roots or incorrect response paging windows/counts. GREEN: `e33ba384df4ae0a5492f20d85e98458e91142011`, CI `39575410269` — **555/555 tests across 62 files** plus all quality gates and real transport smoke tests. Legitimate cross-family LinkedIn URN representations remain accepted; a nested-thread test fixture was corrected to refer to the requested parent.

## Integration Test Evidence

M04.1–M04.5 use deterministic injected-provider/local derivation tests; no live LinkedIn Community Management request has been performed. M04.6 registers all twelve engagement MCP tools with strict schemas and authenticated runtime wiring. Real stdio/HTTP smoke suites verify 28 tools. Read disabled/permission-required states and sanitized Comments rate-limit taxonomy are exercised. No live LinkedIn Community Management request has been performed.

## Security Review

Primary boundaries: restricted read entitlements, subject-derived actor identity, no bulk engagement, no mutation retry after uncertain remote outcome, bounded provider responses/paging, cross-runtime idempotency, approval-purpose isolation and explicit capability provenance.

M04.1 enforces actor-free canonical reply/reaction payload identity, excludes deprecated `MAYBE`, rejects unsupported caller fields, defaults engagement reads OFF and keeps live capabilities unavailable.

M04.2 validates canonical targets before URL construction, fully encodes explicit targets, restricts request paging to 1–100 items, stream-bounds successful provider JSON to 256 KiB before parsing (allowing substantive 100-comment pages), sanitizes failures, performs no BATCH_GET and never retries reads.

M04.3 derives reply actor exclusively from authenticated subject, binds approval/idempotency, rejects target/parent mismatches before approval, validates returned and replayed composite identity, terminally records malformed provider success as `outcome_unknown`, never retries uncertain POSTs and permits documented create success without `likesSummary` while reads remain strict.

M04.4 reactions derive actor only from authenticated subject, require `w_member_social_feed`, validate provider reaction identity/root/type, reserve before mutation, durably classify replay/uncertainty and never retry uncertain POST/DELETE. Shared approval receipts are now isolated by mutation purpose.

M04.5 is LOCAL_ONLY derivation over explicit roots. It accepts only 1–20 share/ugcPost/activity roots, bounds page size/pages/global provider calls, propagates disabled/permission-required states, treats only direct authenticated-member child replies as answers and performs no feed discovery.

## Code Review Findings

M04.1–M04.3 scoped reviews have 0 unresolved Critical findings and 0 unresolved Important findings.

M04.4 reaction behavior initially reached GREEN before a later fresh security review found one Important approval-purpose isolation gap. That finding is regression-fixed and verified in exact-head GREEN `788a252f6ec9e285df0420869af6e39ca728975b` / CI `39037380577`. M04.4 currently has 0 unresolved Critical findings and 0 unresolved Important findings.

M04.5 scoped correctness/security review after exact-head GREEN found 0 Critical findings and 0 Important findings.

Full M04 whole-branch correctness/security/provenance review remains required in M04.7.

## Fresh Verification Results

Verified main after M03 hotfix: `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`, CI `38153987423`: 427/427 tests across 46 files plus all quality gates.

M04.1 exact head: `2b80391f943907218a29fd39d4d6535cf0837e8f`, CI `38155192287`: 439/439 tests.

M04.2 exact head: `26ecce969e4d4935ddcd7babd93c6b46085a03b1`, CI `38160896542`: 450/450 tests.

M04.3 exact source head: `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9`, CI `38902517595`: 483/483 tests across 53 files plus all quality gates.

Latest verified source head: `e33ba384df4ae0a5492f20d85e98458e91142011`, CI `39575410269`: 555/555 tests across 62 files plus frozen install, format, lint, typecheck and build.

## Durable Recovery Sources

`AGENTS.md`, `CODEX-START-HERE.md`, `docs/AUTONOMOUS-DEVELOPMENT.md`, project state/status/known issues, this ledger, PRD/traceability/capability matrix, M04 spec/plan, PR #6 and exact-SHA CI.

## Completion Checklist

- [ ] Overall M04 acceptance verified.
- [ ] Overall M04 Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

Exact next work: **Perform M04.7 whole-branch skeptical correctness/security/provenance review, then regression-fix any Critical/Important findings before final merge gates.**

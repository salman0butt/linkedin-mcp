# M04 — Comments & Engagement

Status: **ACTIVE — M04.4 reaction add/remove flow**

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
4. **ACTIVE** — M04.4 reaction add/remove flow.
5. **PLANNED** — M04.5 explicit-thread unanswered inbox/context derivation.
6. **PLANNED** — M04.6 strict MCP/stdio/HTTP integration.
7. **PLANNED** — M04.7 whole-milestone review, exact-head CI, merge and post-merge verification.

## TDD Evidence

M04.1 behavioral RED: `b1c746ff87dba531d091c3172e4888d2be7f7ba4`, CI `38154909898`. Formatting passed; failures were exactly the absent engagement module, missing trusted engagement read config and incomplete M04 capability registry.

M04.1 GREEN: `2b80391f943907218a29fd39d4d6535cf0837e8f`, CI `38155192287`. 439/439 tests across 47 files plus frozen install, format, lint, typecheck and build passed.

M04.2 behavioral RED: `5b035386e10f2704964d6313984080c38ec51873`, CI `38160678343`. Formatting passed, all 439 existing tests stayed green and the two new Comments suites failed only because `apps/server/src/engagement/linkedin-comments.ts` was absent.

M04.2 final GREEN: `26ecce969e4d4935ddcd7babd93c6b46085a03b1`, CI `38160896542`. 450/450 tests across 49 files plus frozen install, format, lint, typecheck and build passed.

M04.3 prerequisite completion-lock recovery: original RED `733e37cb549b75701953c21f5a51d5fa4bd0569b`, CI `38162905039`; GREEN `cbcc2c72124299a548f0caf5d7ba41a445c8288d`, CI `38312220154` — 474/474 tests across 52 files plus all quality gates.

M04.3 target/parent approval integrity RED: `d716140fa42d5e4c294146936e4d9616be161a8b`; fixed at `386dbf96235fadf88ea16a9411cd3a24dfc3a38b`.

M04.3 malformed provider-success terminal outcome RED: `3adcee4d80fcfdad44f8374b0f97af28c590f215`, CI `38901369613` — 475 pass / 1 intended fail; GREEN `9699773fb323ab027ebdc2837c5e5a8a591e0c9b`, CI `38901575437`.

M04.3 composite identity, legacy replay and create-response optionality RED: `5dce3ac361f87abadd61c91283e8ebcc41b702d4`, CI `38902334994` — 477 pass / exactly 6 intended failures; GREEN `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9`, CI `38902517595` — **483/483 tests across 53 files** plus frozen install, format, lint, typecheck and build.

## Integration Test Evidence

M04.1–M04.3 use deterministic injected-provider tests; no live LinkedIn Community Management request has been performed. Existing real stdio/HTTP MCP smoke suites remain green.

## Security Review

Primary boundaries: restricted read entitlements, subject-derived actor identity, no bulk engagement, no mutation retry after uncertain remote outcome, bounded provider responses/paging, cross-runtime idempotency and explicit capability provenance.

M04.1 enforces actor-free canonical reply/reaction payload identity, excludes deprecated `MAYBE`, rejects unsupported caller fields, defaults engagement reads OFF and keeps live capabilities unavailable.

M04.2 validates canonical targets before URL construction, fully encodes explicit targets, restricts request paging to 1–100 items, stream-bounds successful provider JSON to 64 KiB before parsing, validates normalized comment/paging fields, never reads HTTP error bodies, sanitizes transport/provider failures, performs no BATCH_GET and never retries reads.

M04.3 derives the reply actor exclusively from authenticated subject; binds approval/idempotency to canonical payload; rejects target/parent mismatches before approval; validates returned actor/object/parent/text plus composite comment identity; validates legacy persisted replay identity; terminally records malformed provider success as `outcome_unknown`; never retries uncertain POSTs; and permits a documented create response to omit `likesSummary` without fabricating a zero while read parsing remains strict.

## Code Review Findings

M04.1–M04.3 scoped reviews have **0 unresolved Critical findings and 0 unresolved Important findings**. Four M04.3 Important findings were regression-fixed before closeout: pre-approval target/parent mismatch, inconsistent composite reply identity including legacy replay, nonterminal reservation after malformed provider success, and rejection of valid create responses without `likesSummary`. A separately dispatched independent review could not be retrieved after the local tunnel disconnected and is not represented as completed. Full whole-milestone review remains pending M04.7.

## Fresh Verification Results

Verified main after M03 hotfix: `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`, CI `38153987423`: 427/427 tests across 46 files plus all quality gates.

M04.1 exact head: `2b80391f943907218a29fd39d4d6535cf0837e8f`, CI `38155192287`: 439/439 tests across 47 files plus all quality gates.

M04.2 exact head: `26ecce969e4d4935ddcd7babd93c6b46085a03b1`, CI `38160896542`: 450/450 tests across 49 files plus all quality gates.

M04.3 exact source head: `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9`, CI `38902517595`: 483/483 tests across 53 files plus all quality gates.

## Durable Recovery Sources

`AGENTS.md`, `CODEX-START-HERE.md`, `docs/AUTONOMOUS-DEVELOPMENT.md`, project state/status/known issues, this ledger, PRD/traceability/capability matrix, M04 spec/plan, PR #6 and exact-SHA CI.

## Completion Checklist

- [ ] Overall M04 acceptance verified.
- [ ] Overall M04 Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

Exact next work: **Write M04.4 reaction add/remove behavioral RED tests for official POST/DELETE contracts, authenticated actor derivation, approval/idempotency, 201/204 success, provider errors and uncertain transport; verify intended RED before implementation.**

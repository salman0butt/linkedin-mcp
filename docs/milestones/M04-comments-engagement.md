# M04 — Comments & Engagement

Status: **ACTIVE — M04.2 bounded official Comments read adapter**

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
2. **ACTIVE** — M04.2 official bounded Comments read adapter.
3. **PLANNED** — M04.3 approval/idempotency-gated nested reply flow.
4. **PLANNED** — M04.4 reaction add/remove flow.
5. **PLANNED** — M04.5 explicit-thread unanswered inbox/context derivation.
6. **PLANNED** — M04.6 strict MCP/stdio/HTTP integration.
7. **PLANNED** — M04.7 whole-milestone review, exact-head CI, merge and post-merge verification.

## TDD Evidence

M04.1 behavioral RED: `b1c746ff87dba531d091c3172e4888d2be7f7ba4`, CI `38154909898`. Formatting passed; failures were exactly the absent engagement module, missing trusted engagement read config and incomplete M04 capability registry.

M04.1 GREEN: `2b80391f943907218a29fd39d4d6535cf0837e8f`, CI `38155192287`. 439/439 tests across 47 files plus frozen install, format, lint, typecheck and build passed.

## Integration Test Evidence

M04.1 is contract/config-only; no live LinkedIn request is made. Existing real stdio/HTTP MCP smoke suites remain green.

## Security Review

Primary boundaries: restricted read entitlements, subject-derived actor identity, no bulk engagement, no mutation retry after uncertain remote outcome, bounded provider responses/paging, cross-runtime idempotency and explicit capability provenance.

M04.1 enforces actor-free canonical reply/reaction payload identity, excludes deprecated `MAYBE`, rejects unsupported caller fields, defaults engagement reads OFF and keeps live capabilities unavailable.

## Code Review Findings

M04.1: no unresolved Critical or Important finding observed in the scoped contract/config review.

## Fresh Verification Results

Verified main after M03 hotfix: `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`, CI `38153987423`: 427/427 tests across 46 files plus all quality gates.

M04.1 exact head: `2b80391f943907218a29fd39d4d6535cf0837e8f`, CI `38155192287`: 439/439 tests across 47 files plus all quality gates.

## Durable Recovery Sources

`AGENTS.md`, `CODEX-START-HERE.md`, `docs/AUTONOMOUS-DEVELOPMENT.md`, project state/status/known issues, this ledger, PRD/traceability/capability matrix, M04 spec/plan, PR #6 and exact-SHA CI.

## Completion Checklist

- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

Exact next work: **Establish M04.2 behavioral RED for the bounded official Comments get/list adapter.**

# M04 — Comments & Engagement

Status: **ACTIVE — M04.1 contracts and access policy**

## Goal

Support capability-aware member comment reading/replies, reactions and bounded contextual engagement workflows.

## Dependencies

M03 merged and post-merge verified at `6713bfe79c261021ac39b75599509cd843e95f6d`, CI `38137131522`.

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

1. **ACTIVE** — M04.1 canonical contracts, capability/access policy and trusted read configuration.
2. **PLANNED** — M04.2 official bounded Comments read adapter.
3. **PLANNED** — M04.3 approval/idempotency-gated nested reply flow.
4. **PLANNED** — M04.4 reaction add/remove flow.
5. **PLANNED** — M04.5 explicit-thread unanswered inbox/context derivation.
6. **PLANNED** — M04.6 strict MCP/stdio/HTTP integration.
7. **PLANNED** — M04.7 whole-milestone review, exact-head CI, merge and post-merge verification.

## TDD Evidence

Pending M04.1 behavioral RED.

## Integration Test Evidence

Pending.

## Security Review

Primary boundaries: restricted read entitlements, subject-derived actor identity, no bulk engagement, no mutation retry after uncertain remote outcome, bounded provider responses/paging, cross-runtime idempotency and explicit capability provenance.

## Code Review Findings

None yet.

## Fresh Verification Results

M04 base is post-merge verified main `6713bfe79c261021ac39b75599509cd843e95f6d`, CI `38137131522`: 426/426 tests across 46 files plus all quality gates.

## Durable Recovery Sources

`AGENTS.md`, `CODEX-START-HERE.md`, `docs/AUTONOMOUS-DEVELOPMENT.md`, project state/status/known issues, this ledger, PRD/traceability/capability matrix, M04 spec/plan, active PR and exact-SHA CI.

## Completion Checklist

- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

Exact next work: **Establish M04.1 behavioral RED for contracts/access policy before implementation.**

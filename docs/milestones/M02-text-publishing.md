# M02 — Text Publishing

Status: **ACTIVE — M02.1 contracts**

## Goal

Deliver safe text-post drafts, preview/approval, idempotent official-API publishing and downstream verification.

## Dependencies

M01 verified.

## In Scope

Drafts, preview tokens/payload identity, text post publish, verification, audit/idempotency.

## Out of Scope

Image/video/document publishing.

## Acceptance Criteria

No duplicate retry; approval policy enforced; final post identifier/URL verified; failures are structured.

## Tasks / Iterations

1. **COMPLETE** — M02 activation, design and implementation plan.
2. **ACTIVE** — M02.1 canonical text-post contracts and capability implementation state.
3. **PLANNED** — approval receipt service.
4. **PLANNED** — persistent idempotency ledger.
5. **PLANNED** — official LinkedIn Posts adapter.
6. **PLANNED** — publish orchestration and downstream verification.
7. **PLANNED** — MCP tools and real transport wiring.
8. **PLANNED** — skeptical/security review and closeout.

## TDD Evidence

Pending.

## Integration Test Evidence

Pending.

## Security Review

No token leakage; mutation authorization and idempotency mandatory.

## Code Review Findings

Pending.

## Fresh Verification Results

Pending.

## Durable Recovery Sources

PRD, capability matrix, `docs/superpowers/specs/2026-10-08-m02-text-publishing-design.md`, `docs/superpowers/plans/2026-10-08-m02-text-publishing.md`, Git/PR/CI.

## Completion Checklist

- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

## Exact Next Work

Verify exact-head CI for M02 activation, then establish the M02.1 canonical text-post contract RED.

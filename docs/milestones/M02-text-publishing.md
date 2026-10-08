# M02 — Text Publishing

Status: **ACTIVE — M02.3 persistent idempotency ledger**

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
2. **COMPLETE** — M02.1 canonical text-post contracts and capability implementation state.
3. **COMPLETE** — M02.2 approval receipt service.
4. **ACTIVE** — M02.3 persistent idempotency ledger.
5. **PLANNED** — official LinkedIn Posts adapter.
6. **PLANNED** — publish orchestration and downstream verification.
7. **PLANNED** — MCP tools and real transport wiring.
8. **PLANNED** — skeptical/security review and closeout.

## TDD Evidence

M02.1 RED: `7c193f9adb8049a5849c603a5c5e29bea69ef59d`, CI `37753499633` — formatting passed; six new canonical text-post tests failed because the contract was absent; 105 pre-existing tests remained green.

M02.1 GREEN: `c1dab02097f0e7c816ab0d80b6485024d4cbea07`, CI `37753956032` — format, 111/111 tests across 24 files, lint, typecheck and build passed.

M02.2 RED: `7b55eb7a09f7010acffd6ba5a6c928b99099f472`, CI `37754698723` — formatting passed; 111 pre-existing tests remained green; the new approval suite failed solely because `approval-service` did not exist.

M02.2 GREEN: `5f1870106988c6b5ab365df275a8b3a314c60aa5`, CI `37754858404` — format, 116/116 tests across 25 files, lint, typecheck and build passed.

## Integration Test Evidence

M02.1 and M02.2 are deterministic local contracts. No live LinkedIn publication was attempted or claimed.

## Security Review

M02.1 rejects caller-controlled author and unknown provider payload fields. M02.2 binds approval to both exact payload hash and authenticated subject so approval cannot be replayed after an account switch. Receipts use cryptographically random opaque IDs by default, have bounded expiry, and can initiate only one idempotency operation; same-operation replay is safe while a different operation is rejected.

## Code Review Findings

No Critical or Important M02.1/M02.2 findings remain open. Live LinkedIn availability remains external and unverified.

## Fresh Verification Results

M02.1 exact GREEN `c1dab02097f0e7c816ab0d80b6485024d4cbea07`, CI `37753956032`: format, 111/111 tests, lint, typecheck and build green.

M02.2 exact GREEN `5f1870106988c6b5ab365df275a8b3a314c60aa5`, CI `37754858404`: format, 116/116 tests, lint, typecheck and build green.

## Durable Recovery Sources

PRD, capability matrix, `docs/superpowers/specs/2026-10-08-m02-text-publishing-design.md`, `docs/superpowers/plans/2026-10-08-m02-text-publishing.md`, Git/PR/CI.

## Completion Checklist

- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

## Exact Next Work

Establish M02.3 persistent idempotency-ledger RED tests covering reservation, same-key replay, hash conflicts, restart persistence, atomic writes, corrupt-state fail-closed behavior and terminal-result replay.

# M02 — Text Publishing

Status: **ACTIVE — M02.2 approval receipts**

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
3. **ACTIVE** — M02.2 approval receipt service.
4. **PLANNED** — persistent idempotency ledger.
5. **PLANNED** — official LinkedIn Posts adapter.
6. **PLANNED** — publish orchestration and downstream verification.
7. **PLANNED** — MCP tools and real transport wiring.
8. **PLANNED** — skeptical/security review and closeout.

## TDD Evidence

M02.1 RED: `7c193f9adb8049a5849c603a5c5e29bea69ef59d`, CI `37753499633` — formatting passed; six new canonical text-post tests failed because `textPostVisibilities` and `createTextPostPreview` were absent; 105 pre-existing tests remained green.

M02.1 GREEN: `c1dab02097f0e7c816ab0d80b6485024d4cbea07`, CI `37753956032` — format, 111/111 tests across 24 files, lint, typecheck and build passed.

## Integration Test Evidence

M02.1 is local deterministic contract work only; no live LinkedIn publication was attempted or claimed.

## Security Review

M02.1 rejects caller-controlled author and unknown provider payload fields. The canonical payload excludes author identity; M02.2 must bind approval to the authenticated subject as well as exact payload hash and expiry so an approval cannot be replayed after an account switch.

## Code Review Findings

No Critical or Important M02.1 findings remain open. Subject binding is a required M02.2 design constraint, not deferred debt.

## Fresh Verification Results

M02.1 exact GREEN head `c1dab02097f0e7c816ab0d80b6485024d4cbea07`, CI `37753956032`: format, 111/111 tests, lint, typecheck and build green.

## Durable Recovery Sources

PRD, capability matrix, `docs/superpowers/specs/2026-10-08-m02-text-publishing-design.md`, `docs/superpowers/plans/2026-10-08-m02-text-publishing.md`, Git/PR/CI.

## Completion Checklist

- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

## Exact Next Work

Establish M02.2 approval-receipt service RED tests binding approval to payload hash, authenticated subject and expiry without authorizing publication.

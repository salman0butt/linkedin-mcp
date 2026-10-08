# M02 — Text Publishing

Status: **ACTIVE — M02.4 official LinkedIn Posts adapter**

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
4. **COMPLETE** — M02.3 persistent idempotency ledger.
5. **ACTIVE** — M02.4 official LinkedIn Posts adapter.
6. **PLANNED** — M02.5 publish orchestration and downstream verification.
7. **PLANNED** — M02.6 MCP tools and real transport wiring.
8. **PLANNED** — M02.7 skeptical/security review and closeout.

## TDD Evidence

M02.1 RED: `7c193f9adb8049a5849c603a5c5e29bea69ef59d`, CI `37753499633` — formatting passed; six new canonical text-post tests failed because the contract was absent; 105 pre-existing tests remained green.

M02.1 GREEN: `c1dab02097f0e7c816ab0d80b6485024d4cbea07`, CI `37753956032` — format, 111/111 tests across 24 files, lint, typecheck and build passed.

M02.2 RED: `7b55eb7a09f7010acffd6ba5a6c928b99099f472`, CI `37754698723` — formatting passed; 111 pre-existing tests remained green; the new approval suite failed solely because `approval-service` did not exist.

M02.2 GREEN: `5f1870106988c6b5ab365df275a8b3a314c60aa5`, CI `37754858404` — format, 116/116 tests across 25 files, lint, typecheck and build passed.

M02.3 RED setup initially encountered formatter-only noise. Valid RED: `a99a0d59d66c37ac120d6efe4ac2ab364cf4aa0a`, CI `37755801316` — formatting passed; 116 existing tests remained green; the new ledger suite failed solely because `idempotency-ledger` did not exist.

M02.3 GREEN: `c88ae5b909888e796880f0193299cd21e1246648`, CI `37756724053` — format, 123/123 tests across 26 files, lint, typecheck and build passed.

## Integration Test Evidence

M02.1-M02.3 are deterministic local contracts/state. No live LinkedIn publication was attempted or claimed.

## Security Review

M02.1 rejects caller-controlled author and unknown provider payload fields. M02.2 binds approval to exact payload hash and authenticated subject with cryptographically random opaque bounded-lifetime receipts. M02.3 stores operation/hash/result metadata rather than post text or credentials; uses restrictive file permissions and atomic same-directory replacement; fails closed on corrupt persisted state; and persists `outcome_unknown` as a replayable terminal record so uncertain remote acceptance cannot trigger an automatic duplicate POST.

Scoped M02.3 skeptical review found no unresolved Critical or Important finding. The file-backed implementation is intentionally a single-runtime persistence boundary; broader distributed coordination is outside the current local-server architecture and is not represented as provided.

## Code Review Findings

No Critical or Important M02.1-M02.3 findings remain open. Live LinkedIn availability remains external and unverified.

## Fresh Verification Results

M02.1 exact GREEN `c1dab02097f0e7c816ab0d80b6485024d4cbea07`, CI `37753956032`: format, 111/111 tests, lint, typecheck and build green.

M02.2 exact GREEN `5f1870106988c6b5ab365df275a8b3a314c60aa5`, CI `37754858404`: format, 116/116 tests, lint, typecheck and build green.

M02.3 exact GREEN `c88ae5b909888e796880f0193299cd21e1246648`, CI `37756724053`: format, 123/123 tests, lint, typecheck and build green.

## Durable Recovery Sources

PRD, capability matrix, `docs/superpowers/specs/2026-10-08-m02-text-publishing-design.md`, `docs/superpowers/plans/2026-10-08-m02-text-publishing.md`, Git/PR/CI.

## Completion Checklist

- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

## Exact Next Work

Establish M02.4 official LinkedIn Posts adapter RED tests for exact endpoint/headers/body, YYYYMM API-version configuration, 201 `x-restli-id` success, sanitized HTTP classifications and transport `outcome_unknown` without retries.

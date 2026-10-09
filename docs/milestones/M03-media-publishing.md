# M03 — Media Publishing

Status: **ACTIVE — M03.3 official LinkedIn Images adapter next**

## Goal

Add safe, approval-gated member single-image and multi-image publishing with
accessible alt text, bounded local file validation, durable checkpoints and
conservative official LinkedIn API provenance.

## Dependencies

M02 merged; main `8e3917a46a4f3b3ce6c598ea7706f4d3feeb623b` passed
post-merge CI `37895605908`.

## In Scope

Canonical media contracts, safe media-root configuration, JPEG/PNG/GIF
validation, official Images adapter, processing-status verification, durable
media idempotency, approval-gated single/multi-image Posts and MCP integration.

## Out of Scope

Arbitrary URL fetch, browser fallback, video/document media, organization or
sponsored publishing, image transcoding and unverified live capability claims.

## Acceptance Criteria

- Relative local media paths remain inside a dedicated configured root.
- Unsupported/malformed/oversized files fail closed without path leakage.
- Alt text and ordered 2–20 multi-image descriptors are canonical and bound
  to explicit subject-bound approval and durable idempotency.
- Upload/checkpoint/restart and uncertain remote outcomes never silently
  duplicate mutations.
- Provider read restrictions never masquerade as verified image processing.
- Deterministic CI does not claim live LinkedIn member write access.

## Tasks / Iterations

1. **COMPLETE** — M03.1 canonical media-post contracts and capability registry.
2. **COMPLETE** — M03.2 media-root configuration and bounded local image reader.
3. **ACTIVE** — Official LinkedIn Images adapter.
4. **PLANNED** — Durable media checkpoints and v1 ledger migration.
5. **PLANNED** — Access-aware image processing verification.
6. **PLANNED** — Approval-gated media orchestration and Posts payload mapping.
7. **PLANNED** — Strict MCP tool/stdio/HTTP integration.
8. **PLANNED** — Whole-milestone review, exact-head CI and merge.

## TDD Evidence

M03.1 initial tests-only RED `17f55d6aeda31fc593bf1ad96eb4cd8c2a5a06c8`,
CI `37896584192`. GREEN `875efabef785c5e36cd2b725072643d63cbf0e7f`,
CI `37900961050`: 326 tests passed, format, lint, typecheck, build passed.

M03.2 tests-only commit `a05ca8e99d7d2627e26d2a0fbea55e65d40fc493`
first failed Prettier in CI `37913448271`. Formatting repairs led to
`4024ea449cdd3fe5eada2d9de38dad9420030ce2`, CI `37919800880`:
format passed; existing tests remained green while the new media configuration
and reader behavior failed for the intended missing implementation.

M03.2 implementation then progressed through formatting/type/test failures that
were debugged without weakening security assertions. Exact implementation GREEN
is `16d6fa2ffd6088d8973001fece18c2d5ab331ebd`, CI `37964060504`:
**346/346 tests across 34 files**, format, lint, typecheck and build passed.

## Integration Test Evidence

M03.1/M03.2 use deterministic local tests and synthetic media only. No real
LinkedIn image upload or media post has been executed or verified.

## Security Review

M03.2 scoped review checked containment, ancestor/final symlinks, bounded reads,
file replacement checks, signature-based format validation, dimension/frame
limits, sanitized errors and separation from credential/ledger paths. It found
**0 unresolved Critical findings and 0 unresolved Important findings**.

Full M03 review remains pending because remote Images adapter, persistence,
verification, orchestration and transport integration are unfinished.

## Code Review Findings

PR #4 has no blocking review comments/threads observed. M03.2 scoped review is
clear, but this does not satisfy the later whole-milestone review gate.

## Fresh Verification Results

Latest implementation GREEN checkpoint:
`16d6fa2ffd6088d8973001fece18c2d5ab331ebd`, CI `37964060504`.
The job passed frozen install, Prettier, 346 tests, lint, typecheck and build.

Durable documentation commits after that checkpoint require their own final
exact-head CI before any future merge readiness claim.

## Durable Recovery Sources

`AGENTS.md`, `CODEX-START-HERE.md`, `docs/AUTONOMOUS-DEVELOPMENT.md`,
`docs/progress/project-state.json`, `docs/progress/STATUS.md`,
`docs/milestones/CURRENT.md`, M03 spec/plan, PR #4 and exact-SHA CI.

## Completion Checklist

- [x] M03.1 canonical contracts deterministically verified.
- [x] M03.2 behavioral RED observed.
- [x] M03.2 implementation and exact-head GREEN.
- [ ] M03.3 official Images adapter RED/GREEN.
- [ ] Remaining M03 tasks and whole-milestone security review.
- [ ] Exact-final-head CI and merge gates.
- [ ] Post-merge main CI verified.

Exact next work: **Write M03.3 RED tests for the official LinkedIn Images adapter, verify intended exact-head RED, then implement the minimum safe adapter.**

# M03 — Media Publishing

Status: **ACTIVE — M03.2 intended RED verified; implementation pending**

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
2. **ACTIVE** — M03.2 media-root configuration and bounded local image reader.
3. **PLANNED** — Official LinkedIn Images adapter.
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
failed Prettier in CI `37913448271`. Formatting repairs led to
`4024ea449cdd3fe5eada2d9de38dad9420030ce2`, CI `37919800880`:
format passed; 326 existing tests passed; 11 media configuration assertions
failed for missing behavior and media-file import failed because the reader
does not yet exist. This is observed intended RED, not GREEN.

## Integration Test Evidence

M03.1 deterministic tests only. No M03.2 implementation, real LinkedIn
upload or real post has been verified.

## Security Review

M03 design and plan require containment, symlink/TOCTOU defenses, bounded
reads, image signature parsing, no secret/path leakage, durable uncertain
outcome handling and provider provenance. Full review pending implementation.

## Code Review Findings

No unresolved Critical/Important findings were reported in PR #4 review
threads (0 threads), but the M03 implementation is incomplete and has not
received a whole-milestone skeptical/security review.

## Fresh Verification Results

Latest GREEN checkpoint: `875efabef785c5e36cd2b725072643d63cbf0e7f`,
CI `37900961050` (M03.1 only).

Latest observed intended RED: `4024ea449cdd3fe5eada2d9de38dad9420030ce2`,
CI `37919800880`. M03.2 config/reader implementation writes were rejected
by connector safety checks. Do not represent this as implemented or GREEN.

## Durable Recovery Sources

`AGENTS.md`, `CODEX-START-HERE.md`, `docs/AUTONOMOUS-DEVELOPMENT.md`,
`docs/progress/project-state.json`, `docs/progress/STATUS.md`,
`docs/milestones/CURRENT.md`, M03 spec/plan, PR #4 and exact-SHA CI.

## Completion Checklist

- [x] M03.1 canonical contracts deterministically verified.
- [x] M03.2 behavioral RED observed.
- [ ] M03.2 implementation and exact-head GREEN.
- [ ] Remaining M03 tasks and whole-milestone security review.
- [ ] Exact-final-head CI and merge gates.
- [ ] Post-merge main CI verified.

Exact next work: **Implement M03.2 media-root configuration and bounded JPEG/PNG/GIF reader on PR #4, then verify exact-head GREEN CI.**

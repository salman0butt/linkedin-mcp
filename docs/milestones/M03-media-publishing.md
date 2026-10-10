# M03 — Media Publishing

Status: **ACTIVE — M03.5 access-aware image processing verification**

## Goal

Add safe, approval-gated member single-image and multi-image publishing with
accessible alt text, bounded local file validation, durable checkpoints and
conservative official LinkedIn API provenance.

## Dependencies

M02 merged; its post-merge main CI `37895605908` passed at
`8e3917a46a4f3b3ce6c598ea7706f4d3feeb623b`. Current main is
`e006d0d21ee6b3531ec6fcd7a4390bfebf704374` after later repository maintenance.

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
3. **COMPLETE** — M03.3 official LinkedIn Images adapter.
4. **COMPLETE** — M03.4 durable media checkpoints and v1 ledger migration.
5. **ACTIVE** — M03.5 access-aware image processing verification.
6. **PLANNED** — Approval-gated media orchestration and Posts payload mapping.
7. **PLANNED** — Strict MCP tool/stdio/HTTP integration.
8. **PLANNED** — Whole-milestone review, exact-head CI and merge.

## TDD Evidence

M03.1 initial tests-only RED `17f55d6aeda31fc593bf1ad96eb4cd8c2a5a06c8`,
CI `37896584192`. GREEN `875efabef785c5e36cd2b725072643d63cbf0e7f`,
CI `37900961050`: 326 tests passed, format, lint, typecheck, build passed.

M03.2 behavioral RED `4024ea449cdd3fe5eada2d9de38dad9420030ce2`,
CI `37919800880`, led to final GREEN
`16d6fa2ffd6088d8973001fece18c2d5ab331ebd`, CI `37964060504`:
346/346 tests across 34 files plus format/lint/typecheck/build passed.

M03.3 behavioral RED `7af0139a2a7f51a873b584af7270628006180e31`,
CI `37965807247`: format passed, all 346 existing tests remained green, and the
new Images adapter suite failed only because the adapter module was absent.

Initial adapter GREEN `4b4ca8a8618709034132ba36bc41d14ddd92a740`,
CI `37966349832`, passed 361/361 tests plus format/lint/typecheck/build. Scoped
review then found one Important issue: successful provider response JSON was not
bounded. Regression RED `982628adaaaa1cc61ad5e717654ca563bcb2c616`,
CI `37966563223`, preserved all 361 existing tests and failed only the two new
oversized-response assertions.

Final M03.3 GREEN `f5f4a7d99fdbca41cfdfa9d73838ecd00f9d7f5f`,
CI `37966842680`: 363/363 tests across 36 files, format, lint, typecheck and
build passed. Successful provider JSON is streamed with a hard 64 KiB local bound.

M03.4 initial RED at `22cdfe906d3eb69dbc05e35f5c4c2ae732a1dd2e`,
CI `38035751980`, proved the v1-to-v2 migration and missing checkpoint API. The
expanded behavioral RED at `47c47a01cad9395b9d96a921f47b65070f5e62fd`,
CI `38050945859`, passed formatting and 364 tests while six intended assertions
failed for migration/checkpoint behavior.

Implementation at `51391783ff698ec67d83a5298b5a6f13839d6db6` made all seven
new checkpoint tests pass and left one intentionally stale M02 schema-version
assertion. Updating that assertion exposed a typecheck-only compatibility issue in
text-service mocks, fixed by preserving `IdempotencyLedger` as the text-only
reserve/complete contract and adding `MediaIdempotencyLedger` for checkpointing.

Final M03.4 GREEN `f71e9295e1e1d710b232859ab57e8e5264eaa0e4`,
CI `38051403134`: **370/370 tests across 37 files**, format, lint, typecheck and
build passed.

## Integration Test Evidence

M03.1–M03.4 use deterministic tests, synthetic media and injected fetch/providers.
No real LinkedIn image upload, image-status read or media post has been executed
or verified.

## Security Review

M03.2 scoped review found 0 unresolved Critical/Important findings after
containment, symlink, bounded-read, replacement, format and error-sanitization checks.

M03.3 scoped review checks official versioned endpoints, member-only ownership,
strict image URNs, HTTPS LinkedIn-controlled upload hosts, disabled redirects,
exact-byte uploads, no automatic mutation retries, sanitized errors, unread HTTP
error bodies and bounded successful JSON parsing. One Important unbounded-response
finding was fixed through RED `982628ad...` and final GREEN `f5f4a7d9...`.
Re-review has 0 unresolved Critical findings and 0 unresolved Important findings.

M03.4 scoped review verifies v1 read compatibility, canonical v2-on-mutation
migration, exact checkpoint-field parsing, no source path/bytes/alt text/upload URL
persistence, ordered digest/image-URN binding, rebinding/state-regression conflicts,
terminal immutability, uncertainty recovery, sibling lock safety and atomic
replacement. Review has 0 unresolved Critical and 0 unresolved Important findings.

Full M03 review remains pending because processing verification, orchestration and
MCP integration are unfinished.

## Code Review Findings

PR #4 has no blocking review comments/threads observed. M03.2–M03.4 scoped reviews
are clear, but this does not satisfy the later whole-milestone review gate.

## Fresh Verification Results

Latest implementation GREEN checkpoint:
`f71e9295e1e1d710b232859ab57e8e5264eaa0e4`, CI `38051403134`.
The job passed frozen install, Prettier, 370 tests across 37 files, lint,
typecheck and build.

Durable documentation commits after that checkpoint require their own exact-head
CI before any future merge-readiness claim.

## Durable Recovery Sources

`AGENTS.md`, `CODEX-START-HERE.md`, `docs/AUTONOMOUS-DEVELOPMENT.md`,
`docs/progress/project-state.json`, `docs/progress/STATUS.md`,
`docs/milestones/CURRENT.md`, M03 spec/plan, PR #4 and exact-SHA CI.

## Completion Checklist

- [x] M03.1 canonical contracts deterministically verified.
- [x] M03.2 behavioral RED and exact-head GREEN.
- [x] M03.3 official Images adapter RED/GREEN and scoped security re-review.
- [x] M03.4 durable checkpoint migration RED/GREEN and scoped review.
- [ ] M03.5 processing verification RED/GREEN.
- [ ] Remaining M03 tasks and whole-milestone security review.
- [ ] Exact-final-head CI and merge gates.
- [ ] Post-merge main CI verified.

Exact next work: **Write M03.5 RED tests for bounded access-aware image processing verification, verify intended exact-head RED, then implement the injectable verifier.**

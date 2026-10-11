# M03 — Media Publishing

Status: **ACTIVE — M03.7 strict MCP/transport integration**

## Goal

Add safe, approval-gated member single-image and multi-image publishing with accessible alt text, bounded local file validation, durable checkpoints and conservative official LinkedIn API provenance.

## Dependencies

M02 is merged. Current `main` is `e006d0d21ee6b3531ec6fcd7a4390bfebf704374` after later repository maintenance.

## In Scope

Canonical media contracts, safe media-root configuration, JPEG/PNG/GIF validation, official Images adapter, processing-status verification, durable media idempotency, approval-gated single/multi-image Posts and MCP integration.

## Out of Scope

Arbitrary URL fetch, browser fallback, video/document media, organization or sponsored publishing, image transcoding and unverified live capability claims.

## Acceptance Criteria

- Relative local media paths remain inside a dedicated configured root.
- Unsupported/malformed/oversized files fail closed without path leakage.
- Alt text and ordered 2–20 multi-image descriptors are canonical and bound to explicit subject-bound approval and durable idempotency.
- Upload/checkpoint/restart and uncertain remote outcomes never silently duplicate mutations.
- Provider read restrictions never masquerade as verified image processing.
- Deterministic CI does not claim live LinkedIn member write access.

## Tasks / Iterations

1. **COMPLETE** — M03.1 canonical media-post contracts and capability registry.
2. **COMPLETE** — M03.2 media-root configuration and bounded local image reader.
3. **COMPLETE** — M03.3 official LinkedIn Images adapter.
4. **COMPLETE** — M03.4 durable media checkpoints and v1 ledger migration.
5. **COMPLETE** — M03.5 access-aware image processing verification.
6. **COMPLETE** — M03.6 approval-gated media orchestration and Posts payload mapping.
7. **ACTIVE** — M03.7 strict MCP tool/stdio/HTTP integration.
8. **PLANNED** — M03.8 whole-milestone review, exact-head CI and merge.

## TDD Evidence

- M03.1 GREEN `875efabef785c5e36cd2b725072643d63cbf0e7f`, CI `37900961050`.
- M03.2 GREEN `16d6fa2ffd6088d8973001fece18c2d5ab331ebd`, CI `37964060504`.
- M03.3 final GREEN `f5f4a7d99fdbca41cfdfa9d73838ecd00f9d7f5f`, CI `37966842680` after bounded-response regression RED.
- M03.4 final GREEN `f71e9295e1e1d710b232859ab57e8e5264eaa0e4`, CI `38051403134`.
- M03.5 final GREEN `0eaa01e31f605a576b2b4456a23605c379f7d3eb`, CI `38057237124`.
- M03.6 Posts payload/orchestration TDD began with RED commits `07b1ae793052719e26eb4c05f3ef646b62c88a43` and `04d67275c6727e400db2efe4001e23be5fcc2fb5`; implementation and safety regressions followed on the same PR branch.
- M03.6 deadline regression RED `4b92d8d8ea2c44f94c39d0e1483ab01bf2390e36`, CI `38127429915`: 409 tests passed and only the stalled-status assertion failed as intended.
- M03.6 adapter cancellation RED `3c6ee6476bce750377a9b371698c2431985ebf0d`, CI `38127891256`: 410 tests passed and only signal forwarding failed as intended.
- M03.6 final reviewed GREEN `e21bf679846564eacdc025de2fa7657e4dc25018`, CI `38127969036`: **411/411 tests across 43 files**, format, lint, typecheck and build passed.
- M03.7 MCP contract RED is in progress on PR #4; exact behavioral RED is not recorded until unrelated framework guards are green.

## Integration Test Evidence

- M03.6 deterministic integration coverage exercises official Images and Posts adapters through injected providers without live account claims.
- Existing real stdio and loopback HTTP smoke suites remain green through the M03.7 RED setup and are the required transport gates for the M03.7 implementation.
- M03.7 must expose the six media tools through the same shared runtime used by both transports while preserving M00–M02 behavior.

## Security Review

M03.2–M03.5 scoped reviews are clear after their recorded fixes.

M03.6 scoped review verifies subject-bound approval, current-file re-hash before mutation, 2–20 ordered media/alt-text binding, durable digest/image-URN checkpoints, replay and same-key serialization, no upload URL persistence, fail-closed uncertainty, provider 401 invalidation, bounded status reads and actual abort propagation into provider fetch. The resolved stalled-read/cancellation finding is recorded in `docs/progress/KNOWN-ISSUES.md`. M03.6 has 0 unresolved Critical and 0 unresolved Important findings.

No live LinkedIn image upload/status/post verification has occurred. Deterministic implementation evidence must not be represented as live account capability.

Full M03 review remains pending M03.7 MCP integration and M03.8 closeout.

## Code Review Findings

- M03.3 unbounded successful provider-response handling was fixed before checkpoint closeout.
- M03.6 stalled status reads and missing real-fetch abort forwarding were fixed and re-reviewed.
- Current unresolved Critical findings: 0.
- Current unresolved Important findings: 0.
- M03.7 and whole-milestone review remain pending.

## Fresh Verification Results

- Latest fully verified implementation checkpoint: `e21bf679846564eacdc025de2fa7657e4dc25018`, CI `38127969036` — 411/411 tests across 43 files plus frozen install, format, lint, typecheck and build.
- Later M03.7 test-only commits intentionally move exact-head CI to RED while the strict MCP surface is developed; they do not supersede `e21bf679...` as the latest GREEN implementation checkpoint until a new exact-head GREEN run is observed.

## Durable Recovery Sources

- `docs/progress/project-state.json`
- `docs/progress/STATUS.md`
- `docs/progress/KNOWN-ISSUES.md`
- `docs/milestones/CURRENT.md`
- this milestone ledger
- `docs/requirements/TRACEABILITY.md`
- `docs/product/CAPABILITY-MATRIX.md`
- `docs/superpowers/specs/2026-10-09-m03-media-publishing-design.md`
- `docs/superpowers/plans/2026-10-09-m03-media-publishing.md`
- PR #4 source/tests/reviews and exact-SHA GitHub Actions evidence

## Completion Checklist

- [x] M03.1 canonical contracts deterministically verified.
- [x] M03.2 behavioral RED and exact-head GREEN.
- [x] M03.3 official Images adapter RED/GREEN and scoped security re-review.
- [x] M03.4 durable checkpoint migration RED/GREEN and scoped review.
- [x] M03.5 processing verification RED/GREEN and scoped review.
- [x] M03.6 media orchestration RED/GREEN and scoped review.
- [ ] M03.7 strict MCP/stdio/HTTP integration.
- [ ] M03.8 whole-milestone security review, exact-final-head CI and merge gates.
- [ ] Post-merge main CI verified.

Exact next work: **Verify a clean M03.7 MCP behavioral RED with repository framework guards green, then wire the existing media service without weakening M00–M02 behavior or capability provenance.**

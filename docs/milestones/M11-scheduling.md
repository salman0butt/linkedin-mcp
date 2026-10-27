# M11 — Scheduling & Automation

Status: **IMPLEMENTING — M11.0 strictly LOCAL_ONLY preview VERIFIED/MERGED; M11.1 private STDIO-only persisted planning in implementation. Actual scheduling, approval-aware execution and publication remain PLANNED/UNAVAILABLE.**

## Goal

Deliver content calendar and safe scheduled execution over already-approved content operations.

## Dependencies

Publishing milestones verified; runtime persistence requirements defined.

## In Scope

Scheduled actions, retries, cancellation/reschedule, approval-state checks, content calendar.

## Out of Scope

Bypassing approval policies or uncontrolled high-frequency automation.

## Acceptance Criteria

Scheduled actions are durable/idempotent, respect approval/capability/auth state and produce auditable outcomes.

## Tasks / Iterations

M11.0 caller-authored UTC content calendar **preview only** (strict user input, no persistence/queue/provider/approval/publish), design `docs/superpowers/specs/2026-10-27-m11-local-content-calendar-preview-design.md` and plan `docs/superpowers/plans/2026-10-27-m11-local-content-calendar-preview.md`, verified via PR #21 feature `7f6c75431c43330cf78c6abaed1c779c4951c67a` CI `40472594047` SUCCESS and squash main `96e4052eb4fd92d24afb0489c3142e65447e63c7` exact push CI `40475275490` SUCCESS. M11.1 opt-in private STDIO-only durable calendar planning CRUD is the next independently scoped slice (`docs/superpowers/specs/2026-10-27-m11-private-calendar-plans-design.md`, `docs/superpowers/plans/2026-10-27-m11-private-calendar-plans.md`); no queue or publishing. Later executor design must address scheduler claims, at-execution trusted approval and auth/scopes/capability checks, bounded retries/uncertain-outcome handling, cancellation/rescheduling and auditable verification.

## TDD Evidence

M11.0 genuine test-first missing-module RED (`ERR_MODULE_NOT_FOUND` for `calendar-preview.js`), then pure 8/8 GREEN; separate real SDK MCP tool-not-found RED (7 expected failures) before registrar, then new typed MCP 7/7 GREEN; prime capability/inventory tests RED before descriptor and tool registration, then 12/12 GREEN. No scheduler/publisher capability activated.

## Integration Test Evidence

M11.0 Node24 **1,119/1,119 tests across 103 suites** with built STDIO and loopback HTTP smoke and actual raw SSE full wire bytes ≤256KiB, 56 real built tools. Full format/lint/typecheck/build/diff GREEN; independent cross-owner security reviews and exact feature/main CI all succeeded. M11.1 Node24 baseline 1,119/1,119; final Node24 1,156/1,156 in 106 suites, all quality/real STDIO/HTTP checks GREEN, independent cross-owner security review Critical=0 Important=0 after semantic stored-result validation RED→GREEN; remote feature/main CI PENDING.

## Security Review

For eventual execution: recheck live credentials/scopes/entitlements and trusted current approval at _execution time_; never carry a 5–10-minute approval grant forward to a future slot; enforce durable CAS/lease/claim, bounded retry and never auto-retry unknown remote outcomes. M11.0 contains **no execution**; read-only strict own-data, secret-safe errors and bounded raw HTTP SSE must pass independent review.

## Code Review Findings

Independent M11.0 PURE calendar-preview security review signed off unresolved Critical=0 Important=0: 90/90 standalone hostile probes plus 8/8 focused tests, revoked/proxy/getter/accessor safety, real UTC minute/90-day bounds, deep freeze, source-only data and no IO. Complementary MCP/capability/transport review signed off Critical=0 Important=0 after built STDIO+HTTP 6/6, direct raw HTTP/SSE 22/22, private-store 13/13; 56 built tools, no `schedule.create`, no remote publishing. Exact feature/main CI verified; new M11.1 security review must be independent and cannot inherit that signoff.

M11.1 additional independent host-integration audit found two Important path-isolation defects: macOS case/Unicode/physical aliases could bypass private-store collision checks, and media roots could overlap private `.lock`/`.initialized`/`.ready`/hidden-lock companions (including inherited job/ledger overlaps). Both were reproduced with three failing focused regression groups each, repaired with read-only physical-ancestor identity and symmetric five-store/sidecar/media checks, and verified by local Node24 1,156/1,156 tests across 106 suites, plus formatting, lint, typecheck, build, real STDIO and HTTP. Final independent re-review of the second remediation is pending before release.

## Fresh Verification Results

M11.0 Node24 full gates and all 1,119 tests PASS; PR #21 squash merge exact tree `72e192cbc0ada8dd300561e032fe703c0911cbb5`, feature/main CI success. M11.1 genuine store missing-module RED, real SDK missing-tool RED, prime capability/config/inventory RED; focused and full Node24 1,156/1,156 GREEN with built real transports. Independently reproduced Important: semantically invalid store-produced calendar initially passed MCP structural output parser; fixed with M11.0 preview semantic validator, regression GREEN and cross-owner reviewer Critical=0 Important=0. Exact remote feature/main CI PENDING.

## Durable Recovery Sources

PRD, capability matrix, M11 spec/plan, Git/PR/CI.

## Completion Checklist

- [x] M11.0 preview scoped acceptance, independent Critical/Important and exact feature/main CI verified.
- [x] M11.1 local private calendar plan scoped acceptance and independent security review Critical=0 Important=0.
- [ ] M11.1 exact-final-head/post-merge CI green.
- [ ] Full M11 scheduler execution acceptance remains blocked pending separate at-execution approval and provider design.

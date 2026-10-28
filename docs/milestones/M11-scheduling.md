# M11 — Scheduling & Automation

Status: **IMPLEMENTING — M11.0 preview, M11.1 STDIO-private persistence and M11.2 revision-gated inspection VERIFIED/MERGED; M11.3 strictly read-only two-plan UTC slot comparison implementing. Actual scheduling, approval-aware execution and publication remain PLANNED/UNAVAILABLE.**

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

M11.0 caller-authored UTC content calendar **preview only** is VERIFIED/MERGED via PR #21 feature CI `40472594047` and squash main `96e4052eb4fd92d24afb0489c3142e65447e63c7` push CI `40475275490` SUCCESS. M11.1 opt-in private STDIO-only durable CRUD VERIFIED/MERGED via PR #22: corrected feature `4382b54d579e211c0aeac916ec265d82b4730934` CI `40493902705` and squash main `4dbecdebb2b94ee26d646b3933f268e4796251fa` push CI `40494259585` SUCCESS. M11.2 read-only saved-plan inspection VERIFIED/MERGED via PR #23 feature `855c9324a72ee88467b38236ceaa77ee9d885064` CI `40497799619`, squash main `39d843dda4a5ffc00b9c74aaf1c5f320af967e93` push CI `40498119965` SUCCESS; Node24 1,173/1,173 and independent Critical0 Important0. M11.3 strictly read-only cross-plan slot comparison implementing per `docs/superpowers/specs/2026-10-27-m11-cross-plan-slot-comparison-design.md` and `docs/superpowers/plans/2026-10-27-m11-cross-plan-slot-comparison.md`. Later executor requires fresh at-execution trusted approval, live auth/scopes, durable fencing/claims/recovery, bounded retries and unknown-outcome handling; no currently active scheduling.

## TDD Evidence

M11.0 genuine test-first missing-module RED (`ERR_MODULE_NOT_FOUND` for `calendar-preview.js`), then pure 8/8 GREEN; separate real SDK MCP tool-not-found RED (7 expected failures) before registrar, then new typed MCP 7/7 GREEN; prime capability/inventory tests RED before descriptor and tool registration, then 12/12 GREEN. No scheduler/publisher capability activated.

## Integration Test Evidence

M11.0 Node24 **1,119/1,119 tests across 103 suites**, built STDIO/loopback HTTP/raw SSE ≤256KiB and 56 built tools; full gates and exact CI passed. M11.1 Node24 **1,156/1,156 in 106 suites**, real transports, independent Critical0 Important0, PR #22 feature/main CI success. M11.2 Node24 **1,173/1,173 in 108 suites**, quality and real STDIO/HTTP GREEN, independent Critical0 Important0, PR #23 feature CI `40497799619`, main CI `40498119965` SUCCESS. M11.3 full local Node24 **1,188/1,188 tests in 110 suites**, formatting/lint/typecheck/build and compiled STDIO/HTTP GREEN; independent review/remote CI PENDING.

## Security Review

For eventual execution: recheck live credentials/scopes/entitlements and trusted current approval at _execution time_; never carry a 5–10-minute approval grant forward to a future slot; enforce durable CAS/lease/claim, bounded retry and never auto-retry unknown remote outcomes. M11.0 contains **no execution**; read-only strict own-data, secret-safe errors and bounded raw HTTP SSE must pass independent review.

## Code Review Findings

Independent M11.0 PURE calendar-preview security review signed off unresolved Critical0 Important0: 90/90 hostile probes and 8/8 focused tests. Complementary MCP/transport review Critical0 Important0 after real STDIO/HTTP, 22/22 raw SSE and 13/13 private-store probes. M11.1 had independent final Critical0 Important0 review. M11.2 independently reviewed with pure 131/131 hostile checks, 83 MCP and 17 raw HTTP/SSE hostile checks and final Critical0 Important0. M11.3 requires separate independent pure and MCP/transport review.

M11.1 independent host-integration audit found four Important path-isolation edge cases: macOS physical casefold aliases, private-store/media-root companion overlap, case-sensitive APFS Unicode normalization, and cross-device mounted case-sensitivity probes. Each was reproduced with genuine RED→GREEN and independently re-reviewed to Critical0 Important0. Ubuntu's first feature CI uncovered three portable test fixture assumptions about `/private/tmp`; corrected without production change, verified local Node24 1,156/1,156 and new Ubuntu exact feature CI success before guarded squash merge.

## Fresh Verification Results

M11.0 Node24 1,119/1,119 and PR #21 exact feature/main CI SUCCESS. M11.1 genuine RED→GREEN plus Node24 1,156/1,156 GREEN, PR #22 feature CI `40493902705`, guarded squash main `4dbecdebb2b94ee26d646b3933f268e4796251fa` push CI `40494259585` SUCCESS. M11.2 genuine pure missing-module/SDK missing-tool/inventory RED→GREEN and Node24 1,173/1,173 GREEN; PR #23 feature `855c9324a72ee88467b38236ceaa77ee9d885064` CI `40497799619`, guarded squash main `39d843dda4a5ffc00b9c74aaf1c5f320af967e93` tree `8247b98a4d736603b11feabc971711805fdcdb25` push CI `40498119965` SUCCESS. M11.3 genuine missing-module pure, missing-method real SDK and inventory RED→GREEN (58→59 in-memory, 62→63 compiled), full Node24 1,188/1,188 in 110 suites GREEN; independent reviews/remote feature/main CI PENDING.

## Durable Recovery Sources

PRD, capability matrix, M11 spec/plan, Git/PR/CI.

## Completion Checklist

- [x] M11.0 preview scoped acceptance, independent Critical/Important and exact feature/main CI verified.
- [x] M11.1 local private calendar plan scoped acceptance and independent security review Critical=0 Important=0.
- [x] M11.1 exact-final-head `40493902705` and post-merge main `40494259585` CI green.
- [x] M11.2 deterministic read-only inspection, independent Critical0 Important0, exact feature CI `40497799619` and main CI `40498119965` verified.
- [ ] M11.3 two-plan slot comparison acceptance, independent Critical0 Important0, exact feature/main CI verified.
- [ ] Full M11 scheduler execution acceptance remains blocked pending separate at-execution approval and provider design.

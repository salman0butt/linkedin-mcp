# M11 — Scheduling & Automation

Status: **IMPLEMENTING — M11.0 LOCAL_ONLY preview and M11.1 STDIO-only private persistence VERIFIED/MERGED; M11.2 read-only private plan inspection implementing. Actual scheduling, approval-aware execution and publication remain PLANNED/UNAVAILABLE.**

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

M11.0 caller-authored UTC content calendar **preview only** (strict user input, no persistence/queue/provider/approval/publish), design `docs/superpowers/specs/2026-10-27-m11-local-content-calendar-preview-design.md` and plan `docs/superpowers/plans/2026-10-27-m11-local-content-calendar-preview.md`, verified via PR #21 feature `7f6c75431c43330cf78c6abaed1c779c4951c67a` CI `40472594047` SUCCESS and squash main `96e4052eb4fd92d24afb0489c3142e65447e63c7` push CI `40475275490` SUCCESS. M11.1 opt-in private STDIO-only durable CRUD VERIFIED/MERGED via PR #22: corrected feature `4382b54d579e211c0aeac916ec265d82b4730934` CI `40493902705` SUCCESS, exact-tree squash main `4dbecdebb2b94ee26d646b3933f268e4796251fa` push CI `40494259585` SUCCESS; final independent Critical0 Important0. M11.2 read-only saved-plan inspection is implementing per `docs/superpowers/specs/2026-10-27-m11-calendar-plan-inspection-design.md` and `docs/superpowers/plans/2026-10-27-m11-calendar-plan-inspection.md`. Later executor design must address scheduler claims, at-execution trusted approval and auth/scopes/capability checks, bounded retries/uncertain-outcome handling, cancellation/rescheduling and auditable verification.

## TDD Evidence

M11.0 genuine test-first missing-module RED (`ERR_MODULE_NOT_FOUND` for `calendar-preview.js`), then pure 8/8 GREEN; separate real SDK MCP tool-not-found RED (7 expected failures) before registrar, then new typed MCP 7/7 GREEN; prime capability/inventory tests RED before descriptor and tool registration, then 12/12 GREEN. No scheduler/publisher capability activated.

## Integration Test Evidence

M11.0 Node24 **1,119/1,119 tests across 103 suites** with built STDIO and loopback HTTP smoke and actual raw SSE full wire bytes ≤256KiB, 56 real built tools. Full format/lint/typecheck/build/diff GREEN; independent cross-owner security reviews and exact feature/main CI all succeeded. M11.1 final Node24 **1,156/1,156 in 106 suites**, all quality/real STDIO/HTTP checks GREEN, independent cross-owner security review Critical=0 Important=0; PR #22 exact feature CI `40493902705` and merged-main CI `40494259585` SUCCESS. M11.2 Node24 local **1,173/1,173 in 108 suites**, quality and real STDIO/HTTP GREEN; independent review and remote release PENDING.

## Security Review

For eventual execution: recheck live credentials/scopes/entitlements and trusted current approval at _execution time_; never carry a 5–10-minute approval grant forward to a future slot; enforce durable CAS/lease/claim, bounded retry and never auto-retry unknown remote outcomes. M11.0 contains **no execution**; read-only strict own-data, secret-safe errors and bounded raw HTTP SSE must pass independent review.

## Code Review Findings

Independent M11.0 PURE calendar-preview security review signed off unresolved Critical=0 Important=0: 90/90 standalone hostile probes plus 8/8 focused tests, revoked/proxy/getter/accessor safety, real UTC minute/90-day bounds, deep freeze, source-only data and no IO. Complementary MCP/capability/transport review signed off Critical=0 Important=0 after built STDIO+HTTP 6/6, direct raw HTTP/SSE 22/22, private-store 13/13; 56 built tools, no `schedule.create`, no remote publishing. M11.1 had its own independent final Critical0 Important0 review; M11.2 requires another independent review.

M11.1 independent host-integration audit found four Important path-isolation edge cases: macOS physical casefold aliases, private-store/media-root companion overlap, case-sensitive APFS Unicode normalization, and cross-device mounted case-sensitivity probes. Each was reproduced with genuine RED→GREEN and independently re-reviewed to Critical0 Important0. Ubuntu's first feature CI uncovered three portable test fixture assumptions about `/private/tmp`; corrected without production change, verified local Node24 1,156/1,156 and new Ubuntu exact feature CI success before guarded squash merge.

## Fresh Verification Results

M11.0 Node24 full gates and all 1,119 tests PASS; PR #21 squash merge exact tree `72e192cbc0ada8dd300561e032fe703c0911cbb5`, feature/main CI success. M11.1 genuine store missing-module RED, real SDK missing-tool RED, prime capability/config/inventory RED, semantic output/path RED→GREEN; full Node24 1,156/1,156 GREEN. M11.1 exact feature CI `40493902705` SUCCESS; guarded squash main `4dbecdebb2b94ee26d646b3933f268e4796251fa` tree `2be8c57c58a6d9c8c62e3d68dc2446444d09d46f`, exact main push CI `40494259585` SUCCESS. M11.2 genuine pure missing-module, SDK missing-tool and prime inventory RED→GREEN, Node24 1,173/1,173 GREEN; independent review and remote feature/main CI PENDING.

## Durable Recovery Sources

PRD, capability matrix, M11 spec/plan, Git/PR/CI.

## Completion Checklist

- [x] M11.0 preview scoped acceptance, independent Critical/Important and exact feature/main CI verified.
- [x] M11.1 local private calendar plan scoped acceptance and independent security review Critical=0 Important=0.
- [x] M11.1 exact-final-head `40493902705` and post-merge main `40494259585` CI green.
- [ ] M11.2 deterministic read-only inspection, independent Critical0 Important0, exact feature/main CI verified.
- [ ] Full M11 scheduler execution acceptance remains blocked pending separate at-execution approval and provider design.

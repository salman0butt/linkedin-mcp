# M11 — Scheduling & Automation

Status: **IMPLEMENTING — M11.0 read-only LOCAL_ONLY content calendar preview in isolated branch; durable scheduling/approval-aware execution remains PLANNED/UNAVAILABLE.**

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

M11.0 caller-authored UTC content calendar **preview only** (strict user input, no persistence/queue/provider/approval/publish), design `docs/superpowers/specs/2026-10-27-m11-local-content-calendar-preview-design.md` and plan `docs/superpowers/plans/2026-10-27-m11-local-content-calendar-preview.md`. Further slices: optional trusted private STDIO durable calendar state, then scheduler claims, at-execution trusted human approvals and auth/scopes/capability checks, bounded retries/uncertain-outcome handling, cancellation/rescheduling, auditable verification. None is authorized merely by M11.0.

## TDD Evidence

M11.0 genuine test-first missing-module RED (`ERR_MODULE_NOT_FOUND` for `calendar-preview.js`), then pure 8/8 GREEN; separate real SDK MCP tool-not-found RED (7 expected failures) before registrar, then new typed MCP 7/7 GREEN; prime capability/inventory tests RED before descriptor and tool registration, then 12/12 GREEN. No scheduler/publisher capability activated.

## Integration Test Evidence

Fresh Node24 **1,119/1,119 tests across 103 suites** with built STDIO and loopback HTTP smoke and actual raw SSE full wire bytes ≤256KiB, 56 real built tools. Full format/lint/typecheck/build/diff GREEN; independent cross-owner security re-review and remote PR/CI are PENDING.

## Security Review

For eventual execution: recheck live credentials/scopes/entitlements and trusted current approval at _execution time_; never carry a 5–10-minute approval grant forward to a future slot; enforce durable CAS/lease/claim, bounded retry and never auto-retry unknown remote outcomes. M11.0 contains **no execution**; read-only strict own-data, secret-safe errors and bounded raw HTTP SSE must pass independent review.

## Code Review Findings

Independent PURE calendar-preview security review signed off unresolved Critical=0 Important=0: 90/90 standalone hostile probes plus 8/8 focused tests, revoked/proxy/getter/accessor safety, real UTC minute/90-day bounds, deep freeze, source-only data and no IO. Complementary independent MCP/capability/transport review signed off Critical=0 Important=0 after built STDIO+HTTP 6/6, direct raw HTTP/SSE 22/22, private-store 13/13; 56 built tools, no `schedule.create`, no remote publishing. Do not mark remotely VERIFIED/MERGED before both scopes and exact-SHA feature/main CI.

## Fresh Verification Results

Node24 format, lint, typecheck, build and all 1,119 tests PASS locally in isolated `feat/m11-local-content-calendar` worktree; independent disjoint pure/MCP scopes Critical=0 Important=0; not yet GitHub feature/main CI.

## Durable Recovery Sources

PRD, capability matrix, M11 spec/plan, Git/PR/CI.

## Completion Checklist

- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

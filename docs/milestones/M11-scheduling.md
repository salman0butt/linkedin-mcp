# M11 — Scheduling & Automation

Status: **PLANNED**

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
Design/plan; scheduler state; execution/retry; calendar; integration; closeout.

## TDD Evidence
Pending.

## Integration Test Evidence
Pending.

## Security Review
Replay/idempotency, credential expiry, bounded retries/rates.

## Code Review Findings
Pending.

## Fresh Verification Results
Pending.

## Durable Recovery Sources
PRD, capability matrix, M11 spec/plan, Git/PR/CI.

## Completion Checklist
- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

# M04 — Comments & Engagement

Status: **PLANNED**

## Goal
Support capability-aware comment reading/replies, reactions and contextual engagement workflows.

## Dependencies
M02 verified; M03 not strictly required for text-only engagement.

## In Scope
Comments list/get/reply when permitted, reactions, unanswered inbox, contextual reply prompts.

## Out of Scope
Bulk outreach or pretending restricted reads are generally available.

## Acceptance Criteria
Permission-dependent behavior degrades explicitly; replies preserve parent context; consequential writes honor approval policy.

## Tasks / Iterations
Design/plan; comment contracts; provider permissions; reply flow; reactions; inbox; closeout.

## TDD Evidence
Pending.

## Integration Test Evidence
Pending.

## Security Review
Read/write scope boundaries, no spam, audit/idempotency as applicable.

## Code Review Findings
Pending.

## Fresh Verification Results
Pending.

## Durable Recovery Sources
PRD, capability matrix, M04 spec/plan, Git/PR/CI.

## Completion Checklist
- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

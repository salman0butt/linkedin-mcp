# M03 — Media Publishing

Status: **PLANNED**

## Goal
Add validated image and multi-image upload/publishing with media processing verification and accessibility metadata.

## Dependencies
M02 verified.

## In Scope
Image validation/upload/status, single/multi-image posts, alt text, retry/idempotency.

## Out of Scope
Unsupported media types or native article editor automation.

## Acceptance Criteria
Valid media publishes; invalid MIME/size fails safely; processing failure is explicit; post is verified.

## Tasks / Iterations
Design/plan; media contracts; upload provider; post integration; accessibility/verification.

## TDD Evidence
Pending.

## Integration Test Evidence
Pending.

## Security Review
MIME/size/path handling, secret-safe uploads, bounded media.

## Code Review Findings
Pending.

## Fresh Verification Results
Pending.

## Durable Recovery Sources
PRD, capability matrix, M03 spec/plan, Git/PR/CI.

## Completion Checklist
- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

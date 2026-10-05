# M01 — Authentication & Identity

Status: **PLANNED**

## Goal
Implement LinkedIn OAuth identity, scope/capability inspection, encrypted credential persistence, auth health and logout/revocation.

## Dependencies
M00 complete and post-merge `main` CI green.

## In Scope
OAuth flow, profile/me, scopes, token lifecycle, secret-safe persistence, capability refresh.

## Out of Scope
Publishing, search, browser automation, organization posting.

## Acceptance Criteria
Authenticated identity works with minimal scopes; credentials are protected; expiry/revocation are explicit; capability state is truthful.

## Tasks / Iterations
Design/plan at activation; OAuth; secure token storage; profile/me; auth diagnostics; security closeout.

## TDD Evidence
Pending.

## Integration Test Evidence
Pending.

## Security Review
OAuth/PKCE/CSRF, token encryption/redaction and minimal scopes required.

## Code Review Findings
Pending.

## Fresh Verification Results
Pending.

## Durable Recovery Sources
PRD, capability matrix, active M01 spec/plan, Git/PR/CI.

## Completion Checklist
- [ ] Acceptance criteria verified.
- [ ] Critical/Important findings resolved.
- [ ] Exact-final-head and post-merge CI green.

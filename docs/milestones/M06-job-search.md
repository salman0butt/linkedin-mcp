# M06 — Job Search

Status: **PLANNED**

## Goal
Provide structured LinkedIn-oriented job discovery with freshness, deduplication, canonical links and provider provenance.

## Dependencies
M00 provider model; M05 discovery lessons where reusable.

## In Scope
Search/filter/detail/recent/saved jobs and searches; date evidence; provider adapters; partner capability boundary.

## Out of Scope
Unapproved Talent partner APIs, fake sponsorship claims, automatic applications.

## Acceptance Criteria
Results carry source/confidence/freshness; stale/unverifiable dates are labeled; partner-only behavior never masquerades as public API.

## Tasks / Iterations
Design/plan; schemas; providers; freshness/dedupe; saved state; closeout.

## TDD Evidence
Pending.

## Integration Test Evidence
Pending.

## Security Review
No credential leakage or prohibited scraping/evasion; bounded search behavior.

## Code Review Findings
Pending.

## Fresh Verification Results
Pending.

## Durable Recovery Sources
PRD, capability matrix, M06 spec/plan, Git/PR/CI.

## Completion Checklist
- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

# M05 — Post Search

Status: **PLANNED**

## Goal
Deliver post/content discovery with explicit provider provenance and normalized result schemas.

## Dependencies
M00 provider model verified.

## In Scope
Topic/author/company/hashtag/recent search through legitimate configured providers, provenance/confidence/canonical URLs.

## Out of Scope
Claiming broad official LinkedIn search without evidence or bypassing platform controls.

## Acceptance Criteria
Every result identifies source/provider; filters are deterministic; unavailable providers fail transparently.

## Tasks / Iterations
Design/plan; normalized schema; discovery provider; optional interactive provider boundary; dedupe; closeout.

## TDD Evidence
Pending.

## Integration Test Evidence
Pending.

## Security Review
Provider terms/bounds, browser isolation if introduced, no stealth/rate evasion.

## Code Review Findings
Pending.

## Fresh Verification Results
Pending.

## Durable Recovery Sources
PRD, capability matrix, M05 spec/plan, Git/PR/CI.

## Completion Checklist
- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

# M02 — Text Publishing

Status: **PLANNED**

## Goal

Deliver safe text-post drafts, preview/approval, idempotent official-API publishing and downstream verification.

## Dependencies

M01 verified.

## In Scope

Drafts, preview tokens/payload identity, text post publish, verification, audit/idempotency.

## Out of Scope

Image/video/document publishing.

## Acceptance Criteria

No duplicate retry; approval policy enforced; final post identifier/URL verified; failures are structured.

## Tasks / Iterations

Design/plan; draft domain; approval; official provider; verification; closeout.

## TDD Evidence

Pending.

## Integration Test Evidence

Pending.

## Security Review

No token leakage; mutation authorization and idempotency mandatory.

## Code Review Findings

Pending.

## Fresh Verification Results

Pending.

## Durable Recovery Sources

PRD, capability matrix, M02 spec/plan, Git/PR/CI.

## Completion Checklist

- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

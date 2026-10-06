# M16 — Hosted Multi-Account

Status: **PLANNED**

## Goal

Harden the MCP for multi-user/multi-account remote operation with tenant isolation, remote OAuth and distributed coordination as justified.

## Dependencies

Core account capabilities stable and security model mature.

## In Scope

Multi-tenant storage, RBAC, remote OAuth, PostgreSQL/Redis only where concrete needs justify them, distributed locks, account isolation.

## Out of Scope

Premature microservices or infrastructure without measured need.

## Acceptance Criteria

Strong tenant/account isolation, least privilege, secure secrets, concurrency correctness and operational recovery.

## Tasks / Iterations

Design/plan; tenancy; remote auth; persistence; distributed concurrency; security/load closeout.

## TDD Evidence

Pending.

## Integration Test Evidence

Pending.

## Security Review

Tenant isolation, credentials, RBAC, CSRF/SSRF, distributed races.

## Code Review Findings

Pending.

## Fresh Verification Results

Pending.

## Durable Recovery Sources

PRD, capability matrix, M16 spec/plan, Git/PR/CI.

## Completion Checklist

- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

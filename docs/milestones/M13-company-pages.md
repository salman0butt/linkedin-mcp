# M13 — Company Pages

Status: **IMPLEMENTING** — M13.0 LOCAL_ONLY manual editorial handoff implementing; actual organization provider capability remains UNAVAILABLE.

## Goal

Support authorized LinkedIn organization/page identity, publishing, engagement and analytics through approved access.

## Dependencies

Identity/publishing foundations and organization/community access.

## In Scope

Organization capability discovery, page publishing, comments/reactions, analytics where permitted.

## Out of Scope

Unauthorized organization administration.

## Acceptance Criteria

Acting identity/authorization is explicit; writes require approval/idempotency; capability gaps are truthful.

## Tasks / Iterations

M13.0 first: locally prepare bounded caller-authored 1–5 company page post copy packages, no permission/publisher. Design `docs/superpowers/specs/2026-10-28-m13-local-organization-editorial-handoff-design.md` and plan of same date. Then M13.1 credential-bound verified org access, roles and entitlement; M13.2 conditional approval/idempotent publish; further engagement/analytics/closeout only with authorized provider.

## TDD Evidence

M13.0 genuine pure missing-module RED and typed real SDK absent-tool RED→GREEN. Node24 1,260/1,260 across 124 suites; independent pure and MCP/transport Critical0 Important0; remote PR/CI pending.

## Integration Test Evidence

67 compiled STDIO/HTTP tools; raw SSE including escaped 128-byte ID, complete paginated inventory and secret-field rejection passed locally. Full Node24 format/lint/typecheck/build/test GREEN; remote PR/main CI pending.

## Security Review

Organization authorization, actor identity, cross-account isolation remain blocked without verified provider entitlements. Independent pure 20,491+ hostile/random assertions and 11/11 tests Critical0 Important0; complementary compiled MCP/STDIO/HTTP audit Critical0 Important0. M13.0 does not request or assert authorization.

## Code Review Findings

Pending.

## Fresh Verification Results

Pending.

## Durable Recovery Sources

PRD, capability matrix, M13 spec/plan, Git/PR/CI.

## Completion Checklist

- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

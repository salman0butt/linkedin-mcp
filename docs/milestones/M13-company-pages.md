# M13 — Company Pages

Status: **IMPLEMENTING** — M13.0 LOCAL_ONLY manual editorial handoff VERIFIED/MERGED; M13.1 credential-bound organization role/access and actual provider publishing BLOCKED/UNAVAILABLE.

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

M13.0 genuine pure missing-module RED and typed real SDK absent-tool RED→GREEN. Node24 1,260/1,260 across 124 suites, independent pure and MCP/transport Critical0 Important0. GitHub [PR #29](https://github.com/salman0butt/linkedin-mcp/pull/29) feature `07599e1d151c3737f2c4cf995c408a88eca54a7f` CI `40679056408` SUCCESS; guarded squash main `e93d3c300b8e77317d93076d96c4eff392ded1de` tree `2f4cb2862470f3cdc539736c25f65e494b0d1c90` separate push CI `40679432769` SUCCESS.

## Integration Test Evidence

67 compiled STDIO/HTTP tools; raw SSE including escaped 128-byte ID, complete paginated inventory and secret-field rejection passed locally. Full Node24 format/lint/typecheck/build/test GREEN; exact feature/main CI SUCCESS.

## Security Review

Organization authorization, actor identity, cross-account isolation remain blocked without verified provider entitlements. Independent pure 20,491+ hostile/random assertions and 11/11 tests Critical0 Important0; complementary compiled MCP/STDIO/HTTP audit Critical0 Important0. M13.0 does not request or assert authorization.

## Code Review Findings

Two independent read-only security reviews Critical0 Important0. An initially failed feature CI `40677507731` revealed an unawaited SDK handshake closed by raw test teardown, corrected with direct handler and independent RED reproduction. Final exact-head feature CI and distinct merged-main push CI succeeded.

## Fresh Verification Results

[PR #29](https://github.com/salman0butt/linkedin-mcp/pull/29) feature `07599e1d151c3737f2c4cf995c408a88eca54a7f` CI `40679056408` SUCCESS; guarded squash main `e93d3c300b8e77317d93076d96c4eff392ded1de` tree `2f4cb2862470f3cdc539736c25f65e494b0d1c90` separate push CI `40679432769` SUCCESS. M13.0 is only a stateless manual draft package; M13.1 role/actor verification, approval and any provider write remain blocked.

## Durable Recovery Sources

PRD, capability matrix, M13 spec/plan, Git/PR/CI.

## Completion Checklist

- [x] M13.0 local-only acceptance verified; M13 overall not complete.
- [x] M13.0 Critical/Important resolved (0/0).
- [x] M13.0 exact-final-head/post-merge CI green.
- [ ] Provider-backed organization identity/role and entitlement verified.
- [ ] Organization publishing and engagement authorization verified.

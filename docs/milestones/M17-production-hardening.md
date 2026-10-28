# M17 — Production Hardening

Status: **PLANNED overall** — **M17.0 OAuth callback lifecycle VERIFIED/MERGED**; full M17/v1.0 closeout still depends on other milestones and broader production-hardening requirements.

## Goal

Complete v1.0 security, reliability, compatibility, documentation, packaging and operational hardening.

## Dependencies

All required prior product milestones resolved.

## In Scope

Threat model, dependency/security audit, load/reliability tests, migration/API-version tests, provider-failure tests, MCP-client compatibility, packaging/Docker/docs/release automation.

## Out of Scope

New major product capabilities unrelated to v1.0 closeout.

## Acceptance Criteria

Required roadmap traceability has no unexplained gaps; security/reliability gates pass; exact-final-state CI green; release docs/package are truthful.

## Tasks / Iterations

Design/plan; threat/security audit; compatibility; resilience/load; docs/package; final review/verification.

### M17.0 — OAuth callback listener availability (scoped)

- Design: `docs/superpowers/specs/2026-10-28-m17-oauth-callback-lifecycle-design.md`; plan: `docs/superpowers/plans/2026-10-28-m17-oauth-callback-lifecycle.md`.
- Exact base: `main` `cef8e9791c6fad6fdb56c2242340e7e437f3f88f`, M13 docs closeout PR #30, main push CI `40680570366` SUCCESS.
- Reproduced local availability DoS: unrelated half-open loopback HTTP client blocks `server.close()` after valid callback code consumed and timeout cleared; result remains pending, preventing token exchange. Terminal callback failures also blocked.
- Minimal fix: terminate remaining HTTP sockets after the callback response has flushed; force teardown on timeout and explicit close. Preserve state/PKCE validation, responses and provider boundaries.
- Genuine Node24 TCP behavior RED `expected 'settled', received 'blocked'` before change; GREEN after. Full local Node24 **1,264/1,264** tests in **124** suites, framework **14/14**, format/lint/typecheck/build and real compiled STDIO/HTTP GREEN. Independent post-fix security review **Critical 0 / Important 0**; remote feature and main-push CI verified as below.

## TDD Evidence

M17.0 real loopback held partial-header regression demonstrated RED on base; 18/18 focused auth/lifecycle tests GREEN after fix.

## Integration Test Evidence

Local 1,264/1,264 complete suite, includes compiled STDIO/HTTP 67-tool inventory, ≤96KiB pages, ≤256KiB HTTP responses and private STDIO-only state isolation; 14/14 framework.

## Security Review

M17.0 independent read-only reviewer: scoped **Critical 0 / Important 0**, 40 actual TCP terminal/timeout/close scenarios, 24 proven held incomplete-header sockets, 12 keep-alive controls, 18 abort-before-processing and 18 close/success races, zero unhandled and complete 200/400 responses. No token, scope, actor or provider capability changes. Full product threat model and dependency/secret/access review remain required for _overall_ M17.

## Code Review Findings

M17.0 scoped callback fix has no unresolved Critical/Important finding. Independently reproduced read-only _other_ HTTP transport risks (nonfinite request-body limit option, delayed oversized-stream rejection and batch buffering beyond final response limit) remain separate M17 future tasks, not changes or provider capabilities included in PR #31.

## Fresh Verification Results

M17.0 [PR #31](https://github.com/salman0butt/linkedin-mcp/pull/31): exact feature `c8b42f6fe895d246d4ad81e44cd6adf161c6cc26`, tree `bec90faffd7761c6756e39bf530b187bcb6790db`, 318/318 GitHub blobs identical to local, exact feature CI `40687205091` **SUCCESS**. Guarded squash `main` `7ad4f38f0280cfa99b7f2d1ef3cd5eeb99c2f031`, parent `cef8e9791c6fad6fdb56c2242340e7e437f3f88f`, identical tree `bec90faf...`; separate `push` CI `40687526120` **SUCCESS**, exact merged-main SHA. M17.0 **VERIFIED/MERGED**; M17 overall remains PLANNED.

## Durable Recovery Sources

PRD, capability matrix, M17 spec/plan, Git/PR/CI.

## Completion Checklist

- [ ] All required PRD items resolved.
- [ ] Critical/Important findings resolved.
- [ ] Exact-final-state CI green.
- [ ] v1.0 documentation/package verified.

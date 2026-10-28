# M17 — Production Hardening

Status: **PLANNED overall** — M17.0 OAuth callback lifecycle hardening implemented locally; full M17/v1.0 closeout still depends on other milestones and release verification.

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
- Genuine Node24 TCP behavior RED `expected 'settled', received 'blocked'` before change; GREEN after. Full local Node24 **1,264/1,264** tests in **124** suites, framework **14/14**, format/lint/typecheck/build and real compiled STDIO/HTTP GREEN. Independent security and exact remote CI verification are separate release gates.

## TDD Evidence

M17.0 real loopback held partial-header regression demonstrated RED on base; 18/18 focused auth/lifecycle tests GREEN after fix.

## Integration Test Evidence

Local 1,264/1,264 complete suite, includes compiled STDIO/HTTP 67-tool inventory, ≤96KiB pages, ≤256KiB HTTP responses and private STDIO-only state isolation; 14/14 framework.

## Security Review

Full product threat model and dependency/secret/access review required.

## Code Review Findings

Pending.

## Fresh Verification Results

Pending.

## Durable Recovery Sources

PRD, capability matrix, M17 spec/plan, Git/PR/CI.

## Completion Checklist

- [ ] All required PRD items resolved.
- [ ] Critical/Important findings resolved.
- [ ] Exact-final-state CI green.
- [ ] v1.0 documentation/package verified.

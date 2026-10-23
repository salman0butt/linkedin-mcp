# M06 — Job Search

Status: **ACTIVE — M06.1 canonical job contract**, branch `feat/m06-job-search`, base main `01fb37d3b762f2b1775c8845daba61c98054d6ed` (post-merge CI `39920255603` GREEN).

Design: `docs/superpowers/specs/2026-10-23-m06-job-search-design.md`. Plan: `docs/superpowers/plans/2026-10-23-m06-job-search.md`.

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

M06.1 canonical query/normalization; M06.2 freshness filter/dedupe; M06.3 trusted provider routing and details; M06.4 MCP and real transports; M06.5 local saved jobs/searches; M06.6 independent closeout/merge. No provider or Talent API entitlement configured by default.

## TDD Evidence

M06.1: seven focused contract tests observed genuine RED from the missing core module before implementation. Now seven focused GREEN; 654/654 full tests in 72 files, real stdio/HTTP smokes, lint, typecheck, formatting and build GREEN locally (Node 24, macOS `TMPDIR=/private/tmp`). Validated strict canonical search, source attribution, and unknown/reported/trusted-bound verified date evidence. Independent security review identified three Important defects: aliases of credential query parameters leaked in links; a verified date could omit canonical URL binding even when a job carried a canonical URL; and known dynamic-IP wildcard hosts were not screened. Each was reproduced as focused RED then repaired to GREEN; a pure normalizer does not resolve DNS, and network adapters require their own per-hop DNS/redirect checks. No live job provider or Talent entitlement installed. Final reviewer sign-off and remote exact-head CI pending.

Exact next work: finish independent M06.1 review, save the first draft M06 PR, verify CI and begin M06.2 freshness/dedupe.

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

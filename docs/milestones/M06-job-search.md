# M06 — Job Search

Status: **ACTIVE — M06.2 local freshness and dedupe**, branch `feat/m06-job-search`, draft PR #9, base main `01fb37d3b762f2b1775c8845daba61c98054d6ed` (post-merge CI `39920255603` GREEN).

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

M06.1 remote verification: commit `8fb06bb26055af7e3ac23f004dbf4461c269f3a8`, CI `39923182814` GREEN **654/654 tests in 72 files** plus frozen install, formatting, lint, typecheck and build. Independent M06.1 review closed all three Important findings with RED→GREEN tests; no additional confirmed Critical/Important issues.

M06.2 local RED→GREEN: new `job-search-filter.ts` and 11 focused tests, initial missing-module RED, plus two further verified RED regressions for duplicate reported/verified dates and conflicting verified attestations. Now source-scoped candidates are filtered by explicit sourced criteria before grouping, stronger independently verified evidence outranks unverified data before `postedSince` filtering and unique-count statistics, and conflicting verified dates are omitted with explicit incomplete-coverage evidence. Recent sorting groups verified, reported and unknown dates separately, while relevance sorting preserves stable input order. Provider completeness remains owned by M06.3, never inferred from local empty results. Full local **665/665 tests across 73 files**, real stdio/HTTP smoke, lint, typecheck, format and build GREEN; exact-head CI pending.

Exact next work: persist M06.2 to draft PR #9 and verify CI, then implement M06.3 provider routing and details.

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

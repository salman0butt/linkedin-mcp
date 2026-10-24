# M06 — Job Search

Status: **COMPLETE — PR #9 squash-merged**, main SHA `0ff384ae5deb03b504259dc3f5519c8209c3e8f8`, post-merge GitHub CI `40077809706` GREEN (2026-10-24).

Design: `docs/superpowers/specs/2026-10-23-m06-job-search-design.md`. Plan: `docs/superpowers/plans/2026-10-23-m06-job-search.md`.

**Final authoritative closeout (supersedes historical pending checkpoints below):** Independent M06.6 whole-branch review PASS with zero verified outstanding Critical/Important findings. Exact feature PR head `dc7b07d6eb4ed5f831cd7cd23dd752d1d522d588` passed CI run `40077649195`, 713/713 tests across 77 files plus format, lint, types and build. PR #9 was squash-merged at `0ff384ae5deb03b504259dc3f5519c8209c3e8f8`; post-merge main CI `40077809706` passed all gates. Real STDIO/HTTP tests include saved snapshot persistence and HTTP isolation. No live authorized Talent/job provider entitlement is configured; default job search remains unavailable. The M06 saved snapshot source is explicitly unverified. M07 starts on a new branch.

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

M06.2 remote verification: commit `50964e8cb7fce7feaf17dbcbf3c9e792b2d2df8b`, CI `39926241255` GREEN. M06.3 and M06.4 now cover trusted-source router/details, verified posting-date evidence, explicit coverage, 39 strict MCP tools total, truthful default unavailable and partial semantics. M06.5 implements eight opt-in local saved job/search operations, readback and file-system permissions, HTTP isolation and real STDIO restart persistence. Independent scoped reviewers proved and fixed four provider search Important issues (secret metadata propagation, sort coverage, multi-term false empty, toJSON response-size masking), plus three saved-state Important issues (caller-verified date laundering, UID check, symlink-parent swap). Each has a focused genuine RED before fix and GREEN afterward. M06.4 invalid canonical `postedSince` also has a RED→GREEN invalid_input taxonomy fix.

Full integrated local verification: **708/708 tests across 77 files, all Prettier, ESLint, TypeScript, build and real STDIO/HTTP smoke tests GREEN**, run 2026-10-23 with macOS `TMPDIR=/private/tmp`. This is local only; exact-new-head GitHub CI and M06.6 whole-branch signoff remain pending. No legitimate live search provider or Talent product entitlement is bundled.

Exact next work: finish M06.6 whole-branch review and fix any remaining confirmed Critical/Important finding, then persist existing PR #9 and inspect exact-final-head CI before merging.

M06.6 follow-up review (2026-10-24): prior PR #9 commit `954fc4a` passed GitHub quality CI `39942712314`. Independent review found three further Important issues, each demonstrated by a focused failing regression before being corrected: provider-attested semantic/region filters and sparse workplace/employment fields lost legitimate results; accessor-backed provider metadata disappeared during cloning; and user-submitted saved snapshots could forge partner provenance, source evidence and trusted confidence. Snapshot saving now rejects elevated assertions and gives all caller snapshots the explicit `Unverified user-supplied snapshot` source label. It preserves source IDs only as local lookup keys and never accepts saved verified posting-date claims. The revised local tree passes **713/713 tests across 77 files** with real STDIO/HTTP smoke, Prettier, ESLint and TypeScript. Independent re-review and final new-head CI still gate merge.

## Integration Test Evidence

Local real STDIO and loopback HTTP verify job search/get unavailable by default, strict args and saved data HTTP isolation. A second STDIO process reads the same local 0600 saved-job/search store and preserves idempotent `savedAt` metadata. The private store tests cover 500 jobs/50 searches/2 MiB, lock contention, malformed/corrupt bytes, file/dir ownership and symlink/hardlink restrictions, interrupted tmp files and persisted readback.

## Security Review

Independent scoped audits covered M06.3 provider evidence/coverage, M06.4 MCP source routing and M06.5 local persistence. Important findings were reproduced RED and fixed GREEN. No unsupported LinkedIn Talent entitlement, arbitrary caller URL/credentials, or scraping is enabled. The remaining M06.5 filesystem pathname race after pin/revalidation requires a process with this same private 0700 directory's OS UID or privileged root; that principal already has independent local file access. Node pathname API is not an atomic openat replacement; record this low-impact hardening limitation in `docs/progress/KNOWN-ISSUES.md`. Final integrated review pending.

## Code Review Findings

M06.3: source metadata leakage via adapter coverage extras; false recent-sort completeness for undated rows; multi-term keyword false-empty; custom `toJSON` hiding overlarge results. M06.4: malformed `postedSince` was categorized as a generic provider failure, now `invalid_input`. M06.5: client-submitted verified posting-date laundering, ineffective strict file UID check, and parent-directory swap redirection. Every confirmed defect reproduced and fixed by targeted RED→GREEN. Reviewers found no new C/I in scoped follow-up; awaiting final whole-branch signoff.

## Fresh Verification Results

Local 708/708 GREEN in 77 files plus Prettier, lint, TypeScript, build, actual STDIO persistence and HTTP transport smoke; remote new-head PR CI pending.

## Durable Recovery Sources

PRD, capability matrix, M06 spec/plan, Git/PR/CI.

## Completion Checklist

- [x] Acceptance verified locally with real transports and default provider unavailability.
- [x] Critical/Important resolved; independent whole-branch review passed.
- [x] Exact-final-head CI `40077649195` and post-merge main CI `40077809706` green.

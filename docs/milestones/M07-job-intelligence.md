# M07 — Job Intelligence

Status: **REVIEW — M07.1–6 locally GREEN; M07.7 final review and exact-new-head CI pending**, draft PR #10, branch `feat/m07-job-intelligence`, based on M06 verified main `0ff384ae5deb03b504259dc3f5519c8209c3e8f8`.

Design: `docs/superpowers/specs/2026-10-24-m07-job-intelligence-design.md`. Plan: `docs/superpowers/plans/2026-10-24-m07-job-intelligence.md`.

## Goal

Add requirement extraction, fit analysis, comparison, company context and relocation/visa signal analysis over sourced job data.

## Dependencies

M06 verified.

## In Scope

Structured requirements, local/host-model scoring prompts, comparison, evidence-backed relocation/sponsorship classification.

## Out of Scope

Invented sponsorship/eligibility, consequential hiring decisions, automatic application submission.

## Acceptance Criteria

Analysis distinguishes sourced facts from inference; gaps/uncertainty are explicit; comparisons are reproducible.

## Tasks / Iterations

M07.1 strict caller snapshot and candidate input contract; M07.2 exact-span requirement extraction; M07.3 relocation/visa/company signals; M07.4 deterministic candidate fit; M07.5 multi-job comparison; M07.6 strict read-only MCP tools and real transports; M07.7 independent security review and closeout.

## TDD Evidence

M07.2–6 follow-up (2026-10-24): requirement extraction, source-quoted employment/relocation/visa signals, deterministic 3:1 explicit-skill advisory fit, source-scoped comparison and read-only MCP tools are implemented locally. Each new module began with observed missing-module RED then GREEN. Important review defects were reproduced RED-to-GREEN: missing mandatory Python/authorization/language/preferred and role-qualified clauses inflated scores; unsupported mandatory synonyms in DESCRIPTION and TITLE now suppress numeric scoring, while neutral role titles do not; multi-sentence quoted third-party qualifications cannot be promoted to employer requirements. Separate authorization and mandatory location-field signals suppress misleading fit scores. Applicant-only restrictions and remote/visa exclusions (France, Pakistan, arbitrary non-whitelisted scopes) conflict with or invalidate unqualified worldwide/sponsorship yes; role nouns such as `applicants` are never fabricated as jurisdictions and original evidence spans include actual places. Overlong skipped clauses, customer/training comparisons with later restrictions, unclassified qualifiers, and multi-sentence ASCII/smart-quoted competitor claims now fail closed with `unknown` and bounded exact UTF-16 evidence rather than invented positive/negative claims. MCP output has strict typed schemas and a bounded complete envelope. Built STDIO/HTTP both call analyze and compare and keep HTTP saved-state isolated. Integrated local **902/902 tests in 83 files GREEN**, final reviewer closeout/new-head CI pending.

M07 design checkpoint commit `3e96a8f` GitHub CI `40078888401` GREEN. M07.1 test module was first observed RED with missing `job-intelligence` module, then GREEN for strict source and candidate contracts. Independent reviewers identified and reproduced Important regressions involving proxy traps, empty skill profiles, overlong padded raw strings, Unicode case-fold expansion, padded opaque source IDs and padded oversized canonical URLs; focused RED→GREEN tests were added. Both independent M07.1 code reviewers signed off with zero verified unresolved Critical/Important findings. Current local **724/724 tests in 78 files**, format, lint and TypeScript GREEN; new-head GitHub CI pending.

## Integration Test Evidence

Built STDIO and loopback HTTP MCP clients invoke both analyze and compare without a configured jobs provider. Both tools show caller-supplied provenance, source-scoped identities, explicit evidence spans and deterministic skill-only scores. Existing local saved job storage remains inaccessible over HTTP. Tests also check an oversized MCP compare response fails closed with sanitized error.

## Security Review

Input sources and dates are explicitly unverified caller snapshots; jobs are inert plain text, never tool instructions. Candidate profiles are transient and excluded from responses. Work authorization, immigration eligibility, sponsorship and global-remote commitments require explicit quoted evidence; conflicting location/residency conditions cannot be presented as affirmative eligibility. Independent final M07.7 review is still in progress.

## Code Review Findings

Regressions found and repaired locally in source/provenance normalization, missed mandatory qualification parsing, separate legal authorization score gating, source-location/visa conditionality, output-schema typing and response size. Final independent zero Critical/Important signoff pending.

## Fresh Verification Results

Local 902/902 GREEN across 83 test files, real STDIO/HTTP smoke, compiler, lint, whole-tree formatting and build checks. Previous M07.1 exact-head CI 40080270039 GREEN; final combined GitHub CI pending.

## Durable Recovery Sources

PRD, capability matrix, dated M07 design/plan above, Git/PR/CI.

## Completion Checklist

- [x] Acceptance locally verified with actual STDIO/HTTP transports and deterministic tests.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

# M07 — Job Intelligence

Status: **COMPLETE — M07.1–M07.7 independently reviewed, merged and post-merge CI verified**. PR #10 squash-merged at `80b563293e48afd878158bcd2ee40553997ecb42`; exact feature-head `7f874292d10e3a649fc2e7b218a9261982b0b2ff` CI `40089032116` GREEN, exact post-merge main CI `40089200098` GREEN (902 tests, 83 files).

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

M07.2–6 follow-up (2026-10-24): requirement extraction, source-quoted employment/relocation/visa signals, deterministic 3:1 explicit-skill advisory fit, source-scoped comparison and read-only MCP tools were implemented. Each new module began with observed missing-module RED then GREEN. Important review defects were reproduced RED-to-GREEN: missing mandatory Python/authorization/language/preferred and role-qualified clauses inflated scores; unsupported mandatory synonyms in DESCRIPTION and TITLE now suppress numeric scoring, while neutral role titles do not; multi-sentence quoted third-party qualifications cannot be promoted to employer requirements. Separate authorization and mandatory location-field signals suppress misleading fit scores. Applicant-only restrictions and remote/visa exclusions (France, Pakistan, arbitrary non-whitelisted scopes) conflict with or invalidate unqualified worldwide/sponsorship yes; role nouns such as `applicants` are never fabricated as jurisdictions and original evidence spans include actual places. Overlong skipped clauses, customer/training comparisons with later restrictions, unclassified qualifiers, and multi-sentence ASCII/smart-quoted competitor claims now fail closed with `unknown` and bounded exact UTF-16 evidence rather than invented positive/negative claims. MCP output has strict typed schemas and a bounded complete envelope. Built STDIO/HTTP both call analyze and compare and keep HTTP saved-state isolated. Integrated **902/902 tests in 83 files GREEN**, independently reviewed, and both GitHub feature/main CI gates passed.

M07 design checkpoint commit `3e96a8f` GitHub CI `40078888401` GREEN. M07.1 test module was first observed RED with missing `job-intelligence` module, then GREEN for strict source and candidate contracts. Independent reviewers identified and reproduced Important regressions involving proxy traps, empty skill profiles, overlong padded raw strings, Unicode case-fold expansion, padded opaque source IDs and padded oversized canonical URLs; focused RED→GREEN tests were added. Both independent M07.1 code reviewers signed off with zero verified unresolved Critical/Important findings. At the M07.1 checkpoint **724/724 tests in 78 files** passed; checkpoint head `1d0ac1d` CI `40080270039` GREEN.

## Integration Test Evidence

Built STDIO and loopback HTTP MCP clients invoke both analyze and compare without a configured jobs provider. Both tools show caller-supplied provenance, source-scoped identities, explicit evidence spans and deterministic skill-only scores. Existing local saved job storage remains inaccessible over HTTP. Tests also check an oversized MCP compare response fails closed with sanitized error.

## Security Review

Input sources and dates are explicitly unverified caller snapshots; jobs are inert plain text, never tool instructions. Candidate profiles are transient and excluded from responses. Work authorization, immigration eligibility, sponsorship and global-remote commitments require explicit quoted evidence; conflicting location/residency conditions cannot be presented as affirmative eligibility. Independent final M07.7 security/correctness audit signed off with **0 unresolved Critical and 0 unresolved Important findings**, including direct adversarial reproduction of quoted claims, title/description/location mandates, unqualified worldwide remote/visa claims, exact UTF-16 source quotes and source/date forgery.

## Code Review Findings

Regressions found and repaired in source/provenance normalization, missed mandatory qualification parsing, quote-state/attribution, separate authorization/location score gating, applicant-specific and regional remote/visa conditionality, output-schema typing and response size. Final independent scoped **Critical=0, Important=0**; all PR and main CI gates passed.

## Fresh Verification Results

Local and GitHub CI **902/902 GREEN across 83 test files**, real STDIO/HTTP smoke, compiler, lint, whole-tree formatting, frozen install and build checks. Final-feature SHA `7f874292d10e3a649fc2e7b218a9261982b0b2ff`, run `40089032116` SUCCESS; squash-merged main SHA `80b563293e48afd878158bcd2ee40553997ecb42`, run `40089200098` SUCCESS.

## Durable Recovery Sources

PRD, capability matrix, dated M07 design/plan above, Git/PR/CI.

## Completion Checklist

- [x] Acceptance locally verified with actual STDIO/HTTP transports and deterministic tests.
- [x] Critical/Important resolved; independent M07.7 audit signed off.
- [x] Exact-final-head/post-merge CI green; PR #10 squash-merged.

# M07 — Job Intelligence

Status: **IMPLEMENTING — M07.1 contracts locally GREEN, M07.2 requirement extraction next**, draft PR #10, branch `feat/m07-job-intelligence`, based on M06 verified main `0ff384ae5deb03b504259dc3f5519c8209c3e8f8`.

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

M07 design checkpoint commit `3e96a8f` GitHub CI `40078888401` GREEN. M07.1 test module was first observed RED with missing `job-intelligence` module, then GREEN for strict source and candidate contracts. Independent reviewers identified and reproduced Important regressions involving proxy traps, empty skill profiles, overlong padded raw strings, Unicode case-fold expansion, padded opaque source IDs and padded oversized canonical URLs; focused RED→GREEN tests were added. Both independent M07.1 code reviewers signed off with zero verified unresolved Critical/Important findings. Current local **724/724 tests in 78 files**, format, lint and TypeScript GREEN; new-head GitHub CI pending.

## Integration Test Evidence

Pending.

## Security Review

Minimize candidate/profile data and prevent prompt/tool injection through job text.

## Code Review Findings

Pending.

## Fresh Verification Results

Pending.

## Durable Recovery Sources

PRD, capability matrix, dated M07 design/plan above, Git/PR/CI.

## Completion Checklist

- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

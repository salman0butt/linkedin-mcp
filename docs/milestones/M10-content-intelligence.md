# M10 — Research & Content Intelligence

Status: **IMPLEMENTING — M10.0 verified/merged at PR #16 with exact feature and main CI success; M10.1 caller-defined theme grouping locally implemented, independent review and remote PR/CI pending.**

## Goal

Add sourced topic research, trend/theme clustering, content-gap analysis, reference management and content recommendations.

## Dependencies

M05 post discovery where LinkedIn content is used; external research providers may operate independently.

## In Scope

Topic research, references, clustering, content gaps, competitor/theme comparison, repurposing inputs.

## Out of Scope

Fabricated trends or unattributed source claims.

## Acceptance Criteria

Insights trace to sources/providers; uncertainty and freshness are explicit; repeated ideas can be identified.

## Tasks / Iterations

M10.0 is VERIFIED/MERGED: strict unverified caller-corpus normalization, deterministic literal topic/focus coverage with UTF-16 source spans, exact duplicate body grouping, and typed `linkedin.research.analyze` MCP integration over real STDIO/HTTP. Independent security and integration reviewers signed off with zero unresolved Critical or Important findings after targeted RED→GREEN repairs. This slice performs no theme mining, automated clustering, content-gap analysis, competitor verification, provider-backed research, trend detection, or publication.

M10.1 local implementation on isolated `feat/m10-local-theme-grouping` includes strict caller-defined labels/phrases, deterministic source-ordered literal UTF-16 evidence projection from the existing analyzer, bounded pure output and a distinct typed `linkedin.research.group_themes` over built STDIO/HTTP. Genuine RED→GREEN fixes reject Unicode regex case-equivalence collisions and hidden single-line separator characters. No autonomous semantic theme inference, trend statistics, market gaps or external retrieval may be claimed; independent final review, exact feature-head and main CI remain pending.

Later M10 iterations still require an authorized external research provider, evidenced retrieval provenance, source-aware clustering/gap/competitor research design and tests, and milestone closeout.

## TDD Evidence

M10.0 core, analysis and MCP tests exercised missing module/tool registration, URL canonical expansion and credential aliases, SDK secret-bearing unknown-key errors, Unicode word boundaries, output overflows and host metadata limits as genuine RED→GREEN cases. The final Node24 full-suite run on 2026-10-26 passed **1,043/1,043 tests in 93 suites** with format, lint, typecheck, build and framework validation GREEN.

M10.1 missing pure module and MCP tool were separately reproduced RED, then repaired GREEN. The initial full local Node24 suite passed **1,055/1,055 in 95 suites**; after Unicode case-equivalence tests it passed **1,056/1,056**, and after correcting a separate Unicode topic/phrase false-evidence mapping regression, the **final full suite passed 1,057/1,057 tests across 95 suites** with all quality, framework and real built transport gates green. Unicode single-line separator and topic equivalence edge cases were genuine RED→GREEN repairs, not content truncations.

## Integration Test Evidence

Built real STDIO and loopback HTTP processes both invoked `linkedin.research.analyze` and verified `LOCAL_ONLY`, original UTF-16 evidence spans and source-provenance fidelity. Actual HTTP raw SSE POST of a large valid caller corpus produced 200 and a bounded 3,661-byte SSE response with no body echo; full SSE budget <=256 KiB. Remote exact feature-head and post-merge CI passed for M10.0 only.

## Security Review

Independent core/analyzer/MCP security review and separate integration/documentation review independently signed off **Critical=0, Important=0** after reproducing and repairing secret-bearing SDK validation messages, encoded URL credentials and controls, canonical URL growth, Unicode term boundaries, oversized host request IDs and traceability status validation. No M10 provider, DNS or external research service was activated.

## Code Review Findings

Both M10.0 reviewer scopes signed off with zero unresolved Critical/Important findings on the amended source and built transport integrations. Exact feature-head and post-merge main CI passed. M10.1 requires its own fresh independent review after implementation.

## Fresh Verification Results

M10.0 PR [#16](https://github.com/salman0butt/linkedin-mcp/pull/16): exact feature commit `bb84e6e02656313e33dba5d992d8cfbcc9279706`, CI `40293170065` SUCCESS. Squash-merged `main` `865fd9fb4cd5ccd8438ef7a89f9bc08f3fb600df`, identical Git tree `38629469b6449be0883c6bbe122c8951b4b3d0ac`, exact push CI `40293411451` SUCCESS. Active M10.1 branch is local and has no feature CI or PR yet.

## Durable Recovery Sources

PRD, capability matrix, `docs/superpowers/specs/2026-10-25-m10-content-research-design.md`, `docs/superpowers/plans/2026-10-25-m10-content-research.md`, Git/PR/CI. `linkedin.research.analyze` is a pending-verification `LOCAL_ONLY` candidate on caller-supplied unverified material; `research.topic` stays `EXTERNAL_DISCOVERY` / `UNAVAILABLE` without a provider. M09 manual handoff stays VERIFIED; native publication remains BLOCKED/UNAVAILABLE.

## Completion Checklist

- [x] M10.0 local acceptance and exact feature/post-merge CI verified.
- [x] Independent scoped Critical/Important findings resolved.
- [ ] Broader M10 tasks, M10.1 implementation and final milestone closeout.

# M10 — Research & Content Intelligence

Status: **IMPLEMENTING — M10.0 local implementation reviewed with zero unresolved Critical/Important findings; feature PR, exact feature-head CI and merged-main CI pending.**

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

M10.0 design and implementation plan are written. Local uncommitted implementation includes strict unverified caller-corpus normalization, deterministic literal topic/focus coverage with UTF-16 source spans, exact duplicate body grouping, and typed `linkedin.research.analyze` MCP integration for STDIO/HTTP. Independent security and integration reviewers signed off with zero unresolved Critical or Important findings after targeted RED→GREEN repairs. This slice does not perform theme mining, automated clustering, content-gap analysis, competitor verification, provider-backed research, trend detection, or publication.

Later M10 iterations still require an authorized external research provider, evidenced retrieval provenance, source-aware clustering/gap/competitor research design and tests, and milestone closeout.

## TDD Evidence

M10.0 core, analysis and MCP tests exercised missing module/tool registration, URL canonical expansion and credential aliases, SDK secret-bearing unknown-key errors, Unicode word boundaries, output overflows and host metadata limits as genuine RED→GREEN cases. Node24 full-suite test run on 2026-10-26 passed **1,043/1,043 tests in 93 suites**; final post-document-edit gates still require confirmation.

## Integration Test Evidence

Built real STDIO and loopback HTTP processes both invoked `linkedin.research.analyze` and verified `LOCAL_ONLY`, original UTF-16 evidence spans and source-provenance fidelity. Actual HTTP raw SSE POST of a large valid caller corpus produced 200 and a bounded 3,661-byte SSE response with no body echo; full SSE budget <=256 KiB. No remote feature-head CI exists.

## Security Review

Independent core/analyzer/MCP security review and separate integration/documentation review independently signed off **Critical=0, Important=0** after reproducing and repairing secret-bearing SDK validation messages, encoded URL credentials and controls, canonical URL growth, Unicode term boundaries, oversized host request IDs and traceability status validation. No M10 provider, DNS or external research service was activated.

## Code Review Findings

Both M10 reviewer scopes signed off with zero unresolved Critical/Important findings on the amended local source and built transport integrations. Final exact-feature-head CI and post-merge main CI remain required before the scoped capability is VERIFIED.

## Fresh Verification Results

Baseline verified `main` is `2a71c5ef402a19cdf6a7f340e5e28134c9980793`, CI `40220317041` SUCCESS. Active `feat/m10-content-intelligence` is local-only and uncommitted; its final SHA, PR, feature CI and post-merge main CI are pending.

## Durable Recovery Sources

PRD, capability matrix, `docs/superpowers/specs/2026-10-25-m10-content-research-design.md`, `docs/superpowers/plans/2026-10-25-m10-content-research.md`, Git/PR/CI. `linkedin.research.analyze` is a pending-verification `LOCAL_ONLY` candidate on caller-supplied unverified material; `research.topic` stays `EXTERNAL_DISCOVERY` / `UNAVAILABLE` without a provider. M09 manual handoff stays VERIFIED; native publication remains BLOCKED/UNAVAILABLE.

## Completion Checklist

- [x] Local acceptance tests passed; remote feature and post-merge acceptance pending.
- [x] Independent scoped Critical/Important findings resolved.
- [ ] Exact-final-head/post-merge CI green.

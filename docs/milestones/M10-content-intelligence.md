# M10 — Research & Content Intelligence

Status: **IMPLEMENTING — M10.0, M10.1 and M10.2 VERIFIED/MERGED via PRs #16/#17/#18 and exact feature/main CI; M10.3 caller-defined two-cohort comparison VERIFIED/MERGED; M10.4 human-curated literal excerpt packs VERIFIED/MERGED via PR #20 with independent Critical=0 Important=0 and exact feature/main CI; provider-backed research unavailable.**

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

M10.1 **VERIFIED/MERGED** via PR #17: strict caller-defined labels/phrases, deterministic source-ordered literal UTF-16 evidence projection from the existing analyzer, bounded pure output and typed `linkedin.research.group_themes` over built STDIO/HTTP. Genuine RED→GREEN fixes reject Unicode regex case-equivalence collisions, lowercase-only false quote attribution and hidden U+2028/U+2029 separators. Independent final Critical=0 Important=0; exact feature CI `40300253462` SUCCESS and main push CI `40300553498` SUCCESS. No semantic clustering, trend statistics, verified market gaps or retrieval is claimed.

M10.2 local implementation adds strict `indexResearchReferences`/typed `linkedin.research.index_references`, caller-only canonical display-URL repeated/single-source mapping, unverified provenance and caller-reported dates without body echo. No topic/focus is required; no URL retrieval, source attestation, persistence, networking or publishing. New pure and MCP tests were genuinely RED on missing module/tool before GREEN; local full Node24 suite is 1,074/1,074 across 97 suites with required gates and built STDIO/HTTP 6/6. Independent pure and MCP/transport reviews signed off Critical=0 Important=0, feature PR #18 CI `40304586073` SUCCESS and main push CI `40304868402` SUCCESS, exact main `e7be937961f138a7df769c5a63dba7646d0fface`. Broader M10 requires authorized providers for discovered references, verified research, trend/gap/competitor inference and milestone closeout.

M10.3 **VERIFIED/MERGED**: strict `compareResearchCohorts` reuses one inherited M10.0 analyzer and projects original UTF-16 literal evidence to two exhaustive disjoint caller-authored source cohorts plus explicit unmatched. Typed `linkedin.research.compare_cohorts`, `research.compare_cohorts` LOCAL_ONLY capability, real STDIO/HTTP and bounded raw SSE are integrated; full Node24 quality gates and **1,090/1,090 tests across 99 suites** GREEN, framework 7/7 GREEN. Original pure missing-module and typed MCP missing-tool RED observed; independent pure reviewer found backslash-literal evidence laundering, reproduced by prime RED and repaired GREEN with 8/8 pure tests, reviewer Critical=0 Important=0 after re-review. Independent pure and MCP/transport review completed Critical=0 Important=0; PR #19 final feature `fa18e11d7c3a178556f52d5dc31f8822dafe9577` CI `40463848696` SUCCESS, squash main `0002809530e819720fe66477ba1e57bcca54ff31` exact push CI `40464124927` SUCCESS. This does **not** infer source truth, market trends, statistical/competitor gaps or activate external research.

## TDD Evidence

M10.0 core, analysis and MCP tests exercised missing module/tool registration, URL canonical expansion and credential aliases, SDK secret-bearing unknown-key errors, Unicode word boundaries, output overflows and host metadata limits as genuine RED→GREEN cases. The final Node24 full-suite run on 2026-10-26 passed **1,043/1,043 tests in 93 suites** with format, lint, typecheck, build and framework validation GREEN.

M10.1 missing pure module and MCP tool were separately reproduced RED, then repaired GREEN. The initial full local Node24 suite passed **1,055/1,055 in 95 suites**; after Unicode case-equivalence tests it passed **1,056/1,056**, and after correcting a separate Unicode topic/phrase false-evidence mapping regression, the **final full suite passed 1,057/1,057 tests across 95 suites** with all quality, framework and real built transport gates green. Unicode single-line separator and topic equivalence edge cases were genuine RED→GREEN repairs, not content truncations.

M10.2 original missing-module/test and missing-MCP-tool RED failures were observed, then 8/8 pure and 9/9 MCP tests passed. First full Node24 run passed 1,074/1,074 across 97 suites, plus formatting/lint/typecheck/build, seven framework tests and actual built STDIO/HTTP 6/6. Final two disjoint independent review scopes Critical=0 Important=0; exact feature and merged-main CI SUCCESS. M10.3 independently reviewed and VERIFIED/MERGED via PR #19 and exact feature/main CI. M10.4 first missing-module and missing-tool RED were genuinely reproduced before GREEN; final local Node24 full suite passed 1,104/1,104 in 101 suites plus format/lint/typecheck/build, framework 14/14 and built STDIO/HTTP with raw SSE. Independent M10.4 security scopes signed off Critical=0 Important=0 after genuine raw-ID RED→GREEN repair; PR #20 exact feature-head CI 40469138021 and main push CI 40469415495 both SUCCESS.

## Integration Test Evidence

Built real STDIO and loopback HTTP processes both invoked `linkedin.research.analyze` and verified `LOCAL_ONLY`, original UTF-16 evidence spans and source-provenance fidelity. Actual HTTP raw SSE POST of a large valid caller corpus produced 200 and a bounded 3,661-byte SSE response with no body echo; full SSE budget <=256 KiB. M10.0 and M10.1 both passed exact feature-head and post-merge CI. M10.1 also passed real built STDIO/HTTP and raw SSE constraints; no third-party source verification follows.

## Security Review

Independent core/analyzer/MCP security review and separate integration/documentation review independently signed off **Critical=0, Important=0** after reproducing and repairing secret-bearing SDK validation messages, encoded URL credentials and controls, canonical URL growth, Unicode term boundaries, oversized host request IDs and traceability status validation. No M10 provider, DNS or external research service was activated.

## Code Review Findings

Both M10.0 and M10.1 received independent source/integration review with unresolved Critical=0 Important=0, followed by successful exact feature-head and main CI. M10.2 also completed genuine RED→GREEN source/tool, separate independent scoped Critical=0 Important=0 reviews and exact remote feature/main CI; M10.3 independently reviewed and VERIFIED/MERGED; M10.4 independent source and MCP/transport security reviews signed off Critical=0 Important=0; PR #20 exact feature/head and squash-merged-main CI SUCCESS.

## Fresh Verification Results

M10.0 PR [#16](https://github.com/salman0butt/linkedin-mcp/pull/16): exact feature commit `bb84e6e02656313e33dba5d992d8cfbcc9279706`, CI `40293170065` SUCCESS. Squash-merged `main` `865fd9fb4cd5ccd8438ef7a89f9bc08f3fb600df`, identical Git tree `38629469b6449be0883c6bbe122c8951b4b3d0ac`, exact push CI `40293411451` SUCCESS. M10.1 PR [#17](https://github.com/salman0butt/linkedin-mcp/pull/17) final feature `c36bfbce83299d53bf8f743c0b5316ed861fea91`, CI `40300253462` SUCCESS; squash main `2899847a79dec7dd08714d8e2a3fb3e720c6c42e`, identical tree `0fc169222f5e2eb5c888ba7c126edda070467932`, push CI `40300553498` SUCCESS.

M10.2 PR [#18](https://github.com/salman0butt/linkedin-mcp/pull/18): feature `b39f30ca1089a8b02f3a099eb8238555ebb25a09` CI `40304586073` SUCCESS, squash main `e7be937961f138a7df769c5a63dba7646d0fface`, tree `f6a8f9252ed73ef4cd75fea7e5e7345bc0ff7c58`, exact push CI `40304868402` SUCCESS.

M10.3 and M10.4 are VERIFIED/MERGED; M10.4 provides **caller-curated original UTF-16 excerpt packs** grouped by user-selected post/article/carousel destination hints in one bounded corpus; exact feature and merged main CI verified. No inferred market trends, published content, competitor gaps or authorized external research provider.

## Durable Recovery Sources

PRD, capability matrix, `docs/superpowers/specs/2026-10-25-m10-content-research-design.md`, `docs/superpowers/plans/2026-10-25-m10-content-research.md`, Git/PR/CI. `linkedin.research.analyze`, `linkedin.research.group_themes`, and `linkedin.research.index_references` are verified LOCAL_ONLY caller-data capabilities on caller-supplied unverified material; `research.topic` stays `EXTERNAL_DISCOVERY` / `UNAVAILABLE` without a provider. M09 manual handoff stays VERIFIED; native publication remains BLOCKED/UNAVAILABLE.

## Completion Checklist

- [x] M10.0 local acceptance and exact feature/post-merge CI verified.
- [x] Independent scoped Critical/Important findings resolved.
- [x] M10.3 caller cohort comparison PR #19 and exact feature/main CI verified.
- [x] M10.4 independent source and MCP/transport security reviews Critical=0 Important=0.
- [x] M10.4 evidence repurposing PR #20 feature CI 40469138021 and main CI 40469415495 SUCCESS.
- [ ] Broader provider-backed topic research/trends/gaps and M10 milestone closeout await authorized source provider.

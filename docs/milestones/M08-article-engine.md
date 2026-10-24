# M08 — Article Authoring Engine

Status: **COMPLETE** — PR [#12](https://github.com/salman0butt/linkedin-mcp/pull/12) squash-merged to `main` at `4b56a8411eed258ad2e2832b1796031288498a0e`; feature-head and post-merge main CI verified.

## Goal

Create an end-to-end long-form article project system: research, brief, outline, structured draft, review, media/SEO metadata and companion post.

## Dependencies

M00 core; M10 research may later extend but is not required for basic article project state.

## In Scope

Article project model, blocks, drafts, validation, preview, reusable MCP prompts, companion post draft.

## Out of Scope

Native LinkedIn UI publication; that is M09.

## Acceptance Criteria

Complete article package is persistable/reviewable; factual sources are separable from prose; publication is not implied.

## Tasks / Iterations

M08.0 design/plan and independent design review; M08.1 strict draft/source normalization; M08.2 inert Markdown preview, checklist and companion; M08.3 private revisioned project store; M08.4 model-independent prompts; M08.5 eight MCP tools and STDIO/HTTP integration; M08.6 independent whole-branch review, exact feature-head CI, squash merge and post-merge main CI **verified complete**.

## TDD Evidence

Observed genuine RED→GREEN work includes M08 private-store protections, four stale historical capability expectations (initial run **969 passed / 4 failed / 973 total**, followed by **12/12** focused GREEN) and **three Important** audit findings: credential-bearing URL query aliases/fragments, sensitive config parent/child path collisions and invalid UTF-8 accepted in persisted revision-2 article data. All three review findings were repaired with RED→GREEN regression tests. **Fresh final full local Node24 test: 988/988 PASS across 88 suites.**

## Integration Test Evidence

Eight MCP article tools shipped: stateless `linkedin.article.draft.validate`, `.preview`, `.companion` and private `linkedin.article.projects.create`, `.update`, `.get`, `.list`, `.remove`. Reusable research-brief, outline and review MCP prompts are present. Real built STDIO and loopback HTTP integration are covered in the **988/988 passing tests across 88 suites**. Private persistence remains opt-in, host-configured, STDIO-only and inaccessible over HTTP even with an injected store. No research, source verification or native article publication is included.

## Security Review

**Independent M08.6 whole-branch review SIGNED OFF: unresolved Critical=0, Important=0.** The three Important findings (credential-bearing URL query aliases/fragments, config parent/child path overlap, persisted revision-2 invalid UTF-8) were each reproduced RED and fixed GREEN. Source provenance remains explicitly user-supplied/unverified; local data and MCP output bounds, HTTP isolation and the no-native-publication boundary remain in force. Exact PR and merged-main CI succeeded after this review.

## Code Review Findings

Three verified Important findings repaired through genuine RED→GREEN and independently re-reviewed. **Final M08.6 whole-branch independent scoped signoff: unresolved Critical=0, Important=0.**

## Fresh Verification Results

**M08 remotely verified and merged:** PR [#12](https://github.com/salman0butt/linkedin-mcp/pull/12) exact feature head `b2c1ad9abec69ec05f1a18024f7abebffb9d007a`, GitHub CI `40120392598` **SUCCESS**; squash-merged to `main` at `4b56a8411eed258ad2e2832b1796031288498a0e`, exact main-push GitHub CI `40120555718` **SUCCESS** (frozen install, Node24 **988/988 tests across 88 suites**, format, ESLint, typecheck and build). Independent M08.6 signoff unresolved **Critical=0 / Important=0**. This is M08 code/merge verification, **not** a claim that the later M08-closeout documentation branch has passed its own CI.

## Durable Recovery Sources

PRD, capability matrix, M08 spec/plan, Git/PR/CI.

## Completion Checklist

- [x] Local acceptance and full test/quality gates verified (988/988 across 88 suites; built STDIO/HTTP included).
- [x] Independent M08.6 Critical/Important resolved (0/0 signoff).
- [x] Exact feature-head CI `40120392598` on `b2c1ad9` and post-merge main CI `40120555718` on `4b56a84` both SUCCESS.

**Handoff:** M08 is COMPLETE. M09 Native Article Publishing is **PLANNED**, with no entitlement/provider or implementation implied. Next action: Begin M09.0 requirements/design and feasibility investigation for legitimately authorized optional native LinkedIn article publishing; no bypass, no entitlement assumption.

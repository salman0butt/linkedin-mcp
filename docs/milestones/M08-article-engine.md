# M08 — Article Authoring Engine

Status: **VERIFYING — PRE-MERGE** (local implementation, independent audit and full verification GREEN; M08 PR, exact-final-head remote CI and merge pending).

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

M08.0 design/plan and independent design review; M08.1 strict draft/source normalization; M08.2 inert Markdown preview, checklist and companion; M08.3 private revisioned project store; M08.4 model-independent prompts; M08.5 eight MCP tools and STDIO/HTTP integration; M08.6 final review and closeout **in progress**.

## TDD Evidence

Observed genuine RED→GREEN work includes M08 private-store protections, four stale historical capability expectations (initial run **969 passed / 4 failed / 973 total**, followed by **12/12** focused GREEN) and **three Important** audit findings: credential-bearing URL query aliases/fragments, sensitive config parent/child path collisions and invalid UTF-8 accepted in persisted revision-2 article data. All three review findings were repaired with RED→GREEN regression tests. **Fresh final full local Node24 test: 988/988 PASS across 88 suites.**

## Integration Test Evidence

Eight local MCP article tools are integrated: stateless `linkedin.article.draft.validate`, `.preview`, `.companion` and private `linkedin.article.projects.create`, `.update`, `.get`, `.list`, `.remove`. Reusable research-brief, outline and review MCP prompts are present. Real STDIO and loopback HTTP integration tests **6/6 GREEN**; private persistence is opt-in, host-configured, STDIO-only and inaccessible over HTTP even with an injected store.

## Security Review

**Independent M08.6 whole-branch review SIGNED OFF: unresolved Critical=0, Important=0.** The three Important findings (credential-bearing URL query aliases/fragments, config parent/child path overlap, persisted revision-2 invalid UTF-8) were each reproduced RED and fixed GREEN. Source provenance remains explicitly user-supplied/unverified; local data and MCP output bounds, HTTP isolation and the no-native-publication boundary remain in force. This is local security/correctness review, not remote PR/CI approval.

## Code Review Findings

Three verified Important findings repaired through genuine RED→GREEN and independently re-reviewed. **Final M08.6 whole-branch independent scoped signoff: unresolved Critical=0, Important=0.**

## Fresh Verification Results

**Local final pre-merge verification GREEN:** fresh Node24 `pnpm test` **988/988 across 88 suites**, including real built STDIO/HTTP transports; formatting, ESLint, TypeScript, build and `git diff --check` GREEN in the final quality run (exit 0). Independent M08.6 review unresolved **Critical=0 / Important=0**. No M08 PR, exact-final-feature-head **remote** CI, merge or post-merge main CI yet. Working branch `feat/m08-article-authoring`, based on `e8b603c2f340a0121c473d10ed6fc1e41b5257d7`. This evidence is from the uncommitted combined local M08 tree, not an exact remote feature SHA.

## Durable Recovery Sources

PRD, capability matrix, M08 spec/plan, Git/PR/CI.

## Completion Checklist

- [x] Local acceptance and full test/quality gates verified (988/988 across 88 suites; built STDIO/HTTP included).
- [x] Independent M08.6 Critical/Important resolved (0/0 signoff).
- [ ] Exact-final-head/post-merge CI green.

**Exact next action:** Create the M08 feature PR and verify its exact-final-head SHA CI.

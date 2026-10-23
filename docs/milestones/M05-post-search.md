# M05 — Post Search

Status: **COMPLETE — PR #8 squash-merged**, commit `01fb37d3b762f2b1775c8845daba61c98054d6ed`, exact post-merge main CI `39920255603` GREEN (647 tests in 71 files), zero confirmed unresolved Critical/Important findings.

## Goal

Deliver post/content discovery with explicit provider provenance and normalized result schemas.

## Dependencies

M00 provider model verified.

## In Scope

Topic/author/company/hashtag/recent search through legitimate configured providers, provenance/confidence/canonical URLs.

## Out of Scope

Claiming broad official LinkedIn search without evidence or bypassing platform controls.

## Acceptance Criteria

Every result identifies source/provider; filters are deterministic; unavailable providers fail transparently.

## Tasks / Iterations

M05.1 core canonical search contract; M05.2 dedupe/filter; M05.3 explicit provider availability; M05.4 independently gated official single-author finder; M05.5 strict MCP transports; M05.6 closeout. Design: `docs/superpowers/specs/2026-10-22-m05-post-discovery-design.md`; plan: `docs/superpowers/plans/2026-10-22-m05-post-discovery.md`. No external discovery provider configured by default.

## TDD Evidence

M05.1 canonical core discovery contract: RED locally observed (Vitest import failed because `packages/core/src/post-discovery.ts` did not yet exist). GREEN locally after implementation: six new contract tests passed for strict mode-specific queries, date/limits/engagement validation, trusted source normalization, URL/URN safety, no fabricated metadata and untrusted input rejection. Full local suite **589/589 tests across 67 files**, lint, typecheck, formatting, build and stdio/HTTP smoke successful. Exact-head GREEN: commit `1bbc366dda57cc44d10825c6126a6fefd195dd7d`, CI `39743915175`, **589/589 tests across 67 files** plus all quality gates.

M05.2: RED missing `post-search-filter.ts`, then GREEN seven focused tests for topic/hashtag/author/company, inclusive date ranges, real engagement metrics, deduplication scoped to the configured provider and bounded newest-first output. Local full suite **596/596 tests in 68 files**, lint/typecheck/build/format and real stdio/HTTP transports passed. Exact-head GitHub CI `39744941663` at `9e6a141c36521305f536167df18ef0be75a72a28` passed 596/596 tests across 68 files plus all quality gates.

M05.3 typed provider router: RED missing `post-search-service.ts`; eleven focused tests then GREEN for absent provider => unavailable, invalid-query-before-effects, success-empty vs partial-empty, injected immutable provider provenance, mixed rate/permission/error taxonomy, unsupported provider exclusion, output size bound, timeout+abort, and invalid/duplicate provider configuration. Local full suite **607/607 tests across 69 files**, format/lint/typecheck/build and real transports passed. No live search provider bundled. Exact-head GitHub CI `39745975198` at `6c7e1ccd99eafdb434e382af99d0698eee748874` passed **607/607 tests across 69 files** and all quality gates. Independent provider-security review remains in progress.

M05.3 independent security/provenance review found an Important official-provider classification gap: trusted adapters could configure `OFFICIAL_API` for unsupported global `topic`, `hashtag` or `recent` search. Focused test RED: 11 passed, 1 failed on `6c7e1cc`; minimal configuration validation rejects these modes (including mixed author/global declarations) while retaining official author/company configurations. GREEN commit `35ff359dffecc179aa82f0e41d7c563b559825d7`, exact-head CI `39758769454` succeeded with 608/608 tests across 69 files and required quality gates. Finding resolved; no live provider entitlement claimed.

M05.4: Remote RED test-only head `4b6673fe4c423deff22f26c5b8a9f191cb87a3a8` failed Prettier in CI `39907383505`; locally the test also failed because the `linkedin-author-posts.ts` provider was missing. Expanded TDD covered restricted read scopes, trusted verified person/organization authorization, default OFF, a fixed versioned `q=author`/`READER` finder request, published/public filtering, error taxonomy, strict body/UTF-8 bounds, and bounded pagination. Independent review found four Important defects: counting unfiltered or duplicate posts before stopping paging, misclassified resolver errors, missing resolver default-OFF initialization, and trusting unvalidated next-page links. Regression tests reproduced the issues (focused 23 tests, 5 RED before fixes), with invalid UTF-8 additionally rejected. Local final: **23/23 M05.4 focused tests, 631/631 full tests across 70 files**, plus real stdio/HTTP smoke, lint, typecheck, build and Prettier GREEN (Node 24, macOS `TMPDIR=/private/tmp`). Trusted resolver is injected but no real credential-bound resolver or live entitlement is bundled; official finder remains disabled unless a verified host supplies it. Await new remote exact-head CI before marking this iteration remotely verified.

M05.4 exact-head GREEN: commit `e517d5747622cf9d3289bda6ae08151fa637878a` and GitHub CI `39915436774`, **631/631 tests across 70 files**, frozen install, formatting, lint, typecheck and build succeeded. Live restricted permission remains unverified.

M05.5: Genuine behavioral RED before implementation: new MCP contract tests had four failures (`linkedin.posts.search` not registered) and one unrelated validation test passed. Implemented strict five-mode input, read-only aggregate source behavior, `unavailable` => `unsupported` without posts, partial provider outcomes preserved with `isError=true`, sane error taxonomy and sanitized metadata, immutable provider identity from trusted adapters, no caller-supplied token/endpoint/provider choice. Shared `LinkedInRuntime` injects configured providers, default empty, into both real stdio and HTTP MCP paths; existing 28 tools become 29. Independent read-only reviewer identified two Important issues: invalid canonical query inputs misclassified as provider failures, and prototype-defined provider search methods silently lost on copying. Both reproduced RED, then fixed GREEN; also verified advertised strict five-mode JSON Schema, real nonempty provider-scoped provenance, malicious source spoofing ignored, no invented post metadata, sanitized failure-only results and two-client partial loopback HTTP. **Eleven focused MCP tests, 645/645 tests across 71 files** locally GREEN, plus real transports, lint, typecheck, formatting and build (Node 24, macOS `TMPDIR=/private/tmp`). No unresolved Critical/Important issue from M05.5 review; new remote exact-head CI pending. No external source or live official finder access wired by default.

M05.5 exact-head GitHub verification: commit `1c0762c91113f0c23d27ee03d4631b5988f1cdc2` and CI run `39918895858` succeeded (645/645 tests in 71 files, frozen install, formatting, lint, typecheck and build). M05.6 closeout is active; PR #8 has no unresolved review threads and was mergeable when checked. The independent full-branch security/provenance review is pending; no merge has occurred.

M05.6 independent whole-branch review found two Important defects. First, the local filter deduplicated source IDs before eligibility checks, suppressing later matching records. Second, core normalization allowed LinkedIn login/help/redirect URLs as canonical post permalinks and failed to bind URL identity to an explicit post URN. Both reproduced RED, fixed GREEN (filter first, then dedupe; validate canonical post paths and URL/post-URN numeric identity). Post-fix local suite **647/647 tests across 71 files**, real stdio/HTTP smokes, lint, typecheck, format and build GREEN (Node 24, `TMPDIR=/private/tmp`). Reviewer rechecked the whole branch and reported **zero additional confirmed Critical/Important findings**; strict permalink paths may reject URLs with tracking query parameters, so providers should supply clean canonical URLs. Final remote exact-head CI and merge gates remain pending. Live entitlements remain unverified.

Next: persist M05.6 review fixes and final docs, verify exact-final-head CI and squash-merge under milestone policy.

## Integration Test Evidence

M05.5 real stdio/HTTP smoke and loopback provider-injection tests pass; 29 MCP tools are registered even when there is no provider. M05.4 official author finder is intentionally host-injected only and remains unavailable by default.

## Security Review

Independent reviews verified default-off restricted official author access, verified person/org role and scope gates, bounded provider fan-out and pagination, strict public-only post retrieval, sanitization of source provenance, no caller-supplied tokens/URLs and no implicit browser/stealth provider. M05.6 re-review confirmed both Important defects fixed, with no additional confirmed Critical/Important issue. Live restricted access and real third-party discovery require separately verified credentials/terms; no claim of production entitlement is made.

## Code Review Findings

M05.5 reviewer verified no Critical issue in new MCP routing; its two Important findings (invalid-input classification and prototype method loss) were regression-fixed. M05.6 independent reviewer found two Important findings (pre-filter dedupe, canonical permalink binding), both RED→GREEN fixed, and reported no additional confirmed Critical/Important findings after re-review.

## Fresh Verification Results

M05.5 exact remote commit `1c0762c` CI `39918895858` passed 645/645 tests in 71 files. Final M05.6 head `6a40bed73d3fe0aacf625e06057be725c8918fb7` CI `39920032492` passed 647/647 tests across 71 files plus all gates. PR #8 squash-merged at `01fb37d3b762f2b1775c8845daba61c98054d6ed`; post-merge main CI `39920255603` passed the same 647 tests and quality gates. M06 is now active on its own milestone branch.

## Durable Recovery Sources

PRD, capability matrix, M05 spec/plan, Git/PR/CI.

## Completion Checklist

- [x] Acceptance verified (scoped deterministic contracts and configured-provider real MCP transports; default unavailable remains explicit).
- [x] Critical/Important resolved (independent M05.6 re-review; final CI gate pending).
- [x] Exact-final-head/post-merge CI green (PR head `6a40bed`, run `39920032492`; main merge `01fb37d`, run `39920255603`).

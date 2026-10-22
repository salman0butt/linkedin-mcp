# M05 — Post Search

Status: **ACTIVE — M05.4 restricted official author finder**, branch `feat/m05-post-search`, based on verified main `800bf943cf047215bc434206dab1e5b6e2175c10`.

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

Next: implement M05.4 default-OFF, verified-identity single-author official Posts API finder with RED→GREEN tests on PR #8.

## Integration Test Evidence

Pending.

## Security Review

Provider terms/bounds, browser isolation if introduced, no stealth/rate evasion.

## Code Review Findings

Pending.

## Fresh Verification Results

Pending.

## Durable Recovery Sources

PRD, capability matrix, M05 spec/plan, Git/PR/CI.

## Completion Checklist

- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

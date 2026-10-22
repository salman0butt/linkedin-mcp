# M05 — Post Search

Status: **ACTIVE — M05.1 canonical post discovery**, branch `feat/m05-post-search`, based on verified main `800bf943cf047215bc434206dab1e5b6e2175c10`.

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

M05.1 canonical core discovery contract: RED locally observed (Vitest import failed because `packages/core/src/post-discovery.ts` did not yet exist). GREEN locally after implementation: six new contract tests passed for strict mode-specific queries, date/limits/engagement validation, trusted source normalization, URL/URN safety, no fabricated metadata and untrusted input rejection. Full local suite **589/589 tests across 67 files**, lint, typecheck, formatting, build and stdio/HTTP smoke successful. Exact-new-head GitHub CI pending.

Next: persist M05.1 on the existing draft PR #8 and verify CI before M05.2.

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

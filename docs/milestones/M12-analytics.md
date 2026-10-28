# M12 — Analytics

Status: **IMPLEMENTING — M12.0 caller-supplied LOCAL_ONLY snapshot comparison; provider-backed LinkedIn analytics unavailable.**

## Goal

Expose capability-aware post/article/account analytics and comparisons without inventing unavailable metrics.

## Dependencies

Relevant publishing/identity permissions and verified provider access.

## In Scope

Normalized metrics, snapshots, comparisons, top content and later experiments where supported.

## Out of Scope

Fabricated metrics or unauthorized private analytics.

## Acceptance Criteria

Metric provenance/time window are explicit; unavailable metrics remain unavailable; calculations are deterministic.

## Tasks / Iterations

M12.0: strict caller-supplied two-snapshot counter comparison, `linkedin.analytics.compare_snapshots`, capability `analytics.snapshots.compare` LOCAL_ONLY / AVAILABLE / ACTIVE. Design `docs/superpowers/specs/2026-10-28-m12-local-analytics-snapshots-design.md`; implementation plan `docs/superpowers/plans/2026-10-28-m12-local-analytics-snapshots.md`. No provider fetch, account claims, persistence, invented unavailable metrics or engagement rates. Real provider analytics needs separate authorized access and scopes.

## TDD Evidence

Genuine pure missing-module RED then 5/5 GREEN; MCP/transport inventory RED (59 found vs 60 expected) then 27/27 focused pure+SDK+compiled STDIO/HTTP GREEN. Independent review and final remote release pending.

## Integration Test Evidence

Baseline Node24 1,188/1,188 in 110 suites; M12.0 full Node24 1,200/1,200 tests in 113 suites with formatting/lint/typecheck/build and real STDIO/HTTP/raw SSE GREEN, independent Critical0 Important0; exact feature/main CI PENDING.

## Security Review

Privacy, account/organization authorization, bounded retention. M12.0 does not ask for an account ID, credentials, post URL or content text and does not persist data. Strict own-data input, absence means `null` not zero, no provider verification, no insecure provider calls; independent signoff pending.

## Code Review Findings

Pending.

## Fresh Verification Results

Pending.

## Durable Recovery Sources

PRD, capability matrix, M12 spec/plan, Git/PR/CI.

## Completion Checklist

- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

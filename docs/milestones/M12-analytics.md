# M12 — Analytics

Status: **IMPLEMENTING — M12.0 LOCAL_ONLY caller snapshot comparison VERIFIED/MERGED; M12.1 signed metric-delta ranking implementing; provider-backed LinkedIn analytics unavailable.**

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

M12.0 VERIFIED/MERGED PR #25 feature CI `40658356126`, squash main `79568b556e926566362ad82e8203e1195d35d2e8` push CI `40658638728` SUCCESS, local Node24 1,200/1,200 and independent Critical0 Important0. M12.1 caller-supplied multi-content metric delta ranking is implementing per `docs/superpowers/specs/2026-10-28-m12-local-snapshot-delta-ranking-design.md` and `docs/superpowers/plans/2026-10-28-m12-local-snapshot-delta-ranking.md`.

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

M12.1 full Node24 1,213/1,213 in 116 suites, formatting/lint/typecheck/build and compiled STDIO/HTTP/raw SSE GREEN. Independent review, remote feature/main CI PENDING. One initial macOS /var vs /private/var temp-alias fixture run failed; focused config 67/67 and complete canonical-TMPDIR rerun 1213/1213 passed without modifying implementation or filesystem safety. `analytics.post` remains UNAVAILABLE.

M12.1 hostile host timestamp RED→GREEN: malformed 600KiB pseudo-Date sanitized to fixed fallback, no leak or unbounded MCP raw response. Final Node24 1,213/1,213 GREEN after this remediation; independent review and remote CI PENDING.

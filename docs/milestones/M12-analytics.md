# M12 — Analytics

Status: **IMPLEMENTING — M12.0–M12.1 LOCAL_ONLY snapshot comparison and signed delta ranking VERIFIED/MERGED; M12.2 chronological observation series implementing; provider-backed LinkedIn analytics unavailable.**

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

M12.0 VERIFIED/MERGED PR #25 feature CI `40658356126`, squash main `79568b556e926566362ad82e8203e1195d35d2e8` push CI `40658638728` SUCCESS, local Node24 1,200/1,200 and independent Critical0 Important0. M12.1 caller-supplied multi-content metric delta ranking VERIFIED/MERGED PR #26 feature `810b8bc90fe85fcb477a717a35382dd3616d9c6e` CI `40664805538` SUCCESS, guarded squash main `40c714df69039ab65e648ae78d58a30496698c1e` tree `2820ce11430aea3f0e91d7098cd716cc5295bad0` separate push CI `40665262565` SUCCESS, local Node24 1,213/1,213 in 116 suites, independent pure and MCP/transport Critical0 Important0. M12.2 caller-only chronological observation series implementing per `docs/superpowers/specs/2026-10-28-m12-local-metric-observation-series-design.md` and plan of the same date.

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

**M12.1 release verification:** independent pure 208/208 hostile tests + 5,000/5,000 seeded oracle cases and MCP/transport 0/0 signoffs, exact PR #26 feature CI `40664805538` and distinct main push CI `40665262565` both SUCCESS. Earlier PENDING lines above record the pre-release test checkpoint and are superseded by this verification. M12.2 RED→GREEN and remote release gates remain pending.

**M12.2 local verification (pre-release):** Genuine pure missing-module and typed real SDK absent-tool RED→GREEN; first full run found 5 genuine regressions (HTTP 66-tool list >256KiB, SDK output schema metadata ID, unknown nested secret key leak, inventory order). Fixed without weakening strict input or increasing 256KiB ceiling: use exhaustive enum-keyed output records and strict input object, no unsupported `$defs` metadata ID. Latest full Node24 **1,231/1,231** in **119** suites and format/lint/typecheck/build GREEN; compiled real STDIO/HTTP, 66 tool inventory and HTTP raw SSE with 128-byte JSON-RPC ID GREEN. Independent cross-review pure Critical0 Important0 (234 hostile + 512 randomized), MCP/transport Critical0 Important0 (real SDK/compiled HTTP, 270k/390k ID rejection). Full 66-tool list has little headroom under 256KiB; future tool additions require protocol-safe tool-list pagination/size hardening. **M12.2 remote PR/feature/main CI PENDING.**

**M12.2 VERIFIED/MERGED:** PR #27 feature `8c2c19d02a72b4ea79dfbb53c18ca02378a1cb41` CI `40668979524` SUCCESS; guarded squash main `8d3019a872a34b3990567f193d58d5f7bdb11d42` tree `b2e9f4482ab5a370d203ba92f54762f78c0e2fcf` distinct main push CI `40669592590` SUCCESS; Node24 1,231/1,231 and independent 0/0. M12.3 HTTP tools/list pagination hardening implementing: preserves all 66 tool descriptors under 256KiB SSE ceiling including escaped 128-byte JSON-RPC IDs; design/plan in docs/superpowers/2026-10-28. Remote release PENDING.

**M12.3 local verification (pre-release):** Current 66-tool plain HTTP `tools/list` had only 85 bytes of 256KiB wire headroom at a 128-byte ASCII ID; valid 128-byte escaped IDs returned HTTP502. Genuine real HTTP RED→GREEN now uses bounded standard MCP pages and v2 client auto-aggregation, unmodified STDIO, fixed 256KiB catch-all; per-server HMAC cursor and immutable JSON snapshots after independent forgery/alias REDs, and permitted MCP `_meta` after independent real SDK RED. Local Node24 **1,237/1,237 in 121 suites**, formatter/linter/typecheck/build, compiled STDIO/HTTP smoke GREEN. HTTP reviewer Critical0 Important0, pure re-audit and remote CI PENDING. No official LinkedIn provider analytics added.

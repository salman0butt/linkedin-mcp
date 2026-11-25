# M17 — Production Hardening

Status: **PLANNED overall** — **M17.0, M17.1 and M17.2 VERIFIED/MERGED**; remaining hardening and provider-blocked milestone dependencies prevent M17/v1.0 closeout.

## Goal

Complete v1.0 security, reliability, compatibility, documentation, packaging and operational hardening.

## Dependencies

All required prior product milestones resolved.

## In Scope

Threat model, dependency/security audit, load/reliability tests, migration/API-version tests, provider-failure tests, MCP-client compatibility, packaging/Docker/docs/release automation.

## Out of Scope

New major product capabilities unrelated to v1.0 closeout.

## Acceptance Criteria

Required roadmap traceability has no unexplained gaps; security/reliability gates pass; exact-final-state CI green; release docs/package are truthful.

## Tasks / Iterations

Design/plan; threat/security audit; compatibility; resilience/load; docs/package; final review/verification.

## M17.4 — Bound final HTTP response accumulation (local GREEN, PR CI PENDING)

PR #38 prior head `c61733c367c9714796c56761d7f6f7f6b5f4e7f8` passed CI `45597945539`; the M17.4 changes are not yet covered by that CI. A real HTTP batch of 2,000 health calls produced 1,306,890 response bytes before the 256 KiB check. The final response writer now retains at most 256 KiB of body data and drains overflow before returning the existing 502 outcome-unknown error. Temporary buffer growth may hold less than 512 KiB plus the current chunk. SDK queues and standalone tool-list `response.text()` are separate, unresolved allocation paths. Genuine RED→GREEN for overflow and for avoiding full `arrayBuffer()` reads; Node24 full 1,295/1,295 across 125 files, format/lint/typecheck/build and framework check passed locally. Exact current PR head CI remains pending. M17 and its dependencies remain incomplete.

Exact next work: **Verify exact current PR #38 head CI and independently resolve the remaining SDK and pagination response-buffering risk before considering the milestone merge gates.**

### M17.3 — Reject batched tools/list before unpaginated SDK allocation (local GREEN, release PENDING)

- Design `docs/superpowers/specs/2026-10-29-m17-http-tool-list-batch-preflight-design.md`; plan `docs/superpowers/plans/2026-10-29-m17-http-tool-list-batch-preflight.md`; base verified `main` `73c4db0c4d103361d8e3576d1fdd80454cb6286e` (PR #37 main push CI `40842342086` SUCCESS).
- Independent Node24 real loopback instrumentation: 1,528-byte 32-item `tools/list` batch generated ~8.49 MiB of intermediate SDK response before HTTP502; mixed batch triggered a provider call despite the lost 502 response. Genuine two targeted HTTP RED: 502 vs required bounded 400; early pre-dispatch rejection is GREEN, HTTP + pagination **36/36**. SDK standalone pagination, 67 tools, legal batches, 96KiB pages, 256KiB final response and STDIO-only stores remain intact.
- Node24 full **1,289/1,289** in 124 suites, framework **14/14**, compiled STDIO/HTTP, format/lint/typecheck/build and diff check GREEN. Independent security and correctness reviews **Critical 0 / Important 0**, remote exact-head PR/main CI PENDING. Generic `writeResponse` eager `arrayBuffer()` remains a future separate hardening issue. M17 overall PLANNED, M13.1 provider access BLOCKED.

### M17.2 — Prompt 413 on unfinished over-limit uploads (VERIFIED/MERGED)

- Design: `docs/superpowers/specs/2026-10-28-m17-http-stream-overlimit-rejection-design.md`; implementation plan: `docs/superpowers/plans/2026-10-28-m17-http-stream-overlimit-rejection.md`; base `main` `801df4aeced49d05a558acd225eca903be36e3fb` ([PR #35](https://github.com/salman0butt/linkedin-mcp/pull/35) separate push CI `40747146525` SUCCESS).
- Independent Node24 raw TCP baseline: with request-body limit 256 bytes, 257 bytes sent to chunked `Connection: keep-alive` POST without a terminal zero chunk produced **no response** after 371ms; HTTP413 arrived only after sender EOF. A held partial Content-Length stream reproduced the same issue. `readBody` previously marked oversize then drained until EOF.
- Genuine RED->GREEN for held chunked and incomplete Content-Length above 256 bytes. A separate independently reproduced Important RED showed a second pipelined MCP tool executing behind an overlimit first request without a response; per-socket sequential dispatch and rejected-socket latching prevents further execution while maintaining valid ordered pipelined replies. Explicit exact-limit accepted and split 256+1-byte chunked tests passed. Focused HTTP **32/32 GREEN**.
- M17.2 HTTP upload-stream early 413 and per-socket pipelined side-effect suppression **VERIFIED/MERGED**. Node24 genuine held-upload and pipelined second-provider RED→GREEN, legal same-socket pipelining 200/200, exact-256 success and split 256+1 rejection; local HTTP **32/32**, full **1,288/1,288** across 124 suites, framework **14/14**, compiled STDIO/HTTP, format/lint/typecheck/build GREEN. Independent final security/docs review **Critical 0 / Important 0**. [PR #36](https://github.com/salman0butt/linkedin-mcp/pull/36) feature `b5a3dff45ec5e6e1b1ce2c85b6823b15fdd0509d` tree `301456da9d193790334994035b85a649dcc13e16` CI `40840793560` SUCCESS; squash main `f05fe3fb00b2d06f8d6db65d58d74c6ea71fa822` identical reviewed tree, separate exact push CI `40841063691` SUCCESS. M17 overall PLANNED; M13.1 provider access BLOCKED. Next separate investigation: `tools/list` batch/intermediate SSE response buffering before the 256 KiB outbound cap; huge 32/64 MiB fast-client EPIPE is a documented bounded-drain limitation.

### M17.1 — Finite bounded HTTP request-body configuration (VERIFIED/MERGED)

- Spec `docs/superpowers/specs/2026-10-28-m17-http-body-limit-validation-design.md`, plan `docs/superpowers/plans/2026-10-28-m17-http-body-limit-validation.md`, baseline main `53e9a885788a2b2066a1d3c7b2d645fb20a6f88a`; PR #33 feature CI `40742375125` and postmerge main CI `40742735462` SUCCESS.
- Independent real HTTP baseline repro: `NaN`/`Infinity` direct body-limit options accepted 1,049,110-byte POST as HTTP 200; unsafe `1e20` environment setting passed parseConfig. Shared 16 MiB maximum now enforces positive safe integer values for direct options and `LINKEDIN_MCP_BODY_LIMIT_BYTES` before HTTP listener startup, preserving 1 MiB default and 413 for completed overlimit requests.
- Genuine Node24 focused RED: 10 expected behavioral failures, 71 other focused tests passing. After minimum fix: 83/83 focused and complete **1,280/1,280** across **124** suites, framework **14/14**, compiled STDIO/HTTP and full format/lint/typecheck/build GREEN.
- An independent reviewer reproduced an additional Important enforcement bug: a valid environment limit of 1 byte was parsed but ignored by the HTTP server, which returned 200 on a 97-byte health request instead of 413. A second real HTTP RED→GREEN regression fixed the default fallback while retaining explicit valid override precedence.
- Final independent read-only source, transport/security and documentation re-reviews **Critical 0 / Important 0**. [PR #34](https://github.com/salman0butt/linkedin-mcp/pull/34) final feature `bd395174d86cabd10f315549322b45f4d63addd3` tree `5df33aed2c5c63e75bab61295aa5b0f6e735ce0b` exact feature CI `40745315254` SUCCESS, guarded squash `main` `8139cff30d33a57f7eca9e40b11125459b05fb69` parent `53e9a885788a2b2066a1d3c7b2d645fb20a6f88a` same tree with separate push CI `40745757021` SUCCESS. M17.1 VERIFIED/MERGED; overall M17 PLANNED. Unfinished partial-stream overlimit detection and batched intermediate response amplification remain distinct open tasks.

### M17.0 — OAuth callback listener availability (scoped)

- Design: `docs/superpowers/specs/2026-10-28-m17-oauth-callback-lifecycle-design.md`; plan: `docs/superpowers/plans/2026-10-28-m17-oauth-callback-lifecycle.md`.
- Exact base: `main` `cef8e9791c6fad6fdb56c2242340e7e437f3f88f`, M13 docs closeout PR #30, main push CI `40680570366` SUCCESS.
- Reproduced local availability DoS: unrelated half-open loopback HTTP client blocks `server.close()` after valid callback code consumed and timeout cleared; result remains pending, preventing token exchange. Terminal callback failures also blocked.
- Minimal fix: terminate remaining HTTP sockets after the callback response has flushed; force teardown on timeout and explicit close. Preserve state/PKCE validation, responses and provider boundaries.
- Genuine Node24 TCP behavior RED `expected 'settled', received 'blocked'` before change; GREEN after. Full local Node24 **1,264/1,264** tests in **124** suites, framework **14/14**, format/lint/typecheck/build and real compiled STDIO/HTTP GREEN. Independent post-fix security review **Critical 0 / Important 0**; remote feature and main-push CI verified as below.

## TDD Evidence

M17.0 real loopback held partial-header regression demonstrated RED on base; 18/18 focused auth/lifecycle tests GREEN after fix.

## Integration Test Evidence

Local 1,264/1,264 complete suite, includes compiled STDIO/HTTP 67-tool inventory, ≤96KiB pages, ≤256KiB HTTP responses and private STDIO-only state isolation; 14/14 framework.

## Security Review

M17.0 independent read-only reviewer: scoped **Critical 0 / Important 0**, 40 actual TCP terminal/timeout/close scenarios, 24 proven held incomplete-header sockets, 12 keep-alive controls, 18 abort-before-processing and 18 close/success races, zero unhandled and complete 200/400 responses. No token, scope, actor or provider capability changes. Full product threat model and dependency/secret/access review remain required for _overall_ M17.

## Code Review Findings

M17.0 scoped callback fix has no unresolved Critical/Important finding. Independently reproduced read-only _other_ HTTP transport risks (nonfinite request-body limit option, delayed oversized-stream rejection and batch buffering beyond final response limit) remain separate M17 future tasks, not changes or provider capabilities included in PR #31.

## Fresh Verification Results

M17.0 [PR #31](https://github.com/salman0butt/linkedin-mcp/pull/31): exact feature `c8b42f6fe895d246d4ad81e44cd6adf161c6cc26`, tree `bec90faffd7761c6756e39bf530b187bcb6790db`, 318/318 GitHub blobs identical to local, exact feature CI `40687205091` **SUCCESS**. Guarded squash `main` `7ad4f38f0280cfa99b7f2d1ef3cd5eeb99c2f031`, parent `cef8e9791c6fad6fdb56c2242340e7e437f3f88f`, identical tree `bec90faf...`; separate `push` CI `40687526120` **SUCCESS**, exact merged-main SHA. M17.0 **VERIFIED/MERGED**; M17 overall remains PLANNED.

## Durable Recovery Sources

PRD, capability matrix, M17 spec/plan, Git/PR/CI.

## Completion Checklist

- [ ] All required PRD items resolved.
- [ ] Critical/Important findings resolved.
- [ ] Exact-final-state CI green.
- [ ] v1.0 documentation/package verified.

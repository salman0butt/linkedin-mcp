# M02 — Text Publishing

Status: **ACTIVE — M02.7 closeout; review clear, final closeout-head CI pending**

## Goal

Deliver safe text-post preview/approval, idempotent official-API publishing and access-aware downstream verification.

## Dependencies

M01 verified.

## In Scope

Canonical preview, explicit approval receipts, text-post publish, persistent idempotency, optional downstream verification, audit/provenance and MCP/runtime integration.

## Out of Scope

Image/video/document publishing, organization publishing, scheduling, bulk posting, browser fallback and security-challenge bypass.

## Acceptance Criteria

- Preview never mutates LinkedIn.
- Publication requires approval bound to the exact canonical payload and authenticated subject.
- The same idempotency key cannot create a second LinkedIn post, including across process restart/concurrency.
- A valid provider-returned post URN is durably recorded before success is returned.
- Downstream read verification is explicit and access-dependent; legitimate write-only access remains usable.
- No post URL is fabricated or represented as verified when the provider has not supplied one.
- Provider/authorization/storage failures are structured, conservative and secret-safe.
- Live capability availability is not inferred from deterministic CI.

## Tasks / Iterations

1. **COMPLETE** — M02 activation, design and implementation plan.
2. **COMPLETE** — M02.1 canonical text-post contracts and capability implementation state.
3. **COMPLETE** — M02.2 approval receipt service.
4. **COMPLETE** — M02.3 persistent idempotency ledger.
5. **COMPLETE** — M02.4 official LinkedIn Posts adapter.
6. **COMPLETE** — M02.5 publish orchestration and safety hardening.
7. **COMPLETE** — M02.6 downstream verification plus MCP tools/real transport wiring through Task 7.
8. **ACTIVE** — M02.7 skeptical/security closeout and final merge gates.

## TDD Evidence

M02.1 RED `7c193f9adb8049a5849c603a5c5e29bea69ef59d` / CI `37753499633`; GREEN `c1dab02097f0e7c816ab0d80b6485024d4cbea07` / CI `37753956032`.

M02.2 RED `7b55eb7a09f7010acffd6ba5a6c928b99099f472` / CI `37754698723`; GREEN `5f1870106988c6b5ab365df275a8b3a314c60aa5` / CI `37754858404`.

M02.3 valid RED `a99a0d59d66c37ac120d6efe4ac2ab364cf4aa0a` / CI `37755801316`; GREEN `c88ae5b909888e796880f0193299cd21e1246648` / CI `37756724053`.

M02.4 valid RED `7817938bb2efcdc577d04c00b5b8625216ad6d29` / CI `37762083892`; GREEN `90267d9e27bbef705e93b9ec8250548ae815b7ce` / CI `37762622471`.

M02.5 exact checkpoint `84b36492da74961965ba3ae2cfb6e9c8a4c239e6` / CI `37793478842` green after scoped review fixes. Historical RED limitations are explicitly qualified in `docs/superpowers/evidence/2026-10-08-m02-publish-orchestration.md` rather than reconstructed.

M02.6 exact checkpoint `1a2cef29d88f7032d5befe18efb627736e49da16` / CI `37832719872` green after downstream verification review. Evidence: `docs/superpowers/evidence/2026-10-08-m02-downstream-verification.md`.

Task 7 exact checkpoint `1986831bf58fdd48ea5b0da64109898a768bd937` / CI `37838015911` green after the preceding local RED→GREEN work. Historical RED limitations remain qualified in committed evidence rather than reconstructed.

## Integration Test Evidence

The Task 7 local checkpoint passed 319 tests across 31 files, including built stdio and real loopback HTTP MCP smokes. Exact code-head CI `37838015911` on `1986831bf58fdd48ea5b0da64109898a768bd937` passed frozen install, format, tests, lint, typecheck and build. Ordinary verification used injected providers; no live LinkedIn request occurred.

The stdio and HTTP transports share one auth/approval/publishing runtime, so approval state and persistent idempotency behavior are consistent across real MCP client connections.

## Security Review

Whole-milestone skeptical/security review completed on 2026-10-09 with **0 unresolved Critical findings and 0 unresolved Important findings** and no blocking review threads.

The reviewed implementation enforces:

- strict canonical payload snapshots before async work;
- author derivation from authenticated subject only;
- `w_member_social` gate before approval consumption/reservation;
- short-lived subject/hash-bound approval with one-key consumption semantics;
- author-inclusive SHA-256 mutation fingerprints;
- process-local lifecycle serialization plus fail-closed cross-process file locking;
- durable success/failure/unknown states and no automatic retry after uncertain acceptance;
- exactly one POST for a new successful operation and no POST for successful replay;
- expected-context credential invalidation so delayed 401 handling does not clear newer credentials;
- optional GET only with trusted enablement and granted `r_member_social`;
- provider/admin credentials, author and read controls excluded from caller MCP inputs;
- bounded, sanitized outputs/audit metadata with no raw provider bodies, receipt IDs, idempotency keys or bearer tokens in errors/audit;
- provider provenance remains explicit and live availability remains conservative.

## Code Review Findings

Scoped M02.5, M02.6 and Task 7 review findings were fixed and re-reviewed before their recorded green checkpoints. The 2026-10-09 whole-milestone closeout review found no new Critical or Important issue.

Unresolved Critical findings: **0**.
Unresolved Important findings: **0**.
Blocking review threads: **0**.

## Fresh Verification Results

Task 7 implementation head `1986831bf58fdd48ea5b0da64109898a768bd937` passed exact-head PR CI `37838015911`: frozen install, format, tests, lint, typecheck and build.

Closeout documentation commit `4c2853037cc865e7d56c2230d351d215e1cab6dd` failed CI `37894812747` only at Prettier because two edited Markdown tables were not normalized. Formatting commit `a5030a609c9cb999a821f1e6489a6a990ffa53f4` then passed Prettier but CI `37895150596` exposed this ledger's missing mandatory framework headings. That failure is the RED evidence for the current ledger-repair change; source behavior remained 318/318 passing outside the framework assertion, with the single failure identifying the six missing headings.

The interactive closeout runtime could not reproduce the full suite locally because it exposed Node 22 rather than required Node 24, lacked pnpm and had no GitHub DNS. That limitation is not represented as passing local verification; exact-head GitHub Actions remains authoritative.

## Durable Recovery Sources

- `AGENTS.md`
- `CODEX-START-HERE.md`
- `docs/AUTONOMOUS-DEVELOPMENT.md`
- `docs/progress/project-state.json`
- `docs/progress/STATUS.md`
- `docs/progress/KNOWN-ISSUES.md`
- `docs/milestones/CURRENT.md`
- this M02 ledger
- `docs/product/CAPABILITY-MATRIX.md`
- `docs/requirements/TRACEABILITY.md`
- M02 design, plan and committed evidence under `docs/superpowers/`
- Git graph, PR #3, exact-SHA GitHub Actions and source/tests

## Completion Checklist

- [x] Acceptance criteria reviewed against source/tests/design.
- [x] Unresolved Critical findings = 0.
- [x] Unresolved Important findings = 0.
- [x] Task 7 exact code-head CI green at `1986831bf58fdd48ea5b0da64109898a768bd937` / `37838015911`.
- [ ] Exact closeout-docs final-head CI green.
- [ ] PR #3 merge + post-merge `main` CI verified.

Exact next work: **Verify the M02 closeout-docs pushed-head CI; if green with stable remote heads and clean reviews, mark PR #3 ready and squash-merge it, then verify post-merge main.**

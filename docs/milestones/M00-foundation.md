# M00 — Foundation + Autonomous Control Plane

Status: **IMPLEMENTING — M00.6 MCP server factory / real-client contract**

## Goal

Build the minimal production MCP runtime foundation and durable autonomous-development operating system together.

## Dependencies

None beyond the committed M00 design/plan and supported toolchain.

## In Scope

TypeScript/pnpm foundation, core provider-aware contracts, config/logging, `linkedin.health`, `linkedin.version`, `linkedin.capabilities`, stdio, Streamable HTTP, control-plane docs/verifiers, CI and exact-SHA closeout.

## Out of Scope

LinkedIn OAuth/tokens/account data, post mutation, search providers, browser automation, jobs, article publishing, database persistence unrelated to concrete M00 needs.

## Acceptance Criteria

- reproducible frozen dependency install;
- strict type/lint/format/test/build gates;
- real-client MCP contract coverage;
- stdio and hardened loopback HTTP work;
- truthful capability registry;
- autonomous framework/state/traceability/capability verifiers pass;
- zero unresolved Critical/Important findings;
- exact-final-head CI green;
- post-merge `main` CI green.

## Tasks / Iterations

1. **COMPLETE** — M00.1 toolchain/control-plane bootstrap + real lockfile.
2. **COMPLETE** — M00.2 autonomous/state verifiers.
3. **COMPLETE** — M00.3 core result/capability contracts.
4. **COMPLETE** — M00.4 config/logger.
5. **COMPLETE** — M00.5 foundation result factories.
6. **ACTIVE** — M00.6 MCP server factory/real-client contract.
7. **PLANNED** — M00.7 stdio transport.
8. **PLANNED** — M00.8 hardened Streamable HTTP.
9. **PLANNED** — M00.9 final CI/review/closeout.

## TDD Evidence

- M00.1 is configuration/documentation bootstrap; no artificial behavioral RED was invented.
- M00.2 first RED: `b66011d5edffd57ec38da356b179cedc52edd74d`, CI run `37308359474` — Vitest failed because `scripts/verify-autonomous-framework.ts` did not exist.
- M00.2 first GREEN: `0b7a6a4bd66ada6da4e53d2193e429cdabd4026c`, CI run `37308599483` — frozen install, format, tests, lint, typecheck and build passed.
- M00.2 expanded RED: `91c9668f1daf70482f9e3e8447fd57530d2ce92c`, CI run `37309022429` — three verifier modules were missing and the ledger-section invariant failed.
- M00.2 expanded GREEN/full gate: `94f144166dcb8c85396ce3ff7bff8395f48b9854`, CI run `37309640467` — all framework tests and quality gates passed.
- M00.3 and M00.4 are complete in source/tests and re-verified by the current exact-head full quality gate. This recovery does not invent older per-unit RED/GREEN SHAs that were not re-observed.
- M00.5 RED: `f4e84d162394ffc6b27089512c0fc78ef02c4aca`, CI run `37321459005` — `foundation.test.ts` could not import the intentionally missing `apps/server/src/foundation.ts`; 26 unrelated tests passed.
- M00.5 intermediate diagnostic: `2bfb2eaca8f47eed46aa46f28f9edc4411d47fe6`, CI run `37349330469` — behavior implementation was present, but the format gate correctly failed before tests.
- M00.5 type-contract diagnostic: `30a0d83f56c71e895a8850a9bcf12dff6dd35605`, CI run `37349647425` — 29 tests and lint passed, then typecheck found `result.data` possibly undefined because the success factory return type was too weak.
- M00.5 GREEN: `c2ae24bff19ff0499d318c39b455ac0ba9e58d77`, CI run `37349762748` — frozen install, format, 29 tests, lint, typecheck and build all passed.
- Ruling: M00.6 will pin the stable MCP v2.0.0 client/server line instead of the plan's just-published 2.3.x baseline. The repository's seven-day `minimumReleaseAge` supply-chain policy and the instruction not to weaken security outrank dependency freshness; v2.0.0 is on the same stable v2 protocol line and supports the required v2 server/client APIs. Cost if wrong: recent SDK fixes or conveniences may be absent, so an upgrade must be reconsidered after the age gate with fresh contract tests and exact-SHA CI.

## Integration Test Evidence

Pending real-client MCP integration in M00.6 and built transport smoke coverage in M00.7–M00.8.

## Security Review

Initial policy requires loopback HTTP, Host/Origin validation, bounded body, secret redaction, no credentials in M00, no browser automation, explicit capability provenance. M00.2 verifiers reject unsupported provider/state values and VERIFIED capabilities lacking evidence. M00.5 health results explicitly report `linkedinConnected: false` and all three foundation results use `LOCAL_ONLY` provenance.

## Code Review Findings

Critical: 0 known. Important: 0 known. Independent closeout review pending.

## Fresh Verification Results

Exact-head PR CI run `37349762748` is GREEN on `c2ae24bff19ff0499d318c39b455ac0ba9e58d77` for frozen install, format, 29 tests, lint, typecheck and build. M00.6 has not started yet, so this evidence proves M00.5 completion but not M00.6 behavior.

## Durable Recovery Sources

`AGENTS.md` -> `docs/AUTONOMOUS-DEVELOPMENT.md` -> `docs/progress/project-state.json` -> `STATUS.md` -> `KNOWN-ISSUES.md` -> `CURRENT.md` -> this ledger -> PRD/traceability/capability matrix -> active spec/plan -> Git/PR/exact-head CI.

## Completion Checklist

- [ ] Requirements/iterations accounted for.
- [ ] TDD/integration evidence complete.
- [ ] Security/protocol review complete.
- [ ] Critical/Important findings resolved.
- [ ] Traceability/capability state reconciled.
- [ ] Exact-final-head CI green.
- [ ] M00 merged and post-merge `main` CI green.

## Exact Next Work

Establish the M00.6 real-client MCP contract RED so it fails for the missing server factory before any M00.6 production implementation is written.

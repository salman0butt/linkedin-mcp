# M00 — Foundation + Autonomous Control Plane

Status: **IMPLEMENTING — M00.3 core contracts**

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
3. **ACTIVE** — M00.3 core result/capability contracts.
4. **PLANNED** — M00.4 config/logger.
5. **PLANNED** — M00.5 foundation result factories.
6. **PLANNED** — M00.6 MCP server factory/real-client contract.
7. **PLANNED** — M00.7 stdio transport.
8. **PLANNED** — M00.8 hardened Streamable HTTP.
9. **PLANNED** — M00.9 final CI/review/closeout.

## TDD Evidence

- M00.1 is configuration/documentation bootstrap; no artificial behavioral RED was invented.
- M00.2 first RED: `b66011d5edffd57ec38da356b179cedc52edd74d`, CI run `37308359474` — Vitest failed because `scripts/verify-autonomous-framework.ts` did not exist.
- M00.2 first GREEN: `0b7a6a4bd66ada6da4e53d2193e429cdabd4026c`, CI run `37308599483` — frozen install, format, tests, lint, typecheck and build passed.
- M00.2 expanded RED: `91c9668f1daf70482f9e3e8447fd57530d2ce92c`, CI run `37309022429` — three verifier modules were missing and the ledger-section invariant failed.
- M00.2 expanded GREEN/full gate: `94f144166dcb8c85396ce3ff7bff8395f48b9854`, CI run `37309640467` — all framework tests and quality gates passed.

## Integration Test Evidence

Pending runtime MCP integration in M00.6–M00.8.

## Security Review

Initial policy requires loopback HTTP, Host/Origin validation, bounded body, secret redaction, no credentials in M00, no browser automation, explicit capability provenance. M00.2 verifiers reject unsupported provider/state values and VERIFIED capabilities lacking evidence.

## Code Review Findings

Critical: 0 known. Important: 0 known. Independent closeout review pending.

## Fresh Verification Results

Exact-head CI run `37309640467` is GREEN on `94f144166dcb8c85396ce3ff7bff8395f48b9854` for frozen install, format, tests, lint, typecheck and build. Newer documentation-only commits require later verification before any completion claim.

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

Establish the M00.3 provider/status/capability-registry RED, then implement the minimum truthful provider-aware core contracts.

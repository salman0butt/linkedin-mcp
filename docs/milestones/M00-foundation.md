# M00 — Foundation + Autonomous Control Plane

Status: **IMPLEMENTING — M00.1 bootstrap**

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

1. **ACTIVE** — M00.1 toolchain/control-plane bootstrap + real lockfile.
2. **PLANNED** — M00.2 autonomous/state verifiers.
3. **PLANNED** — M00.3 core result/capability contracts.
4. **PLANNED** — M00.4 config/logger.
5. **PLANNED** — M00.5 foundation result factories.
6. **PLANNED** — M00.6 MCP server factory/real-client contract.
7. **PLANNED** — M00.7 stdio transport.
8. **PLANNED** — M00.8 hardened Streamable HTTP.
9. **PLANNED** — M00.9 final CI/review/closeout.

## TDD Evidence

No behavioral RED/GREEN recorded yet. M00.1 is primarily configuration/documentation bootstrap; do not invent a behavioral RED for it.

## Integration Test Evidence

Pending.

## Security Review

Initial policy requires loopback HTTP, Host/Origin validation, bounded body, secret redaction, no credentials in M00, no browser automation, explicit capability provenance.

## Code Review Findings

Critical: 0 known. Important: 0 known. Independent closeout review pending.

## Fresh Verification Results

Not run yet. Record only observed results.

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

Finish bootstrap and generate/persist the real lockfile, then establish M00.2 RED.

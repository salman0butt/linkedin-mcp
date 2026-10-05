# M00 — Foundation + Autonomous Control Plane

Status: **IMPLEMENTING — M00.8 hardened Streamable HTTP**

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
6. **COMPLETE** — M00.6 MCP server factory/real-client contract.
7. **COMPLETE** — M00.7 stdio transport / built-process smoke.
8. **ACTIVE** — M00.8 hardened Streamable HTTP.
9. **PLANNED** — M00.9 final CI/review/closeout.

## TDD Evidence

- M00.2 first RED `b66011d5edffd57ec38da356b179cedc52edd74d`, run `37308359474`; expanded RED `91c9668f1daf70482f9e3e8447fd57530d2ce92c`, run `37309022429`; expanded GREEN `94f144166dcb8c85396ce3ff7bff8395f48b9854`, run `37309640467`.
- M00.5 RED `f4e84d162394ffc6b27089512c0fc78ef02c4aca`, run `37321459005`; GREEN `c2ae24bff19ff0499d318c39b455ac0ba9e58d77`, run `37349762748`.
- Ruling: M00.6 pins the stable MCP v2.0.0 client/server line instead of the plan's just-published 2.3.x baseline because the repository's seven-day `minimumReleaseAge` supply-chain policy outranks dependency freshness. Cost if wrong: recent SDK fixes/conveniences may be absent and require a later upgrade with fresh contract verification.
- M00.6 health RED `c07a4d71c4590065c3e2d8a95468ef2b187d860d`, run `37351189511`; health GREEN `a281e3b4e2da9849b561017a6ae768962684901f`, run `37351359309`.
- M00.6 version RED `52d6ce6538cc78b09bc8d6427e5dfdf416019437`, run `37351517171`; GREEN `e78ad1aa7463b602546637a25d1875e4b5b33c6d`, run `37351830890`.
- M00.6 capabilities RED `0790a8a9eb0f15206ff759e0b4a5a62fcb2e1869`, run `37351982136`; formatted GREEN `162c2db665d9ecdfafa5e1d9ca7e053dbb02b99c`, run `37352516950`.
- M00.6 final exact-head GREEN `cdde65df7b8d267646da67684586372421d8c1ff`, run `37353017223` — 34 tests plus format/lint/typecheck/build passed.
- M00.7 RED `002f25a898fde12ea4fbfd2bd14d6aa89f266ff3`, run `37357906577` — real `StdioClientTransport` failed because the built `dist/stdio.js` entrypoint did not exist; 35 other tests passed.
- M00.7 implementation candidate `058778765c253bb0a42d61ed6a26fb3de9295c64`, run `37358810748` — formatting-only failure before behavior.
- M00.7 GREEN `ee0984919bfc90be79a073737cbf800e1eb057be`, push run `37358904283` — built server smoke through real `StdioClientTransport` passed, stdout remained protocol-clean, and 36/36 tests plus format/lint/typecheck/build passed. Duplicate PR run `37358912660` was cancelled after every quality step succeeded and is not used as completion evidence.

## Integration Test Evidence

M00.6 uses the real `@modelcontextprotocol/client` with `StreamableHTTPClientTransport` against an in-process `createMcpHandler` bridge for all three foundation tools. M00.7 adds a built-process integration test: a real `StdioClientTransport` spawns `apps/server/dist/stdio.js`, calls `linkedin.health`, validates truthful `LOCAL_ONLY` health, and separately proves no startup/non-protocol text is emitted on stdout.

## Security Review

No LinkedIn credentials, account access, browser automation, or mutation exists in M00. Health remains `linkedinConnected: false` with `LOCAL_ONLY` provenance. stdio reserves stdout for MCP protocol traffic; non-protocol output is prohibited by the M00.7 smoke test. HTTP Host/Origin/body-size hardening remains active work in M00.8.

## Code Review Findings

Critical: 0 known. Important: 0 known. Independent closeout review pending. Packaging note: the current server build imports the built core package by repository-relative path; reassess this during M00.9 package/consumer review and replace with a lockfile-backed workspace dependency if verification permits.

## Fresh Verification Results

Exact-head push CI run `37358904283` is GREEN on `ee0984919bfc90be79a073737cbf800e1eb057be`: frozen install, format, 36/36 tests across 11 files, lint, typecheck and build all passed. M00.7 is complete; hardened HTTP acceptance remains pending.

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

Establish the M00.8 HTTP composition RED by requiring a loopback Streamable HTTP server lifecycle from the not-yet-created `apps/server/src/http.ts` module.

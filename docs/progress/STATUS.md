# Project Status

Last reconciled: 2026-10-05. Actual Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M00 — Foundation + Autonomous Control Plane — **ACTIVE**.

Active task: M00.8 hardened Streamable HTTP transport.

Active branch: `feat/m00-foundation`.
Active PR: #1 — `Build LinkedIn MCP foundation` (draft).
Latest verified SHA: `ee0984919bfc90be79a073737cbf800e1eb057be`.
CI status: GREEN — push CI run `37358904283` passed frozen install, format, 36 tests, lint, typecheck and build on that exact SHA.
Critical findings: 0 known unresolved.
Important findings: 0 known unresolved.

## Recent Evidence

- M00.5 GREEN: run `37349762748` on `c2ae24bff19ff0499d318c39b455ac0ba9e58d77` passed 29 tests plus all quality gates.
- M00.6 final contract GREEN: run `37353017223` on `cdde65df7b8d267646da67684586372421d8c1ff` passed 34 tests plus format, lint, typecheck and build; real MCP client coverage includes all three M00 tools and native input validation.
- M00.7 RED: run `37357906577` on `002f25a898fde12ea4fbfd2bd14d6aa89f266ff3` failed exactly because `apps/server/dist/stdio.js` did not exist. The real `StdioClientTransport` observed `CONNECTION_CLOSED`; 35 unrelated tests passed.
- M00.7 first implementation candidate `058778765c253bb0a42d61ed6a26fb3de9295c64` was blocked by a single Prettier formatting drift before behavior ran.
- M00.7 GREEN: push run `37358904283` on `ee0984919bfc90be79a073737cbf800e1eb057be` passed frozen install, format, all 36 tests across 11 files, lint, typecheck and build. The built-process smoke called `linkedin.health` through the real `StdioClientTransport`, and the stdout-safety assertion passed.
- Duplicate PR run `37358912660` on the same SHA was cancelled after install/format/tests/lint/typecheck/build all succeeded; it is explicitly not the completion evidence.

## Closeout Review Note

The server build currently consumes `packages/core/dist` through an internal repository-relative import so CI can build without regenerating the lockfile. This is behaviorally verified but should be reassessed during M00.9 packaging/architecture review; a declared workspace dependency is preferred when the lockfile can be regenerated and verified rather than hand-edited.

## Blockers

No repository/product blocker is currently known. Interactive container network isolation remains an execution-environment limitation; dependency resolution and authoritative verification use GitHub Actions.

Exact next work: establish the M00.8 HTTP composition RED by requiring a loopback Streamable HTTP server lifecycle from the not-yet-created `apps/server/src/http.ts` module.

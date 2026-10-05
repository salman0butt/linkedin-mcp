# Project Status

Last reconciled: 2026-10-05. Actual Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M00 — Foundation + Autonomous Control Plane — **ACTIVE**.

Active task: M00.7 stdio transport and built-process smoke.

Active branch: `feat/m00-foundation`.
Active PR: #1 — `Build LinkedIn MCP foundation` (draft).
Latest verified SHA: `cdde65df7b8d267646da67684586372421d8c1ff`.
CI status: GREEN — PR CI run `37353017223` passed frozen install, format, 34 tests, lint, typecheck and build on that exact SHA.
Critical findings: 0 known unresolved.
Important findings: 0 known unresolved.

## Evidence

- M00.1: real registry-generated `pnpm-lock.yaml` is committed and permanent frozen-lockfile CI is active.
- M00.2 first RED: run `37308359474` on `b66011d5edffd57ec38da356b179cedc52edd74d` failed because `verify-autonomous-framework.ts` did not exist.
- M00.2 first GREEN: run `37308599483` on `0b7a6a4bd66ada6da4e53d2193e429cdabd4026c` passed.
- M00.2 expanded RED: run `37309022429` on `91c9668f1daf70482f9e3e8447fd57530d2ce92c` failed on the three missing verifier modules and the missing ledger-section invariant.
- M00.2 expanded GREEN/full quality gate: run `37309640467` on `94f144166dcb8c85396ce3ff7bff8395f48b9854` passed.
- M00.3 core provider-aware contracts and M00.4 config/logger are present in source/tests and are covered by the current exact-head full quality gate; older per-unit evidence is not reconstructed when it was not re-observed.
- M00.5 RED: run `37321459005` on `f4e84d162394ffc6b27089512c0fc78ef02c4aca` failed because `apps/server/src/foundation.ts` did not exist; 26 other tests passed.
- M00.5 first GREEN candidate `2bfb2eaca8f47eed46aa46f28f9edc4411d47fe6` reached run `37349330469`, which failed only the format gate.
- M00.5 formatted candidate `30a0d83f56c71e895a8850a9bcf12dff6dd35605` reached run `37349647425`; format/tests/lint passed and typecheck exposed that successful factories still had optional `data` in their public return type.
- M00.5 final GREEN: run `37349762748` on `c2ae24bff19ff0499d318c39b455ac0ba9e58d77` passed frozen install, format, 29 tests, lint, typecheck and build.
- M00.6 health RED: run `37351189511` on `c07a4d71c4590065c3e2d8a95468ef2b187d860d` failed because the real-client contract imported the intentionally missing `apps/server/src/create-server.ts`; the other 29 tests passed.
- M00.6 health GREEN: run `37351359309` on `a281e3b4e2da9849b561017a6ae768962684901f` passed after registering the health tool and correcting the handler contract.
- M00.6 version RED/GREEN: run `37351517171` on `52d6ce6538cc78b09bc8d6427e5dfdf416019437` failed for the newly required version contract; run `37351830890` on `e78ad1aa7463b602546637a25d1875e4b5b33c6d` passed after version registration.
- M00.6 capabilities RED/GREEN: run `37351982136` on `0790a8a9eb0f15206ff759e0b4a5a62fcb2e1869` failed for the newly required capabilities contract; the first implementation candidate `4628e734f8e0fbb3d2eab6154b893bfe6806893e` exposed formatting drift in run `37352109168`; formatted commit `162c2db665d9ecdfafa5e1d9ca7e053dbb02b99c` passed run `37352516950`.
- M00.6 final contract coverage added the exact three public tool names, input/output schemas, truthful structured results, and MCP-native malformed-argument rejection. Exact-head run `37353017223` on `cdde65df7b8d267646da67684586372421d8c1ff` passed 34 tests plus format, lint, typecheck and build.

## Blockers

No repository/product blocker is currently known. Interactive container network isolation remains an execution-environment limitation; dependency resolution and authoritative verification use GitHub Actions.

Exact next work: establish the M00.7 built-process stdio smoke RED so the real `StdioClientTransport` fails against the not-yet-created stdio entrypoint before production stdio composition is added.

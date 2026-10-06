# Project Status

Last reconciled: 2026-10-06. Actual Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M00 — Foundation + Autonomous Control Plane — **ACTIVE**.

Active task: M00.9 final CI/review/closeout.

Active branch: `feat/m00-foundation`.
Active PR: #1 — `Build LinkedIn MCP foundation` (draft).
Latest verified SHA: `ba54ab6a531743c75c4dc8decb5323365f7936f4`.
CI status: GREEN — PR CI run `37423240732` passed frozen install, format, 41/41 tests across 13 files, lint, typecheck and build on that exact SHA.
Critical findings: 0 known unresolved.
Important findings: 0 known unresolved.

## Recent Evidence

- M00.5 GREEN: run `37349762748` on `c2ae24bff19ff0499d318c39b455ac0ba9e58d77` passed 29 tests plus all quality gates.
- M00.6 final contract GREEN: run `37353017223` on `cdde65df7b8d267646da67684586372421d8c1ff` passed 34 tests plus format, lint, typecheck and build; real MCP client coverage includes all three M00 tools and native input validation.
- M00.7 GREEN: push run `37358904283` on `ee0984919bfc90be79a073737cbf800e1eb057be` passed 36/36 tests plus all quality gates; a real `StdioClientTransport` spawned the built server and stdout remained protocol-clean.
- M00.8 Origin RED: run `37384898711` on `4cf14883e5bcfd9e7164e4a712a64411b05625e6` failed because a non-loopback browser Origin reached MCP handling and returned 405 instead of 403.
- M00.8 Origin GREEN: run `37422617115` on `6d3838e6e6a00ac3ce08cd37125665221fe5ebd2` passed after adding loopback Origin validation while preserving origin-less clients.
- M00.8 body-limit RED: run `37422753874` on `8dd0e2c2577c160461ed4ac748baaa90e4058027` failed because a request one byte over 1 MiB reached MCP handling and returned 406 instead of 413; 39 unrelated tests passed.
- M00.8 body-limit GREEN: run `37422908723` on `34dd83d3072d7ff03bedeea86e2c7fb4d1511cc8` passed after adding streaming byte-bound enforcement.
- M00.8 real HTTP client smoke: the first harness at `8cafcd09f1a598dbd77ce6b1a5ee72fdbd312038` exposed a strict pnpm workspace-resolution issue, not a server defect. The corrected workspace-context smoke is GREEN in run `37423240732` on `ba54ab6a531743c75c4dc8decb5323365f7936f4`; all 41 tests pass, including a real loopback `StreamableHTTPClientTransport` call to `linkedin.health`.

## Closeout Review Note

The server build currently consumes `packages/core/dist` through an internal repository-relative import so CI can build without regenerating the lockfile. This is behaviorally verified but must be reassessed during M00.9 packaging/architecture review; a declared workspace dependency is preferred if the lockfile can be regenerated and exact-head verified.

## Blockers

No repository/product blocker is currently known. Interactive container network isolation remains an execution-environment limitation; dependency resolution and authoritative verification use GitHub Actions.

Exact next work: perform the M00.9 skeptical closeout review, starting with transport security and package-consumer architecture.

# M00 — Foundation + Autonomous Control Plane

Status: **CLOSEOUT — final exact-head CI and merge gate**

## Goal

Build the minimal production MCP runtime foundation and durable autonomous-development operating system together without implying LinkedIn account access that does not exist.

## Dependencies

None beyond the committed M00 design/plan and supported toolchain.

## In Scope

TypeScript/pnpm foundation, provider-aware result/capability contracts, config/logging, `linkedin.health`, `linkedin.version`, `linkedin.capabilities`, stdio, hardened loopback Streamable HTTP, durable control-plane docs/verifiers, CI and exact-SHA closeout.

## Out of Scope

LinkedIn OAuth/tokens/account data, publishing, search providers, browser automation, jobs, article publication and unrelated persistence.

## Acceptance Criteria

- reproducible frozen dependency install;
- strict format/test/lint/typecheck/build gates;
- real-client MCP contract coverage;
- real built-process stdio and real loopback Streamable HTTP smokes;
- truthful provider/capability registry;
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
8. **COMPLETE** — M00.8 hardened Streamable HTTP.
9. **ACTIVE** — M00.9 final exact-head CI, merge and post-merge verification.

## TDD / Integration Evidence

Earlier RED→GREEN evidence is retained in Git history and the active M00 plan. Final transport and closeout evidence includes:

- M00.7 RED `002f25a898fde12ea4fbfd2bd14d6aa89f266ff3`, CI `37357906577`; GREEN `ee0984919bfc90be79a073737cbf800e1eb057be`, CI `37358904283`.
- M00.8 Origin RED `4cf14883e5bcfd9e7164e4a712a64411b05625e6`, CI `37384898711`; GREEN `6d3838e6e6a00ac3ce08cd37125665221fe5ebd2`, CI `37422617115`.
- M00.8 request-body RED `8dd0e2c2577c160461ed4ac748baaa90e4058027`, CI `37422753874`; GREEN `34dd83d3072d7ff03bedeea86e2c7fb4d1511cc8`, CI `37422908723`.
- Real loopback HTTP client smoke GREEN `ba54ab6a531743c75c4dc8decb5323365f7936f4`, CI `37423240732`.
- M00.9 non-loopback bind RED `3aa9ab75ec02a3e42d4d4ff1ccf913bd9417390a`, CI `37423852402`; GREEN `879dc7b2192d2ab4061c8df6d7795feb93c43451`, CI `37423957386`.
- M00.9 cross-loopback Origin RED `4426ac3f1c8a3578299702d5f24662683df9eb45`, CI `37424095301`; GREEN `b689f186871e7d2e8ec44af781908f38200105dc`, CI `37424326224`.
- M00.9 capability truthfulness RED `4b1e5cfcbaee225568df97e5d7b5d56408540d16`, CI `37424506312`; final GREEN `5302c241d0c50ed487e342769158c56e27479ca4`, CI `37424866957`.

CI `37424866957` passed frozen install, formatting, 42/42 tests across 13 files, lint, typecheck and build. The test suite includes a real `StdioClientTransport` built-process call and a real loopback `StreamableHTTPClientTransport` call.

## Security / Protocol Review

M00 has no LinkedIn credentials, OAuth, account reads, writes or browser automation. Health remains `linkedinConnected: false` with `LOCAL_ONLY` provenance. stdio reserves stdout for protocol traffic. HTTP refuses non-loopback bind hosts before opening a socket, rejects unapproved Host values and cross-origin browser requests, permits origin-less MCP clients, enforces a default 1 MiB streaming request-body limit and closes cleanly.

Three Important closeout findings were discovered and resolved: non-loopback direct binding, cross-loopback Origin acceptance and stale M00 capability availability. Unresolved Critical: 0. Unresolved Important: 0.

## Packaging Review

Minor, non-blocking debt: the private server package currently consumes the private core build through a repository-relative path and explicitly builds core first. All M00 package/test/build/transport flows are green. Convert this to an explicit workspace dependency when external package-consumer boundaries are introduced.

## Completion Checklist

- [x] Requirements/iterations accounted for.
- [x] TDD/integration evidence complete.
- [x] Security/protocol review complete.
- [x] Critical/Important findings resolved.
- [x] Traceability/capability state reconciled.
- [ ] Exact-final-head closeout CI green.
- [ ] M00 merged and post-merge `main` CI green.

## Exact Next Work

Verify the closeout reconciliation commit on exact-head CI. If green and PR/review/mergeability gates remain clean, mark PR #1 ready, merge it, verify post-merge `main`, then activate M01.

# M00 Foundation Closeout Evidence

Date: 2026-10-06
Milestone: M00 — Foundation + Autonomous Control Plane
PR: #1 — `Build LinkedIn MCP foundation`

## Reviewed surfaces

- Git graph, PR state, reviews/threads and exact-SHA GitHub Actions evidence.
- `apps/server` MCP factory, foundation result factories, config, logger, stdio and HTTP transport.
- `packages/core` result and capability contracts.
- frozen dependency install, CI permissions and build/test scripts.
- durable project state, milestone ledger, requirements traceability and capability matrix.
- real stdio and loopback HTTP client smoke tests.

## Final verified implementation checkpoint

SHA `5302c241d0c50ed487e342769158c56e27479ca4` is GREEN in CI run `37424866957`:

- frozen dependency install: pass;
- formatting: pass;
- tests: 42/42 across 13 files pass;
- lint: pass;
- typecheck: pass;
- build: pass;
- real `StdioClientTransport` built-process smoke: pass;
- real loopback `StreamableHTTPClientTransport` smoke: pass.

## Skeptical review findings

### Important — direct HTTP factory allowed non-loopback bind hosts — RESOLVED

RED: `3aa9ab75ec02a3e42d4d4ff1ccf913bd9417390a`, CI `37423852402` proved `createHttpServer({ host: '0.0.0.0' })` could bind successfully.

GREEN: `879dc7b2192d2ab4061c8df6d7795feb93c43451`, CI `37423957386` rejects non-loopback bind hosts before any socket is opened.

### Important — browser Origin accepted another loopback service/port — RESOLVED

RED: `4426ac3f1c8a3578299702d5f24662683df9eb45`, CI `37424095301` proved a different loopback port passed the Origin gate and reached MCP handling.

GREEN: `b689f186871e7d2e8ec44af781908f38200105dc`, CI `37424326224` requires browser Origin to match the HTTP request origin while preserving origin-less MCP clients.

### Important — implemented M00 local capabilities reported unavailable — RESOLVED

RED: `4b1e5cfcbaee225568df97e5d7b5d56408540d16`, CI `37424506312` proved the three implemented M00 local tools were still not `AVAILABLE/VERIFIED`.

GREEN: `5302c241d0c50ed487e342769158c56e27479ca4`, CI `37424866957` marks exactly the M00 local tools `AVAILABLE/VERIFIED` with evidence. M01+ LinkedIn capabilities remain unavailable and unverified.

## Security and provenance conclusions

- No LinkedIn credentials, OAuth flow, account reads, publishing, messaging or browser automation exists in M00.
- `linkedin.health` remains local-only and explicitly reports `linkedinConnected: false`.
- stdio stdout is protocol-only in the built-process smoke.
- HTTP is loopback-only by construction, validates Host and same-origin browser Origin, permits origin-less MCP clients, bounds request bodies to 1 MiB by default and closes cleanly.
- Future capability provider classes remain explicit; partner, external-discovery, browser-interactive and unavailable behavior is not silently represented as official LinkedIn API access.
- Browser-interactive future work remains required to stop at CAPTCHA/security challenges and may not bypass platform controls.

## Packaging review

Minor, deferred: `@linkedin-mcp/server` and `@linkedin-mcp/core` are both private, but server source currently consumes the built core output through a repository-relative path and builds core explicitly. Current monorepo/frozen-install/build/transport verification is green. When package-consumer boundaries expand, replace this with an explicit workspace dependency and regenerate the lockfile under the repository supply-chain policy.

## Finding count

Unresolved Critical: 0.
Unresolved Important: 0.
Unresolved Minor: 1 packaging-boundary debt, documented in `KNOWN-ISSUES.md`.

## Remaining merge gate

This evidence file and the final traceability/state reconciliation must themselves pass exact-head CI. After that, re-check remote head, reviews/threads and mergeability, mark PR #1 ready, merge under repository convention, and verify post-merge `main` CI before activating M01.

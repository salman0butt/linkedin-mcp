# Project Status

Last reconciled: 2026-10-07. Actual Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M01 — Authentication & Identity — **ACTIVE, M01.8 closeout**.

Active branch: `feat/m01-auth-identity`.
Active PR: #2 — `Build M01 authentication and identity` (draft until final-head gates pass).
Latest verified closeout SHA: `aa1c81397aeb67361afec8fa353dbe62be6fe3ed`.
Latest verified CI: `37739092014` — frozen install, format, 105/105 tests across 23 files, lint, typecheck and build passed, including real stdio/HTTP auth smokes and autonomous-framework ledger verification.
Verified base `main`: `dde9bde5b136b0c352a864fadce08f02cab32938`; post-M00 CI `37469308840` GREEN.
Critical findings: 0 unresolved.
Important findings: 0 unresolved.

## M01 Implementation Summary

- M01.2 auth configuration/contracts: GREEN `30ec5b4ac6d867b7cd50b7f2e2d7e7ad007386bc`, CI `37482919464`.
- M01.3 OAuth session/callback: reviewed GREEN `9035cebcaba485429d77efd0c487de811296051e`, CI `37585523117`.
- M01.4 encrypted credential store: reviewed GREEN `9fcb2c8cf1e18df72217affe0f854fc798303e65`, CI `37588029054`.
- M01.5 official OAuth adapter: GREEN `faedaf2f53b3b7f000bc702650421c2e348b057a`, CI `37593107489`.
- M01.6 OIDC userinfo identity: GREEN `e9f138d4286dd99eab64bd1170132c4a69b57a1c`, CI `37612551536`.
- M01.7 lifecycle/callback integration: lifecycle GREEN `aa6e09b141366fe5e6d1804c6013096be2dccbcb`, CI `37615170527`; callback review RED `8a044af98a38c7f182012cbf77426c91493bd564`, CI `37615537027`, then reviewed GREEN `bc880dc9fe3435b0bec2f9d9444163d5edbc9695`, CI `37616331784`.
- M01.7 MCP integration: RED `e030911064acde6f69bf1cc341dd141127c89406`, CI `37623309357`; GREEN `5d2aea6425d7c9398a853edcc7ae018002b70d2a`, CI `37656151910`.

## M01.8 Skeptical / Security Review

Self-review was required because this session has no subagent reviewer tool. Three Important integration findings were identified and resolved with genuine regression RED→GREEN cycles:

1. MCP auth failures/statuses were not mapped into explicit ToolResult states. RED `01ff034b81584d7d53a07aaa064408f6b416b27b`, CI `37657296785`; GREEN `40f770e8d48a97564066efd3f19981c25fb9e538`, CI `37657621857`.
2. Built stdio/HTTP entrypoints did not inject AuthService, so auth tools existed only in injected tests. RED `2bf25ed01cefc91479dae27fbdd21ccaa472b948`, CI `37657889533`; GREEN `80f5d33e4ad4f7ab1fc37cade4ad8be9eff58344`, CI `37658194001`.
3. Local credential cleanup failure during logout escaped the structured MCP result boundary. RED `4a978e6f2076886f759de038c04d589455c367c5`, CI `37658686972`; GREEN `917e07a950f7732a4315daebd8d7d9e7af266a12`, CI `37658914319`.

Review focus covered state replay/expiry, loopback callback binding/path, PKCE mode correctness, encrypted credential tamper/wrong-key handling, downstream 401→reauth without retry loops, refresh entitlement truth, optional OIDC email claims, secret-safe provider errors, runtime transport wiring, capability provenance and local-only logout semantics. Zero Critical/Important findings remain open.

## Capability Truth / External Gate

M01 deterministic implementation is verified. `profile.me` remains `OFFICIAL_API`, `ACTIVE`, and `UNAVAILABLE` in the static product matrix because no live configured LinkedIn developer app/member call was executed in CI. Native PKCE enablement and programmatic refresh remain access-dependent and are not claimed as universally available. Local logout never claims remote revocation.

Ruling: OAuth `state` necessarily appears inside the opaque provider authorization URL sent to the user/browser; it is not returned as a separate MCP field and must never be logged or echoed in errors. Removing it from the authorization URL would break CSRF protection and the OAuth flow.

## Known Carryover

The M00 private package-boundary debt remains Minor and deferred. GitHub Actions remains the authoritative exact-head verification environment in connector sessions.

Exact next work: verify exact-final-head CI on the durable-state reconciliation commit, then merge PR #2 if all merge gates remain satisfied.

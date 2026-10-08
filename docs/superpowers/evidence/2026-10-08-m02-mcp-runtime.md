# M02 Task 7 MCP tools and shared runtime evidence

Baseline: `1a2cef29d88f7032d5befe18efb627736e49da16`, existing draft PR #3. No new branch/PR or live LinkedIn calls.

## Observed RED and its limits

Before MCP implementation, real client calls through the existing server failed because the three publishing tools were missing: 10 failed / 4 passed across two files. The discovery-only run failed 1 / passed 4. Config tests before configuration implementation failed 13 / passed 19 for ignored path, TTL, read flag, defaults and validation. These were executed behavioral failures, not uncollected suites.

The consolidated RED was captured after configuration had already been implemented, so it is not additional config RED. Runtime/transport and later safety coverage first ran GREEN and are not claimed as historical RED. The first built smoke attempt used stale dist output because direct Vitest invocation skipped the pretest build; those missing-tool failures are not valid pre-implementation transport RED. Rebuilding exposed TypeScript optional-property issues, which were corrected. No RED history is reconstructed from the current passing suite.

## Implemented boundaries

All built runtimes discover ten tools, including local preview and explicit local approval plus official-target text creation. Strict root/nested schemas reject caller author, credentials, provider and administrative controls. Missing or invalid receipt shapes return structured requires_approval before dependencies. Approval checks only local persisted connection/subject/grant and never refreshes or calls the provider. Publication delegates to the reviewed Task6 service; no auto-approval or alternate mutation path exists.

The factory shares one approval service, ledger and publisher across connections. Version plus explicit private ledger path are required to construct publishing; partial configuration creates no ledger/provider work. TTL is bounded, read defaults disabled, and credential/ledger lexical path collisions reject. Runtime success does not upgrade static live capability availability. Success preserves independent verification state and no verified URL is fabricated.

## Scoped independent review

Initial review: 0 Critical, 1 Important durable MCP-boundary safety-coverage finding, 1 Minor exact-envelope coverage finding. Tests now retain false/missing confirmation, blank subject, strict controls, member and payload mismatch, consumed receipt/new key, actual idempotency conflict, exact typed errors and verification success variants. HTTP uses the real runtime, memory approval state, file-backed ledger and Task6 service, injecting only auth/provider responses; two clients perform one POST and two fresh verification GETs.

The first fix re-review found one new Important issue: replacing the create validation test removed prior preview/approval strict cases. They were restored, plus an independent approve-root case, with zero status/issue/publish effects. Expanded create assertions remain. Final scoped re-review: 0 Critical/Important/Minor. No production source changes were necessary for these coverage fixes; they first ran GREEN. Fixture setup errors are not claimed as behavior RED.

## Verification

Final focused MCP/HTTP: 41 tests across two files. Controller full `pnpm test`: 319 passed across 31 files. Implementer format, full test, lint, typecheck, build and diff check all exited 0 on the frozen source/test state. Built stdio and real loopback HTTP smokes use sanitized inherited configuration, retain security checks and assert protocol-only stdout. README/configuration template reflect supported behavior with blank commented optional secret settings.

This is local Task7 evidence, not exact-final-head CI, whole-milestone approval, merge, or live availability. Last verified remote checkpoint is Task6 `1a2cef29d88f7032d5befe18efb627736e49da16` / CI `37832719872` Success; Task7 pushed-head CI is pending. Actions raw log download is blocked at a separate results destination; exact-SHA metadata/quality step results are available. No live LinkedIn reads/writes or automation-management calls were made.

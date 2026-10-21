# M04.7 Trusted Approval Security Remediation — Local Evidence

Date: 2026-10-21. Base remote M04 head: `6d126472d560fbe428f6bd5d6b099f75b3a071d0`; prior exact-head GitHub CI `39578141149` succeeded. This document records local work that is **not yet verified by new-head GitHub CI**.

## Behavioral RED → GREEN

- New host-grant store: initial focused Vitest run failed because `trusted-approval-grants.js` did not exist. After implementation, four focused grant tests passed.
- Runtime enforcement: two tests failed as intended because approval issuance still succeeded without a trusted grant. After wiring the guard, the runtime/grant focused suite passed 11/11 tests.
- Production MCP contract: six approval calls (text, image, multi-image, reply, reaction add/remove) failed the new assertions because they returned generic `failed` statuses rather than `human_action_required`. After typed error propagation, all twelve denial/positive-grant MCP tests passed.
- Cross-client grant theft: a new same-member second-client regression initially FAILED because a matching hash could consume a host grant without a secret ID. The grant issuer now returns an unpredictable 256-bit single-use `trustedGrantId`; all six MCP approval tools require that ID to consume a matching host grant. Wrong or missing IDs do not consume the valid grant. Positive approval tests pass the host-issued ID, preserving fail-closed defaults.
- Bearer leakage: an injected receipt-store regression was observed RED because consumed `trustedGrantId` was forwarded in the receipt issuance input. The shared guard now forwards only subject and purpose-scoped payload hash. The regression passed GREEN.
- The existing real HTTP approval/publishing integration was updated to simulate a trusted host grant; it still verifies shared receipt state and idempotent replay across two MCP clients.

## Local verification

On Node `v24.11.1` with pnpm `12.9.1`, the updated full suite passed **579/579 tests across 64 files**, including real stdio/HTTP smoke suites. ESLint, TypeScript typecheck, formatting and workspace build passed on the reviewed source before the final bearer-leakage assertion was added; subsequent focused 25/25 tests and typecheck passed. The macOS environment uses `TMPDIR=/private/tmp` to avoid the pre-existing `/var` versus `/private/var` temp-path alias in media-config tests; no media-config source or assertions were changed. Final full-suite rerun and exact-new-head CI are required before a completion claim.

## Boundary and limitations

The production runtime now gates receipt issuance on a host-owned, single-use subject/purpose/hash grant with an unpredictable bearer ID; it consumes the ID before calling the receipt store and never forwards it there. No model/MCP tool can issue the host grant. Default stdio/HTTP has no trusted host approval UI and intentionally fails closed. A trusted embedding host must privately supply the capability to the intended approved request, not include it in model prompts or logs. This is not a claim that a human approval UI or live LinkedIn Community Management entitlement has been exercised.

Pending: independent security review (the two dispatched remote review workers timed out without reports), durable GitHub write, exact-new-head CI, traceability/merge gates and post-merge verification.

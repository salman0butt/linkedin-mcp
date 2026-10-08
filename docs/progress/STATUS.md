# Project Status

Last reconciled: 2026-10-08. Actual Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M02 — Text Publishing — **ACTIVE, M02.7 skeptical/security closeout**.

Active branch: `feat/m02-text-publishing`.
Active PR: #3 — draft.
Design: `docs/superpowers/specs/2026-10-08-m02-text-publishing-design.md`.
Plan: `docs/superpowers/plans/2026-10-08-m02-text-publishing.md`.

## M02 Progress

M02.1 canonical text-post contracts are complete. RED `7c193f9adb8049a5849c603a5c5e29bea69ef59d` / CI `37753499633`; GREEN `c1dab02097f0e7c816ab0d80b6485024d4cbea07` / CI `37753956032`, with format, 111/111 tests, lint, typecheck and build green.

M02.2 approval receipts are complete. RED `7b55eb7a09f7010acffd6ba5a6c928b99099f472` / CI `37754698723`; GREEN `5f1870106988c6b5ab365df275a8b3a314c60aa5` / CI `37754858404`, with format, 116/116 tests, lint, typecheck and build green. Receipts are LOCAL_ONLY, bind payload hash + authenticated subject + bounded expiry, and bind one idempotency key on first consumption.

M02.3 persistent idempotency is complete. Valid RED `a99a0d59d66c37ac120d6efe4ac2ab364cf4aa0a` / CI `37755801316` passed formatting, kept all 116 existing tests green and failed only because the ledger module did not exist. GREEN `c88ae5b909888e796880f0193299cd21e1246648` / CI `37756724053` passed format, 123/123 tests across 26 files, lint, typecheck and build. The versioned JSON ledger uses restrictive permissions, same-directory atomic replacement, fail-closed corrupt-state handling, restart replay, hash conflicts, and durable `outcome_unknown` so uncertain remote acceptance is never automatically retried.

M02.4 official Posts adapter is complete. Valid RED `7817938bb2efcdc577d04c00b5b8625216ad6d29` / CI `37762083892` passed formatting, kept all 123 pre-existing tests green, failed the new Posts suite because the adapter did not yet exist, and failed the new configuration assertions because YYYYMM API-version support was absent. GREEN `90267d9e27bbef705e93b9ec8250548ae815b7ce` / CI `37762622471` passed format, 140/140 tests across 27 files, lint, typecheck and build. The adapter performs exactly one official `POST /rest/posts`, uses explicit `Linkedin-Version` and Rest.li headers, requires a valid `x-restli-id` for success, sanitizes provider failures, never reads raw provider bodies, and maps transport uncertainty to non-retryable `outcome_unknown`.

Skeptical/security review through M02.4 found no unresolved Critical or Important issue in the scoped deterministic implementation. The provider adapter does not place bearer tokens in URLs, does not expose provider raw bodies, and contains no automatic retry loop.

`post.create.text` remains `OFFICIAL_API`, ACTIVE for deterministic implementation work, and live `UNAVAILABLE` until legitimate configured LinkedIn write access is actually verified.

## Completed Milestones

M01 — Authentication & Identity merged through PR #2 at `3dbf3e2ced5303b52fc27303de9c086a998835c7`. Post-merge main CI `37739373991` passed format, 105/105 tests, lint, typecheck and build.

M00 foundation/control-plane remains verified from its post-merge main gate.

## M02 Safety / Provider Ruling

M02 targets LinkedIn's official Posts API for authenticated-member text publishing. `w_member_social` is required for member writes. Every mutation requires an approval receipt bound to the exact canonical payload and authenticated subject plus a caller idempotency key. A possibly-sent request with uncertain provider outcome is never automatically retried.

Downstream read verification remains access-dependent and must not turn legitimate write-only access into a false failure. Ordinary CI must never publish a real LinkedIn post.

## Known Carryover

The M00 private package-boundary debt remains Minor and deferred. Live LinkedIn capability availability remains dependent on legitimate configured developer/member access.

## M02.5 local checkpoint

Publish orchestration and safety review passed locally: 204 tests across 29 files, format, lint, typecheck and build. Both Important review findings and the Minor storage finding were addressed. Historical RED limits and the observed regression cycles are recorded in `docs/superpowers/evidence/2026-10-08-m02-publish-orchestration.md`. The subsequent exact pushed-head CI result is recorded below; no live LinkedIn write was performed.

M02.5 exact checkpoint `84b36492da74961965ba3ae2cfb6e9c8a4c239e6`, CI `37793478842`, is GREEN. Format, tests, lint, typecheck and build completed; local suite at this checkpoint passed 204 tests. All scoped review findings are addressed. GitHub API access recovered later in this run; fresh API reads confirm PR #3 remains the sole open milestone PR, with no reviews or review threads and a mergeable head. All final merge gates still require fresh checks.

## M02.6 downstream verification checkpoint

Task 6 is implemented and independently re-reviewed: optional official GET, explicit legitimate read gate, exact comparison and fresh replay evidence preserve durably succeeded creation. Final local verification passed 265 tests across 29 files plus format/lint/typecheck/build. All scoped findings are resolved; whole-milestone review remains pending. See `docs/superpowers/evidence/2026-10-08-m02-downstream-verification.md` for qualified RED/GREEN and security evidence. Subsequent pushed-head CI passed at `1a2cef29d88f7032d5befe18efb627736e49da16` / run `37832719872`.

Task6 pushed checkpoint `1a2cef29d88f7032d5befe18efb627736e49da16` passed exact-head CI `37832719872`: frozen install, format, test, lint, typecheck and build. Required quality steps all succeeded; the local suite at this source checkpoint passed 265 tests. Actions log downloads remain blocked at the results-receiver destination, so no remote log count is claimed. Task7 implementation subsequently passed the local checkpoint below.

## Task 7 local checkpoint

The three publishing tools and shared runtime are implemented and scoped independent review is clear (0 Critical/Important/Minor). Controller verification passed 319 tests across 31 files; implementer format, lint, typecheck and build also passed. Real MCP clients, built stdio and loopback HTTP cover discovery, local preview/approval, structured outcomes and shared one-POST replay. Restored strict preview/approval assertions remain alongside expanded create validation. README and configuration template describe the actual runtime and safety gates.

See `docs/superpowers/evidence/2026-10-08-m02-mcp-runtime.md` for qualified behavioral RED and first-GREEN coverage. These changes await pushed-head CI. Latest verified remote checkpoint remains `1a2cef29d88f7032d5befe18efb627736e49da16` / CI `37832719872`. Whole-milestone review, final merge gates and post-merge main verification remain pending. Live LinkedIn access remains unverified; no live reads or writes occurred.

Exact next work: verify Task 7 pushed-head CI.

# M02 — Text Publishing

Status: **ACTIVE — M02.7 skeptical/security closeout**

## Goal

Deliver safe text-post drafts, preview/approval, idempotent official-API publishing and downstream verification.

## Dependencies

M01 verified.

## In Scope

Drafts, preview tokens/payload identity, text post publish, verification, audit/idempotency.

## Out of Scope

Image/video/document publishing.

## Acceptance Criteria

No duplicate retry; approval policy enforced; final post identifier/URL verified; failures are structured.

## Tasks / Iterations

1. **COMPLETE** — M02 activation, design and implementation plan.
2. **COMPLETE** — M02.1 canonical text-post contracts and capability implementation state.
3. **COMPLETE** — M02.2 approval receipt service.
4. **COMPLETE** — M02.3 persistent idempotency ledger.
5. **COMPLETE** — M02.4 official LinkedIn Posts adapter.
6. **COMPLETE** — M02.5 publish orchestration and downstream verification boundary.
7. **COMPLETE (local)** — M02.6 MCP tools/real transport wiring; downstream verification is complete.
8. **ACTIVE** — M02.7 skeptical/security review and closeout.

## TDD Evidence

M02.1 RED: `7c193f9adb8049a5849c603a5c5e29bea69ef59d`, CI `37753499633` — formatting passed; six new canonical text-post tests failed because the contract was absent; 105 pre-existing tests remained green.

M02.1 GREEN: `c1dab02097f0e7c816ab0d80b6485024d4cbea07`, CI `37753956032` — format, 111/111 tests across 24 files, lint, typecheck and build passed.

M02.2 RED: `7b55eb7a09f7010acffd6ba5a6c928b99099f472`, CI `37754698723` — formatting passed; 111 pre-existing tests remained green; the new approval suite failed solely because `approval-service` did not exist.

M02.2 GREEN: `5f1870106988c6b5ab365df275a8b3a314c60aa5`, CI `37754858404` — format, 116/116 tests across 25 files, lint, typecheck and build passed.

M02.3 valid RED: `a99a0d59d66c37ac120d6efe4ac2ab364cf4aa0a`, CI `37755801316` — formatting passed; 116 existing tests remained green; the new ledger suite failed solely because `idempotency-ledger` did not exist.

M02.3 GREEN: `c88ae5b909888e796880f0193299cd21e1246648`, CI `37756724053` — format, 123/123 tests across 26 files, lint, typecheck and build passed.

M02.4 setup encountered formatter-only noise before the valid RED. Valid RED: `7817938bb2efcdc577d04c00b5b8625216ad6d29`, CI `37762083892` — formatting passed; 123 pre-existing tests remained green; the Posts suite failed because `linkedin-posts` did not exist and seven API-version config assertions failed because the configuration contract was absent.

M02.4 GREEN: `90267d9e27bbef705e93b9ec8250548ae815b7ce`, CI `37762622471` — format, 140/140 tests across 27 files, lint, typecheck and build passed.

## Integration Test Evidence

M02.1-M02.4 are deterministic local/provider-adapter contracts. No live LinkedIn publication was attempted or claimed.

## Security Review

M02.1 rejects caller-controlled author and unknown provider payload fields. M02.2 binds approval to exact payload hash and authenticated subject with cryptographically random opaque bounded-lifetime receipts. M02.3 stores operation/hash/result metadata rather than post text or credentials; uses restrictive file permissions and atomic same-directory replacement; fails closed on corrupt persisted state; and persists `outcome_unknown` as a replayable terminal record so uncertain remote acceptance cannot trigger an automatic duplicate POST.

M02.4 sends the bearer token only in the Authorization header, never puts it in the request URL, never reads or returns raw provider error bodies, performs no automatic retry, rejects malformed 201 responses without a valid `x-restli-id`, and validates explicit YYYYMM API versions.

Scoped review through M02.4 found no unresolved Critical or Important finding. Live LinkedIn availability remains external and unverified.

## Code Review Findings

No Critical or Important M02.1-M02.4 findings remain open. Live LinkedIn availability remains external and unverified.

## Fresh Verification Results

M02.1 exact GREEN `c1dab02097f0e7c816ab0d80b6485024d4cbea07`, CI `37753956032`: format, 111/111 tests, lint, typecheck and build green.

M02.2 exact GREEN `5f1870106988c6b5ab365df275a8b3a314c60aa5`, CI `37754858404`: format, 116/116 tests, lint, typecheck and build green.

M02.3 exact GREEN `c88ae5b909888e796880f0193299cd21e1246648`, CI `37756724053`: format, 123/123 tests, lint, typecheck and build green.

M02.4 exact GREEN `90267d9e27bbef705e93b9ec8250548ae815b7ce`, CI `37762622471`: format, 140/140 tests, lint, typecheck and build green.

## Durable Recovery Sources

PRD, capability matrix, `docs/superpowers/specs/2026-10-08-m02-text-publishing-design.md`, `docs/superpowers/plans/2026-10-08-m02-text-publishing.md`, Git/PR/CI.

## Completion Checklist

- [ ] Acceptance verified.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

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

# Project Status

Last reconciled: 2026-10-09. Actual Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M02 — Text Publishing — **ACTIVE, M02.7 closeout**.

Active branch: `feat/m02-text-publishing`.
Active PR: #3 — draft pending final closeout-head CI.
Design: `docs/superpowers/specs/2026-10-08-m02-text-publishing-design.md`.
Plan: `docs/superpowers/plans/2026-10-08-m02-text-publishing.md`.

## Verified M02 Checkpoints

M02.1 canonical text-post contracts: RED `7c193f9adb8049a5849c603a5c5e29bea69ef59d` / CI `37753499633`; GREEN `c1dab02097f0e7c816ab0d80b6485024d4cbea07` / CI `37753956032`.

M02.2 approval receipts: RED `7b55eb7a09f7010acffd6ba5a6c928b99099f472` / CI `37754698723`; GREEN `5f1870106988c6b5ab365df275a8b3a314c60aa5` / CI `37754858404`.

M02.3 persistent idempotency: valid RED `a99a0d59d66c37ac120d6efe4ac2ab364cf4aa0a` / CI `37755801316`; GREEN `c88ae5b909888e796880f0193299cd21e1246648` / CI `37756724053`.

M02.4 official Posts adapter: valid RED `7817938bb2efcdc577d04c00b5b8625216ad6d29` / CI `37762083892`; GREEN `90267d9e27bbef705e93b9ec8250548ae815b7ce` / CI `37762622471`.

M02.5 publish orchestration: exact checkpoint `84b36492da74961965ba3ae2cfb6e9c8a4c239e6` / CI `37793478842` green. Scoped Important findings were resolved; historical RED limitations remain explicitly qualified in the committed evidence.

M02.6 downstream verification: exact checkpoint `1a2cef29d88f7032d5befe18efb627736e49da16` / CI `37832719872` green. Creation success and optional read verification remain separate; read confirmation requires trusted enablement plus granted `r_member_social`.

Task 7 MCP/runtime integration: exact head `1986831bf58fdd48ea5b0da64109898a768bd937` / CI `37838015911` green. GitHub Actions completed frozen install, format check, tests, lint, typecheck and build. The immediately preceding local checkpoint passed 319 tests across 31 files, including real stdio and loopback HTTP MCP smokes. No live LinkedIn request occurred.

## M02.7 Whole-Milestone Review

A fresh skeptical/security closeout review on 2026-10-09 covered approval binding, caller-controlled fields, member-bound idempotency, process/restart races, credential invalidation, provider uncertainty, post-URN validation, optional read verification, MCP result sanitization, provenance and transport/runtime sharing.

Unresolved Critical findings: **0**.
Unresolved Important findings: **0**.
Blocking review threads: **0**.

The file ledger uses fail-closed exclusive sibling locks and atomic replacement, preventing independent ledger instances from both returning a new reservation. Approval is bound to canonical payload hash plus authenticated subject and one raw idempotency key. The mutation fingerprint includes authenticated author, successful replay performs no second POST, uncertain remote acceptance remains terminal `outcome_unknown`, and provider/admin credentials, author and read-policy controls are not caller-supplied MCP fields.

The M02 design intentionally treats a valid provider-returned post URN as the authoritative creation identifier. It forbids constructing or claiming a verified LinkedIn post URL when the provider has not supplied one. Optional GET confirmation never downgrades durable creation success and does not upgrade live capability availability.

Interactive local re-execution in this closeout session was unavailable because that runtime exposed Node 22 rather than the repository-required Node 24, had no pnpm, and could not resolve github.com. Those environment limitations are not counted as verification evidence; the exact-head GitHub Actions run above is authoritative.

## Completed Milestones

M01 — Authentication & Identity merged through PR #2 at `3dbf3e2ced5303b52fc27303de9c086a998835c7`; post-merge CI `37739373991` passed the required quality gates.

M00 foundation/control-plane remains verified from its post-merge main gate.

## Known Carryover

The M00 private package-boundary debt remains Minor and deferred. Live LinkedIn capability availability still depends on legitimate configured developer/member access and must not be inferred from deterministic tests.

## Handoff

Critical findings: 0. Important findings: 0. Blockers: none.

Exact next work: **Verify the M02 closeout-docs pushed-head CI; if green with stable remote heads and clean reviews, mark PR #3 ready and squash-merge it, then verify post-merge main.**

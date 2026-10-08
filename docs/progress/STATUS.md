# Project Status

Last reconciled: 2026-10-08. Actual Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M02 — Text Publishing — **ACTIVE, M02.2 approval receipts**.

Active branch: `feat/m02-text-publishing`.
Active PR: #3 — draft.
Design: `docs/superpowers/specs/2026-10-08-m02-text-publishing-design.md`.
Plan: `docs/superpowers/plans/2026-10-08-m02-text-publishing.md`.

## M02 Progress

M02.1 canonical text-post contracts are complete. RED head `7c193f9adb8049a5849c603a5c5e29bea69ef59d`, CI `37753499633`, passed formatting and failed all six new tests because the preview contract was absent while the prior 105 tests passed. GREEN head `c1dab02097f0e7c816ab0d80b6485024d4cbea07`, CI `37753956032`, passed format, 111/111 tests across 24 files, lint, typecheck and build.

`post.create.text` is now ACTIVE as deterministic implementation work, remains `OFFICIAL_API`, and remains live `UNAVAILABLE` until legitimate configured LinkedIn write access is actually verified.

## Completed Milestones

M01 — Authentication & Identity merged through PR #2 at `3dbf3e2ced5303b52fc27303de9c086a998835c7`.
Post-merge main CI: `37739373991` — format, 105/105 tests across 23 files, lint, typecheck and build GREEN.
M01 unresolved Critical findings: 0.
M01 unresolved Important findings: 0.

M00 foundation/control-plane remains verified from its post-merge main gate.

## M02 Safety / Provider Ruling

M02 targets LinkedIn's official Posts API for authenticated-member text publishing. `w_member_social` is required for member writes. Every mutation requires an approval receipt bound to the exact canonical payload and authenticated subject plus a caller idempotency key. A possibly-sent request with uncertain provider outcome is never automatically retried.

Downstream read verification remains access-dependent and must not turn legitimate write-only access into a false failure. Ordinary CI must never publish a real LinkedIn post.

## Known Carryover

The M00 private package-boundary debt remains Minor and deferred.
Live LinkedIn capability availability remains dependent on legitimate configured developer/member access.

Exact next work: establish M02.2 approval-receipt service RED tests binding approval to payload hash, authenticated subject and expiry without authorizing publication.

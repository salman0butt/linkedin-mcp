# Project Status

Last reconciled: 2026-10-08. Actual Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M02 — Text Publishing — **ACTIVE, M02.1 contracts**.

Active branch: `feat/m02-text-publishing`.
Active PR: #3 — draft.
Design: `docs/superpowers/specs/2026-10-08-m02-text-publishing-design.md`.
Plan: `docs/superpowers/plans/2026-10-08-m02-text-publishing.md`.

## Completed Milestones

M01 — Authentication & Identity merged through PR #2 at `3dbf3e2ced5303b52fc27303de9c086a998835c7`.
Post-merge main CI: `37739373991` — format, 105/105 tests across 23 files, lint, typecheck and build GREEN.
M01 unresolved Critical findings: 0.
M01 unresolved Important findings: 0.

M00 foundation/control-plane remains verified from its post-merge main gate.

## M02 Safety / Provider Ruling

M02 targets LinkedIn's official Posts API for authenticated-member text publishing. `w_member_social` is required for member writes. Every mutation requires an approval receipt bound to the exact canonical payload and a caller idempotency key. A possibly-sent request with uncertain provider outcome is never automatically retried.

Downstream read verification remains access-dependent and must not turn legitimate write-only access into a false failure. Ordinary CI must never publish a real LinkedIn post.

## Known Carryover

The M00 private package-boundary debt remains Minor and deferred.
Live LinkedIn capability availability remains dependent on legitimate configured developer/member access.

Exact next work: verify the M02 activation/spec/plan head, create the milestone draft PR, then establish the M02.1 canonical text-post contract RED.

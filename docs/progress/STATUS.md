# Project Status

Last reconciled: 2026-10-08. Actual Git/code/exact-SHA CI outrank these notes.

## Current Milestone

M02 — Text Publishing — **ACTIVE, M02.4 official LinkedIn Posts adapter**.

Active branch: `feat/m02-text-publishing`.
Active PR: #3 — draft.
Design: `docs/superpowers/specs/2026-10-08-m02-text-publishing-design.md`.
Plan: `docs/superpowers/plans/2026-10-08-m02-text-publishing.md`.

## M02 Progress

M02.1 canonical text-post contracts are complete. RED `7c193f9adb8049a5849c603a5c5e29bea69ef59d` / CI `37753499633`; GREEN `c1dab02097f0e7c816ab0d80b6485024d4cbea07` / CI `37753956032`, with format, 111/111 tests, lint, typecheck and build green.

M02.2 approval receipts are complete. RED `7b55eb7a09f7010acffd6ba5a6c928b99099f472` / CI `37754698723`; GREEN `5f1870106988c6b5ab365df275a8b3a314c60aa5` / CI `37754858404`, with format, 116/116 tests, lint, typecheck and build green. Receipts are LOCAL_ONLY, bind payload hash + authenticated subject + bounded expiry, and bind one idempotency key on first consumption.

M02.3 persistent idempotency is complete. Valid RED `a99a0d59d66c37ac120d6efe4ac2ab364cf4aa0a` / CI `37755801316` passed formatting, kept all 116 existing tests green and failed only because the ledger module did not exist. GREEN `c88ae5b909888e796880f0193299cd21e1246648` / CI `37756724053` passed format, 123/123 tests across 26 files, lint, typecheck and build. The versioned JSON ledger uses restrictive permissions, same-directory atomic replacement, fail-closed corrupt-state handling, restart replay, hash conflicts, and durable `outcome_unknown` so uncertain remote acceptance is never automatically retried.

Skeptical/security review of M02.3 found no unresolved Critical or Important issue in the scoped single-runtime file-backed ledger. It stores hashes/operation metadata rather than post text or credentials and preserves terminal records on replay.

`post.create.text` remains `OFFICIAL_API`, ACTIVE for deterministic implementation work, and live `UNAVAILABLE` until legitimate configured LinkedIn write access is actually verified.

## Completed Milestones

M01 — Authentication & Identity merged through PR #2 at `3dbf3e2ced5303b52fc27303de9c086a998835c7`. Post-merge main CI `37739373991` passed format, 105/105 tests, lint, typecheck and build.

M00 foundation/control-plane remains verified from its post-merge main gate.

## M02 Safety / Provider Ruling

M02 targets LinkedIn's official Posts API for authenticated-member text publishing. `w_member_social` is required for member writes. Every mutation requires an approval receipt bound to the exact canonical payload and authenticated subject plus a caller idempotency key. A possibly-sent request with uncertain provider outcome is never automatically retried.

Downstream read verification remains access-dependent and must not turn legitimate write-only access into a false failure. Ordinary CI must never publish a real LinkedIn post.

## Known Carryover

The M00 private package-boundary debt remains Minor and deferred. Live LinkedIn capability availability remains dependent on legitimate configured developer/member access.

Exact next work: establish M02.4 official LinkedIn Posts adapter RED tests for exact endpoint/headers/body, YYYYMM API-version configuration, 201 `x-restli-id` success, sanitized HTTP classifications and transport `outcome_unknown` without retries.

# Current Milestone

Milestone: M02 — Text Publishing
Status: ACTIVE — M02.4 official LinkedIn Posts adapter
Iteration: M02.4
Branch: `feat/m02-text-publishing`
PR: #3 — draft
Design: `docs/superpowers/specs/2026-10-08-m02-text-publishing-design.md`
Plan: `docs/superpowers/plans/2026-10-08-m02-text-publishing.md`
Ledger: `docs/milestones/M02-text-publishing.md`

## Recovery

M01 merged through PR #2 at `3dbf3e2ced5303b52fc27303de9c086a998835c7`; post-merge main CI `37739373991` passed format, 105/105 tests, lint, typecheck and build.

M02.1 RED `7c193f9adb8049a5849c603a5c5e29bea69ef59d` / CI `37753499633`; GREEN `c1dab02097f0e7c816ab0d80b6485024d4cbea07` / CI `37753956032` with 111/111 tests plus format, lint, typecheck and build green.

M02.2 RED `7b55eb7a09f7010acffd6ba5a6c928b99099f472` / CI `37754698723`; GREEN `5f1870106988c6b5ab365df275a8b3a314c60aa5` / CI `37754858404` with 116/116 tests plus format, lint, typecheck and build green.

M02.3 valid RED `a99a0d59d66c37ac120d6efe4ac2ab364cf4aa0a` / CI `37755801316`; GREEN `c88ae5b909888e796880f0193299cd21e1246648` / CI `37756724053` with 123/123 tests plus format, lint, typecheck and build green. The file-backed ledger persists reservations/terminal outcomes across restart, conflicts same-key/different-hash usage, atomically replaces versioned state with restrictive permissions, fails closed on corruption, and replays `outcome_unknown` instead of retrying.

M02 uses the official LinkedIn Posts API for member text publishing, requires explicit approval plus idempotency before mutation, and treats downstream read verification as access-dependent. `post.create.text` remains live `UNAVAILABLE` until legitimate configured provider access is verified. Ordinary CI must never publish a real LinkedIn post.

Exact next work: establish M02.4 official LinkedIn Posts adapter RED tests for exact endpoint/headers/body, YYYYMM API-version configuration, 201 `x-restli-id` success, sanitized HTTP classifications and transport `outcome_unknown` without retries.

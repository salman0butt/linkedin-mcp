# M02.5 — Publish orchestration evidence

Date: 2026-10-08. Branch: `feat/m02-text-publishing`; existing draft PR #3.

## Recovery

Default `main` is `3dbf3e2ced5303b52fc27303de9c086a998835c7`; post-merge M01 CI `37739373991` succeeded. Recovered M02 head `1917e72fa6b52606592926131ac6dcef1c4786d5` had failed CI `37764485697`: missing publish-service module and missing AuthService provider-context methods. A local `pnpm test` reproduced 140 passing tests, three failing context tests, and one uncollected service suite. GitHub web pages and HTTPS Git were available; GitHub API requests failed at the CONNECT proxy with Forbidden. A minimal `api.github.com` custom network addition was saved for environment review; saving it did not apply runtime access.

## Implementation and decisions

Approval binds to the author-independent preview hash and authenticated subject. The existing ledger hash field instead binds the raw global idempotency key to the canonical provider request including authenticated author. Legacy preview-only records conflict safely. Payloads are validated and copied before asynchronous gates. Publication requires usable credentials, `w_member_social`, approval and durable reservation before one provider attempt. Shared-ledger calls serialize; separate file writers use exclusive sibling locks. Stale locks require manual recovery after proving the prior writer stopped; mutation records must be retained.

Authoritative completion/replay records control success. Supported post identifiers are share/ugcPost URNs with decimal IDs. Malformed success, uncertain provider acceptance or failed post-attempt persistence yields sanitized non-retryable `outcome_unknown`, with no automatic POST retry. Expected-token invalidation prevents a delayed 401 from clearing a replacement credential.

## TDD evidence and historical limitation

The original service RED was a missing-module collection failure; no service assertions executed then. Three original context tests failed for missing methods. The added occupied-lock regression genuinely failed against the prior ledger (7 passed, 1 failed), then passed with exclusion implemented. Some broader service regressions were added after implementation and first ran GREEN. They provide coverage, not retroactive pre-implementation behavioral RED. The plan's original requirement that every Task 5 safety case receive pre-implementation behavioral RED remains historically unmet; it must not be marked satisfied or reconstructed as an invented past run.

Independent review found two Important findings and one Minor finding. The malformed-ID regression then genuinely failed before the fix: `pnpm exec vitest run apps/server/test/linkedin-posts.test.ts apps/server/test/text-post-service.test.ts` produced 4 failures and 31 passes. The shared validator fixed provider, authoritative-completion and persisted-replay false success; the same focused run then passed all 35 tests. A separate second-mkdir regression failed in both reserve and completion before the sanitization fix (2 failed, 9 passed), then passed.

The expanded passing coverage includes real-file restart with fresh approvals for success/terminal/unknown, legacy-hash conflicts, changed/expired/unknown/reused approvals, authoritative terminal failure, arbitrary provider/persisted errors, failed unknown persistence, auth storage/expiry/refresh paths, and overlapping credential replacement/invalidation. These additions are explicitly GREEN coverage where no prior behavioral failure was observed.

## Review and local verification

GPT-6.1 Sol reviewed specification and security/correctness; GPT-6 Luna implemented and fixed the findings. Scoped re-review marked both Important findings and the Minor finding addressed, with no new fix-wave findings. Unresolved Critical: 0. Unresolved Important: 0. The historical RED limitation remains disclosed above.

Final local commands passed: `pnpm format:check`, `pnpm test` (204/204 tests across 29 files), `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. These results cover the reviewed working tree. Exact pushed-head CI is still pending at the time of this evidence commit; local checks are not a claim of new green CI.

No live LinkedIn request or post was performed. Downstream verification and MCP publishing tools remain Tasks 6 and 7. Static live publication availability remains UNAVAILABLE.

## Subsequent exact-head CI

Pushed checkpoint `84b36492da74961965ba3ae2cfb6e9c8a4c239e6` passed CI `37793478842` (37s). GitHub run success and its linked full commit SHA were checked through supported web reads. Its quality job contains frozen install, format, test, lint, typecheck and build. The local suite at that checkpoint had 204 passing tests; Actions log access was not available through the blocked API. Task 6 downstream verification is now active.

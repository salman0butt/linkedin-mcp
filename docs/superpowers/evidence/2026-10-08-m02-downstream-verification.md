# M02.6 — Downstream verification evidence

Date: 2026-10-08. Branch `feat/m02-text-publishing`; existing draft PR #3. Source base: `84b36492da74961965ba3ae2cfb6e9c8a4c239e6` (CI `37793478842` success). No live LinkedIn request was performed.

## Implemented contract

The Posts adapter performs one fully encoded official GET with explicit version/Rest.li/bearer headers, no body, and no automatic retry. It parses only required successful fields, ignores additional provider data and returns static errors without non-success bodies. GET allows well-formed member/organization author URNs; exact member comparison determines mismatch. POST authors remain member-only.

Read confirmation requires both explicitly enabled legitimate member-read product access and normalized `r_member_social` credential scope. The trusted flag defaults false and is never a caller input. OAuth response scope omission retains the RFC 6749 authorized-request fallback; explicitly present empty, whitespace-only or non-string scope is rejected rather than interpreted as omission. No credential schema migration or reset was introduced.

Creation is durably succeeded before verification begins. The nested result is verified, created_unverified, or verification_failed; read failures never change known creation success, reopen the ledger or trigger another POST. Exact ID/member/commentary/lifecycle comparisons prevent false confirmation. Successful replay may make one fresh eligible GET, without POST/completion or persisted verification. Expected-context 401 invalidation preserves replacement credentials; cleanup errors cannot erase success. No URL is constructed or labeled verified.

## Observed TDD

Before production changes, `pnpm exec vitest run apps/server/test/linkedin-posts.test.ts apps/server/test/text-post-service.test.ts apps/server/test/linkedin-oauth.test.ts apps/server/test/auth-service.test.ts` exited 1: 33 failed, 72 passed. Failures exercised the absent GET method, missing verification outputs and accepted malformed scope. Existing omitted-scope/narrower-grant behavior passed. This was behavioral RED, not a missing-module collection failure.

Initial focused GREEN passed 110 tests. Additional safety coverage was written after implementation and first ran GREEN; no retroactive RED is claimed for every final assertion. Independent review identified two Important coverage findings and one Minor author-classification finding. The author-classification regression then failed before its fix: an integrated fake-fetch adapter/service returned malformed_response for a valid organization author where post_mismatch was required. The same behavior passed after the GET validator change. Passing coverage improvements are separately qualified as such.

## Review and final local verification

GPT-6.1 Sol prepared/reconciled the design and independently reviewed security, correctness and test quality. GPT-6 Luna implemented and fixed findings. Final scoped re-review cleared I1/I2/M1 and both assertion refinements: zero unresolved Critical, Important or Minor findings in Task 6. Whole-milestone review remains Task 8.

Coverage now isolates each malformed required field; checks both share/ugcPost encoding and invalid pre-fetch tokens; uses eligible read contexts for unknown/reserved/failed/member-conflicting/persistence gates; and proves private/malformed read exceptions preserve byte-identical succeeded ledger records. Real-file successive replay tests change 404/verified/current-scope/mismatch evidence while retaining exactly one POST and one completion. Caller mutation must still return verified from its owned snapshot. Delayed GET rejection preserves a replacement token.

Final focused suite: 148/148 across five files. Full suite: 265/265 across 29 files. `pnpm format:check`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `git diff --check` passed. Exact pushed-head CI for this new checkpoint is pending; the source-base CI above is not a claim of Task6 CI.

## Continuity

GitHub API access recovered during this run. Fresh API recovery found the same sole open draft PR #3, no reviews/threads, mergeable head, and stable main. Live publication/read availability remains UNAVAILABLE without legitimate access and actual provider evidence. Next action: verify Task6 pushed-head CI.

## Subsequent exact-head CI

Checkpoint `1a2cef29d88f7032d5befe18efb627736e49da16` passed CI `37832719872`; API head SHA and every quality step were inspected. The local suite at this source checkpoint passed 265 tests. Actions log downloads remain blocked at the results-receiver destination; CI metadata is available, but no remote log count is claimed. Task7 MCP/runtime work is next.

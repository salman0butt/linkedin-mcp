# Known Issues

## Current unresolved issues

### Important — inconsistent reply identity can be accepted after HTTP 201

`apps/server/src/engagement/linkedin-comments.ts` validates the response `id` against `x-restli-id` and validates the shape of `commentUrn`, but does not verify the composite URN identifies that same ID/object. An inconsistent canonical result can therefore be persisted and replayed as success. Add a RED regression, reject inconsistent successful identities without exposing provider data, and reverify. Live provider entitlement remains unverified.

### Important — malformed provider success is not terminally recorded

`apps/server/src/engagement/engagement-service.ts` invokes `validateProviderReply` after the provider POST succeeds but outside the failure-completion path. A validation error leaves the ledger `reserved` instead of durably recording terminal `outcome_unknown`. This prevents duplicate automatic POSTs but violates the M04 durable outcome policy. Add a RED regression and persist terminal uncertainty through the existing ledger; do not retry the remote mutation. An attempted test write on 2026-10-13 was rejected by connector safety checks.

### Important — documented create response can omit likesSummary

The official Comments creation response example omits `likesSummary`, but `parseCanonicalComment` currently requires it even on successful reply POST. This may reject a legitimate 201 response as `malformed_success`. Add a failing create-response regression, make only the create response's count optional without inventing zero, and preserve strict existing GET/list parsing. No live provider entitlement is claimed.

### Minor — private package boundary is repository-relative

`@linkedin-mcp/server` remains private and imports built private core through a repository-relative path while its build script builds core first. Current monorepo tests/build/transports verify this arrangement. Replace it with an explicit workspace dependency when package-consumer boundaries expand.

### External verification gate — live LinkedIn capability availability

Deterministic implementation does not prove provider entitlement. M01–M03 repository behavior is verified, but live profile/post/media availability still depends on legitimate app/account access.

M04 adds another explicit access boundary: current Community Management APIs are vetted. Member comment/reaction writes require `w_member_social_feed`; member comment/reaction reads require restricted `r_member_social_feed`. Development tier also restricts API volume and disallows BATCH_GET. CI has no legitimate provider credentials/product entitlement, so M04 live read/write capability must remain unverified until real evidence exists.

### Interactive connector/container limitations

GitHub Actions remains authoritative exact-SHA execution evidence when an interactive local environment cannot reproduce the repository's Node/pnpm/network setup. This does not relax exact-head, review, concurrency or security gates.

## Resolved during M04

The M04 completion-lock handoff regression first observed at `733e37cb549b75701953c21f5a51d5fa4bd0569b` / CI `38162905039` was repaired by completion-only bounded `EEXIST` lock retries and two additional fail-closed tests. Verified at `cbcc2c72124299a548f0caf5d7ba41a445c8288d` / CI `38312220154`: **474/474 tests across 52 files**, frozen install, format, lint, typecheck and build green. Reservations/media checkpoints still fail closed immediately; no remote LinkedIn mutation retry was added.

## Resolved during M03

M03 merged through PR #4 at `6713bfe79c261021ac39b75599509cd843e95f6d`; the later cross-runtime final-media ownership defect was repaired on main through hotfix PR #7 at `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`. Post-hotfix CI `38153987423` passed 427/427 tests across 46 files plus format/lint/typecheck/build. Whole-milestone review resolved all Critical/Important findings.

## Review state

M03 whole-milestone review completed with **0 unresolved Critical findings and 0 unresolved Important findings** before merge, with the later ownership defect separately regression-fixed and verified on main.

M04.1 scoped contract/config review completed with **0 unresolved Critical findings and 0 unresolved Important findings**.

M04.2 scoped Comments read-adapter review completed after exact-head GREEN `26ecce969e4d4935ddcd7babd93c6b46085a03b1` / CI `38160896542` with **0 unresolved Critical findings and 0 unresolved Important findings**. The adapter validates/encodes canonical targets, bounds paging and successful JSON bodies, leaves HTTP error bodies unread, sanitizes failures, uses no BATCH_GET and performs no automatic retries.

Full M04 whole-branch correctness/security/provenance review remains required before merge.

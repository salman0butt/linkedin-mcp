# Known Issues

## Current unresolved issues

### Blocking — completion-lock regression on active M04 branch

PR #6 source HEAD `733e37cb549b75701953c21f5a51d5fa4bd0569b` failed CI `38162905039` (471/472 tests): a known remote outcome could not be completed after transient sibling `EEXIST` lock contention. The existing regression is RED on remote. A completion-only bounded retry (without changing reservation/media fail-closed semantics or retrying remote LinkedIn writes) plus persistent-contention and permission-failure tests passed locally (474/474 tests and format/lint/typecheck/build), but the GitHub connector rejected the source update through safety checks. Source remains uncommitted locally; remote CI is not green. Do not merge until the correction is safely persisted and exact-final-head CI passes.

### Minor — private package boundary is repository-relative

`@linkedin-mcp/server` remains private and imports built private core through a repository-relative path while its build script builds core first. Current monorepo tests/build/transports verify this arrangement. Replace it with an explicit workspace dependency when package-consumer boundaries expand.

### External verification gate — live LinkedIn capability availability

Deterministic implementation does not prove provider entitlement. M01–M03 repository behavior is verified, but live profile/post/media availability still depends on legitimate app/account access.

M04 adds another explicit access boundary: current Community Management APIs are vetted. Member comment/reaction writes require `w_member_social_feed`; member comment/reaction reads require restricted `r_member_social_feed`. Development tier also restricts API volume and disallows BATCH_GET. CI has no legitimate provider credentials/product entitlement, so M04 live read/write capability must remain unverified until real evidence exists.

### Interactive connector/container limitations

GitHub Actions remains authoritative exact-SHA execution evidence when an interactive local environment cannot reproduce the repository's Node/pnpm/network setup. This does not relax exact-head, review, concurrency or security gates.

## Resolved during M03

M03 merged through PR #4 at `6713bfe79c261021ac39b75599509cd843e95f6d`; the later cross-runtime final-media ownership defect was repaired on main through hotfix PR #7 at `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`. Post-hotfix CI `38153987423` passed 427/427 tests across 46 files plus format/lint/typecheck/build. Whole-milestone review resolved all Critical/Important findings.

## Review state

M03 whole-milestone review completed with **0 unresolved Critical findings and 0 unresolved Important findings** before merge, with the later ownership defect separately regression-fixed and verified on main.

M04.1 scoped contract/config review completed with **0 unresolved Critical findings and 0 unresolved Important findings**.

M04.2 scoped Comments read-adapter review completed after exact-head GREEN `26ecce969e4d4935ddcd7babd93c6b46085a03b1` / CI `38160896542` with **0 unresolved Critical findings and 0 unresolved Important findings**. The adapter validates/encodes canonical targets, bounds paging and successful JSON bodies, leaves HTTP error bodies unread, sanitizes failures, uses no BATCH_GET and performs no automatic retries.

Full M04 whole-branch correctness/security/provenance review remains required before merge.

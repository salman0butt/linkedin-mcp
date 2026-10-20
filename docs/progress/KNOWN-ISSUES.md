# Known Issues

## Current unresolved issues

### Minor — private package boundary is repository-relative

`@linkedin-mcp/server` remains private and imports built private core through a repository-relative path while its build script builds core first. Current monorepo tests/build/transports verify this arrangement. Replace it with an explicit workspace dependency when package-consumer boundaries expand.

### External verification gate — live LinkedIn capability availability

Deterministic implementation does not prove provider entitlement. M01–M03 repository behavior is verified, but live profile/post/media availability still depends on legitimate app/account access.

M04 adds another explicit access boundary: current Community Management APIs are vetted. Member comment/reaction writes require `w_member_social_feed`; member comment/reaction reads require restricted `r_member_social_feed`. Development tier also restricts API volume and disallows BATCH_GET. CI has no legitimate provider credentials/product entitlement, so M04 live read/write capability must remain unverified until real evidence exists.

### Interactive connector/container limitations

GitHub Actions remains authoritative exact-SHA execution evidence when an interactive local environment cannot reproduce the repository's Node/pnpm/network setup. This does not relax exact-head, review, concurrency or security gates. On 2026-10-16 the local Chat On Steroids tunnel became unavailable after dispatching independent M04.3 reviewers; no independent review result is claimed from that unavailable channel.

## Resolved during M04

### Resolved M04.7 — Comments read response identity consistency

GET response IDs are now checked against the requested comment ID; GET/list composite comment URN numeric IDs are validated against the returned comment ID. Three automated regressions were proven RED at `d906d730617e8931945478d187bc784c200a622a` / CI `39392445179`, then all 542 tests and quality gates passed at `92a8ca816ca4c300c624360acde0afd6599512bf` / CI `39392843550`. Invalid successful provider responses fail with sanitized `malformed_response`. No live Community Management entitlement was tested.



### M04.4 approval-purpose isolation

A fresh security review after the initial reaction GREEN checkpoint found one Important shared approval-boundary defect: approval receipts were bound to subject and payload hash but not to the mutation purpose. A caller able to deliberately reuse the same canonical hash across named approval methods could therefore cross an approval boundary.

The defect was reproduced before production changes. The shared approval service now derives a purpose-scoped internal SHA-256 hash while preserving the public receipt payload hash. Runtime/service wiring uses stable scopes for text posts, media posts, comment replies, reaction add and reaction remove. Focused regressions prove add approval cannot authorize remove and reply approval cannot authorize reaction add, with zero provider mutations on rejection. The repair is included in exact-head GREEN `788a252f6ec9e285df0420869af6e39ca728975b`, CI `39037380577`, which passed **524/524 tests across 57 files** plus frozen install, format, lint, typecheck and build.

### M04.3 nested reply review findings

Four Important findings are resolved with genuine RED→GREEN evidence and exact-head CI:

1. **Reply target/parent approval mismatch** — RED `d716140fa42d5e4c294146936e4d9616be161a8b`; fixed by rejecting mismatched nested targets before approval at `386dbf96235fadf88ea16a9411cd3a24dfc3a38b`.
2. **Malformed provider success left a nonterminal reservation** — RED `3adcee4d80fcfdad44f8374b0f97af28c590f215`, CI `38901369613`; fixed at `9699773fb323ab027ebdc2837c5e5a8a591e0c9b`, CI `38901575437`, by terminally recording `outcome_unknown` without retrying the remote mutation.
3. **Successful composite reply identity could disagree with ID/root, including legacy replay** — RED `5dce3ac361f87abadd61c91283e8ebcc41b702d4`, CI `38902334994`; fixed at `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9` with shared identity validation in adapter, service and replay paths.
4. **Documented create response could omit `likesSummary`** — the same RED `5dce3ac361f87abadd61c91283e8ebcc41b702d4` proved the create-only compatibility gap while strict read parsing stayed green; fixed at `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9` without fabricating a zero count.

Exact-head CI `38902517595` on `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9` passed **483/483 tests across 53 files** plus frozen install, format, lint, typecheck and build. Scoped correctness/security review found 0 unresolved Critical findings and 0 unresolved Important findings.

### M04 completion-lock handoff regression

The regression first observed at `733e37cb549b75701953c21f5a51d5fa4bd0569b` / CI `38162905039` was repaired by completion-only bounded `EEXIST` lock retries and additional fail-closed tests. Verified at `cbcc2c72124299a548f0caf5d7ba41a445c8288d` / CI `38312220154`: **474/474 tests across 52 files**, frozen install, format, lint, typecheck and build green. Reservations/media checkpoints still fail closed immediately; no remote LinkedIn mutation retry was added.

## Resolved during M03

M03 merged through PR #4 at `6713bfe79c261021ac39b75599509cd843e95f6d`; the later cross-runtime final-media ownership defect was repaired on main through hotfix PR #7 at `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`. Post-hotfix CI `38153987423` passed 427/427 tests across 46 files plus format/lint/typecheck/build. Whole-milestone review resolved all Critical/Important findings.

## Review state

M03 whole-milestone review completed with **0 unresolved Critical findings and 0 unresolved Important findings** before merge, with the later ownership defect separately regression-fixed and verified on main.

M04.1 scoped contract/config review completed with **0 unresolved Critical findings and 0 unresolved Important findings**.

M04.2 scoped Comments read-adapter review completed after exact-head GREEN `26ecce969e4d4935ddcd7babd93c6b46085a03b1` / CI `38160896542` with **0 unresolved Critical findings and 0 unresolved Important findings**.

M04.3 scoped nested-reply correctness/security review completed after exact-head GREEN `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9` / CI `38902517595` with **0 unresolved Critical findings and 0 unresolved Important findings**. A separately dispatched independent review could not be retrieved after the local tunnel disconnected and is not represented as completed.

M04.4 scoped reaction review had one later fresh security Important finding for approval-purpose isolation; that finding is resolved and verified in `788a252f6ec9e285df0420869af6e39ca728975b` / CI `39037380577`. M04.4 now has **0 unresolved Critical findings and 0 unresolved Important findings**.

M04.5 scoped inbox correctness/security review after exact-head GREEN `788a252f6ec9e285df0420869af6e39ca728975b` / CI `39037380577` found **0 Critical findings and 0 Important findings**.

M04.6 strict MCP/stdio/HTTP integration GREEN at `79bd4bf19d06e3cc41ccc9c6fd15c00b6d173148` / CI `39058125153`: 539/539 tests across 59 files plus frozen install, format, lint, typecheck and build. Twelve engagement tools are registered; real stdio and HTTP smoke tests pass. M04.7 whole-branch correctness/security/provenance review remains required before merge.

# Project Status

## Current checkpoint — 2026-10-23 (M05.6 full-branch review)

M05.5 committed to the existing PR #8 branch at `1c0762c91113f0c23d27ee03d4631b5988f1cdc2`. Exact-head GitHub Actions CI `39918895858` passed **645/645 tests in 71 files**, frozen install, formatting, lint, typecheck and build. Real stdio and HTTP MCP transport tests verify 29 tools, explicit default unavailable, configured provider provenance, and mixed-source partial failure reporting. The independent M05.6 reviewer found two Important defects, both now regression-fixed: dedupe before filtering hid eligible records, and non-post LinkedIn URLs could masquerade as canonical permalinks. Focused tests failed RED before the fixes and passed GREEN afterward. Full local **647/647 tests in 71 files**, lint, typecheck, formatting and build passed. Reviewer concluded zero further confirmed Critical/Important findings; final remote SHA/CI and squash merge remain pending. No live external discovery or restricted official Posts entitlement has been verified.

Exact next work: **Persist M05.6 fixes and review evidence on PR #8, verify exact-final-head CI, and squash-merge when all gates pass.**

M05.4 default-OFF author finder committed at `e517d5747622cf9d3289bda6ae08151fa637878a`; exact-head CI `39915436774` passed **631/631 tests in 70 files** and frozen install, Prettier, lint, types and build. M05.5 implements strict read-only `linkedin.posts.search` using an injected `PostSearchService` shared by stdio and HTTP. The default provider list is empty; `unavailable` maps to non-success `unsupported` without fabricated posts. Mixed failures preserve `partial` and source provenance. Genuine local RED (four missing-tool tests failed) became GREEN, followed by M05.5 exact-head CI `39918895858` (645/645 tests). No external discovery or credential-bound official author access is bundled.

Historical M05.5 handoff (completed): commit existing draft PR #8, obtain exact-head CI green and begin M05.6 review.

M05.5 independent review's two Important findings (malformed input misclassified as upstream failure, and trusted class-based providers losing prototype-defined methods) were regression-fixed RED→GREEN. Additional direct MCP checks confirm the five strict mode alternatives in published tool-list JSON Schema, scoped same-ID posts from different providers, no spoofed source authority, no invented engagement or permalink, and all failure-only statuses. Two real HTTP clients received the same auditable partial outcomes. No unresolved Critical/Important finding is known in this M05.5 review; whole-branch closeout is still pending.

Historical M05.4 RED-to-GREEN checkpoint: PR #8 test-only head `4b6673fe4c423deff22f26c5b8a9f191cb87a3a8` failed CI `39907383505` at Prettier. Local implementation and independently reviewed filtering, pagination, resolver taxonomy, default-OFF and UTF-8 regressions became GREEN; these were later verified by the M05.4 CI above.

Historical M05.4 next action (completed): persist M05.4, obtain exact-head green CI and start M05.5.

M05 Post Search is ACTIVE in M05.6, draft PR #8, on `feat/m05-post-search` (base `800bf943cf047215bc434206dab1e5b6e2175c10`). Design and TDD plan: `docs/superpowers/specs/2026-10-22-m05-post-discovery-design.md` and `docs/superpowers/plans/2026-10-22-m05-post-discovery.md`.

M04 **COMPLETE**: [PR #6](https://github.com/salman0butt/linkedin-mcp/pull/6) squash merged at `800bf943cf047215bc434206dab1e5b6e2175c10`. Post-merge main CI `39740297020` passed **583/583 tests across 66 files**, frozen install, format, lint, typecheck and build. Independent M04 approval-security and reply-root reviews found no verified Critical/Important defects. No live Community Management entitlement or shipped authenticated host approval UI is claimed.

M05.1 core contract RED→GREEN committed at `1bbc366dda57cc44d10825c6126a6fefd195dd7d`; exact-head CI `39743915175` GREEN (589/589 tests, 67 files, all gates). M05.2 deterministic filtering/dedupe RED (missing module) → exact-head GitHub CI `39744941663` GREEN on `9e6a141` (596/596 tests across 68 files, all quality gates). M05.3 typed provider router RED (missing module) → verified exact-head `6c7e1ccd99eafdb434e382af99d0698eee748874`, CI `39745975198` GREEN **607/607 tests across 69 files**, frozen install, format/lint/typecheck/build/real transports; independent provider-security review remains pending.

M05 requires provenance-preserving discovery: external/partner discovery only when legitimately configured; official author-scoped read only with the separately verified member/organization roles and restricted scopes. Unavailable is not a successful empty response. Normalized results must not invent publication dates, engagement, canonical URLs, or source authority. No external provider is bundled.

M05.3 security review identified one Important capability-provenance defect: an `OFFICIAL_API` adapter could declare broad `topic`, `hashtag` or `recent` search and produce misleading official-search results. A focused regression was verified RED (11 passed, 1 failed); fail-closed correction committed at `35ff359dffecc179aa82f0e41d7c563b559825d7` and exact-head CI `39758769454` passed 608/608 tests across 69 files and quality gates. No external provider entitlement is claimed.

Historical M05.3 handoff: M05.4 default-OFF single-author official Posts API finder was the next task (now locally implemented as documented above).

## Historical M04 checkpoint (superseded by merged Git graph)

## M04.6 Strict MCP/Transport Integration — GREEN

Behavioral RED: `656d1b819358ffa9feaa403646d35d4365a4e2c6`, CI `39038187921`: 524 existing tests passed, nine engagement MCP contract tests failed because the twelve engagement tools were not registered.

M04.6 exact-head GREEN: `79bd4bf19d06e3cc41ccc9c6fd15c00b6d173148`, CI `39058125153`: **539/539 tests across 59 files**, frozen install, format, lint, typecheck and build passed. The twelve strict engagement tools are registered in the shared runtime, and real stdio/loopback HTTP transport smoke suites pass with 28 tools. Restricted reads preserve disabled/permission-required states, and provider read rate-limit errors remain explicit and sanitized. Live Community Management entitlement is still unverified.

M04.7 whole-milestone skeptical/security/provenance review, documentation reconciliation, exact-final-head CI and merge/post-merge verification remain pending.

## M04.7 Response-to-Request Integrity — REGRESSION-FIXED

On the former PR head `dd8f1b802d4cc3104b4969049838252fcdb31adf`, six local behavioral regressions failed as intended: same-family unrelated GET/list thread records, conflicting record object/composite-URN roots, mismatched page start, excess page elements and oversized paging metadata. The adapter now fails closed on these cases while retaining legitimate differing LinkedIn URN families. The existing nested-thread test fixture was corrected to refer to its actual parent. The milestone's provider JSON limit description was reconciled to its tested 256 KiB bound.

Exact-head GREEN: `e33ba384df4ae0a5492f20d85e98458e91142011` / CI `39575410269`: **555/555 tests across 62 files**, frozen install, formatting, lint, typecheck, build and real stdio/HTTP smokes passed. The preceding lint-only fix `dd8f1b802d4cc3104b4969049838252fcdb31adf` passed CI `39574002868` with 549/549 tests. Independent M04.7 whole-branch review and merge gates still remain.

## M04.7 Comments Read Identity Integrity — REGRESSION-FIXED

Behavioral RED: commit `d906d730617e8931945478d187bc784c200a622a`, CI `39392445179`: formatting passed and three new identity-integrity regression tests failed as intended (returned requested-ID mismatch, composite URN numeric mismatch, and malformed list identity). All 539 prior tests remained green.

Verified GREEN: commit `92a8ca816ca4c300c624360acde0afd6599512bf`, CI `39392843550`: **542/542 tests across 60 files**, frozen install, format, lint, typecheck and build passed. Comments GET now rejects a response whose ID differs from the requested ID; GET/list reject composite URNs whose numeric ID differs from the returned ID. Errors are sanitized `malformed_response` with no provider payload disclosure. No live provider entitlement is asserted.

Scoped finding closed; currently **0 known unresolved Critical / Important findings**. M04.7 whole-branch skeptical security/provenance review and final merge gates remain pending.

Latest verified source head: `e33ba384df4ae0a5492f20d85e98458e91142011` / CI `39575410269`: **555/555 tests across 62 files** plus frozen install, format, lint, typecheck and build.

Exact next work: **Perform M04.7 whole-branch skeptical correctness/security/provenance review at the exact head and resolve any new Critical/Important findings before merge gates.**

## M04.5 Historical Verified Checkpoint

M04.5 — explicit-thread unanswered inbox/context derivation — **GREEN** at `788a252f6ec9e285df0420869af6e39ca728975b`.
CI `39037380577`: **524/524 tests across 57 files**, frozen install, format, lint, typecheck and build passed.

M04.5 genuine TDD evidence:

- clean behavioral RED at `8d9f74ce00b55de1c9b5bfd2808ff541c6e15528`, CI `39037076502`: 517 executable tests passed and only `comment-inbox.test.ts` failed because `comment-inbox.ts` was absent;
- GREEN at `788a252f6ec9e285df0420869af6e39ca728975b`, CI `39037380577`: 524/524 tests across 57 files plus all quality gates.

The inbox accepts only 1–20 explicit share/ugcPost/activity roots, uses bounded 100-item pages with at most three pages per target and a global provider-call ceiling, propagates disabled/permission-required states without fabricating emptiness, treats only a direct authenticated-member child as an answer, and returns deterministic chronological ordering. Scoped correctness/security review found **0 unresolved Critical findings and 0 unresolved Important findings**.

## M04.4 Reaction Checkpoint and Security Follow-up

M04.4 reaction add/remove behavior first reached GREEN at `642359aa8caab4a2dd1c15ab22e64e07927e2688`, CI `39034345652`: **514/514 tests across 55 files** plus all quality gates.

A later fresh security review found one Important shared approval-boundary defect: approval receipts were bound to authenticated subject and payload hash but not to mutation purpose, allowing a deliberately reused hash to cross named approval flows. The regression was reproduced before the fix. The shared approval service now namespaces its internal hash by stable purpose while preserving the public receipt shape; text posts, media posts, comments.reply, reactions.add and reactions.remove are isolated. Focused cross-purpose engagement regressions pass, provider mutation count remains zero on rejected cross-purpose receipts, and the fix is included in exact-head GREEN `788a252f6ec9e285df0420869af6e39ca728975b` / CI `39037380577`.

M04.4 TDD checkpoints before the follow-up:

- adapter RED `5f1c5e3adb683730ea85266e1f3b13db05aed9130`, CI `39030219764`;
- service RED `42119b100a951e1628f043682dbb4088b34e9e78`, CI `39034035608`;
- reaction GREEN `642359aa8caab4a2dd1c15ab22e64e07927e2688`, CI `39034345652`.

M04.3 nested reply flow: GREEN `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9`, CI `38902517595` (483/483 tests).
M04.2 bounded official Comments read adapter: GREEN `26ecce969e4d4935ddcd7babd93c6b46085a03b1`, CI `38160896542` (450/450 tests).
M04.1 canonical engagement contracts/access policy: GREEN `2b80391f943907218a29fd39d4d6535cf0837e8f`, CI `38155192287` (439/439 tests).

## Latest Verified Mainline

M03 — Media Publishing — merged through PR #4, with the cross-runtime final-media ownership repair through hotfix PR #7.
Current verified main: `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`.
Post-hotfix main CI `38153987423`: **427/427 tests across 46 files**, frozen install, format, lint, typecheck and build passed.

## M04 Provider Reality

LinkedIn Community Management comments/reactions use versioned official APIs. Member writes require `w_member_social_feed`; member reads require restricted `r_member_social_feed`. Community Management is vetted and Development tier disallows BATCH_GET. Deterministic repository verification does **not** prove live product/scope entitlement. No live Community Management read or write is claimed.

## Findings / Blockers

Unresolved Critical findings: **0 known**.
Unresolved Important findings: **0 verified**, following regression-fixed subject/purpose-bound trusted grants and nested reply-root integrity plus independent reviews.
Latest verified M04 source head: `75205ae47a29d98e60a9087a9f5703d40dd8d36e` / CI `39739059007`: **583/583 tests in 66 files** and all required quality gates, with explicit cross-family compatibility regressions.
M04.7 trusted-approval and reply-root blockers are regression-fixed and independently reviewed; merge and post-merge main CI gates still apply.
Live Community Management entitlement remains an external verification gate; deterministic CI does not establish actual product/scope access.

## Handoff

The one current next action is specified in the latest checkpoint at the top of this file.

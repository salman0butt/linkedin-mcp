# Current Milestone

Milestone: M04 — Comments & Engagement
Status: ACTIVE — M04.6 strict MCP/stdio/HTTP integration
Iteration: M04.6
Branch: `feat/m04-comments-engagement`
PR: #6 — draft
Design: `docs/superpowers/specs/2026-10-11-m04-comments-engagement-design.md`
Plan: `docs/superpowers/plans/2026-10-11-m04-comments-engagement.md`
Ledger: `docs/milestones/M04-comments-engagement.md`

## Recovery

M03 is verified on current main `03f31814ea809f9fc4a82e5f7ac1ed37fbeda8c0`; post-hotfix CI `38153987423` passed 427/427 tests plus all quality gates.

M04.1 contracts/access policy GREEN: `2b80391f943907218a29fd39d4d6535cf0837e8f`, CI `38155192287` — 439/439 tests.

M04.2 Comments read adapter GREEN: `26ecce969e4d4935ddcd7babd93c6b46085a03b1`, CI `38160896542` — 450/450 tests.

M04.3 nested reply flow GREEN: `4c9a5bd418b33d588d0b61b09ce3003532e8dcf9`, CI `38902517595` — 483/483 tests; scoped review 0 Critical/Important findings.

M04.4 reaction add/remove behavior GREEN: `642359aa8caab4a2dd1c15ab22e64e07927e2688`, CI `39034345652` — 514/514 tests across 55 files plus all quality gates. A later fresh security review found one Important shared approval-purpose isolation gap; stable purpose scoping for text, media, reply, reaction-add and reaction-remove was regression-fixed and is included in exact-head GREEN `788a252f6ec9e285df0420869af6e39ca728975b` / CI `39037380577`.

M04.5 explicit-thread unanswered inbox RED: `8d9f74ce00b55de1c9b5bfd2808ff541c6e15528`, CI `39037076502` — 517 executable tests passed and only the absent inbox module failed. GREEN: `788a252f6ec9e285df0420869af6e39ca728975b`, CI `39037380577` — 524/524 tests across 57 files plus frozen install, format, lint, typecheck and build. Scoped inbox correctness/security review found 0 Critical and 0 Important findings.

M04 provider access remains entitlement-sensitive: member writes use `w_member_social_feed`; member reads use restricted `r_member_social_feed`; Community Management is vetted and Development tier disallows BATCH_GET. Deterministic CI does not represent live entitlement as verified.

Exact next work: **Write M04.6 strict MCP/stdio/HTTP engagement integration behavioral RED tests for tool discovery, strict schemas, structured access/provenance states and rejection of actor/token/read-gate/admin overrides; verify intended RED before implementation.**

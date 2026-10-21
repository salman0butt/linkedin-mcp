# M04 Comments & Engagement — Verification Evidence

Last reconciled: 2026-10-21. GitHub commits and exact-head CI outrank this handoff.

## Scope and provider provenance

M04 implements explicit Comments get/list, member reply preview/approve/create, reaction add/remove preview/approve/write and a bounded unanswered inbox through 12 strict MCP tools. Reads remain OFF by default and require restricted `r_member_social_feed` and trusted local opt-in. Member writes require `w_member_social_feed` plus approval and durable idempotency. The inbox is a LOCAL_ONLY derivation over explicit thread roots, not feed discovery. No live Community Management entitlement or actual provider read/write is verified.

## Reproducible verification

- M04.6 strict transport checkpoint: `79bd4bf19d06e3cc41ccc9c6fd15c00b6d173148`, CI `39058125153`: 539/539 tests and required quality gates.
- M04.7 earlier comment identity RED: `d906d730617e8931945478d187bc784c200a622a`, CI `39392445179`; GREEN `92a8ca816ca4c300c624360acde0afd6599512bf`, CI `39392843550`: 542/542 tests.
- Lint-only correction `dd8f1b802d4cc3104b4969049838252fcdb31adf`, CI `39574002868`: 549/549 tests, frozen install, formatting, lint, typecheck and build.
- Response-to-request correctness: six additional tests were executed locally RED on former source head `dd8f1b8` and all failed for the expected missing checks (unrelated same-family activity roots; contradictory record root; mismatched paging start; excess returned elements or provider-advertised count). Regression-fix commit `e33ba384df4ae0a5492f20d85e98458e91142011`, CI `39575410269`: **555/555 tests across 62 files**, frozen dependency install, formatting, lint, typecheck, build and real stdio/HTTP MCP smoke tests all GREEN.
- Independent M04.7 read-integrity review found mismatched nested `parentComment` activity roots accepted despite otherwise matching comment/object roots. Two new tests were locally verified RED; fail-closed root validation was implemented with positive same-root and cross-family compatibility tests. Source head `107ededf02ab147cd5bd3189d537cae552728fe4`, CI `39577246941`: **559/559 tests across 62 files**, frozen install, format, lint, typecheck, build and real transport smokes passed.
- Provider successful-response JSON bound is **256 KiB**, allowing substantive 100-comment pages. The older M04 ledger's 64 KiB claim was corrected.

## Security and closure status

Independent M04.7 whole-branch security review established **one unresolved Important blocker**: MCP callers can use a caller-controlled `approved:true` to mint and consume their own short-lived consequential write receipts without an independent authenticated human approval grant. M04 reply/reaction tools are affected; the structurally similar text/media approval paths must also be covered. Receipt subject/purpose isolation and idempotency do not replace human consent. PR #6 must stay draft and unmerged until a trusted out-of-band human approval grant path is implemented, regression-tested and reviewed. Latest green CI verifies code behavior, not that approval trust boundary. All live LinkedIn entitlement remains unverified.

**Exact next action:** Implement and regression-verify a trusted out-of-band human approval grant boundary for consequential MCP writes, including inherited text/media flows, before M04 merge gates.

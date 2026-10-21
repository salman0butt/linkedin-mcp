# M04 Comments & Engagement — Verification Evidence

Last reconciled: 2026-10-21. GitHub commits and exact-head CI outrank this handoff.

## Scope and provider provenance

M04 implements explicit Comments get/list, member reply preview/approve/create, reaction add/remove preview/approve/write and a bounded unanswered inbox through 12 strict MCP tools. Reads remain OFF by default and require restricted `r_member_social_feed` and trusted local opt-in. Member writes require `w_member_social_feed` plus approval and durable idempotency. The inbox is a LOCAL_ONLY derivation over explicit thread roots, not feed discovery. No live Community Management entitlement or actual provider read/write is verified.

## Reproducible verification

- M04.6 strict transport checkpoint: `79bd4bf19d06e3cc41ccc9c6fd15c00b6d173148`, CI `39058125153`: 539/539 tests and required quality gates.
- M04.7 earlier comment identity RED: `d906d730617e8931945478d187bc784c200a622a`, CI `39392445179`; GREEN `92a8ca816ca4c300c624360acde0afd6599512bf`, CI `39392843550`: 542/542 tests.
- Lint-only correction `dd8f1b802d4cc3104b4969049838252fcdb31adf`, CI `39574002868`: 549/549 tests, frozen install, formatting, lint, typecheck and build.
- Response-to-request correctness: six additional tests were executed locally RED on former source head `dd8f1b8` and all failed for the expected missing checks (unrelated same-family activity roots; contradictory record root; mismatched paging start; excess returned elements or provider-advertised count). Regression-fix commit `e33ba384df4ae0a5492f20d85e98458e91142011`, CI `39575410269`: **555/555 tests across 62 files**, frozen dependency install, formatting, lint, typecheck, build and real stdio/HTTP MCP smoke tests all GREEN.
- Provider successful-response JSON bound is **256 KiB**, allowing substantive 100-comment pages. The older M04 ledger's 64 KiB claim was corrected.

## Security and closure status

Independent whole-branch correctness, security and capability-provenance review is underway. No merge is authorized until any newly verified Critical or Important findings have been resolved, review threads cleared, traceability and state reconciled, the exact-final-head CI verified, the remote head checked for concurrent work and the PR confirmed mergeable. Post-merge `main` CI must pass before M05 activation.

**Exact next action:** Finish the independent M04.7 review and resolve any verified Critical/Important findings before final merge gates.

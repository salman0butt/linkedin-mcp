# Current Milestone

Milestone: M09 — Native Article Publishing
Status: IMPLEMENTING — local human-only handoff independent security signoff Critical=0 Important=0 and Node24 gates GREEN; PR #14 initial head CI SUCCESS, docs-updated final-head/post-merge CI PENDING; native publication BLOCKED/UNAVAILABLE.
Iteration: M09.3
Branch: `feat/m09-native-article-preparation`
PR: #14 (OPEN; initial head CI `40216591393` SUCCESS; final docs-updated head CI PENDING; M08 PRs #12 and #13 merged)
Base/main: `9f10bc4488918ada401e7a25736f7945c8d80c23`
Active remote feature head: `4cd38eb6f4b465dc4c7a65da49b79b635c7c41fd` (PR #14 OPEN; initial head CI `40216591393` SUCCESS, final docs-updated head CI PENDING).
Verified M08 final feature CI: `40120392598` at `b2c1ad9abec69ec05f1a18024f7abebffb9d007a` — SUCCESS.
Verified M08 post-merge main CI: `40120555718` at `4b56a8411eed258ad2e2832b1796031288498a0e` — SUCCESS, frozen install, 988/988 tests across 88 suites, format, lint, typecheck and build.
Verified M08 closeout PR #13: merged to main `9f10bc4488918ada401e7a25736f7945c8d80c23`, post-merge main CI `40121709957` — SUCCESS.
Independent M08.6 audit: unresolved Critical=0 Important=0 after three Important RED→GREEN fixes (credential-bearing source URL query aliases/fragments, private config path parent/child collisions and invalid UTF-8 in persisted revision-2 article data).
M09 ledger: `docs/milestones/M09-native-article-publishing.md`
Completed M08 ledger: `docs/milestones/M08-article-engine.md`
Completed M08 design: `docs/superpowers/specs/2026-10-24-m08-article-authoring-design.md`
Completed M08 plan: `docs/superpowers/plans/2026-10-24-m08-article-authoring.md`
Completed M07 design: `docs/superpowers/specs/2026-10-24-m07-job-intelligence-design.md`
Completed M07 plan: `docs/superpowers/plans/2026-10-24-m07-job-intelligence.md`
Completed M07 ledger: `docs/milestones/M07-job-intelligence.md`
M09 design: `docs/superpowers/specs/2026-10-24-m09-native-article-preparation-design.md`
M09 plan: `docs/superpowers/plans/2026-10-24-m09-native-article-preparation.md`

## Authority and restrictions

M06 Job Search is COMPLETE: PR #9 squash-merged at `0ff384ae5deb03b504259dc3f5519c8209c3e8f8`, post-merge main CI `40077809706` passed. Independent M06.6 whole-branch review closed all verified Critical/Important findings. Both M05 and M06 preserve the lack of a configured external/partner discovery provider; no live LinkedIn Talent entitlement is claimed.

M07 Job Intelligence is COMPLETE: PR #10 squash-merged at `80b563293e48afd878158bcd2ee40553997ecb42`, exact feature-head CI `40089032116` and exact post-merge main CI `40089200098` passed 902 tests across 83 files. Independent whole-branch M07.7 security/correctness reviewer signed off with zero unresolved Critical/Important findings. Read-only `linkedin.jobs.analyze` and `linkedin.jobs.compare` are locally available over STDIO and HTTP. Caller snapshots remain unverified; no applicant legal eligibility, employer verification, Talent entitlement or application submission is inferred.

M08 Article Authoring Engine is COMPLETE: PR #12 exact feature `b2c1ad9abec69ec05f1a18024f7abebffb9d007a` CI `40120392598` SUCCESS, squash merge `4b56a8411eed258ad2e2832b1796031288498a0e`, post-merge main CI `40120555718` SUCCESS with 988 tests across 88 suites. Independent audit unresolved Critical=0 Important=0. `article.draft` is verified **LOCAL_ONLY**: user sources are unverified; project persistence is opt-in STDIO-private and inaccessible over HTTP. This milestone did **not** enable native LinkedIn article publication.

M09 local preparation is **IMPLEMENTING (M09.3)**: pure manual-editor handoff **8/8 original TDD and 11/11 expanded adversarial tests GREEN**; stateless `linkedin.article.native.handoff` **4/4 missing-tool RED→GREEN**; built STDIO/HTTP and exact tool-list **15/15 GREEN**. The M08 full-MCP-wire response-size Important issue was repaired RED→GREEN. Two further independent M09 audit findings are now **resolved and independently signed off through complementary scopes**: (1) HTTP caller-controlled JSON-RPC ID original RED **267,238 vs 262,144 bytes**, patched with 128-byte UTF-8 ID ingress and 256-KiB full SSE bound; independent worker-4 HTTP review **23/23 GREEN, Critical=0 Important=0**; (2) credential-bearing source query keys `code`, `accessCode`, `ticket`, fixed RED→GREEN **69/69 strict, 99/99 broad**, independently reviewed by worker-5 **101/101 GREEN, 26 unsafe URLs rejected, 11 benign allowed, Critical=0 Important=0** (worker-5 excluded his HTTP patch; worker-4 excluded his URL patch). **Across complementary scopes, unresolved Critical=0 Important=0.** Prime verified full local Node24 gates **1,023/1,023 across 90 suites**, format:check, lint, typecheck, build and diff GREEN. **M09 PR #14 initial-head CI `40216591393` SUCCESS; final docs-updated head CI and post-merge main CI PENDING**; local signoff is not publication entitlement or overall milestone completion.

Actual native LinkedIn article publishing remains **BLOCKED/UNAVAILABLE**: the documented Posts API `content.article` produces a URL/link-preview post, not a native long-form editor document; no authorized native editor API or approved browser provider is configured. Do not automate LinkedIn's browser without authorization, bypass challenges, treat author review as publication approval, or advertise remote publication from the local handoff.

Exact next work: **Verify PR #14 exact feature-head SHA CI, then merge and verify post-merge main CI.**

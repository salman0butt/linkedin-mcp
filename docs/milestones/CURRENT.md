# Current Milestone

Milestone: M09 — Native Article Publishing
Status: IMPLEMENTING — local human-only handoff Node24 gates GREEN; M09 audit signoff/remote PR CI PENDING; native publication BLOCKED/UNAVAILABLE.
Iteration: M09.3
Branch: `feat/m09-native-article-preparation`
PR: none (active M09 PR null; M08 PRs #12 and #13 merged)
Base/main: `9f10bc4488918ada401e7a25736f7945c8d80c23`
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

M09 local preparation is **IMPLEMENTING (M09.3)**: pure native-editor manual handoff **8/8 original TDD and 11/11 expanded adversarial tests GREEN**, including malformed-surrogate URL RED→GREEN; stateless `linkedin.article.native.handoff` **4/4 genuine missing-tool RED→GREEN**; prior combined real built STDIO/HTTP and exact tool list **15/15 GREEN**. The independently discovered M08 full-wire MCP response-size Important issue was repaired with genuine RED→GREEN. A subsequent independent M09 audit found **two additional security boundaries requiring signoff**: (1) caller-controlled HTTP JSON-RPC ID produced **266,342 bytes** versus **262,144 allowed**, with HTTP-owner RED→GREEN validation **PENDING**; (2) credential-bearing source URL query keys `code`, `accessCode`, `ticket`, reproduced RED and locally fixed with **69/69 strict and 99/99 broad GREEN**, independent re-review **PENDING**. Neither finding is declared fully resolved. **Prime verified full local Node24 gates GREEN: 1,023/1,023 tests across 90 suites, format:check, lint, typecheck, build and diff check.** Independent M09 whole-branch audit signoff and M09 feature PR/exact-head remote CI are **PENDING**, not implicitly passed.

Actual native LinkedIn article publishing remains **BLOCKED/UNAVAILABLE**: the documented Posts API `content.article` produces a URL/link-preview post, not a native long-form editor document; no authorized native editor API or approved browser provider is configured. Do not automate LinkedIn's browser without authorization, bypass challenges, treat author review as publication approval, or advertise remote publication from the local handoff.

Exact next work: **Obtain independent final M09 security audit re-review/signoff on the HTTP response-size and source URL findings.** M09 PR/exact-head remote CI is a subsequent pending gate.

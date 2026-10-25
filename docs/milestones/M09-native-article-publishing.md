# M09 — Native Article Publishing

Status: **IMPLEMENTING — M09 LOCAL-ONLY MANUAL HANDOFF; INDEPENDENT LOCAL SECURITY SIGNOFF COMPLETE (CRITICAL=0 IMPORTANT=0), NODE24 GATES GREEN; PR #14 INITIAL HEAD CI SUCCESS; DOCS-UPDATED FINAL HEAD/POST-MERGE CI PENDING.** Actual native article publishing is **BLOCKED/UNAVAILABLE** without an authorized provider. PR #14 initial feature-head CI `40216591393` succeeded at `4cd38eb6f4b465dc4c7a65da49b79b635c7c41fd`; final docs-updated feature-head CI, post-merge CI, full-milestone completion and native publication remain unverified.

## Goal

Eventually support native long-form LinkedIn article publishing **only** through an independently verified, legitimately authorized provider with human-controlled security/consent. The immediately actionable **M09.0** scope is a purely local, manual-only, editor-ready handoff of verified M08 drafts, not a publication implementation.

## Dependencies

M08 Article Authoring Engine verified and merged through PR #12 and post-merge main CI. Design branch `feat/m09-native-article-preparation` starts at verified `main` `9f10bc4488918ada401e7a25736f7945c8d80c23`.

## In Scope

**Local preparation:** ordered/loss-aware blocks preserving all six M08 kinds; inert plain-text transfer data; existing M08 editorial warnings and explicit unverified source notes; human cover/media placeholders, suggested title/SEO/slug metadata; warnings for lossy editor formatting; manual-only handoff contract; optional strict read-only MCP tool over STDIO/HTTP with no private store or network. No duplicate M08 Markdown preview.

**Conditional future provider phase:** explicit provider and app authorization, independent trusted human approval, publish verification and security-challenge handling, only if a legitimate native-article provider is actually evidenced.

## Out of Scope

Any unapproved third-party browser/editor automation, DOM/clipboard injection, scraping, CAPTCHAs/security-challenge bypass, anti-bot evasion, session/cookie reuse, source fetching, arbitrary local file/media access, automatic content upload or publication. **Never** relabel a LinkedIn Posts API `content.article` external-link preview as a native long-form article. Do not infer OAuth/partner entitlement.

## Acceptance Criteria

**M09 local preparation acceptance (independently reviewed locally; remote PR/CI pending):** The pure `prepareNativeArticleHandoff(input:unknown):NativeArticleHandoff` validates an explicit M08 draft, maps ordered blocks and manual editor/SEO/cover placeholders and retains visibly `user_supplied_unverified` source associations. The handoff is human-only with `manualOnly:true`, `publicationStatus:'not_published'`, `nativePublishAvailability:'UNAVAILABLE'`. The stateless `linkedin.article.native.handoff` MCP tool accepts the full caller draft, not IDs/private state, and reports `LOCAL_ONLY`. Initially eight pure tests passed; expanded adversarial pure tests are **11/11 GREEN**, MCP tests **4/4 GREEN**, and built STDIO/HTTP plus exact tool-list checks **15/15 GREEN**. Complementary independent scopes have **zero unresolved Critical/Important findings**; the full local Node24 suite passed **1,023/1,023 tests across 90 suites**. **Initial PR #14 head CI `40216591393` succeeded; this docs-updated final head requires fresh CI, and native publishing is not available.** Existing M08 validation/preview remain the foundations; no duplicate remote publishing route is implied.

**External native publication acceptance: BLOCKED.** Requires independently documented legitimate native long-form article creation route and exact configured app/account permission, independently trusted final approval, challenge stop and a verified native article URL. Without those, no actual native publish tool/provider and **M09 cannot be marked COMPLETE**, even if the manual local preparation is implemented and verified.

## Tasks / Iterations

M09.0 official provider/policy feasibility and local design/plan (documented) → M09.1 pure model/handoff converter (**11/11 local adversarial tests GREEN; earlier 8/8**) → M09.2 stateless MCP tool (**4/4 local TDD GREEN; 15/15 combined built-transport/tool-list GREEN**) → M09.3 complementary independent code/security scopes **SIGNED OFF Critical=0 Important=0** after URL-credential and HTTP caller-ID fixes; full Node24 local gates **1,023/1,023 across 90 suites** plus format/lint/typecheck/build/diff GREEN → PR #14 initial exact-feature-SHA CI `40216591393` **SUCCESS**, docs-updated final-head CI (**PENDING**) → M09.P externally authorized native publishing (**BLOCKED** pending legitimate provider).

## TDD Evidence

**Observed genuine RED→GREEN:** M09 pure handoff tests include initial missing-module RED, subsequent contract RED and URL malformed-surrogate RED (initially **8/8**, subsequently **11/11 adversarial tests GREEN**). `linkedin.article.native.handoff` MCP registration had a genuine missing-tool RED, then **4/4 GREEN**. An independent M08 response-budget review found a full-MCP-wire Important issue (text plus structured-content copies could exceed the limit); a real-client regression failed **365,870 bytes vs 262,144 allowed** and passed after a bounded full-response correction. Subsequent independent M09 URL/query and HTTP ingress findings were reproduced and fixed through genuine RED→GREEN with complementary independent re-review. **Local audit signoff is complete; PR/remote CI remains unverified.**

## Integration Test Evidence

**Local focused M09 evidence:** real built STDIO and loopback HTTP, together with exact MCP tool-list assertions, **15/15 combined tests GREEN**. The handoff is stateless and `LOCAL_ONLY`; private saved drafts remain inaccessible over HTTP and `article.native.publish` is unavailable. **Prime independently ran the full local Node24 suite: 1,023/1,023 tests across 90 suites, `pnpm format:check`, lint, typecheck, build and `git diff --check` all GREEN.** Complementary independent review of the full M09 handoff excluding HTTP, plus a separate HTTP-specific independent audit, is **SIGNED OFF Critical=0 Important=0**. Initial PR #14 exact-feature-head CI `40216591393` **SUCCESS**; newer docs-updated final-head CI remains **PENDING**. M08 **988/988 tests across 88 suites and merged-main CI** remain historical prerequisite evidence, not M09 remote verification.

## Security Review

M09.0 feasibility and manual-handoff architecture were reviewed for provider truthfulness, security and data fidelity, and the M08 full-wire response-size Important issue was reproduced RED and fixed GREEN. **Independent M09.3 local security review is COMPLETE across complementary scopes with unresolved Critical=0, Important=0:** worker-5 independently reviewed the complete M09 branch **excluding his own HTTP patch**, verifying **101/101 focused tests**, **26 unsafe URL cases rejected**, **11 benign URL cases accepted**, and MCP secrecy/provenance; worker-4 independently reviewed **worker-5's HTTP patch** (but not worker-4's URL patch), obtaining **23/23 focused/integration tests GREEN** and adversarial actual-server checks. The HTTP bound and query-secret findings are independently re-reviewed and closed locally. No browser automation, OAuth/session elevation, HTTP private-state bypass or native publishing entitlement is implied by this security signoff. A real provider would require separate legitimate authorization and review.

## Code Review Findings

**Independently discovered M09 findings — repaired and signed off locally:**

1. **HTTP oversized caller-controlled JSON-RPC ID:** Original adversarial RED full-wire response **267,238 bytes exceeded the 262,144-byte cap**. The HTTP ingress fix rejects IDs exceeding **128 UTF-8 bytes** with a generic **400/-32600** before MCP dispatch (including mixed batches). Entire SSE response bodies exceeding **256 KiB** now return bounded **502/-32000 `operation outcome unknown`**, never deceptive success or replay-safe failure. **Independent worker-4 HTTP review signed off Critical=0 Important=0**, including real-server tests and **23/23 focused/integration GREEN**. This is separate from the earlier M08 dual-copy result-size fix.
2. **Credential-bearing source URL query keys:** `code`, `accessCode` and `ticket` (including case/encoded spellings) were accepted by M08 `normalizeArticleDraft` and preserved by the M09 handoff. The source URL owner reproduced genuine RED and applied fail-closed query-key protections; **69/69 strict ArticleDraft tests and 99/99 broader M08/M09/real-transport tests GREEN locally**. Independent worker-5 (excluding his own HTTP patch) re-reviewed **26 unsafe URLs rejected and 11 legitimate URL queries preserved**, with **101/101 focused tests GREEN**, and signed off scoped Critical=0 Important=0.

The prime's expanded pure handoff adversarial tests are **11/11 GREEN**. Across complementary independent scopes, **M09 local audit signoff is COMPLETE: unresolved Critical=0 Important=0**. The prior M08 full-wire-size Important RED→GREEN remains a separate resolved correction. M09 PR/exact-head remote CI and native publication authorization remain **PENDING/BLOCKED**, respectively.

## Fresh Verification Results

Latest verified `main` baseline `9f10bc4488918ada401e7a25736f7945c8d80c23`: M08 [PR #12](https://github.com/salman0butt/linkedin-mcp/pull/12) and M08 closeout [PR #13](https://github.com/salman0butt/linkedin-mcp/pull/13) are merged; PR #13 post-merge main CI `40121709957` **SUCCESS**. Current M09 work is **local only** on `feat/m09-native-article-preparation`: pure adversarial 11/11 GREEN (earlier 8/8), MCP 4/4 GREEN, built STDIO/HTTP/tool-list combined 15/15 GREEN, M08 full-wire-size RED→GREEN, source URL regression 69/69 strict plus 99/99 broad GREEN. **Independent worker-5 non-HTTP scope: 101/101 GREEN; 26 unsafe/11 benign URL cases; Critical=0 Important=0. Independent worker-4 HTTP scope: 23/23 GREEN, real-server oversized ID/SSE/batch/notification validation; Critical=0 Important=0.** Full local Node24 gates: **1,023/1,023 tests across 90 suites, format, lint, typecheck, build and diff GREEN**. **PR #14 is OPEN and initial feature-head CI `40216591393` SUCCESS; final docs-updated feature-head CI, post-merge main CI, publisher and native publishing entitlement remain unverified.** Official product facts used: [Microsoft Learn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09) documents an external URL `content.article.source`; [LinkedIn Help Write/publish article](https://www.linkedin.com/help/linkedin/answer/a522427/creating-articles-on-linkedin) documents manual native editor; [LinkedIn automated activity](https://www.linkedin.com/help/linkedin/answer/a1341543) and [prohibited software](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibition-of-scraping-software) prohibit unapproved third-party automation.

## Durable Recovery Sources

PRD, capability matrix, `docs/superpowers/specs/2026-10-24-m09-native-article-preparation-design.md`, `docs/superpowers/plans/2026-10-24-m09-native-article-preparation.md`, M08 verified model/test contracts, official LinkedIn docs, Git/PR/CI.

## Completion Checklist

- [x] M09.0 provider feasibility and local preparation design/plan documented; external authorization gap identified.
- [x] Pure manual handoff focused 8/8 RED→GREEN and expanded adversarial 11/11 GREEN, MCP tool 4/4 RED→GREEN, and prior built STDIO/HTTP plus exact tool list combined 15/15 local GREEN.
- [x] M08 full-MCP-wire response-bound Important issue reproduced RED and repaired GREEN in focused tests.
- [x] M09 URL-query credential-alias defect reproduced RED; local fixes passed 69/69 strict and 99/99 broad tests; independent worker-5 non-HTTP scope 26 unsafe rejected/11 benign allowed and 101/101 GREEN.
- [x] M09 HTTP oversized caller JSON-RPC ID defect (original RED 267,238 vs 262,144 bytes) repaired RED→GREEN; independent worker-4 HTTP audit 23/23 GREEN and scoped Critical=0 Important=0.
- [x] Both audit findings independently re-reviewed through complementary scopes: unresolved Critical=0 Important=0.
- [x] Full local Node24 quality gates independently executed by prime: 1,023/1,023 tests across 90 suites; format:check, lint, typecheck, build and diff GREEN.
- [x] Complementary independent non-HTTP (worker-5) and HTTP (worker-4) review scopes signed off locally with no unresolved Critical/Important.
- [ ] Legitimately authorized actual native publication provider evidenced; human approval, challenge policy, native publish and verified URL acceptance achieved (currently **BLOCKED**).
- [ ] Full M09 acceptance verified; local-only handoff success does not satisfy native publication.
- [x] Local independent scoped Critical/Important resolved (0/0); remote feature CI still pending.
- [ ] Exact-final-head/post-merge CI green.

**Exact next action:** Verify PR #14 exact feature-head SHA CI, then merge and verify post-merge main CI. Actual native publishing remains **BLOCKED/UNAVAILABLE** until a legitimately authorized provider is evidenced.

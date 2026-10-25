# M09 — Native Article Publishing

Status: **IMPLEMENTING — M09 LOCAL MANUAL HANDOFF, NODE24 LOCAL GATES GREEN; M09.3 SECURITY RE-REVIEW AND REMOTE CI PENDING.** Two independent M09 audit findings await signoff. Actual native article publishing is **BLOCKED/UNAVAILABLE** without an authorized provider. No M09 feature CI, full-milestone completion or native publish availability is claimed.

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

**M09 local preparation acceptance (focused local evidence, final audit pending):** The pure `prepareNativeArticleHandoff(input:unknown):NativeArticleHandoff` validates an explicit M08 draft, maps ordered blocks and manual editor/SEO/cover placeholders and retains visibly `user_supplied_unverified` source associations. The handoff is human-only with `manualOnly:true`, `publicationStatus:'not_published'`, `nativePublishAvailability:'UNAVAILABLE'`. The stateless `linkedin.article.native.handoff` MCP tool accepts the full caller draft, not IDs/private state, and reports `LOCAL_ONLY`. Initially eight pure tests passed; subsequent adversarial pure tests are **11/11 GREEN**, MCP tests **4/4 GREEN**, and prior built STDIO/HTTP plus exact tool-list checks **15/15 GREEN**. **These are scoped local results, not full-suite/independent review or native publication verification.** Existing M08 validation/preview remain the foundations; no duplicate remote publishing route is implied.

**External native publication acceptance: BLOCKED.** Requires independently documented legitimate native long-form article creation route and exact configured app/account permission, independently trusted final approval, challenge stop and a verified native article URL. Without those, no actual native publish tool/provider and **M09 cannot be marked COMPLETE**, even if the manual local preparation is implemented and verified.

## Tasks / Iterations

M09.0 official provider/policy feasibility and local design/plan (documented) → M09.1 pure model/handoff converter (**11/11 local adversarial tests GREEN; earlier 8/8**) → M09.2 stateless MCP tool (**4/4 local TDD GREEN; earlier 15/15 combined built-transport/tool-list GREEN**) → M09.3 independently found URL-credential and HTTP caller-ID response-boundary defects (**fix/revalidation and final independent signoff in progress; full Node24 local gates GREEN: 1,023/1,023 across 90 suites plus format/lint/typecheck/build/diff**) → PR exact-head remote CI (**PENDING**) → M09.P externally authorized native publishing (**BLOCKED** pending legitimate provider).

## TDD Evidence

**Observed genuine RED→GREEN:** M09 pure handoff tests include initial missing-module RED, subsequent contract RED and URL malformed-surrogate RED (initially **8/8**, subsequently **11/11 adversarial tests GREEN**). `linkedin.article.native.handoff` MCP registration had a genuine missing-tool RED, then **4/4 GREEN**. An independent M08 response-budget review found a full-MCP-wire Important issue (text plus structured-content copies could exceed the limit); a real-client regression failed **365,870 bytes vs 262,144 allowed** and passed after a bounded full-response correction. The newer independent M09 findings and their separately scoped fix evidence appear below. No independent final M09 whole-branch signoff or full-suite result is claimed.

## Integration Test Evidence

**Local focused M09 evidence:** real built STDIO and loopback HTTP, together with exact MCP tool-list assertions, **15/15 combined tests GREEN**. The handoff is stateless and `LOCAL_ONLY`; private saved drafts remain inaccessible over HTTP and `article.native.publish` is unavailable. **Prime independently ran the full local Node24 suite: 1,023/1,023 tests across 90 suites, `pnpm format:check`, lint, typecheck, build and `git diff --check` all GREEN.** These local gates do not substitute for final M09 security signoff or exact-feature-head remote CI, both **PENDING**. M08 **988/988 tests across 88 suites and merged-main CI** remain historical prerequisite evidence, not M09 verification.

## Security Review

M09.0 feasibility and manual-handoff architecture were reviewed for provider truthfulness, security and data fidelity, and the M08 full-wire response-size Important issue was reproduced RED and fixed GREEN with focused integration tests. **Independent M09.3 audit identified two further response/input-boundary defects; final independent signoff remains PENDING.** Required review: distinguish Posts API external-link previews from native editor articles; never automate an unauthorized browser; prevent OAuth/session/private-draft exposure; preserve ordered blocks and source associations without trust upgrades; ensure inert text, strict bounds, no external/file/browser side effects, HTTP private-state isolation and fail-closed `article.native.publish: UNAVAILABLE`. An actual provider requires separately evidenced authorization and a fresh security review.

## Code Review Findings

**Independent M09 audit findings requiring final signoff (not yet closed):**

1. **HTTP oversized caller-controlled JSON-RPC ID:** A large caller ID produced a **266,342-byte** response against a **262,144-byte** bound. The separate HTTP owner is reproducing/fixing and validating RED→GREEN; **post-fix evidence and independent re-review are PENDING**. Earlier M08 dual-copy response-size remediation does not establish this HTTP boundary safe.
2. **Credential-bearing source URL query keys:** `code`, `accessCode` and `ticket` (including case/encoded spellings) were accepted by M08 `normalizeArticleDraft` and preserved by the M09 handoff. The source URL owner reproduced genuine RED and applied fail-closed query-key protections; **69/69 strict ArticleDraft tests and 99/99 broader M08/M09/real-transport tests GREEN locally**. **Independent audit re-review/signoff is still PENDING**; this is not yet a fully closed finding.

The prime's expanded pure handoff adversarial tests are **11/11 GREEN**. Earlier M08 full-wire-size Important RED→GREEN remains a separate resolved local correction, not independent M09 whole-branch signoff. Actual native provider authorization remains **BLOCKED**, not waived.

## Fresh Verification Results

Latest verified `main` baseline `9f10bc4488918ada401e7a25736f7945c8d80c23`: M08 [PR #12](https://github.com/salman0butt/linkedin-mcp/pull/12) and M08 closeout [PR #13](https://github.com/salman0butt/linkedin-mcp/pull/13) are merged; PR #13 post-merge main CI `40121709957` **SUCCESS**. Current M09 work is **local only** on `feat/m09-native-article-preparation`, with pure adversarial 11/11 GREEN (earlier 8/8), MCP 4/4 GREEN, previous real STDIO/HTTP/tool-list combined 15/15 GREEN, M08 full-wire-size RED→GREEN and source-URL security fix 69/69 strict plus 99/99 broad GREEN. Full local Node24 gates: **1,023/1,023 tests across 90 suites, format, lint, typecheck, build and diff GREEN**. HTTP large caller-ID response fix validation and independent signoff for both findings remain pending. **No M09 feature PR/remote CI, independent whole-branch signoff, publisher or native publish permission is verified.** Official product facts used: [Microsoft Learn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09) documents an external URL `content.article.source`; [LinkedIn Help Write/publish article](https://www.linkedin.com/help/linkedin/answer/a522427/creating-articles-on-linkedin) documents manual native editor; [LinkedIn automated activity](https://www.linkedin.com/help/linkedin/answer/a1341543) and [prohibited software](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibition-of-scraping-software) prohibit unapproved third-party automation.

## Durable Recovery Sources

PRD, capability matrix, `docs/superpowers/specs/2026-10-24-m09-native-article-preparation-design.md`, `docs/superpowers/plans/2026-10-24-m09-native-article-preparation.md`, M08 verified model/test contracts, official LinkedIn docs, Git/PR/CI.

## Completion Checklist

- [x] M09.0 provider feasibility and local preparation design/plan documented; external authorization gap identified.
- [x] Pure manual handoff focused 8/8 RED→GREEN and expanded adversarial 11/11 GREEN, MCP tool 4/4 RED→GREEN, and prior built STDIO/HTTP plus exact tool list combined 15/15 local GREEN.
- [x] M08 full-MCP-wire response-bound Important issue reproduced RED and repaired GREEN in focused tests.
- [x] M09 URL-query credential-alias defect reproduced RED; local fixes passed 69/69 strict and 99/99 broad tests (independent signoff still pending).
- [ ] M09 HTTP oversized caller JSON-RPC ID defect (266,342 vs 262,144 bytes) repaired with verified RED→GREEN and independently re-reviewed.
- [ ] Independent re-review closes both newly discovered M09 audit findings before Critical/Important signoff.
- [x] Full local Node24 quality gates independently executed by prime: 1,023/1,023 tests across 90 suites; format:check, lint, typecheck, build and diff GREEN.
- [ ] Independent M09 whole-branch audit signed off after both new findings are independently re-reviewed.
- [ ] Legitimately authorized actual native publication provider evidenced; human approval, challenge policy, native publish and verified URL acceptance achieved (currently **BLOCKED**).
- [ ] Full M09 acceptance verified; local-only handoff success does not satisfy native publication.
- [ ] Critical/Important resolved.
- [ ] Exact-final-head/post-merge CI green.

**Exact next action:** Obtain independent final M09 security audit re-review/signoff on the HTTP response-size and source URL findings. M09 PR/exact-head remote CI is the subsequent pending gate. Actual native publishing remains **BLOCKED/UNAVAILABLE** until a legitimately authorized provider is evidenced.

# M09 — Native Article Publishing

Status: **BLOCKED — M09.P actual native long-form publishing lacks an authorized provider; overall M09 is NOT COMPLETE.** The narrower `LOCAL_ONLY` manual-editor handoff is **VERIFIED and MERGED** via PR #14 (final feature head `c6ef52f5`, CI `40218390770` SUCCESS; squash-merged `main` `073bf180823292dccf5719a0d55be03983705168`, exact push CI `40218532046` SUCCESS). The subsequent docs-only closeout branch has no PR/CI yet.

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

**M09 local preparation acceptance — VERIFIED and MERGED:** The pure `prepareNativeArticleHandoff(input:unknown)` validates an explicit M08 draft and produces ordered inert blocks, manual editor/SEO/cover instructions and visibly `user_supplied_unverified` source associations. The handoff remains `manualOnly:true`, `publicationStatus:'not_published'`, `nativePublishAvailability:'UNAVAILABLE'`; typed stateless `linkedin.article.native.handoff` accepts only the supplied draft and reports `LOCAL_ONLY`, never accesses private persisted projects or LinkedIn. Expanded pure tests **11/11**, MCP **4/4**, built STDIO/HTTP/tool-list **15/15**, independent scoped security reviews **Critical=0 Important=0**, and local Node24 **1,023/1,023 tests across 90 suites** were verified. PR #14 final-head CI `40218390770` and exact merged-main push CI `40218532046` **SUCCESS**. This verification **does not** satisfy native publication.

**External native publication acceptance: BLOCKED.** Requires independently documented legitimate native long-form article creation route and exact configured app/account permission, independently trusted final approval, challenge stop and a verified native article URL. Without those, no actual native publish tool/provider and **M09 cannot be marked COMPLETE**, even if the manual local preparation is implemented and verified.

## Tasks / Iterations

M09.0 provider/policy feasibility and local design/plan → M09.1 pure handoff (11/11 adversarial) → M09.2 stateless typed MCP tool (4/4; built transports 15/15) → M09.3 complementary independent security reviews (Critical=0 Important=0; local full 1,023/1,023) → PR #14 feature CI `40218390770` SUCCESS → squash-merged `main` `073bf180823292dccf5719a0d55be03983705168`, CI `40218532046` SUCCESS → **local handoff VERIFIED/MERGED**. **M09.P actual native long-form publication remains BLOCKED/UNAVAILABLE**, so overall M09 remains BLOCKED; M10 sourced research planning can proceed independently.

## TDD Evidence

**Observed genuine RED→GREEN:** M09 pure handoff original missing-module/contract/URL-surrogate tests grew from 8/8 to **11/11 adversarial GREEN**. MCP tool registration began missing-tool RED and ended **4/4 GREEN**. The M08 dual-copy MCP result size flaw originally yielded **365,870 bytes > 262,144**, and the corrected envelope passes bounds. Two later M09 issues—URL credential-query aliases and caller-controlled oversized HTTP JSON-RPC IDs—were each reproduced, repaired and independently re-reviewed through complementary scopes. **Both feature-head and merged-main CI are SUCCESS**; this evidence verifies only local manual handoff.

## Integration Test Evidence

**Local focused M09 evidence:** Built STDIO, loopback HTTP and exact tool-list assertions passed **15/15**. Stateless handoff is `LOCAL_ONLY`; private STDIO projects remain inaccessible over HTTP; `article.native.publish` is not available. Prime ran Node24 **1,023/1,023 tests across 90 suites**, format/lint/typecheck/build/diff GREEN. Complementary independent non-HTTP and HTTP scopes signed off **Critical=0 Important=0**. PR #14 final feature CI `40218390770` and exact post-merge main CI `40218532046` succeeded; no actual native publication is implied.

## Security Review

M09.0 feasibility and manual-handoff architecture were reviewed for provider truthfulness, security and data fidelity, and the M08 full-wire response-size Important issue was reproduced RED and fixed GREEN. **Independent M09.3 local security review is COMPLETE across complementary scopes with unresolved Critical=0, Important=0:** worker-5 independently reviewed the complete M09 branch **excluding his own HTTP patch**, verifying **101/101 focused tests**, **26 unsafe URL cases rejected**, **11 benign URL cases accepted**, and MCP secrecy/provenance; worker-4 independently reviewed **worker-5's HTTP patch** (but not worker-4's URL patch), obtaining **23/23 focused/integration tests GREEN** and adversarial actual-server checks. The HTTP bound and query-secret findings are independently re-reviewed and closed locally. No browser automation, OAuth/session elevation, HTTP private-state bypass or native publishing entitlement is implied by this security signoff. A real provider would require separate legitimate authorization and review.

## Code Review Findings

**Independently discovered M09 findings — repaired and signed off locally:**

1. **HTTP oversized caller-controlled JSON-RPC ID:** Original adversarial RED full-wire response **267,238 bytes exceeded the 262,144-byte cap**. The HTTP ingress fix rejects IDs exceeding **128 UTF-8 bytes** with a generic **400/-32600** before MCP dispatch (including mixed batches). Entire SSE response bodies exceeding **256 KiB** now return bounded **502/-32000 `operation outcome unknown`**, never deceptive success or replay-safe failure. **Independent worker-4 HTTP review signed off Critical=0 Important=0**, including real-server tests and **23/23 focused/integration GREEN**. This is separate from the earlier M08 dual-copy result-size fix.
2. **Credential-bearing source URL query keys:** `code`, `accessCode` and `ticket` (including case/encoded spellings) were accepted by M08 `normalizeArticleDraft` and preserved by the M09 handoff. The source URL owner reproduced genuine RED and applied fail-closed query-key protections; **69/69 strict ArticleDraft tests and 99/99 broader M08/M09/real-transport tests GREEN locally**. Independent worker-5 (excluding his own HTTP patch) re-reviewed **26 unsafe URLs rejected and 11 legitimate URL queries preserved**, with **101/101 focused tests GREEN**, and signed off scoped Critical=0 Important=0.

The 11/11 pure handoff adversarial tests and complementary independent security scopes are complete: **unresolved Critical=0 Important=0**. The earlier M08 full-wire size Important finding is separately repaired. Both PR #14 final-head and post-merge main CI succeeded, verifying only **local manual preparation**; native publication authorization remains BLOCKED.

## Fresh Verification Results

Latest verified `main` is `073bf180823292dccf5719a0d55be03983705168` after PR [#14](https://github.com/salman0butt/linkedin-mcp/pull/14) final feature head `c6ef52f5` passed CI `40218390770` SUCCESS and squash merge passed exact main-push CI `40218532046` SUCCESS. M08 feature PR #12 and closeout PR #13 remain historically merged and verified. M09 local pure/MCP/built integration tests passed 11/11, 4/4, 15/15; source URL regressions 69/69 strict and 99/99 broad; independent worker-5 non-HTTP 101/101, 26 unsafe URL rejects, 11 benign accepts; independent worker-4 HTTP 23/23; full Node24 1,023/1,023 with format/lint/typecheck/build/diff GREEN. **Native Write article publishing remains BLOCKED/UNAVAILABLE**: [Microsoft Learn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09) `content.article` is a link preview, not a native article creation API. The docs-only closeout branch `docs/m09-manual-handoff-closeout` is based on verified `main`; its own PR/CI remains pending.

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
- [x] Independent scoped Critical/Important findings resolved (0/0), with exact-feature-head and main CI SUCCESS.
- [x] PR #14 final-feature-head CI `40218390770` and exact squash-merged main CI `40218532046` SUCCESS for `073bf180823292dccf5719a0d55be03983705168`; docs-only closeout branch CI not yet established.

**Exact next action:** Create the docs-only M09 verified-handoff closeout PR and verify its exact-head CI. **M10.0 sourced content-research design/spec/plan** follows that checkpoint; **M09.P remains BLOCKED/UNAVAILABLE** and overall M09 is not COMPLETE.

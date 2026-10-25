# M09 Native Article Preparation — Test-first Implementation Plan

Date: 2026-10-24. Milestone: `docs/milestones/M09-native-article-publishing.md`. Requirements: `R-M09-NATIVE` (local preparation sub-scope only). Source-of-truth design: `docs/superpowers/specs/2026-10-24-m09-native-article-preparation-design.md`.

> **M09 LOCAL HANDOFF IMPLEMENTING; LOCAL NODE24 GATES GREEN, INDEPENDENT SECURITY RE-REVIEW/REMOTE CI PENDING.** Routine internal design is authorized. Pure manual handoff original 8/8 RED→GREEN and expanded adversarial 11/11 GREEN; stateless MCP tool 4/4 missing-tool RED→GREEN; previous real built STDIO/HTTP plus exact tool list 15/15 GREEN. Independently discovered M08 dual-copy full-wire size Important was repaired RED→GREEN. Two further independent M09 audit findings (oversized HTTP caller ID and credential-query URL aliases) require re-review, even though the URL fix has locally passing regressions. **Prime's full local Node24 run 1,023/1,023 tests across 90 suites and format:check/lint/typecheck/build/diff GREEN**; independent final M09 signoff and PR exact-head **remote CI** are pending. **Native LinkedIn article publishing remains BLOCKED/UNAVAILABLE** without a legitimately approved and configured provider.

**Environment:** `feat/m09-native-article-preparation` from verified `main` `9f10bc4488918ada401e7a25736f7945c8d80c23`; M08 closeout PR #13 post-merge main CI `40121709957` SUCCESS. Node 24, pnpm 12, TypeScript, existing Vitest/Zod v4/MCP SDK. M09 focused local behavior is evidenced below, but no M09 feature PR/remote CI or final independent full-branch verification exists. M08 Article Authoring Engine is verified as `LOCAL_ONLY`.

## M09.0 — Feasibility, architecture and safety boundary

- [x] Read repository/PRD/M09 ledger, M08 article model/renderer/MCP contracts and source-provenance constraints. Choose reuse over duplicate preview, storage or schema.
- [x] Confirm official Microsoft Learn Posts API `content.article.source` is an **external link preview post**, not native long-form editor article content; LinkedIn Help documents the interactive **Write article** editor. Record exact provider/API distinction in spec.
- [x] Record LinkedIn Help restrictions against unapproved third-party scraping/browser automation. No ordinary native editor API or authorized browser provider is established in this repository; real external native publishing remains **UNAVAILABLE/BLOCKED**.
- [x] Specify a bounded local-only manual editor handoff with ordered blocks, cover/media human placeholders, SEO, unverified sources, loss warnings, no active HTML, no network/session/automated publication, and testable optional stateless MCP.
- [ ] Independent pre-implementation review of the design's provider-truthfulness, data fidelity, injection, output/privacy boundaries and YAGNI; amend spec and plan for any verified Critical/Important finding before implementing.

## M09.1 — Pure manual editor handoff (genuine RED → GREEN)

**Locally implemented and tested:** `apps/server/src/articles/native-handoff.ts`, `apps/server/test/native-handoff.test.ts`. Independent final security re-review remains pending.

**Exact export:** `prepareNativeArticleHandoff(input: unknown): NativeArticleHandoff`. See spec for complete strongly typed `NativeArticleHandoff`/`NativeEditorBlock` and mapping. Reuse `normalizeArticleDraft` and `validateArticleDraft` from M08; no M08 Markdown preview duplication. Input is an explicit article draft, not a project/store identifier.

1. [x] **Observed RED→GREEN:** Missing `native-handoff.ts` module failed first before the pure implementation; original focused 8/8 GREEN, expanded independent/adversarial pure suite 11/11 GREEN.
2. [x] **Contract/fidelity:** Focused tests cover six block kinds, original zero-based block order, repeated kinds, canonical source IDs, exact authored text, Unicode and manual mapping warnings; included in 8/8 GREEN.
3. [x] **Provenance/media:** Focused tests cover visibly unverified source associations, metadata/SEO omissions and manual cover/formatting behavior without publication claims; included in 8/8 GREEN.
4. [x] **Security/negative:** Focused tests cover hostile inert prose and reject forged source/approval/publication/path fields plus malformed URL-surrogate inputs; the malformed-surrogate regression was observed RED→GREEN. Existing M08 normalization checks remain inherited; independent final audit is still pending.
5. [ ] **Full bounds/no-side-effects audit:** Pure implementation includes bounded output and no provider/browser dependency by design; independently audit crash/error boundaries, byte limits and all side effects before full signoff. No full-suite or final security signoff is claimed from focused tests.
6. [x] **GREEN:** Implemented pure manual handoff with existing M08 canonical normalization/editorial review; original focused 8/8 and expanded adversarial 11/11 suite GREEN. No native publish provider or remote write path was introduced.
7. [x] **Local full quality and regression gates:** Prime ran Node24 full `pnpm test` **1,023/1,023 tests across 90 suites** plus format:check, lint, typecheck, build and diff check GREEN. Exact remote feature-head CI and independent final audit are still pending.

## M09.2 — Optional local MCP handoff adapter (separate RED → GREEN)

**Local implementation files:** `apps/server/src/article-mcp.ts`, `apps/server/src/create-server.ts`, `apps/server/test/mcp-native-article-handoff.test.ts`, `apps/server/test/mcp-article-contract.test.ts`, `tests/contract/{stdio-smoke,http-smoke}.test.ts`. Do not touch persistent store config or publishing adapters merely to add the pure tool.

**Tool name:** `linkedin.article.native.handoff`. **Input:** exact strict `{draft: ArticleDraft}` (same M08 draft schema, no project IDs, paths, account, provider, approval or tokens). **Output:** strict typed `LOCAL_ONLY` MCP envelope with `data:NativeArticleHandoff` and `publicationStatus:'not_published'`/`nativePublishAvailability:'UNAVAILABLE'`; cap **full** text and structured response at existing 256 KiB. Stateless, works over STDIO/HTTP without private store/network.

1. [x] **Observed RED→GREEN:** Missing `linkedin.article.native.handoff` tool was reproduced RED in real MCP contract testing; 4/4 focused MCP tests GREEN after registration, including malicious inputs and size/response checks.
2. [x] **Isolation contract:** Focused MCP tests include an injected private STDIO article store over HTTP that is never touched, and preserve `article.native.publish: UNAVAILABLE` without a native publisher. Independent whole-branch audit is pending.
3. [x] **GREEN:** Local stateless adapter registered with existing article MCP typed/sanitized `LOCAL_ONLY` envelope; no new native publishing provider or storage/config dependency. Focused MCP 4/4 GREEN.
4. [x] **Real transports:** Built STDIO, loopback HTTP and exact tool-list checks combined 15/15 GREEN locally. No M09 feature-head remote CI evidence yet.

## M09.3 — Independent audit, quality gates and durable local closeout

- [ ] **Independent security audit re-review/signoff pending.** Auditor reproduced (1) oversized HTTP JSON-RPC caller ID **266,342 response bytes vs 262,144 max**; separate HTTP owner validating RED→GREEN and (2) M08 `ArticleDraft` source URL `code`/`accessCode`/`ticket` credential-query aliases preserved by handoff; genuine RED→GREEN input fix locally passed **69/69 strict and 99/99 broad M08/M09/transport tests**. Neither finding is signed off. Continue reviewing provider laundering, browser authorization, provenance, injection, order, privacy and side effects before declaring **unresolved Critical=0 Important=0**.
- [x] **Prime's complete local Node24 quality gates GREEN:** `pnpm test` **1,023/1,023 tests across 90 suites**, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check`. Full local gates do not equal independent audit signoff or PR exact-head remote CI.
- [ ] Only after implementation/review/gates: update active milestone/capability/traceability docs accurately to distinguish _local handoff verified_ from _native publication still blocked_. Do not mark all `R-M09-NATIVE` VERIFIED based on a local preparation tool.
- [ ] Create/update M09 local preparation PR, verify exact-final-feature-SHA GitHub CI, merge only through project gates and verify exact post-merge main CI. If local preparation is verified, record a **scoped completion checkpoint**, not total M09 native publishing completion.

## M09.P — External native publication acceptance is BLOCKED

- [ ] Obtain authoritative documentation for a real native long-form article **creation** provider (not a Posts API external-link/article preview), express integration permission, approved application access/scopes, concrete member/Page entitlement and lawful provider integration. **No such route is currently established**.
- [ ] Only after provider authorization, design an independent host/human approval grant bound to exact article hash+identity, preview, idempotency, verification of returned **native article** URL, audit/failure uncertainty and challenge-stop behavior. Do not rely on model-generated approval or a third-party browser automation workaround.
- [ ] Implement and review a genuinely authorized provider in a separate approved scope, never spoofing human UI interactions, scraping, CAPTCHA, browser extensions, hidden sessions, rate-limit evasion or Posts API link posts as native long-form articles. If authorization cannot be established, retain `article.native.publish: UNAVAILABLE` and **M09 native-publication acceptance BLOCKED**.

## Explicit progress markers

**M09.3 current checkpoint:** IMPLEMENTING — pure initial 8/8 and expanded adversarial 11/11 GREEN, MCP 4/4 focused RED→GREEN, prior built STDIO/HTTP/tool-list 15/15 GREEN; M08 dual-copy full-wire-size Important RED→GREEN. Independent audit found HTTP caller ID **266,342 > 262,144** (HTTP owner validation pending) and URL-query `code`/`accessCode`/`ticket` alias exposure (RED→GREEN **69/69 strict, 99/99 broad**, independent signoff pending). Prime's full Node24 local gates **1,023/1,023 across 90 suites**, format/lint/typecheck/build/diff GREEN. Final independent security signoff and exact M09 PR-head **remote** CI remain pending. **M09 overall:** NOT COMPLETE; external native publishing BLOCKED/UNAVAILABLE on legitimate provider evidence. **Exact next action:** Obtain independent final M09 security audit re-review/signoff on the HTTP response-size and source URL findings.

# M05 Post Discovery & Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver trustworthy provider-provenance-aware post search with bounded, source-audited results.

**Architecture:** Put pure validated canonical queries/results in core, then deterministic filtering/dedupe and optional provider services in server. Add any documented official author finder behind explicit access controls. Register a strict MCP search surface only when the service can report truthful `unavailable` outcomes without provider credentials.

**Tech Stack:** Node 24, TypeScript 5, Vitest, Zod 4, existing MCP SDK, shared runtime.

**Spec:** `docs/superpowers/specs/2026-10-22-m05-post-discovery-design.md`.

## Global Constraints

- Never represent general topic/hashtag search as a normal official LinkedIn API. Every result has actual source type and retrieval evidence.
- No default external provider, stealth scraping, arbitrary URLs, fabricated LinkedIn capabilities or provider permission bypass.
- No actor/token override or provider configuration from MCP caller input.
- Results/filters bounded: 1–50 posts/request, default 10, finite engagement metrics, date ranges ordered.
- Invalid input fails locally before side effects. No access failure becomes an empty-success result.
- No production behavior without observed RED first; verify GREEN focused + full suite and record exact-head CI on each milestone checkpoint.

## Review Focus

- Empty no-provider vs real empty search: fail `unavailable` without implying 0 matching posts.
- Same content from different independent sources: do not conflate unrelated posts via text similarity.
- Hostile or wrong-host URL/HTML in provider content: reject/escape, do not construct URLs or execute text.
- Official author-finder scope/subject/organization and 100-item pagination: deny without verified authorization.
- Missing publication or engagement timestamps/counts: omit fields rather than guessing; newest sort only for actual parsed dates.

---

### Task 1: Canonical query, result, and provenance contract (M05.1)

**Files:** Create `packages/core/src/post-discovery.ts`, `packages/core/test/post-discovery.test.ts`; update `packages/core/src/index.ts`.

**Interfaces produced:** `PostSearchKind`, `PostSearchQuery`, `NormalizedPost`, `PostSearchResult`, `createPostSearchQuery(input: unknown): PostSearchQuery`, `normalizeDiscoveredPost(input: unknown, context: TrustedDiscoveryContext): NormalizedPost`.

- [x] Test invalid search mode, empty/oversized query, missing/wrong URNs, non-ISO or reversed date ranges, limit 0/51, and valid topic/hashtag/author/company/recent. Expected: invalid throws before network; valid returns frozen normalized canonical query.
- [x] Run `vitest run packages/core/test/post-discovery.test.ts`. Expected RED from absent module/functions, with unrelated tests unaffected.
- [x] Implement minimal pure contract and result normalization; reject invalid provider labels, out-of-range metrics, wrong URL hosts, missing stable ID, spoofed provider/type, missing trusted context and malformed timestamps. Do not assign sources or metrics implicitly.
- [x] Run focused GREEN, then `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm format:check`. Expected all green.
- [x] Commit to current M05 branch, record test counts/RED-GREEN in M05 milestone ledger and exact-head CI (`1bbc366`, run `39743915175` 589 tests).

### Task 2: Deterministic filtering and deduplication (M05.2)

**Files:** Create `apps/server/src/discovery/post-search-filter.ts`; test `apps/server/test/post-search-filter.test.ts`.

**Interfaces:** consumes `PostSearchQuery` and normalized posts; produces `filterDiscoveredPosts(posts, query)` with bounded sorted deduped results.

- [x] RED: test topic, hashtag, explicit author/company, real published date bounds, missing metadata, dedupe only by same-provider ID or independently verified canonical identity (not provider-claimed external URNs), conflicting sources, engagement threshold on real metrics and count clamps.
- [x] GREEN with deterministic pure pipeline; no implicit network or invented timestamps.
- [x] Full tests/lint/typecheck/build/format; checkpoint CI before continuing (M05.2 CI `39744941663`, 596 tests).

### Task 3: Optional provider router and availability taxonomy (M05.3)

**Files:** Create `apps/server/src/discovery/post-search-service.ts`; test `apps/server/test/post-search-service.test.ts`.

**Interfaces:** `DiscoveryProvider` has trusted immutable `{providerId, providerType, name, supportedKinds}` plus `search(query)`; `createPostSearchService({providers, limits, now})` injects trusted retrieval clock and returns per-provider outcomes with `partial` on mixed success/error, `unavailable` without providers and no network calls.

- [x] RED for absent provider, permission/restriction, rate limits, failures, empty consulted provider, timeout and oversized provider response, hostile result data, response-source spoofing, unsupported-kind routes and bounded fan-out. Assert mixed success/empty plus provider-error => partial not available-empty; all failures => deterministic precedence.
- [x] GREEN read-only fail-closed service; no client-controlled endpoint, provider fallback only when configured and labelled.
- [ ] Full regression gates and exact-head CI checkpoint.

### Task 4: Documented author finder (M05.4)

**Files:** Create `apps/server/src/discovery/linkedin-author-posts.ts`; test `apps/server/test/linkedin-author-posts.test.ts`; wire only with restricted local authorization.

- [ ] RED for missing restricted scope/default-off trusted read gate, absent verified author member ID/organization role, wrong author URN, `viewContext=READER`, published/public-only results, versioned headers, wrong HTTP taxonomy, body/paging bounds, and forbidden bulk author requests.
- [ ] GREEN for _single-author_ official Posts API finder using configured app context only; do not convert to global keyword search.
- [ ] Full verification and exact-head CI, verify restricted access defaults off.

### Task 5: MCP surface and transport (M05.5)

**Files:** Add `apps/server/src/discovery-mcp.ts`; update `apps/server/src/create-server.ts`, `apps/server/src/runtime.ts`, capability registry, stdio/HTTP contract tests and capability matrix.

- [ ] RED: `linkedin.posts.search` strict input, zero configured provider => explicit unavailable; partial mixed-provider response maps to a distinct non-success MCP representation; source provenance and bounded output, no access token/endpoint field, real transport contracts.
- [ ] GREEN: shared runtime injection and truthful capability state, no false availability.
- [ ] Full suite, lint, typecheck, formatting, build and real transports; exact-head CI.

### Task 6: Independent closeout and integration (M05.6)

**Files:** Update `docs/progress/*`, `docs/milestones/M05-post-search.md`, `CURRENT.md`, requirements traceability, capability matrix, security evidence and PR.

- [ ] Whole-branch skeptical review with provenance, privacy/security and TDD regressions for every Critical/Important finding.
- [ ] Zero unresolved Critical/Important, clean PR threads, durable state accurate, exact-final-head CI green, mergeable with no concurrent conflicts.
- [ ] Squash-merge under repository policy; verify post-merge main exact SHA CI before activating M06.

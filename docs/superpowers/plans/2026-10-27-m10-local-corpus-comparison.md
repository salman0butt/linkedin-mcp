# M10.3 Caller-Defined Two-Cohort Corpus Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Side-by-side, deterministic, source-linked literal focus-term observations in exactly two explicitly caller-assigned disjoint cohorts from **one** bounded unverified research corpus, with no inferred market/competitor/content gap.

**Architecture:** A new pure server comparison module safely validates cohort metadata and complete source partition, calls the existing M10.0 `analyzeResearchCorpus` **once** on the single supplied corpus, then filters immutable original UTF-16 literal evidence by cohort source ID. Add a distinct strictly typed `linkedin.research.compare_cohorts` MCP operation via the existing local research registrar, truthful `LOCAL_ONLY` capability, and real built STDIO/HTTP contracts; no new retrieval, source parser, matcher, storage or provider.

**Tech Stack:** Node.js 24, TypeScript 5, pnpm, Vitest, existing M10.0/M10.1 `packages/core` and `apps/server`, Zod v4, MCP SDK, Prettier/ESLint, built `tests/contract` STDIO/HTTP suites.

**Spec:** `docs/superpowers/specs/2026-10-27-m10-local-corpus-comparison-design.md`

## Global constraints and ownership

- Worktree already created: `/linkedin-mcp/.worktrees/m10-local-corpus-comparison` on `feat/m10-local-corpus-comparison`, baseline verified `main` `e7be937961f138a7df769c5a63dba7646d0fface`. Main M10.0/M10.1/M10.2 LOCAL_ONLY capabilities are separately verified/merged; **M10.3 is not implemented or verified by this plan**. Inspect current Git/source, parallel owners and actual required CI again before implementation.
- **Exact public input:** required `{topic,focusTerms,sources,cohorts,unmatchedSourceIds}`; exactly **two** caller-defined cohorts, each `{id,label,sourceIds}`, **1–12** explicit focus terms, **2–20** total source records (max200KiB normalized inherited core corpus). `unmatchedSourceIds` is **required** even when empty; every normalized source ID appears in exactly one of cohort A, cohort B or unmatched; each cohort must have ≥1 member. Reject duplicate, cross-cohort, unknown or implicitly dropped source IDs. Source-ID identity is exact **case-sensitive**; caller cohort IDs are case-insensitively unique.
- Input fields at root/cohort/source are exact own enumerable data, no Proxy/getter/nonenumerable/symbol/inherited key or accessor; dense plain arrays with no extras. Context, focus-term and label text are valid trimmed single-line Unicode (no lone surrogate/C0/C1/U+2028/U+2029); focus terms 1–80 UTF-16, topic 1–200, labels 1–80, cohort IDs ASCII 1–80, source records use **unchanged M10.0 core** URL/body/date limits. Sanitize all errors. Source query param with benign key but token-like value is an inherited residual (display URL **may echo it**); no guarantee of arbitrary secret-value filtering and no new URL validator.
- Focus terms and cohort labels reject duplicates/aliases under `toLocaleLowerCase('en-US')` **OR** JavaScript literal `/iu` Unicode match equivalence (M10.1's anchored escaped matcher-identity approach). Handle aliases `s/ſ`, `σ/ς`, `k/K` and dotted-I `İ` vs `i\u0307`. For topic-equivalent term under actual `/iu`, map to analyzer's topic result; if topic/term lowercase collide but `/iu` does **not**, reject **before** false term mapping. **Never** implement another source-body matcher.
- Call `analyzeResearchCorpus({topic,focusTerms,sources})` **once**, which itself calls `normalizeResearchCorpus` once. Keep M10.0 ≤204,800 UTF-8 serialized normalized corpus, ≤20×50,000 source body UTF-16 bounds, canonical inert HTTPS URLs, real caller-reported UTC dates. Do not re-normalize already-normalized sources carrying `sourceTrust`.
- Pure output: `kind:'local_caller_defined_corpus_comparison'`, `status:'available'`, `comparisonOrigin:'caller_defined_cohorts'`, `sourceTrust:'caller_supplied_unverified'`, `verification:'not_performed'`, `topic,focusTerms,sourceSummaries,cohorts:[{id,label,sourceIds,termObservations:[{term,state,evidence}]}],unmatchedSourceIds,warnings`. Each term's `state` is only `observed_in_supplied_cohort`/`not_observed_in_supplied_cohort`. All terms appear in both cohorts even when not observed. Membership and evidence source order canonicalized to original corpus order, cohort/term order caller-defined. **No** score/count-as-weight, market gap, competitor inference, trend, significance, recommendation, verified date or factual negative claim.
- Literal evidence uses unchanged M10.0 first whole-word span/source, original `quote === body.slice(start,end)`, `offsetUnit:'utf16'` and `endExclusive:true`, quote ≤160 UTF-16 units. **Bounded snippets are intentionally output**; do not echo complete bodies or any text outside matching quotes/declared metadata. Unmatched source evidence must never enter either cohort even if it matches a term.
- Deep-freeze all emitted arrays/objects and cap complete pure JSON ≤98,304 UTF-8 bytes (96KiB), inherited analyzer separately ≤96KiB. On overflow throw existing `ResearchOutputTooLargeError`; never discard evidence and succeed. Typed MCP total duplicated text+structured+wrapper ≤262,144 UTF-8 (256KiB), **actual** HTTP SSE ≤262,144, host request IDs bounded ≤128 ASCII or safe fallback; errors fixed `invalid_input|analysis_too_large|output_too_large|invalid_output` and `retryable:false`.
- New **`linkedin.research.compare_cohorts`** registered in existing `registerResearchTools`; distinct capability `research.compare_cohorts` (`LOCAL_ONLY`, `ACTIVE`/`AVAILABLE` only once implemented). `research.topic` remains `EXTERNAL_DISCOVERY`/`UNAVAILABLE`, no `linkedin.research.topic`, M09 native long-form publishing remains blocked. No network/DNS/browser/provider/LLM/persistence/auth/private article/job store; no changed historical M10.0–M10.2 contracts.
- **Exclusive future implementation owners:** Task 1/2 pure module + its one test file; Task 3 MCP registrar + new MCP test; Task 4 capability tests plus built STDIO/HTTP tests (one owner to avoid collision); Task 5 independent reviewers and prime-owned durable docs/Git/CI. Sequence shared `research-mcp.ts` and transport ownership; do not stage/commit/remote-write before prime integrates/reviews. **This document's author is restricted to this plan and its companion design spec**, no source/tests/status edits, staging, commits, pushes or branch creation.
- Genuine RED→GREEN per meaningful behavior, observed under Node24 and functional pnpm (a broken Corepack cache, missing built package or stale dist is **not** a behavioral RED). Record actual results, not expected counts, and rebuild before real transport smoke. Completion requires independent Critical=0 Important=0 and exact feature-head + post-merge main CI.

## Review focus — five high-risk independent classes

1. **Membership integrity:** duplicate source in both cohorts, unknown/case-mismatched source ID, an implicit missing source, duplicate unmatched membership, empty cohort, `constructor` key and reordered caller membership must fail closed or canonicalize as specified; no source silently assigned. Test Task 1.
2. **Wrong evidence attribution:** a focus term appearing only in the _other_ cohort or only an _unmatched_ source must be `not_observed_in_supplied_cohort` with empty evidence. Topic-equivalent aliases and Unicode lower-case collisions must never borrow incorrect spans; emoji and ZWJ offsets must round-trip. Test Task 2.
3. **Hostile input and SDK secrets:** root/cohort/source getters, proxies, sparse/extra arrays, unknown property **names** with canary and forged provenance fields must not leak via pure errors or SDK pre-callback validation. Test Tasks 1 and 3.
4. **Truncation/resource ceilings:** max two cohorts, 12 terms, 20 sources, 200KiB input, 96KiB pure, complete duplicated MCP 256KiB and **raw** SSE full frame 256KiB, 270k injected host request ID; overflow must not return partial success or body content. Test Tasks 2–4.
5. **Unverified provenance and store isolation:** duplicate bodies/URLs are not corroboration; reported date remains unverified; malicious HTML/Markdown/prompt instructions inert; benign `?ref=sk_live_FAKE_CANARY` echoes only in display metadata per residual; no private STDIO store reads/HTTP access, no `research.topic` or native publication. Test Tasks 1–4.

---

### Task 1: Strict own-data parser and complete cohort partition (pure owner)

**Files:**

- Create: `apps/server/src/research/corpus-comparison.ts`
- Create: `apps/server/test/corpus-comparison.test.ts`
- Read only: `apps/server/src/research/theme-grouping.ts`, `apps/server/src/research/content-analysis.ts`, `packages/core/src/content-research.ts`

**Interfaces:**

- Consumes `compareResearchCohorts(input:unknown)` with exact `CorpusComparisonInput`; validated context/terms/cohort descriptors and single caller corpus.
- Produces `compareResearchCohorts(input:unknown):Readonly<LocalCohortComparison>` and strict safe metadata/partition; Task 2 fills exact evidence. Shared pure error is fixed `Invalid corpus comparison: <known field>` or inherited fixed `Invalid research corpus: <known field>`, never offending caller text.

- [ ] **Step 1 — Test-first missing-module RED:** create `apps/server/test/corpus-comparison.test.ts` importing `../src/research/corpus-comparison.js`. Fixture:

  ```ts
  const request = {
    topic: 'Source notes',
    focusTerms: ['RAG', 'SQL'],
    sources: [
      { id: 'a1', title: 'Caller A1', url: 'https://research.example.org/a1', body: '🤖 RAG in this note.' },
      { id: 'a2', title: 'Caller A2', url: 'https://research.example.org/a2', body: 'Unrelated notes.' },
      { id: 'b1', title: 'Caller B1', url: 'https://research.example.org/b1', body: 'SQL is here.' },
      { id: 'unused', title: 'Unused', url: 'https://research.example.org/u', body: 'RAG and SQL are here.' },
    ],
    cohorts: [
      { id: 'a', label: 'Draft A', sourceIds: ['a2', 'a1'] },
      { id: 'b', label: 'Draft B', sourceIds: ['b1'] },
    ],
    unmatchedSourceIds: ['unused'],
  };
  const result = compareResearchCohorts(request);
  expect(result.kind).toBe('local_caller_defined_corpus_comparison');
  expect(result.cohorts[0]?.sourceIds).toEqual(['a1', 'a2']); // corpus order
  expect(result.unmatchedSourceIds).toEqual(['unused']);
  expect(result.cohorts[0]?.termObservations.map((item) => item.term)).toEqual(['RAG', 'SQL']);
  ```

  Check that grouped source IDs are canonical corpus order, not incoming source-ID array order. **No file implementation before this test**.

- [ ] **Step 2 — Observe genuine RED:** under Node24 run `pnpm exec vitest run apps/server/test/corpus-comparison.test.ts --reporter verbose`; report expected missing-module/import failure **before source creation**. If an owner has begun implementation, recover real previous RED or write a new failing behavioral assertion instead of fabricating missing-module history.
- [ ] **Step 3 — Add partition/input hostile RED cases:** cohorts 0,1,3 rejected; empty A/B; sources 0,1,21 rejected; terms 0,13; required missing `unmatchedSourceIds` rejected; valid explicit empty unmatched `[]`; duplicate within cohort, duplicate across cohorts, unknown/mistyped case membership, ID omitted from all three, ID also unmatched, duplicate unmatched, invalid cohort IDs/labels and forged `provider,verified,retrievedAt` at every level. Reject all with sanitized fixed errors. Test `source.id:'constructor'`, distinct `A`/`a` source IDs, cohort ID case duplicates `A`/`a` rejected.
- [ ] **Step 4 — Add hostile object/Unicode RED cases:** throwing getter at root/cohort/source (getter invocation count zero), Proxy at root/cohort/membership/source arrays, nonenumerable and symbol properties, custom prototypes, sparse arrays/extraneous keys, U+2028/U+2029, C1, unpaired surrogate. Reject matcher-equivalent focus terms `s/ſ`, `σ/ς`, `k/K` and dotted-I alias `İ/i\u0307`, and case-alias cohort labels; reject topic `İ` + term `i\u0307` collision before false attribution.
- [ ] **Step 5 — Minimum strict GREEN:** implement own-data descriptor checks using M10.1's guarded pattern; validate scalar cohorts/terms/membership shape **without reading raw source body**. Safely build fresh `{topic,focusTerms,sources}` for `analyzeResearchCorpus` **once**. After analyzer returns trusted `sourceSummaries`, verify source-ID set partition, generate canonical per-cohort IDs and unmatched IDs by filtering original source summary order. No new URL/body parser or broad refactor.
- [ ] **Step 6 — Verify GREEN:** rerun one-suite Node24 test and `pnpm exec vitest run apps/server/test/corpus-comparison.test.ts apps/server/test/theme-grouping.test.ts apps/server/test/content-analysis.test.ts packages/core/test/content-research.test.ts --reporter verbose`; fix only expected ownership issues. Record actual counts.

### Task 2: Source-scoped literal projection, provenance and pure budget (same pure owner)

**Files:**

- Modify: `apps/server/src/research/corpus-comparison.ts`
- Test: `apps/server/test/corpus-comparison.test.ts`
- Reuse unchanged: `apps/server/src/research/content-analysis.ts`

**Interfaces:**

- Consumes immutable analyzer `ResearchAnalysis['termCoverage']`, `ResearchEvidenceSpan` and source-ordered `sourceSummaries` plus verified cohort memberships.
- Produces complete deep-frozen `LocalCohortComparison` with `termObservations` in **both** cohorts for **all** caller terms, per-cohort filtered original UTF-16 first spans and fixed warnings; complete pure JSON ≤98,304 bytes.

- [ ] **Step 1 — Evidence-specific RED assertions:** in Task 1 fixture, cohort A `RAG` evidence has exactly `{sourceId:'a1',field:'body',start:3,end:6,offsetUnit:'utf16',endExclusive:true,quote:'RAG'}` and state `observed_in_supplied_cohort`; A `SQL` is `not_observed_in_supplied_cohort`/`[]`; B `SQL` observed at `start:0,end:3`; B `RAG` not observed; `unused` matches both but has **zero evidence** in either group. Output excludes unrequested topic term.
- [ ] **Step 2 — Verify intended RED**, then add cases for term in both cohorts, in neither, only unmatched; same literal repeated twice in one source still one first span; full-body duplicates or canonical URL collisions across distinct source IDs are not described as corroboration; one source in A, one in B yields fixed `single_source_cohort` caution but `status:'available'` (computation only). Assert stable source/term/cohort order and deep freeze.
- [ ] **Step 3 — Unicode and topic alias RED cases:** astral emoji/ZWJ/combining code points before match; spaced phrase spanning tabs/newlines, case-insensitive original quote and whole-word boundaries; focus term `ſ` with topic `s` and `K`/`k` map to topic evidence _only if matcher-equivalent_; `İ`/`i\u0307` must not return a fabricated quotation, and alias duplication rejected. For every span, compare against original `body.slice(start,end)`.
- [ ] **Step 4 — Minimum GREEN projection:** map each accepted focus term to _one_ verified analyzer term record (topic-first logic from M10.1, guard locale lowercase collision vs actual `/iu`). Filter frozen evidence by each cohort's source-ID `Set`, keep original source order, derive state **from filtered evidence** not global analyzer state. Preserve original term spelling and original quote, share immutable analyzer evidence span objects without changing offsets. Build warning order `caller_sources_unverified`, `comparison_is_corpus_only`, `cohorts_caller_defined_only`, conditional `single_source_cohort`, `unmatched_sources_excluded`, `dates_caller_reported_only`.
- [ ] **Step 5 — Provenance/size RED tests:** 12 focus terms, 2 cohorts, 20 sources; corpus JSON near 200KiB succeeds, >200KiB fails sanitized; 96KiB inherited analyzer overflow and comparison serialization guard both fail `ResearchOutputTooLargeError`, never partial success. If the independent outer limit is unreachable under upstream ≤96KiB, show actual bounded max-size fixture and assert explicit serializer guard exists; **do not claim an unobserved RED**. No whole bodies or user "verified competitor" prompts in output except strictly bounded literal matched quotes; canonical URL value `?ref=sk_live_FAKE_CANARY` is documented potentially echoed as user-supplied display metadata, not newly verified/hidden.
- [ ] **Step 6 — Focused GREEN and quality:** `pnpm exec vitest run apps/server/test/corpus-comparison.test.ts apps/server/test/theme-grouping.test.ts apps/server/test/content-analysis.test.ts packages/core/test/content-research.test.ts --reporter verbose`, `pnpm exec prettier --check apps/server/src/research/corpus-comparison.ts apps/server/test/corpus-comparison.test.ts`, `pnpm exec eslint apps/server/src/research/corpus-comparison.ts apps/server/test/corpus-comparison.test.ts`, `pnpm exec tsc -p apps/server/tsconfig.json --noEmit`, `pnpm --filter @linkedin-mcp/server build`. Hand pure module/test to independent source reviewer before MCP integration.

### Task 3: Strict typed read-only MCP operation (exclusive MCP owner)

**Files:**

- Modify: `apps/server/src/research-mcp.ts` only
- Create: `apps/server/test/mcp-corpus-comparison-contract.test.ts`
- Read only: `apps/server/src/create-server.ts`, `apps/server/test/mcp-theme-grouping-contract.test.ts`, `apps/server/test/mcp-reference-register-contract.test.ts`

**Interfaces:**

- Consumes `compareResearchCohorts(input:unknown):Readonly<LocalCohortComparison>` from Tasks 1–2 and hardened `reply(deps,status,data?,code?)` from existing M10 MCP.
- Produces separate `linkedin.research.compare_cohorts` with exact typed strict root `{topic,focusTerms,sources,cohorts,unmatchedSourceIds}`, nested strict cohorts, source schema shared unchanged, typed output `local_caller_defined_corpus_comparison`, fixed nonretryable failure codes and bounded LOCAL_ONLY dual-copy result.

- [ ] **Step 1 — Add real Client missing-tool RED:** import new isolated MCP contract and use real `Client` + `StreamableHTTPClientTransport` + `createMcpHandler`, not a mock function. Assert `listTools` missing `linkedin.research.compare_cohorts` before registration, and existing analyze/themes/references remain and `linkedin.research.topic` absent. Run `pnpm exec vitest run apps/server/test/mcp-corpus-comparison-contract.test.ts --reporter verbose`; record genuine missing-tool RED (not environment failure).
- [ ] **Step 2 — Add comprehensive typed success RED:** call Task 1 fixture; assert strict `additionalProperties:false` root/nested schemas, data kind, exactly two cohorts, canonical member/source order, distinct per-cohort term observation states with UTF-16 quote positions, caller-only `publicationDate`, `LOCAL_ONLY` provider, bounded host-generated timestamp and `content[0].text === JSON.stringify(structuredContent)`. Assert all six fixed warning enums and immutable pure semantics, with no fake market difference.
- [ ] **Step 3 — Add SDK/exceptions hostile RED:** caller unknown **root/cohort/source key name** `private-CANARY-SECRET-KEY` and secret **value** never echoed anywhere in rejected SDK response; root/provider/trust/date controls, invalid signed URL/query and malformed cohort membership yield only `isError:true` with sanitized fixed code/message (SDK pre-handler errors may be MCP-standard but must never leak keys/values). Test injected `createRequestId:()=> 'R'.repeat(270_000)` on both successes and failures, requestId length ≤128, complete dual-copy bytes ≤262,144.
- [ ] **Step 4 — Minimum MCP GREEN:** add strict Zod v4 `strictObject` with **custom fixed unknown-field error** at root/cohorts/source; reuse existing source/evidence/date schemas and `reply()`; output schema distinct with correct max2 cohorts, max12 terms per cohort, max20 source IDs, ≤20 source summaries, strict discriminants/provenance/metadata. Catch `ResearchOutputTooLargeError` → `analysis_too_large`, other caller failures → `invalid_input`, schema mismatch → `invalid_output`; output oversized fallback `output_too_large`; never expose caller error text.
- [ ] **Step 5 — Verify focused GREEN:** `pnpm exec vitest run apps/server/test/mcp-corpus-comparison-contract.test.ts apps/server/test/mcp-research-contract.test.ts apps/server/test/mcp-theme-grouping-contract.test.ts apps/server/test/mcp-reference-register-contract.test.ts --reporter verbose`, followed by Prettier/ESLint/TypeScript build for owned files. Explicitly check no existing tool contract changed or private store wired.

### Task 4: Truthful capability and actual built STDIO/HTTP contract (exclusive integration owner)

**Files:**

- Modify: `packages/core/src/capabilities.ts`
- Test/modify: `packages/core/test/capabilities.test.ts`, `apps/server/test/foundation.test.ts`, `apps/server/test/mcp-contract.test.ts`
- Modify/test: `tests/contract/stdio-smoke.test.ts` and `tests/contract/http-smoke.test.ts`
- Preserve: `apps/server/src/http.ts` HTTP 256KiB body guard and ≤128 UTF-8 JSON-RPC ID, and existing private-store isolation.

**Interfaces:**

- Consumes fully registered `linkedin.research.compare_cohorts` and typed `LocalCohortComparison`.
- Produces capability ID `research.compare_cohorts` with `provider:'LOCAL_ONLY'`, `status:'ACTIVE'` and `availability:'AVAILABLE'` only with tool present, exact `milestone:'M10'` and truthful evidence/access text; no automatic `VERIFIED` without feature/main CI.

- [ ] **Step 1 — Genuine capability inventory RED:** assert one new capability descriptor and only one new tool in existing exact inventories, `research.topic` unchanged EXTERNAL_DISCOVERY/UNAVAILABLE and no `linkedin.research.topic` registration/native article publication. Run `pnpm exec vitest run packages/core/test/capabilities.test.ts apps/server/test/foundation.test.ts apps/server/test/mcp-contract.test.ts --reporter verbose` and record expected missing-descriptor/inventory RED before modifying registry. If MCP tool already exists, assert the actual missing capability condition instead of faking missing tool.
- [ ] **Step 2 — Minimal capability GREEN:** append only `research.compare_cohorts` and update explicit expected inventories. Rerun tests and guard original capability ordering and statuses.
- [ ] **Step 3 — Built transport RED:** extend both `tests/contract/stdio-smoke.test.ts` and `tests/contract/http-smoke.test.ts` with an exact two-cohort fixture, explicit `unmatchedSourceIds`, typed source spans, fail-closed invalid overlapping membership, no provider/workflow side effects. **Run on freshly rebuilt dist**, not stale JS. If tool already works, first create an independently meaningful failing wire assertion rather than label a green test RED.
- [ ] **Step 4 — Live raw SSE and boundary checks:** POST JSON-RPC `tools/call` through **actual loopback HTTP** with up to 20 sources and ~200KiB corpus, include one source containing unmatched-only term, verify complete SSE frame bytes ≤262,144 (not only parsed `structuredContent`), exact reply ID, no full-body canary, no partial success. Exercise invalid nested metadata, encoded credential query and 270k host request IDs; existing loopback HTTP rejects oversized caller JSON-RPC ID. Verify injected STDIO private article/job stores remain unchanged/unread; HTTP private tools inaccessible even with host-provided store.
- [ ] **Step 5 — Built GREEN:** run `pnpm --filter @linkedin-mcp/server build`, then `pnpm exec vitest run tests/contract/stdio-smoke.test.ts tests/contract/http-smoke.test.ts apps/server/test/mcp-corpus-comparison-contract.test.ts --reporter verbose`, plus existing core/MCP/capability regression tests. Record real Node24 process/SSE evidence and actual sizes, not assertions based only on an in-memory adapter.

### Task 5: Disjoint independent security reviews, full gates, exact-SHA release (prime owned)

**Files only after verified evidence:** `docs/milestones/M10-content-intelligence.md`, `docs/milestones/CURRENT.md`, `docs/milestones/README.md`, `docs/product/CAPABILITY-MATRIX.md`, `docs/requirements/TRACEABILITY.md`, `docs/progress/project-state.json`, `docs/progress/STATUS.md` and `docs/progress/KNOWN-ISSUES.md`. No plan writer changes them.

**Interfaces:** consumes Tasks 1–4 real RED/GREEN results and current GitHub/CI facts, yields truthfully scoped M10.3 status; does **not** mark all M10 research or M09 native publishing complete.

- [ ] **Step 1 — Independent READ-ONLY reviewers:** reviewer A audits pure parser/cohort assignment, M10 analyzer proof and Unicode aliases, source trust and max bytes; reviewer B audits MCP SDK validation keys/values, typed output, dual-copy/full SSE response, 270k IDs and STDIO/HTTP/private stores. Reviewers must not own the code they audit; report exact Critical/Important reproductions.
- [ ] **Step 2 — Fix blockers via genuine RED→GREEN and re-review:** only assigned owner edits source/test, then both scopes reach **Critical=0 Important=0**. No weakening assertions, fabricated reports or undeclared scope changes.
- [ ] **Step 3 — Full fresh Node24 gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `git diff --check` and real built STDIO+HTTP/full raw SSE replay on final source. If Node/pnpm environment is broken, fix environment and report it distinctly from feature RED.
- [ ] **Step 4 — Durable status:** only on local evidence update M10.3 implementation/test status without premature `VERIFIED`. Preserve M10.0/M10.1/M10.2 previously verified main and `research.topic` external/unavailable; record the single next action and local source/build artifacts as appropriate.
- [ ] **Step 5 — Remote safe PR/CI and verified merged main:** prime follows repo `GITHUB_WRITE_MODE=CONNECTOR_FIRST`, refreshes exact remote refs/reviews/CI before write, commits approved owned tree through allowed surface, creates one focused PR, validates **exact feature-head** required CI, resolves blocking review threads, squash-merges only through gates, then confirms exact **post-merge main SHA** and main CI SUCCESS before saying M10.3 `VERIFIED`. No forced push/approval bypass/claim before evidence.

## Plan self-review and next engineering act

- **Spec-to-plan trace:** strict two nonempty disjoint cohorts and required explicit unmatched partition (Task 1), Unicode matcher/locale equivalence and exact original-source UTF-16 observations (Tasks 1–2), single M10.0 normalizer/analyzer with 200KiB and separate pure 96KiB caps (Task 2), new strict typed LOCAL_ONLY MCP with 256KiB complete response (Task 3), capability inventory and raw built STDIO/HTTP SSE (Task 4), skeptical dual review, full Node24 gates and exact remote feature/merged-main CI (Task 5).
- **No accidental broader inference:** all outputs use only caller source IDs and matched snippets; no validated sources, network retrieval, percentage, empirical comparison, confidence, content gap, trend, competitor rank, popularity or generated recommendation. A singleton cohort still returns `status:'available'` (operation complete) with explicit warning, not statistical sufficiency.
- **Naming pinned:** `compareResearchCohorts` in `corpus-comparison.ts`, type `LocalCohortComparison`, `data.kind:'local_caller_defined_corpus_comparison'`, `linkedin.research.compare_cohorts` tool, `research.compare_cohorts` capability, new tests `corpus-comparison.test.ts` and `mcp-corpus-comparison-contract.test.ts`.
- **Ownership:** current docs worker edits **exactly the two M10.3 design/plan docs only** and stages/commits/pushes nothing. Only subsequent explicitly assigned implementation workers touch code/tests/status; no shared-file races. This plan is not evidence that RED/GREEN, code, CI or PR already exists.

**Single next action for prime:** assign the Task 1 pure owner to create `apps/server/test/corpus-comparison.test.ts` first, run a genuine missing-module RED against `feat/m10-local-corpus-comparison`, then implement only the pure module/test with hostile partition checks.

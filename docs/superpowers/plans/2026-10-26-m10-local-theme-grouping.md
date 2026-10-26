# M10.1 Caller-Defined Local Theme Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group only literal evidence from caller-supplied unverified research excerpts under 1–4 caller-named themes, without inventing themes, sourcing content or claiming a market/competitor gap.

**Architecture:** A small pure wrapper validates strict caller-authored theme metadata, composes at most 12 `focusTerms`, and reuses M10.0 `analyzeResearchCorpus` (which calls `normalizeResearchCorpus`) for canonical sources and exact UTF-16 evidence. A distinct typed `linkedin.research.group_themes` MCP tool exposes bounded `LOCAL_ONLY` output through the existing server registration, STDIO and HTTP. No provider, storage, LLM or publishing path changes.

**Tech Stack:** Node.js 24, TypeScript 5, existing `packages/core` + `apps/server` monorepo, Zod v4, MCP SDK, Vitest, Prettier/ESLint, existing build and real transport tests.

**Spec:** `docs/superpowers/specs/2026-10-26-m10-local-theme-grouping-design.md`

## Baseline, ownership and immutable constraints

- Base the isolated `feat/m10-local-theme-grouping` worktree on the **actual merged** M10.0 `main` SHA `865fd9fb4cd5ccd8438ef7a89f9bc08f3fb600df`, PR #16, post-merge CI `40293411451` SUCCESS (owner-provided; recheck exact remote head/CI before feature writes). M10.1 is **not yet implemented, tested, PR-verified or merged**.
- Proposed subrequirement `R-M10-THEME-GROUPS` is separate from M10.0 `R-M10-RESEARCH`. Never mark M10.1 or the overall M10 milestone VERIFIED based on M10.0 CI.
- MCP input is **exactly** `{topic,themes:[{id,label,phrases}],sources:[{id,title,url,body,publishedAt?}]}`; reject any caller `focusTerms`, provider or trust override. Themes: 1–4; phrases 1–3 per theme, ≤12 globally, all case-insensitively unique across groups. IDs 1–80 safe ASCII and unique ignoring case; labels/phrases 1–80 single-line UTF-16 units, trimmed, Unicode-valid and free of forbidden controls. `topic` 1–200. A phrase equal to `topic` is supported and mapped to the existing topic evidence.
- Reuse `normalizeResearchCorpus` (via `analyzeResearchCorpus`), keeping existing 1–20 source and ≤200 KiB normalized-corpus JSON caps, M10.0 URL/secret/date validation and source `body` verbatim. No double-parsing with weakened alternate rules; no getter/proxy/sparse access before validation.
- Only caller-authored labels and phrases; `sourceTrust:'caller_supplied_unverified'`, `verification:'not_performed'`, `themeOrigin:'caller_defined'`. Exact first whole-word literal match per source and phrase: `quote === originalBody.slice(start,end)` with UTF-16 offsets and end-exclusive length ≤160. Source IDs deduplicated within a theme and ordered by input; **cross-theme overlap is allowed** if different phrases match.
- Missing phrase/source means `not_observed_in_supplied_corpus` relative to these inputs; **never** assert a competitor/market gap, trend, source accuracy, date verification, ranking or generated theme. One source yields successful `insufficient_evidence`.
- Enforce ≤96 KiB pure grouped JSON and M10.0 reused analyzer guard; ≤256 KiB complete MCP result (text + structured + wrapper) and real HTTP SSE. All overflow/error paths fail sanitized, not partial success; bounded host request metadata; no body/URL/secret echo.
- No provider, network/DNS, browser, file/private store, OAuth, model/embedding, linked account, article publication or write side effects. `research.topic` remains `EXTERNAL_DISCOVERY`, `PLANNED`/`UNAVAILABLE`; `linkedin.research.topic` remains absent. M09 native publication remains BLOCKED.
- **Concurrency:** Pure-analysis owner exclusively owns Task 1–2 files; MCP owner Task 3; transport/capability owner Task 4; prime owns Task 5 durable docs/Git/PR/CI. Coordinate sequential touching of shared files (especially `research-mcp.ts`). Current docs author owns **only** the two Superpowers docs and performs **no** source/test edits, staging, commits, branches or pushes.

## Review Focus — high-risk tests, not optional

1. **Adversarial wrapper:** getter/proxy/custom prototype/sparse theme arrays, unknown secret-bearing keys, malformed surrogate and duplicate case-folded names/phrases must fail closed before side effects and without echo (Task 1 and Task 3).
2. **Topic-equal phrase and label-not-evidence:** `topic='Agentic systems'` with a theme phrase `'Agentic systems'` must map to M10.0 topic evidence once; a theme label appearing in body alone must never match (Task 2).
3. **Unicode and overlapping themes:** astral emoji before matches, multiline spacing, whole-word boundaries, repeated matches, distinct phrases matching one source in two themes, absent phrases and sources must preserve original UTF-16 quotes and stable order (Task 2).
4. **Oversize data without partial-success laundering:** 200 KiB corpus, 96 KiB reused/grouped pure analysis, 256 KiB dual-copy MCP/complete real HTTP SSE including errors; no fabricated successful truncated groups or leaked body (Tasks 2–4).
5. **Truthful provider and store isolation:** `LOCAL_ONLY` results despite hostile "official trend" prose, no `research.topic` tool, no verified timestamps, no private article/job-store reads and no M10.0 regression across built STDIO/HTTP (Tasks 3–4).

---

### Task 1: Strict theme wrapper parser and pure API

**Files:**

- Create: `apps/server/src/research/theme-grouping.ts`
- Create: `apps/server/test/theme-grouping.test.ts`
- Reuse unchanged: `packages/core/src/content-research.ts` and `apps/server/src/research/content-analysis.ts` where feasible.

**Interfaces:**

- Consumes: `groupResearchThemes(input:unknown)` receives `ThemeGroupingInput` from the spec; use guarded own-data descriptors on root/themes/phrases, then call `analyzeResearchCorpus({topic,focusTerms:orderedUniqueThemePhrases,sources})` once.
- Produces: exported `groupResearchThemes(input:unknown):Readonly<ThemeGroupingAnalysis>` with the spec's `kind/status/themeOrigin/sourceTrust/verification/topic/sourceSummaries/themeGroups/unmatchedSourceIds/warnings` and only sanitized deterministic errors.

- [ ] **Step 1: Add genuine failing tests** for an input with two sources, theme `{id:'workflow',label:'Workflow',phrases:['Agentic systems','RAG']}` and `{id:'data',label:'Data',phrases:['SQL']}`. Import `groupResearchThemes` from `../src/research/theme-grouping.js`; assert expected root `kind:'local_caller_defined_theme_grouping'`, `themeOrigin:'caller_defined'`, unverified trust, stable theme order and literal source membership. Before implementation this should RED due to a missing module/export. **If another worker has already created the file, recover their real recorded RED or write a new unmet behavioral assertion; never fabricate missing-module history.**
- [ ] **Step 2: Run RED**: `pnpm exec vitest run apps/server/test/theme-grouping.test.ts --reporter verbose` on Node24; capture the **actual** missing export/module failure. A broken package manager, wrong Node, missing built core or test config is an environment failure, **not** valid RED; fix the environment first.
- [ ] **Step 3: Add strict-input negative and limit tests** before implementing parser: 0 or 5 themes, 0 or 4 phrases/theme, >12 phrases, duplicated `id`/`label`/`phrase` across themes with case changes, extra `provider/verified/focusTerms/token` fields, multiline labels, malformed `\ud800`, control characters, secret-looking unknown property keys, no sources, duplicate source IDs, invalid URL query `?%2563ode=canary`. Also inject non-invoked getter, Proxy, sparse/extra-property arrays and own symbols at root/theme/phrases, assert no getter runs, no canary in error. Test positive exact limits 4 themes ×3 distinct phrases with 20 valid sources and valid benign `?languageCode=en&discount_code=public`.
- [ ] **Step 4: Implement minimal strict parser** in `theme-grouping.ts`: validate root/themes using M10.0 own-descriptor/plain-proxy-safe patterns and scalar validity; ensure label and phrase uniqueness by a deterministic case-fold key; flatten phrase list in theme order, call existing analyzer exactly once on a fresh object, without touching raw source-body fields before its parser. Keep theme text for display only; do not reimplement text evidence or network behavior.
- [ ] **Step 5: Run GREEN** for focused tests with the Step 2 command. Confirm only safe canonical input reaches the analyzer; source-normalization failures are sanitized and not mapped to `analysis_too_large`. Run `pnpm exec prettier --check apps/server/src/research/theme-grouping.ts apps/server/test/theme-grouping.test.ts`.

### Task 2: Evidence projection, overlap and independent grouped-output bounds

**Files:**

- Modify: `apps/server/src/research/theme-grouping.ts` (same pure owner as Task 1).
- Test: `apps/server/test/theme-grouping.test.ts`.

**Interfaces:**

- Consumes: immutable M10.0 `ResearchAnalysis` with `termCoverage`, `sourceSummaries`, `warnings`, `status`; canonicalized theme metadata from Task 1.
- Produces: deep-frozen `ThemeGroupingAnalysis`, phrase evidence copied from matching M10.0 term only, theme `sourceIds` source-ordered union, global `unmatchedSourceIds`, grouped pure JSON ≤98,304 bytes.

- [ ] **Step 1: Add failing evidence tests** with `body='🤖 Agentic systems use RAG and SQL.'`: exact topic-equal phrase evidence `{sourceId:'a',start:3,end:18,quote:'Agentic systems',offsetUnit:'utf16',endExclusive:true}`; `RAG` also maps to `workflow`, `SQL` maps to `data`, and source `a` belongs to both themes; `sourceIds` still includes `a` once per theme. A label-only "finance" in source without its distinct phrase must **not** count. Include a third source with no theme phrase and assert `unmatchedSourceIds` contains only that source. Do not count unmatched `topic` unless it is a caller-declared theme phrase.
- [ ] **Step 2: Run RED** on the focused suite, ensuring the failure is an incorrect projection/ordering, not unsupported test setup.
- [ ] **Step 3: Add adversarial semantic tests**: case-insensitive whole-word hit vs substrings; emoji/combining/ZWJ and tabs/newlines before/mid phrase; repeated same phrase in one body still one first span; distinct phrase hits in one source deduplicate `sourceIds`; phrase absent => `not_observed_in_supplied_corpus` and empty evidence; duplicate identical source bodies do not imply two independent corroborations; one-source `insufficient_evidence`; publication timestamps remain `caller_reported`; output is deterministic/deeply frozen and does not contain body, `trend`, `competitorGap`, `confidence` or market score.
- [ ] **Step 4: Implement projection**: index the existing `termCoverage` by the same bounded case-fold identity as the validated phrases, including topic-first suppression. Verify each phrase has a unique analyzer record; fail closed if missing. Derive theme source membership by scanning original `sourceSummaries` order; derive global unmatched set. Retain analyzer warning order and append only `themes_caller_defined_only`. Deep freeze all new arrays/objects. Never construct quote text or infer theme membership from label text.
- [ ] **Step 5: Add genuine oversized pure tests** using valid 20× long but bounded source URL/title records and 12 matched phrases, demonstrate the reused analyzer's `ResearchOutputTooLargeError` and a valid fixture where the grouped result itself exceeds 98,304 bytes if feasible. Both must return sanitized size errors with no dropped evidence and **no** success. Test large near-200KiB input, boundary cases and no uncontrolled regex/CPU growth. If projection-specific overflow cannot be reached under M10.0's tighter upstream bound, cover the new serializer guard by an isolated pure test seam without exposing a public bypass; do not claim an unexecuted boundary test.
- [ ] **Step 6: Verify GREEN** with `pnpm exec vitest run apps/server/test/theme-grouping.test.ts apps/server/test/content-analysis.test.ts packages/core/test/content-research.test.ts --reporter verbose`. Confirm M10.0 exact UTF-16 and canonicalization tests remain GREEN.

### Task 3: New typed MCP tool with shared safety envelope

**Files:**

- Modify: `apps/server/src/research-mcp.ts` (existing `registerResearchTools`).
- Create: `apps/server/test/mcp-theme-grouping-contract.test.ts` (or add an isolated describe block in existing M10 MCP suite, owned by the same MCP worker).
- Observe: `apps/server/src/create-server.ts` already calls `registerResearchTools`; change only if a proven registration defect demands it.

**Interfaces:**

- Consumes: `groupResearchThemes` pure function; `ThemeGroupingInput` and result shape from spec; existing host `createRequestId` and `now` dependencies.
- Produces: distinct `linkedin.research.group_themes` MCP tool with strict input/output Zod v4 schema; `provider:{type:'LOCAL_ONLY',name:'linkedin-mcp'}`; duplicated text/structured fidelity; `invalid_input|analysis_too_large|output_too_large|invalid_output` fixed sanitized failures; complete MCP tool response ≤262,144 UTF-8 bytes with wrapper allowance.

- [ ] **Step 1: Write missing-tool RED**: under a real `Client` + `StreamableHTTPClientTransport` (as in `mcp-research-contract.test.ts`), `listTools` lacks `linkedin.research.group_themes` and `callTool` does not return a typed grouped result. Record real behavioral RED; keep `linkedin.research.topic` absent.
- [ ] **Step 2: Add contract failures**: strict JSON schemas reject unknown fields/signed URLs/forged trusted provenance with no secret-bearing Zod echo; success has `sourceTrust`, `themeOrigin`, ordered exact spans and text equal to `JSON.stringify(structuredContent)`; one source is an MCP success with `data.status:'insufficient_evidence'`; invalid/sparse inputs fail sanitized; huge valid pure report maps to `analysis_too_large`, no bodies; injected `createRequestId:()=> 'R'.repeat(270_000)` cannot escape metadata cap. Verify text+structured/wrapper bytes ≤262,144 and output validation doesn't fail on canonical percent-encoded URL expansion.
- [ ] **Step 3: Implement minimal MCP registration** in `registerResearchTools` with separate strict schemas, reusing existing response-budget/error helper and bounded metadata instead of copying a weaker serializer. Preserve `linkedin.research.analyze` unchanged, `research.topic` unavailable and no fetch/private store/provider dependencies.
- [ ] **Step 4: Verify GREEN**: `pnpm exec vitest run apps/server/test/mcp-theme-grouping-contract.test.ts apps/server/test/mcp-research-contract.test.ts --reporter verbose`. Assert the exact new tool name, failures use `isError:true`, and unexpected secret-bearing property **names and values** never appear in errors or JSON-RPC content.

### Task 4: Capability truth and actual built transport verification

**Files:**

- Modify: `packages/core/src/capabilities.ts`.
- Test/modify: `packages/core/test/capabilities.test.ts`, `apps/server/test/foundation.test.ts`, `apps/server/test/mcp-contract.test.ts` as necessary for one new tool/capability.
- Modify/test: `tests/contract/stdio-smoke.test.ts`, `tests/contract/http-smoke.test.ts`.
- Preserve: `research.topic` external discovery unavailable, `article.native.publish` blocked; no provider wiring or runtime store changes.

**Interfaces:**

- Consumes: Task 3 registered tool and Task 2 strict pure result, existing M10 transport entrypoints.
- Produces: truthful `research.group_themes` descriptor (`LOCAL_ONLY`, implemented `ACTIVE`, availability `AVAILABLE` **only** when tool registration is real) and real STDIO/HTTP evidence for that exact tool.

- [ ] **Step 1: Write focused RED** for capabilities and built transport `listTools/callTool('linkedin.research.group_themes',sample)`; assert one new tool and no existing tool removal; descriptor accurately says caller-defined unverified local evidence, not verified trends. Built-smoke RED must be due to missing feature, not stale unbuilt `dist` files. Include tests that `linkedin.research.topic` still does not exist.
- [ ] **Step 2: Implement descriptor and minimum test integration** in assigned files; preserve old capability states and update exact-tool-count expectations instead of dropping assertions. M10.1 must not read injected STDIO article/job stores through HTTP and must not emit any outbound provider call.
- [ ] **Step 3: Add adversarial **actual built** transports**: input `'🤖 Agentic systems use RAG and SQL.'` proves span `[3,18)` and theme overlap under STDIO and HTTP; source bodies and hostile caller instructions remain inert. For real loopback HTTP, send a raw JSON-RPC POST with a valid bounded ID and large **valid** corpus, capture **entire** SSE bytes (including `event:` and `data:` framing), require `200` and ≤262,144 bytes for success, exact dual-copy JSON and zero full-body echo; overflow route must be bounded and sanitized, not a false success. Include a single-source insufficient-evidence call and strict invalid-input error. Test exact tool inventory.
- [ ] **Step 4: Build and verify GREEN**: Node24 `pnpm --filter @linkedin-mcp/core build && pnpm --filter @linkedin-mcp/server build && pnpm exec vitest run tests/contract/stdio-smoke.test.ts tests/contract/http-smoke.test.ts packages/core/test/capabilities.test.ts apps/server/test/foundation.test.ts apps/server/test/mcp-contract.test.ts --reporter verbose`. If shell/Corepack pnpm is unavailable, invoke existing Node24-compatible tools directly after validating the built artifacts; do not mislabel the tooling failure as a test RED.
- [ ] **Step 5: Run complete gates** on the exact local tree: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `git diff --check`. Record real counts, SHA and outcomes; fix all regressions before independent review.

### Task 5: Independent review, durable requirements, and CI closeout (prime-owned)

**Files (not owned by this design/plan author):**

- Update **only after evidence**: `docs/milestones/M10-content-intelligence.md`, `docs/milestones/CURRENT.md`, `docs/milestones/README.md`, `docs/product/CAPABILITY-MATRIX.md`, `docs/requirements/TRACEABILITY.md`, `docs/progress/STATUS.md`, `docs/progress/KNOWN-ISSUES.md`, `docs/progress/project-state.json`.
- Leave `docs/product/PRD.md` intent intact unless a proven product requirement change is necessary.

**Interfaces:**

- Consumes: actual M10.1 implemented/tested code, independent reviewer reports, Git/PR/ref/CI outcomes. The proposed `R-M10-THEME-GROUPS` row is **PLANNED** until evidence supports transition; existing M10.0 achievement remains distinct.
- Produces: accurate traceability and exactly one next action, with no provider or whole-M10 completion fabrication.

- [ ] **Step 1: Assign independent READ-ONLY review scopes** (pure parser/provenance/UTF-16 and MCP/transport/output-budget), separate from their implementation owners. Audit fail-closed hostile inputs, case collisions, source-body quote identity, unauthorized provider paths, hidden stores and true complete-wire cap. Report exact reproducible Critical/Important findings.
- [ ] **Step 2: Repair any Critical/Important finding with reproducible genuine RED→GREEN regressions** in the owning code/tests; rerun focused and full Node24 gates. Independent reviewers re-review changed files; do not mark signoff while important items remain.
- [ ] **Step 3: Reconcile durable docs** using _observed_ results: record `R-M10-THEME-GROUPS` separately from M10.0; `research.group_themes` is only `LOCAL_ONLY`, caller-defined, never discovered. Keep `research.topic` `EXTERNAL_DISCOVERY`/`UNAVAILABLE`, actual native publication blocked, and broader provider-backed M10 trend/competitor/market-gap work unfinished. Use supported status values (`PLANNED|ACTIVE|BLOCKED|VERIFIED|DEFERRED|REJECTED`) for traceability rows.
- [ ] **Step 4: Prime owns connector-first durable Git and PR flow** after reviewer/gates pass: stage/commit only reviewed scope in authorized execution, verify branch exact final SHA and remote head/threads, submit M10.1 PR, require exact-feature-head CI success and squash merge through normal gates; then verify exact post-merge main push CI. The separate M10.1 subrequirement may be `VERIFIED` only after these steps, while broader M10 is still incomplete.

## Pre-execution cross-check and explicit handoff

Task 1 covers strict theme shape and M10.0 corpus adapter; Task 2 covers matching semantics, source ordering, deep freeze and independent pure byte cap; Task 3 covers typed MCP, sanitized failures and duplicated response size; Task 4 covers truthful capabilities, built transports and actual full SSE; Task 5 covers independent review, durable traceability, exact-head/merged-main verification. All five Review Focus risks map to concrete tests in their owner task. No task authorizes guessing source facts, automatic theme mining, inferred content gaps, opening links, untrusted private project reads or registration of `linkedin.research.topic`.

**This is a proposed execution plan, not evidence of execution.** The document author was assigned **only** this plan and `docs/superpowers/specs/2026-10-26-m10-local-theme-grouping-design.md`; writing these documents does **not** authorize that author to edit code, tests, other docs, the Git index, a commit or a remote branch. Subsequent worker roles and prime own implementation, verification and durable changes.

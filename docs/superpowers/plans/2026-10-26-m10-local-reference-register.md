# M10.2 Stateless Local Reference Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Index 1–20 unverified caller-supplied research references into deterministic canonical-URL repeat groups and source-ID summaries, without storage, network access, source attestation or inferred claims.

**Architecture:** A pure server module strictly validates the public `{sources}` wrapper, then calls merged `normalizeResearchCorpus` exactly once using a fixed internal topic and projects only source summaries and exact canonical-URL groupings. Register an independent typed `linkedin.research.index_references` via the existing research MCP path; preserve dual-copy budgets, LOCAL_ONLY capability truth and live STDIO/HTTP behavior. No new provider, parser, storage or transport code.

**Tech Stack:** Node.js 24, TypeScript 5, existing `packages/core` and `apps/server`, Zod v4, MCP SDK, Vitest, Prettier/ESLint, monorepo build/test scripts.

**Spec:** `docs/superpowers/specs/2026-10-26-m10-local-reference-register-design.md`

## Global Constraints

- Isolated pre-created worktree `/linkedin-mcp/.worktrees/m10-local-reference-register` on `feat/m10-local-reference-register` at baseline `main` `2899847a79dec7dd08714d8e2a3fb3e720c6c42e`. Inspect Git and read repository instructions again before _implementation_; do not infer remote feature or main CI from this planned document.
- Public input **exactly** `{sources:[{id,title,url,body,publishedAt?}]}`. One to 20 sources, **no topic field**, no theme/focus/provider/verification override. Internally invoke `normalizeResearchCorpus({topic:'Reference register',sources})` once; no `analyzeResearchCorpus`/`groupResearchThemes` use.
- M10.0 strict core invariants: plain own-data dense structures, no Proxy/getter/extra/symbol keys; ID ASCII max80 case-sensitive unique; title max240; HTTPS inert canonical URL max2048 raw/canonical; verbatim body max50,000 UTF-16 units; reported real canonical UTC date only; normalized corpus serialized UTF-8 ≤ **204,800** bytes. Never weaken core source parsing to fit M10.2. **Known residual risk:** a token-looking **value** under innocuous `?ref=` can survive M10.0 query-_name_ screening and be deliberately echoed in accepted URL display fields. Do not promise universal secret detection or add an unreviewed second validator; warn users to submit only public URLs.
- Pure result: `kind:'local_reference_register'`, `status:'available'` even for one valid reference, `referenceOrigin:'caller_supplied'`, `sourceTrust:'caller_supplied_unverified'`, `verification:'not_performed'`; source-ordered `sourceSummaries`, repeat-only `repeatedUrlGroups`, source-ordered `singleUrlSourceIds` and fixed warnings. Group by exact **normalized URL string**, never by body, title, host, redirect or fuzzy comparison.
- Pure `JSON.stringify` output ≤ **98,304** UTF-8 bytes (96KiB), deeply frozen, stable and **no raw body snippets**. Reuse `ResearchOutputTooLargeError` when cap exceeded.
- New read-only MCP tool `linkedin.research.index_references`, distinct LOCAL_ONLY capability `research.references.index`. Reuse `registerResearchTools` and bounded `reply()`; max combined duplicated response plus wrapper 262,144 bytes (256KiB) and actual HTTP SSE max262,144 bytes. Fixed sanitized `invalid_input|analysis_too_large|output_too_large|invalid_output`; MCP `isError:true` on failure.
- No fetch/network/DNS/redirect/browser/LLM/storage/secret/private article/job store/approval/publication; no claim of verified sources, independent corroboration, link health, source identity, market trends, competitors or content gaps. Existing `research.topic` remains `EXTERNAL_DISCOVERY`/`UNAVAILABLE`; native long-form publishing stays blocked.
- **Ownership is exclusive and sequential.** Prime allocates code owners: Task 1 pure module/test, Task 2 MCP module/test, Task 3 capability/inventory/tests, Task 4 actual transport tests, Task 5 independent reviewers and durable docs/Git/CI. Never concurrently edit `research-mcp.ts`/MCP contract or the same built transport test. This document's author may edit **only the two M10.2 spec/plan docs** and may not stage/commit/push, create a branch or edit code/tests/status.
- All TDD **RED and GREEN must actually be observed** on the intended behavior (not broken Node, pnpm, stale dist, typed import or missing package). Do not pre-mark checkboxes, fabricate test counts, CI or approvals. Run Node24; use the repository's real pnpm launcher and rebuild before built smoke tests.

## Review Focus — adversarial acceptance matrix

1. **Hostile property descriptors:** root/source Proxy, throwing getter, inherited/symbol/non-enumerable keys, sparse sources or extra array properties → deterministic `invalid_input`, **zero** getter invocations and no caller strings in error. Covered by Task 1 unit and Task 2 SDK tests.
2. **Canonical same-URL ≠ same content/source:** uppercase-host/default path canonical equivalents group; different query order/path do not; same body on different URLs remains distinct; same URL with conflicting bodies/dates still groups by URL only, without corroboration. Covered by Task 1 plus Task 4 real transport.
3. **URL credential and normalization risks:** nested percent-encoded `code`/`accessCode`/`ticket`/`AWSAccessKeyId`, hidden C1/control, credentials/userinfo, private host, fragment, raw-acceptable URL growing >2048 on canonicalization → sanitized rejection; innocuous `languageCode` remains allowed. A token-looking value under `?ref=` may still be echoed; treat as a **documented residual boundary**, not proof of no secret risk. Task 1 and Task 2.
4. **Size/serialization hazards:** four 49K body records near 200KiB, escaped JSON larger than raw text, maximal titles/URLs, 96KiB pure output, duplicated text+structured response and **actual HTTP SSE** ≤256KiB; 270k host-supplied request ID and bounded error fallback. Task 1, Task 2, Task 4.
5. **Provenance and private-data isolation:** caller `provider`/`verified`/`retrievedAt` and prompt-injection bodies, arbitrary publisher claims and reported dates must never become attested provider, verification, network calls, file reads or native publish; no body echo even for repeated URLs. Task 1, Task 2, Task 3 and Task 4.

---

### Task 1: Pure strict reference indexing

**Files:**

- Create: `apps/server/src/research/reference-register.ts`
- Create: `apps/server/test/reference-register.test.ts`
- Observe only: `packages/core/src/content-research.ts`, `packages/core/src/index.ts`, `apps/server/src/research/content-analysis.ts`

**Interfaces:**

- Consumes `normalizeResearchCorpus(input:unknown)` from built private core; fixed internal topic `'Reference register'`.
- Exports `LocalReferenceRegisterInput` and `LocalReferenceRegister` types from spec, `indexResearchReferences(input:unknown): Readonly<LocalReferenceRegister>`, and imported/reused `ResearchOutputTooLargeError`. It does **not** mutate or return a normalized corpus, analyze prose or persist state.

- [ ] **Step 1 — Write minimal intended RED test** in `apps/server/test/reference-register.test.ts` using:

  ```ts
  const input = {
    sources: [
      {
        id: 'alpha',
        title: 'First',
        url: 'https://Research.Example.org/report',
        body: 'first caller excerpt',
        publishedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'beta',
        title: 'Second',
        url: 'https://research.example.org/report',
        body: 'DIFFERENT excerpt from caller',
      },
      { id: 'gamma', title: 'Third', url: 'https://research.example.org/other', body: 'unrelated' },
    ],
  };
  const register = indexResearchReferences(input);
  expect(register.kind).toBe('local_reference_register');
  expect(register.sourceSummaries.map((s) => s.id)).toEqual(['alpha', 'beta', 'gamma']);
  expect(register.repeatedUrlGroups).toEqual([
    { url: 'https://research.example.org/report', sourceIds: ['alpha', 'beta'] },
  ]);
  expect(register.singleUrlSourceIds).toEqual(['gamma']);
  expect(register.sourceTrust).toBe('caller_supplied_unverified');
  ```

  Assert caller-date `state:'reported'` and `sourceClaim:'caller_reported'` for `alpha`, `unknown` for `beta`, no `body` in output and no invented source facts. (This excerpt is the acceptance fixture, **not** an assertion it has already run.)

- [ ] **Step 2 — Verify genuine RED**: `pnpm exec vitest run apps/server/test/reference-register.test.ts --reporter verbose`. The missing `reference-register` module/export (or expected behavior mismatch) must be the actual reason, not Corepack/Node/module-build failure. Preserve observed failure output in implementation handoff.
- [ ] **Step 3 — Add unit RED matrix**: empty/21 sources; root unknown keys `topic`, `provider`, `verified`, source unknown fields `retrievedAt`, `sourceTrust`; root/source throwing getter (spy remains zero); Proxy; symbol/non-enumerable; Array(2) holes, extra array key, custom prototype; case-sensitive unique source IDs `Ref` vs `ref`; duplicate exact IDs fail; ID `constructor` accepted without prototype pollution. Assert no secret canary in thrown error; never spread hostile input in the test fixture creation.
- [ ] **Step 4 — Add URL RED matrix**: canonical-case grouping and default `/`; same body but differing URL → never grouped; same URL conflicting date/body → still grouped, no `duplicateBodies` assumption; query reordering remains separate; case/path/percent differences follow **only** returned `URL.href`; signed/encoded query aliases, private host/IP/userinfo/fragment, canonical Unicode URL growth >2,048 → fixed `source.url` failure. Include positive benign `?languageCode=en&discount_code=public` and one-source success. Explicitly record (without real credentials) whether fake `?ref=sk_live_FAKE_CANARY` is accepted/echoed under the inherited core policy; do not falsely promise arbitrary secret-value rejection or make a policy-changing “fix” without new reviewer authorization.
- [ ] **Step 5 — Add limits/provenance RED matrix**: canonical real/invalid UTC, lone surrogate, body of 50,001 chars, source corpus near 204,800 UTF-8 bytes succeeds and >204,800 rejects, JSON escape expansion, titles max240, 20-source maximum, caller instruction string never displayed, `JSON.stringify(result)` contains no original body/`retrievedAt`/`verified` flags; output bytes ≤98,304; results identical and deep-frozen across repeated calls. If valid inputs cannot push report >96KiB with fixed topology, assert the cap on maximum legal fixtures and implement explicit defensive throw rather than falsify a RED overflow demonstration.
- [ ] **Step 6 — Minimum GREEN implementation**: create `reference-register.ts` with safe root descriptor extraction (M10.1 `ownData` pattern, no getter or Proxy reads) and a fresh strict parser argument with fixed topic, call core once. Project source summaries only, build `Map<string,string[]>` by canonical `source.url`, retain only groups with ≥2 IDs and `singleUrlSourceIds` for unique URLs. Use source order and fixed warning enum `caller_sources_unverified`, `same_url_not_independent_confirmation`, optional `dates_caller_reported_only`. Deep-freeze all new structures; `JSON.stringify` byte check and named oversized error. No second URL validator, no hashing, no body echo.
- [ ] **Step 7 — Verify GREEN and refactor**: `pnpm exec vitest run apps/server/test/reference-register.test.ts packages/core/test/content-research.test.ts apps/server/test/content-analysis.test.ts apps/server/test/theme-grouping.test.ts --reporter verbose`; `pnpm exec prettier --check apps/server/src/research/reference-register.ts apps/server/test/reference-register.test.ts`; `pnpm exec eslint apps/server/src/research/reference-register.ts apps/server/test/reference-register.test.ts`; `pnpm --filter @linkedin-mcp/server build`. Record actual counts. Review with an independent pure/provenance reviewer before handing to MCP owner.

### Task 2: Separate typed MCP tool and sanitized dual-copy envelope

**Files:**

- Modify: `apps/server/src/research-mcp.ts` only for a new typed tool/schema (reuse existing registration)
- Create: `apps/server/test/mcp-reference-register-contract.test.ts`
- Observe only: `apps/server/src/create-server.ts`, `apps/server/test/mcp-research-contract.test.ts`, `apps/server/test/mcp-theme-grouping-contract.test.ts`

**Interfaces:**

- Consumes Task 1 `indexResearchReferences`; existing server `registerResearchTools(server,deps)`, bounded `reply(deps,status,data?,code?)` and host `now/createRequestId`.
- Produces new read-only tool `linkedin.research.index_references` with strict input `{sources}`, distinct typed `local_reference_register` data schema, `LOCAL_ONLY` envelope, fixed error taxonomy, without changing `linkedin.research.analyze` or `linkedin.research.group_themes` contracts.

- [ ] **Step 1 — Write missing-tool RED** using real `Client` + `StreamableHTTPClientTransport` + `createMcpHandler` as in `mcp-theme-grouping-contract.test.ts`. Assert `listTools` contains exactly one `linkedin.research.index_references` with strict input `additionalProperties:false` and typed output; existing analyze/grouping remain; `linkedin.research.topic` absent. Run `pnpm exec vitest run apps/server/test/mcp-reference-register-contract.test.ts --reporter verbose` and capture actual intended **tool missing** RED before registration.
- [ ] **Step 2 — Add success/structure RED**: call the Task 1 three-reference fixture. Assert `status:'succeeded'`, `provider:{type:'LOCAL_ONLY',name:'linkedin-mcp'}`, `data.kind:'local_reference_register'`, dates reported only, stable source IDs and canonical repeated group. Assert `result.content[0].text===JSON.stringify(result.structuredContent)` and entire serialized MCP reply byte bound ≤262,144. Verify single source succeeds with register `status:'available'`, without inventing independent corroboration.
- [ ] **Step 3 — Add security/failure RED**: SDK-rejected unexpected **property name** `private-SECRET-DO-NOT-LEAK` on root/source, `provider`/`verified`/`retrievedAt`, signed URL value secret, invalid canonical URL/Unicode/UTC; ensure rejected key/value/canary are absent from **entire** `JSON.stringify(result)`, including tool errors before callback. Valid shape but bad core values returns sanitized `invalid_input` and `isError:true`. Inject `createRequestId:()=> 'R'.repeat(270_000)` for successful and failed paths; emitted metadata ≤128 chars and entire reply ≤262,144.
- [ ] **Step 4 — Register minimal GREEN**: reuse existing nested `source` schema (Zod v4 `strictObject` with constant custom unknown-key errors), strict new root `{sources:z.array(source).min(1).max(20)}` with fixed error, strict output discriminants, typed publication dates, arrays capped (20 summaries, ≤10 groups, ≤20 IDs/group), and shared `reply()`. Map `ResearchOutputTooLargeError` → `analysis_too_large`, all other invalid caller input → `invalid_input`; failed output validation → `invalid_output`, whole dual-copy overflow → `output_too_large`. On any failure no data/body echo, no partial success. Do not create new transport or provider dependencies.
- [ ] **Step 5 — Verify MCP GREEN**: `pnpm exec vitest run apps/server/test/mcp-reference-register-contract.test.ts apps/server/test/mcp-research-contract.test.ts apps/server/test/mcp-theme-grouping-contract.test.ts apps/server/test/mcp-contract.test.ts --reporter verbose`; `pnpm exec prettier --check apps/server/src/research-mcp.ts apps/server/test/mcp-reference-register-contract.test.ts`; `pnpm exec eslint apps/server/src/research-mcp.ts apps/server/test/mcp-reference-register-contract.test.ts`; `pnpm --filter @linkedin-mcp/server build`. Request an independent **MCP security** review, disjoint from source implementer.

### Task 3: Capability truth and exact tool inventory

**Files:**

- Modify: `packages/core/src/capabilities.ts`
- Test: `packages/core/test/capabilities.test.ts`
- Test: `apps/server/test/foundation.test.ts`
- Test: `apps/server/test/mcp-contract.test.ts`

**Interfaces:**

- Consumes registered Task 2 tool; publishes distinct `research.references.index` descriptor without inventing a verified external research entitlement or publication.
- Produces registry/`linkedin.capabilities` `provider:'LOCAL_ONLY'`, `status:'ACTIVE'`, `availability:'AVAILABLE'` only when actual tool exists, `milestone:'M10'`, `approvalRequired:false`, truthful local-only access note/evidence. Existing `research.topic` remains unavailable.

- [ ] **Step 1 — Write focused RED assertions** for new capability and tool inventory: missing descriptor/tool must be the actual failure, no duplicate IDs; previous registry statuses and tool names remain unchanged. Assert `research.topic` is still `EXTERNAL_DISCOVERY`/`UNAVAILABLE` and no new native article publisher.
- [ ] **Step 2 — Verify RED**: `pnpm exec vitest run packages/core/test/capabilities.test.ts apps/server/test/foundation.test.ts apps/server/test/mcp-contract.test.ts --reporter verbose`, document expected missing reference descriptor/inventory. If Task 2 already registered tool, isolate registry RED rather than pretending a missing tool.
- [ ] **Step 3 — Minimum GREEN and gate**: append descriptor and update existing explicit expected inventories; do not change existing capability states. Run same 3-suite command and format/lint/typecheck; verify `linkedin.capabilities` in real MCP contract reports the new descriptor only as `LOCAL_ONLY`/`ACTIVE`.

### Task 4: Built STDIO, real loopback HTTP/SSE and no-private-state checks

**Files:**

- Modify/test: `tests/contract/stdio-smoke.test.ts`
- Modify/test: `tests/contract/http-smoke.test.ts`
- Observe only: `apps/server/src/http.ts`, `apps/server/src/stdio.ts`, `apps/server/src/runtime.ts`; do not alter existing hardened HTTP security behavior without an independently reproduced blocker and newly assigned owner.

**Interfaces:**

- Consumes built Task 2 tool and Task 3 registry. Must verify **actual built process** behavior under Node24; not just in-memory MCP handler.
- Produces bounded STDIO/HTTP tool-list and reference call, raw SSE byte count, absence of private store side effects/network calls, no verified/published claim.

- [ ] **Step 1 — Add built-process RED tests** for `linkedin.research.index_references` in STDIO and HTTP using the three-source duplicate-canonical-URL fixture, `data.kind:'local_reference_register'`, reported caller date and exact `sourceIds`. Build existing baseline first; distinguish intended missing tool from **stale dist / broken pnpm**. Assert `listTools` inventories match Task 3 and no `linkedin.research.topic`.
- [ ] **Step 2 — Capture real RED** with `pnpm exec vitest run tests/contract/stdio-smoke.test.ts tests/contract/http-smoke.test.ts --reporter verbose` _after `pnpm --filter @linkedin-mcp/server build`_. If code is already wired, add a targeted transport-only boundary assertion that genuinely fails before minimal fix; never invent a missing tool result.
- [ ] **Step 3 — Verify large valid corpus and actual SSE**: POST real JSON-RPC `tools/call` using 4 sources with ~49,000-character bodies and identical canonical URLs under ~200KiB normalized input. Assert successful grouped `sourceIds`, HTTP `200`, exact JSON-RPC ID, full SSE byte count ≤262,144, no `AAAAAAA` body echo, no partial success, no unauthorized fetch/redirect. Repeat with hostile signed/encoded URL and unknown caller trust; response sanitized and bounded. Assert original `research.analyze`/`group_themes` still work.
- [ ] **Step 4 — Verify private-store isolation**: where existing smoke harness can inject a valid private STDIO article/job store, establish stable before/after store state and verify the indexing operation never reads or mutates it; HTTP cannot enumerate private state. Do not add custom new storage/test credentials/network. Preserve existing loopback hardening, JSON-RPC ID bound and HTTP safe fallback.
- [ ] **Step 5 — GREEN and regression gate**: run fresh built `pnpm exec vitest run tests/contract/stdio-smoke.test.ts tests/contract/http-smoke.test.ts apps/server/test/mcp-reference-register-contract.test.ts --reporter verbose`. Capture actual raw HTTP/SSE byte count and tool inventory. A green in-memory handler alone does not close this task.

### Task 5: Independent audit, whole-suite verification and durable closeout (prime-owned)

**Files (only prime/doc owner after verified evidence):** `docs/milestones/M10-content-intelligence.md`, `docs/milestones/CURRENT.md`, `docs/milestones/README.md`, `docs/product/CAPABILITY-MATRIX.md`, `docs/requirements/TRACEABILITY.md`, `docs/progress/project-state.json`, `docs/progress/STATUS.md`, `docs/progress/KNOWN-ISSUES.md`.

**Interfaces:** Consumes real Task 1–4 tests, security findings and Git/remote exact-SHA evidence; produces truthful scoped M10.2 status. This **does not** change M10.0/M10.1 prior verified status or mark overall M10 complete.

- [ ] **Step 1 — Assign two disjoint READ-ONLY reviewers**: (a) pure wrapper/core URL canonical/trust/hostile objects/size/provenance, (b) MCP schema/errors, exact dual-copy and raw SSE budget, all private-store boundaries. Review Task 1–4 tests for real RED proofs and missing adversarial inputs; report exact Important/Critical reproductions and scope.
- [ ] **Step 2 — Fix verified Important/Critical with new genuine RED→GREEN** in assigned owner files, then independent re-review to **Critical=0, Important=0**. Do not weaken or remove existing tests.
- [ ] **Step 3 — Full fresh Node24 gates on final source**: `pnpm format:check`; `pnpm lint`; `pnpm typecheck`; `pnpm build`; `pnpm test`; `git diff --check`. Report actual test suites/count; include actual built STDIO/HTTP SSE execution _after final build_. If the environment cannot launch Node24/pnpm, fix invocation without changing tests, and do not call environment failure behavioral RED.
- [ ] **Step 4 — Documentation/status**: only after real local proof mark M10.2 `ACTIVE` (or `BLOCKED` on genuine blocker) with proposed `R-M10-REFERENCE-REGISTER`; `VERIFIED` is forbidden before exact feature and post-merge CI. Keep `research.topic` unavailable, M09 native publication blocked, and broader M10 clustering/gaps/trends/provider work unfinished. Record a single exact next action for recovery.
- [ ] **Step 5 — Remote safe persistence & PR** (prime only): re-check remote refs/PR/reviews/CI, use `GITHUB_WRITE_MODE=CONNECTOR_FIRST`; commit/remote-write only the owned reviewed code/docs once gates pass; create/update one focused PR, resolve review threads, verify exact final feature-head CI and stable mergeability, squash merge only through policy gates, then verify **post-merge main exact-SHA CI**. Never claim a merge/verification until confirmed by GitHub evidence.

## End-of-plan self-review and execution handoff

- **Spec coverage:** strict input and core canonicalization → Task 1; stateless grouped output + provenance and 200KiB/96KiB bounds → Task 1; typed LOCAL_ONLY MCP/error/dual-copy → Task 2; truthful capability/tool inventory → Task 3; actual Node24 STDIO/HTTP ≤256KiB and private-state boundary → Task 4; skeptical review, full gates and durable Git/CI → Task 5.
- **Review Focus coverage:** hostile objects (Tasks 1–2), canonical semantics (Tasks 1+4), secret aliases (Tasks 1–2), size/wire (Tasks 1–2+4), provenance/private stores (Tasks 1–4).
- **Type/name consistency:** `indexResearchReferences` returns `LocalReferenceRegister` with `sourceSummaries`, `repeatedUrlGroups`, `singleUrlSourceIds`; tool `linkedin.research.index_references` uses capability `research.references.index`; MCP `data.kind` is `local_reference_register`. No other task invents a second canonicalizer or matcher.
- **Scope/ownership:** no new persistence/database/API provider, no production implementation in the plan author's work. Current worktree is pre-created, so no new worktree or branch should be created by the document writer. **Exactly two files** created by that writer: this plan and the companion spec. Implementation is for prime and separately assigned code/test owners, beginning with Task 1 genuine missing-module RED.
- **Verification truth:** this document describes **future commands and expected assertions**, not that any TDD step, tests, build, CI or Git write has occurred for M10.2.

**Single next engineering action:** Assign an exclusive Task 1 pure module/test owner to add the first reference-register failing test, run it and record the genuine missing-module RED in `feat/m10-local-reference-register`.

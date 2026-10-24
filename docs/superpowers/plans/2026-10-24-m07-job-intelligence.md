# M07 Job Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide local, source-anchored job requirement extraction, relocation/visa signals, candidate fit and comparison, exposed through safe read-only MCP tools.

**Architecture:** Introduce pure, strict analysis contracts in `packages/core`, deterministic analysis in dedicated server modules and two bounded MCP read tools. Inputs are untrusted supplied snapshots; source quotes and evidence offsets accompany every conclusion. No new provider, network fetch or persisted personal data is added.

**Tech Stack:** Node.js 24, TypeScript 5, Zod 4, Vitest, existing MCP SDK and pnpm monorepo.

**Spec:** `docs/superpowers/specs/2026-10-24-m07-job-intelligence-design.md`.

## Global constraints

- M06 is VERIFIED at `0ff384ae5deb03b504259dc3f5519c8209c3e8f8`, post-merge CI `40077809706` GREEN: 713/713 tests in 77 files.
- Never invent employer verification, job eligibility, visa sponsorship, salary, applicant qualifications or an independently verified posting date from caller-supplied fields.
- All user-supplied job text is inert data; no network calls or private-store read/write from analysis.
- At most 10 jobs per comparison, 50 requirements per job, 80 candidate skills; bounded output and no personal profile fields in responses.
- All sourced requirements and non-unknown visa/remote signals must carry exact quote spans. Incomplete/conflicting evidence is explicit.
- Genuine RED→GREEN per behavior; full build/test/lint/format/typecheck and real STDIO/HTTP checks for completed checkpoints.

## Review Focus

1. An MCP caller forges `postingDate.state:'verified'`, PARTNER_API, source evidence/confidence or a provider-sounding source name; reject elevated inputs and canonicalize accepted display names to unverified in M07.1 output tests.
2. A job description contains instructions to call tools, quoted “Must have Python” from another employer or “we do NOT require Python”; extraction treats commands as inert and quoted/negated requirements as `unspecified`, not required. Covered by M07.2 and M07.6 tests.
3. A listing says “visa sponsorship available” but a location field requires existing authorization, or says “work from anywhere” but “US only”; resolve claims across fields as `conflicting`, not false positives. Covered by M07.3 tests.
4. A candidate has no skills, a job has no explicit requirements, or extraction truncates after 50 items with the 51st required skill unmatched; no confident numerical fit score appears. Covered by M07.4 tests.
5. The same source+ID is repeated with conflicting job details in comparison; fail closed without silently merging. Covered by M07.5 tests.

---

### Task 1: Strict untrusted snapshot and candidate contracts (M07.1)

**Files:** Create `packages/core/src/job-intelligence.ts`, `packages/core/test/job-intelligence.test.ts`; modify `packages/core/src/index.ts`.

**Interfaces:** `parseJobIntelligenceInput(input:unknown): Readonly<JobIntelligenceInput>` where a provided snapshot has a validated `NormalizedJob` _shape_, then a **canonicalized unverified source name/provider** and `sourceTrust:'caller_supplied'`, not host-authenticated provenance; `parseCandidateProfile(input:unknown): Readonly<CandidateProfile>`. Explicit caller `postingDate.state:'verified'`, `PARTNER_API`, source evidence and confidence fail closed unless a future authenticated server-internal path is introduced. Retain source.id only as an opaque local key and keep its retrievedAt explicitly caller-supplied.

- [x] **RED:** first tests importing missing new module; reject forged verified posting dates, PARTNER_API/source evidence/confidence claims, prototypes/getters, unsupported keys and oversized candidate skills. Accept minimal safe unknown/reported snapshot; fake source name canonicalized. Independent review generated further RED for proxies, empty candidate skills, raw-padding bounds and expanding Unicode casefolds.
- [x] **VERIFY RED:** `TMPDIR=/private/tmp pnpm exec vitest run packages/core/test/job-intelligence.test.ts` failed on missing module and later failed precisely on reviewer regressions.
- [x] **GREEN:** strict immutable untrusted snapshot contract implemented; no caller trust elevation; all 11 focused tests and 724-test integrated local suite GREEN. Two independent scoped reviewer signoffs reported no remaining Critical/Important findings.
- [x] **VERIFY GREEN:** scoped tests, core TypeScript and whole suite passed; M07.1 checkpoint `1d0ac1d` exact-head CI `40080270039` GREEN.

### Task 2: Deterministic requirement extraction (M07.2)

**Files:** Create `apps/server/src/jobs/job-requirements.ts` and `apps/server/test/job-requirements.test.ts`.

**Interfaces:** `extractJobRequirements(job: Readonly<NormalizedJob>): Readonly<JobRequirementExtraction>` where `JobRequirementExtraction` is `{requirements:readonly JobRequirement[]; truncated:boolean; evidenceStatus:'explicit'|'incomplete'}`; requirement quote spans reference exact original `title` or `description` using UTF-16 code-unit start-inclusive/end-exclusive offsets and `offsetUnit:'utf16'`.

- [x] **RED:** missing-module RED and focused RED for neglected mandatory experience, work-authorization, language, and bare preferred AWS/Python clauses; quoted and negated text controls.
- [x] **VERIFY RED:** targeted Vitest failures observed before implementation/fixes.
- [x] **GREEN:** original UTF-16 offsets, bounded quotes and 50-item cap; conservative polarity and attribution; unknown mandatory clauses incomplete; no unsupported skill-score inflation.
- [x] **VERIFY GREEN:** focused tests, integrated typecheck/lint and real MCP analysis passed locally; remote final-head CI pending.

### Task 3: Explicit location/sponsorship and company signals (M07.3)

**Files:** Create `apps/server/src/jobs/job-signals.ts` and `apps/server/test/job-signals.test.ts`.

**Interfaces:** `extractJobSignals(job: Readonly<NormalizedJob>): Readonly<JobSignals>` with separate sponsorship, relocation assistance, worldwide remote eligibility, work authorization and bounded exact source quotes across title, description **and location**, each tagged `field`, `start`, `end`, `offsetUnit:'utf16'`; preserve explicit negation and cross-field conflicts.

- [x] **RED:** initial missing module, further cross-field authorization, residency and role-specific sponsorship restrictions, unrelated customer/training/citizenship counterexamples, region variants all observed failing before corrections.
- [x] **VERIFY RED:** focused missing-module and concrete false-positive signal test failures confirmed.
- [x] **GREEN:** deterministic source-quoted worldwide remote/visa/relocation/authorization signals with explicit yes/no/unknown/conflicting states and bounded UTF-16 evidence; no external calls.
- [x] **VERIFY GREEN:** focused tests/types/lint and integration green locally; final combined PR CI pending.

### Task 4: Source-grounded candidate fit (M07.4)

**Files:** Create `apps/server/src/jobs/job-fit.ts` and `apps/server/test/job-fit.test.ts`.

**Interfaces:** `analyzeJobFit(extraction: Readonly<JobRequirementExtraction>, profile?: Readonly<CandidateProfile>): Readonly<JobFit>` where `JobRequirementExtraction` is Task 2's `{requirements,truncated,evidenceStatus}`; includes explicit matched/missing/unknown categories and reproducible advisory score only when extraction is complete with meaningful sourced required/preferred _skill-only_ evidence. For M07 v1, denominator `3 × count(required skill requirements) + 1 × count(preferred skill requirements)`, numerator `3 × matched required + 1 × matched preferred`, score `Math.round(100 × numerator / denominator)` in 0–100; `unspecified` priorities excluded. Count each distinct normalized skill once per priority to avoid duplicate inflation. Match lowercased trimmed exact skills, plus **only** these fixed aliases: `ts ↔ typescript`, `js ↔ javascript`, `nodejs ↔ node.js`, `react.js ↔ react`, `postgres ↔ postgresql`; no substring/fuzzy matching. Any explicitly required/preferred non-skill category, missing profile, no weighted skill clauses, `truncated:true`, or incomplete evidence yields `insufficient_evidence` with **no score**. Do not compare candidate geography, immigration or years in the numeric formula.

- [x] **RED:** absent implementation plus 3:1 75/100/25 golden fixtures, aliases and near misses, missing profile, incomplete/truncated/non-skill mandatory safeguards, no candidate metadata disclosure.
- [x] **VERIFY RED:** missing module targeted Vitest failed before implementation.
- [x] **GREEN:** stable 3:1 weighting and explicit skill-only scope; ambiguous/mandatory legal criteria never scored; transient candidate fields never echoed.
- [x] **VERIFY GREEN:** focused and integrated tests, types and lint green locally; remote final CI pending.

### Task 5: Reproducible multi-job comparison (M07.5)

**Files:** Create `apps/server/src/jobs/job-intelligence-service.ts` and `apps/server/test/job-intelligence-service.test.ts`.

**Interfaces:** `createJobIntelligenceService(): { analyze(input:unknown): Promise<JobAnalysisResult>; compare(input:unknown): Promise<JobCompareResult> }`; compare 2–10 source-scoped distinct jobs, stable input order and identical evidence rules per job.

- [x] **RED:** missing service, duplicate scoped identities, malformed/overlarge inputs and false 100% work-authorization score reproduced before correction.
- [x] **VERIFY RED:** focused Vitest confirmed missing-module and work-authorization false score.
- [x] **GREEN:** source-scoped stable comparison, no private profile output, bounded serialized results and independent legal-authorization fit suppression.
- [x] **VERIFY GREEN:** focused tests, build and real MCP integration green locally; final PR CI pending.

### Task 6: Strict MCP tools and real transports (M07.6)

**Files:** Create `apps/server/src/jobs-intelligence-mcp.ts` and `apps/server/test/mcp-job-intelligence-contract.test.ts`; modify `apps/server/src/create-server.ts`, `apps/server/src/runtime.ts`, `packages/core/src/capabilities.ts`, `tests/contract/stdio-smoke.test.ts`, `tests/contract/http-smoke.test.ts`, `docs/product/CAPABILITY-MATRIX.md`.

**Interfaces:** read-only `linkedin.jobs.analyze` and `linkedin.jobs.compare` with Zod strict inputs/outputs; exact `linkedin.capabilities` IDs `jobs.analyze`, `jobs.compare` (both LOCAL_ONLY and verified local availability, independent of M06 provider configuration), replacing stale planned `jobs.score` without an implicit alias; explicit caller-supplied source trust and sanitized error taxonomy; no local saved-store access through HTTP.

- [x] **RED:** missing MCP tools/capabilities, incorrect output schema and oversized complete MCP reply all observed failing targeted tests.
- [x] **VERIFY RED:** real MCP client test failures observed before registration and output fixes.
- [x] **GREEN:** registered strict read-only analyze/compare tools with truthful LOCAL_ONLY capabilities, typed source/evidence schemas, complete envelope size cap, built STDIO/HTTP transports and HTTP saved-state isolation.
- [x] **VERIFY GREEN (local):** full 902/902 `pnpm test` (83 files, real STDIO/HTTP), `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `git diff --check` passed. Exact-new-head CI remains pending.

### Task 7: Independent closeout (M07.7)

**Files:** Update `docs/milestones/{M07-job-intelligence,CURRENT,README}.md`, `docs/progress/{STATUS,KNOWN-ISSUES,project-state.json}`, `docs/requirements/TRACEABILITY.md`, `docs/product/CAPABILITY-MATRIX.md`.

- [ ] Independently review security, data minimization, source evidence, prompt injection, deceptive job/sponsorship claims and accurate availability; regression-fix every verified Critical/Important issue.
- [ ] Verify all required local checks and exact final PR head CI, no blocking review threads and stable main; docs report real capability boundaries.
- [ ] Squash merge; verify exact post-merge main CI before M08 starts.

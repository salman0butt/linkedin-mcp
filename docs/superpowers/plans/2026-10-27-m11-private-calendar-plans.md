# M11.1 Private Local Calendar Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver opt-in private local STDIO-only durable CRUD for caller-authored calendar plans, without scheduling or LinkedIn publication.

**Architecture:** Reuse M11.0 strict deterministic preview validator, implement a self-contained private file-backed bounded store with revisions, idempotency and atomic commits analogous to M08. Register five typed MCP tools behind an unconditional STDIO transport boundary, wired through host configuration/runtime only.

**Tech Stack:** Node.js 24, TypeScript 5.9, MCP SDK 2, Zod 4, Vitest 4, JSON private local file, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-27-m11-private-calendar-plans-design.md`

## Global Constraints

- No actual queue, scheduling, publication, approval carry-forward, URL fetching, network provider or private HTTP access.
- `calendar` remains exact M11.0 `{referenceUtc,items}` and preserves original valid text/order. Strict validated input max 16KiB.
- File budget 2MiB, 20 live plans, 2,048 idempotency history; one canonical file with lock/sentinel, fail-closed storage.
- 256KiB complete MCP+raw SSE, error codes fixed, no caller secret names/values in errors.
- Retain `schedule.create` unavailable and M09.P/M10 provider-based blocks.

## Review Focus

- Revoked proxies and getter traps should be rejected by preview before disk operations → store test.
- Corrupt UTF8/partial state or leftovers after crash must not be treated as an empty store → store test.
- A deleted create key replay must not create a new live plan → store test.
- HTTP runtime deliberately injected with a private calendar store must neither invoke it nor disclose plans → MCP/HTTP test.
- Caller-supplied host IDs 270KiB and unknown Zod schema fields containing secrets must not exceed SSE budget or leak → real-wire test.

---

### Task 1: Secure pure local plan store and TDD

**Files:** Create `apps/server/src/scheduling/calendar-plan-store.ts`, `apps/server/test/calendar-plan-store.test.ts`.

**Interfaces:** Export `LocalCalendarPlanStore`, `LocalCalendarPlan`, `LocalCalendarPlanSummary`, `CalendarPlanStoreError` and `createLocalCalendarPlanStore({transport:'stdio'|'http',filePath?,lockTimeoutMs?})`. Methods: `create({idempotencyKey:string,calendar:unknown})`, `update({id:string,expectedRevision:number,calendar:unknown})`, `get({id:string})`, `list()`, `remove({id:string,expectedRevision:number})`.

- [ ] **Step 1:** Write failing Vitest cases importing new module: unsupported HTTP/absent path, idempotent create/replay/conflict, persist-restart, CAS update/remove/list summary, malformed/proxy/secret input, corruption, filesystem bounds; verify expected RED from missing module.
- [ ] **Step 2:** Implement immutable defensive calendar normalization using `previewLocalContentCalendar(input)` and copy preserved input after validation; fixed error taxonomy, UUID IDs, revision 1, ISO UTC timestamps.
- [ ] **Step 3:** Implement 0600/0700 private pinned filesystem lock/sentinel/atomic write and 20/2048/2MiB limits; ensure ambiguous post-rename failure is `outcome_unknown` and orphan files never silently deleted.
- [ ] **Step 4:** Focused GREEN, adversarial storage tests, Prettier/ESLint/TypeScript, diff check. No staging/commit/push by delegated owner.

### Task 2: Typed MCP saved-plan methods and TDD

**Files:** Create `apps/server/src/calendar-plan-mcp.ts`, `apps/server/test/mcp-calendar-plans-contract.test.ts`.

**Interfaces:** `registerCalendarPlanTools(server,{transport?,calendarStore?,createRequestId,now})` importing store interface from Task 1; five names `linkedin.calendar.plans.create|update|get|list|remove`.

- [ ] **Step 1:** Real MCP SDK `listTools` RED before registration (tools missing); build core dependencies and document expected tool count change 52→57 in-memory.
- [ ] **Step 2:** Strict Zod input/output, correct stored-plan statuses `persistence:private_local`, `execution:not_queued`, `approval:not_evaluated`, `publication:not_attempted`; safe fixed errors and dual-copy ≤256KiB.
- [ ] **Step 3:** Deny non-STDIO or missing store even if supplied by host; test real SDK valid CRUD, bad schemas/secret keys, near size bounds and forged metadata; focused GREEN, scoped code checks. No staging/commit/push by delegated owner.

### Task 3: Host config, runtime, capability and transport integration

**Files:** Modify `apps/server/src/config.ts`, `apps/server/src/runtime.ts`, `apps/server/src/create-server.ts`, `packages/core/src/capabilities.ts` and corresponding config/capability/foundation/inventory tests; real `tests/contract/{stdio,http}-smoke.test.ts`.

- [ ] **Step 1:** Write genuine RED assertions for new host env path validation and private companion-file overlap, truthful capability, real MCP tools inventory, HTTP injected-store denial and opt-in STDIO persistent create/restart/read.
- [ ] **Step 2:** Parse `LINKEDIN_MCP_CALENDAR_STORE_PATH` only as canonical absolute private path and reject all cross-store/credential/media/ledger companions; construct store only for STDIO; register five MCP tools with proper transport dependency.
- [ ] **Step 3:** Register `calendar.plans` LOCAL_ONLY UNAVAILABLE-by-default ACTIVE descriptor with evidence and no approval/LinkedIn claims. Update 56→61 built tools, preserve old contract tests and `calendar.preview` count.
- [ ] **Step 4:** Focused GREEN; full compiled STDIO/HTTP/raw SSE tests, injected private-store trap, real restart and host invalid-input cases.

### Task 4: Independent review and release

**Files:** `docs/milestones/{CURRENT,M11-scheduling,README}.md`, `docs/product/CAPABILITY-MATRIX.md`, `docs/requirements/TRACEABILITY.md`, `docs/progress/{STATUS,KNOWN-ISSUES,project-state.json}`, this spec/plan.

- [ ] **Step 1:** Independent disjoint skeptical filesystem/privacy and MCP/capability/transport reviewers, replay hostile cases and resolve any verified Critical/Important findings with RED→GREEN and re-review.
- [ ] **Step 2:** Run fresh Node24 frozen baseline/full Prettier, ESLint, TypeScript, build, all Vitest, built STDIO/HTTP/SSE and Git diff guards.
- [ ] **Step 3:** Persist docs with M11.0 exact merge/main CI verified and M11.1 limits and risks; do not report feature/main GitHub CI before actual retrieval.
- [ ] **Step 4:** SHA-check every GitHub blob, remote tree equals local `git write-tree`; connector-first feature branch and PR; exact final-head CI+quality success, nonblocking reviews and mergeability; guarded squash merge; verify new main parent/tree and exact push CI+quality success; continue PRD.

# M11.2 — Private Local Calendar Plan Inspection Implementation Plan

**Goal:** Add strictly planning-only read-only inspection of one revision of a private saved calendar plan, with caller-supplied UTC snapshot time. No scheduler, provider, approval or persistence migration.

**Base:** verified M11.1 main `4dbecdebb2b94ee26d646b3933f268e4796251fa`; isolated branch `feat/m11-local-plan-inspection`.

**Spec:** `docs/superpowers/specs/2026-10-27-m11-calendar-plan-inspection-design.md`.

## Global constraints

- Node24, TypeScript, Vitest, real MCP SDK; genuine RED→GREEN for pure and MCP. Never weaken private STDIO/HTTP boundary, store file protection, full wire bounds, semantic calendar validation, or other platform security.
- Strict own-data validation of any injected plan; avoid getter reads, proxy traversal and untrusted error messages. ISO UTC-minute comparison uses strict canonical parsing, not ambient time.
- `schedule.create`, native article publishing and provider-backed research remain UNAVAILABLE. No timers, queues, network calls, saved approvals or actual LinkedIn mutations.

### Task 1: Pure snapshot inspection

**Files:** create `apps/server/src/scheduling/calendar-plan-inspection.ts` and `apps/server/test/calendar-plan-inspection.test.ts`.

- [ ] RED: import `inspectLocalCalendarPlan({plan:unknown,expectedRevision:unknown,asOfUtc:unknown}): Readonly<LocalCalendarPlanInspection>` in Vitest; prove absent-module failure. Test stable sorted chronology, original-position ties, exact-boundary `pastAsOf`, private labels NOT returned, and manual article semantics.
- [ ] GREEN: strict own-data/safe dates/UUID/revision plus existing `previewLocalContentCalendar` validation, versioned domain-separated SHA-256 digest of `{id,revision,calendar}` (not `asOfUtc`), classify validated preview items into `pastAsOf`/`futureAsOf`, provide bounded frozen planning-only result.
- [ ] RED→GREEN hostile cases: revoked proxy, accessors, extra secret root/calendar/item fields, malformed ISO, stale expected revision, invalid stored semantics and output size. Use fixed safe error kinds; no file/network IO in pure helper.
- [ ] Run pure focused tests, scoped formatting/lint/typecheck and self-review. Do not stage or remote write from worker.

### Task 2: Typed saved-plan inspection MCP

**Files:** update `apps/server/src/calendar-plan-mcp.ts`, add `apps/server/test/mcp-calendar-plan-inspection-contract.test.ts`.

- [ ] RED: actual MCP SDK `listTools` does not yet contain `linkedin.calendar.plans.inspect`, and a strict typed contract test fails for the missing operation.
- [ ] GREEN: register required `{id,expectedRevision,asOfUtc}` strict Zod input; reuse STDIO-only `saved(...,false,...)` gate and existing safe dual text/structured output with 256KiB budget. `store.get` once; null→`not_found`, mismatch→`revision_conflict`; inspect using pure function; validate/sanitize injected malformed store values. No output of secrets/paths.
- [ ] Real SDK success, stale/not-found, unknown secret-key pre-handler, host 270k id, HTTP poison getter zero reads, no `schedule.create`, original 5 CRUD semantics intact. Preserve conservative error handling.
- [ ] Run contract focused tests, typed build, scoped formatting/lint. No staging/remote write by worker.

### Task 3: Runtime, transport inventory, documentation

**Files:** `tests/contract/calendar-plans-smoke.test.ts`, inventory assertions in `apps/server/test/{mcp-contract,foundation}.test.ts` and `tests/contract/{stdio,http}-smoke.test.ts`, capability registry test if evidence changes; `docs/{milestones,product,requirements,progress}`.

- [ ] RED→GREEN: expected built tool count 61→62 (in-memory 57→58), fresh saved-plan STDIO inspection across restart, HTTP denial even with a poison getter, raw SSE full bound; no store mutation before/after inspection.
- [ ] Update M11 milestone, current state, capability matrix and traceability for M11.1 exact verified main, M11.2 currently implementing, truthful provenance and pending remote CI. Keep status evidence exact, no early claims.
- [ ] Run all Node24 format/lint/typecheck/build/test and transport contracts; index exact intended files and verify no unstaged/unrelated changes.

### Task 4: Independent audit and guarded release

- [ ] Strict independent disjoint pure and MCP/transport reviewers, reproduce Critical/Important concerns, fix with genuine RED→GREEN, re-review to unresolved Critical=0 Important=0.
- [ ] Connector-first upload every exact changed blob; new GitHub tree exactly equals local `git write-tree`. Confirm exact feature parent is M11.1 verified main, no competing PR/worker, create one focused PR.
- [ ] Exact feature SHA GitHub Actions and `quality` must complete/succeed; resolve review blockers, verify refs and mergeability, guarded squash merge with expected head SHA, then verify new main parent/tree and its own **push** CI `quality` succeeded. Only then call M11.2 VERIFIED/MERGED and proceed.

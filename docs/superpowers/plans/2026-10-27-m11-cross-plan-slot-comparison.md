# M11.3 — Two Saved-Plan UTC Slot Comparison Implementation Plan

**Goal:** A single strictly read-only LOCAL_ONLY/STDIO-only tool to report shared UTC planned minutes across two explicitly selected private plan revisions, with no label disclosure, no atomic-snapshot claim and no scheduled execution.

**Base:** exact verified M11.2 main `39d843dda4a5ffc00b9c74aaf1c5f320af967e93`. Isolated branch `feat/m11-plan-conflict-audit`.

**Spec:** `docs/superpowers/specs/2026-10-27-m11-cross-plan-slot-comparison-design.md`.

## Task 1 — pure compare and hostile validation

**Files:** new `apps/server/src/scheduling/calendar-plan-slot-comparison.ts`, new `apps/server/test/calendar-plan-slot-comparison.test.ts`.

- [ ] RED missing-module import of `compareLocalCalendarPlanSlots(input:{plans:unknown;expectedRevisions:unknown}): Readonly<LocalCalendarPlanSlotComparison>`; assert exact ordered metadata-only collision minute(s), plan refs, counts, warnings, no label leakage.
- [ ] GREEN strict unknown validation of two exact own-data arrays, plan IDs/revisions/timestamps, M11.0 semantic preview and copies. Compare only minutes present in BOTH. Output chronological ascending, caller plan order and original item tie order; freeze and <=32KiB JSON.
- [ ] RED→GREEN hostile: proxy/revoked/getters/accessor arrays, malformed date/UUID, duplicate plan ID, stale revision, unknown secret key/value, 20 items each, same-plan-only collisions, cross-plan reused IDs, object prototypes, no Date.now/fs/provider/timers; fixed errors `invalid_input|invalid_output|revision_conflict`.
- [ ] Run Node24 pure focused, Prettier, ESLint and typecheck. Worker owns only 2 files, no staging/commits/PR.

## Task 2 — strict MCP registrar + SDK tests

**Files:** `apps/server/src/calendar-plan-mcp.ts`, new `apps/server/test/mcp-calendar-plan-slot-comparison-contract.test.ts`.

- [ ] RED actual SDK `listTools` missing `linkedin.calendar.plans.compare_slots`.
- [ ] GREEN strict Zod two-element `plans` input, distinct UUIDs/positive revision, output schema exactly per spec; use existing `saved(schema,false,...)` before touching private store in non-STDIO/missing-opt-in case. Sequentially `get` each once, fixed notfound/revision errors and pure compare, preserve dual MCP envelope and byte safety.
- [ ] Genuine typed SDK tests: success, zero/minute collisions, 270K request ID and raw SSE bounds, missing/stale, secret unknown fields rejected pre-handler, injected malicious store/proxy/getters sanitized, HTTP private getter zero, never write, no scheduler/publisher. Existing CRUD/inspect unchanged.
- [ ] Node24 focused, Prettier, ESLint and typecheck; no stage/commit/PR.

## Task 3 — integration and durable docs

**Files:** `tests/contract/calendar-plans-smoke.test.ts`, `tests/contract/{stdio,http}-smoke.test.ts`, `apps/server/test/{mcp-contract,mcp-calendar-preview-contract,mcp-calendar-plans-contract}.test.ts`, `docs/{milestones,product,progress,requirements}`.

- [ ] RED inventory 58→59 in-memory and 62→63 compiled; new typed listTools signature, existing unavailable schedule.
- [ ] GREEN real compiled STDIO two saved plans across restart and read-only cross-plan slot compare; HTTP even with poisoned private getter denies all seven saved-plan methods; response <=256KiB.
- [ ] Record verified M11.2 main feature/main CI and current M11.3 IMPLEMENTING with no remote claims; actual scheduling still unavailable.
- [ ] Full Node24 format/lint/typecheck/build/test and actual built transport; index exact intended files and verify zero unstaged/unrelated files.

## Task 4 — independent review + guarded GitHub release

- [ ] Disjoint independent pure and MCP/transport read-only review; reproduce Critical/Important with genuine RED→GREEN and re-review to unresolved 0/0.
- [ ] Upload all staged blobs to GitHub Git-object API verifying exact Git SHA; remote tree == `git write-tree`; feature commit parent verified M11.2 main and no competing PR. Create only one focused PR.
- [ ] Exact PR-head CI/quality success and no blocking reviews/threads; guarded squash merge expected feature SHA; verify exact merged-main parent/tree and its own push CI/quality before M11.3 VERIFIED/MERGED.

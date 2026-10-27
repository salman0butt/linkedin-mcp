# M11.0 Caller-Defined Local Calendar Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver safe stateless caller-authored UTC content calendar viewing without queuing, authorizing or publishing content.

**Architecture:** Strict pure own-data validation and deterministic chronological grouping, independently registered typed LOCAL_ONLY MCP with guarded dual reply, capability/transport contracts and truthful milestone docs. Work in isolated `feat/m11-local-content-calendar` on verified M10.4 main `2366139cffcc080332dd25ec9438018ee1863b33`.

**Tech Stack:** Node 24, TypeScript, pnpm, Vitest, Zod v4, MCP SDK, real compiled STDIO/HTTP.

**Spec:** `docs/superpowers/specs/2026-10-27-m11-local-content-calendar-preview-design.md`.

## Global Constraints

- Exact root `{referenceUtc,items}`, 1–20 exact `{id,label,kind,plannedAtUtc}`, raw case-insensitive unique ASCII IDs, canonical real UTC minute dates and (reference, reference+90 days] only.
- No timezone inference/DST conversion, persistence, scheduler, LinkedIn provider, writer, private stores, approvals, retries, or marketing copy.
- Serialized input ≤16,384 UTF-8 bytes; pure output ≤32,768 UTF-8 bytes; full MCP dual JSON-RPC/actual HTTP raw SSE ≤262,144 UTF-8 bytes.
- `linkedin.calendar.preview` / `calendar.preview` truthful LOCAL_ONLY ACTIVE AVAILABLE, `schedule.create` unchanged unavailable; 56 tools.
- Preserve M10/M09 unavailability claims, prior worktree and unrelated branches. Repo policy `AGENTS.md`, exact-SHA CI, independent disjoint Critical0 Important0 gates.

## Review Focus

1. Invalid real Gregorian day and noncanonical minute format: pure test rejects; MCP does not leak date text.
2. Proxy/getter/extra symbols and secret field names: pure accessors uncalled, MCP error sanitized.
3. Equal-minute caller groups and source ties: original stable order and explicit conflicts verified.
4. 20/21 item and output size boundaries: pure/transport tests prove bounded deterministic behavior.
5. Host 270K RPC ID, HTTP private article store and true SSE bytes: MCP and real transport tests show isolation and bounded failure.

## Task 1 — Pure deterministic planner (prime or exclusive source worker)

**Files:** Create `apps/server/src/scheduling/calendar-preview.ts`; create `apps/server/test/calendar-preview.test.ts`.

**Interfaces:** `previewLocalContentCalendar(input:unknown): Readonly<LocalCalendarPreview>`, exact typed output and bounds in spec.

- [ ] Create test fixture with two UTC days and 2 equal-minute distinct IDs; import nonexistent module; run `pnpm exec vitest run apps/server/test/calendar-preview.test.ts` and record real missing-module RED.
- [ ] Implement minimum own strict object/array data descriptor validation, raw safe ID, one-line label and exact real UTC calendar minute parser; assert duplicate ID, time boundaries and sorting. Run focused GREEN.
- [ ] Add RED adversarial tests: 20/21 entries, case/whitespace IDs, unknown/secret/proxy/revoked/own symbols/accessors/sparse arrays, DST-like local/offset strings, February 30, leap seconds, 90-day bounds, collisions, deep freeze and output budget; fix minimum, run GREEN and scoped TS/format/lint.

## Task 2 — Typed MCP and transport (nonoverlapping worker)

**Files:** Create `apps/server/src/calendar-mcp.ts`; create `apps/server/test/mcp-calendar-preview-contract.test.ts`. Integrate only `apps/server/src/create-server.ts` if this worker owns it.

**Interfaces:** `registerCalendarTools(server, deps)`, imports pure Task 1, strictly typed schemas and local reply. No private stores or LinkedIn provider calls.

- [ ] Test real MCP client `listTools` before registrar exists and verify RED (missing named tool), not infrastructure RED.
- [ ] Register `linkedin.calendar.preview` and strict input/output. Test successful structured/text parity, chronological grouping, one-of-kind manual flag, bounds/error taxonomies, hidden secret key names/values, large host request ID and HTTP private stores. Run focused GREEN and scoped TS/ESLint/Prettier.
- [ ] Confirm actual raw HTTP JSON-RPC/SSE full-response ≤256KiB on valid and hostile input, and no fabricated queue or scheduling receipt.

## Task 3 — Core capability, inventory, real transports, docs (prime, after Task 2)

**Files:** Modify `packages/core/src/capabilities.ts`, `packages/core/test/capabilities.test.ts`, `apps/server/test/foundation.test.ts`, `apps/server/test/mcp-contract.test.ts`, `tests/contract/stdio-smoke.test.ts`, `tests/contract/http-smoke.test.ts`; update `docs/milestones/CURRENT.md`, `M11-scheduling.md`, `M10-content-intelligence.md`, `README.md`, `docs/progress/project-state.json`, `STATUS.md`, `KNOWN-ISSUES.md`, `docs/requirements/TRACEABILITY.md`, `docs/product/CAPABILITY-MATRIX.md`.

- [ ] Capability and 56-tool inventory tests RED, then add truthful only `calendar.preview` LOCAL_ONLY descriptor; do not promote `schedule.create`.
- [ ] Build real server and extend STDIO/HTTP tool count/invocation tests, including UTC chronology and real SSE bounds. Run GREEN.
- [ ] Record M10.4 PR #20 verified exact feature CI 40469138021, main 2366139 main push CI 40469415495; mark M10 provider-backed remainder unavailable, M11.0 local implementation pending GitHub gates, preserving truthfulness.

## Task 4 — Independent reviews, full verification and remote release

- [ ] Two read-only **disjoint** pure/security and MCP/capability/transport reviews, hostile cases. Reproduce any Important/Critical finding with RED, fix and re-review until zero.
- [ ] Node 24 `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `git diff --check`; macOS baseline test command with canonical `TMPDIR` as necessary; built STDIO/HTTP and raw SSE verified.
- [ ] Stage only intended files, `git write-tree`, verify GitHub blobs and remote tree against local SHA. Create remote feature commit from verified main through GitHub connector, PR, verify exact feature-head Actions CI, blocking threads clear, squash with expected SHA, verify exact new main/tree and **its own** push CI.
- [ ] If verified merged, keep M11 **IMPLEMENTING**, scheduling still unavailable, and autonomously select the next feasible safe dependency-aware slice.

# Trusted Approval Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent MCP callers from issuing their own consequential-write receipts.

**Architecture:** Separate a trusted host-only approval-grant issuer from a consumer-only runtime interface. Bind each grant to an unpredictable one-time capability ID as well as the subject, purpose and payload. Guard production approval issuance before the existing purpose-scoped receipt store.

**Tech Stack:** TypeScript, Node 24, MCP, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-trusted-approval-design.md`

## Global Constraints

- No automatic grants or model-callable issuer.
- Preserve tool names, strict schemas, canonical previews, scope checks and idempotency.
- Default fail closed without trusted host integration.
- In-memory grants expire within ten minutes and are single-use.
- Do not imply live Community Management entitlement.

## Review Focus

- Same public hash for different purposes must not share a grant (Task 1).
- A subject change must not reuse a grant (Task 1).
- Expired and consumed grants must fail closed (Task 1).
- A second MCP client cannot take a matching grant without the host-issued capability ID (Task 1/3).
- The capability ID must not be forwarded to injected receipt stores after consumption (Task 2).
- Injected approval stores must still be guarded (Task 2).
- All production MCP approval paths must fail closed without host grants (Task 3).

---

### Task 1: Trusted host grant store

**Files:** Create `apps/server/src/publishing/trusted-approval-grants.ts`; test `apps/server/test/trusted-approval-grants.test.ts`.

**Interfaces:** `createTrustedApprovalGrantStore({now?, ttlMs?})` returns separate `issuer` and `consumer`; issuer grants subject/purpose/hash, consumer atomically consumes subject/scoped-hash.

- [x] Write tests for matching, mismatch, expiry, reuse, theft without a grant ID, and invalid inputs.
- [x] Run focused tests and observe intended RED.
- [x] Implement minimal store, verify GREEN and refactor.

### Task 2: Production issuance gate

**Files:** Modify `approval-service.ts`, `runtime.ts`; extend `runtime.test.ts`.

**Interfaces:** `requireTrustedApprovalGrant(service, consumer?)` wraps `issue`, delegates `consume`, and throws `ApprovalServiceError('human_approval_required')` on absent grant. Runtime overrides accept only the consumer.

- [x] Write RED tests for no grant, injected store, exact grant, and receipt consume.
- [x] Implement minimal wrapper/wiring; verify focused GREEN.
- [x] Check all text, media and engagement paths use the guarded store and strip the grant ID before receipt storage.

### Task 3: MCP status mapping and regression coverage

**Files:** Modify text/media/engagement MCP and service error mappings; add production-runtime MCP regression tests.

- [x] Write RED tests for human-action-required denials with no receipt and for a second client's unauthorized grant-consumption attempt.
- [x] Implement minimal sanitized status mapping; verify GREEN.
- [x] Run full tests, format, lint, typecheck, build, stdio and HTTP smoke.

### Task 4: Review and durable checkpoint

**Files:** Update project-state, STATUS, known issues, M04 ledger, current milestone, traceability, capability matrix, operator docs and evidence.

- [x] Perform independent correctness/security review; fresh 2026-10-22 reviewer found 0 verified Critical/Important defects across six approval paths, 33 focused tests passed.
- [x] Re-check remote branch and PR, persist through connector-first GitHub write, verify exact-head CI (commit `5c2efce`, CI `39589866610`; 579/579 tests).
- [ ] Merge only when every gate is green; verify post-merge main before M05.

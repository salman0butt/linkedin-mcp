# M04 Comments & Engagement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build permission-aware LinkedIn member comments/replies/reactions and a bounded unanswered-comment workflow with truthful capability provenance.

**Architecture:** Add canonical engagement contracts in core, official versioned Comments/Reactions adapters in server, and a service that reuses existing approval/idempotency infrastructure. Restricted member reads remain default-off and explicit; all consequential writes are preview/approval/idempotency gated. The inbox is a local derivation over explicit thread roots, not feed discovery.

**Tech Stack:** TypeScript, Node.js 24, Vitest, Zod v4, MCP SDK, LinkedIn versioned REST APIs, existing encrypted auth/approval/file-ledger infrastructure.

**Spec:** `docs/superpowers/specs/2026-10-11-m04-comments-engagement-design.md`

## Global Constraints

- Use genuine RED -> verify RED -> minimum GREEN -> verify GREEN -> refactor for every behavior change.
- Current Community Management member write scope: `w_member_social_feed`; restricted member read scope: `r_member_social_feed`.
- Member reads require an explicit local trusted gate that defaults false.
- Do not implement BATCH_GET in M04.
- No arbitrary actor/token/provider URL or browser fallback.
- No mutation retry after uncertain remote outcome.
- Reuse subject-bound approvals and durable idempotency; preserve cross-runtime safety.
- Provider response bodies, paging and inbox thread count must be bounded.
- Live Community Management access remains unverified until legitimate provider evidence exists.

## Review Focus

- Missing/restricted read access returns an explicit unavailable state, not empty results.
- Malformed/oversized provider comment/reaction responses fail closed without leaking provider content.
- Concurrent/replayed reply or reaction mutations cannot duplicate remote writes.
- Nested reply target/root/parent mismatches fail locally or as provider-conflict, never silently reparent.
- Inbox call/page bounds prevent an explicit list of roots from becoming an unbounded crawl.

---

### Task 1: Canonical engagement contracts and access policy

**Files:**

- Create: `packages/core/src/engagement.ts`
- Modify: `packages/core/src/index.ts`
- Modify: capability registry source used by `linkedin.capabilities`
- Modify: `apps/server/src/config.ts`
- Test: `packages/core/test/engagement.test.ts`
- Test: `apps/server/test/config.test.ts`
- Test: `packages/core/test/capabilities.test.ts`

**Interfaces:**

- Produce strict comment target/comment/page/reply/reaction preview types and canonical hash helpers.
- Add trusted config flag `LINKEDIN_MCP_ENGAGEMENT_READ_ENABLED`, default false.
- Capability metadata keeps provider `OFFICIAL_API`, read restriction and live-unverified provenance explicit.

- [ ] Write RED tests for URN allowlisting, reaction enum excluding `MAYBE`, canonical reply/reaction hashes, read-gate default false/exact opt-in and capability truth.
- [ ] Run focused tests and verify intended behavioral RED only.
- [ ] Implement minimum contracts/config/capability changes.
- [ ] Run focused tests, then full suite; refactor only while green.
- [ ] Commit verified M04.1 checkpoint and record exact CI.

### Task 2: Official Comments read adapter

**Files:**

- Create: `apps/server/src/engagement/linkedin-comments.ts`
- Test: `apps/server/test/linkedin-comments.test.ts`
- Test: `apps/server/test/linkedin-comments-response-bounds.test.ts`

**Interfaces:**

- Produce `getComment(...)` and `listComments(...)` using explicit target URNs, bounded paging and canonical results.
- Consume API version, access token and injected fetch.

- [ ] Write RED tests for versioned GET contracts, nested comment target encoding, pagination, 401/403/429 classification, malformed data, unread error bodies and oversized success bodies.
- [ ] Verify RED.
- [ ] Implement the minimum adapter without BATCH_GET or retries.
- [ ] Verify focused and full GREEN.
- [ ] Perform scoped correctness/security review; fix Critical/Important findings through regression RED first.
- [ ] Commit verified M04.2 checkpoint.

### Task 3: Nested reply write flow

**Files:**

- Extend: `apps/server/src/engagement/linkedin-comments.ts`
- Create: `apps/server/src/engagement/engagement-service.ts`
- Test: `apps/server/test/engagement-service-comments.test.ts`
- Extend: `apps/server/test/linkedin-comments.test.ts`

**Interfaces:**

- `previewReply`, `approveReply`, `createReply`.
- Provider actor is derived only from authenticated subject.
- Reuse existing ApprovalService and IdempotencyLedger.

- [ ] Write RED tests for canonical preview, subject-bound approval, required `w_member_social_feed`, parent/root preservation, exact POST payload, durable replay and uncertain transport no-retry behavior.
- [ ] Verify intended RED.
- [ ] Implement minimal reply adapter/service path.
- [ ] Verify focused/full GREEN and cross-runtime duplicate protection.
- [ ] Scoped review and regression-fix any Critical/Important finding.
- [ ] Commit verified M04.3 checkpoint.

### Task 4: Reaction add/remove flow

**Files:**

- Create: `apps/server/src/engagement/linkedin-reactions.ts`
- Extend: `apps/server/src/engagement/engagement-service.ts`
- Test: `apps/server/test/linkedin-reactions.test.ts`
- Test: `apps/server/test/engagement-service-reactions.test.ts`

**Interfaces:**

- `previewReactionAdd`, `approveReactionAdd`, `addReaction`.
- `previewReactionRemove`, `approveReactionRemove`, `removeReaction`.
- Allowed types: LIKE, PRAISE, EMPATHY, INTEREST, APPRECIATION, ENTERTAINMENT.

- [ ] Write RED tests for official POST/DELETE contracts, exact actor derivation, enum validation, approval/idempotency, 201/204 success, errors and uncertain transport.
- [ ] Verify RED.
- [ ] Implement minimum adapter/service behavior.
- [ ] Verify focused/full GREEN and concurrency/replay safety.
- [ ] Scoped review; fix Critical/Important via RED first.
- [ ] Commit verified M04.4 checkpoint.

### Task 5: Explicit-thread unanswered inbox/context

**Files:**

- Create: `apps/server/src/engagement/comment-inbox.ts`
- Test: `apps/server/test/comment-inbox.test.ts`

**Interfaces:**

- Consume authenticated subject plus comment-list function and 1–20 explicit thread URNs.
- Produce unanswered top-level comments plus direct reply context; preserve explicit unavailable states.

- [ ] Write RED tests for answered/unanswered classification, member-authored reply detection, nested comments, restricted reads, 20-root bound, page/call ceilings and deterministic ordering.
- [ ] Verify RED.
- [ ] Implement minimum local derivation; no post discovery.
- [ ] Verify focused/full GREEN.
- [ ] Scoped review and checkpoint commit.

### Task 6: MCP and transport integration

**Files:**

- Create: `apps/server/src/engagement-mcp.ts`
- Modify: `apps/server/src/runtime.ts`
- Modify: shared server registration as required
- Test: `apps/server/test/mcp-engagement-contract.test.ts`
- Extend: `tests/contract/stdio-smoke.test.ts`
- Extend: `tests/contract/http-smoke.test.ts`

**Interfaces:**

- Register strict read/reply/reaction/inbox tools from the design.
- Preserve current M00–M03 tools unchanged.

- [ ] Write RED MCP tests asserting tool discovery, strict schemas, structured provider/access states and rejection of actor/token/read-gate/admin overrides.
- [ ] Verify RED.
- [ ] Wire shared runtime and tools.
- [ ] Verify focused contracts and real stdio/HTTP smoke tests, then full GREEN.
- [ ] Commit verified M04.6 checkpoint.

### Task 7: Whole-milestone closeout

**Files:**

- Update: `docs/milestones/M04-comments-engagement.md`
- Update: `docs/progress/project-state.json`
- Update: `docs/progress/STATUS.md`
- Update: `docs/progress/KNOWN-ISSUES.md`
- Update: `docs/requirements/TRACEABILITY.md`
- Update: `docs/product/CAPABILITY-MATRIX.md`
- Create: `docs/superpowers/evidence/2026-10-11-m04-comments-engagement.md`

- [ ] Perform skeptical correctness/security/provenance review across all M04 changes.
- [ ] Fix every Critical/Important finding through a regression RED→GREEN cycle.
- [ ] Verify exact-final-head frozen install, format, full tests, lint, typecheck and build.
- [ ] Reconcile durable evidence using observed SHAs/CI only; keep live access unverified unless legitimate evidence exists.
- [ ] Re-check PR head/main/reviews/threads/mergeability and squash-merge only under durable gates.
- [ ] Verify post-merge `main` CI before activating M05.

## Self-review

Spec coverage: all M04 ledger scope is assigned: read/get/list, reply, reactions, bounded unanswered inbox, contextual data, MCP integration and closeout. Broad feed discovery, organization engagement, mentions/images/edit/delete and browser fallback remain deliberately out of scope.

Type consistency: core canonical contracts feed both provider adapters and the service/MCP layer; all writes use existing approval/idempotency interfaces rather than a parallel store.

Review focus coverage: restricted reads (Tasks 1/2/5), malformed/oversized provider data (Task 2), concurrency/replay (Tasks 3/4), nested target integrity (Task 3), crawl bounds (Task 5).

# M02 Text Publishing Implementation Plan

> **For agentic workers:** use Superpowers executing/subagent development task-by-task with genuine TDD and exact-SHA CI.

**Goal:** Add approval-gated, idempotent, official-API text publishing for an authenticated LinkedIn member without duplicate retries or false verification claims.

**Architecture:** A local canonical preview builder and approval service feed a persistent idempotency ledger. A server-local text-post service obtains authenticated member credentials from the M01 boundary and calls an injected-fetch LinkedIn Posts adapter. Creation and downstream verification are separate states.

**Tech Stack:** Node.js 24, TypeScript 5.9, Zod v4, MCP TypeScript SDK, Vitest, pnpm 12.

**Spec:** `docs/superpowers/specs/2026-10-08-m02-text-publishing-design.md`

## Global Constraints

- Use `POST https://api.linkedin.com/rest/posts`; do not add a UGC API fallback.
- Require `w_member_social` before member publication.
- Never accept arbitrary author URNs from MCP callers; derive the member author from authenticated identity.
- Every publish requires an unexpired approval receipt bound to the exact canonical payload hash.
- Every publish requires a non-empty caller idempotency key.
- Same key + same successful payload returns the prior result without another POST.
- Same key + different payload is a conflict.
- Network/transport uncertainty after a request may have been sent becomes `outcome_unknown`; never automatically retry it.
- 201 without a valid `x-restli-id` is not a verified success.
- Downstream read verification is optional/access-dependent and may not be required for legitimate write-only access.
- No live LinkedIn write in CI.
- No media, organization publishing, scheduling, bulk posting, browser fallback or CAPTCHA/security bypass in M02.

## Review Focus

1. Approval receipt cannot authorize a changed payload, expired payload or second unrelated mutation.
2. Idempotency reservation survives process restart and prevents duplicate POST after successful mutation.
3. Uncertain transport failure cannot silently become retryable.
4. Author identity cannot be injected by caller.
5. Scope/access failures remain structured and secret-safe.
6. Post URN extraction and verification never fabricate success.
7. Provider/version headers and provenance remain explicit.

---

### Task 1: Activate M02 and define canonical text-post contracts

**Files:**

- Create: `packages/core/src/text-post.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/capabilities.ts`
- Test: `packages/core/test/text-post.test.ts`
- Modify durable M02 state files.

**Produces:** canonical text-post input/payload/hash types and M02 capability implementation state.

- [ ] RED tests define text validation, supported visibility, deterministic canonical payload/hash and caller-independent author handling.
- [ ] Verify exact-head RED fails for missing M02 contracts.
- [ ] Implement the minimum canonical builder/hash contract.
- [ ] Verify focused GREEN and full CI.
- [ ] Record RED/GREEN SHAs and advance durable state.

### Task 2: Approval receipt service

**Files:**

- Create: `apps/server/src/publishing/approval-service.ts`
- Test: `apps/server/test/approval-service.test.ts`

**Produces:** short-lived opaque single-use approval receipts bound to payload hash.

- [ ] RED covers random receipt IDs, exact-hash binding, expiry, missing/unknown receipt, single-use initiation and safe same-operation replay semantics.
- [ ] Implement injected clock/randomness and in-memory approval state for one local runtime.
- [ ] Verify focused GREEN and full suite.

### Task 3: Persistent idempotency ledger

**Files:**

- Create: `apps/server/src/publishing/idempotency-ledger.ts`
- Test: `apps/server/test/idempotency-ledger.test.ts`

**Produces:** atomic file-backed mutation records with `reserved/succeeded/failed_terminal/outcome_unknown` states.

- [ ] RED covers new reservation, same-key/same-hash replay, same-key/different-hash conflict, restart persistence, atomic writes, corrupt file fail-closed and terminal result replay.
- [ ] Implement narrow versioned JSON storage with restrictive permissions and atomic same-directory replacement.
- [ ] Verify focused GREEN and full suite.

### Task 4: Official LinkedIn Posts adapter

**Files:**

- Create: `apps/server/src/publishing/linkedin-posts.ts`
- Test: `apps/server/test/linkedin-posts.test.ts`
- Modify: `apps/server/src/config.ts`
- Test: `apps/server/test/config.test.ts`

**Produces:** injected-fetch create/get adapter with explicit API version configuration and sanitized provider errors.

- [ ] RED asserts exact POST URL, required headers, member text-only JSON body, 201/`x-restli-id`, malformed success, 401/403/429/5xx and transport failure classification.
- [ ] RED config tests require YYYYMM LinkedIn API version.
- [ ] Implement without retry loops and without exposing bearer tokens/provider raw bodies.
- [ ] Verify focused GREEN and full suite.

### Task 5: Text-post publish orchestration

**Files:**

- Create: `apps/server/src/publishing/text-post-service.ts`
- Test: `apps/server/test/text-post-service.test.ts`

**Consumes:** M01 AuthService, approval service, idempotency ledger, Posts adapter.

- [ ] RED covers disconnected/reauth states, missing `w_member_social`, approval mismatch/expiry, idempotency replay/conflict, one POST only, 401 auth transition, success persistence and `outcome_unknown`.
- [ ] Derive member author from authenticated identity.
- [ ] Persist reservation before POST and terminal/unknown state before return.
- [ ] Verify focused GREEN and full suite.

### Task 6: Downstream verification

**Files:**

- Modify: `apps/server/src/publishing/linkedin-posts.ts`
- Modify: `apps/server/src/publishing/text-post-service.ts`
- Test: corresponding provider/service tests.

**Produces:** `verified | created_unverified | verification_failed` separate from creation state.

- [ ] RED proves read verification occurs only when legitimate read capability is available.
- [ ] RED covers matching/mismatching author, commentary and lifecycle.
- [ ] Implement no-read-permission path as `created_unverified`, not failure.
- [ ] Verify focused GREEN and full suite.

### Task 7: MCP preview/approve/publish tools and real transports

**Files:**

- Modify: `apps/server/src/create-server.ts`
- Modify: `apps/server/src/stdio.ts`
- Modify: `apps/server/src/http.ts`
- Test: `apps/server/test/mcp-text-post-contract.test.ts`
- Test: `tests/contract/stdio-smoke.test.ts`
- Test: `tests/contract/http-smoke.test.ts`

**Produces:** `linkedin.post.preview.text`, `linkedin.post.approve.text`, `linkedin.post.create.text`.

- [ ] RED real-client tests prove discovery, strict schemas, local-only preview/approval, explicit OFFICIAL_API mutation provenance, no token leakage and approval-required behavior.
- [ ] Wire one publishing service through built stdio/HTTP entrypoints.
- [ ] Verify GREEN including real transport smokes.

### Task 8: Skeptical/security review and closeout

**Files:**

- Update M02 ledger, state, status, current milestone, traceability, capability matrix and known issues as evidence requires.
- Create: `docs/superpowers/evidence/2026-10-08-m02-text-publishing-closeout.md` only when evidence exists.

- [ ] Run full format/test/lint/typecheck/build.
- [ ] Review approval bypass, payload substitution, idempotency races/restart, uncertain outcome retry, auth/scope transition, provider-error leakage, author injection, false verification and transport compatibility.
- [ ] Critical/Important findings get genuine regression RED→GREEN cycles.
- [ ] Keep live write availability conservative unless an explicitly authorized real post is actually executed.
- [ ] Require exact-final-head green CI, zero unresolved Critical/Important findings, clean review threads, stable head and mergeability.
- [ ] Squash merge under repository policy, verify exact post-merge `main` CI, activate M03 and continue.

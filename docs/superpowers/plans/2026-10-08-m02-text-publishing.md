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
- Every new publish initiation requires an unexpired approval receipt bound to the exact canonical preview hash and authenticated subject; consumed receipts may only replay an existing operation.
- Every publish requires a non-empty caller idempotency key.
- Same key + same successful payload returns the prior result without another POST.
- Same raw key + different payload or authenticated member is a conflict; ledger `payloadHash` stores the author-inclusive mutation fingerprint.
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

**Produces:** injected-fetch create adapter with explicit API version configuration and sanitized provider errors. GET support belongs to Task 6.

- [ ] RED asserts exact POST URL, required headers, member text-only JSON body, 201/`x-restli-id`, malformed success, 401/403/429/5xx and transport failure classification.
- [ ] RED config tests require YYYYMM LinkedIn API version.
- [ ] Implement without retry loops and without exposing bearer tokens/provider raw bodies.
- [ ] Verify focused GREEN and full suite.

### Task 5: Text-post publish orchestration

**Files:**

- Create: `apps/server/src/publishing/text-post-service.ts`
- Modify: `apps/server/src/auth/auth-service.ts`
- Modify: `apps/server/src/publishing/idempotency-ledger.ts`
- Test: `apps/server/test/text-post-service.test.ts`
- Test: `apps/server/test/auth-provider-context.test.ts`
- Test: `apps/server/test/idempotency-ledger.test.ts`
- Test: existing AuthService tests if shared credential handling changes.

**Interfaces:**

- Consumes: canonical `createTextPostPreview`, `ApprovalService.consume`, `IdempotencyLedger.reserve/complete`, and `LinkedInPostsAdapter.createTextPost`.
- Produces: `createTextPostService({ auth, approvals, ledger, posts }).publish({ payload, approvalReceiptId, idempotencyKey })`.
- Adds internal `AuthService.getProviderContext(): Promise<{ accessToken: string; subject: string; scopes: string[] }>` and `markReauthRequired(expected?: { accessToken: string; subject: string }): Promise<void>`.
- Success: `{ state: 'succeeded', provider: 'OFFICIAL_API', postUrn: string, replay: boolean }`; errors are sanitized `TextPostServiceError` with `kind` and non-retryable policy.
- Ledger API remains `reserve/complete`; service passes the author-inclusive mutation fingerprint through their existing `payloadHash` field.

- [ ] Preserve RED evidence at `1917e72fa6b52606592926131ac6dcef1c4786d5` / CI `37764485697`; add regression RED coverage before source changes and record exact commands, output and failure reasons.
- [ ] RED covers existing gates plus payload hash mismatch/expiry/unknown/single-use, missing key, strict nested validation and caller mutation during asynchronous auth.
- [ ] RED proves same raw key/text under another member conflicts, restart replay needs fresh subject-bound approval, and consumed receipt after failed reservation cannot initiate a new POST.
- [ ] RED proves full-lifecycle shared-ledger serialization, exclusive file locking across separate instances/processes, fail-closed stale locks, and authoritative completion when requested success returns unknown/failure.
- [ ] RED covers context expiry/eligible refresh/missing-subject persistence failure, pending authorization, safe delayed credential invalidation, malformed 201/generic provider uncertainty and storage/auth cleanup failures without secret leakage.
- [ ] Validate and snapshot payload before async work; gate usable auth and granted `w_member_social` before consuming approval; derive author solely from that context.
- [ ] Compute preview hash for approval and SHA-256 of `JSON.stringify({ author, ...canonicalPayload })` for the ledger; preserve the raw caller key globally and fail closed on legacy fingerprint mismatch.
- [ ] Serialize the whole publish lifecycle through a shared WeakMap queue keyed by ledger object; add exclusive sibling lock-file protection around each ledger load/check/persist operation, with no automatic stale-lock stealing.
- [ ] Reserve before one provider POST; only approval status `initiated` may start a new reservation; replay terminal records without POST and conservatively terminalize orphaned reservations as unknown.
- [ ] Persist terminal/unknown state before return; use the record returned by `complete` as authoritative and never return fabricated success.
- [ ] Keep 401/403/409/429 terminal; transport/malformed-success/generic uncertain provider failures become non-retryable unknown; persistence failure after provider attempt preserves reservation and reports unknown.
- [ ] Verify focused GREEN, then format/full tests/lint/typecheck/build; record actual outputs and any remaining failure without weakening assertions.

Manual stale-lock recovery requires establishing that the previous owner stopped, then removing only its lock file. Never delete or reset mutation records to recover. No live LinkedIn writes, GET verification, MCP wiring, commits or pushes belong to this implementation handoff; the controller owns integration.

Task 5 checkpoint: local implementation, coverage and scoped review pass with 204 tests. Historical pre-implementation service RED is not fully satisfied: the original service suite could not collect, and some safety cases first ran GREEN. Do not mark that history as completed RED. The malformed-identifier and storage-sanitization fixes have observed regression RED→GREEN evidence. See `docs/superpowers/evidence/2026-10-08-m02-publish-orchestration.md`.

### Task 6: Downstream verification

**Files:**

- Modify: `apps/server/src/publishing/linkedin-posts.ts`
- Modify: `apps/server/src/publishing/text-post-service.ts`
- Modify: `apps/server/src/auth/linkedin-oauth.ts` only for malformed-present scope normalization.
- Test: `apps/server/test/linkedin-posts.test.ts`
- Test: `apps/server/test/text-post-service.test.ts`
- Test: `apps/server/test/linkedin-oauth.test.ts`
- Test: existing auth tests for normalized grant/omission behavior as needed.

**Interfaces:**

- Add required `LinkedInPostsAdapter.getTextPost({ accessToken: string, postUrn: string }): Promise<{ postUrn: string, author: string, commentary: string, lifecycleState: string }>`; update typed provider test fakes intentionally.
- Add trusted optional service dependency `memberPostReadEnabled?: boolean`, default false; require it plus normalized granted `r_member_social` before GET. This is never a caller/tool input.
- Preserve Task 5 outer successful fields; intentionally add required `verification` union: `verified`; `created_unverified` with reason `read_permission_unavailable`; or `verification_failed` with allowlisted reason `post_mismatch | reauth_required | read_not_found | rate_limited | malformed_response | provider_failure`.
- No credential/core/store schema expansion, new proof field, verification persistence or constructed post URL.

- [ ] Recover actual Task 5 final head/interfaces, read `/tmp/linkedin-m02-sdd/task-6-brief.md`, and record genuine RED before implementation; do not weaken mutation safety assertions.
- [ ] RED adapter tests assert one encoded official GET, version/Rest.li/auth headers, no body/local controls/token in URL, strict successful normalization and sanitized 401/403/404/429/5xx/transport/malformed response handling.
- [ ] RED proves the capability flag defaults false; write/openid/profile/configuration hints never enable read; enabled legitimate capability plus normalized `r_member_social` is required.
- [ ] RED distinguishes legitimate omitted OAuth scope from explicitly present empty/whitespace/non-string scope; preserve RFC 6749 omission fallback and reject malformed-present scope without credential migration.
- [ ] RED proves authoritative mutation persistence precedes GET and exact ID/author/commentary/lifecycle comparisons; each mismatch is verification failure with creation still succeeded.
- [ ] RED covers 403 as created_unverified, 401 expected-context invalidation and failed cleanup without creation failure, and 404/429/5xx/network/invalid JSON as allowlisted nested verification failures without another POST.
- [ ] RED proves successful restart/idempotency replay performs no POST/complete and at most one fresh gated GET; unknown/reserved/terminal-failed/member-conflicting records never GET.
- [ ] Extend adapter with one injected-fetch GET; parse only required successful fields, never non-200 bodies; no retry loop.
- [ ] Verify only authoritative succeeded records using the owned canonical snapshot/auth context; keep verification invocation-specific, leave mutation ledger unchanged and retain the existing shared-ledger queue.
- [ ] Verify focused GREEN and full format/test/lint/typecheck/build, recording exact command results and any remaining limitation.

Controller owns integration/configuration policy. Task 7 may wire the trusted member-read capability option only when legitimate account product access is configured; its default remains false. Ordinary CI uses injected responses and never performs live LinkedIn reads or writes. Complete execution evidence belongs in `/tmp/linkedin-m02-sdd/task-6-report.md` when dispatched.

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

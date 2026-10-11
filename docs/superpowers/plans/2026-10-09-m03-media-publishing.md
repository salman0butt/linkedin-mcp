# M03 Media Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe approval-gated single-image and multi-image member publishing through LinkedIn's official Images and Posts APIs.

**Architecture:** Keep preview/approval local, validate files from a dedicated configured media root, durably checkpoint official image URNs through a backward-compatible transaction ledger, then create exactly one Posts API mutation. Reuse M02 auth/approval/idempotency/provenance patterns and keep image/post read verification access-aware.

**Tech Stack:** Node.js 24, TypeScript 5.9, MCP SDK 2.0, Zod 4.2, Vitest 4, Node built-ins, LinkedIn versioned REST adapters. No new runtime image-processing dependency.

**Spec:** `docs/superpowers/specs/2026-10-09-m03-media-publishing-design.md`

## Global Constraints

- Official API only for M03 remote operations; no browser or external-discovery fallback.
- `post.create.image` and `post.create.multi_image` remain live-unverified until legitimate provider evidence exists.
- Media files are relative to `LINKEDIN_MCP_MEDIA_ROOT`; absolute/traversal/symlink escapes fail closed.
- Default local file bound is 20 MiB; configurable only from 1 MiB through 50 MiB and never represented as LinkedIn's provider limit.
- Supported formats are JPEG, PNG and GIF; pixel count must be less than 36,152,320 and GIFs may have at most 250 frames.
- Every image requires alt text from 1 through 4,086 characters; over 120 characters is a warning, not a failure.
- Multi-image content contains 2 through 20 ordered images.
- Source paths, bytes, upload URLs, tokens, approval receipt IDs and raw idempotency keys never enter results/audit/persisted media checkpoints.
- Ordinary CI uses injected providers and synthetic fixtures; it must never perform a live LinkedIn upload/post.
- Meaningful behavior follows observed RED -> minimum GREEN -> REFACTOR with exact-SHA CI evidence.

## Review Focus

- File replacement or symlink escape between preview and create must invalidate/reject rather than upload unintended bytes; Task 2 and Task 6 own regression coverage.
- Restart/concurrent workers after one or more uploads must reuse known image URNs without duplicate upload/post mutation; Task 4 and Task 6 own coverage.
- Write-only `w_member_social` with forbidden image GET must not be mislabeled as processing failure or live verification; Task 5 owns coverage.
- Transport uncertainty after an upload/post may have been accepted must never trigger an automatic duplicate mutation; Tasks 3, 4 and 6 own coverage.
- Strict MCP schemas must reject caller-controlled author/provider/admin fields and never echo filesystem/provider secrets; Task 7 owns coverage.

---

### Task 1: Activate M03 and define canonical media-post contracts

**Files:**

- Create: `packages/core/src/media-post.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/capabilities.ts`
- Create: `tests/core/media-post.test.ts`
- Modify: `docs/milestones/M03-media-publishing.md`
- Modify: `docs/milestones/CURRENT.md`
- Modify: `docs/progress/project-state.json`
- Modify: `docs/progress/STATUS.md`
- Modify: `docs/product/CAPABILITY-MATRIX.md`
- Modify: `docs/requirements/TRACEABILITY.md`

**Interfaces:**

- Produces: `SupportedImageMime`, `CanonicalImageDescriptor`, `ImagePostPayload`, `MultiImagePostPayload`, `createImagePostPreviewFromDescriptors(...)`, `createMultiImagePostPreviewFromDescriptors(...)`.
- Consumes: existing text-post visibility/distribution conventions.

- [ ] **Step 1: Write the failing contract tests**

Assert single-image canonicalization, multi-image ordering, 2/20 boundaries, 21 rejection, required alt text, 4,086 maximum, >120 warning, unsupported keys, provider `OFFICIAL_API`, required scope `w_member_social`, stable canonical JSON/hash, and separate image/multi-image capability states.

- [ ] **Step 2: Push RED and verify exact-head CI failure**

Expected: existing tests remain green; new media contract suite fails because `media-post.ts`/exports are absent.

- [ ] **Step 3: Implement minimum canonical contract code**

`createImagePostPreviewFromDescriptors` and `createMultiImagePostPreviewFromDescriptors` accept already validated descriptors; they do not read filesystem or contact LinkedIn. Hash ordered canonical JSON with SHA-256 and carry warnings separately.

- [ ] **Step 4: Verify focused and full GREEN**

Run through exact-head Actions: frozen install, format, tests, lint, typecheck, build all pass.

- [ ] **Step 5: Commit durable M03.1 evidence/state**

Record exact RED/GREEN SHAs and CI run IDs without claiming live availability.

### Task 2: Add media-root configuration and bounded local image reader

**Files:**

- Create: `apps/server/src/publishing/media-file.ts`
- Modify: `apps/server/src/config.ts`
- Modify: `.env.example`
- Create: `apps/server/test/media-file.test.ts`
- Modify: `apps/server/test/config.test.ts`

**Interfaces:**

- Consumes: `SupportedImageMime` from Task 1.
- Produces: `MediaFileReader.read(relativePath): Promise<ValidatedMediaFile>` where `ValidatedMediaFile` carries safe name, exact bytes, digest, MIME, size, dimensions and optional GIF frame count.

- [ ] **Step 1: Write RED tests for config and file safety**

Cover missing root, non-absolute configured root, 1/50 MiB bounds, secret-store/ledger nested inside media root, absolute input path, `..`, NUL, missing/non-regular file, final symlink and symlink escape, file over limit, and safe nested regular file.

- [ ] **Step 2: Write RED format parser fixtures**

Use tiny synthetic JPEG/PNG/GIF bytes. Assert magic-byte identification independent of extension, dimensions, pixel ceiling, malformed/truncated inputs, zero dimensions and GIF >250 frames.

- [ ] **Step 3: Push RED and verify intended failures**

Expected: failures are missing media configuration/reader behavior, not unrelated infrastructure.

- [ ] **Step 4: Implement configuration and bounded reader**

Use Node filesystem/path/crypto only. `realpath` root/candidate, containment check, regular-file check, bounded read, deterministic header parsing and SHA-256. Do not parse EXIF or transform bytes.

- [ ] **Step 5: Verify GREEN and refactor parser helpers**

Focused tests plus full quality gate must pass.

### Task 3: Implement official LinkedIn Images adapter

**Files:**

- Create: `apps/server/src/publishing/linkedin-images.ts`
- Create: `apps/server/test/linkedin-images.test.ts`

**Interfaces:**

- Produces: `LinkedInImagesClient.initializeUpload`, `.upload`, `.getStatus` and `LinkedInImagesError` taxonomy.
- Consumes: explicit API version, access token, authenticated person URN, validated bytes/MIME.

- [ ] **Step 1: Write adapter RED tests**

Assert exact initialize endpoint/body/headers, valid `urn:li:image:*`, HTTPS LinkedIn-controlled upload host, no redirects to arbitrary hosts, PUT of exact bytes, version/Rest.li headers where required, GET status mapping, malformed success rejection, 401/403/429/5xx taxonomy, transport uncertainty, and no raw body/token/upload URL in errors.

- [ ] **Step 2: Push RED and verify it fails because adapter is absent**

- [ ] **Step 3: Implement minimum fetch-based adapter**

Never log/return upload URL outside adapter. Disable automatic retry. Use bounded provider-response parsing.

- [ ] **Step 4: Verify GREEN and security-review URL handling**

Ensure bearer tokens only enter headers and redirects cannot exfiltrate them.

### Task 4: Upgrade durable ledger for media checkpoints

**Files:**

- Modify: `apps/server/src/publishing/idempotency-ledger.ts`
- Modify: `apps/server/test/idempotency-ledger.test.ts`

**Interfaces:**

- Produces backward-compatible persisted schema v2 with optional media checkpoints and methods `checkpointMedia(...)` plus existing `reserve/complete` semantics.
- Consumes existing exclusive file-lock and atomic-write machinery.

- [ ] **Step 1: Write RED migration/checkpoint tests**

Assert v1 M02 records parse unchanged, v2 checkpoint round-trip, ordered digest-to-image-URN binding, no path/bytes/alt text persistence, conflict detection, cross-process lock safety, corrupt v2 fail-closed, restart replay, and terminal-state immutability.

- [ ] **Step 2: Write uncertainty RED tests**

Assert known image URNs survive unknown upload/post outcome and a replay never allocates a new image for a checkpointed digest.

- [ ] **Step 3: Push RED and verify intended ledger failures**

- [ ] **Step 4: Implement versioned migration and checkpoint API**

Preserve v1 semantics and write canonical v2 on the next mutation. Do not silently discard unknown fields.

- [ ] **Step 5: Verify GREEN with existing M02 regression suite**

All text publishing replay/concurrency behavior must remain unchanged.

### Task 5: Add bounded image processing verification policy

**Files:**

- Create: `apps/server/src/publishing/media-verification.ts`
- Create: `apps/server/test/media-verification.test.ts`
- Modify: `apps/server/src/config.ts`
- Modify: `.env.example`

**Interfaces:**

- Produces: `verifyImageProcessing(...)` returning `available | processing_failed | pending | verification_unavailable`.
- Consumes: `LinkedInImagesClient.getStatus`, trusted read-enabled configuration and auth scope/access outcome.

- [ ] **Step 1: Write RED tests**

Cover disabled reads, AVAILABLE, PROCESSING_FAILED, WAITING/PROCESSING then AVAILABLE, six-attempt/10-second bound, timeout pending, legitimate 403 restricted => verification unavailable, 401 reauth classification, 429/provider/transient failure, and no busy loop below 1-second interval.

- [ ] **Step 2: Push RED and verify intended failure**

- [ ] **Step 3: Implement injectable-clock/sleeper verifier**

No background polling after tool return. Never convert inability to GET into fabricated AVAILABLE/FAILED processing state.

- [ ] **Step 4: Verify GREEN and review write-only member path**

### Task 6: Orchestrate approval-gated single and multi-image publication

**Files:**

- Create: `apps/server/src/publishing/media-post-service.ts`
- Modify: `apps/server/src/publishing/linkedin-posts.ts`
- Create: `apps/server/test/media-post-service.test.ts`
- Modify: `apps/server/test/linkedin-posts.test.ts`

**Interfaces:**

- Produces: `MediaPostService.previewImage`, `.previewMultiImage`, `.approve`, `.createImage`, `.createMultiImage` plus typed structured outcomes.
- Consumes: auth provider context, ApprovalService, MediaFileReader, LinkedInImagesClient, verification policy, upgraded ledger and existing Posts client.

- [ ] **Step 1: Write orchestration RED tests**

Cover missing auth/scope, approval missing/expired/wrong subject, file bytes changed after approval, ordered multi-image changes, idempotency conflict, checkpoint reuse after restart, single/multi post mapping, 2–20 boundary, alt text propagation, upload terminal failure, upload uncertainty, processing failure/pending/unavailable, 401 credential invalidation, successful replay and exactly one Posts POST.

- [ ] **Step 2: Push RED and confirm failures represent missing orchestration**

- [ ] **Step 3: Extend Posts adapter payload union**

Add explicit image/multi-image content types without weakening text-post assertions or allowing caller author.

- [ ] **Step 4: Implement minimum service transaction**

Re-read/re-hash files before approval consumption/reservation. Checkpoint each known image URN before the next remote step. Never auto-retry an uncertain remote mutation.

- [ ] **Step 5: Verify GREEN, then refactor shared text/media result mapping only if behavior remains identical**

### Task 7: Wire strict MCP tools and shared runtime

**Files:**

- Modify: `apps/server/src/create-server.ts`
- Modify: `apps/server/src/runtime.ts`
- Modify: `apps/server/src/stdio.ts`
- Modify: `apps/server/src/http.ts`
- Create: `apps/server/test/mcp-media-post-contract.test.ts`
- Modify: `apps/server/test/real-stdio-smoke.test.ts`
- Modify: `apps/server/test/real-http-smoke.test.ts`
- Modify: `README.md`

**Interfaces:**

- Produces six M03 MCP tools using one shared media runtime across stdio/HTTP connections.
- Consumes Task 6 `MediaPostService`.

- [ ] **Step 1: Write MCP/transport RED tests**

Assert tool discovery, strict schemas, rejection of unknown `author`, token, absolute/admin path/read-control fields, safe preview/approval/create output envelopes, no filesystem paths/upload URLs in JSON, shared approval/idempotency state and structured not-configured behavior.

- [ ] **Step 2: Push RED and verify intended failures**

- [ ] **Step 3: Wire runtime/configuration and tools**

Keep M00/M01/M02 discovery usable when M03 media root is absent. stdout remains protocol-only.

- [ ] **Step 4: Verify real stdio/HTTP GREEN plus full suite**

### Task 8: Whole-milestone review, durable closeout and merge gates

**Files:**

- Modify: `docs/progress/project-state.json`
- Modify: `docs/progress/STATUS.md`
- Modify: `docs/progress/KNOWN-ISSUES.md`
- Modify: `docs/milestones/CURRENT.md`
- Modify: `docs/milestones/M03-media-publishing.md`
- Modify: `docs/product/CAPABILITY-MATRIX.md`
- Modify: `docs/requirements/TRACEABILITY.md`
- Create: `docs/superpowers/evidence/2026-10-09-m03-media-publishing.md`
- Modify: PR #4 body/review state as appropriate

**Interfaces:**

- Consumes all M03 evidence.
- Produces durable recovery state and merge decision.

- [ ] **Step 1: Run skeptical/security review**

Review path containment/TOCTOU, parser bounds, upload-host/token leakage, checkpoint migration/concurrency, approval/file-change binding, uncertain outcomes, strict MCP schemas, provenance, optional read verification and regressions to M02.

- [ ] **Step 2: Fix every Critical/Important finding with regression RED->GREEN**

- [ ] **Step 3: Run exact-final-head quality gate**

Required: frozen install, format, all tests, lint, typecheck and build green on the exact final PR SHA.

- [ ] **Step 4: Reconcile durable docs and traceability**

M03 implementation can become deterministically verified only without claiming legitimate live LinkedIn account availability.

- [ ] **Step 5: Re-check remote heads, reviews/threads and mergeability**

- [ ] **Step 6: Squash-merge only if every repository gate passes**

- [ ] **Step 7: Verify post-merge `main` CI before activating M04**

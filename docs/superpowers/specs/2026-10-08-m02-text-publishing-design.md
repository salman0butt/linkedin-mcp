# LinkedIn MCP — M02 Text Publishing Design

Date: 2026-10-08
Status: DESIGN — APPROVED UNDER STANDING OWNER AUTHORIZATION

## 1. Goal

Add safe authenticated-member text publishing through LinkedIn's official Posts API while making approval, payload identity, idempotency, verification and provider-access limits explicit.

M02 must make a consequential LinkedIn write impossible to perform accidentally or twice through ordinary retry behavior.

## 2. Product intent

A local MCP user should be able to prepare a text post, inspect exactly what will be sent, approve that immutable payload, publish it once, and receive a structured result containing the created LinkedIn post identifier plus verification state.

Success means:

- drafting and preview are local-only and never publish;
- publishing requires an explicit approval artifact bound to the exact payload;
- the same idempotency key cannot create a second LinkedIn post;
- the provider is always `OFFICIAL_API`;
- member publishing is attempted only when authenticated access includes the required write permission;
- provider failures and uncertain outcomes never become fake success;
- post-creation verification is explicit and conservative when read permission is unavailable.

## 3. Provider facts and access constraints

Current LinkedIn documentation establishes:

1. The Posts API is the current API for creating organic posts and replaces the older UGC Posts API for this use.
2. Text-only creation uses `POST https://api.linkedin.com/rest/posts`.
3. Requests require `X-Restli-Protocol-Version: 2.0.0` and a versioned `Linkedin-Version` header.
4. `w_member_social` is the member-write permission for posting on behalf of the authenticated member.
5. Successful creation returns HTTP 201 and the created post URN in the `x-restli-id` response header.
6. `PUBLISHED` is the accepted creation lifecycle state.
7. Reading posts can require additional permission; deterministic creation tests must not imply that downstream live GET verification is universally available.

Primary references:

- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/post-api-schema
- https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin

## 4. Approaches considered

### A. Direct `linkedin.post.create.text` mutation

Smallest API surface, but too easy for an agent retry or prompt mistake to create a duplicate or unreviewed public post.

### B. Server-side mutable draft records

Supports richer workflows but introduces persistence/lifecycle complexity before scheduling or multi-account work needs it.

### C. Stateless canonical preview + approval receipt + idempotency ledger — selected

Create a canonical local payload and hash, issue a bounded approval receipt tied to that hash, then require the receipt plus an idempotency key at publish time. Persist only the mutation/idempotency record needed to prevent duplicate execution and recover uncertain outcomes.

This gives M02 strong safety without building the later scheduling/content-management subsystem early.

## 5. Architecture

```text
MCP tool
  -> text-post service
     -> canonical draft/preview builder (LOCAL_ONLY)
     -> approval receipt service (LOCAL_ONLY)
     -> idempotency ledger (LOCAL_ONLY)
     -> AuthService credential boundary
     -> LinkedIn Posts provider (OFFICIAL_API)
     -> optional post verification
  -> ToolResult with provider + audit metadata
```

The provider never receives approval tokens, idempotency metadata, encryption keys or other local control-plane values.

## 6. Public MCP surface

### `linkedin.post.preview.text`

Input:

- `text`: non-empty post commentary;
- optional `visibility`, initially bounded to supported member-post visibility values;
- optional `disableReshare`, default false.

Output:

- canonical preview;
- deterministic payload hash;
- provider target `OFFICIAL_API`;
- required permission `w_member_social`;
- no mutation.

### `linkedin.post.approve.text`

Input:

- exact preview payload/hash.

Output:

- opaque approval receipt;
- payload hash;
- bounded expiry;
- `LOCAL_ONLY` provenance.

Approval is not publication and has no LinkedIn side effect.

### `linkedin.post.create.text`

Input:

- canonical payload;
- approval receipt;
- caller-supplied idempotency key.

Behavior:

1. validate the complete canonical payload and take an owned snapshot before any asynchronous gate;
2. validate authenticated usable credential context and `w_member_social`, then consume the receipt bound to the preview hash and authenticated subject;
3. reserve idempotency key before remote mutation;
4. perform exactly one official Posts API create attempt;
5. capture HTTP outcome and `x-restli-id` when present;
6. persist terminal or uncertain mutation state before returning;
7. optionally verify created post when legitimate read access exists;
8. return structured status and audit metadata without tokens.

## 7. Canonical payload

M02 text-only member payload is intentionally narrow:

- author is derived from authenticated identity, never accepted as arbitrary input;
- commentary comes from approved text;
- visibility is explicit;
- distribution is the ordinary main feed;
- lifecycle state is `PUBLISHED`;
- reshare-disable flag is explicit/default false;
- no media/content block.

Canonical JSON serialization is stable and hashed with SHA-256. Approval receipts bind to this author-independent preview hash plus the authenticated subject. Idempotency records bind to the distinct member-bound mutation fingerprint defined below.

## 8. Approval model

Approval receipts are cryptographically random opaque identifiers stored server-side with:

- payload hash;
- creation/expiry time;
- consumed state.

Receipts are bound to the authenticated member subject and single-use for initiating a mutation. Reusing a consumed receipt with the same idempotency key may replay an already initiated operation, even after receipt expiry; reusing it with a different key is rejected. A consumed receipt must never initiate a newly reserved operation, including after an earlier reservation write failed. A fresh reservation requires an unexpired receipt whose consumption status is `initiated`.

The approval lifetime is short and bounded. Raw payload text is not embedded in the receipt.

## 9. Idempotency and uncertain outcomes

The local idempotency ledger records:

- idempotency key;
- payload hash;
- state: `reserved | succeeded | failed_terminal | outcome_unknown`;
- created post URN when known;
- sanitized provider classification/error metadata;
- timestamps.

Rules:

- same key + same payload after success returns the prior result without a second POST;
- same key + different payload is a conflict;
- a network failure after the request may have reached LinkedIn becomes `outcome_unknown`, not retryable success/failure;
- automatic retry is forbidden for `outcome_unknown`;
- only failures proven to occur before a remote mutation may release/reserve safely for another explicit attempt.

### Task 5 approved safety decisions

Approval identity and mutation identity are distinct. Approval receipts bind to the canonical author-independent preview payload hash and the authenticated member subject. The idempotency ledger binds each raw caller idempotency key to a SHA-256 mutation fingerprint of the canonical provider request including the authenticated member author. Compute this fingerprint from `JSON.stringify({ author: authenticatedMemberAuthor, ...canonicalPayload })`, using the owned canonical payload with its established field order. The ledger's existing `payloadHash` field stores this member-bound mutation fingerprint. Same key with a different payload or authenticated member is a conflict. Raw keys remain global rather than member-namespaced. Legacy author-independent records fail closed through fingerprint mismatch and are never discarded automatically.

Publishing serializes the complete auth/approval/reservation/provider/completion lifecycle for all services sharing one ledger object, using a shared process-local queue keyed by that ledger object. The file ledger additionally holds an exclusive sibling lock file around each complete load/check/persist operation in `reserve` and `complete`, preventing separate ledger instances/processes from both returning a new reservation. Lock creation uses exclusive creation and restrictive permissions. Existing or stale locks fail closed; automatic timeout-based lock stealing is forbidden. Manual recovery must establish that the prior owner stopped and must preserve all mutation records. No orchestration-lock API or lease framework is introduced.

Another process may conservatively convert a replayed reservation to `outcome_unknown`; it cannot issue another POST. The record returned by terminal completion is authoritative. A requested success may be returned as success only when the persisted record is `succeeded` with a valid post identifier. Existing `outcome_unknown` or terminal failure records never become a fabricated success.

The service validates the entire payload and creates an owned canonical snapshot before its first asynchronous gate. The approved hash, mutation fingerprint and provider request must all derive from this snapshot, preventing later caller mutation from changing approved content.

The AuthService exposes internal `getProviderContext()` returning one usable access-token/subject/granted-scope snapshot and `markReauthRequired()` for provider rejection. These internal credentials never enter status, MCP output, logs, receipts or ledger metadata. Missing subjects are resolved through official identity and persisted before context return; expiry/refresh remains within the M01 credential boundary. A delayed rejection must not clear a newer replacement credential; invalidation accepts the expected rejected context internally.

Known 401/403/409/429 provider rejections are terminal and non-retryable for the reserved key. Transport uncertainty, malformed 201 success, generic provider failure without proof of non-acceptance, and unexpected exceptions after the provider attempt become `outcome_unknown`. Failure to persist after a provider attempt also returns non-retryable `outcome_unknown` and preserves the durable reservation. No automatic retry or record deletion occurs.

Approval state remains in memory. Restart replay therefore requires a fresh approval bound to the same canonical payload and authenticated subject. An existing ledger record does not bypass approval, and fresh approval cannot cause another POST for an existing key.

## 10. Official Posts provider

Create an injected-fetch provider adapter for text-only member posts.

Request:

- `POST https://api.linkedin.com/rest/posts`;
- bearer token only in Authorization header;
- `X-Restli-Protocol-Version: 2.0.0`;
- configured `Linkedin-Version` in YYYYMM form;
- JSON body matching the canonical post payload.

Response handling:

- 201 + valid `x-restli-id` -> creation accepted;
- 401 -> transition auth state to reauthorization-required;
- 403 -> permission/access required;
- 409/duplicate-like provider response -> structured conflict/duplicate where evidence supports it;
- 429 -> rate limited;
- 5xx/network -> failed or outcome_unknown according to whether remote acceptance can be ruled out;
- provider bodies are sanitized and never allowed to echo secrets.

## 11. Verification

Creation success requires a returned post URN and authoritative durable `succeeded` mutation state. Downstream GET verification occurs only when trusted service dependencies explicitly set `memberPostReadEnabled: true` and the normalized authenticated credential scopes include `r_member_social`. The optional capability flag defaults false and represents legitimately configured member-read product access; it is never a tool input. Do not infer read access from `w_member_social`, `openid`, profile availability, static capability state or arbitrary requested configuration scopes.

A successful official OAuth token response can legitimately omit scope when it is identical to the authorized request (RFC 6749 section 5.1); unchanged refresh scope may likewise be omitted (section 6). Preserve these established omission fallbacks. Reject explicitly present non-string, empty or whitespace-only token scope as a sanitized malformed provider response rather than treating it as omission. No `grantedScopes` field or credential migration is introduced.

Extend the official Posts adapter with `getTextPost({ accessToken, postUrn })`, returning only `{ postUrn, author, commentary, lifecycleState }` from a correctly shaped HTTP 200 object. GET targets `https://api.linkedin.com/rest/posts/${encodeURIComponent(postUrn)}` with the existing explicit version/Rest.li headers and bearer token only in Authorization. Perform at most one GET; validate input, parse only required successful fields and never read non-200 error bodies. Preserve provider error sanitization and add `not_found`/`malformed_response` read classifications as needed.

Task 6 intentionally extends the Task 5 successful result with a required nested `verification` field while preserving outer `{ state: 'succeeded', provider: 'OFFICIAL_API', postUrn, replay }`:

- `{ state: 'verified' }`: this invocation's GET confirms matching post identifier, authenticated author, exact approved commentary and `PUBLISHED` lifecycle;
- `{ state: 'created_unverified', reason: 'read_permission_unavailable' }`: the capability flag is disabled, read scope is unavailable, or GET returns 403;
- `{ state: 'verification_failed', reason }`: reason is one of `post_mismatch`, `reauth_required`, `read_not_found`, `rate_limited`, `malformed_response` or `provider_failure`.

Creation state and verification state remain separate. Persist mutation success before GET. Missing read permission, mismatches, read failures or failed auth cleanup never downgrade the successful mutation, reopen/delete records or retry POST. A GET 401 attempts expected-context credential invalidation but still returns successful creation with verification failure. A GET 404 may mean delayed visibility and does not establish publication failure. Comparison is exact; no trimming, identity inference or missing-field confirmation.

Successful idempotency replay may perform one fresh gated GET with the already bound canonical payload and current legitimate auth context, but performs no POST or ledger completion. Verification is invocation-specific and is not persisted in the mutation ledger; no stale confirmation is claimed. Reserved, unknown and terminal-failed operations never trigger GET. Existing approval/member-binding policy remains in force, including fresh subject-bound approval after restart. The existing shared-ledger queue includes the single GET; file locks remain limited to ledger operations.

No post URL is constructed or represented as verified. Read confirmation does not upgrade live capability availability without legitimate live evidence. M02 must not require restricted read permission to use legitimate member publishing.

## 12. Configuration

Add non-secret Posts API configuration:

- `LINKEDIN_MCP_API_VERSION` in YYYYMM format;
- bounded approval TTL;
- idempotency-ledger path when file persistence is selected.

Existing M01 credential encryption/token handling remains the only credential boundary.

## 13. Capability truth

`post.create.text` remains `OFFICIAL_API`.

Static capability state progresses from `PLANNED` to `ACTIVE` when implementation lands. It becomes `VERIFIED` only for deterministic implementation semantics unless a live configured member post is deliberately executed with owner authorization and legitimate access.

Ordinary CI must never create a real LinkedIn post.

## 14. Security and privacy

- publishing always requires explicit approval;
- approval binds to exact payload hash and expires;
- idempotency key prevents ordinary duplicate retry;
- author comes from authenticated identity, not caller-controlled URN;
- tokens never enter MCP output, logs, approval receipts or ledger metadata;
- no automatic retry after uncertain remote acceptance;
- no bulk publishing;
- no organization publishing in M02;
- no browser fallback;
- no CAPTCHA/security-challenge interaction.

## 15. Testing strategy

Use genuine RED→GREEN→REFACTOR for:

1. canonical preview/hash;
2. approval receipt binding/expiry/single-use semantics;
3. persistent idempotency ledger and payload conflicts;
4. official Posts provider request/response/error classification;
5. publish orchestration, auth/scope gate and uncertain outcomes;
6. MCP contracts and real stdio/HTTP discovery;
7. capability projection.

Provider HTTP is deterministic through injected fetch. Real LinkedIn writes are excluded from CI.

## 16. Milestone closeout

M02 closes only when:

- all acceptance criteria are covered;
- exact-final-head format/test/lint/typecheck/build are green;
- skeptical/security review has zero unresolved Critical/Important findings;
- approval/idempotency/outcome-unknown boundaries are verified;
- traceability/capability/durable state are current;
- PR is mergeable with no blocking threads/concurrent work;
- post-merge `main` CI is green.

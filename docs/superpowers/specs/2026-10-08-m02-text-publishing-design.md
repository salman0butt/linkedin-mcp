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
- publication uses `OFFICIAL_API`; local preview and approval use `LOCAL_ONLY` provenance;
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

## 6. Public MCP surface — Task 7 contracts

Always discover all three M02 tools, including unconfigured/bare construction. Discovery is not live availability. Bare server lists three M00 plus three M02 tools; built runtimes with AuthService list ten including four M01 tools. Every outer input and canonical payload/distribution object rejects unknown keys. Caller author/subject/credentials/provider/read flag/version/path/TTL are prohibited.

### `linkedin.post.preview.text`

Input exactly `{ text: string, visibility?: 'PUBLIC' | 'CONNECTIONS', disableReshare?: boolean }`; nonblank text <=3000 characters; core PUBLIC/false defaults. Call only the local canonical builder: no auth, approval issuance/consumption, ledger, provider, network or persistent files. Return succeeded with outer LOCAL_ONLY/linkedin-mcp and exact core preview data `{ payload, canonicalJson, payloadHash, provider: 'OFFICIAL_API', requiredScope: 'w_member_social' }`. Target provenance does not describe an actual network request.

### `linkedin.post.approve.text`

Input exactly `{ payload: CanonicalTextPostPayload, payloadHash: lowercase64Hex, approved: true }`. Rebuild/hash canonical content before issuance; reject mismatch. The true literal is explicit caller approval intent, not proof of an independently identified human.

Use only local `AuthService.getStatus()`: require connected state, nonblank persisted subject and `w_member_social`. Pending authorization maps human_action_required; unavailable auth/subject/scope maps permission_required; local status error maps failed. Do not call provider context/profile/refresh/identity/OAuth/Posts to issue approval or repair missing subject. Issue the runtime's shared receipt against recomputed preview hash and persisted subject. Return succeeded with outer LOCAL_ONLY/linkedin-mcp and `{ receiptId, payloadHash, expiresAt, provider: 'LOCAL_ONLY' }`. Preview never issues; approval never consumes/reserves/publishes/verifies; publish never auto-approves.

### `linkedin.post.create.text`

Strict root input `{ payload: CanonicalTextPostPayload, approvalReceiptId?: unknown, idempotencyKey: nonblank string }`. The optional unknown receipt is a deliberate narrow registration-schema exception enabling structured requires_approval for missing/malformed receipts instead of only SDK validation errors. Before any dependencies require a nonblank string, else return static approval_required/retryable false. Never coerce/echo invalid receipt values. Payload/key types and all unknown root/nested keys still receive normal strict MCP input errors.

Delegate valid inputs only to the shared Task 6 service; no adapter-side receipt consumption, ledger/provider access or retries. Preserve its payload snapshot, usable-auth/write-scope gates, subject/hash-bound approval, durable member-bound reservation, single POST, authoritative completion and optional legitimate GET. Missing publisher configuration yields safe permission_required/publishing_not_configured without direct-provider fallback.

### Result, audit and runtime contracts

Text JSON and structuredContent contain the same precise result envelope. Preview/approval and their local failures use LOCAL_ONLY/linkedin-mcp; publish/domain failures use OFFICIAL_API/LinkedIn. Success preserves all Task 6 data/verification/replay, envelope succeeded, and static read-unavailable/read-failed warnings when needed; no constructed post URL or duplicate error for successful replay. Reuse Task 5's validated numeric share/ugcPost identifier helper.

Missing/malformed/not-found/expired/mismatched/consumed approval maps requires_approval; auth/write/config failures map permission_required; rate limit maps rate_limited; invalid payload/idempotency conflict/provider conflict/storage failure maps failed. Mutation uncertainty maps partial with data `{ state: 'outcome_unknown' }`, static error outcome_unknown/retryable false; never flatten it into success/generic failure or infer a duplicate post from ambiguous conflict. Unexpected errors use safe allowlisted messages.

Preserve requestId/timestamp and add bounded M02-only metadata audit `{ operation: 'post.preview.text' | 'post.approve.text' | 'post.create.text', payloadHash?: lowercase64Hex, replay?: boolean }`. Hash is validated preview hash, replay only from successful service return. Receipt/raw key/credential/author/contact/profile/commentary/private provider or storage details/administrative paths never enter audit/logs/errors. Explicit preview text and intentional receipt data are the defined exceptions in data only. Exact output schemas cover success/error/partial variants without unrestricted data or core-wide metadata breakage.

Export a small `createLinkedInRuntime(config, overrides?)` returning `{ version, authService, publishing: { approvals, textPostService? } }`. Trusted constructor/test overrides may supply authService/approvals/ledger/posts/clock, never tool inputs. Construct one coherent dependency graph per runtime outside stdio/HTTP per-connection callbacks so all connections share auth, receipt and ledger/service state. Optional trusted HTTP runtime injection supports deterministic real-client tests. Missing API version or ledger path leaves the publisher unconstructed; preview/auth/local approval remain functional, and valid-receipt publication reports publishing_not_configured. No default ledger/provider, store creation merely for unconfigured startup/preview, network during construction, or direct-POST fallback. Preserve loopback/Host/Origin/body bounds and protocol-only stdio stdout.

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

GET author shape accepts documented valid `urn:li:person:<member-id>` or `urn:li:organization:<organization-id>` forms. A valid organization author is well-formed provider data and reaches the service's exact authenticated-member comparison, resulting in `verification_failed/post_mismatch`; it is not `malformed_response` merely because it is an organization. Missing, wrongly typed, blank or malformed author values remain malformed responses. This read normalization does not authorize organization publishing: POST author validation remains person-only, and read confirmation still requires exact equality with the authenticated member author.

Task 6 intentionally extends the Task 5 successful result with a required nested `verification` field while preserving outer `{ state: 'succeeded', provider: 'OFFICIAL_API', postUrn, replay }`:

- `{ state: 'verified' }`: this invocation's GET confirms matching post identifier, authenticated author, exact approved commentary and `PUBLISHED` lifecycle;
- `{ state: 'created_unverified', reason: 'read_permission_unavailable' }`: the capability flag is disabled, read scope is unavailable, or GET returns 403;
- `{ state: 'verification_failed', reason }`: reason is one of `post_mismatch`, `reauth_required`, `read_not_found`, `rate_limited`, `malformed_response` or `provider_failure`.

Creation state and verification state remain separate. Persist mutation success before GET. Missing read permission, mismatches, read failures or failed auth cleanup never downgrade the successful mutation, reopen/delete records or retry POST. A GET 401 attempts expected-context credential invalidation but still returns successful creation with verification failure. A GET 404 may mean delayed visibility and does not establish publication failure. Comparison is exact; no trimming, identity inference or missing-field confirmation.

Successful idempotency replay may perform one fresh gated GET with the already bound canonical payload and current legitimate auth context, but performs no POST or ledger completion. Verification is invocation-specific and is not persisted in the mutation ledger; no stale confirmation is claimed. Reserved, unknown and terminal-failed operations never trigger GET. Existing approval/member-binding policy remains in force, including fresh subject-bound approval after restart. The existing shared-ledger queue includes the single GET; file locks remain limited to ledger operations.

No post URL is constructed or represented as verified. Read confirmation does not upgrade live capability availability without legitimate live evidence. M02 must not require restricted read permission to use legitimate member publishing.

## 12. Configuration — trusted Task 7 runtime inputs

Keep optional LINKEDIN_MCP_API_VERSION/`linkedinApiVersion` in YYYYMM form. Add nonsecret ServerConfig fields `publishingLedgerPath?: string`, `publishingApprovalTtlMs: number`, `memberPostReadEnabled: boolean`:

- LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH: optional explicit nonblank path, resolved to an absolute lexical path; reject equality with resolved credential-store path. No default global/shared ledger, hidden filesystem/network validation, or caller override.
- LINKEDIN_MCP_APPROVAL_TTL_MS: integer >0 and <=600000, default 300000, matching approval bounds.
- LINKEDIN_MCP_MEMBER_POST_READ_ENABLED: exact true/false strings only, default false; legitimate read capability still requires normalized granted r_member_social under Task 6.

Both API version and explicit ledger path are required to construct the real publisher. Partial config preserves M00/M01 startup defaults and reports structured publishing_not_configured on valid-receipt publication. TTL/read settings do not activate OAuth or establish live access. Administrative settings never enter tool schemas/results. M01 encryption and Task 5 ledger/lock policy remain authoritative.

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

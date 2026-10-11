# M04 Comments & Engagement — Design

Date: 2026-10-11
Milestone: M04 — Comments & Engagement

## Goal

Add capability-aware member comment reading, nested replies, reactions and a bounded unanswered-comment workflow without pretending restricted Community Management access is generally available.

## Provider reality

Current LinkedIn Community Management documentation defines comments under `/rest/socialActions/.../comments` and reactions under `/rest/reactions`. Member writes use `w_member_social_feed`; member reads use restricted `r_member_social_feed`. Community Management is a vetted API product with Development and Standard tiers; Development tier has call limits and disallows BATCH_GET. Therefore M04 must never infer live availability from implementation or CI alone.

Authoritative research basis:

- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview
- https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access

## Scope

### In scope

- Read one comment and list comments/replies for an explicit post/comment URN when trusted read access is enabled and the token has the required read scope.
- Preview/approve/create a nested member reply using the authenticated member as actor.
- Preview/approve/add and preview/approve/remove a member reaction on an explicit post/comment URN.
- Build an unanswered-comment inbox from an explicit bounded list of thread URNs only; do not discover a member feed in M04.
- Return parent/root context needed for MCP clients to draft a reply, without performing model generation inside the provider adapter.
- Strict MCP schemas over the shared stdio/loopback HTTP runtime.
- Explicit provenance/access states for restricted/unavailable provider operations.

### Out of scope

- Organization/page engagement (M13).
- Arbitrary feed discovery or broad post search (M05).
- Batch-get calls in M04; Development tier may prohibit them.
- Comment editing/deletion, comment images, mentions, or bulk engagement.
- Browser fallback, CAPTCHA/security-challenge handling, stealth automation, bulk outreach, or spam.

## Capability and permission model

`comments.get`, `comments.list`, and `comments.inbox` use `OFFICIAL_API` but require both:

1. exact provider scope `r_member_social_feed`; and
2. an explicit trusted local read gate, default OFF, so ordinary installations never probe restricted member reads accidentally.

`comments.reply` and `reactions.add`/`reactions.remove` use `OFFICIAL_API` and require `w_member_social_feed`. OAuth configuration remains user-supplied; M04 does not silently substitute legacy publishing scopes or browser interaction.

Provider 401 => reauthentication required. 403 or missing scope/product access => permission/access unavailable. 429 => rate limited. Other read failures => explicit unavailable/error, never fabricated empty data. Mutation transport uncertainty => `outcome_unknown` and no automatic retry.

## Canonical contracts

Create `packages/core/src/engagement.ts` with strict canonical types/helpers:

- `CommentTarget`: explicit LinkedIn share/ugcPost/activity/comment URN accepted only from a conservative allowlist.
- `CanonicalComment`: id, commentUrn, actorUrn, objectUrn, optional parentCommentUrn, text, createdAt, lastModifiedAt, totalLikes.
- `CommentPage`: elements plus bounded paging metadata and `provider: 'OFFICIAL_API'`.
- `ReplyDraft`: target/root/parent identifiers and nonblank text.
- `ReplyPreview`: canonical JSON/hash, required scope `w_member_social_feed`, provider provenance and warnings.
- `ReactionType`: `LIKE | PRAISE | EMPATHY | INTEREST | APPRECIATION | ENTERTAINMENT`; deprecated `MAYBE` is rejected.
- `ReactionDraft`/`ReactionPreview` with canonical hash and required write scope.
- Structured read availability result that distinguishes disabled, permission-required and available states rather than mapping restrictions to empty arrays.

No arbitrary actor is accepted from MCP input. The provider actor is always `urn:li:person:${authenticatedSubject}`.

## Provider adapters

### Comments adapter

Create `apps/server/src/engagement/linkedin-comments.ts`.

- GET one comment and paginated comments/replies with LinkedIn-Version and Rest.li 2.0 headers.
- POST nested reply to the documented `socialActions/{target}/comments` endpoint with authenticated person actor, root object and parent comment URN.
- Do not use BATCH_GET.
- Bound successful JSON response bodies locally before parsing, following M03's provider-response pattern.
- Validate provider comment IDs/URNs/timestamps/message shape before returning canonical data.
- Never include token/provider-private response bodies in errors.
- Do not automatically retry POST after transport uncertainty.

### Reactions adapter

Create `apps/server/src/engagement/linkedin-reactions.ts`.

- POST `/rest/reactions?actor=...` for allowed reaction types and explicit root entity.
- DELETE the actor/entity reaction key for removal.
- Validate returned reaction identity/type/root for creates.
- Treat successful delete as 204 only.
- No automatic mutation retry after uncertain transport outcome.

## Service layer

Create `apps/server/src/engagement/engagement-service.ts`.

Reads:

- Require authenticated provider context.
- Require `r_member_social_feed` plus trusted read gate before provider calls.
- Preserve permission/access failure explicitly.
- Apply bounded pagination and explicit thread targets.

Writes:

- Reuse the existing subject-bound approval service and durable idempotency ledger.
- Preview computes canonical payload hash.
- Approve binds hash to authenticated subject.
- Create/reaction consumes receipt and reserves an operation-specific mutation hash before provider mutation.
- Successful result is durably completed; uncertain result is terminal `outcome_unknown` for automatic replay purposes.
- Replays return only durable known success; in-flight/uncertain mutations fail closed.

This preserves the M02/M03 no-duplicate mutation model rather than creating a second persistence mechanism.

## Unanswered inbox

Create `apps/server/src/engagement/comment-inbox.ts` as a LOCAL_ONLY derivation over provider-read results.

Input is 1–20 explicit thread URNs. For each thread, list top-level comments and nested replies within strict page/call bounds. A comment is considered answered only when a direct child reply is authored by the authenticated member. Output includes the root/thread URN, parent comment, text, timestamps and permalink ingredients/context.

This is not broad feed discovery. If restricted reads are disabled/unavailable, return that state; never return an empty inbox implying “nothing to answer.”

## MCP surface

Create `apps/server/src/engagement-mcp.ts` and register through the shared server/runtime.

Read tools:

- `linkedin.comments.get`
- `linkedin.comments.list`
- `linkedin.comments.inbox`

Write flows:

- `linkedin.comments.reply.preview`
- `linkedin.comments.reply.approve`
- `linkedin.comments.reply.create`
- `linkedin.reactions.add.preview`
- `linkedin.reactions.add.approve`
- `linkedin.reactions.add`
- `linkedin.reactions.remove.preview`
- `linkedin.reactions.remove.approve`
- `linkedin.reactions.remove`

Schemas are strict and exclude access token, actor override, arbitrary provider URL, read-gate override, ledger path or admin controls.

## Security and review focus

- Restricted read access must never be probed merely because code exists.
- A 403/read restriction must never become an empty list or “no unanswered comments.”
- Replies/reactions must never accept arbitrary actor identity.
- Provider response sizes and paging/call counts must be bounded.
- Mutation transport uncertainty must not be retried automatically.
- Cross-runtime idempotency must prevent duplicate consequential writes.
- Deprecated/unknown reaction types fail locally.
- No bulk engagement primitives; inbox is bounded to explicit thread roots.
- Deterministic CI must not claim Community Management Development/Standard tier or live member scopes.

## Iterations

1. M04.1 canonical contracts, capability/access policy and trusted read configuration.
2. M04.2 official bounded Comments read adapter.
3. M04.3 approval/idempotency-gated nested reply flow.
4. M04.4 reaction add/remove flow.
5. M04.5 explicit-thread unanswered inbox/context derivation.
6. M04.6 strict MCP/stdio/HTTP integration.
7. M04.7 whole-milestone skeptical/security/provenance review and merge.

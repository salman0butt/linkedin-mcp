# M13.0 — Local-only organization editorial handoff

## Scope and non-goals

M13 begins with the safe, genuinely useful `linkedin.organization.content_handoff.prepare` MCP tool. It validates **one to five** caller-authored short company page post drafts and prepares a manual copy package without contacting LinkedIn, fetching any account information, impersonating an organization or claiming publishing/authorization. The input organization URN is **caller asserted** and **never verified**. This is distinct from existing member-only `linkedin.post.preview.text` which constructs a Posts API member payload, uses `w_member_social`, has no explicit organization actor and is only one text post. M13.0 must not generate a ready-to-send organization API payload, trusted approval grant, role badge, verified company attribution, actual publication/scheduling or analytics data.

M13 real organization identity, role authorization, posting, engagement and analytics require approved organization/community management access and a credential-bound resolver. LinkedIn official Posts API docs distinguish `w_organization_social` and ADMINISTRATOR/CONTENT_ADMIN/DIRECT_SPONSORED_CONTENT_POSTER roles; a caller-provided URN, OAuth OIDC sub, member scope or caller-provided role claim are **never** an authorization proof. Existing `organization.post.create` remains `OFFICIAL_API` / `UNAVAILABLE` / `PLANNED` in the capability registry. M13 overall remains IMPLEMENTING.

## Exact input

Strict own-data object, exactly:

```
{
  organizationUrn: 'urn:li:organization:<positive decimal digits>',
  drafts: [
    {id: 'short-client-id', text: 'caller-written draft'}
  ]
}
```

`organizationUrn` is bounded to 128 UTF16 code units and canonical `urn:li:organization:[1-9][0-9]{0,18}` (no arbitrary URL or actor type). `drafts` is a dense 1–5-element array, duplicate IDs prohibited, each ID ASCII `[A-Za-z0-9][A-Za-z0-9._-]{0,39}`, each `text` nonblank, UTF16 length ≤3,000 and no unpaired surrogates. Preserve caller text (including newlines, hashtags and Unicode) verbatim without HTML/Markdown transformations; do not auto-generate copy or infer visibility/roles. Use at most 16KiB UTF-8 for complete input; reject excessive/hostile objects before output. No provider, URL, token, account ID, role, scopes, approval, media, schedule, source trust or arbitrary extra fields at any depth. Real MCP Zod pre-handler must sanitize secret-looking unknown field **names and values**.

Pure helper `prepareLocalOrganizationEditorialHandoff(input: unknown)` in `apps/server/src/organizations/local-editorial-handoff.ts` must safely validate own-data shapes, no getters/proxies/accessors/inherited property values, sparse arrays, symbols, prototype pollution or secret values in errors. Return stable, deeply frozen, stateless result ≤32KiB UTF-8, with fields exactly:

```
{
  kind: 'local_organization_editorial_handoff',
  status: 'manual_editorial_handoff_only',
  provenance: 'caller_supplied_unverified',
  organizationUrn,
  organizationAuthorization: 'not_evaluated',
  organizationRole: 'not_verified',
  scopes: 'not_checked',
  approval: 'not_issued',
  publication: 'not_attempted',
  schedule: 'not_created',
  providerData: 'not_fetched',
  drafts: [{id, text}],
  warnings: ['organization_claim_unverified', 'manual_copy_only', 'no_org_permissions_or_publication']
}
```

No `lifecycleState:PUBLISHED`, no `OFFICIAL_API` result, no raw Posts API JSON, no post URN or fake URL. All caller text is inherently reproduced as the user requested; avoid claiming arbitrary caller text has been scrubbed of secrets, but reject separate secret-bearing fields. The host must be able to copy drafts manually into a legitimately authorized Company Page UI after independent human verification.

## Typed MCP and capabilities

Implement `registerOrganizationEditorialHandoffTools(server,{createRequestId,now})` in `apps/server/src/organization-handoff-mcp.ts`, registered once in `apps/server/src/create-server.ts`. Strict Zod pre-handler input and output, complete identical text + structured JSON payload on success, sanitized bounded failed response with no untrusted key/value echo, resilient host request ID/clock, genuine real SDK tests. Cap complete text/structured/error and real HTTP SSE at 256KiB including maximum 128-byte JSON-RPC ID. Pure output max 32KiB and request input max 16KiB. No access to runtime.auth/publishing/store/transport, and the HTTP server never accesses private STDIO stores.

Add capability `organization.content_handoff` with provider `LOCAL_ONLY`, availability `AVAILABLE`, status `ACTIVE`, milestone `M13`, and evidence identifying genuine passing local tests, never official organization approval. Explicit capability `organization.post.create` remains `OFFICIAL_API`, `UNAVAILABLE`, `PLANNED`, approvalRequired true; do not accidentally enable it. In-memory tool count baseline 62 =>63; compiled STDIO/HTTP 66 =>67; pagination must still return full 67 tools exactly once and bounded per-page SSE.

## Test and release gates

Genuine pure missing-module RED and genuine real SDK absent-tool RED then GREEN. Pure tests: 1/5, duplicate IDs, Unicode preservation, invalid surrogate, secret extra keys/values, proxy/revoked/getter-zero, arrays/holes/symbol/non-enumerable, oversized 16KiB, deep freeze and ≤32KiB. MCP tests: typed Zod strict pre-handler, no secret echo, host clock and 270k ID, all text+structured fields consistent, proper errors, missing official org capability, unrelated tools unaffected, null host runtime provider. Real compiled Node24 STDIO/HTTP and paged 67-tool inventory/raw SSE including escaped 128-byte IDs, full format/lint/typecheck/build/test. Two independent strict read-only audits Critical0 Important0; exact local+GitHub blob/tree SHA; feature PR/CI and guarded squash; independent successful push CI on exact merged main SHA. Preserve unrelated root edits and all older worktrees.

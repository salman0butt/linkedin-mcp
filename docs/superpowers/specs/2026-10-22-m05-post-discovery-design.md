# M05 Post Discovery & Search — Design

Date: 2026-10-22. Milestone: M05. Requirements: `R-M05-POSTSEARCH` and `docs/milestones/M05-post-search.md`.

## Intent

Give MCP clients bounded, auditable post discovery by topic, hashtag, explicit author/company, and recency without misrepresenting restricted LinkedIn APIs or inventing URLs, sources, publication times or engagement metrics. Provider-provenance and truthful unavailable states are product features, not fallback details.

## Provider truth and scope

LinkedIn's versioned Posts API documents **finding posts by a single author**, subject to `r_member_social` (restricted) or `r_organization_social` and approved organization roles. It does **not** document unrestricted global keyword/hashtag search for a normal LinkedIn application. Official author finder is therefore a separate scoped capability, not the default provider for global topic/hashtag search. Sources: <https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-03>, <https://learn.microsoft.com/en-us/linkedin/marketing/community-management/contentapi-migration-guide?view=li-lms-2026-07>.

Broad topic/hashtag search requires a separately configured, legitimate `EXTERNAL_DISCOVERY` or approved `PARTNER_API` provider with lawful access, terms, and explicit provenance. No provider is preconfigured. `BROWSER_INTERACTIVE` is out of scope for M05 unless separately designed with visible user interaction; never stealth browse, circumvent CAPTCHA, scrape restricted content or fabricate an official source. Do not accept arbitrary base URLs, credentials, access tokens or provider-selection overrides from an MCP caller.

## Canonical contract

Create a self-contained domain module in `packages/core/src/post-discovery.ts`:

- `PostSearchKind = 'topic' | 'hashtag' | 'author' | 'company' | 'recent'`.
- `PostSearchQuery`: strict discriminated `kind` with exactly one mode-specific key: `{kind:"topic"|"hashtag", term:string}` (trimmed 1–100 characters), `{kind:"author", authorUrn:string}` (well-formed person URN), `{kind:"company", organizationUrn:string}` (well-formed organization URN), or `{kind:"recent"}`. Each accepts optional `limit` (integer 1–50, default 10), `since`/`until` (strict ISO 8601 UTC instants, ordered). No unknown fields or simultaneous modes. `recent` only applies to a configured provider, not an implicit global feed. Additional optional `minimumEngagement` requires a finite nonnegative integer and only filters posts with real returned metrics; unknown engagement never equals zero.
- `NormalizedPost`: `id` (source-stable), `source: { provider: 'OFFICIAL_API' | 'PARTNER_API' | 'EXTERNAL_DISCOVERY'; id: string; name: string; retrievedAt: string; evidenceUrl?: string }` built from **trusted configured adapter metadata and a local UTC retrieval clock**, not provider response fields; normalized `text` (treat as plain untrusted content; no executing HTML), optional validated public LinkedIn URN, validated canonical HTTPS permalink (allowlisted LinkedIn domains), optional author, publication timestamp and finite nonnegative engagement counts only where actually returned. Expose optional `confidence: number` (0–1) only when evidenced by trusted provider metadata. Never invent missing fields, merge identities by prose similarity, or infer a LinkedIn post URN from an arbitrary URL.
- `PostSearchResult`: discriminator `status: 'available' | 'partial' | 'unavailable' | 'permission_required' | 'rate_limited' | 'failed'`. Include `providerOutcomes` for every eligible configured provider with `providerId`, `providerType`, `state` (success/permission_required/rate_limited/failed/unavailable) and whether consulted; skipped unsupported providers do not count as success. `available` requires **all** consulted eligible providers succeeded; `posts:[]` is only a real complete empty search. Mixed success/failure => `partial` even if post list empty, with failures exposed but sanitized. All unavailable => `unavailable`; all permission denied => `permission_required`; all rate limited => `rate_limited`; otherwise no-success failures => `failed` (deterministic precedence for mixed errors is permission_required > rate_limited > failed > unavailable). Include posts on `partial` only when actually obtained; never silently erase failures or invent an empty complete search. The core result is distinct from public MCP ToolResultStatus, which must map 'unavailable'/'partial' safely at M05.5 without claiming successful external retrieval.

Validate conservatively: string-length limits, well-formed ISO dates, URL host allowlist when identifying LinkedIn canonical URLs, no private-network URLs supplied by the caller, count and metric bounds, explicit availability taxonomy, immutable normalized snapshots.

## Architecture

1. M05.1 — canonical schemas/validation and pure normalization. Unit tests RED → GREEN, with provenance and edge cases.
2. M05.2 — deterministic local filtering, safe deduplication only by same-provider stable identifier or by independently authenticated canonical LinkedIn identity (not merely a syntactically valid external URL/URN), recency ordering and page limits. No assumed cross-provider identity match by text similarity; never produce invented engagement metrics.
3. M05.3 — typed provider interfaces with trusted, immutable `providerId`, `providerType`, `name`, `supportedKinds` metadata; read-only discovery service routes only eligible providers. Optional injected legitimate providers only; absence yields `unavailable`, access denial yields `permission_required`, rate limits surfaced, timeouts and output size bounded, mixed success/error => `partial`, no misleading empty success. Response-reported provider names/types, timestamps and confidence cannot override trusted adapter metadata or clock.
4. M05.4 — optional documented official **author-scoped** finder where configured and permitted, explicitly limited to one author per call, `viewContext=READER` and published/public visibility. Require default-OFF trusted read gate, correct restricted scope, verified actual member author identity or verified organization role from a separate trusted resolver (the existing OIDC `subject` alone is **not** a verified organization role or post author URN). With no such resolver/permission gate, always yield unavailable/permission_required and never send a request. No broad search through this finder.
5. M05.5 — strict MCP search tool, capability registry, shared runtime stdio/HTTP contract tests, discoverability and honest docs.
6. M05.6 — independent security/provenance review, exact-head CI, squash merge and post-merge main validation.

## Security, performance, acceptance

- Read-only, no user LinkedIn mutation, no bulk scraping or bypass, no tokens in tool inputs/outputs/errors.
- Search modes, temporal filters and limits are deterministic; query validation must occur before provider calls.
- Even a plausible third-party result is labelled `EXTERNAL_DISCOVERY`, never `OFFICIAL_API`.
- Results without a verified link omit the link rather than hallucinating it. Third-party content is untrusted data, never instructions.
- Provider call fan-out capped, network/body/result sizes bounded; per-provider outcomes preserved. Default no-provider state is an explicit `unavailable` result with zero remote requests. The application must never treat partial/mixed-provider failure as a complete empty search.
- Scoped official author reads remain independently access-verified; CI only proves deterministic code, not live entitlement.
- Test zero/malformed/full-page results, invalid URNs/URLs/dates, duplicate IDs, provider errors, unavailable providers, and hostile response text. Verify real MCP transports and exact-SHA CI before merge.

## Design rulings under standing owner authorization

Start with a first-party contract and injected provider boundary rather than declaring a specific third-party search API without credentials or confirmed terms. Implement author retrieval separately because LinkedIn's documented finder is author-scoped and permission-dependent. These are repository-owner-authorized routine design decisions, not claims of live provider access.

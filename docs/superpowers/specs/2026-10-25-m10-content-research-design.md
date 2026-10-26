# M10.0 Sourced Content Research — Local Analysis Design

Date: 2026-10-25. Requirement: `R-M10-RESEARCH`; milestone: `docs/milestones/M10-content-intelligence.md`.

## Intent, choices, and limits

Help a person inspect **research excerpts they have supplied**: show whether an explicitly requested topic/focus phrase occurs in their corpus, cite the exact original text for each occurrence, and identify literally duplicate excerpts. The first step in a broader Research & Content Intelligence milestone must be useful without a live LinkedIn, search, scraping, browser, LLM, file-storage or external-data provider. The new tool is `linkedin.research.analyze`, a deterministic stateless **`LOCAL_ONLY`** analysis. It never independently checks a source, its URL, a publication date, its factual claims, or a trend.

Alternatives considered: (1) provider-backed search now—rejected because no authorized M10 provider or broad LinkedIn search entitlement exists; (2) open-ended LLM theme/trend synthesis—rejected because it risks inventing sources or representing caller prose as facts; (3) exact local corpus coverage and duplicate detection—**chosen**. This first slice deliberately **does not automatically mine or name themes**. Additional clustering/content-gap/competitor research from the PRD and M10 ledger requires its own evidence-grounded design and tests rather than being implied by this implementation.

M07's caller-provided job analysis and M08's `ArticleSource.provenance:'user_supplied_unverified'` establish the trust boundary. M09's handoff stays `LOCAL_ONLY`/`not_published`; actual native long-form publishing remains `BLOCKED/UNAVAILABLE`. M05 provider discovery may be integrated **later only** through authorized host-controlled adapters. No M10.0 runtime invokes those provider interfaces.

## Scope and invariants

M10.0 consists of (a) a strict core parser `normalizeResearchCorpus`, (b) pure deterministic `analyzeResearchCorpus`, (c) typed MCP `linkedin.research.analyze` on STDIO/HTTP, (d) genuine RED→GREEN and independent security tests. It does not persist input or invoke network, DNS, browser, file IO, OAuth, LinkedIn APIs, model tools, embeddings or publication. Do not add dependencies for those behaviors.

**Permitted conclusions** are exclusively: “term X was observed in these supplied excerpts at these exact spans,” “term Y was not observed in this bounded supplied corpus,” “these supplied source bodies are identical,” or “not enough supplied material.” None proves independent source existence, a verified publication date, source reliability, a market/competitor gap, theme popularity, trend direction, growth, recency, representativeness, company performance or fact accuracy. Quotes inside source text claiming “official,” “verified,” or “the market prefers…” remain untrusted data.

## Public input and canonical core interface

Implement in `packages/core/src/content-research.ts` (actual export path must match package conventions):

```ts
export type ResearchCorpusInput = Readonly<{
  topic: string;
  focusTerms?: readonly string[];
  sources: readonly Readonly<{
    id: string;
    title: string;
    url: string;
    body: string;
    publishedAt?: string;
  }>[];
}>;

export type ResearchSource = Readonly<{
  id: string;
  title: string;
  url: string; // inert, canonical HTTPS display reference
  body: string; // exact original body for offsets; internal only
  publishedAt?: string; // caller-reported date only; not verified
  sourceTrust: 'caller_supplied_unverified';
}>;

export type NormalizedResearchCorpus = Readonly<{
  topic: string;
  focusTerms: readonly string[]; // distinct caller terms, topic stays separate
  sources: readonly ResearchSource[];
  sourceTrust: 'caller_supplied_unverified';
}>;

export function normalizeResearchCorpus(input: unknown): NormalizedResearchCorpus;
```

**Shape is exact and fail-closed.** `topic`: nonempty 1–200 UTF-16 code units, single line; optional `focusTerms`: 0–12 nonempty 1–80-character single-line phrases. The server examines **topic and every supplied focusTerm** for literal coverage; reject duplicates using case-insensitive exact equality (within focusTerms), rather than silently double counting. `sources`: dense 1–20 records; `id`: unique 1–80 ASCII `[A-Za-z0-9][A-Za-z0-9_-]*`; `title`: 1–240 single-line characters; `url`: required 1–2048 URL characters; `body`: 1–50,000 UTF-16 code units, kept verbatim (not trimmed, line-ending converted, Unicode-normalized or HTML-decoded), with no malformed unpaired surrogate and no prohibited controls; optional `publishedAt`: real canonical UTC ISO-8601 instant `YYYY-MM-DDTHH:mm:ss[.sss]Z`, **reported by the caller only**, never inferred or elevated to verified. Total normalized corpus JSON ≤ **200 KiB UTF-8**. An empty source list is invalid; a single provided source still returns an explicit insufficient-evidence analysis.

Reject all extras at every nesting level, including caller `provider`, `providerType`, `sourceTrust`, `provenance`, `verified`, `verifiedBy`, `confidence`, `retrievedAt`, `checkedAt`, `evidenceUrl`, `token`, `auth`, `secret`, `approval`, `account`, `filePath`, `storePath`, `projectId`, `published`, `postId`, and arbitrary URLs-to-fetch. Reject getters, proxies, custom prototypes, non-enumerable/symbol properties, arrays with holes or extra indexed properties, invalid time formats, duplicate IDs and invalid Unicode **before** any unsafe property access. Revalidate canonical objects without permitting elevated trust. Return deeply frozen plain data; never mutate the caller. Both root and per-source `sourceTrust` are **always derived** as `caller_supplied_unverified`; `publishedAt` on input is retained as a caller-reported value only, not a trusted retrieval or verified posting instant; any output summary labels its date as reported.

### URL safety and latent SSRF

Validate `url` as an inert display-only HTTPS reference: a DNS hostname with valid public-looking labels, no username/password, custom port, fragment, backslash, whitespace, control bytes, encoded CR/LF/other controls, IP literal (including alternate/IPv4-mapped forms), localhost or internal/private suffix. Reject URL query keys associated with bearer tokens/credentials, including `code`, `accessCode`, `ticket`, `oauth_code`, `auth_code`, `api_key`, `token`, `secret`, `session`, `signature`, `sig`, `X-Amz-*` and encoded/separator/case equivalents. Normalize keys separator-insensitively, decode nested percent-encoding with a strict small depth bound and reject malformed key escapes/over-depth; the M08 post-security-review URL rules are the precedent. **Do not reject benign** `languageCode`, `discount_code`, `page`, `topic` or harmless `?q=`. Error messages never contain the offending URL or secrets. A syntactically safe URL is not a verified page, and **no caller URL is fetched, redirected, DNS-resolved or previewed**. Any later network fetch requires separate host authorization, resolved-IP and redirect-chain SSRF review, egress policy and response/time limits: this parser is **not** a safe-fetch authorization mechanism.

## Pure analysis interface, exact evidence and honest semantics

In `apps/server/src/research/content-analysis.ts`, implement:

```ts
export type ResearchEvidenceSpan = Readonly<{
  sourceId: string;
  field: 'body';
  start: number; // inclusive
  end: number; // exclusive
  offsetUnit: 'utf16';
  endExclusive: true;
  quote: string;
}>;

export type ResearchAnalysis = Readonly<{
  kind: 'local_corpus_analysis';
  status: 'available' | 'insufficient_evidence';
  sourceTrust: 'caller_supplied_unverified';
  verification: 'not_performed';
  topic: string;
  sourceSummaries: readonly Readonly<{
    id: string;
    title: string;
    url: string;
    publicationDate: Readonly<
      { state: 'unknown' } | { state: 'reported'; publishedAt: string; sourceClaim: 'caller_reported' }
    >;
    sourceTrust: 'caller_supplied_unverified';
  }>[];
  termCoverage: readonly Readonly<{
    term: string;
    state: 'observed_in_supplied_corpus' | 'not_observed_in_supplied_corpus';
    evidence: readonly ResearchEvidenceSpan[];
  }>[];
  duplicateGroups: readonly Readonly<{ sourceIds: readonly string[] }>[];
  warnings: readonly (
    | 'caller_sources_unverified'
    | 'coverage_is_corpus_only'
    | 'insufficient_sources'
    | 'dates_caller_reported_only'
  )[];
}>;

export function analyzeResearchCorpus(input: unknown): ResearchAnalysis;
```

`analyzeResearchCorpus` invokes `normalizeResearchCorpus` **once**, then inspects only canonical data. Evidence offsets are JavaScript **UTF-16 code units into the original unchanged `body`**: `span.quote === source.body.slice(span.start,span.end)` is mandatory. Unicode code points, astral emojis _before_ a match, tabs and line breaks must not break indices. Implement case-insensitive **whole-word contiguous literal** matching for `topic` and the supplied `focusTerms`, with token boundaries computed from the original body (not normalized text). Spaces within a focus phrase may match adjacent whitespace but not arbitrary nonadjacent words. Do not match within longer words (`AI` must not match `said`); do not HTML-decode or interpret quote meaning. For each term return the **first** matching span per source in original source order (≤20), not repeated hits within a single source. Case folding is for comparison only; matched `quote` comes from original characters. Cap quote/span to the focus phrase size plus encountered whitespace, at most **160 code units**; if no bounded matching span exists, classify not observed, never fabricate one. Result ordering: topic, then caller focusTerms not equivalent to topic, each source in input order. The canonical focusTerms array remains caller terms only.

Exact duplicate groups contain source IDs whose `body` strings are **byte-for-byte/UTF-16-identical**, in original order; return only groups with ≥2 members, ordered by first member's position. Do **not** call paraphrases or punctuation/whitespace variations duplicates, and do not label repeats as independent factual corroboration. An empty supplied sources array is invalid. **One** source can truthfully contain an observed focus phrase but still returns `insufficient_evidence` because there is no cross-source corpus. For ≥2 sources, `status:'available'` means the bounded local analysis ran, **not** verified research and not necessarily any term matched. Always issue `caller_sources_unverified` and `coverage_is_corpus_only`; issue `insufficient_sources` for <2 sources; issue `dates_caller_reported_only` if any input publication dates were given. Output does not echo complete bodies or create any new factual prose, recommendation, market conclusion, ranked competitor, date freshness claim or external citation.

Ensure deterministic byte-identical results for equal canonical input (no ambient clock, random IDs or sort instability), deep immutability, exact output evidence, and total serialized pure result ≤ **96 KiB UTF-8**. If exceeded, **fail with sanitized `analysis_too_large`**, not silent truncation or a succeeded status missing citations. Reject malformed input with sanitized `invalid_input`; never echo URLs, body snippets or credential values into errors or logs. Complexity must stay bounded by 200 KiB total input, at most 20 × 50,000-character source fields and 13 topic/focus phrases; no unbounded regex loops or user-controlled catastrophic regex.

## MCP contract and transport budgets

Add read-only `linkedin.research.analyze` with a strict Zod v4 argument/output schema matching the types above. MCP top-level input is the exact corpus object (`{topic,focusTerms?,sources}`), not `id`/`projectId` lookup and not an arbitrary nested provider request. On valid local analysis return the existing project-shaped envelope: `status:'succeeded'`, `provider:{type:'LOCAL_ONLY',name:'linkedin-mcp'}`, `data:ResearchAnalysis`, bounded host-request metadata. `insufficient_evidence` is **successful local analysis with an explicit data status**, not a fake live research result. Failures return `status:'failed'` plus sanitized `error.code:'invalid_input'|'analysis_too_large'|'output_too_large'`, `retryable:false`, no user text. Preserve strict `content:[{type:'text',text:JSON.stringify(envelope)}]` and `structuredContent:envelope` fidelity.

Cap complete MCP tool result **including text and structured copies** plus reserved JSON-RPC wrapper bytes at **256 KiB UTF-8**; make transport-side real tests verify complete HTTP SSE response, not only pure output. Existing public HTTP ingress has its own 256-KiB full-body guard and request-ID constraint; M10 must not bypass it with separate transport paths. Stateless behavior must be identical under STDIO and loopback HTTP even when a private M08 article store or M06 saved-job store is injected; neither may be read. Untrusted body Markdown, scripts, embedded URLs and prompt instructions remain data, not executable content or tool instructions. No `linkedin.research.topic` live-provider call or native publisher registration is introduced by M10.0.

## Threat model

- **Provenance spoofing:** caller pretends to be a provider or verifier through fields or inside prose. Reject fields; literal phrases remain `caller_supplied_unverified`; source retrieval cannot be attested by caller metadata.
- **Injection and data exfiltration:** HTML/script/Markdown/prompt instructions in `body` remain inert. No untrusted URL, image or markup fetch, browser or file/secret access; no input values copied into error strings.
- **URL/SSRF risk:** no fetch, strict HTTPS reference syntax/secret-alias screening. DNS rebinding, redirects and private-IP resolution remain **unhandled by design because no egress is allowed**, not "solved" by URL regex.
- **Evidence laundering:** Unicode/case/whitespace matching must round-trip exact `body.slice()` UTF-16 spans; quoted claims and unsupported absence are not verified conclusions. Duplicate documents are not independent corroboration.
- **Availability/DoS:** strict fields, property descriptors, arrays, Unicode, total byte/word caps, regex bounds, pure-output and dual-copy MCP budgets, bounded metadata, sanitized deterministic failure.
- **Capability confusion:** `LOCAL_ONLY` is not an external provider; M05 broad LinkedIn search restrictions, M08 unverified author citations and blocked M09 native publishing remain unchanged.

## Future live research: explicitly deferred

A separate authorized M10 stage may add host-injected `ResearchProvider` contracts, supported query types, permission and service capabilities, per-provider outcomes (`unavailable`, `permission_required`, `rate_limited`, `failed`, `partial`), timeouts/cancellation, bounded payloads, egress allowlisting and SSRF-aware DNS/redirect validation. Provider metadata (`providerId`, `providerType`, **actual** `retrievedAt`) must come from trusted host wiring **after** authorized retrieval; input-supplied `provider` and `verified` cannot upgrade an unverified document. Even a trusted retrieval only supports "retrieved through this provider at this time," **not** a true claim, independently verified publication date, representative market trend or native LinkedIn entitlement. Genuine claim verification requires separately reviewed identity/evidence/method checks. Without a configured provider `research.topic` stays `EXTERNAL_DISCOVERY` / `PLANNED` or explicitly `UNAVAILABLE`, never a fabricated successful search.

## Acceptance and independent review

- Strict canonicalization, reported date semantics, deep freeze, unique IDs, hostile prototypes/getters/proxies/sparse arrays, malformed Unicode, exact byte limits, URLs (`code`/`accessCode`/`ticket` + encoded aliases), benign URLs and no source-trust elevation.
- Evidence round-trips _exactly_ with `body.slice(start,end)` across astral emoji, mixed scripts, casing, tabs and newlines. Topic/focus terms are literal; missing in the supplied corpus is **not** a market gap. Exact duplicate grouping has no fuzzy matches; stable output order and immutability.
- Single-source corpora yield explicit `insufficient_evidence`; dates never appear verified; untrusted instructions remain inert and no source fetch or storage happens.
- MCP missing-tool genuine RED, then strict typed `LOCAL_ONLY` tool GREEN under real STDIO/HTTP, private stores untouched, exact tool list, sanitized failures, 96-KiB pure output/256-KiB full MCP/HTTP wire; no live `research.topic` entitlement or M09 publishing change.
- Independent skeptical review (ideally separate core/provenance and HTTP/MCP scopes), zero unresolved Critical/Important, full Node24/format/lint/typecheck/build/diff, exact feature SHA and post-merge main CI **before** `R-M10-RESEARCH` can claim its own scoped VERIFIED state. This first deliverable is **not** proof all future M10 research/competitor/trend acceptance is complete.

## Self-review decisions

This explicit narrower scope matches the owner's first-slice interfaces, favors observed/source-linked facts over speculative theme mining, gives a mechanical UTF-16 evidence invariant, and keeps providers/files/native publishing out of M10.0. Unverified article notes cannot round-trip as authenticated M05 provider records. Remaining YAGNI decisions (tokenization implementation details and logging plumbing) belong to the builders only if they preserve the listed invariants; expanding to semantic synthesis, provider search or market conclusions requires a new design and review.

# M10.3 Caller-Defined Two-Cohort Corpus Comparison — Design

Date: 2026-10-27. Proposed subrequirement: `R-M10-COHORT-COMPARISON` within `R-M10-RESEARCH`. Baseline: verified `main` `e7be937961f138a7df769c5a63dba7646d0fface`, M10.2 PR #18 merged. Worktree: `feat/m10-local-corpus-comparison`, already created. This document describes a **new planned LOCAL_ONLY slice**, not delivered research, a verified PR or an external LinkedIn capability.

## Intent and deliberate scope

Answer only: **“For each of my two explicitly named, nonoverlapping groups of source excerpts, which of my own literal focus terms occurs, and at which exact original UTF-16 spans?”** The two groups may be called anything; their labels are not facts about a business, competitor, employee, market or experiment. Both contain only caller-supplied unverified excerpts in **one** bounded corpus. Comparison is a side-by-side _inventory of literal observations_, **not** scientific/statistical comparison, ranking, semantic classification, group preference, independently validated evidence or proof of competitive/content gaps.

The PRD `docs/product/PRD.md` asks for research, references, competitor/theme work and gaps, but M10.0–M10.2 deliberately supply only local evidence and reference management. This M10.3 slice is a further bounded, honest building block, **not** fulfillment of external research/competitor analysis. M10.0 `normalizeResearchCorpus` already validates URLs, dates, source IDs, bodies and total bytes; `analyzeResearchCorpus` supplies literal first-match source-linked UTF-16 evidence. M10.1 `groupResearchThemes` already demonstrates strict own-descriptor parsing and Unicode matcher aliases. Reuse these foundations rather than creating new fetching, a second URL validator, a per-cohort matcher or an LLM/embedding classifier.

Alternatives rejected: (1) analyzing two independent corpora would double the input/normalization budget and allow an accidental two×20 sources; (2) any automatic source-to-cohort classifier would invent membership; (3) percentages, absence gaps, statistical significance, representative trends or verified competitor recommendations would misrepresent these caller inputs. **Chosen:** normalize/analyze **one** corpus once; filter its immutable literal evidence into exactly two disjoint caller-defined source-ID cohorts.

Entire slice is synchronous, stateless, deterministic and read-only. No network, LinkedIn/social API, redirect/DNS, browser, file/private article or job store, cache, persistence, model, embeddings, OAuth/secret, approval or publishing operation. `research.topic` stays `EXTERNAL_DISCOVERY`/`PLANNED`/`UNAVAILABLE`; no `linkedin.research.topic` tool. M09 native long-form publication stays blocked. Earlier `linkedin.research.analyze`, `linkedin.research.group_themes` and `linkedin.research.index_references` contracts stay unchanged.

## Public API and complete assignment contract

Pure export in a **new** `apps/server/src/research/corpus-comparison.ts`:

```ts
export type CorpusComparisonInput = Readonly<{
  topic: string; // M10.0 context, NOT an automatically compared term
  focusTerms: readonly string[]; // 1..12 explicit caller terms
  sources: readonly Readonly<{
    id: string;
    title: string;
    url: string;
    body: string;
    publishedAt?: string;
  }>[];
  cohorts: readonly Readonly<{
    id: string;
    label: string;
    sourceIds: readonly string[];
  }>[];
  unmatchedSourceIds: readonly string[]; // REQUIRED, [] when none
}>;

export function compareResearchCohorts(input: unknown): Readonly<LocalCohortComparison>;
```

The public MCP input is **exactly** these five keys. The explicit fifth `unmatchedSourceIds` field was chosen rather than silently dropping nonmember corpus sources. Its members are **not** compared; they still appear in source summaries. When every source is in a cohort, callers send `unmatchedSourceIds:[]`. The root must not contain `provider`, `sourceTrust`, `verified`, `retrievedAt`, `market`, `competitors`, arbitrary options, project IDs or output flags. No implicit source search/filter, no pagination.

- `sources`: 2–20 valid M10.0 records (two nonempty disjoint cohorts make one source impossible). Input source IDs are unique, case-**sensitive**, ASCII `[A-Za-z0-9][A-Za-z0-9_-]{0,79}`, and may include `constructor`/`toString`; do not index through prototype-bearing `{}`. Source titles max240 UTF-16 units; body max50,000 valid Unicode code units, original whitespace/newlines unchanged. Dates real canonical UTC `publishedAt` are only caller-reported. URLs inert canonical HTTPS, raw and canonical length ≤2,048; inherit rejection of private hosts, userinfo/ports/fragments, signed credential query **names**, nested control escapes and percent mistakes from M10.0. **Do not fetch/resolve them or build a second URL parser.** A secret-looking _value_ under benign URL key such as `?ref=sk_live_FAKE_CANARY` can pass the inherited parser and will be echoed as a display URL: document and test this **known residual**, do not claim universal query-value secret redaction. Caller must supply public URLs only.
- `topic`: trimmed nonempty **single-line** context, 1–200 UTF-16 units; no C0/C1, lone surrogates or U+2028/U+2029. It is passed to M10.0 analysis but **not independently included** in the side-by-side results unless explicitly also a caller `focusTerm`.
- `focusTerms`: dense 1–12, each trimmed nonempty **single-line** 1–80 UTF-16 units, no prohibited C0/C1, lone surrogates, U+2028/U+2029; no symbol/extra array keys/accessors. Reject cross-term aliases under **both** `toLocaleLowerCase('en-US')` and M10.0's literal JavaScript `/iu` Unicode case-equivalence, including `s/ſ`, `σ/ς`, `k/K` and dotted-I `İ` versus `i\u0307` lowercase collisions. Compare using the proven bounded escaped, anchored alias technique of M10.1 (for **validation/identity only**); do **not** write a second body matcher. Focus terms with embedded whitespace use the analyzer's whitespace-matching semantics. Accept a focus term genuinely equivalent to `topic` under `/iu` and project the analyzer's topic entry; reject a topic/focus key collision when lowercasing equates them but `/iu` **does not** (e.g. `İ` versus `i\u0307`) to prevent false quotation.
- `cohorts`: **exactly two** dense native array elements, each a plain own-data object with exactly `{id,label,sourceIds}`; IDs 1–80 safe ASCII with **case-insensitive uniqueness**, labels trimmed 1–80 single-line and distinct under lowercase **or** the same bounded `/iu` matcher-alias identity. Labels and IDs are user metadata and never search terms. Each `sourceIds` is a dense 1–20 array of exact, case-sensitive existing source IDs, no repeats within a cohort.
- `unmatchedSourceIds`: required dense 0–20 array of distinct exact existing source IDs; disjoint from both cohorts. The combined sets of the two `sourceIds` arrays and `unmatchedSourceIds` must equal the **entire** normalized corpus's source-ID set **exactly once**. A source in two cohorts, missing from all three lists, in a cohort and unmatched, unknown, or duplicated is `invalid_input`, not a silently repaired comparison. There are always ≥1 source in **each** cohort. Membership canonical output order follows original `sources` order, even if caller membership arrays arrive out of order.
- At **every** level reject caller-controlled proxies, getters/setters, sparse/extra-key arrays, own symbols, non-enumerable or inherited fields, invalid prototypes and unexpected keys. Inspect own data descriptors **before** reading them; do not stringify, spread or destructure hostile caller records. Use only fixed field labels/codes in errors; never copy untrusted names/values to exception messages.

**Single-normalization boundary:** After safely validating root/context/term/cohort/membership-array _shapes_, construct a fresh, known-key `{topic,focusTerms,sources}`; invoke `analyzeResearchCorpus` **exactly once** (which invokes `normalizeResearchCorpus` exactly once). Do **not** pass an already normalized object with derived `sourceTrust` to the analyzer, analyze per cohort, or iterate raw source bodies. After the analyzer returns canonical source summaries and immutable evidence, validate exact cohort membership against their source IDs; use `Map`/`Set`. Inherit the normalized corpus **≤200 KiB = 204,800 UTF-8 bytes** limit (measured after core canonicalization and JSON escaping). The two cohort definitions and unmatched IDs are separately bounded to ≤20 IDs each (≤60 total membership references) and do not authorize a second corpus. No new network lookups or serialization of unsafe raw objects.

## Output: observations, not a measured comparison

```ts
export type LocalCohortComparison = Readonly<{
  kind: 'local_caller_defined_corpus_comparison';
  status: 'available'; // computation succeeded; NOT cohort evidentiary adequacy
  comparisonOrigin: 'caller_defined_cohorts';
  sourceTrust: 'caller_supplied_unverified';
  verification: 'not_performed';
  topic: string;
  focusTerms: readonly string[]; // original trimmed caller order/casing
  sourceSummaries: ResearchAnalysis['sourceSummaries']; // all sources, including unmatched
  cohorts: readonly Readonly<{
    id: string;
    label: string;
    sourceIds: readonly string[]; // corpus order
    termObservations: readonly Readonly<{
      term: string;
      state: 'observed_in_supplied_cohort' | 'not_observed_in_supplied_cohort';
      evidence: ResearchAnalysis['termCoverage'][number]['evidence'];
    }>[];
  }>[];
  unmatchedSourceIds: readonly string[]; // original corpus order
  warnings: readonly (
    | 'caller_sources_unverified'
    | 'comparison_is_corpus_only'
    | 'cohorts_caller_defined_only'
    | 'single_source_cohort'
    | 'unmatched_sources_excluded'
    | 'dates_caller_reported_only'
  )[];
}>;
```

On success, cohort order follows caller's two `cohorts`; within each, `termObservations` follow **all 1–12 focusTerms**, including not-observed terms, in caller order. **No implicit topic observation**. For a term, get the one exact analyzer `termCoverage` entry by verified identity (case aliases and topic-first suppression accounted for); then filter that entry's already-frozen evidence by this cohort's source IDs, preserving **original source order** and the analyzer's first qualifying whole-word literal span per source. `state` is observed iff the **filtered** evidence array is nonempty, even if the same term occurs only in the other cohort or in the unmatched set. For each evidence span:

```ts
{
  sourceId: 's2',
  field: 'body',
  start: 6, end: 13,
  offsetUnit: 'utf16',
  endExclusive: true,
  quote: 'literal'
}
```

This is illustrative; real test offsets **must** be calculated from the actual supplied body (astral emoji, ZWJ, combining marks and tabs count in UTF-16). The invariant is `span.quote === originalSource.body.slice(span.start,span.end)` and `0 ≤ start < end ≤ body.length`, first qualifying match, quote ≤160 UTF-16 units. **Never reconstruct a quote from a case-folded phrase**, clone unbounded bodies or invent a span. Bounded literal quotations **are intentionally returned**; unlike the M10.2 reference index, this output is **not** body-quote-free. Never echo **full** bodies, caller prompt instructions or unsafe provenance outside these strictly bounded matching quotes and display metadata. Tests should use canaries outside matched quote ranges to prove absence of raw body echo.

`sourceSummaries` remain in original corpus order, each URL only the M10.0 sanitized _display_ string; `publicationDate` either `unknown` or `reported` with `sourceClaim:'caller_reported'`. Unmatched sources are listed but **not** counted as evidence in either cohort. A corpus source cannot be in both cohorts. Identical bodies or URLs across different source IDs are still separate **caller records**, never independent factual corroboration; this feature does not deduplicate/weight them or claim verification.

Always emit warnings in order: `caller_sources_unverified`, `comparison_is_corpus_only`, `cohorts_caller_defined_only`; then `single_source_cohort` iff either cohort has exactly one source, `unmatched_sources_excluded` iff unmatched set nonempty, `dates_caller_reported_only` iff any supplied publication date. Status `available` means the operation completed even when one cohort has one source or no term hits, **not** representative evidence or confidence. **No** difference score, percentage, numerical weight, p-value, statistical significance, trend, citation quality, popularity, competitor/content/market gap, recommended content, verified negative claim or auto-inferred theme. A not-observed term simply means the literal matcher did not find a qualifying span **inside this one user-chosen cohort**; never phrase it as real-world absence.

Deterministic equal inputs yield byte-identical output (no clock/UUID in the pure result), stable source/term/cohort ordering, plain own-data nested objects and deep freeze. Enforce complete `Buffer.byteLength(JSON.stringify(pureResult),'utf8') ≤96 × 1024 = 98,304` and reuse the analyzer's own ≤96KiB report limit. On either overflow throw the fixed `ResearchOutputTooLargeError`; never silently trim/drop spans or return successful incomplete comparisons.

## Typed MCP, transport and capability

Separate read-only MCP tool: **`linkedin.research.compare_cohorts`**. Distinct capability ID: **`research.compare_cohorts`**, `provider:'LOCAL_ONLY'`, `availability:'AVAILABLE'` only once implemented/registered, `status:'ACTIVE'` until independently/CI verified. New `referenceIndex` and existing `research.analyze`/`group_themes` tools unaffected. Register via existing `registerResearchTools`; no new HTTP route, provider interface or private-store service.

Zod v4 `strictObject` with constant custom unknown-field errors for root, both nested cohorts, and M10.0 source objects; nested arrays must have exact bounds. One typed strict distinct `data.kind:'local_caller_defined_corpus_comparison'` schema matching all fields, fixed warning enums, term observation state and source IDs, literal UTF-16 evidence schema from `research-mcp.ts`. MCP success `status:'succeeded'`, `provider:{type:'LOCAL_ONLY',name:'linkedin-mcp'}`, `data` and bounded `metadata:{requestId,timestamp}`, where timestamp records **response generation**, not retrieval, publication or fact verification.

Reuse the hardened existing `reply()`: `content:[{type:'text',text:JSON.stringify(structuredContent)}]`, strict text/structured equality, ≤256×1024 = 262,144 UTF-8 bytes for **both copies and reserved JSON-RPC wrapper**. Real HTTP wire including SSE must be ≤262,144 bytes, guarded at `apps/server/src/http.ts`. The host's injected request ID may be 270,000 bytes: retain only `[A-Za-z0-9_-]{1,128}` or fixed safe fallback. For failures use `isError:true` and fixed, non-retryable `invalid_input | analysis_too_large | output_too_large | invalid_output` codes, without caller field/property names, URL values, quotes or body canaries. SDK validation failures happen **before handler callbacks**; specifically test secret-looking **unknown key names** as well as values at root/source/cohort. Reject whole input when any membership invalid rather than succeed on one valid cohort.

No account provider/data may be queried, and injected STDIO private article/job stores must remain unread and unchanged by the pure comparison; HTTP must continue to deny private-store operations. Preserve all existing capability inventory and unavailable provider semantics: `research.topic` stays `EXTERNAL_DISCOVERY`/`UNAVAILABLE`, `article.native.publish` unavailable, no unsupported LinkedIn OAuth features.

## Security, acceptance and review

**Adversarial tests** (unit + real MCP and actual built transports): distinct IDs differing by case; duplicate/cross-cohort IDs; unknown ID and implicit unassigned source; explicit empty unmatched list; all-unmatched and empty-cohort rejection; source order versus membership order; string-key `constructor`; 1–12 terms and 2–20 sources, overlimits; root/cohort/source/array Proxies, throwing getters (invocation count must be zero), sparse/nonenumerable/symbol properties and secret-named unknown fields; invalid UTC, U+2028/U+2029, lone surrogates, Unicode regex alias pairs, dotted-I topic mapping collision; source URLs with nested encoded secrets/control, private host, canonical >2048 and safe benign query; no more than one M10.0 normalization; valid 200KiB source corpus, output guard and **actual** full SSE bound; injected 270k metadata; unchanged private stores/unavailable tools.

**Observation tests**: term present only in cohort A, only B, both, neither or only unmatched; original-body UTF-16 exact round-trip with emoji/ZWJ and whitespace; topic-equal explicit term; no false positives inside larger Unicode words; one-source cohort produces caution warning and `available`, no confidence claim; duplicate full-body sources do not become independent corroboration; never silently delete evidence to meet limits. Hostile Markdown and prompt instructions are inert caller text. Capturing a bounded matching quote does **not** verify the quote's claim.

**Review gates:** actual missing-module and missing-tool RED before GREEN under Node24, independent source/mapping/security review **and** disjoint real MCP/transport/security review, zero unresolved Critical/Important, all focused and whole Node24 tests, Prettier, ESLint, typecheck, build, diff and real built STDIO/HTTP including raw SSE, exact feature-head GitHub CI, independent PR review and **post-merge main** exact-SHA CI. Do not mark M10.3 `VERIFIED` until these are all observed. This does not close broader M10 or authorize any external research.

### Scope and ownership

This design worker owns **only** this new spec and `docs/superpowers/plans/2026-10-27-m10-local-corpus-comparison.md`; no source, tests, statuses, capabilities, staging, commits, push or branch creation. Later prime/delegated owners: (1) `apps/server/src/research/corpus-comparison.ts` and its pure tests exclusively, (2) `apps/server/src/research-mcp.ts` and a new MCP contract test exclusively, (3) capability/inventory tests and built STDIO/HTTP contracts exclusively, (4) disjoint READ-ONLY independent reviewers, (5) prime for durable docs and Git/PR/CI. Source and transport owners must not concurrently edit shared files. The first implementation act is a **genuine pure missing-module RED** in a fresh test; no test/CI results are asserted by this design.

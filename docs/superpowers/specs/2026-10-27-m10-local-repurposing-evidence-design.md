# M10.4 Caller-Curated Local Repurposing Evidence — Design

Date: 2026-10-27. Proposed subrequirement: `R-M10-REPURPOSING-EVIDENCE` within M10 Research & Content Intelligence. Baseline: exact verified `main` `0002809530e819720fe66477ba1e57bcca54ff31` (M10.3 PR #19 squash merge; push CI `40464124927` SUCCESS). Implementation worktree: `/linkedin-mcp/.worktrees/m10-local-repurposing-evidence`, branch `feat/m10-local-repurposing-evidence`.

**State/ownership:** This document specifies the **already-started** M10.4 multi-target pure API and the MCP/transport work underway concurrently. Prime owns `apps/server/src/research/repurposing-evidence.ts` and its tests and has already observed a genuine missing-module RED, then started minimum GREEN/typecheck repairs. Other owners have since begun MCP, capability and built-transport files. These facts do **not** mean that M10.4 full gates, independent reviews, PR, or remote CI are complete. The document owner changes this spec and its companion plan **only**, not code, tests, status or Git state.

## Purpose and boundary

Help a human reuse exact excerpts from **their own** unverified research corpus for up to three explicitly named destination contexts: `post`, `article`, and `carousel`. The caller—not a model—selects each destination, source ID, and UTF-16 original-body interval. The service gives a compact, immutable set of verbatim source-bound quotations for review and manual downstream use. One quote may intentionally be selected for more than one target; that is reuse, **not independent corroboration**.

M10.0 already normalizes strict caller references and analyzes literal terms, M10.1 groups caller-authored phrases, M10.2 catalogs canonical display URLs, and M10.3 compares explicitly assigned cohorts. M10.4 does **not** re-run research or term matching, infer terms, discover or verify sources, synthesize themes, compute content gaps, generate posts/articles/carousels, make recommendations, count market popularity, claim competing products are weak, or publish anything. `format` is an **inert caller-selected destination hint**, not generated output, a rendering mode, an upload instruction or an entitlement.

M08 already supports author-written `ArticleDraft` blocks, outline, SEO, review, preview and optional private STDIO storage; M09 supports manual native-editor handoff. M10.4 must **not** manufacture an M08 draft or `companionPost`, import M08 private projects, reuse stored drafts without explicit caller data, render Markdown/HTML, call a model, read files, or use article publishing. A human can explicitly copy selected quote/source IDs into a separately reviewed authoring flow later. M09 native long-form publishing stays `BLOCKED`/`UNAVAILABLE`; `research.topic` remains `EXTERNAL_DISCOVERY`/`UNAVAILABLE` with no authorized provider.

## Pinned public pure contract

New pure function in `apps/server/src/research/repurposing-evidence.ts`:

```ts
export type RepurposingTargetFormat = 'post' | 'article' | 'carousel';

export type RepurposingEvidenceInput = Readonly<{
  topic: string;
  sources: readonly Readonly<{
    id: string;
    title: string;
    url: string;
    body: string;
    publishedAt?: string;
  }>[];
  targets: readonly Readonly<{
    id: string;
    label: string;
    format: RepurposingTargetFormat;
    selections: readonly Readonly<{
      sourceId: string;
      start: number;
      end: number;
    }>[];
  }>[];
}>;

export function prepareResearchRepurposingEvidence(input: unknown): Readonly<LocalRepurposingEvidence>;
```

**The entire top-level input is exactly `{topic,sources,targets}`.** Neither root nor nested records accept `prompt`, `draft`, `generatedCopy`, `sourceTrust`, `verification`, `verified`, `provider`, `retrievedAt`, `selection.quote`, `filePath`, `projectId`, external IDs, callback URLs or unknown flags. There is no single-list `selections` input, no `focusTerms` and no automatic text-to-evidence matcher. Do not replace this scoped multi-target API with an earlier one-list proposal.

### Validation and resource limits

- `topic` is a required, nonempty, trimmed **single-line** string, at most 200 UTF-16 code units, no malformed surrogate, C0/C1 controls or U+2028/U+2029; it is context only and is **not** searched or used to create claims.
- `sources` is a dense array of 1–20 **exact M10.0 source records**: unique case-sensitive ASCII IDs matching `[A-Za-z0-9][A-Za-z0-9_-]{0,79}`; required title (1–240), inert canonicalizable HTTPS display URL (raw and canonical lengths ≤2,048), nonempty body (1–50,000 UTF-16 code units), optional real canonical UTC `publishedAt` (caller-reported only). Reuse `normalizeResearchCorpus` **once**, on a fresh `{topic,sources}` object created only after safely validating wrapper/target metadata. Never implement a second URL/date/body parser, accept derived `sourceTrust` as input or inspect caller body outside the strict normalizer.
- The normalized core corpus JSON is ≤200 KiB = **204,800 UTF-8 bytes**, counting JSON escaping. Additional wrapper/target selections are separately bounded and must never serve as a way to bypass that inherited limit. Reject oversized corpora rather than trimming original bodies or discarding validation. All source URLs stay **display-only**; never DNS-resolve, follow or fetch them. Query key credential aliases and percent-encoded controls are rejected by inherited rules. **Known limitation:** a benign URL query key such as `?ref=` can contain a token-looking value that remains in the display URL; users must supply public, noncredential links. Do not claim universal query-value redaction.
- `targets` is a **dense 1–3 array** of exact plain own-data `{id,label,format,selections}` records. `id` uses the safe ASCII ID pattern, is 1–80 UTF-16 units and unique ignoring ASCII case; e.g. `Post`/`POST` conflict. `label` is caller metadata only, trimmed, nonempty, single-line valid Unicode, ≤80 UTF-16 units; identical labels are not evidence and need not drive uniqueness. `format` must be exactly one of `post`, `article`, `carousel`, without any provider or publishing implications.
- Each target has a dense array of **1–12 selections**, and **at most 12 selections across all targets combined**. Each selection is exactly `{sourceId,start,end}` with a case-sensitive existing safe source ID and finite, nonnegative `Number.isSafeInteger` numeric offsets. Require `0 ≤ start < end ≤ source.body.length`, `end-start ≤160` UTF-16 code units; reject any start/end falling between a valid surrogate pair. Source ID lookup uses `Map`/`Set`, never `object[sourceId]`; names such as `constructor` and `toString` are valid source IDs. Reject duplicate `(sourceId,start,end)` **within the same target**, preserving selection order; the same exact span **across distinct targets** is allowed intentional human-curated reuse. Do not silently correct offsets, normalize whitespace, HTML-decode, run a regex, rewrap or re-crop excerpts. Tabs, newlines, emoji and zero-width-joiner sequences remain original UTF-16 text. A slice of valid Unicode may still cut a grapheme cluster without cutting a surrogate; do not mislabel this as a verified semantic quotation.
- Reject getters/setters, Proxies (including revoked), custom/inherited/null prototypes, symbol keys, nonenumerable data, unknown fields, extra array properties, holes, accessor-backed array indices, and malformed Unicode at **every** wrapper/source/target/selection boundary. Examine own property descriptors before reading untrusted values, including secret-bearing unknown property **names**; never stringify, spread or destructure hostile original objects before validation. Failures expose fixed safe codes/field labels only, not caller text, URLs, unknown key names or contents. No input mutation.

## Output contract and truthfulness

```ts
export type LocalRepurposingEvidence = Readonly<{
  kind: 'local_caller_curated_repurposing_evidence';
  status: 'available'; // only the local extraction operation succeeded
  selectionOrigin: 'caller_defined_utf16_offsets';
  sourceTrust: 'caller_supplied_unverified';
  verification: 'not_performed';
  topic: string;
  sourceSummaries: ResearchAnalysis['sourceSummaries'];
  targets: readonly Readonly<{
    id: string;
    label: string;
    format: 'post' | 'article' | 'carousel';
    excerpts: readonly Readonly<{
      sourceId: string;
      field: 'body';
      start: number; // inclusive; original UTF-16
      end: number; // exclusive; original UTF-16
      offsetUnit: 'utf16';
      endExclusive: true;
      quote: string; // original source.body.slice(start,end) ONLY
    }>[];
  }>[];
  warnings: readonly (
    | 'caller_sources_unverified'
    | 'selections_caller_defined_only'
    | 'evidence_is_excerpt_only'
    | 'human_review_required'
    | 'dates_caller_reported_only'
  )[];
}>;
```

The result preserves caller target order, each target's selection order, source-ID casing and exactly selected quote bytes/code units. For every excerpt, **`quote === originalSource.body.slice(start,end)`**. No generated title, slug, hook, paragraph, carousel panel, citation assertion, recommendation, opinion, keyword, confidence, fact score, body rendering, or fabricated quote. No automatic sentence boundary adjustment. A caller-selected quote can contain misleading claims, private text or prompt-injection instructions: it is inert **data** reproduced intentionally, not a verified factual assertion or an instruction to follow. Explicit `human_review_required` makes the review boundary visible.

`sourceSummaries` contains **only selected unique source IDs**, ordered by original corpus input order, with each selected source's `id`, `title`, canonical inert `url`, `publicationDate` (`{state:'unknown'}` or `{state:'reported',publishedAt,sourceClaim:'caller_reported'}`) and fixed `sourceTrust:'caller_supplied_unverified'`. An unselected source is still validated by core but its ID, title, URL, date and raw body **must not appear** in output; canary tests must prove this. An intentionally selected excerpt and selected source display metadata are permitted output and must not be incorrectly described as secret-redacted. Repeated URLs or identical bodies are not independently verified corroboration, and a source used in multiple targets is still one caller record.

Fixed warning order: `caller_sources_unverified`, `selections_caller_defined_only`, `evidence_is_excerpt_only`, `human_review_required`, then `dates_caller_reported_only` **only if a selected source** carries a caller-reported date. `status:'available'` denotes extraction completed, never publication, content readiness or source truth. Deeply freeze returned plain nested data; same canonical input yields byte-identical pure results with no ambient clock/randomness. `JSON.stringify(result)` must be ≤96 × 1024 = **98,304 UTF-8 bytes**; throw existing `ResearchOutputTooLargeError` on overflow rather than dropping spans while still returning `available`.

## Typed MCP, capability, wire and side effects

Register a separate read-only `linkedin.research.prepare_repurposing` tool via existing `registerResearchTools` in `apps/server/src/research-mcp.ts`; its **exact** tool name is pinned and differs from the earlier recon proposal `prepare_repurpose_inputs`. Its strict Zod v4 schemas match the public input/output above, enforce `targets.length 1..3`, per-target selections 1..12, global count and source membership inside pure validation, and reject unknown nested keys **before callbacks** with fixed safe custom error strings. Register the new capability **`research.repurposing.prepare`** (not `research.repurpose_inputs`) as `provider:'LOCAL_ONLY'`, `milestone:'M10'`, `status:'ACTIVE'`, `availability:'AVAILABLE'` only while actually registered. It does not become `VERIFIED` without exact feature-head and merged-main CI; preserve all existing capability descriptors and `research.topic` external/unavailable.

Successful tool envelope: `status:'succeeded'`, `provider:{type:'LOCAL_ONLY',name:'linkedin-mcp'}`, `data:LocalRepurposingEvidence`, and bounded host `metadata:{requestId,timestamp}`. The timestamp is response generation only, not source retrieval/publication. Reuse existing sanitized `reply()`, including `content:[{type:'text',text:JSON.stringify(structuredContent)}]`, strict output-schema `safeParse`, exact text/structured parity and `isError:true` on failure. Fixed nonretryable error codes: `invalid_input`, `analysis_too_large`, `output_too_large`, `invalid_output`; no URL/body/unknown key/canary leakage, including SDK pre-handler errors. Host-supplied request IDs are bounded to `[A-Za-z0-9_-]{1,128}` (safe fallback); real HTTP rejects a caller JSON-RPC ID exceeding 128 UTF-8 bytes.

Enforce ≤**262,144 UTF-8 bytes (256 KiB)** for the complete **two-copy** MCP result plus reserved JSON-RPC wrapper and for the **actual HTTP SSE response including framing and JSON-RPC ID**, not merely pure `data` or `structuredContent`. Preserve `apps/server/src/http.ts` whole-response guard and private-store isolation. A valid large corpus may have a tiny returned pack; still validate all of it. On overflow fail closed without a successful partial card set. New logic must not access URLs/network, OAuth, LinkedIn APIs, external research providers, private article/job projects or stores, filesystem, cache, approval, LLM, embeddings or publishing. Real STDIO and HTTP use identical caller-only semantics; HTTP must refuse private article operations even if injected with a STDIO runtime/store. Existing **54 tools** become **55** with exactly one added research tool; no `linkedin.research.topic` and no native article publisher.

## Risk register and acceptance

1. **False attribution:** reject source ID typos/unknown IDs and forged caller quote/provider fields; test exact UTF-16 `slice`, emoji/ZWJ before span, tabs/newlines, one-sided surrogate cuts, zero/negative/fractional/unsafe/nonfinite offsets, end ≤start, end beyond body and span >160. Distinct spans in same source remain separate; same span across two targets is intentional reuse.
2. **Hostile input and SDK leakage:** root/source/target/selection/array Proxy, getters (assert invocation zero), symbols, nonenumerable/extra/sparse arrays, strange prototypes, unknown secret key _names_ and values; fixed sanitized failures on both pure and real client MCP path, including errors before handler invocation.
3. **Confused provenance:** prompt instructions, suspicious caller labels and text claiming official proof stay inert; only derived unverified trust and reported dates; no actual fetch, corroboration, trend, market/competitor gap or published status.
4. **Privacy:** use one fully validated corpus but emit only selected source summaries/excerpts; no raw/unselected bodies or metadata, even when unselected record includes canary or supplied date; selected URL display may still contain a token-like benign-key query value—known inherited residual. No new persistence/egress.
5. **DoS and transport:** 1..20 sources; 1..3 targets; 1..12 global selections; inherited 200KiB normalized input, 96KiB pure output and 256KiB complete MCP/real SSE output; huge host and caller JSON-RPC IDs; strict typed JSON/structured parity; deterministic frozen output and bounded failure.
6. **Existing-tool regressions:** existing M10.0–M10.3 and M08/M09 behavior, 54 preexisting registered tools, capability availability, STDIO opt-in private stores and HTTP denial all remain unchanged. Built tests must verify 55 after addition, not assume a tool name is present because a capability descriptor exists.

## Verification and owner boundaries

The implementation team must preserve the prime's actual previously observed **missing-module RED** and subsequently establish separately a **genuine missing-tool RED** before typed MCP GREEN; do not call the current in-progress two-of-three pure tests or typecheck a finished implementation. Add focused pure and MCP contracts, capability/inventory regression, built fresh Node 24 STDIO and loopback HTTP including raw SSE byte measurement, security/provenance hostile cases and two independent **READ-ONLY** review scopes (pure evidence/privacy; MCP/transport/SDK). Require zero unresolved Critical/Important, full Vitest/Prettier/ESLint/typecheck/build/diff, exact feature-head GitHub CI, merge gates and exact post-merge main CI before marking **M10.4 alone** VERIFIED. These gates do not complete broader M10 or enable provider-backed research.

**Document ownership only:** `docs/superpowers/specs/2026-10-27-m10-local-repurposing-evidence-design.md` and `docs/superpowers/plans/2026-10-27-m10-local-repurposing-evidence.md`. All source, tests, runtime/tool registration, capability, status/ledger, staging, Git, PR and CI work belongs to prime or separately delegated nonoverlapping owners.

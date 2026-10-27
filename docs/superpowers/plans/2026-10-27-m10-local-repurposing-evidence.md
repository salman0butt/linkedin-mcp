# M10.4 Caller-Curated Local Repurposing Evidence Implementation Plan

> **For implementing agents:** Use Superpowers `subagent-driven-development` or `executing-plans`, real RED → minimum GREEN → refactor, and independent review. This plan is an execution checklist, **not evidence that any unchecked task has been completed**.

**Goal:** Prepare a bounded, read-only human-curated multi-target evidence pack from exact original UTF-16 source-body spans, with `post`/`article`/`carousel` destination hints, explicit source attribution and no authored draft, external research, source verification or publishing.

**Architecture:** One pure `prepareResearchRepurposingEvidence` validates a strict `{topic,sources,targets}` wrapper, invokes the inherited M10.0 `normalizeResearchCorpus` once on one caller corpus, then projects the caller's exact slices to 1–3 destination contexts. A distinct typed `linkedin.research.prepare_repurposing` MCP tool uses the existing `LOCAL_ONLY` registrar/reply guard; `research.repurposing.prepare` is truthful ACTIVE/LOCAL_ONLY capability metadata. Built STDIO/HTTP, source and MCP security reviews and exact-SHA CI gate release. No new URL parser, matcher, draft generator, store or provider.

**Tech:** Node.js 24, TypeScript 5, pnpm, Vitest, Zod v4, MCP SDK, `packages/core` M10.0 normalizer, `apps/server` research registrar, Prettier, ESLint and built STDIO/HTTP contract suites.

**Design:** `docs/superpowers/specs/2026-10-27-m10-local-repurposing-evidence-design.md`.

## Start conditions, exact ownership and invariant checklist

- Worktree **already exists** at `/linkedin-mcp/.worktrees/m10-local-repurposing-evidence`, feature `feat/m10-local-repurposing-evidence`, based on verified main `0002809530e819720fe66477ba1e57bcca54ff31`. M10.3 PR #19 merged; exact main push CI run `40464124927` SUCCESS. Freshly recheck remote refs and CI before any further Git mutation; do **not** create a second branch or reset collaborators' changes.
- The prime has **already written** a genuine missing-module RED, plus an initial `apps/server/src/research/repurposing-evidence.ts` and `apps/server/test/repurposing-evidence.test.ts`; they were in progress at assignment time (reported two of three tests and typecheck repair). MCP registration/test, capability and built-transport edits also became visible **while these documents were authored**. All Tasks 1–3 are **resume-and-reconcile**, not "start over". Verify actual current implementation/test state before claiming GREEN. Do not re-create concurrent owners' files, overwrite their edits, or mislabel a stale build/infrastructure error as behavioral RED.
- The spec/plan worker edits **only** these two documents and performs no source/test/status edits, staging, commit, push or branch operations. **Prime owns pure source/test** already in progress. Assign MCP registration/test, capability/built transports and disjoint read-only reviews without overlapping file ownership; prime coordinates shared integration and durable docs/release.
- Pinned public root `{topic,sources,targets}` only. `targets` is **1–3**, each exact `{id,label,format:'post'|'article'|'carousel',selections:[{sourceId,start,end}]}` with **1–12 selections each and 1–12 grand total**. Core `sources` is 1–20. The output is `kind:'local_caller_curated_repurposing_evidence'`, `selectionOrigin:'caller_defined_utf16_offsets'`, `sourceTrust:'caller_supplied_unverified'`, `verification:'not_performed'`. Tool **`linkedin.research.prepare_repurposing`**; capability **`research.repurposing.prepare`**. Do not substitute earlier recon names or single selection list.
- For each selected record, exact `quote = originalSource.body.slice(start,end)` in UTF-16. Valid 0 ≤start <end ≤body.length, end−start ≤160, safe integer offsets, no split surrogate pairs. Reject exact duplicate `(sourceId,start,end)` **within** a target; allow selected span reuse **between** distinct targets. Keep caller target/selection order and selected source summary order from original corpus. Strict safe own-data descriptors and fixed error messages. Dates caller-reported, sources unverified; selected summaries only, no unselected body/URL/title/date leak. No generated M08 ArticleDraft, preview/handoff, recommendations, network, file or private-store access.
- Inherited normalized corpus ≤**200 KiB** JSON UTF-8; complete pure result ≤**96 KiB** JSON UTF-8; complete MCP text+structured+wrapper and real raw HTTP SSE ≤**256 KiB** UTF-8. Larger valid input must not silently truncate output. Scope is never provider-backed; `research.topic` remains EXTERNAL_DISCOVERY/UNAVAILABLE and M09 native publishing unavailable.

## Task 1 — Complete pure function against genuine RED (prime source owner)

**Files exclusively owned by prime:** `apps/server/src/research/repurposing-evidence.ts`, `apps/server/test/repurposing-evidence.test.ts`. Inherit `packages/core/src/content-research.ts` as-is; do not alter the verified M10.0 parser or other M10 tools.

**Step 1 — Recover and characterize real RED/GREEN.** Confirm missing-module RED already recorded by prime and inspect current source/test changes without clobbering them. Run:

```sh
node --version # Node 24.x required
pnpm exec vitest run apps/server/test/repurposing-evidence.test.ts --reporter verbose
pnpm --filter @linkedin-mcp/core build
pnpm typecheck
```

If the tests now pass, record the actual number; if typecheck fails, fix the **actual** type-contract issue as prime without rewriting tests to hide faults. Original RED evidence remains historical; do not introduce artificial failures.

**Step 2 — Verify own-data strictness and count bounds.** Ensure wrapper, `targets` array, each target, `selections` array, each selection, and every source (via core) reject Proxies, revoked proxies, getter/setter and symbols, nonenumerable/extra fields, wrong/null prototypes, sparse and extra-key arrays, unknown `verified`/provider/secret key names. Count getter invocations = 0. IDs safe ASCII 1–80, unique target IDs ignoring case, case-sensitive source IDs including `constructor`/`toString`; formats only exactly `post`, `article`, `carousel`; valid single-line topic ≤200 and label ≤80, no lone surrogate/C0/C1/U+2028/U+2029. Test boundaries 1/3/4 targets, 1/12/13 selections **globally**, 1/20/21 sources, duplicate-in-target rejection, reuse-across-target acceptance.

**Step 3 — Test literal source fidelity/offsets.** A deterministic fixture has astral emoji preceding selected text, for example body `🤖 RAG\tworks.` and span `[3,12)` yielding exactly `RAG\tworks`; add ZWJ (`🧑‍💻`), tabs/newlines and mixed Unicode. Test `source.body.slice(start,end)===quote`, original `start/end`, `offsetUnit:'utf16'`, `endExclusive:true` for **every** excerpt; reject start/end splitting surrogate pairs, negative/fractional/unsafe/nonfinite offsets, start=end, reversed/out-of-range indices and >160 code units. No appended punctuation, editorial rewriting, inferred text or model-written copy. Two targets may reuse identical spans but may not be called independent evidence.

**Step 4 — Test selected-only privacy, provenance and determinism.** Supply 3+ sources with a canary in an **unselected** title, URL, body and optional date; result includes only selected unique source summaries and selected quotes. Ensure no unselected canary, full-body canary outside span, `draftText`, `companionPost`, `verified`, `OFFICIAL_API` or unexpected prose appears. Dates on selected sources are `{state:'reported',publishedAt,sourceClaim:'caller_reported'}` and trigger only fixed `dates_caller_reported_only` warning; dates solely on unselected sources are absent and must not trigger that warning. Selected date-free sources use `{state:'unknown'}`. Deep freeze nested targets/excerpts/summaries and check repeat-call byte-identical output. Do not demand redaction of **selected** quotes or selected display URLs: those are explicitly caller-requested data.

**Step 5 — Prove inherited URL/input bytes and pure output limit.** Reject unsafe source URL auth/userinfo/ports/fragments, percent-encoded credential query keys, private hosts and invalid UTC; accept legitimate public HTTPS query keys. The known benign-key URL **value** can still contain token-like data in a selected source's display URL; document residual instead of falsely promising secret-value redaction. Test JSON-escaped normalized corpus 204,800-byte edge and input overflow. Verify serialized pure result ≤98,304 UTF-8 bytes; if exceeded fail with existing `ResearchOutputTooLargeError` rather than success minus an excerpt. Use large **valid** payloads to exercise output behavior; exceeding source/selection-count limits is not an output-overflow test. Check 1–20 sources, 1–3 targets and ≤12 grand selections remain complexity bounds.

**Step 6 — Pure GREEN gates and handoff.** Run focused test, relevant existing M10.0/M10.1/M10.2/M10.3 regression, Prettier/ESLint for owned files, TypeScript and build. Send prime exact command results, remaining blockers and source SHA. Do not stage/commit/push for an independent reviewer.

## Task 2 — Typed LOCAL_ONLY MCP registration, genuine missing-tool RED (separate MCP owner)

**Exclusive files:** modify `apps/server/src/research-mcp.ts`, add `apps/server/test/mcp-repurposing-evidence-contract.test.ts`. Do not edit pure function/tests, capability registry, transport smoke or status documents. Existing research `reply()` and shared strict `source`, `publicationDate`, `evidence` schemas are reusable.

**Step 1 — Recover the contract and genuine missing-tool RED.** A new MCP contract file and registration are **already visible** in the shared worktree. Review their source and obtain the owner's actual pre-registration missing-tool RED evidence; do **not** temporarily unregister a working tool just to manufacture RED. The existing/new test should use a real MCP client `listTools` to locate **exactly one** `linkedin.research.prepare_repurposing`, asserting strict typed `inputSchema`/`outputSchema`, exact root `{topic,sources,targets}`, max three targets, enum formats, nested selection fields, no `linkedin.research.topic` and unchanged existing tools. Run:

```sh
pnpm exec vitest run apps/server/test/mcp-repurposing-evidence-contract.test.ts --reporter verbose
```

If a genuine RED was captured before registration, report it accurately; otherwise describe the tool registration as already present and add **new independently failing meaningful assertions** where warranted. The **pure module already exists**, so do not claim a second missing-module RED.

**Step 2 — Input/SDK validation RED.** Send root, nested source, target and selection **secret-bearing unknown key names and values** (`private-SECRET-NAME` and `SECRET-VALUE-CANARY`) through the client. SDK validation occurs before handler; full response must not echo either key or value, even if the Zod default would include unknown paths. Use `z.strictObject(..., {error: () => 'Invalid ... fields.'})` at every nested boundary, including source. Assert unknown extra `sourceTrust:'verified'`, fake `provider`, `selection.quote` reject. MCP schema can check per-array 1..12; the **grand** selection count and cross-record membership remain fail-closed in pure validation, not assumed solved by schema alone.

**Step 3 — Minimum MCP GREEN.** Register only `linkedin.research.prepare_repurposing` in `registerResearchTools`, import pure function and `ResearchOutputTooLargeError`, reuse hardened `reply()`, `content`/`structuredContent` parity and request metadata fallback. Strict output schema pins discriminants, selected summary provenance, exact span fields, target formats, warnings and count caps. A successful operation returns `succeeded`/`LOCAL_ONLY`; an invalid input returns fixed `failed`/`invalid_input`, pure overflow `analysis_too_large`, reply overflow `output_too_large`, schema mismatch `invalid_output` with `isError:true` and `retryable:false`. Never return thrown user error text. Preserve timestamp as server response time **only**.

**Step 4 — MCP test GREEN.** Check exact original source span, selected-only metadata, user labels treated as inert, per-target excerpt order, selected source date provenance and that the `post`/`article`/`carousel` enum never triggers drafts or publication. Test 270,000-character injected _host metadata_ request ID safe fallback ≤128 characters, both successful and failed paths. Assert `JSON.stringify(whole tool result)` plus wrapper allowance ≤262,144 bytes, no full-source body echo or secret canary. Validate no other provider gets registered and existing typed research contracts remain GREEN.

**Step 5 — Focused gate.** Run new MCP contract plus `apps/server/test/mcp-research-contract.test.ts`, `apps/server/test/mcp-theme-grouping-contract.test.ts`, `apps/server/test/mcp-reference-register-contract.test.ts`, `apps/server/test/mcp-corpus-comparison-contract.test.ts` and owned TypeScript/format/lint. If paths differ, list actual files and select existing names; never call nonexistent test paths evidence of behavior.

## Task 3 — Capability and actual built STDIO/HTTP (exclusive integration owner)

**Exclusive files:** `packages/core/src/capabilities.ts`, `packages/core/test/capabilities.test.ts`, `apps/server/test/foundation.test.ts`, `apps/server/test/mcp-contract.test.ts`, `tests/contract/stdio-smoke.test.ts`, `tests/contract/http-smoke.test.ts`. Do not modify pure/MCP source while those owners are active; preserve `apps/server/src/http.ts` request/RPC ID and full-response guards.

**Step 1 — Recover capability RED/inventory, then GREEN.** Capability and 55-tool smoke changes were **already visible during this document's authoring**. Inspect actual modified registry and tests first. Assert ID `research.repurposing.prepare`, exactly `provider:'LOCAL_ONLY'`, `milestone:'M10'`, `availability:'AVAILABLE'`, `status:'ACTIVE'` and truthful access wording limited to caller-curated unverified quotes; `approvalRequired:false` because no write/publishing side effect. Record any genuine pre-descriptor RED from the owner, not CI/environment failure; if already GREEN, do not fabricate RED. Guard `research.topic` EXTERNAL_DISCOVERY/UNAVAILABLE, M09 native publishing BLOCKED/UNAVAILABLE and all prior 54 tools, then verify the intended 55-tool inventory.

**Step 2 — Build real transport fixtures.** Extend both existing built STDIO and loopback HTTP smoke suites with three target contexts and up to 12 selections in a valid corpus, including an unselected private-canary source. Assert exact original UTF-16 quote, `LOCAL_ONLY`, `not_performed`, unique selected summaries, warnings, `content.text===JSON.stringify(structuredContent)`, 55-tool inventory, unchanged external research unavailable state and no auto-generated draft. Validate failed unknown source ID, forged `quote`, invalid span and secret-bearing unknown key requests without value/key echo.

**Step 3 — Real raw SSE and state isolation.** Build fresh `dist` before running **real** subprocess/HTTP tests; do not rely on stale generated JavaScript. POST `tools/call` with legal near-200KiB unverified source bodies, 12 total selections, check returned **entire** SSE JSON-RPC frame (incl. `id`, escaped `content` text and structured content) ≤262,144 bytes. Check no unselected source metadata or unsliced body canary, exact dual-copy parity and no partial-success truncation. Exercise overlong 270k caller JSON-RPC ID rejection and bounded injected metadata IDs; confirm existing HTTP 256KiB guard. Verify STDIO injected opt-in article/job stores stay untouched by the new read-only tool and HTTP private project endpoints remain refused even when a STDIO runtime/store is supplied.

**Step 4 — Integration gates.** Run:

```sh
pnpm --filter @linkedin-mcp/server build
pnpm exec vitest run packages/core/test/capabilities.test.ts apps/server/test/foundation.test.ts apps/server/test/mcp-contract.test.ts apps/server/test/mcp-repurposing-evidence-contract.test.ts --reporter verbose
pnpm exec vitest run tests/contract/stdio-smoke.test.ts tests/contract/http-smoke.test.ts --reporter verbose
```

Record actual tool count, chosen valid fixture, full raw SSE byte count and exact results. If original integration tests expect 54, update only intentional inventories; don't suppress existing regressions.

## Task 4 — Two disjoint independent READ-ONLY security reviews (prime coordinates)

**Reviewer A / PURE:** examine `apps/server/src/research/repurposing-evidence.ts`, its tests and inherited core boundary. Independent adversarial probes: hostile descriptors/getters/proxies/symbols/arrays; unique case-sensitive source IDs; target-ID collision; 1..3 and grand 12; `0,1`/fractional/unsafe offsets and surrogate cuts; quote exactness across emoji and newline; no editing/summarization; repeated cross-target selections, repeated source URLs/body; selected-only summaries, dates, freeze/determinism, core 200KiB/pure 96KiB and sanitized pure errors. This reviewer never edits owned code.

**Reviewer B / MCP + transport:** examine only typed `research-mcp.ts`, its contract, capability matrix/registry/inventories and built STDIO/HTTP. Independently send secret-bearing unknown SDK root/source/target/selection key **names** and values before callback; verify strict outputs/statuses, `LOCAL_ONLY`, `research.topic` and native publisher unavailable; dual JSON/structured parity, 256KiB **raw** SSE incl caller ID, huge IDs, genuine 55-tool inventory and HTTP private article/job-store isolation. This reviewer never edits owned code.

**Blocker protocol:** each reviewer sends prime reproducible Critical/Important RED inputs (or explicit `Critical=0 Important=0`), exact source/test SHA and verification evidence. Prime delegates fixes to original nonoverlapping owners, records genuine RED→GREEN regressions and requests independent **re-review**; no premature signoff or erased failing tests. A known limitation is token-like URL query **values** beneath benign display keys; do not misrepresent it as a universal credential filter.

## Task 5 — Prime full verification, durable status and release

**Prime-only files after evidence:** `docs/milestones/CURRENT.md`, `docs/milestones/M10-content-intelligence.md`, `docs/milestones/README.md`, `docs/product/CAPABILITY-MATRIX.md`, `docs/requirements/TRACEABILITY.md`, `docs/progress/STATUS.md`, `docs/progress/KNOWN-ISSUES.md`, `docs/progress/project-state.json` plus approved implementation commits. The docs worker touches none of these.

1. Reconcile actual Task 1 prime-owned pure results and Task 2/3 genuine RED/GREEN; check both independent reviewers have **zero unresolved Critical/Important** and blocking review threads clear.
2. Run on final Node 24 tree:

   ```sh
   pnpm format:check
   pnpm lint
   pnpm typecheck
   pnpm build
   pnpm test
   git diff --check
   ```

   Re-run real built STDIO/HTTP, whole SSE budget and framework tests if configured; report **observed** counts/bytes rather than extrapolate M10.3's 1,090 tests. Keep M10.0–M10.3 and M08/M09 regression guarantees.

3. Update capability/traceability/progress only to actual verified local status; no M10.4 `VERIFIED` claim yet. Never mark the broader M10 content-intelligence milestone complete or assert research providers/trends/competitor intelligence/native LinkedIn publishing are available.
4. Follow repo connector-first durable GitHub policy: refresh latest remote main and branch SHA/reviews immediately before writes, commit only owned reviewed content, create/update one PR, verify CI on **exact final feature head**, check review threads and mergeability, squash merge only after gates. Verify the **exact resulting main commit SHA** and a `push` workflow CI `SUCCESS` with matching head SHA; only then mark scoped `R-M10-REPURPOSING-EVIDENCE` VERIFIED and activate another slice.

## Self-review: scope trace and handoff

- **Input trace:** Task 1 enforces exact `{topic,sources,targets}` with 1..3 format-hinted destinations, 1..12 global caller spans, inherited strict M10.0 URLs/body/dates, hostile-object and Unicode/UTF-16 proof. Task 2 strictly mirrors the same typed shape without trusting Zod alone for cross-target totals.
- **Output trace:** Task 1 provides only exact selected slices and **selected-only** source metadata in immutable `local_caller_curated_repurposing_evidence`; Task 2 wraps it in sanitized LOCAL_ONLY dual copies; Task 3 checks full 256KiB wire and the deliberate 55-tool/one-new-capability inventory.
- **Not drafted:** `post`, `article`, `carousel` are destination tags, not generated media or M08 `ArticleDraft`, M09 publication, author recommendations, verified source citations, semantic text mining or network fetching. Selected quoted text can be unsafe/misleading and **must** remain caller data requiring human review.
- **Ownership/status:** this author wrote **only the assigned spec and plan**. The prime's already-observed missing-pure-module RED and in-progress pure source/test remain prime-owned; no new pure/MCP/transport tests, code or CI were performed by the docs worker. Outstanding future tasks are instructions, not completed facts.

**Single next prime action:** reconcile the concurrently modified pure, MCP, capability and built-transport files against actual focused Node 24 test/typecheck results and historical genuine RED evidence; delegate only the first real remaining failing gate to its existing owner, without resetting or duplicating progress.

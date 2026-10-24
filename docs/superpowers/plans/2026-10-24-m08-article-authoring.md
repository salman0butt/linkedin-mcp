# M08 Article Authoring Engine — Test-first Implementation Plan

> For implementers: apply Superpowers TDD and independent review to every iteration. Checkboxes below are evidence, never aspirational claims.

**Goal:** Private, reviewable, source-aware long-form article authoring without native LinkedIn publication.

**Architecture:** Strict pure article document/renderer; host-configured STDIO private store with revision safety; reusable local MCP tools and prompt templates. No network access, untrusted source claims, LLM calls or native article publication. Design: `docs/superpowers/specs/2026-10-24-m08-article-authoring-design.md`.

**Toolchain:** Node 24, pnpm 12, TypeScript, Vitest, Zod v4, MCP SDK; start from clean `main` at `e8b603c` (CI `40089877266` GREEN, M07 902 tests).

## M08.0 — Investigate and design

- [x] Read `AGENTS.md`, PRD, M08 ledger, previous private store / MCP patterns and latest remote heads and CI; confirm no competing open PR and green main.
- [x] Record bounded local authoring/document provenance and opt-in STDIO-only storage design.
- [x] Independently review and amend design/plan before substantial implementation; initial five Important design gaps addressed in the updated spec/plan.

## M08.1 — Pure draft normalization and author-controlled evidence

**Files:** Create `apps/server/src/articles/article-project.ts`, `apps/server/test/article-project.test.ts` (or core module if broader reuse becomes necessary).

**Contract:** `normalizeArticleDraft(input:unknown): ArticleDraft` strictly accepts a user-supplied article body, normalizes source provenance to `user_supplied_unverified`, preserves inert prose, checks cross-references, disallows extra/trust fields, duplicate IDs, prototypes/accessors, unsupported URLs and excessive canonical bytes. Do not accept published/verified flags. Per-source notes are not independently verified.

- [ ] RED on missing module/valid sample and adversarial extra fields, duplicated/missing source IDs, credentialed HTTPS/userinfo/query secrets, unsupported schemes and hostile HTML.
- [ ] Observe intended Vitest failure before production code; implement minimum strict model.
- [x] Verify integrated normalization and source-provenance behavior in the locally GREEN 97/97 M08 focused set, including post-audit URL-alias regression fixes.

## M08.2 — Validation, deterministic preview and companion post

**Files:** Create `apps/server/src/articles/article-render.ts`, `apps/server/test/article-render.test.ts`.

**Contract:** `validateArticleDraft(draft): {readyForReview:boolean;warnings:[]}`; `previewArticleDraft(draft)` escapes raw HTML and preserves source-note attribution as _unverified_; `createCompanionPostDraft(draft)` makes a bounded local suggestion (not publication). Preserve content order, no source fetch or user-profile inference. Mark incomplete drafts plainly.

- [ ] RED for incomplete evidence/outline, HTML plus Markdown-active images/links/autolinks/fences including source URLs, misleading citations, non-truncated companion output, and accidental publish claims.
- [x] GREEN model/renderer tests included in the locally GREEN 97/97 focused set; deterministic draft-only preview, review and companion are integrated.

## M08.3 — Local opt-in revisioned private store

**Files:** Create `apps/server/src/articles/article-store.ts`, `apps/server/test/article-store.test.ts`; optionally extract shared M06 private-file safeguards with unchanged M06 behavior/tests.

**Contract:** `createLocalArticleStore({transport,filePath?,lockTimeoutMs?})` returns `null` unless configured for STDIO. `create/update/get/list/remove`; host UUID/timestamps, optimistic revision, durable create idempotency key bound to canonical draft hash, distinguishable uncertain post-commit outcome, compact list metadata, strict private file mode and corrupt-file fail closed; limited projects/bytes. Initial bootstrap differs from a disappeared _previously initialized_ store, including after process restart, using a durable private sentinel. No caller-supplied paths. Adversarial file, symlink, lock, concurrency and HTTP tests mirror M06.

- [x] RED for persistence, revision races, idempotency replay/conflicts/interrupted or concurrent creates, previous initialized file disappearance, HTTP isolation, unsafe disk state and unauthorized metadata (M08.3 missing-module RED and iterative focused regressions recorded).
- [x] Implement, then targeted GREEN and M06 saved-store regression (M08.3 plus M06 suites 37/37 GREEN; integrated M08 focused 97/97 GREEN).

## M08.4 — Reusable MCP authoring prompts

**Files:** `apps/server/src/article-prompts.ts`, `apps/server/test/mcp-article-prompts.test.ts`.

**Contract:** Three `linkedin.article.*` prompts: research brief, outline, editorial review. No network or fake research; input text always labeled user-provided and instructions embedded in it remain inert. Test registration via actual MCP client, bounded inputs/prompts, prompt injection controls.

- [ ] RED prompt list/get and injection labeling; GREEN with reviewed tool-facing prose.
- [x] Three local reusable prompts implemented and covered by focused M08 GREEN tests; specific initial RED history for M08.4 is not claimed here.

## M08.5 — MCP tools and transport integration

**Files:** `apps/server/src/article-mcp.ts`, `apps/server/test/mcp-article-contract.test.ts`; update `create-server.ts`, `runtime.ts`, `config.ts`, `packages/core/src/capabilities.ts`, `.env.example`, `tests/contract/{stdio-smoke,http-smoke}.test.ts`, docs and config tests.

**Contract:** Strict typed `linkedin.article.draft.validate|preview|companion`, `linkedin.article.projects.create|update|list|get|remove`, `LOCAL_ONLY` capability. Stateful ops STDIO+host-store only; HTTP never accesses even injected store. Config rejects article-store collisions with OAuth credentials, M06 saved jobs, publishing ledger, media root, lock/tmp companions. Enforce response cap and no caller file paths/source claims or native publication. Test real STDIO and HTTP transport, invalid inputs, no provider/network dependency and correct capability status.

- [ ] RED for missing tools, unavailable storage, HTTP injected store and output bounds; GREEN with full integration.
- [x] All eight article tools integrated and tested locally; real STDIO/HTTP **6/6 GREEN**, combined focused M08 **97/97 GREEN**. Initial absent-tool RED history is not inferred from passing tests.

## M08.6 — Independent review, durable integration, closeout

**Files:** `docs/milestones/{M08-article-engine,CURRENT,README}.md`, `docs/progress/{STATUS,KNOWN-ISSUES,project-state.json}`, `docs/product/CAPABILITY-MATRIX.md`, `docs/requirements/TRACEABILITY.md`, updated plan.

- [x] Review privacy, prompt-injection handling, corrupted/linked files, consistency, live HTTP saved-state isolation, typed schemas and output budgets with an independent read-only reviewer; three Important RED→GREEN fixes independently re-reviewed and final whole-branch **Critical=0 Important=0 signoff**.
- [x] Full Node24 `pnpm test`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check`; **988/988 PASS across 88 suites** with real built STDIO/HTTP included; all checks GREEN in final command (exit 0).
- [ ] Create/update one M08 PR; exact-final-feature-head GitHub CI GREEN, zero outstanding blocking reviews, mergeable stable base; squash merge under repository policy.
- [ ] Verify exact post-merge `main` CI and then mark M08 complete; activate M09 only after verified main.

### M08 PRE-MERGE checkpoint — evidence only (2026-10-24)

- [x] Article model, renderer, prompts, STDIO-private store and eight MCP tools locally integrated on `feat/m08-article-authoring` based on `e8b603c`.
- [x] Real STDIO/HTTP integration **6/6 GREEN**, focused M08 post-review fixes **97/97 GREEN**; Node24 lint/typecheck/format/build GREEN.
- [x] First full repository run observed **969 passed and 4 stale capability expectation failures** (973 total); the four obsolete expectations were updated after genuine RED and retested **12/12 GREEN**.
- [x] Three verified Important independent review findings (credential-bearing source URL query aliases/fragments, config parent/child collisions, and revision-2 persisted invalid UTF-8) reproduced RED, corrected GREEN, and independently re-reviewed.
- [x] Independent M08.6 whole-branch signoff unresolved **Critical=0 Important=0**, with **fresh full local Node24 988/988 GREEN across 88 suites**, real built STDIO/HTTP and all required quality gates GREEN.
- [ ] Create M08 PR, verify exact-final-head CI, merge only after all gates pass and verify post-merge main CI.

**Exact next action:** Create the M08 feature PR and verify its exact-final-head SHA CI.

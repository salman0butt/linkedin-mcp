# M09.0 — Native Article Preparation and Provider Feasibility Design

Date: 2026-10-24. Requirement: `R-M09-NATIVE`. Milestone ledger: `docs/milestones/M09-native-article-publishing.md`.

**Status: DESIGN (not implementation or native-publication acceptance).** Prepared on `feat/m09-native-article-preparation` from verified `main` `9f10bc4488918ada401e7a25736f7945c8d80c23`. Routine internal design is authorized by `AGENTS.md`; independent design/implementation review, exact-feature CI and native-provider approval have not been verified. Concurrent implementers may work on code/tests outside this design author's three owned files; this document claims no results from that work.

## Evidence and non-negotiable provider boundary

### Official documentation inspected (2026-10-24)

1. [Microsoft Learn — LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09): the example called **Article Post Creation** uses `POST /rest/posts` with `content.article.source` (an external URL), `thumbnail`, `title` and `description`. It produces a feed **link-preview/article post**, not the native long-form article body in LinkedIn's **Write article** editor. A post ID/201 response does **not** prove a native article was published. Do not reinterpret that endpoint, `ArticleContent`, or a link-post share as a native editor API.
2. [LinkedIn Help — Write and publish articles](https://www.linkedin.com/help/linkedin/answer/a522427/creating-articles-on-linkedin): describes the interactive member/Page editor with **Write article**, title, cover upload, body toolbar, optional links/media/code, Article URL and SEO title/description under settings, preview and human **Next → Publish**. UI presence is not authorization for a third-party bot or a documented external native-publish API. Actual editor behavior/feature exposure may change and must be reviewed by the human user.
3. [LinkedIn Help — Automated activity](https://www.linkedin.com/help/linkedin/answer/a1341543) and [Prohibited software and extensions](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibition-of-scraping-software): prohibit third-party software or browser extensions that scrape or automate activity on LinkedIn's website without authorization. No scripted browser editor, stealth automation, CAPTCHA challenge solving, rate-limit evasion, cookie reuse or unauthorized DOM injection is permitted by this design.

**Finding:** The repository has no independently verified, configured, legitimately authorized native long-form article publishing provider. The inspected public API material documents **link previews**, not a native rich-text article creation endpoint. Do not claim none could ever exist; any future provider must be supported by specific authoritative documentation, app-level grant/permission and an approved integration path. Existing `article.native.publish` remains `availability: 'UNAVAILABLE'`, `status:'PLANNED'`, and never gains publication permissions from preparing a handoff. M09 external native publication acceptance stays **BLOCKED** until that evidence exists.

### Considered approaches and decision

1. **Chosen — local, deterministic, editor-ready preparation:** convert an M08 `ArticleDraft` to a transparent, loss-aware, ordered, **manual-only** handoff a human can reference while using LinkedIn's own editor. No LinkedIn access is required.
2. **Rejected — convert to a Posts API article/link post:** incorrect output type, external URL dependency, misleading native-publication provenance.
3. **Rejected — automate the LinkedIn browser editor now:** no verified permission or authorized browser provider, contrary to LinkedIn's published third-party automation restrictions.
4. **Deferred — true native publication:** separate future provider discovery, contractual authorization, explicit independent human approval and verification design; no provider/interface stubs that could accidentally post during M09 preparation.

## Incremental scope and reuse

M08 is already **VERIFIED** with `normalizeArticleDraft`, `validateArticleDraft`, `previewArticleDraft`, three prompts and eight tools. M09 preparation **reuses** normalization and editorial warnings. Do **not** duplicate M08's preview renderer, article schema, review rules, draft persistence or companion generator. If the user needs an escaped Markdown preview, call `linkedin.article.draft.preview` separately. Handoff is a distinct **ordered editor-transfer checklist**, not a second renderer.

This preparatory iteration may implement a pure module and optionally **one read-only/stateless local MCP tool**. It must not create an article record, read/write `LocalArticleStore`, open arbitrary paths, fetch sources, read profile/session tokens, upload media, open LinkedIn, control a browser, queue writes or call any LinkedIn API. No project ID, private state or credential parameters enter the handoff input. Data is prepared **only from the explicit caller-provided complete draft**.

## Exact proposed pure TypeScript contract

New module: `apps/server/src/articles/native-handoff.ts`; tests: `apps/server/test/native-handoff.test.ts`. Public entry point:

```ts
export function prepareNativeArticleHandoff(input: unknown): NativeArticleHandoff;

export type NativeBlockMapping =
  | 'heading'
  | 'paragraph'
  | 'unordered_list'
  | 'blockquote'
  | 'code_manual'
  | 'image_manual_placeholder';

export interface NativeEditorBlock {
  readonly order: number; // zero-based, matches canonical ArticleDraft.blocks
  readonly id: string;
  readonly kind: ArticleBlock['kind'];
  readonly plainText: string; // inert user-authored text data; never HTML
  readonly sourceIds: readonly string[]; // canonical refs, NOT verified citations
  readonly editorMapping: NativeBlockMapping;
  readonly requiresHumanFormatting: boolean;
  readonly lossWarnings: readonly string[]; // fixed finite codes, not interpolated instructions
}

export interface NativeArticleHandoff {
  readonly schemaVersion: 1;
  readonly kind: 'manual_editor_handoff';
  readonly publicationStatus: 'not_published';
  readonly nativePublishAvailability: 'UNAVAILABLE';
  readonly provider: 'LOCAL_ONLY';
  readonly manualOnly: true;
  readonly title: string;
  readonly seo: {
    readonly suggestedTitle: string; // ArticleDraft.title, not an auto-set SEO field
    readonly slug: string | null;
    readonly description: string | null;
    readonly keywords: readonly string[];
  };
  readonly cover: {
    readonly description: string | null;
    readonly altText: string | null;
    readonly manualUploadRequired: true;
  };
  readonly orderedBlocks: readonly NativeEditorBlock[];
  readonly sources: readonly (Pick<ArticleSource, 'id' | 'title' | 'url' | 'provenance'> & {
    readonly notes?: string;
  })[];
  readonly review: ArticleReview; // reused M08 editorial checklist, NOT publish approval
  readonly warnings: readonly string[]; // deterministic fixed codes: omissions and manual steps
  readonly requiresHumanReview: true;
}
```

Implementation imports `ArticleDraft`/`ArticleSource`/`ArticleBlock` and `normalizeArticleDraft` from `article-project.ts`, and `ArticleReview`/`validateArticleDraft` from `article-render.ts`. It invokes `normalizeArticleDraft(input)` exactly once and builds a **new bounded, deterministic object**; it does not mutate the input or store. `NativeArticleHandoff` is a TypeScript/JSON **data document**, not HTML or editor commands. The exact shape is intentionally narrow to make MCP schemas and review tests concrete; refine only with explicit failing test evidence and peer review.

### Ordered, loss-aware mapping rules

| M08 block           | Local handoff mapping      | What human must verify in LinkedIn's editor                                                    |
| ------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| `heading`           | `heading`                  | Apply appropriate heading level; canonical M08 has no arbitrary heading-depth metadata         |
| `paragraph`         | `paragraph`                | Paste as plain text; add links/emphasis manually where needed                                  |
| `bullets`           | `unordered_list`           | Treat line-separated text as proposed list items, check nesting/list style                     |
| `quote`             | `blockquote`               | Apply quote formatting and review attribution                                                  |
| `code`              | `code_manual`              | Preserve line breaks; human selects code style and verifies accuracy                           |
| `image_placeholder` | `image_manual_placeholder` | **No uploaded/fetched media**; insert only a rights-cleared image manually and verify alt text |

Retain **every** M08 block in original order and text; M08 normalization already rejects structurally invalid blocks. Never skip, deduplicate, merge, synthesize or silently truncate a block. Retain source-ID associations and a **separate** source directory, each source explicitly `user_supplied_unverified` (even if author review says `reviewed`). Preserve media placeholders and their positions. A block's raw text is serialized as a **JSON string/inert plain-text data**; never generate rich HTML, active Markdown image/link/autolink syntax or executable embeds from it. Downstream display must use text-only rendering (`textContent`, not `innerHTML`); M08's escaped preview is the safe visual alternative. Source URLs remain inert values and must never be fetched, auto-linked or assumed safe for browser automation. Prompt-looking text remains data.

M08 only stores `seo.slug`, `seo.description` and keywords; there is no separate SEO title, so `suggestedTitle` derives from `draft.title` and is **not** an SEO field already set on LinkedIn. No slug synthesis, image file path invention, generated cover URL, fake citation footnotes, post identifier, publish timestamp or completed-manual-step claim. Missing SEO title/slug/description, cover or block media is represented by `null` / explicit warning; never filled with ungrounded placeholders. The human must confirm editor fields, formatting, preview, source accuracy and image rights.

Warnings should use a fixed enum-like vocabulary (for example `manual_copy_required`, `formatting_review_required`, `missing_slug`, `missing_seo_description`, `missing_cover`, `image_placeholder_manual_upload`, `sources_unverified`, `publication_unavailable`) plus M08 `review.warnings` without treating `readyForReview` as publish readiness. Use a predictable warning order (global, document, then block order), no user-supplied prose in machine warning labels/errors. No field may assert `approved`, `verified`, `published`, `provider:OFFICIAL_API` or `publishReady:true`.

### Input/output bounds and failure behavior

- Reuse all M08 canonical bounds: at most 30 sources, 80 blocks, 12,000 text words and 200 KiB canonical input JSON, strict no extra fields, getters/proxies, malformed URL/secret aliases/fragments, control characters, malformed persisted bytes and ambiguous references. A handoff cannot be created from `id`, `projectId`, storage paths or an unvalidated `ArticleProject` envelope; the only content input is `draft`.
- Keep each text once in `orderedBlocks` and each source once in `sources`; avoid duplicate full preview or embedded media. Cap serialized pure handoff at **224 KiB UTF-8** and whole MCP envelope at existing **256 KiB**; if exceeded, fail with sanitized `handoff_too_large` / `output_too_large`, never drop blocks, citations or notes silently. Validate proper UTF-8 semantics; reject unpaired surrogate/replacement-derived corrupt text if the existing canonical model does not already reject it. No lossy Unicode coercion.
- Pure errors are deterministic and sanitized (`invalid_input` or `handoff_too_large`), never containing draft strings, source URLs or secrets. Never log raw inputs. Conversion is repeatable for an identical canonical draft; no timestamps, random IDs, network calls, filesystem calls or LinkedIn-related ambient state.

## Optional stateless MCP adapter

Proposed tool: **`linkedin.article.native.handoff`** registered alongside the existing article tools in `apps/server/src/article-mcp.ts` / `create-server.ts`; new transport contract tests in `apps/server/test/mcp-native-article-handoff.test.ts` and existing `tests/contract/{stdio-smoke,http-smoke}.test.ts` where relevant.

- Request: `{ draft: ArticleDraft }` only, using the same strict Zod-compatible M08 draft input schema. Reject `id`, `projectId`, `storePath`, `url`, `account`, `token`, `approval`, provider-selection and arbitrary extra keys.
- Success response: existing `LOCAL_ONLY` typed bounded MCP envelope with `data: NativeArticleHandoff`. Explicit `publicationStatus:'not_published'` and `nativePublishAvailability:'UNAVAILABLE'`. Stateless/read-only over **STDIO and HTTP**; no injected private store can be read by this handler, no host secrets or user identity needed.
- Malformed/capacity errors: existing sanitized `failed` response with typed error code; never raw input data. Use a strict output schema and verify the **entire** response (including textual MCP content + structuredContent) is within 256 KiB.
- The **optional local preparation tool** is NOT `linkedin.article.native.publish`, does not change that capability's availability and cannot be interpreted as authorization for any publishing step. Avoid adding a misleading native-publish entry or implicit external provider routing. If a distinct registry capability is later desired, name it explicitly `LOCAL_ONLY` handoff preparation and prove behavior first.

## Manual user workflow — outside automation

Human opens LinkedIn through their own authenticated browser (not launched or controlled by this server), chooses **Write article**, copies title/ordered text, manually applies styling, adds rights-cleared cover/media, reviews source claims, sets actual Article URL and SEO fields where available, uses LinkedIn's native preview, and manually decides whether to proceed to **Next → Publish**. These are **human-only instructions**: no scripted clicks, DOM mapping, clipboard injection, auto-upload, synthetic user gestures, session reuse, or fake human approval receipt. The handoff never returns a published URL or `successfully_published` status.

## External native publication blocker and future gate

True native article creation remains **BLOCKED/UNAVAILABLE** until a legitimate, specifically approved route is independently verified (documented API or express authorization for a compliant provider), with exact scopes/permissions, app/account entitlement, provider identity and integration contract. A later design must cover trusted out-of-band human approval tied to article hash and identity, idempotency, dry-run preview, verified native article URL, uncertain-commit recovery, no deceptive Posts API fallback, and challenge handling that **stops** on security verification. No unapproved browser automation should be implemented or tested against LinkedIn while this blocker stands. These acceptance conditions are **not deliverables of the local handoff** and must not be checked as complete.

## Test, review and acceptance boundaries

Test first with an intentionally failing module import/behavior for the pure converter, then real RED→GREEN cases for ordered fidelity (all 6 block kinds, repeats, Unicode, newline and code indentation), source-ID provenance, HTML/Markdown/prompt injection staying inert data, missing SEO/media warnings, invalid URL aliases/fragments and hostile shape, strict output byte limits, immutability/determinism, no I/O and no raw errors. Verify manual-only flags and refusal to manufacture a published URL. For the optional MCP adapter, prove tool missing/invalid/unregistered RED before implementing it; then typed outputs and bounds, real built STDIO/HTTP call, private-store isolation and unchanged `article.native.publish:UNAVAILABLE` GREEN. No tests should contact LinkedIn or rely on a browser session.

Independent reviewers must explicitly check: **provider truthfulness**, no hidden Article Post/link-preview confusion, policy/consent, unauthorized automation surface, source provenance, active-content injection, loss warnings, exact order, no silent content loss, deterministic errors, private-state/secret isolation and transport/schema/budget enforcement. M09.0 design is **not** M09 full native-publication completion. Required later project state: local preparation can be verified separately, while external native publish acceptance remains **BLOCKED** unless independently documented lawful/authorized capability becomes available; do not mark M09 `COMPLETE` on handoff tests alone.

# LinkedIn MCP

TypeScript MCP server for LinkedIn workflows with explicit provider provenance, approval boundaries and durable development state.

The implementation includes foundation tools, local article preparation, OAuth identity, text/media publishing and comment/reaction workflows. Tool discovery and deterministic CI do not establish live LinkedIn access. Live reads/writes require a legitimately configured application, member authorization and the relevant product/scopes. See `docs/progress/project-state.json` and `docs/milestones/CURRENT.md` for current integration status.

## Start with an article

The local article workflow needs Node 24 and pnpm 12.9.1, but no LinkedIn credentials. From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm build
```

Connect an MCP client to `node` with the absolute path to `apps/server/dist/stdio.js` as its argument. The client starts and manages the process; its stdout carries MCP protocol messages and is not a terminal interface. For example, Codex users can register it under a separate name from the repository root:

```bash
codex mcp add linkedin-article-local -- "$(command -v node)" "$(pwd)/apps/server/dist/stdio.js"
```

Use a Node 24 executable in this command, and keep the checkout and built files at the same path. Existing MCP clients may need to reload their configuration. Registration does not link a LinkedIn account.

In the MCP client, ask for an article draft and use `linkedin.article.draft.validate` or `linkedin.article.draft.preview` to review a supplied structured draft. Call `linkedin.article.native.handoff` with that draft to get the title and ordered copyable blocks. Copy and format those blocks in LinkedIn's **Write article** editor and publish there yourself after review. Sources are author-supplied and unverified; the handoff does not open LinkedIn, publish, or confirm a publication. Native article publishing remains unavailable in the server.

Saved article projects are optional and STDIO-only; configure `LINKEDIN_MCP_ARTICLE_STORE_PATH` to a private absolute path before launching the server if persistence is needed. Without it the stateless drafting and handoff tools still work.

## Tools

Built runtimes discover 67 tools even when OAuth/publishing is unconfigured. Available tool names and capability status can be checked through MCP discovery and `linkedin.capabilities`:

- `linkedin.health`, `linkedin.version`, `linkedin.capabilities` — local control plane and truthful capability metadata.
- `linkedin.auth.start`, `linkedin.auth.status`, `linkedin.profile.me`, `linkedin.auth.logout` — authorization, connection status, identity and local credential cleanup. Product-dependent OAuth/refresh support remains access-dependent.
- `linkedin.article.draft.validate`, `linkedin.article.draft.preview`, `linkedin.article.draft.companion`, `linkedin.article.native.handoff` — local article review and manual editor preparation; no remote publication.
- `linkedin.post.preview.text` — local canonical text payload/hash; no authorization, receipt, provider call or file write.
- `linkedin.post.approve.text` — requests a short-lived receipt for an independently reviewed host grant, connected member identity and granted write scope. The input intent flag alone is insufficient.
- `linkedin.post.create.text` — consumes an eligible subject/payload-bound receipt and caller idempotency key, durably reserves the operation, and attempts one official Posts request.
- Image and multi-image post preview/approve/create tools use the same receipt, media validation and durable no-duplicate boundaries.
- `linkedin.comments.get`, `linkedin.comments.list`, `linkedin.comments.inbox` read explicit bounded comment threads only when restricted access is enabled.
- Reply and reaction preview/approve/write tools require separate Community Management permissions and trusted approval grants.

Preview and approval use `LOCAL_ONLY` provenance. Preview data identifies `OFFICIAL_API` as its publication target. Publication uses `OFFICIAL_API`; static live `post.create.text` availability remains `UNAVAILABLE` until legitimate live evidence exists.

A successful creation returns its provider post URN, replay flag and separate verification state. Read confirmation defaults disabled and requires explicitly configured legitimate member-read access plus granted `r_member_social`. Unavailable or failed confirmation preserves known creation success. No post URL is constructed or labeled verified. Ambiguous remote acceptance is non-retryable `partial/outcome_unknown`; never retry it with a new key or delete its ledger record. Successful replay performs no second POST.

The bundled stdio and HTTP entrypoints have no trusted human approval UI and therefore fail closed when an approval receipt is requested. An embedding host must authenticate the human and display the exact preview before issuing a one-time grant. See `docs/security/TRUSTED-APPROVALS.md` for the host integration contract.

## Development and transports

Use Node 24 and the repository-pinned pnpm 12.9.1:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm test
pnpm lint
pnpm typecheck
pnpm build
node apps/server/dist/stdio.js
```

The built stdio entrypoint writes MCP protocol only to stdout. Streamable HTTP is available through `createHttpServer()` exported from `apps/server/dist/http.js`; manage its returned `close()` lifecycle. It binds loopback, validates Host/same-origin browser Origin, accepts origin-less MCP clients and bounds request bodies to 1 MiB by default. Both transports share one auth/approval/publishing runtime across connections.

## Configuration

Export environment variables before startup; `.env.example` is a template and is not automatically loaded. OAuth configuration requires a legitimate LinkedIn application, redirect URI, requested scopes, private credential-store path and a canonical base64 encryption key for exactly 32 random bytes. Confidential mode also requires its application secret; native PKCE is usable only when the configured application legitimately supports it. Keep secrets outside Git. See the M01 design under `docs/superpowers/specs/` for its callback/credential boundaries.

Text publication requires both nonsecret settings below, plus OAuth credentials granting `w_member_social`:

| Variable                                | Rule                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `LINKEDIN_MCP_API_VERSION`              | Explicit supported LinkedIn API version in YYYYMM form; no fallback.                                                          |
| `LINKEDIN_MCP_IDEMPOTENCY_LEDGER_PATH`  | Explicit private local path, resolved absolutely; must differ from the credential-store path. No global/default ledger.       |
| `LINKEDIN_MCP_APPROVAL_TTL_MS`          | Positive integer <=600000; default 300000.                                                                                    |
| `LINKEDIN_MCP_MEMBER_POST_READ_ENABLED` | Exact true/false; default false. Enable only for legitimate member-read product access. Granted read scope is still required. |

Partial publishing configuration keeps local tools and authorization discoverable and returns structured `publishing_not_configured` for publication. Requested scopes/configuration do not independently prove permission. Administrative paths, flags and credentials cannot be supplied through publishing tools or appear in their outputs.

The ledger uses restrictive permissions, atomic replacement and fail-closed exclusive sibling locks. Recover a stale lock only after proving its former owner stopped, and preserve every mutation record. A restarted runtime needs fresh local approval before replay because receipts are intentionally held in memory.

## Safety and autonomous development

The architecture prefers legitimately available official APIs and preserves partner, external-discovery, browser-interactive and unavailable distinctions. Browser work, when introduced, must stop at CAPTCHA/security challenges. Consequential writes retain explicit approval/idempotency boundaries; ordinary CI uses injected providers and never publishes a real post.

Start with `CODEX-START-HERE.md`, obey `AGENTS.md` and recover actual Git/PR/exact-SHA CI before continuing. Milestones merge only through the repository's documented review and verification gates.

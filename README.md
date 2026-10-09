# LinkedIn MCP

TypeScript MCP server for LinkedIn workflows with explicit provider provenance, approval boundaries and durable development state.

The implementation includes foundation tools, OAuth identity and approval-gated member text publishing. Tool discovery and deterministic CI do not establish live LinkedIn access. Live reads/writes require a legitimately configured application, member authorization and the relevant product/scopes. See `docs/progress/project-state.json` and `docs/milestones/CURRENT.md` for current integration status.

## Tools

Built runtimes discover ten tools even when OAuth/publishing is unconfigured:

- `linkedin.health`, `linkedin.version`, `linkedin.capabilities` — local control plane and truthful capability metadata.
- `linkedin.auth.start`, `linkedin.auth.status`, `linkedin.profile.me`, `linkedin.auth.logout` — authorization, connection status, identity and local credential cleanup. Product-dependent OAuth/refresh support remains access-dependent.
- `linkedin.post.preview.text` — local canonical text payload/hash; no authorization, receipt, provider call or file write.
- `linkedin.post.approve.text` — explicit approval intent; issues a short-lived local receipt only for connected persisted member identity and granted write scope. It does not refresh credentials or publish.
- `linkedin.post.create.text` — consumes an eligible subject/payload-bound receipt and caller idempotency key, durably reserves the operation, and attempts one official Posts request.

Preview and approval use `LOCAL_ONLY` provenance. Preview data identifies `OFFICIAL_API` as its publication target. Publication uses `OFFICIAL_API`; static live `post.create.text` availability remains `UNAVAILABLE` until legitimate live evidence exists.

A successful creation returns its provider post URN, replay flag and separate verification state. Read confirmation defaults disabled and requires explicitly configured legitimate member-read access plus granted `r_member_social`. Unavailable or failed confirmation preserves known creation success. No post URL is constructed or labeled verified. Ambiguous remote acceptance is non-retryable `partial/outcome_unknown`; never retry it with a new key or delete its ledger record. Successful replay performs no second POST.

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

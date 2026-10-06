# LinkedIn MCP

Production-grade Model Context Protocol foundation for LinkedIn-oriented workflows with explicit provider provenance, approval boundaries and durable autonomous-development state.

## Current status

M00 — Foundation + Autonomous Control Plane is implementation-complete and in its final merge gate. M00 does **not** authenticate to LinkedIn, read LinkedIn account data, publish content, automate the LinkedIn browser UI or claim access that has not been established.

## Verified M00 tools

- `linkedin.health` — local server health; always reports `linkedinConnected: false` in M00.
- `linkedin.version` — local server/version metadata.
- `linkedin.capabilities` — truthful capability, provider, availability and approval metadata.

These three tools are `LOCAL_ONLY`. Future LinkedIn capabilities remain planned/unavailable until their milestone establishes legitimate access and verification evidence.

## Transports

- stdio: the built `apps/server/dist/stdio.js` entry point is verified through a real `StdioClientTransport`.
- Streamable HTTP: `createHttpServer()` is verified through a real loopback `StreamableHTTPClientTransport` connection.

HTTP is loopback-only by construction, validates Host and same-origin browser Origin values, preserves origin-less MCP clients, and bounds request bodies to 1 MiB by default.

## Development

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

The repository uses strict TypeScript, pnpm lockfile verification, exact-SHA CI evidence and RED→GREEN TDD for meaningful behavior.

## Safety and provenance

The architecture is official-API-first but does not represent partner-only, external-discovery or browser-interactive capabilities as official LinkedIn API access. Browser-interactive work, if activated by a later milestone, must stop at CAPTCHA/security challenges and may not bypass platform controls. Consequential writes require the approval/idempotency boundaries defined by their milestones.

Start autonomous development with `CODEX-START-HERE.md` and recover durable state from `docs/progress/project-state.json` plus `docs/milestones/CURRENT.md`.

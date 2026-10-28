# M17.1 HTTP request body limit validation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement task by task.

**Goal:** Reject invalid HTTP request-body limits before creating a listener, with one shared finite safe 16 MiB bound.

**Architecture:** Export a single maximum from `apps/server/src/config.ts`, use the existing configurable integer parser for the environment, and validate the direct `createHttpServer` option before runtime or HTTP server setup. Keep all read/response transport paths otherwise intact.

**Tech Stack:** TypeScript, Node.js 24, Vitest, pnpm, MCP STDIO/HTTP.

**Spec:** `docs/superpowers/specs/2026-10-28-m17-http-body-limit-validation-design.md`

## Global Constraints

- Default request body limit remains 1,048,576 bytes; maximum configured limit is 16,777,216 bytes.
- Keep 256 KiB HTTP response ceiling, 96 KiB tool pages, 67-tool inventory and private STDIO-only stores.
- Do not change slow partial-upload rejection or batched response buffering in this task.
- Full Node24 and exact SHA CI plus independent Critical0 Important0 review required before merge.

## Review Focus

- Invalid direct `NaN`, both infinities, 0, negative, fractional and unsafe/overlarge values reject without leaving listening sockets.
- Environment `1e20` and above-maximum values reject rather than relying on `Number.isInteger` alone.
- Positive 1-byte, default 1 MiB, and 16 MiB edge settings remain permitted.
- Completed over-limit POST still yields HTTP 413 while valid requests preserve ordinary SDK behavior.
- No source, provider, private-state, security-header, tool-list pagination or response-size drift.

### Task 1: Regression RED

**Files:** `apps/server/test/http.test.ts`, `apps/server/test/config.test.ts`.

- [ ] Add table-driven server option rejection assertions, closing any unexpectedly created server so genuine RED does not hang.
- [ ] Add environment rejection tests for overlarge and unsafe integer strings plus acceptance at the maximum.
- [ ] Run `pnpm exec vitest run apps/server/test/http.test.ts apps/server/test/config.test.ts --reporter=dot`; require failure specifically because invalid limits currently pass.

### Task 2: Minimum GREEN

**Files:** `apps/server/src/config.ts`, `apps/server/src/http.ts`.

- [ ] Export shared `MAX_HTTP_REQUEST_BODY_LIMIT_BYTES = 16 * 1_048_576` from config.
- [ ] Pass that max to existing env integer parser at `LINKEDIN_MCP_BODY_LIMIT_BYTES`.
- [ ] In `createHttpServer`, use `Number.isSafeInteger`, >0, and <= max to reject invalid options before runtime/server setup with sanitized error. Resolve explicit option first, then `parseConfig().requestBodyLimitBytes` to ensure the environment limit is actually enforced; test real POST 413 with env=1 and 200 with explicit 1 MiB override.
- [ ] Re-run focused tests and verify GREEN, then test completed 413 and valid low/high boundaries.

### Task 3: Release verification

**Files:** `docs/milestones/M17-production-hardening.md`, `docs/milestones/CURRENT.md`, `docs/progress/STATUS.md`, `docs/progress/project-state.json`, `docs/progress/KNOWN-ISSUES.md`, `docs/requirements/TRACEABILITY.md`.

- [ ] Run frozen Node24 full suite, framework, real built STDIO/HTTP, Prettier, lint, typecheck and build.
- [ ] Obtain independent read-only adversarial review and close Critical/Important findings.
- [ ] Record verified scope and keep overall M17 planned and M13.1 provider-blocked.
- [ ] Persist exact local tree via GitHub connector, verify feature branch SHA/tree/blobs, PR CI SUCCESS, guarded squash and distinct exact post-merge main CI SUCCESS.

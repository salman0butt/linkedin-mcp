# M00 Foundation Implementation Plan

> **For agentic workers:** execute this plan with Superpowers `executing-plans`, strict TDD, systematic debugging, code review, and verification-before-completion. The repository owner has explicitly pre-authorized routine design/spec/plan decisions and autonomous execution; do not pause for routine approval gates.

**Goal:** Build the production-quality LinkedIn MCP product foundation and durable autonomous-development control plane defined in `docs/superpowers/specs/2026-10-05-m00-foundation-design.md`.

**Architecture:** A small TypeScript monorepo with an MCP server factory, provider-aware core contracts, three read-only foundation tools, stdio and Streamable HTTP transports, plus Git-backed project state, milestone ledgers, traceability, capability provenance, and CI-enforced recovery invariants.

**Implementation-time toolchain baseline (verified 2026-10-05):**
- Node.js 24 LTS line.
- pnpm 12.x current line; pin via `packageManager` and CI.
- TypeScript current stable line; choose the latest compatible stable release and lock it.
- `@modelcontextprotocol/server` 2.3.x.
- `@modelcontextprotocol/client` 2.3.x for contract tests.
- `@modelcontextprotocol/node` 2.1.x for Node HTTP adaptation and Host/Origin guards.
- Zod 4.x.
- Vitest.
- Pino or equivalent structured logger.

**Spec:** `docs/superpowers/specs/2026-10-05-m00-foundation-design.md`

## Global constraints

- No LinkedIn OAuth, user tokens, account reads, or mutations in M00.
- No browser automation in M00.
- No fake capability claims. Provider provenance is explicit.
- No product code without a meaningful failing test first, except documentation/configuration-only bootstrap files where an artificial behavioral RED would add no value.
- No hidden CI failures (`|| true`, `continue-on-error`, skipped required gates).
- No completion claim without exact-final-head CI evidence.
- One milestone branch: `feat/m00-foundation`.
- One draft milestone PR; reuse it until M00 is complete.
- Before each remote write/push/merge, recover the remote head and check for concurrent work.

## Review focus

Skeptical review must explicitly look for these failure modes:
1. **False LinkedIn availability** — capabilities described as official/available without evidence.
2. **Transport exposure** — HTTP binding beyond loopback by default, missing Host/Origin validation, or unbounded request bodies.
3. **Secret leakage** — config/logging paths that could emit credentials in later milestones.
4. **Recovery drift** — `project-state.json`, `STATUS.md`, `CURRENT.md`, active ledger, capability matrix, or traceability disagreeing silently.
5. **TDD theater** — tests added after implementation, broad mocks that bypass real MCP contracts, or stale CI used as proof.

---

## Task 1 — Establish repository toolchain and durable control-plane skeleton

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.nvmrc`
- Create: `README.md`
- Create: `AGENTS.md`
- Create: `CODEX-START-HERE.md`
- Create: `docs/AUTONOMOUS-DEVELOPMENT.md`
- Create: `docs/product/PRD.md`
- Create: `docs/product/ARCHITECTURE.md`
- Create: `docs/product/CAPABILITY-MATRIX.md`
- Create: `docs/requirements/README.md`
- Create: `docs/requirements/TRACEABILITY.md`
- Create: `docs/progress/project-state.json`
- Create: `docs/progress/STATUS.md`
- Create: `docs/progress/KNOWN-ISSUES.md`
- Create: `docs/milestones/README.md`
- Create: `docs/milestones/CURRENT.md`
- Create: `docs/milestones/M00-foundation.md` through `M17-production-hardening.md`

### Steps

1. Reconfirm current `main` SHA and that no milestone branch/PR already exists.
2. Create `feat/m00-foundation` from the plan commit.
3. Add strict TypeScript/pnpm/ESM configuration and lockfile-ready package manifest.
4. Persist the complete product PRD and roadmap rather than relying on this chat.
5. Encode one unambiguous autonomous policy in `AGENTS.md`:
   - Git/repository recovery precedence;
   - Superpowers first;
   - owner standing approval for routine design/spec/plan decisions;
   - strict TDD/review/verification;
   - `AUTO_CREATE_PR=true`, `AUTO_UPDATE_PR=true`, `AUTO_MERGE=true` only through explicit gates;
   - capability provenance and LinkedIn safety boundaries.
6. Initialize `project-state.json` with truthful unknown/not-run values and exactly one `exactNextWork`.
7. Initialize `STATUS.md`/`CURRENT.md`/M00 ledger to the same active task.
8. Do not mark any runtime capability VERIFIED before tests/CI exist.
9. Run formatting/static configuration checks as soon as dependencies are installed.
10. Commit the coherent control-plane/toolchain bootstrap.

**Expected evidence:** repository can install deterministically, durable state can be recovered without chat, and the next task is unambiguous.

---

## Task 2 — Autonomous framework and state consistency verifier (TDD)

**Files:**
- Create: `scripts/verify-autonomous-framework.ts`
- Create: `scripts/verify-milestone-state.ts`
- Create: `scripts/verify-requirements-coverage.ts`
- Create: `scripts/verify-capability-matrix.ts`
- Create: `tests/framework/autonomous-framework.test.ts`
- Create: `tests/framework/milestone-state.test.ts`
- Create: `tests/framework/requirements-coverage.test.ts`
- Create: `tests/framework/capability-matrix.test.ts`

### Required behavior

The verifiers must fail on:
- missing mandatory recovery files;
- missing M00–M17 ledgers;
- missing required milestone-ledger sections;
- missing traceability columns;
- missing capability-matrix columns;
- zero or multiple exact-next-work values;
- `project-state.json` milestone/branch/PR/status disagreement with compact Markdown state where machine-checkable;
- a capability marked VERIFIED/AVAILABLE without verification evidence;
- unsupported status/provider values.

### TDD sequence

1. RED: write the smallest tests that import/call verifiers that do not yet exist; run and confirm the intended module/behavior failure.
2. GREEN: implement minimal parser/validators.
3. Add negative fixture tests one invariant at a time.
4. Refactor shared file-reading/Markdown-table helpers only after green.
5. Run all framework tests plus typecheck/lint.
6. Record RED and GREEN SHAs/CI once CI exists.

---

## Task 3 — Core provider-aware contracts and capability registry (TDD)

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/result.ts`
- Create: `packages/core/src/capabilities.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/test/result.test.ts`
- Create: `packages/core/test/capabilities.test.ts`

### Contracts

Define:
- `ProviderType = OFFICIAL_API | PARTNER_API | EXTERNAL_DISCOVERY | BROWSER_INTERACTIVE | LOCAL_ONLY`.
- Capability availability/state separately includes `UNAVAILABLE`; do **not** misuse `UNAVAILABLE` as a provider that executed a tool.
- Tool result statuses from the design spec.
- `CapabilityDescriptor` with id, desired behavior, provider type or unavailable state, milestone, status, permission/access note, approval requirement, and evidence.
- Immutable foundation registry containing at least:
  - `profile.me`
  - `post.create.text`
  - `post.create.image`
  - `post.create.multi_image`
  - `comments.list`
  - `comments.reply`
  - `reactions.add`
  - `posts.search`
  - `jobs.search`
  - `article.draft`
  - `article.native.publish`
  - `messages.send`

M00 must truthfully mark future LinkedIn-backed capabilities as PLANNED/UNAVAILABLE or access-dependent, not operational.

### TDD sequence

1. RED: test provider/status enum validation and capability-registry truthfulness.
2. GREEN: implement minimum types/runtime schemas and immutable registry.
3. RED: add duplicate capability-ID and invalid evidence-state tests.
4. GREEN: reject invalid registry construction.
5. Refactor only while green.

---

## Task 4 — Server configuration and structured logger (TDD)

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/config.ts`
- Create: `apps/server/src/logger.ts`
- Create: `apps/server/test/config.test.ts`
- Create: `apps/server/test/logger.test.ts`

### Configuration contract

- transport: `stdio | http`;
- default HTTP host: `127.0.0.1`;
- bounded valid HTTP port;
- log level whitelist;
- server name/version defaults;
- request body size bound with safe default;
- actionable validation errors.

### Logger contract

Redact secret-like keys including tokens, authorization headers, cookies, passwords, client secrets, and refresh/access tokens.

### TDD sequence

1. RED defaults test.
2. GREEN parser defaults.
3. RED invalid transport/port/host/body-limit cases.
4. GREEN validation.
5. RED logger redaction cases.
6. GREEN redaction configuration.
7. Focused + broader verification.

---

## Task 5 — Foundation result factories (TDD)

**Files:**
- Create: `apps/server/src/foundation.ts`
- Create: `apps/server/test/foundation.test.ts`

Implement deterministic/testable factories for:
- health result;
- version result;
- capabilities result.

Inject request ID and clock/time source so tests do not depend on wall-clock randomness.

### TDD sequence

1. RED health result contract.
2. GREEN health implementation.
3. RED version metadata contract.
4. GREEN version implementation.
5. RED capabilities result/provenance contract.
6. GREEN capabilities implementation.
7. Verify returned capability data cannot accidentally claim LinkedIn connectivity.

---

## Task 6 — MCP server factory and real-client contract tests (TDD)

**Files:**
- Create: `apps/server/src/create-server.ts`
- Create: `apps/server/test/mcp-contract.test.ts`

### MCP API

Create `createLinkedInMcpServer(deps?)` using current MCP v2 APIs:
- `McpServer` from `@modelcontextprotocol/server`;
- `registerTool` for:
  - `linkedin.health`
  - `linkedin.version`
  - `linkedin.capabilities`;
- output schemas and `structuredContent` for successful calls.

### Contract-test rule

Do not test only handler internals. Drive the server with the real `@modelcontextprotocol/client` through `StreamableHTTPClientTransport` and an in-process `createMcpHandler(...).fetch` bridge, matching official MCP testing guidance.

### TDD sequence

1. RED: real client cannot list/call tools because factory is missing.
2. GREEN: implement only health registration first.
3. RED/GREEN version tool.
4. RED/GREEN capabilities tool.
5. Assert exact public tool names, schemas and structured result shapes.
6. Assert malformed arguments fail through MCP validation rather than custom ad-hoc parsing.

---

## Task 7 — stdio transport and built-process smoke (TDD)

**Files:**
- Create: `apps/server/src/stdio.ts`
- Create/update: `apps/server/package.json`
- Create: `tests/contract/stdio-smoke.test.ts`

Use `serveStdio` / `StdioServerTransport` from `@modelcontextprotocol/server/stdio` according to current SDK APIs.

### TDD sequence

1. RED: `StdioClientTransport` cannot spawn/call the not-yet-built server entry.
2. GREEN: add stdio entry composition.
3. Build.
4. GREEN: spawn the actual built JS process with the real MCP client and call `linkedin.health`.
5. Assert no non-protocol log output is written to stdout; logs must use stderr or a safe sink.

---

## Task 8 — Streamable HTTP transport hardening (TDD)

**Files:**
- Create: `apps/server/src/http.ts`
- Create: `apps/server/test/http.test.ts`
- Create: `tests/contract/http-smoke.test.ts`

Use current MCP v2 server/Node APIs:
- `createMcpHandler` from `@modelcontextprotocol/server`;
- Node bridge from `@modelcontextprotocol/node`;
- localhost Host validation;
- localhost Origin validation;
- bounded request bodies;
- loopback bind by default.

### TDD sequence

1. RED: test composition missing.
2. GREEN: add local handler and server lifecycle.
3. RED: malicious/unapproved `Host` rejected.
4. GREEN: Host guard.
5. RED: malicious/unapproved browser `Origin` rejected while origin-less non-browser MCP clients remain allowed.
6. GREEN: Origin guard.
7. RED: oversized body rejected.
8. GREEN: body bound.
9. Real client smoke against ephemeral loopback port; call `linkedin.health`.
10. Ensure shutdown closes HTTP and MCP handlers cleanly.

---

## Task 9 — CI workflow and quality gate

**Files:**
- Create: `.github/workflows/ci.yml`
- Update: `package.json`
- Update: workspace package scripts.

CI must run on pull requests and `main` pushes with concurrency cancellation per ref.

Required steps:
1. checkout;
2. setup pinned pnpm;
3. setup Node 24;
4. `pnpm install --frozen-lockfile`;
5. format check;
6. lint;
7. typecheck;
8. unit/contract/framework tests;
9. build;
10. stdio/HTTP smoke tests;
11. autonomous framework verifier;
12. requirements coverage verifier;
13. milestone-state verifier;
14. capability-matrix verifier.

No LinkedIn credentials in CI.

After the first workflow-capable commit, use GitHub Actions as durable RED/GREEN evidence where useful, but do not intentionally break `main`.

---

## Task 10 — Open the durable M00 draft PR

After the first coherent branch state and basic CI exist:
- open one draft PR titled `Build LinkedIn MCP foundation`;
- base `main`, head `feat/m00-foundation`;
- describe goal, architecture, safety boundaries, current TDD evidence, verification status, and exact next unit;
- keep it draft until M00 closeout gates pass.

Do not create duplicate PRs on later scheduled runs.

---

## Task 11 — M00 closeout, skeptical review, exact-SHA verification and merge

**Files to reconcile:**
- `docs/progress/project-state.json`
- `docs/progress/STATUS.md`
- `docs/progress/KNOWN-ISSUES.md`
- `docs/milestones/CURRENT.md`
- `docs/milestones/M00-foundation.md`
- `docs/requirements/TRACEABILITY.md`
- `docs/product/CAPABILITY-MATRIX.md`
- `README.md`
- `docs/superpowers/evidence/2026-10-05-m00-foundation-closeout.md`

### Review

Perform skeptical review across:
- PRD/requirement compliance;
- architecture/YAGNI/coupling;
- MCP protocol correctness;
- transport/security boundaries;
- test quality and real-client coverage;
- secret/logging safety;
- capability provenance honesty;
- autonomous recovery consistency;
- dependency/toolchain maintenance risk.

Classify findings Critical / Important / Minor. Fix all Critical and Important findings; behavioral fixes require regression RED→GREEN where practical. Re-review after fixes.

### Final verification

Run the complete repository gate locally when possible and then require GitHub Actions GREEN on the exact final PR head SHA. Re-check that no newer commit exists and no blocking review thread remains.

### Merge gate

When and only when every durable M00 acceptance criterion is satisfied:
1. mark PR ready if needed;
2. verify remote head and mergeability again;
3. squash-merge under the standing owner authorization;
4. recover resulting `main` SHA;
5. verify post-merge `main` CI on that SHA;
6. if post-merge CI fails, repair before advancing;
7. mark M00 integrated and activate M01 Authentication & Identity;
8. create/reuse M01 branch/PR and continue if the current invocation can safely progress.

---

## Execution ledger

During implementation, the active M00 ledger must record per behavioral unit:
- RED commit/SHA and why it is a genuine RED;
- GREEN commit/SHA;
- exact CI run/result when available;
- invalid/non-evidence runs explicitly identified;
- review findings and fixes;
- exact next work.

Never infer that tests or CI passed. Record only observed evidence.

## Plan self-review

This plan intentionally avoids:
- OAuth/database/browser work before M01+ requirements need it;
- speculative empty packages;
- microservices/queues/generic agent frameworks;
- broad LinkedIn automation claims;
- a second scheduler-owned source of truth.

The plan matches the M00 design: product runtime foundation and durable autonomous control plane are completed together, while all LinkedIn account access remains deferred to later milestones.
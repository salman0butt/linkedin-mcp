# LinkedIn MCP — M00 Foundation Design

Date: 2026-10-05
Status: DESIGN — OWNER REVIEW REQUIRED BEFORE IMPLEMENTATION PLAN

## 1. Goal

Establish the durable product and engineering foundation for `salman0butt/linkedin-mcp`: a production-grade TypeScript Model Context Protocol server for LinkedIn workflows that can be developed safely across many completely fresh ChatGPT/Codex sessions without relying on conversational memory.

M00 must produce two foundations together:

1. **Product/runtime foundation** — a minimal MCP server with typed schemas, transports, health/capability discovery, tests, logging, configuration and CI.
2. **Autonomous-development control plane** — durable PRD, milestone ledgers, machine-readable state, Superpowers artifacts, requirements traceability and CI-enforced recovery invariants.

No real LinkedIn account mutation belongs in M00.

## 2. Product intent

The long-term MCP should let compatible AI clients research, plan, draft, publish and manage LinkedIn workflows through explicit tools/resources/prompts while keeping capability boundaries transparent.

Core long-term capability families are:

- LinkedIn identity/authentication;
- job discovery and job intelligence;
- post/content search;
- text/image/multi-image publishing;
- comments, replies and reactions;
- long-form article research, drafting and optional native publication;
- scheduling/content calendar;
- analytics;
- company/page support;
- later networking and messaging where legitimately available.

The implementation is **official-API first**. Capabilities not exposed through ordinary LinkedIn developer access must be represented by explicit alternative providers (partner API, external discovery, or optional interactive browser adapter), never silently treated as official API functionality.

## 3. Non-negotiable architecture rule

The stable public MCP contract must not depend directly on one LinkedIn access mechanism.

```text
MCP client
  -> MCP tool/resource/prompt
  -> domain service
  -> capability router
  -> provider interface
  -> official API | partner API | discovery | optional browser adapter
```

The MCP contract is durable; LinkedIn access mechanisms are replaceable adapters.

## 4. Capability provenance

Every externally backed operation must eventually expose a capability/provider classification:

- `OFFICIAL_API`
- `PARTNER_API`
- `EXTERNAL_DISCOVERY`
- `BROWSER_INTERACTIVE`
- `LOCAL_ONLY`
- `UNAVAILABLE`

M00 does not implement LinkedIn-backed operations, but it must define the capability model so later milestones cannot blur these boundaries.

## 5. Technology decisions

### Runtime and language

- Node.js 24 LTS-compatible runtime target unless current implementation-time verification requires a supported adjustment.
- TypeScript with strict compiler settings.
- pnpm workspace/monorepo.

### MCP

- Current stable official TypeScript MCP SDK at implementation time.
- Primary transports:
  - stdio;
  - Streamable HTTP.

### Validation

- Zod or the validation library required/recommended by the selected MCP SDK version.
- Runtime validation at every external/tool boundary.

### Testing

- Vitest for unit/contract tests.
- MCP Inspector-compatible smoke/contract verification.
- No live LinkedIn credentials in ordinary CI.

### Logging/observability

- Structured logs (Pino or equivalent).
- Secrets/tokens must never be logged.
- Request/correlation identity should be designed from the beginning.

### Persistence

M00 should avoid unnecessary database infrastructure. Durable project state lives in Git. Runtime persistence may start as an interface plus local-only implementation only when a concrete M00 acceptance criterion needs it. OAuth/token persistence belongs to M01.

## 6. Repository shape

Target repository layout after M00:

```text
linkedin-mcp/
├── AGENTS.md
├── CODEX-START-HERE.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
├── apps/
│   ├── server/
│   └── cli/
│
├── packages/
│   ├── mcp/
│   ├── linkedin-core/
│   └── schemas/
│
├── docs/
│   ├── AUTONOMOUS-DEVELOPMENT.md
│   ├── product/
│   │   ├── PRD.md
│   │   ├── ARCHITECTURE.md
│   │   └── CAPABILITY-MATRIX.md
│   ├── requirements/
│   │   ├── README.md
│   │   └── TRACEABILITY.md
│   ├── progress/
│   │   ├── project-state.json
│   │   ├── STATUS.md
│   │   └── KNOWN-ISSUES.md
│   ├── milestones/
│   │   ├── README.md
│   │   ├── CURRENT.md
│   │   └── M00...M17 ledgers
│   └── superpowers/
│       ├── specs/
│       ├── plans/
│       └── evidence/
│
├── scripts/
│   ├── verify-autonomous-framework.ts
│   ├── verify-requirements-coverage.ts
│   ├── verify-milestone-state.ts
│   └── verify-capability-matrix.ts
│
├── tests/
│   ├── contract/
│   └── unit/
│
└── .github/workflows/ci.yml
```

M00 should create only packages actually needed for foundation behavior. Empty speculative packages should not be scaffolded merely to match the future tree.

## 7. Durable source-of-truth model

Fresh autonomous sessions must use this precedence when sources disagree:

```text
1. actual Git graph / remote branch heads
2. source code + tests at the relevant SHA
3. exact-SHA CI and artifacts
4. current PR/reviews/review threads
5. docs/progress/project-state.json
6. STATUS.md / CURRENT.md / active milestone ledger
7. PRD / traceability / capability matrix
8. older handoffs/history
9. previous chat memory
```

Stale prose must be repaired to match verified repository reality, not the reverse.

## 8. Machine-readable project state

`docs/progress/project-state.json` is the compact machine-readable recovery index.

Initial schema concept:

```json
{
  "schemaVersion": 1,
  "currentMilestone": "M00",
  "currentIteration": "M00.1",
  "status": "ACTIVE",
  "activeBranch": "feat/m00-foundation",
  "activePr": null,
  "baseBranch": "main",
  "latestVerifiedSha": null,
  "ciStatus": "NOT_RUN",
  "criticalFindings": 0,
  "importantFindings": 0,
  "blockers": [],
  "exactNextWork": "Bootstrap the TypeScript MCP workspace through genuine TDD."
}
```

Rules:

- exactly one `exactNextWork` action;
- no fabricated SHA/CI/PR values;
- use explicit `UNKNOWN`, `NOT_RUN`, `BLOCKED` or `null` when evidence does not exist;
- CI verifier checks consistency with durable Markdown markers where reasonably machine-checkable.

## 9. Autonomous-development control plane

M00 must adapt the successful `hire-evidence` recovery model while removing policy ambiguity.

Required durable documents:

- `AGENTS.md` — authoritative repository engineering/autonomy policy;
- `CODEX-START-HERE.md` — concise fresh-session entrypoint;
- `docs/AUTONOMOUS-DEVELOPMENT.md` — detailed recover/select/TDD/review/verify/merge/continue workflow;
- `docs/progress/project-state.json` — machine-readable current state;
- `docs/progress/STATUS.md` — human-readable compact recovery status;
- `docs/progress/KNOWN-ISSUES.md` — unresolved blockers/findings;
- `docs/milestones/CURRENT.md` — active milestone pointer;
- milestone ledgers M00–M17;
- `docs/requirements/TRACEABILITY.md`;
- `docs/product/CAPABILITY-MATRIX.md`;
- Superpowers specs/plans/evidence.

## 10. Superpowers policy

Every fresh autonomous run starts by invoking `using-superpowers` and then uses other applicable skills, including:

- brainstorming;
- writing-plans;
- using-git-worktrees where appropriate;
- strict test-driven-development;
- systematic-debugging;
- executing-plans/subagent or parallel workflows where supported;
- requesting/receiving-code-review;
- verification-before-completion;
- finishing-a-development-branch.

For routine autonomous milestone execution, the repository may explicitly pre-authorize normal design/spec/plan decisions so scheduled workers do not stall waiting for chat approval. Pre-authorization removes waiting, never rigor or review.

Before that autonomous policy exists in Git, normal Superpowers human review gates apply.

## 11. Merge policy

Unlike the older mixed policy observed in `hire-evidence`, LinkedIn MCP must have one durable policy only.

Default after M00 policy is established:

```text
AUTO_CREATE_PR = true
AUTO_UPDATE_PR = true
AUTO_MERGE = true
```

Automatic milestone merge is allowed only when **all** gates pass:

1. milestone-required implementation is complete;
2. acceptance criteria are satisfied;
3. required tests exist and pass;
4. zero unresolved Critical findings;
5. zero unresolved Important findings;
6. zero unresolved blocking review threads;
7. durable status/traceability/capability state is current;
8. remote PR head is unchanged/unexpected concurrency is absent;
9. required CI is green on the exact final head SHA;
10. PR is mergeable and repository protection permits it;
11. no newer conflicting work exists;
12. merge does not weaken security, consent, auditability or LinkedIn capability boundaries.

Preferred merge strategy: squash merge unless repository history later establishes a stronger convention.

After merge, post-merge `main` CI must be verified before activating the next milestone.

## 12. Continuous work-selection priority

Every scheduled/fresh run selects the highest-priority legitimate work:

1. broken `main` / failed required default-branch CI;
2. failed required CI on active work;
3. unresolved Critical review findings;
4. unresolved Important review findings;
5. unresolved blocking review threads;
6. unfinished active branch/PR;
7. unfinished task in current milestone;
8. milestone closeout/integration;
9. post-merge verification;
10. next milestone after current completion is proven.

Finishing a task, RED→GREEN cycle, PR or milestone is a continuation checkpoint, not automatically a stop condition.

## 13. Concurrency safety

Before each write/push/merge, autonomous workers must re-check:

- active remote branch head;
- active/draft PRs;
- recent commits;
- CI on the relevant head;
- durable ownership/current task state.

Do not duplicate another worker's active unit. Add lease/claim machinery only if real overlapping scheduled workers make it necessary.

## 14. Requirements and milestone model

Canonical product requirements are persisted in Git and cannot silently disappear because a capability is difficult or provider-restricted.

Each requirement must remain one of:

- PLANNED
- ACTIVE
- BLOCKED
- VERIFIED
- DEFERRED
- REJECTED (with reason)

Traceability maps requirement -> milestone -> spec -> plan -> implementation -> tests -> verification -> status.

Milestone program:

- M00 Foundation + autonomous control plane
- M01 Authentication & identity
- M02 Text publishing
- M03 Media publishing
- M04 Comments & engagement
- M05 Post search
- M06 Job search
- M07 Job intelligence
- M08 Article authoring engine
- M09 Native article publishing
- M10 Research & content intelligence
- M11 Scheduling & automation
- M12 Analytics
- M13 Company pages
- M14 Networking
- M15 Messaging
- M16 Hosted multi-account
- M17 Production hardening

Future scope may be added through PRD/roadmap changes with explicit traceability rather than ad-hoc code.

## 15. Capability matrix contract

`docs/product/CAPABILITY-MATRIX.md` must track, at minimum:

- capability identifier;
- desired product behavior;
- current provider classification;
- LinkedIn permission/partner dependency if known;
- implementation milestone;
- implementation state;
- verification evidence;
- safety/approval requirement.

Example capability identifiers:

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

The matrix must not claim availability without evidence.

## 16. M00 runtime behavior

M00 implements only foundation MCP behavior.

Required tools:

### `linkedin.health`

Returns deterministic server/runtime health information without contacting LinkedIn.

### `linkedin.version`

Returns package/server/protocol version metadata.

### `linkedin.capabilities`

Returns the current capability registry. During M00 most LinkedIn-specific entries are `PLANNED`/`UNAVAILABLE`; this is intentional and demonstrates transparent capability discovery.

M00 may expose corresponding read-only resources if doing so is useful and supported cleanly by the selected SDK, but resources are not required merely for symmetry.

## 17. Standard tool-result boundary

Define an initial provider-aware result envelope reusable by later milestones:

```ts
interface ToolResult<T> {
  status:
    | "succeeded"
    | "requires_approval"
    | "human_action_required"
    | "unsupported"
    | "permission_required"
    | "partner_access_required"
    | "restricted"
    | "rate_limited"
    | "duplicate"
    | "partial"
    | "failed";
  data?: T;
  provider: {
    type:
      | "OFFICIAL_API"
      | "PARTNER_API"
      | "EXTERNAL_DISCOVERY"
      | "BROWSER_INTERACTIVE"
      | "LOCAL_ONLY";
    name: string;
  };
  warnings?: string[];
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  metadata: {
    requestId: string;
    timestamp: string;
  };
}
```

Do not over-generalize this envelope before concrete tools exercise it; M00 should prove it through the three foundation tools only.

## 18. Configuration

M00 config should be minimal and validated.

Likely settings:

- server name/version;
- log level;
- transport mode;
- HTTP host/port when HTTP is enabled.

No LinkedIn client secret or user token is required in M00.

Unknown/invalid configuration must fail with actionable validation errors.

## 19. Security baseline

M00 security requirements:

- no credentials in repository;
- `.env` ignored;
- `.env.example` contains no real values;
- structured logging must redact secret-like fields;
- HTTP transport binds conservatively by default;
- validate incoming tool arguments;
- bounded payload sizes where transport/config allows it;
- no arbitrary filesystem, shell or browser execution from MCP tools;
- dependency versions locked;
- CI uses frozen lockfile semantics.

Browser automation is explicitly out of scope for M00.

## 20. TDD strategy

Meaningful M00 behavior uses genuine RED -> GREEN -> REFACTOR.

Suggested dependency order:

1. configuration validation;
2. health domain/result contract;
3. version tool contract;
4. capability registry/model;
5. MCP tool registration/call contracts;
6. stdio composition;
7. Streamable HTTP composition;
8. framework/recovery verifier scripts;
9. repository CI integration.

Do not fabricate failing-test history. Documentation-only files do not require artificial tests, but machine-checkable recovery invariants do.

## 21. CI quality gate

M00 CI should run, at minimum:

```text
pnpm install --frozen-lockfile
format/check if configured
lint
typecheck
unit/contract tests
build/package verification
MCP foundation smoke/contract check
autonomous framework verifier
requirements coverage verifier
milestone-state verifier
capability-matrix verifier
```

Every completion claim must use CI from the exact final relevant SHA.

No step may hide failure using `|| true`, `continue-on-error`, or equivalent masking.

## 22. M00 milestone branch and PR model

After this design and the subsequent implementation plan are approved:

- create/reuse branch `feat/m00-foundation`;
- use one draft M00 PR as the durable integration boundary;
- perform smaller dependency-ordered RED/GREEN units inside that PR;
- keep it draft until all M00 acceptance/review/verification gates pass;
- squash merge only through the repository merge gates;
- verify post-merge `main` before activating M01.

## 23. M00 acceptance criteria

M00 is complete only when all of the following are true:

### Runtime

- TypeScript/pnpm workspace installs reproducibly;
- server starts through stdio;
- server starts through Streamable HTTP;
- MCP client/Inspector can discover and call `linkedin.health`;
- `linkedin.version` works;
- `linkedin.capabilities` returns truthful foundation capability state;
- invalid inputs/config produce structured actionable errors;
- package/build output is usable by a consumer smoke test.

### Engineering quality

- strict typecheck passes;
- lint/format checks pass;
- unit/contract tests pass;
- build passes;
- no hidden credentials;
- dependency lockfile is committed;
- exact-head CI is green.

### Durable autonomous control plane

- canonical PRD is persisted;
- M00–M17 ledgers exist;
- `AGENTS.md`, `CODEX-START-HERE.md`, `AUTONOMOUS-DEVELOPMENT.md` exist;
- `project-state.json`, `STATUS.md`, `KNOWN-ISSUES.md`, `CURRENT.md` exist and agree on active state;
- requirements traceability exists;
- capability matrix exists;
- M00 design and implementation plan are committed;
- autonomous-framework verifier passes;
- requirements-coverage verifier passes;
- milestone-state verifier passes;
- capability-matrix verifier passes;
- exactly one legitimate next work item is recorded at handoff.

### Review

- 0 unresolved Critical findings;
- 0 unresolved Important findings;
- no unresolved blocking PR review threads;
- final exact-head CI green;
- PR mergeable with no conflicting newer work.

## 24. Explicitly out of scope for M00

Do not implement in M00:

- LinkedIn OAuth or token persistence;
- LinkedIn API calls;
- post creation;
- media upload;
- comment/reaction APIs;
- job/post discovery providers;
- browser automation;
- article publishing;
- scheduler/queues;
- analytics;
- multi-account hosting;
- PostgreSQL/Redis unless a concrete foundation requirement proves necessary;
- speculative microservices/event buses/agent frameworks.

These belong to later milestones.

## 25. Main risks and mitigations

### LinkedIn API access changes
Mitigation: capability router + provider provenance + capability matrix.

### Browser flows become brittle
Mitigation: browser adapter isolated and optional; never part of core official provider.

### Autonomous workers trust stale docs
Mitigation: Git/CI precedence plus machine-readable project state and consistency verifiers.

### Scheduler prompt becomes a second policy source
Mitigation: keep scheduler short; repository policy is authoritative.

### Accidental write/destructive behavior
Mitigation: later write tools use preview/approval/idempotency/verification. M00 has no LinkedIn writes.

### Architecture bloat
Mitigation: create only concrete M00 packages; provider interfaces grow with real capabilities.

## 26. Design decision summary

M00 deliberately treats the autonomous-development system as product infrastructure rather than incidental documentation. The project is expected to span many sessions and milestones, so recoverability, traceability and exact-SHA evidence are acceptance criteria from the first milestone.

At the same time, the runtime architecture stays minimal: a small typed MCP core with three truthful foundation tools and no LinkedIn credentials. This prevents the control plane from becoming an excuse for speculative product implementation.

## 27. Next gate

The repository owner must review/approve this written design before an implementation plan is created. After written-spec approval, invoke Superpowers `writing-plans`, create `docs/superpowers/plans/2026-10-05-m00-foundation.md`, self-review it, and present it for execution-method selection before product code/scaffolding begins.

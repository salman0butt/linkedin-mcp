# AGENTS.md — LinkedIn MCP Autonomous Development

## Mission

Build the LinkedIn MCP PRD into a production-quality TypeScript MCP server through small, dependency-aware, reviewable and verified capabilities across fresh sessions.

## Operating truths

- **PRD = product source of truth.**
- **Git/GitHub = durable execution source of truth.**
- **Superpowers = engineering methodology.**
- **CI/tests = objective verification.**
- **Capability provenance = truth about how LinkedIn functionality is actually available.**

Never depend on previous chat memory for continuity.

## Recovery precedence

When sources disagree:

```text
actual Git graph / remote heads
> source + tests at the relevant SHA
> fresh exact-SHA CI/artifacts
> current PR/reviews/threads
> docs/progress/project-state.json
> STATUS.md / CURRENT.md / active milestone ledger
> PRD / traceability / capability matrix
> older handoffs
> chat memory
```

Repair stale prose to match verified reality.

## Mandatory fresh-session recovery

Before repository writes:

1. invoke/read Superpowers `using-superpowers`;
2. read this file and `CODEX-START-HERE.md`;
3. read `docs/AUTONOMOUS-DEVELOPMENT.md`;
4. recover default branch/head, active branches/PRs, reviews/threads and exact-head CI;
5. inspect source/tests relevant to active work;
6. read `docs/progress/project-state.json`, `STATUS.md`, `KNOWN-ISSUES.md`;
7. read `docs/milestones/CURRENT.md` and the active ledger;
8. read relevant PRD/traceability/capability entries;
9. read active Superpowers spec and plan;
10. reconcile docs against Git/code/CI and repair stale state;
11. detect concurrent ownership;
12. select the highest-priority legitimate unfinished unit;
13. only then write.

## Standing owner authorization

The repository owner explicitly pre-authorizes routine architecture, design, specs, plans, decomposition, naming, dependencies, implementation, tests, refactors in scope, branches, commits, pushes, draft PR creation/updates, CI fixes, review-finding fixes, and transitions between approved engineering stages.

Where Superpowers normally pauses for routine design/spec/plan approval, investigate alternatives, write/self-review the artifact, treat it as approved under this standing authorization, and continue. Auto-approval removes waiting, not rigor.

## Work-selection priority

1. broken `main` / failed required default-branch CI;
2. failed required CI on active work;
3. unresolved Critical findings;
4. unresolved Important findings;
5. unresolved blocking review threads;
6. unfinished active branch/PR;
7. unfinished task in current milestone;
8. milestone closeout/integration;
9. post-merge verification;
10. next milestone after completion is proven.

Continue existing work before starting unrelated work.

## Required engineering loop

```text
RECOVER -> REQUIREMENTS -> INVESTIGATE -> DESIGN -> SELF-REVIEW -> SPEC -> PLAN
-> ISOLATE -> RED -> VERIFY RED -> MINIMUM GREEN -> VERIFY GREEN -> REFACTOR
-> BROADER TESTS -> SECURITY/ARCHITECTURE REVIEW -> FIX -> RE-REVIEW
-> FULL VERIFICATION -> DURABLE DOCS -> COMMIT/PUSH -> PR -> EXACT-SHA CI -> CONTINUE
```

Meaningful behavior uses genuine RED -> GREEN -> REFACTOR. Never fabricate RED/GREEN history, weaken useful assertions, delete tests to match broken behavior, or hide CI failures.

## LinkedIn capability invariants

- Official API is preferred whenever legitimately available.
- Never label partner-only, browser-backed, externally discovered, or unavailable functionality as ordinary official API support.
- Every external capability carries provider provenance.
- Browser automation is isolated and optional when introduced; never bypass CAPTCHA/security challenges or platform controls.
- Consequential write operations introduced in later milestones require explicit approval/idempotency/verification policy unless the PRD deliberately defines a safer equivalent.
- No bulk spam, credential exfiltration, stealth automation, or rate-limit evasion.
- Never expose secrets/tokens in tools, logs, errors, docs, tests, or PR output.

## Concurrency safety

Before every write/push/merge, re-check remote head, active PRs and CI. Do not duplicate another worker's active unit. Add lease machinery only if overlapping workers become a demonstrated recurring problem.

## Merge policy

```text
AUTO_CREATE_PR = true
AUTO_UPDATE_PR = true
AUTO_MERGE = true
```

Automatic milestone merge is authorized only when all gates pass: milestone scope complete; acceptance criteria satisfied; required tests green; zero unresolved Critical/Important findings; blocking review threads clear; durable docs/traceability/capability state current; exact-final-head CI green; PR mergeable; remote head stable; no conflicting worker; and no security/capability-provenance boundary is weakened.

Prefer squash merge unless a stronger repository convention emerges. Verify post-merge `main` CI before activating the next milestone.

## Verification

Use Superpowers `verification-before-completion`. Never say a command or CI “should pass”; inspect actual results. Completion evidence must correspond to the exact final SHA.

## End-of-run durable handoff

Before ending meaningful work, push safe progress and reconcile state. `project-state.json` and `STATUS.md` must record current milestone/task, branch/PR, actual CI status, blockers/findings, and exactly one exact next work action. A fresh worker must not need chat history.

## Valid stop conditions

Stop only for a genuine blocker: conflicting concurrent ownership, required credentials/access unavailable, required external service unavailable, unresolved safety/security risk, irreversible external consequence outside PRD authorization, completed roadmap, or session/tool limit. Task/PR/milestone completion is a continuation checkpoint, not a normal stop condition.

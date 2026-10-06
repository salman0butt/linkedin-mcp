# Autonomous Development

## Operating model

PRD defines product requirements. Git/GitHub records actual execution. Superpowers defines engineering method. Tests/CI prove behavior. Capability provenance prevents false LinkedIn support claims.

## Fresh-session recovery

Before modifying repository state, invoke Superpowers, read the repository policy, recover Git/PR/review/CI state, inspect relevant code/tests, read machine/human project state, active milestone, PRD/traceability/capability matrix and active spec/plan, then reconcile stale docs against verified evidence.

## Continuous autonomous loop

```text
RECOVER
-> SELECT HIGHEST-PRIORITY UNFINISHED UNIT
-> DESIGN/PLAN WHEN REQUIRED
-> TDD RED
-> VERIFY REAL RED
-> IMPLEMENT MINIMUM CORRECT CHANGE
-> VERIFY GREEN
-> REFACTOR
-> FOCUSED + BROADER TESTS
-> SKEPTICAL REVIEW
-> FIX CRITICAL/IMPORTANT FINDINGS
-> VERIFY AGAIN
-> UPDATE DURABLE STATE
-> COMMIT/PUSH
-> CREATE/UPDATE ONE MILESTONE PR
-> VERIFY EXACT REMOTE HEAD + CI
-> MERGE ONLY THROUGH GATES
-> VERIFY POST-MERGE MAIN
-> ACTIVATE NEXT MILESTONE
-> CONTINUE
```

## Pre-authorized autonomy

The owner grants standing approval for routine internal architecture/design/spec/plan and normal repository-local implementation decisions. This eliminates waiting only; it does not permit skipping investigation, self-review, TDD, review or verification.

## TDD

Behavioral work uses genuine RED -> GREEN -> REFACTOR. Confirm RED fails for the intended missing behavior, not style/type/infrastructure noise. Bug fixes get regression coverage where practical.

## Review

Substantial work receives PRD, correctness/edge-case, architecture/YAGNI, test-quality, security/privacy, MCP-protocol, capability-provenance and performance review as applicable. Critical and Important findings block milestone completion until fixed or explicitly resolved by durable policy.

## Exact-SHA verification

Final PR readiness requires CI green on the exact final head SHA and confirmation that no newer unverified commit exists. Post-merge `main` must also pass required CI before next-milestone activation.

## Capability provenance

Use provider classifications `OFFICIAL_API`, `PARTNER_API`, `EXTERNAL_DISCOVERY`, `BROWSER_INTERACTIVE`, `LOCAL_ONLY`; represent unavailable separately. Never silently fall back from official API to browser/discovery while presenting the result as official.

## Concurrency

Re-check remote head/PR/CI before writes. Resume existing active work. If another worker clearly owns the same unit and conflict cannot be avoided, do read-only recovery and stop rather than overwrite.

## Durable handoff

At the end of meaningful work, reconcile `project-state.json`, `STATUS.md`, known issues, current/active ledger, traceability and capability matrix when their state changed. Record only observed SHAs/CI. Keep exactly one next work action.
